// /amenazas/ con el top 5 ya escrito en el HTML.
// La página arma la lista con JavaScript; Google (y quien no tenga JS) veía "Cargando datos…"
// y una lista vacía. Esta función pide /api/threats (en caché del CDN 30 min) y escribe una
// versión sencilla de las 5 tarjetas. Al cargar, el script de la página las reemplaza por las
// completas y las sigue actualizando. Si algo falla, se sirve la página tal cual.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fecha = (s) => {
  try {
    return new Date(`${s}T12:00:00`).toLocaleDateString("es-PR", { day: "numeric", month: "short", year: "numeric" });
  } catch { return s; }
};
const hora = (iso) => {
  try {
    return new Date(iso).toLocaleString("es-PR", { timeZone: "America/Puerto_Rico", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" });
  } catch { return ""; }
};
const cuando = (t) => (t.daysAgo === 0 ? "Hoy" : t.daysAgo === 1 ? "Ayer" : `Hace ${t.daysAgo} días`);

function tarjeta(t) {
  const chips = ['<li class="hot">Explotada activamente</li>'];
  if (t.ransomware) chips.push('<li class="hot">Usada en ransomware</li>');
  if (t.smbRelevant) chips.push('<li class="smb">Común en pymes</li>');
  for (const c of (t.cves || []).slice(0, 4)) chips.push(`<li><a href="${esc(c.url)}" rel="noopener" target="_blank">${esc(c.id)}</a></li>`);
  if ((t.cves || []).length > 4) chips.push(`<li>+${t.cves.length - 4} más</li>`);
  const sub = t.cves && t.cves.length > 1 ? `${t.cves.length} vulnerabilidades del mismo producto` : t.title;
  const filas = [`<dt>Agregada al catálogo</dt><dd>${esc(cuando(t))} · ${esc(fecha(t.dateAdded))}</dd>`];
  if (t.epss != null) filas.push(`<dt>Probabilidad de explotación (EPSS)</dt><dd>${Math.round(t.epss * 1000) / 10}%</dd>`);
  if (t.dueDate) filas.push(`<dt>Plazo de CISA para parchar</dt><dd>${esc(fecha(t.dueDate))}</dd>`);
  return `<li class="threat" data-level="${esc(t.level?.key)}" aria-label="Número ${esc(t.rank)}: ${esc(t.vendor)} ${esc(t.product)}">` +
    `<div class="rank" aria-hidden="true">0${esc(t.rank)}</div>` +
    `<div><div class="t-top"><span class="badge">Urgencia ${esc(t.level?.label)}</span><span class="t-type">${esc(t.type)}</span></div>` +
    `<h2>${esc(t.vendor)} ${esc(t.product)}<small>${esc(sub)}</small></h2>` +
    `<ul class="chips2" aria-label="Detalles">${chips.join("")}</ul>` +
    `<div class="todo-box"><strong>Qué hacer</strong>${esc(t.action)}</div></div>` +
    `<div class="side"><div class="meter"><b>Puntuación de urgencia<span>${esc(t.score)}</span></b>` +
    `<div class="bar" role="img" aria-label="Urgencia ${esc(t.score)} de 100"><i style="width:${Number(t.score) || 0}%"></i></div></div>` +
    `<dl>${filas.join("")}</dl></div></li>`;
}

export default async (request, context) => {
  const [response, data] = await Promise.all([
    context.next(),
    fetch(new URL("/api/threats", request.url), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  if (!data || !Array.isArray(data.threats) || !data.threats.length) return response;
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;

  let html = await response.text();
  const lista = data.threats.map(tarjeta).join("\n      ");
  html = html.replace(/<ol class="threats skeleton" id="threats" aria-busy="true">[\s\S]*?<\/ol>/,
    `<ol class="threats" id="threats">\n      ${lista}\n    </ol>`);
  const s = data.stats || {};
  for (const [id, v] of [["k-today", s.addedToday], ["k-7d", s.added7d], ["k-30d", s.added30d], ["k-rw", s.ransomware30d]]) {
    if (v != null) html = html.replace(`<b id="${id}">–</b>`, `<b id="${id}">${esc(v)}</b>`);
  }
  if (data.generatedAt) html = html.replace('<span id="updated">Cargando datos…</span>', `<span id="updated">Actualizado ${esc(hora(data.generatedAt))}</span>`);

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, { status: response.status, headers });
};

export const config = {
  path: "/amenazas/",
  onError: "bypass",
};
