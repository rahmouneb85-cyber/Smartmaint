"""Audit de la qualité du code SmartMaint, exécuté sur l'ordinateur du projet (le code ne quitte pas le poste).

Analyses réalisées :
  1. Python (backend/app) : erreurs probables, sécurité, code mort, style, complexité   → ruff
  2. Complexité et maintenabilité des fonctions Python                                → radon
  3. Bibliothèques Python ayant des failles de sécurité connues                       → pip-audit
  4. React (frontend/src) : erreurs et mauvaises pratiques                            → ESLint (déjà installé avec React)
  5. Bibliothèques JavaScript ayant des failles connues                               → npm audit
  6. Secrets écrits en clair dans le code (clés, jetons, mots de passe)               → recherche intégrée
  7. Taille du code et fichiers les plus longs
  8. Tests automatisés et couverture du code                                         → pytest

Les résultats sont enregistrés dans backend/evaluations/audit_qualite_AAAAMMJJ_HHMM.html (et .json).
Aucune valeur secrète n'est jamais affichée : seuls le fichier, la ligne et le type de secret sont indiqués.

Installation des outils (une seule fois) :  python -m pip install -r requirements-dev.txt
Utilisation (depuis le dossier backend)  :  python audit_qualite.py
Option : python audit_qualite.py --rapide   (sans les vérifications en ligne pip-audit et npm audit)
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
RACINE = BACKEND.parent
FRONTEND = RACINE / "frontend"
APP = BACKEND / "app"
SORTIE = BACKEND / "evaluations"
RAPIDE = "--rapide" in sys.argv

DOSSIERS_IGNORES = {"node_modules", "__pycache__", ".git", "sauvegardes", "livraison", "build", ".venv", "venv",
                    "evaluations", "documents_idp", "captures_support", "fichiers_rooms", ".idea", ".vscode"}
DOSSIERS_IGNORES |= {d.name for d in BACKEND.glob("app_avant*")}

# Règles ruff retenues, regroupées en familles lisibles
REGLES = "F,E,W,B,S,ERA,C901,PLE"
IGNOREES = ",".join([
    "E501",          # longueur des lignes : choix de présentation
    "E711", "E712",  # « == None » / « == True » : obligatoire dans les filtres SQLAlchemy
    "B008",          # Depends(...) dans les paramètres : c'est le fonctionnement normal de FastAPI
    "S101",          # assert
])
FAMILLES = [
    ("Code mort ou inutile", lambda c: c in ("F401", "F811", "F841", "F541", "B007") or c.startswith("ERA")),
    ("Erreurs probables", lambda c: c.startswith(("F8", "F6", "F7", "E9", "PLE", "B0"))),
    ("Gestion des erreurs", lambda c: c in ("B904", "E722", "B905")),
    ("Sécurité", lambda c: c.startswith("S")),
    ("Complexité excessive", lambda c: c.startswith("C9")),
    ("Style et lisibilité", lambda c: True),
]
EXPLICATIONS = {
    "F401": "Import inutilisé", "F811": "Nom redéfini sans avoir été utilisé", "F841": "Variable affectée mais jamais utilisée",
    "F541": "f-string sans variable", "F821": "Nom non défini (plantage à l'exécution)", "F632": "Comparaison avec « is » sur une valeur",
    "E402": "Import placé après du code", "E701": "Plusieurs instructions sur une ligne (:)", "E702": "Plusieurs instructions sur une ligne (;)",
    "E722": "« except: » sans type d'erreur", "E731": "Fonction lambda affectée à une variable", "E741": "Nom de variable ambigu (l, O, I)",
    "W291": "Espaces en fin de ligne", "W293": "Ligne vide contenant des espaces", "W292": "Pas de retour à la ligne final",
    "B006": "Valeur par défaut modifiable (liste ou dict)", "B007": "Variable de boucle inutilisée", "B904": "Exception relancée sans « from »",
    "B023": "Fonction qui capture une variable de boucle", "B905": "zip() sans strict=",
    "S105": "Mot de passe écrit en dur (variable)", "S106": "Mot de passe écrit en dur (paramètre)", "S107": "Mot de passe par défaut en dur",
    "S314": "Lecture XML non protégée", "S108": "Fichier temporaire à un emplacement fixe", "S110": "Erreur ignorée (try/except/pass)", "S112": "Erreur ignorée (try/except/continue)",
    "S113": "Requête HTTP sans délai maximal (timeout)", "S311": "Hasard non cryptographique (random)", "S324": "Hachage faible (md5/sha1)",
    "S603": "Commande système lancée depuis le code", "S607": "Commande lancée sans chemin complet", "S608": "Requête SQL construite avec du texte",
    "S104": "Écoute sur toutes les interfaces réseau", "S307": "Utilisation de eval()", "S301": "Désérialisation pickle",
    "S506": "yaml.load non sécurisé", "S501": "Vérification HTTPS désactivée", "ERA001": "Code commenté laissé dans le fichier",
    "C901": "Fonction trop complexe (plus de 10 chemins)", "PLE": "Erreur détectée par pylint",
}

SECRETS = [
    ("Clé API Google / Gemini", re.compile(r"AIza[0-9A-Za-z_\-]{35}")),
    ("Jeton de bot Telegram", re.compile(r"\b\d{8,10}:[A-Za-z0-9_\-]{35}\b")),
    ("Clé privée", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("Clé OpenAI / Anthropic", re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_\-]{20,}")),
    ("Adresse de base de données avec mot de passe", re.compile(r"(?:mysql|postgresql)(?:\+\w+)?://[^:\s\"']+:[^@\s\"']{3,}@")),
    ("Secret affecté en dur", re.compile(r"(?i)\b(?:secret_key|api_key|password|mot_de_passe|token|cle_chiffrement)\s*[:=]\s*[\"'][^\"'\s{}]{12,}[\"']")),
]
EXTENSIONS_TEXTE = {".py", ".js", ".jsx", ".ts", ".json", ".html", ".css", ".md", ".txt", ".yml", ".yaml", ".ini", ".cfg", ".ps1", ".bat"}


def lancer(cmd, cwd=None, delai=600):
    """Lance une commande et renvoie (code, sortie, erreurs). Ne plante jamais."""
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=delai)
        return r.returncode, r.stdout, r.stderr
    except FileNotFoundError:
        return -1, "", "programme introuvable"
    except subprocess.TimeoutExpired:
        return -2, "", f"délai dépassé ({delai} s)"


def rel(chemin):
    try:
        return str(Path(chemin).resolve().relative_to(RACINE)).replace("\\", "/")
    except ValueError:
        return str(chemin)


def fichiers(dossier, extensions):
    for d, sous, noms in os.walk(dossier):
        sous[:] = [s for s in sous if s not in DOSSIERS_IGNORES and not s.startswith("app_avant")]
        for n in noms:
            p = Path(d) / n
            if p.suffix in extensions:
                yield p


# ─────────────────────────────────────────────────────────────
def audit_ruff():
    code, out, err = lancer([sys.executable, "-m", "ruff", "check", str(APP), "--select", REGLES, "--ignore", IGNOREES,
                             "--output-format", "json", "--no-cache", "--exit-zero"])
    if code != 0 or not out.strip().startswith("["):
        return {"disponible": False, "erreur": (err or out)[:300] or "ruff non installé : python -m pip install ruff"}
    problemes = json.loads(out)
    par_famille, par_regle, par_fichier = defaultdict(list), Counter(), Counter()
    for p in problemes:
        c = p.get("code") or "?"
        famille = next(nom for nom, test in FAMILLES if test(c))
        par_famille[famille].append(p)
        par_regle[c] += 1
        par_fichier[rel(p["filename"])] += 1
    corrigeables = sum(1 for p in problemes if p.get("fix"))
    details = [{"famille": next(nom for nom, test in FAMILLES if test(p.get("code") or "?")), "regle": p.get("code"),
                "explication": EXPLICATIONS.get(p.get("code"), p.get("message", "")), "message": p.get("message", ""),
                "fichier": rel(p["filename"]), "ligne": p["location"]["row"]} for p in problemes]
    return {"disponible": True, "total": len(problemes), "corrigeables_auto": corrigeables,
            "par_famille": {nom: len(par_famille.get(nom, [])) for nom, _ in FAMILLES},
            "par_regle": [{"regle": r, "nb": n, "explication": EXPLICATIONS.get(r, "")} for r, n in par_regle.most_common()],
            "fichiers": par_fichier.most_common(10), "details": details}


def audit_radon():
    code, out, err = lancer([sys.executable, "-m", "radon", "cc", str(APP), "-j"])
    if code != 0 or not out.strip().startswith("{"):
        return {"disponible": False, "erreur": (err or out)[:300] or "radon non installé : python -m pip install radon"}
    blocs = []
    for f, elements in json.loads(out).items():
        if isinstance(elements, dict):          # fichier illisible
            continue
        for e in elements:
            blocs.append({"fichier": rel(f), "nom": (e.get("classname") + "." if e.get("classname") else "") + e["name"],
                          "ligne": e["lineno"], "complexite": e["complexity"], "rang": e["rank"]})
    rangs = Counter(b["rang"] for b in blocs)
    moyenne = round(sum(b["complexite"] for b in blocs) / len(blocs), 1) if blocs else 0
    _, out_mi, _ = lancer([sys.executable, "-m", "radon", "mi", str(APP), "-j"])
    mi = {}
    try:
        mi = {rel(f): round(v["mi"], 1) for f, v in json.loads(out_mi).items() if isinstance(v, dict) and "mi" in v}
    except (ValueError, KeyError):
        pass
    return {"disponible": True, "fonctions": len(blocs), "complexite_moyenne": moyenne,
            "rangs": {r: rangs.get(r, 0) for r in "ABCDEF"},
            "plus_complexes": sorted(blocs, key=lambda b: -b["complexite"])[:12],
            "maintenabilite_faible": sorted([{"fichier": f, "indice": v} for f, v in mi.items() if v < 20], key=lambda x: x["indice"])}


def audit_pip():
    if RAPIDE:
        return {"disponible": False, "erreur": "ignoré (--rapide)"}
    req = BACKEND / "requirements.txt"
    cmd = [sys.executable, "-m", "pip_audit", "-f", "json", "--progress-spinner", "off"]
    if req.exists():
        cmd += ["-r", str(req)]
    code, out, err = lancer(cmd, delai=900)
    debut = out.find("{")
    if debut < 0:
        return {"disponible": False, "erreur": (err or out)[-300:] or "pip-audit non installé : python -m pip install pip-audit"}
    data = json.loads(out[debut:])
    deps = data.get("dependencies", data if isinstance(data, list) else [])
    failles = [{"paquet": d["name"], "version": d.get("version"), "faille": v["id"],
                "corrigee_en": ", ".join(v.get("fix_versions") or []) or "pas encore de correctif"}
               for d in deps for v in d.get("vulns", [])]
    vues = set()                                   # une même faille peut être listée deux fois (alias)
    failles = [f for f in failles if (f["paquet"], f["faille"]) not in vues and not vues.add((f["paquet"], f["faille"]))]
    return {"disponible": True, "paquets": len(deps), "failles": failles, "source": "requirements.txt" if req.exists() else "environnement Python"}


def audit_eslint():
    if not (FRONTEND / "node_modules").exists():
        return {"disponible": False, "erreur": "frontend/node_modules absent"}
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        return {"disponible": False, "erreur": "npx introuvable (Node.js)"}
    code, out, err = lancer([npx, "--no-install", "eslint", "src", "--ext", ".js,.jsx", "-f", "json"], cwd=FRONTEND)
    debut = out.find("[")
    if debut < 0:
        return {"disponible": False, "erreur": (err or out)[:300]}
    resultats = json.loads(out[debut:])
    regles, details, par_fichier = Counter(), [], Counter()
    erreurs = avertissements = 0
    for f in resultats:
        for m in f.get("messages", []):
            if m.get("severity") == 2:
                erreurs += 1
            else:
                avertissements += 1
            regles[m.get("ruleId") or "analyse"] += 1
            par_fichier[rel(f["filePath"])] += 1
            details.append({"fichier": rel(f["filePath"]), "ligne": m.get("line"), "regle": m.get("ruleId"), "message": m.get("message", "")[:160],
                            "gravite": "erreur" if m.get("severity") == 2 else "avertissement"})
    return {"disponible": True, "fichiers_analyses": len(resultats), "erreurs": erreurs, "avertissements": avertissements,
            "par_regle": regles.most_common(), "fichiers": par_fichier.most_common(10), "details": details}


def audit_npm():
    if RAPIDE:
        return {"disponible": False, "erreur": "ignoré (--rapide)"}
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm or not (FRONTEND / "package.json").exists():
        return {"disponible": False, "erreur": "npm ou package.json introuvable"}
    resultat = {"disponible": True}
    for nom, options in (("toutes", []), ("production", ["--omit=dev"])):
        _, out, err = lancer([npm, "audit", "--json", *options], cwd=FRONTEND, delai=300)
        debut = out.find("{")
        if debut < 0:
            return {"disponible": False, "erreur": (err or out)[:300]}
        meta = json.loads(out[debut:]).get("metadata", {}).get("vulnerabilities", {})
        resultat[nom] = {k: meta.get(k, 0) for k in ("critical", "high", "moderate", "low", "total")}
    return resultat


def audit_secrets():
    trouves = []
    for dossier in (BACKEND, FRONTEND / "src", FRONTEND / "public"):
        if not dossier.exists():
            continue
        for p in fichiers(dossier, EXTENSIONS_TEXTE):
            if p.name.startswith(".env") or p.name == Path(__file__).name or "tests" in p.relative_to(RACINE).parts:
                continue                      # .env : secrets attendus ; tests : comptes fictifs de la base de test
            try:
                lignes = p.read_text(encoding="utf-8", errors="ignore").splitlines()
            except OSError:
                continue
            for i, ligne in enumerate(lignes, 1):
                for nom, motif in SECRETS:
                    if motif.search(ligne) and "settings." not in ligne and "os.getenv" not in ligne and "exemple" not in ligne.lower():
                        trouves.append({"fichier": rel(p), "ligne": i, "type": nom})
    env_ignore = False
    gitignore = RACINE / ".gitignore"
    for g in (gitignore, BACKEND / ".gitignore"):
        if g.exists() and re.search(r"(?m)^\s*\.env\s*$", g.read_text(encoding="utf-8", errors="ignore")):
            env_ignore = True
    return {"trouves": trouves, "env_dans_gitignore": env_ignore, "env_exemple": (BACKEND / ".env.example").exists()}


def audit_taille():
    def compter(dossier, ext):
        res = []
        for p in fichiers(dossier, ext):
            try:
                n = sum(1 for ligne in p.read_text(encoding="utf-8", errors="ignore").splitlines() if ligne.strip())
            except OSError:
                continue
            res.append((rel(p), n))
        return res
    py = compter(APP, {".py"})
    js = compter(FRONTEND / "src", {".js", ".jsx"}) if (FRONTEND / "src").exists() else []
    tests = list(BACKEND.glob("tests/test_*.py"))
    return {"python_fichiers": len(py), "python_lignes": sum(n for _, n in py),
            "js_fichiers": len(js), "js_lignes": sum(n for _, n in js),
            "plus_longs": sorted(py + js, key=lambda x: -x[1])[:10], "fichiers_de_tests": len(tests)}


def audit_tests():
    if not (BACKEND / "tests").exists():
        return {"disponible": False, "erreur": "aucun dossier tests"}
    code, out, err = lancer([sys.executable, "-m", "pytest", "-p", "no:warnings", "--cov=app", "--cov-report=term"], cwd=BACKEND, delai=900)
    texte = out + err
    resume = re.search(r"(\d+) passed", texte)
    echecs = re.search(r"(\d+) failed", texte)
    couverture = re.search(r"^TOTAL\s+\d+\s+\d+\s+(\d+)%", texte, re.M)
    if not resume and not echecs:
        return {"disponible": False, "erreur": (texte.strip().splitlines() or ["pytest non installé"])[-1][:300]}
    return {"disponible": True, "reussis": int(resume.group(1)) if resume else 0, "echoues": int(echecs.group(1)) if echecs else 0,
            "couverture": int(couverture.group(1)) if couverture else None}


# ─────────────────────────────────────────────────────────────
def page_html(r):
    e = html.escape

    def tableau(entetes, lignes):
        t = "<table><tr>" + "".join(f"<th>{e(str(h))}</th>" for h in entetes) + "</tr>"
        for ligne in lignes:
            t += "<tr>" + "".join(f"<td>{e(str(c))}</td>" for c in ligne) + "</tr>"
        return t + "</table>"

    def carte(titre, valeur, note, classe=""):
        return f"<div class='carte {classe}'><div class='v'>{e(str(valeur))}</div><div class='t'>{e(titre)}</div><div class='n'>{e(note)}</div></div>"

    ru, ra, pi, es, np_, se, ta = (r[k] for k in ("ruff", "radon", "pip_audit", "eslint", "npm_audit", "secrets", "taille"))
    te = r.get("tests", {})
    cartes = ""
    if te.get("disponible"):
        cartes += carte("Tests automatisés", f"{te['reussis']}/{te['reussis'] + te['echoues']}",
                        f"couverture du code : {te['couverture']} %" if te.get("couverture") is not None else "", "rouge" if te["echoues"] else "vert")
    if ru.get("disponible"):
        cartes += carte("Problèmes Python", ru["total"], f"dont {ru['par_famille']['Erreurs probables']} erreurs probables", "rouge" if ru["par_famille"]["Erreurs probables"] else "")
    if es.get("disponible"):
        cartes += carte("Problèmes React", es["erreurs"] + es["avertissements"], f"{es['erreurs']} erreur(s), {es['avertissements']} avertissement(s)", "rouge" if es["erreurs"] else "")
    if ra.get("disponible"):
        cartes += carte("Fonctions trop complexes", sum(ra["rangs"][x] for x in "CDEF"), f"sur {ra['fonctions']} (moyenne {ra['complexite_moyenne']})")
    cartes += carte("Secrets en clair", len(se["trouves"]), "dans le code (hors .env)", "rouge" if se["trouves"] else "vert")
    if pi.get("disponible"):
        cartes += carte("Failles Python connues", len(pi["failles"]), f"sur {pi['paquets']} bibliothèques", "rouge" if pi["failles"] else "vert")
    if np_.get("disponible"):
        p = np_["production"]
        cartes += carte("Failles JS (production)", p["total"], f"{p['critical']} critique(s), {p['high']} haute(s)", "rouge" if p["critical"] or p["high"] else "")

    s = [f"<h1>Audit de la qualité du code SmartMaint</h1><p class='date'>{e(r['date'])} · {ta['python_lignes']} lignes Python ({ta['python_fichiers']} fichiers) · {ta['js_lignes']} lignes React ({ta['js_fichiers']} fichiers)</p>",
         f"<div class='cartes'>{cartes}</div>"]
    if ru.get("disponible"):
        s.append("<h2>1. Backend Python (ruff)</h2>")
        s.append(tableau(["Famille", "Nombre"], list(ru["par_famille"].items())))
        s.append(f"<p>{ru['corrigeables_auto']} problème(s) corrigeable(s) automatiquement.</p>")
        s.append(tableau(["Règle", "Nombre", "Signification"], [(x["regle"], x["nb"], x["explication"]) for x in ru["par_regle"]]))
        s.append("<h3>Fichiers les plus concernés</h3>" + tableau(["Fichier", "Problèmes"], ru["fichiers"]))
        s.append("<h3>Détail</h3>" + tableau(["Famille", "Fichier", "Ligne", "Règle", "Message"],
                                             [(d["famille"], d["fichier"], d["ligne"], d["regle"], d["message"]) for d in ru["details"]]))
    else:
        s.append(f"<h2>1. Backend Python</h2><p class='ko'>Non réalisé : {e(ru['erreur'])}</p>")
    if ra.get("disponible"):
        s.append("<h2>2. Complexité (radon)</h2><p>Rang A = simple (1 à 5 chemins), B = 6 à 10, C = 11 à 20, D = 21 à 30, E et F = plus de 30.</p>")
        s.append(tableau(["Rang", "A", "B", "C", "D", "E", "F"], [["Fonctions"] + [ra["rangs"][x] for x in "ABCDEF"]]))
        s.append("<h3>Fonctions les plus complexes</h3>" + tableau(["Fichier", "Fonction", "Ligne", "Complexité", "Rang"],
                                                                     [(b["fichier"], b["nom"], b["ligne"], b["complexite"], b["rang"]) for b in ra["plus_complexes"]]))
    if pi.get("disponible"):
        s.append(f"<h2>3. Bibliothèques Python (pip-audit, {e(pi['source'])})</h2>")
        s.append(tableau(["Bibliothèque", "Version", "Faille", "Corrigée en"], [(f["paquet"], f["version"], f["faille"], f["corrigee_en"]) for f in pi["failles"]])
                 if pi["failles"] else "<p class='ok'>Aucune faille connue.</p>")
    else:
        s.append(f"<h2>3. Bibliothèques Python</h2><p class='ko'>Non réalisé : {e(pi['erreur'])}</p>")
    if es.get("disponible"):
        s.append(f"<h2>4. Frontend React (ESLint, {es['fichiers_analyses']} fichiers)</h2>")
        s.append(tableau(["Règle", "Nombre"], es["par_regle"]) if es["par_regle"] else "<p class='ok'>Aucun problème.</p>")
        if es["details"]:
            s.append("<h3>Détail</h3>" + tableau(["Gravité", "Fichier", "Ligne", "Règle", "Message"],
                                                 [(d["gravite"], d["fichier"], d["ligne"], d["regle"], d["message"]) for d in es["details"]]))
    else:
        s.append(f"<h2>4. Frontend React</h2><p class='ko'>Non réalisé : {e(es['erreur'])}</p>")
    if np_.get("disponible"):
        s.append("<h2>5. Bibliothèques JavaScript (npm audit)</h2><p>« Production » : bibliothèques livrées dans l'application ; « toutes » inclut les outils de développement.</p>")
        s.append(tableau(["Périmètre", "Critiques", "Hautes", "Modérées", "Faibles", "Total"],
                         [(n, *(np_[n][k] for k in ("critical", "high", "moderate", "low", "total"))) for n in ("production", "toutes")]))
    else:
        s.append(f"<h2>5. Bibliothèques JavaScript</h2><p class='ko'>Non réalisé : {e(np_['erreur'])}</p>")
    s.append("<h2>6. Secrets dans le code</h2><p>Seuls le fichier, la ligne et le type sont indiqués : la valeur n'est jamais affichée.</p>")
    s.append(tableau(["Fichier", "Ligne", "Type"], [(t["fichier"], t["ligne"], t["type"]) for t in se["trouves"]]) if se["trouves"]
             else "<p class='ok'>Aucun secret trouvé en clair dans le code.</p>")
    s.append(f"<p>.env exclu de Git (.gitignore) : {'oui' if se['env_dans_gitignore'] else 'non'} · fichier .env.example : {'présent' if se['env_exemple'] else 'absent'}</p>")
    s.append("<h2>7. Taille du code</h2>" + tableau(["Fichier", "Lignes"], ta["plus_longs"]))
    s.append(f"<p>Fichiers de tests automatisés : {ta['fichiers_de_tests']}</p>")
    s.append("<h2>8. Tests automatisés (pytest)</h2>")
    if te.get("disponible"):
        s.append(tableau(["Réussis", "Échoués", "Couverture du code"], [(te["reussis"], te["echoues"], f"{te['couverture']} %" if te.get("couverture") is not None else "?")]))
    else:
        s.append(f"<p class='ko'>Non réalisé : {e(te.get('erreur', ''))}</p>")
    style = """body{font-family:Segoe UI,Arial,sans-serif;margin:30px;color:#1d2433;background:#f6f7fb}h1{color:#e8590c;margin-bottom:4px}
h2{color:#1f2a44;border-bottom:2px solid #e8590c;padding-bottom:4px;margin-top:34px}.date{color:#666}
table{border-collapse:collapse;margin:10px 0;background:#fff;font-size:13px}th{background:#1f2a44;color:#fff;padding:6px 10px;text-align:left}
td{border:1px solid #dde;padding:5px 10px}.cartes{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}
.carte{background:#fff;border-left:5px solid #e8590c;padding:12px 18px;min-width:170px;box-shadow:0 1px 3px #0002}
.carte.rouge{border-color:#d62828}.carte.vert{border-color:#2b9348}.v{font-size:28px;font-weight:700}.t{font-weight:600}.n{color:#666;font-size:12px}
.ok{color:#2b9348;font-weight:600}.ko{color:#999}"""
    return f"<!doctype html><html lang='fr'><head><meta charset='utf-8'><title>Audit qualité SmartMaint</title><style>{style}</style></head><body>{''.join(s)}</body></html>"


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    etapes = [("ruff", "Analyse du backend Python", audit_ruff), ("radon", "Complexité des fonctions", audit_radon),
              ("pip_audit", "Failles des bibliothèques Python", audit_pip), ("eslint", "Analyse du frontend React", audit_eslint),
              ("npm_audit", "Failles des bibliothèques JavaScript", audit_npm), ("secrets", "Recherche de secrets dans le code", audit_secrets),
              ("taille", "Taille du code", audit_taille), ("tests", "Tests automatisés", audit_tests)]
    r = {"date": datetime.now().strftime("%d/%m/%Y %H:%M")}
    for i, (cle, titre, fn) in enumerate(etapes, 1):
        print(f"[{i}/{len(etapes)}] {titre}…", flush=True)
        try:
            r[cle] = fn()
        except Exception as ex:                     # une analyse en échec n'empêche pas les autres
            r[cle] = {"disponible": False, "erreur": f"{ex.__class__.__name__} : {ex}"[:300], "trouves": []}
        if r[cle].get("disponible") is False:
            print(f"      ⚠️  non réalisé : {r[cle]['erreur']}")

    SORTIE.mkdir(exist_ok=True)
    nom = f"audit_qualite_{datetime.now():%Y%m%d_%H%M}"
    (SORTIE / f"{nom}.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
    (SORTIE / f"{nom}.html").write_text(page_html(r), encoding="utf-8")

    print("\n══════════ RÉSULTAT DE L'AUDIT ══════════")
    ru, es, ra = r["ruff"], r["eslint"], r["radon"]
    if ru.get("disponible"):
        print(f"Python : {ru['total']} problème(s) — " + ", ".join(f"{k.lower()} : {v}" for k, v in ru["par_famille"].items()))
    if es.get("disponible"):
        print(f"React  : {es['erreurs']} erreur(s), {es['avertissements']} avertissement(s)")
    if ra.get("disponible"):
        print(f"Complexité : {sum(ra['rangs'][x] for x in 'CDEF')} fonction(s) trop complexe(s) sur {ra['fonctions']}")
    print(f"Secrets en clair dans le code : {len(r['secrets'].get('trouves', []))}")
    if r["pip_audit"].get("disponible"):
        print(f"Failles Python connues : {len(r['pip_audit']['failles'])}")
    if r["npm_audit"].get("disponible"):
        p = r["npm_audit"]["production"]
        print(f"Failles JavaScript (production) : {p['total']} dont {p['critical']} critique(s) et {p['high']} haute(s)")
    if r["tests"].get("disponible"):
        t = r["tests"]
        print(f"Tests automatisés : {t['reussis']} réussi(s), {t['echoues']} échoué(s), couverture {t['couverture']} %")
    print(f"\n📄 Rapport : {SORTIE / (nom + '.html')}")


if __name__ == "__main__":
    main()
