// Vista previa en inglés para enlaces compartidos (Facebook, LinkedIn, WhatsApp).
// Cuando el enlace lleva ?lang=en, cambia la imagen, el título y la descripción
// de la vista previa (etiquetas og: y twitter:) al inglés. La página en sí no cambia.

const PAGES = {
  "/": {
    title: "IT support and cybersecurity for businesses in Puerto Rico | Netblue",
    description: "Networks, cloud, Microsoft 365 and compliance for small and midsize businesses in Puerto Rico. The first assessment is free.",
  },
  "/assessment/": {
    title: "How well protected is your business? Free assessment | Netblue",
    description: "Answer 21 questions in 10 minutes and get your security score and the priority fixes for your business.",
  },
  "/chequeo-cumplimiento/": {
    title: "Is your business HIPAA, FTC Safeguards or PCI DSS compliant? Free check | Netblue",
    description: "Pick your type of business and see which security requirements you're missing, with the reference for each. Includes Puerto Rico's Law 111.",
  },
  "/laboratorio/detecta-el-phishing/": {
    title: "Spot the Phishing | Netblue Lab",
    description: "Sort emails into legitimate or fraudulent and learn the warning signs. An interactive simulator from the Netblue cybersecurity lab.",
  },
  "/sectores/contables-cpa-ftc-safeguards/": {
    title: "FTC Safeguards and cybersecurity for CPAs in Puerto Rico | Netblue",
    description: "We help CPAs, accountants and tax preparers in Puerto Rico meet the FTC Safeguards Rule and IRS requirements: WISP, MFA, encryption and backups.",
  },
  "/amenazas/": {
    title: "Today's 5 most urgent cybersecurity threats | Netblue",
    description: "Live dashboard: actively exploited vulnerabilities, what they affect and what to do. Updated throughout the day.",
  },
  "/precios/": {
    title: "Managed IT and firewall pricing | Netblue",
    description: "Netblue's flat pricing for businesses in Puerto Rico: managed support and cybersecurity from $45 per user per month, and firewall as a service from $249 per location.",
  },
};

const IMAGE = "https://netbluepr.com/og-image-en.png";
const IMAGE_ALT = "Netblue IT Consulting: IT support and cybersecurity for businesses in Puerto Rico";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function setMeta(html, attr, name, value) {
  const re = new RegExp(`(<meta\\s+${attr}="${name.replace(/[:]/g, "\\:")}"\\s+content=")[^"]*(")`, "i");
  if (re.test(html)) return html.replace(re, `$1${esc(value)}$2`);
  return html.replace("</head>", `<meta ${attr}="${name}" content="${esc(value)}">\n</head>`);
}

export default async (request, context) => {
  const url = new URL(request.url);
  if (url.searchParams.get("lang") !== "en") return;
  // La portada ya tiene versión completa en inglés: /?lang=en pasa a /en/ (301),
  // así los enlaces ya compartidos en Facebook llegan a la página en inglés.
  if (url.pathname === "/") {
    const dest = new URL("/en/", url);
    for (const [k, v] of url.searchParams) if (k !== "lang") dest.searchParams.append(k, v);
    return Response.redirect(dest.toString(), 301);
  }
  const page = PAGES[url.pathname];
  if (!page) return;

  const response = await context.next();
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;

  let html = await response.text();
  // og:url conserva ?lang=en para que Facebook no vuelva a la versión en español.
  const shareUrl = `https://netbluepr.com${url.pathname}?lang=en`;
  html = setMeta(html, "property", "og:title", page.title);
  html = setMeta(html, "property", "og:description", page.description);
  html = setMeta(html, "property", "og:url", shareUrl);
  html = setMeta(html, "property", "og:locale", "en_US");
  html = setMeta(html, "property", "og:image", IMAGE);
  html = setMeta(html, "property", "og:image:width", "1200");
  html = setMeta(html, "property", "og:image:height", "630");
  html = setMeta(html, "property", "og:image:alt", IMAGE_ALT);
  html = setMeta(html, "name", "twitter:title", page.title);
  html = setMeta(html, "name", "twitter:description", page.description);
  html = setMeta(html, "name", "twitter:image", IMAGE);

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, { status: response.status, headers });
};

export const config = {
  path: Object.keys(PAGES),
  onError: "bypass",
};
