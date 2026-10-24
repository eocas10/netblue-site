// Registro de visitas sin cookies ni datos personales.
// POST /api/track {p: ruta, r: referrer, s: utm_source}
// Guarda una entrada por visita a página; los datos van codificados en la clave del blob
// para poder sumarlos después sin leer cada archivo.
import { getStore } from "@netlify/blobs";

const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|curl|wget|python|axios|node-fetch/i;

function fuente(utm, ref) {
  const u = (utm || "").toLowerCase();
  if (u) {
    if (u.includes("facebook") || u === "fb") return "Facebook";
    if (u.includes("instagram") || u === "ig") return "Instagram";
    if (u.includes("linkedin")) return "LinkedIn";
    if (u.includes("whatsapp")) return "WhatsApp";
    if (u.includes("email") || u.includes("correo") || u.includes("outlook")) return "Correo";
    return u.slice(0, 30);
  }
  let host = "";
  try { host = new URL(ref).hostname.toLowerCase(); } catch { return "Directo"; }
  if (host.endsWith("netbluepr.com")) return host === "netbluepr.com" || host === "www.netbluepr.com" ? "interno" : host.split(".")[0] + ".netbluepr.com";
  if (/(^|\.)(facebook|fb)\.(com|me)$/.test(host) || host.startsWith("l.facebook") || host.startsWith("lm.facebook")) return "Facebook";
  if (host.includes("instagram")) return "Instagram";
  if (host.includes("linkedin") || host === "lnkd.in") return "LinkedIn";
  if (host.includes("google.")) return "Google";
  if (host.includes("bing.")) return "Bing";
  if (host.includes("yahoo.") || host.includes("duckduckgo")) return "Otros buscadores";
  if (host.includes("whatsapp")) return "WhatsApp";
  return host.replace(/^www\./, "").slice(0, 40);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

export default async (req, context) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  if (BOTS.test(req.headers.get("user-agent") || "")) return new Response(null, { status: 204 });
  let body;
  try { body = JSON.parse(await req.text()); } catch { return new Response(null, { status: 400 }); }

  let p = String(body.p || "/").split("?")[0].split("#")[0].slice(0, 120);
  if (!p.startsWith("/") || p.startsWith("/admin")) return new Response(null, { status: 204 });
  p = p.replace(/\/index\.html$/, "/");
  // Visitas desde los subdominios (store, cursos, support): se anotan con su nombre delante
  const h = String(body.h || "").toLowerCase();
  if (/^[a-z0-9-]+\.netbluepr\.com$/.test(h) && h !== "www.netbluepr.com") p = h.split(".")[0] + ":" + p;

  const ua = req.headers.get("user-agent") || "";
  const ahora = new Date();
  const dia = new Date(ahora.getTime() - 4 * 3600e3).toISOString().slice(0, 10); // fecha de Puerto Rico
  const dato = {
    p,
    s: fuente(body.s, body.r),
    d: /mobi|android|iphone|ipad/i.test(ua) ? "m" : "c",
    c: (context.geo?.country?.code || "").slice(0, 2),
  };
  const key = `v/${dia}/${ahora.getTime()}-${Math.random().toString(36).slice(2, 8)}~${b64(dato)}`;
  await getStore("visits").set(key, "1");
  return new Response(null, { status: 204 });
};

export const config = { path: "/api/track" };
