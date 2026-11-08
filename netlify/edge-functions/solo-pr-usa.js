// Acceso solo desde Puerto Rico y Estados Unidos.
// Las visitas de otros países reciben un 403 con una página breve y el teléfono de Netblue
// (por si es un cliente de viaje). Pasan siempre: buscadores (Google, Bing…), vistas previas
// de redes sociales (Facebook, LinkedIn, WhatsApp…), PageSpeed/Lighthouse, robots.txt y sitemap.
// Si Netlify no puede determinar el país, se deja pasar (mejor que bloquear a un cliente).
// Va declarada en netlify.toml para que corra antes que las demás edge functions.

const PAISES = new Set(["PR", "US"]);

// Bots que deben poder entrar desde cualquier país (los User-Agent se pueden falsificar;
// es un filtro de tráfico, no un control de seguridad).
const BOTS = /googlebot|google-inspectiontool|googleother|adsbot-google|storebot-google|apis-google|mediapartners-google|google-site-verification|feedfetcher-google|chrome-lighthouse|google page speed|bingbot|bingpreview|msnbot|adidxbot|duckduckbot|applebot|yandex|baiduspider|facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|linkedinbot|whatsapp|twitterbot|slackbot|telegrambot|discordbot|pinterest/i;

// Archivos que no hace falta revisar (imágenes, estilos, etc.) y rutas públicas para buscadores.
const LIBRES = /^\/(robots\.txt|sitemap\.xml|favicon\.png|logo\.png|og-image(-en)?\.png)$|\.(png|jpe?g|webp|avif|gif|svg|ico|css|js|woff2?|ttf|map|txt|xml)$/i;

const PAGINA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Acceso no disponible | Netblue IT Consulting</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F2ED;color:#0E2233;font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
main{max-width:560px;background:#fff;border:1px solid #DDD8CE;border-radius:18px;padding:36px}
h1{font-size:26px;line-height:1.2;margin:0 0 12px}p{margin:0 0 12px;color:#3B4552}a{color:#1557C0;font-weight:600}
hr{border:0;border-top:1px solid #ECE8E0;margin:20px 0}
</style>
</head>
<body>
<main>
<h1>Acceso no disponible desde su ubicación</h1>
<p>Este sitio solo está disponible desde Puerto Rico y Estados Unidos.</p>
<p>Si es cliente de Netblue y está de viaje, comuníquese con nosotros: <a href="tel:+17873379818">787-337-9818</a> · <a href="mailto:eocasio@netbluepr.com">eocasio@netbluepr.com</a></p>
<hr>
<p lang="en">This website is only available from Puerto Rico and the United States. Clients traveling abroad can reach us at <a href="tel:+17873379818">+1 787-337-9818</a> or <a href="mailto:eocasio@netbluepr.com">eocasio@netbluepr.com</a>.</p>
</main>
</body>
</html>`;

export default async (request, context) => {
  const pais = context.geo?.country?.code;
  if (!pais || PAISES.has(pais)) return;
  const url = new URL(request.url);
  if (LIBRES.test(url.pathname)) return;
  if (BOTS.test(request.headers.get("user-agent") || "")) return;

  return new Response(request.method === "HEAD" ? null : PAGINA, {
    status: 403,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
};
