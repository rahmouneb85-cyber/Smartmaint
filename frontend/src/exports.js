// Exports d'un tableau en Excel (CSV), Word et PDF, réalisés dans le navigateur (aucune donnée envoyée ailleurs).

const telecharger = (blob, nom) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const echapperHtml = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Excel : CSV avec séparateur « ; » et BOM UTF-8, ouvert directement par Excel avec les accents et l'arabe.
// Les cellules commençant par = + - @ sont neutralisées (injection de formules).
export function exporterExcel(nom, entetes, lignes) {
  const cellule = (v) => {
    let t = String(v ?? '');
    if (/^[=+\-@]/.test(t)) t = "'" + t;
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = [entetes, ...lignes].map(l => l.map(cellule).join(';')).join('\r\n');
  telecharger(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `${nom}.csv`);
}

function tableHtml(titre, sousTitre, entetes, lignes, dir) {
  return `<div dir="${dir}" style="font-family:Arial,sans-serif;color:#111;padding:10px;letter-spacing:normal">
    <h1 style="font-size:18px;color:#c2410c;margin:0 0 4px">${echapperHtml(titre)}</h1>
    <p style="font-size:11px;color:#555;margin:0 0 12px">${echapperHtml(sousTitre)}</p>
    <table style="border-collapse:collapse;width:100%;font-size:10px">
      <thead><tr>${entetes.map(e => `<th style="border:1px solid #999;background:#1e293b;color:#fff;padding:4px;text-align:start">${echapperHtml(e)}</th>`).join('')}</tr></thead>
      <tbody>${lignes.map(l => `<tr>${l.map(c => `<td style="border:1px solid #bbb;padding:4px;vertical-align:top">${echapperHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

// Word : document HTML enregistré au format .doc, ouvert et modifiable par Microsoft Word.
export function exporterWord(nom, titre, sousTitre, entetes, lignes, dir = 'ltr') {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${echapperHtml(titre)}</title></head><body>${tableHtml(titre, sousTitre, entetes, lignes, dir)}</body></html>`;
  telecharger(new Blob(['﻿' + html], { type: 'application/msword' }), `${nom}.doc`);
}

// PDF : impression du navigateur dans un cadre caché, puis « Enregistrer au format PDF ».
// Le texte est rendu par le navigateur lui-même : espaces, accents et arabe sont exacts, et le PDF reste sélectionnable.
export function exporterPdf(titre, sousTitre, entetes, lignes, dir = 'ltr') {
  const cadre = document.createElement('iframe');
  cadre.setAttribute('aria-hidden', 'true');
  cadre.style.cssText = 'position:fixed;width:0;height:0;border:0;inset-inline-start:-10px;top:0';
  document.body.appendChild(cadre);
  const doc = cadre.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${echapperHtml(titre)}</title>
    <style>@page { size: A4 landscape; margin: 10mm } body { margin: 0 } th { -webkit-print-color-adjust: exact; print-color-adjust: exact }</style></head>
    <body>${tableHtml(titre, sousTitre, entetes, lignes, dir)}</body></html>`);
  doc.close();
  setTimeout(() => {
    cadre.contentWindow.focus();
    cadre.contentWindow.print();
    setTimeout(() => cadre.remove(), 60000);
  }, 300);
}
