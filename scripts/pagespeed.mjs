// Mide páginas de netbluepr.com con la API de PageSpeed Insights y escribe seo-data/pagespeed.json.
// Uso: PAGESPEED_API_KEY=... node scripts/pagespeed.mjs   (sin clave también funciona, con menos cuota)
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['https://netbluepr.com/', 'https://netbluepr.com/en/', 'https://netbluepr.com/assessment/', 'https://netbluepr.com/blog/'];
const KEY = process.env.PAGESPEED_API_KEY || '';

async function medir(url, strategy) {
  const q = new URLSearchParams({ url, strategy });
  for (const c of ['performance', 'seo', 'accessibility', 'best-practices']) q.append('category', c);
  if (KEY) q.set('key', KEY);
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(120000) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || `HTTP ${r.status}`);
      const cat = d.lighthouseResult.categories, au = d.lighthouseResult.audits;
      const campo = d.loadingExperience?.metrics || {};
      const pct = (k) => (cat[k]?.score == null ? null : Math.round(cat[k].score * 100));
      return {
        performance: pct('performance'), seo: pct('seo'), accessibility: pct('accessibility'), bestPractices: pct('best-practices'),
        lcpSeconds: au['largest-contentful-paint'] ? Math.round(au['largest-contentful-paint'].numericValue / 100) / 10 : null,
        cls: au['cumulative-layout-shift'] ? Math.round(au['cumulative-layout-shift'].numericValue * 1000) / 1000 : null,
        tbtMs: au['total-blocking-time'] ? Math.round(au['total-blocking-time'].numericValue) : null,
        fcpSeconds: au['first-contentful-paint'] ? Math.round(au['first-contentful-paint'].numericValue / 100) / 10 : null,
        // Datos de usuarios reales (Chrome UX Report); suelen faltar en sitios con poco tráfico.
        fieldData: Object.keys(campo).length ? Object.fromEntries(Object.entries(campo).map(([k, v]) => [k, { p75: v.percentile, category: v.category }])) : null,
      };
    } catch (e) {
      if (intento === 3) return { error: String(e.message || e).replace(KEY || '\u0000', '***') };
      await new Promise((r) => setTimeout(r, 10000 * intento));
    }
  }
}

const resultado = { generatedAt: new Date().toISOString(), withApiKey: Boolean(KEY), pages: {} };
for (const url of PAGES) {
  resultado.pages[url] = { mobile: await medir(url, 'mobile'), desktop: await medir(url, 'desktop') };
  console.log(url, JSON.stringify(resultado.pages[url]));
}
await mkdir(path.join(ROOT, 'seo-data'), { recursive: true });
await writeFile(path.join(ROOT, 'seo-data', 'pagespeed.json'), JSON.stringify(resultado, null, 2) + '\n');
