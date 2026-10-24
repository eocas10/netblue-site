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
    .replace(/<img(?![^>]*loading=)/gi, '<img loading="lazy"');
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
      ${a.image ? `<img class="hero-img" src="${esc(a.image)}" alt="" width="1200" height="675">` : ''}
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
        <p><a href="/blog/">Ver todos los artículos</a></p>
      </nav>
    </article>
  </div>
</section>`;

  return tpl
    .replaceAll('{{TITLE}}', esc(a.title))
    .replaceAll('{{DESC}}', esc(a.excerpt))
    .replaceAll('{{URL}}', url)
    .replaceAll('{{IMAGE}}', esc(image))
    .replace('{{JSONLD}}', ld)
    .replace('{{MAIN}}', main);
}

async function main() {
  const fuente = process.argv[2];
  let lista = fuente ? JSON.parse(await readFile(fuente, 'utf8')) : await obtenerDeSoro();
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
    const otros = lista.filter((_, j) => j !== i).slice(0, 4);
    await mkdir(path.join(blogDir, a.slug), { recursive: true });
    await writeFile(path.join(blogDir, a.slug, 'index.html'), paginaArticulo(tpl, a, otros));
  }

  const indexPath = path.join(blogDir, 'index.html');
  const index = await readFile(indexPath, 'utf8');
  const bloque = `<!-- BLOG:START -->\n    <ul class="posts">\n${lista.map(tarjeta).join('\n')}\n    </ul>\n    <!-- BLOG:END -->`;
  await writeFile(indexPath, index.replace(/<!-- BLOG:START -->[\s\S]*?<!-- BLOG:END -->/, bloque));

  const smPath = path.join(ROOT, 'sitemap.xml');
  let sm = (await readFile(smPath, 'utf8')).replace(/\s*<url><loc>https:\/\/netbluepr\.com\/blog\/[^<]+\/<\/loc>.*?<\/url>/g, '');
  const hoy = lista[0].isoDate.slice(0, 10);
  sm = sm.replace(/(<url><loc>https:\/\/netbluepr\.com\/blog\/<\/loc><lastmod>)[^<]*/, `$1${hoy}`);
  const urls = lista.map((a) => `  <url><loc>${SITE}/blog/${a.slug}/</loc><lastmod>${a.isoDate.slice(0, 10)}</lastmod><priority>0.6</priority></url>`).join('\n');
  await writeFile(smPath, sm.replace('</urlset>', `${urls}\n</urlset>`));

  console.log(`Blog generado: ${lista.length} artículos`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
