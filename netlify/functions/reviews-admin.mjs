// Moderación de reseñas (solo con la clave REVIEWS_ADMIN_KEY).
// GET  /api/reviews-admin              -> todas (pendientes, aprobadas, rechazadas)
// POST /api/reviews-admin {id, action} -> action: approve | reject | delete
import { getStore } from "@netlify/blobs";

const STORE = "reviews";
const STATES = ["pending", "approved", "rejected"];
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

async function find(store, id) {
  for (const s of STATES) {
    const item = await store.get(`${s}/${id}`, { type: "json" });
    if (item) return { item, state: s };
  }
  return null;
}

export default async (req) => {
  if (!authorized(req)) return json({ error: "Clave incorrecta." }, 401);
  const store = getStore({ name: STORE, consistency: "strong" });

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const items = (
      await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))
    ).filter(Boolean);
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ reviews: items });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Solicitud inválida." }, 400);
    }
    const id = String(body.id || "").replace(/[^A-Za-z0-9-]/g, "");
    const action = body.action;
    const found = id && (await find(store, id));
    if (!found) return json({ error: "Reseña no encontrada." }, 404);

    await store.delete(`${found.state}/${id}`);
    if (action === "delete") return json({ ok: true });

    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : null;
    if (!status) {
      await store.setJSON(`${found.state}/${id}`, found.item);
      return json({ error: "Acción inválida." }, 400);
    }
    const updated = { ...found.item, status };
    if (status === "approved") updated.approvedAt = new Date().toISOString();
    await store.setJSON(`${status}/${id}`, updated);
    return json({ ok: true, review: updated });
  }

  return json({ error: "Método no permitido." }, 405);
};

export const config = { path: "/api/reviews-admin" };
