// Resumen de visitas (solo con la clave REVIEWS_ADMIN_KEY).
// GET /api/visits-admin?days=30
import { getStore } from "@netlify/blobs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function authorized(req) {
  const expected = Netlify.env.get("REVIEWS_ADMIN_KEY");
  const given = req.headers.get("x-admin-key") || "";
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

const sumar = (obj, k) => { obj[k] = (obj[k] || 0) + 1; };
const top = (obj, n = 15) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

export default async (req) => {
  if (!authorized(req)) return json({ error: "Clave incorrecta." }, 401);
  const days = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get("days")) || 30, 1), 90);
  const store = getStore("visits");
  const hoy = new Date(Date.now() - 4 * 3600e3);

  const porDia = [], paginas = {}, fuentes = {}, paises = {}, equipos = {};
  let vistas = 0, entradas = 0;

  for (let i = days - 1; i >= 0; i--) {
    const dia = new Date(hoy.getTime() - i * 864e5).toISOString().slice(0, 10);
    const { blobs } = await store.list({ prefix: `v/${dia}/` });
    let vDia = 0, eDia = 0;
    for (const { key } of blobs) {
      let d;
      try { d = JSON.parse(Buffer.from(key.split("~")[1], "base64url").toString()); } catch { continue; }
      vDia++;
      sumar(paginas, d.p);
      sumar(equipos, d.d === "m" ? "Celular" : "Computadora");
      if (d.s !== "interno") { // la visita entra al sitio desde fuera
        eDia++;
        sumar(fuentes, d.s);
        sumar(paises, d.c || "?");
      }
    }
    vistas += vDia; entradas += eDia;
    porDia.push({ dia, vistas: vDia, entradas: eDia });
  }

  return json({
    days, vistas, entradas, porDia,
    paginas: top(paginas, 20), fuentes: top(fuentes), paises: top(paises, 10), equipos: top(equipos),
  });
};

export const config = { path: "/api/visits-admin" };
