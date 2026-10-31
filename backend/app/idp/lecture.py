"""Lecture des documents : extrait le texte (et, pour les scans et les photos, les images des pages)
de PDF, images, Word, Excel, CSV, PowerPoint, XML, JSON et texte brut.
Chaque format a son lecteur ; un fichier dont le contenu ne correspond pas à son extension est refusé."""
import csv
import io
import json
import xml.etree.ElementTree as ET
from pathlib import Path

FORMATS = {
    ".pdf": "pdf", ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".bmp": "image",
    ".tif": "image", ".tiff": "image", ".docx": "word", ".xlsx": "excel", ".xlsm": "excel", ".csv": "csv",
    ".pptx": "powerpoint", ".xml": "xml", ".json": "json", ".txt": "texte", ".md": "texte",
}
MAX_PAGES_IMAGES = 3            # pages envoyées au modèle de vision pour un scan
MAX_CARACTERES = 200_000        # au-delà, le texte est tronqué (gros manuels)
SIGNATURES = {"pdf": [b"%PDF"], "word": [b"PK"], "excel": [b"PK"], "powerpoint": [b"PK"]}


class ErreurLecture(Exception):
    pass


def format_du_fichier(nom: str) -> str:
    fmt = FORMATS.get(Path(nom).suffix.lower())
    if not fmt:
        raise ErreurLecture("Format non pris en charge. Formats acceptés : " + ", ".join(sorted(FORMATS)))
    return fmt


def _image_png(img, largeur_max=1600) -> bytes:
    """Redimensionne et convertit une image en PNG (taille raisonnable pour le modèle de vision)."""
    from PIL import ImageOps
    img = ImageOps.exif_transpose(img).convert("RGB")      # photos de téléphone : on respecte l'orientation
    if img.width > largeur_max:
        img = img.resize((largeur_max, int(img.height * largeur_max / img.width)))
    sortie = io.BytesIO()
    img.save(sortie, "PNG", optimize=True)
    return sortie.getvalue()


def _lire_pdf(contenu: bytes) -> dict:
    from pypdf import PdfReader
    lecteur = PdfReader(io.BytesIO(contenu))
    pages = [(p.extract_text() or "") for p in lecteur.pages]
    texte = "\n\n".join(f"[Page {i + 1}]\n{t.strip()}" for i, t in enumerate(pages) if t.strip())
    images = []
    scanne = len("".join(pages).strip()) < 40 * max(len(pages), 1)     # presque pas de texte : c'est un scan
    if scanne:
        import pypdfium2 as pdfium
        doc = pdfium.PdfDocument(contenu)
        for i in range(min(len(doc), MAX_PAGES_IMAGES)):
            images.append(_image_png(doc[i].render(scale=2).to_pil()))
    return {"texte": texte, "images": images, "pages": len(pages), "scanne": scanne}


def _lire_image(contenu: bytes) -> dict:
    from PIL import Image, UnidentifiedImageError
    try:
        img = Image.open(io.BytesIO(contenu))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise ErreurLecture("Le fichier n'est pas une image valide") from None
    return {"texte": "", "images": [_image_png(img)], "pages": 1, "scanne": True}


def _lire_word(contenu: bytes) -> dict:
    import docx
    d = docx.Document(io.BytesIO(contenu))
    lignes = [p.text for p in d.paragraphs if p.text.strip()]
    for t in d.tables:                                     # les tableaux sont lus ligne par ligne
        for r in t.rows:
            cellules = []
            for c in r.cells:
                if c.text.strip() and (not cellules or cellules[-1] != c.text.strip()):
                    cellules.append(c.text.strip())
            if cellules:
                lignes.append(" | ".join(cellules))
    return {"texte": "\n".join(lignes), "images": [], "pages": None, "scanne": False}


def _lire_excel(contenu: bytes) -> dict:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(contenu), read_only=True, data_only=True)
    lignes, tableaux = [], []
    for ws in wb.worksheets:
        lignes.append(f"[Feuille {ws.title}]")
        rangees = []
        for row in ws.iter_rows(values_only=True):
            if any(v is not None and str(v).strip() for v in row):
                valeurs = ["" if v is None else str(v) for v in row]
                rangees.append(valeurs)
                lignes.append(" | ".join(valeurs).rstrip(" |"))
        tableaux.append({"feuille": ws.title, "lignes": rangees})
    return {"texte": "\n".join(lignes), "images": [], "pages": len(wb.worksheets), "scanne": False, "tableaux": tableaux}


def _decoder(contenu: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return contenu.decode(enc)
        except UnicodeDecodeError:
            continue
    return contenu.decode("utf-8", "replace")


def _lire_csv(contenu: bytes) -> dict:
    texte = _decoder(contenu)
    try:
        dialecte = csv.Sniffer().sniff(texte[:4000], delimiters=";,\t|")
    except csv.Error:
        dialecte = csv.excel
    rangees = [r for r in csv.reader(io.StringIO(texte), dialecte) if any(c.strip() for c in r)]
    return {"texte": "\n".join(" | ".join(r) for r in rangees), "images": [], "pages": None, "scanne": False,
            "tableaux": [{"feuille": "csv", "lignes": rangees}]}


def _lire_powerpoint(contenu: bytes) -> dict:
    from pptx import Presentation
    pres = Presentation(io.BytesIO(contenu))
    lignes = []
    for i, diapo in enumerate(pres.slides, 1):
        lignes.append(f"[Diapositive {i}]")
        for forme in diapo.shapes:
            if forme.has_text_frame and forme.text_frame.text.strip():
                lignes.append(forme.text_frame.text.strip())
            if getattr(forme, "has_table", False) and forme.has_table:
                for r in forme.table.rows:
                    lignes.append(" | ".join(c.text.strip() for c in r.cells))
        if diapo.has_notes_slide and diapo.notes_slide.notes_text_frame.text.strip():
            lignes.append("Notes : " + diapo.notes_slide.notes_text_frame.text.strip())
    return {"texte": "\n".join(lignes), "images": [], "pages": len(pres.slides), "scanne": False}


def _lire_xml(contenu: bytes) -> dict:
    # ElementTree ne résout pas les entités externes ; les entités internes sont refusées (attaque « billion laughs »)
    if b"<!ENTITY" in contenu.upper():
        raise ErreurLecture("XML refusé : les déclarations d'entités ne sont pas autorisées")
    try:
        racine = ET.fromstring(contenu)  # noqa: S314  (entités refusées juste au-dessus)
    except ET.ParseError as e:
        raise ErreurLecture(f"XML invalide : {e}") from e
    lignes = []

    def parcourir(noeud, chemin):
        nom = noeud.tag.split("}")[-1]
        attrs = " ".join(f'{k.split("}")[-1]}="{v}"' for k, v in noeud.attrib.items())
        texte = (noeud.text or "").strip()
        if texte or attrs:
            lignes.append(f"{chemin}/{nom}" + (f" [{attrs}]" if attrs else "") + (f" : {texte}" if texte else ""))
        for enfant in noeud:
            parcourir(enfant, f"{chemin}/{nom}")
    parcourir(racine, "")
    return {"texte": "\n".join(lignes), "images": [], "pages": None, "scanne": False}


def _lire_json(contenu: bytes) -> dict:
    try:
        donnees = json.loads(_decoder(contenu))
    except json.JSONDecodeError as e:
        raise ErreurLecture(f"JSON invalide : {e}") from e
    lignes = []

    def aplatir(v, chemin):
        if isinstance(v, dict):
            for k, x in v.items():
                aplatir(x, f"{chemin}.{k}" if chemin else k)
        elif isinstance(v, list):
            for i, x in enumerate(v):
                aplatir(x, f"{chemin}[{i}]")
        else:
            lignes.append(f"{chemin} : {v}")
    aplatir(donnees, "")
    tableaux = []
    if isinstance(donnees, list) and donnees and all(isinstance(x, dict) for x in donnees):
        colonnes = list(dict.fromkeys(k for x in donnees for k in x))
        tableaux = [{"feuille": "json", "lignes": [colonnes] + [[str(x.get(c, "")) for c in colonnes] for x in donnees]}]
    return {"texte": "\n".join(lignes), "images": [], "pages": None, "scanne": False, "tableaux": tableaux}


LECTEURS = {"pdf": _lire_pdf, "image": _lire_image, "word": _lire_word, "excel": _lire_excel, "csv": _lire_csv,
            "powerpoint": _lire_powerpoint, "xml": _lire_xml, "json": _lire_json,
            "texte": lambda c: {"texte": _decoder(c), "images": [], "pages": None, "scanne": False}}


def lire(nom: str, contenu: bytes) -> dict:
    """Renvoie {format, texte, images (PNG), pages, scanne, tableaux?}."""
    fmt = format_du_fichier(nom)
    if not contenu:
        raise ErreurLecture("Le fichier est vide")
    if fmt in SIGNATURES and not any(contenu.startswith(s) for s in SIGNATURES[fmt]):
        raise ErreurLecture("Le contenu du fichier ne correspond pas à son extension")
    try:
        res = LECTEURS[fmt](contenu)
    except ErreurLecture:
        raise
    except Exception as e:
        raise ErreurLecture(f"Fichier illisible ({fmt}) : {str(e)[:150]}") from e
    res["format"] = fmt
    res["texte"] = (res.get("texte") or "")[:MAX_CARACTERES]
    return res


def ocr_local(images: list) -> str:
    """Lecture des images sans connexion (RapidOCR, facultatif). Renvoie '' si la bibliothèque n'est pas installée."""
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        return ""
    moteur = RapidOCR()
    lignes = []
    for png in images:
        resultat, _ = moteur(png)
        lignes += [r[1] for r in (resultat or [])]
    return "\n".join(lignes)
