// Genera el blog como HTML estático a partir de los artículos de Soro.
// Uso: node scripts/build-blog.mjs            (descarga de Soro)
//      node scripts/build-blog.mjs datos.json (usa un archivo local, para pruebas)
// Crea /blog/<slug>/index.html, rellena la lista de /blog/index.html y actualiza sitemap.xml.
// Si Soro no responde, termina con error sin tocar ningún archivo.

import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://netbluepr.com';
const SORO = 'https://app.trysoro.com/api/embed/cbe94365-03e3-4bf2-9599-1570725e6b90';
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugOk = (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
const fecha = (iso) => {
  const d = new Date(new Date(iso).getTime() - 4 * 3600e3); // hora de Puerto Rico (UTC-4)
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};

// "Wi-Fi" escrito siempre igual (sin tocar enlaces ni slugs como /wifi-seguro-para-oficina/).
const wifi = (s = '') => String(s).replace(/(?<![\w/.#-])wi-?fi(?![\w/-])/gi, 'Wi-Fi');

// Limpieza básica del HTML que viene de Soro: sin scripts, iframes, estilos ni eventos.
function limpiar(html = '') {
  return html
    .replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|iframe|object|embed|link|meta)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
    .replace(/<h1(\s[^>]*)?>/gi, '<h2>').replace(/<\/h1>/gi, '</h2>')
    .replace(/<a\s+href="(https?:\/\/(?!netbluepr\.com)[^"]+)"/gi, '<a href="$1" rel="noopener" target="_blank"')
    .replace(/<img(?![^>]*loading=)/gi, '<img loading="lazy"')
    .replace(/(?<![\w/.#-])wi-?fi(?![\w/-])/gi, 'Wi-Fi');
}

async function obtenerDeSoro() {
  const js = await (await fetch(SORO)).text();
  const m = js.match(/var SORO_ARTICLES = (\[[\s\S]*?\]);\n/);
  if (!m) throw new Error('No encontré la lista de artículos en la respuesta de Soro');
  const lista = JSON.parse(m[1]);
  for (const a of lista) {
    const r = await fetch(`${SORO}/article/${a.id}`);
    if (!r.ok) throw new Error(`Soro respondió ${r.status} para ${a.slug}`);
    a.content = (await r.json()).content;
  }
  return lista;
}

// Artículos propios (no vienen de Soro): un archivo JSON por artículo en /blog-local/
// con slug, title, excerpt, isoDate, image (URL completa) y content (HTML).
// Opcional: seoTitle, el <title> completo para Google (máx. ~60 caracteres) si el título es largo.
async function leerLocales() {
  const dir = path.join(ROOT, 'blog-local');
  let archivos = [];
  try { archivos = (await readdir(dir)).filter((f) => f.endsWith('.json')); } catch { return []; }
  const lista = [];
  for (const f of archivos) lista.push(JSON.parse(await readFile(path.join(dir, f), 'utf8')));
  return lista;
}

// Reconstruye los artículos ya publicados a partir de sus páginas, para poder
// regenerar el blog sin conectarse a Soro: node scripts/build-blog.mjs --sin-soro
async function leerPublicados() {
  const blogDir = path.join(ROOT, 'blog');
  const des = (s = '') => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const lista = [];
  for (const e of await readdir(blogDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const html = await readFile(path.join(blogDir, e.name, 'index.html'), 'utf8');
    const meta = html.match(/<p class="meta"><time datetime="([^"]+)">([^<]*)<\/time>[^\n]*\n/);
    const fin = html.indexOf('\n      <div class="cta">');
    if (!meta || fin < 0) continue;
    let content = html.slice(meta.index + meta[0].length, fin);
    const img = content.match(/^\s*<img class="hero-img" src="([^"]+)"[^>]*>\n/);
    if (img) content = content.slice(img[0].length);
    lista.push({
      slug: e.name,
      title: des(html.match(/<h1>([\s\S]*?)<\/h1>/)[1]),
      excerpt: des(html.match(/<meta name="description" content="([^"]*)"/)[1]),
      isoDate: meta[1], date: des(meta[2]),
      image: img ? des(img[1]) : '',
      content,
    });
  }
  return lista;
}

// Artículos relacionados por tema: palabras en común en título y resumen.
// Así los artículos viejos también reciben enlaces, no solo los 4 más recientes.
const VACIAS = new Set('para como cómo que qué con sin una uno unos unas los las del por sus su este esta más mas entre ante desde sobre cuál cual hacer debe puede empresa empresas negocio negocios puerto rico pymes pyme operación operacion empresarial empresariales oficina guía guia aprenda señales controles'.split(' '));
const raiz = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/(es|s)$/, '');
const palabras = (a) => new Set(`${a.title} ${a.excerpt}`.toLowerCase().split(/[^a-záéíóúñü0-9]+/i)
  .filter((w) => w.length > 2 && !VACIAS.has(w)).map(raiz));
function relacionados(lista, i, n = 4) {
  const base = palabras(lista[i]);
  return lista.map((o, j) => ({ o, j, p: j === i ? -1 : [...palabras(o)].filter((w) => base.has(w)).length }))
    .filter((x) => x.j !== i)
    .sort((x, y) => y.p - x.p || x.j - y.j) // empate: el más reciente
    .slice(0, n).map((x) => x.o);
}

// Página de servicio o sector más cercana al tema del artículo (la primera que coincida).
const SERVICIOS = [
  [/hipaa|cl[ií]nica|m[ée]dic/i, '/sectores/oficinas-medicas-hipaa/', 'Ciberseguridad y HIPAA para oficinas médicas'],
  [/pci|tarjeta|comercio/i, '/sectores/comercios-pci-dss/', 'Cumplimiento PCI DSS para comercios'],
  [/ley 111|bufete|abogad/i, '/sectores/bufetes-abogados/', 'Ciberseguridad para bufetes de abogados'],
  [/ftc|safeguards|contable|cpa/i, '/sectores/contables-cpa-ftc-safeguards/', 'FTC Safeguards para contables y CPA'],
  [/wisp/i, '/servicios/wisp/', 'Servicios para proveedores de internet inalámbrico (WISP)'],
  [/voip|telefon/i, '/servicios/telefonia-voip/', 'Telefonía VoIP para empresas'],
  [/microsoft 365|google workspace|correo corporativo|nube/i, '/servicios/microsoft-365-nube/', 'Microsoft 365 y nube'],
  [/wi-?fi|red de invitados|redundancia|internet|cableado/i, '/servicios/redes-wifi-cableado/', 'Redes, Wi-Fi y cableado'],
];
const servicioDe = (a) => (SERVICIOS.find(([re]) => re.test(`${a.title} ${a.excerpt}`)) || [null, '/servicios/ciberseguridad/', 'Servicios de ciberseguridad']).slice(1);

// <title>: seoTitle si existe; si no, "Título | Netblue" mientras quepa en 60 caracteres, o solo el título.
const tituloSeo = (a) => a.seoTitle || (`${a.title} | Netblue`.length <= 60 ? `${a.title} | Netblue` : a.title);

const tarjeta = (a) => `      <li class="post-card"><a href="/blog/${a.slug}/">
        ${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" width="640" height="360">` : ''}
        <div class="body"><time datetime="${esc(a.isoDate)}">${esc(a.date || fecha(a.isoDate))}</time><h2>${esc(a.title)}</h2><p>${esc(a.excerpt)}</p></div>
      </a></li>`;

function paginaArticulo(tpl, a, otros) {
  const url = `${SITE}/blog/${a.slug}/`;
  const image = a.image || `${SITE}/og-image.png`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: a.title, description: a.excerpt,
      image, datePublished: a.isoDate, dateModified: a.isoDate, inLanguage: 'es-PR', mainEntityOfPage: url,
      author: { '@type': 'Person', '@id': `${SITE}/#fundador`, name: 'Edgardo Ocasio', url: `${SITE}/sobre-nosotros/` },
      publisher: { '@type': 'Organization', '@id': `${SITE}/#negocio`, name: 'Netblue IT Consulting', logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` } } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog/` },
      { '@type': 'ListItem', position: 3, name: a.title, item: url } ] },
  ].map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n');

  const main = `<section class="section">
  <div class="wrap">
    <article class="article">
      <p class="crumbs"><a href="/">Inicio</a> › <a href="/blog/">Blog</a></p>
      <h1>${esc(a.title)}</h1>
      <p class="meta"><time datetime="${esc(a.isoDate)}">${esc(a.date || fecha(a.isoDate))}</time> · Edgardo Ocasio, Netblue IT Consulting</p>
      ${a.image ? `<img class="hero-img" src="${esc(a.image)}" alt="${esc(a.title)}" width="1200" height="675">` : ''}
${limpiar(a.content)}
      <div class="cta">
        <h2>¿Quiere saber cómo está su negocio?</h2>
        <p>Le hacemos una evaluación gratuita y sin compromiso de su red y su seguridad, y le entregamos un informe claro con prioridades y costos, en español y sin tecnicismos.</p>
        <div class="actions">
          <a class="btn btn-primary" href="/#contacto">Solicite su evaluación gratuita</a>
          <a class="btn btn-outline" href="tel:+17873379818">Llame al 787-337-9818</a>
        </div>
      </div>
      <nav class="more" aria-label="Más artículos">
        <h2>Más artículos</h2>
        <ul>
${otros.map((o) => `          <li><a href="/blog/${o.slug}/">${esc(o.title)}</a></li>`).join('\n')}
        </ul>
        <p>Servicio relacionado: <a href="${servicioDe(a)[0]}">${servicioDe(a)[1]}</a></p>
        <p><a href="/blog/">Ver todos los artículos</a></p>
      </nav>
    </article>
  </div>
</section>`;

  return tpl
    .replace('{{SEO_TITLE}}', esc(tituloSeo(a)))
    .replaceAll('{{TITLE}}', esc(a.title))
    .replaceAll('{{DESC}}', esc(a.excerpt))
    .replaceAll('{{URL}}', url)
    .replaceAll('{{IMAGE}}', esc(image))
    .replace('{{JSONLD}}', ld)
    .replace('{{MAIN}}', main);
}

async function main() {
  const fuente = process.argv[2];
  let lista = fuente === '--sin-soro' ? await leerPublicados()
    : fuente ? JSON.parse(await readFile(fuente, 'utf8')) : await obtenerDeSoro();
  // Suma los artículos propios de blog-local/ (los de Soro tienen prioridad si el slug coincide).
  const locales = await leerLocales();
  if (fuente === '--sin-soro') lista = lista.filter((a) => !locales.some((l) => l.slug === a.slug));
  const deLista = new Set(lista.map((a) => a && a.slug));
  lista = lista.concat(locales.filter((a) => !deLista.has(a.slug)));
  for (const a of lista) if (a) { a.title = wifi(a.title); a.excerpt = wifi(a.excerpt); }
  lista = lista.filter((a) => a && slugOk(a.slug) && a.title && a.content)
    .sort((x, y) => new Date(y.isoDate) - new Date(x.isoDate));
  if (!lista.length) throw new Error('No hay artículos válidos; no cambio nada');

  const tpl = await readFile(path.join(ROOT, 'scripts/blog-template.html'), 'utf8');
  const blogDir = path.join(ROOT, 'blog');

  // Borra páginas de artículos que ya no existen en Soro.
  const vigentes = new Set(lista.map((a) => a.slug));
  for (const e of await readdir(blogDir, { withFileTypes: true })) {
    if (e.isDirectory() && !vigentes.has(e.name)) await rm(path.join(blogDir, e.name), { recursive: true });
  }

  for (const [i, a] of lista.entries()) {
    const otros = relacionados(lista, i);
    await mkdir(path.join(blogDir, a.slug), { recursive: true });
    await writeFile(path.join(blogDir, a.slug, 'index.html'), paginaArticulo(tpl, a, otros));
  }

  const indexPath = path.join(blogDir, 'index.html');
  const index = await readFile(indexPath, 'utf8');
  const bloque = `<!-- BLOG:START -->\n    <ul class="posts">\n${lista.map(tarjeta).join('\n')}\n    </ul>\n    <!-- BLOG:END -->`;
  // Datos estructurados de /blog/: la lista de artículos para Google.
  const ldBlog = { '@context': 'https://schema.org', '@type': 'Blog', '@id': `${SITE}/blog/#blog`, url: `${SITE}/blog/`,
    name: 'Blog de Netblue IT Consulting', inLanguage: 'es-PR',
    publisher: { '@type': 'Organization', '@id': `${SITE}/#negocio`, name: 'Netblue IT Consulting' },
    blogPost: lista.map((a) => ({ '@type': 'BlogPosting', headline: a.title, url: `${SITE}/blog/${a.slug}/`, datePublished: a.isoDate })) };
  const bloqueLd = `<!-- BLOGLD:START --><script type="application/ld+json">${JSON.stringify(ldBlog).replace(/</g, '\\u003c')}</script><!-- BLOGLD:END -->`;
  await writeFile(indexPath, index.replace(/<!-- BLOG:START -->[\s\S]*?<!-- BLOG:END -->/, bloque)
    .replace(/<!-- BLOGLD:START -->[\s\S]*?<!-- BLOGLD:END -->/, bloqueLd));

  const smPath = path.join(ROOT, 'sitemap.xml');
  let sm = (await readFile(smPath, 'utf8')).replace(/\s*<url><loc>https:\/\/netbluepr\.com\/blog\/[^<]+\/<\/loc>.*?<\/url>/g, '');
  const hoy = lista[0].isoDate.slice(0, 10);
  sm = sm.replace(/(<url><loc>https:\/\/netbluepr\.com\/blog\/<\/loc><lastmod>)[^<]*/, `$1${hoy}`);
  const urls = lista.map((a) => `  <url><loc>${SITE}/blog/${a.slug}/</loc><lastmod>${a.isoDate.slice(0, 10)}</lastmod><priority>0.6</priority></url>`).join('\n');
  await writeFile(smPath, sm.replace('</urlset>', `${urls}\n</urlset>`));

  console.log(`Blog generado: ${lista.length} artículos`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
