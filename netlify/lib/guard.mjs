// Límites de intentos guardados en Netlify Blobs (funcionan en cualquier plan).
// La IP se guarda como hash, nunca en claro.
import { getStore } from "@netlify/blobs";

const enc = new TextEncoder();
async function clave(prefijo, ip) {
  const sal = Netlify.env.get("REVIEWS_ADMIN_KEY") || "netblue";
  const h = await crypto.subtle.digest("SHA-256", enc.encode(`${sal}|${ip || "?"}`));
  return `${prefijo}/${Buffer.from(h).toString("hex").slice(0, 32)}`;
}

const tienda = (store) => store || getStore({ name: "guard", consistency: "strong" });

// Clave de administrador: tras `max` fallos en `ventana` segundos, bloquea la IP `bloqueo` segundos.
export async function bloqueada(ip, { store, ahora = Date.now() } = {}) {
  const s = tienda(store);
  const r = await s.get(await clave("admin", ip), { type: "json" });
  return !!(r && r.hasta && r.hasta > ahora);
}

export async function fallo(ip, { store, ahora = Date.now(), max = 5, ventana = 900, bloqueo = 900 } = {}) {
  const s = tienda(store);
  const k = await clave("admin", ip);
  let r = (await s.get(k, { type: "json" })) || { n: 0, desde: ahora };
  if (ahora - r.desde > ventana * 1000) r = { n: 0, desde: ahora };
  r.n += 1;
  if (r.n >= max) r.hasta = ahora + bloqueo * 1000;
  await s.setJSON(k, r);
  return r;
}

export async function exito(ip, { store } = {}) {
  await tienda(store).delete(await clave("admin", ip));
}

// Envíos públicos: como máximo `max` por IP cada `ventana` segundos. Devuelve true si se permite.
export async function permitir(prefijo, ip, { store, ahora = Date.now(), max = 3, ventana = 3600 } = {}) {
  const s = tienda(store);
  const k = await clave(prefijo, ip);
  let r = (await s.get(k, { type: "json" })) || { n: 0, desde: ahora };
  if (ahora - r.desde > ventana * 1000) r = { n: 0, desde: ahora };
  if (r.n >= max) return false;
  r.n += 1;
  await s.setJSON(k, r);
  return true;
}
