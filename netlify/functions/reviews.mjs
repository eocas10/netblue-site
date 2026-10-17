// Reseñas públicas de clientes.
// GET  /api/reviews  -> reseñas aprobadas (más recientes primero)
// POST /api/reviews  -> nueva reseña (queda "pendiente" hasta que se apruebe)
import { getStore } from "@netlify/blobs";

const STORE = "reviews";
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });

const clean = (v, max) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

export default async (req) => {
  const store = getStore({ name: STORE, consistency: "strong" });

  if (req.method === "GET") {
    const { blobs } = await store.list({ prefix: "approved/" });
    const items = (
      await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))
    ).filter(Boolean);
    items.sort((a, b) => (b.approvedAt || b.createdAt).localeCompare(a.approvedAt || a.createdAt));
    const pub = items.map(({ id, name, company, rating, text, createdAt }) => ({
      id, name, company, rating, text, createdAt,
    }));
    const avg = pub.length ? pub.reduce((s, r) => s + r.rating, 0) / pub.length : 0;
    return json(
      { count: pub.length, average: Math.round(avg * 10) / 10, reviews: pub },
      200,
      { "cache-control": "public, max-age=60" }
    );
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Solicitud inválida." }, 400);
    }
    // Trampa para bots: el campo oculto debe venir vacío.
    if (body.website) return json({ ok: true });

    const name = clean(body.name, 80);
    const company = clean(body.company, 100);
    const email = clean(body.email, 120);
    const text = clean(body.text, 1500);
    const rating = Number.parseInt(body.rating, 10);
    const consent = body.consent === true;

    if (name.length < 2) return json({ error: "Escriba su nombre." }, 400);
    if (!(rating >= 1 && rating <= 5)) return json({ error: "Seleccione de 1 a 5 estrellas." }, 400);
    if (text.length < 10) return json({ error: "La reseña es muy corta." }, 400);
    if (!consent) return json({ error: "Debe autorizar la publicación." }, 400);

    const createdAt = new Date().toISOString();
    const id = `${createdAt.replace(/[-:.TZ]/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
    await store.setJSON(`pending/${id}`, {
      id, name, company, email, rating, text, createdAt, status: "pending",
    });
    return json({ ok: true });
  }

  return json({ error: "Método no permitido." }, 405, { allow: "GET, POST" });
};

export const config = { path: "/api/reviews" };
