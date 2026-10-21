// Top 5 amenazas de ciberseguridad del día.
// GET /api/threats -> las 5 vulnerabilidades explotadas activamente más urgentes.
//
// Fuentes (públicas, sin llave):
//   - CISA Known Exploited Vulnerabilities (KEV): vulnerabilidades que ya se
//     están usando en ataques reales. Se actualiza varias veces por semana.
//   - FIRST EPSS: probabilidad diaria de explotación de cada CVE.
//
// La respuesta se guarda en el CDN de Netlify por 30 minutos, así que la
// función corre pocas veces aunque la página reciba mucho tráfico. La última
// respuesta buena se guarda en Netlify Blobs por si una fuente falla.
import { getStore } from "@netlify/blobs";

const KEV_URLS = [
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
  "https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json",
];
const EPSS_URL = "https://api.first.org/data/v1/epss";
const TZ = "America/Puerto_Rico";
const WINDOW_DAYS = 30;
const DAY = 86_400_000;

// Fabricantes y productos que vemos a diario en oficinas pequeñas y medianas.
const SMB_VENDORS = [
  "microsoft", "fortinet", "cisco", "sonicwall", "ivanti", "vmware", "broadcom", "citrix",
  "apple", "google", "chrome", "android", "palo alto", "zyxel", "watchguard", "synology",
  "qnap", "veeam", "connectwise", "kaseya", "mikrotik", "ubiquiti", "tp-link", "netgear",
  "d-link", "atlassian", "wordpress", "adobe", "mozilla", "sophos", "check point", "juniper",
  "beyondtrust", "solarwinds", "zoho", "manageengine", "teamviewer", "anydesk", "screenconnect",
  "samsung", "linux", "openssh", "oracle", "sap", "progress", "moveit", "barracuda", "f5",
  "hikvision", "dahua", "plex", "7-zip", "winrar", "rarlab", "quickbooks", "intuit", "asus",
];

const CWE_ES = [
  [["CWE-78", "CWE-77"], "Inyección de comandos"],
  [["CWE-94", "CWE-95", "CWE-502", "CWE-1336"], "Ejecución remota de código"],
  [["CWE-287", "CWE-306", "CWE-288", "CWE-290", "CWE-305", "CWE-303"], "Evasión de autenticación"],
  [["CWE-269", "CWE-250", "CWE-266", "CWE-268"], "Escalada de privilegios"],
  [["CWE-862", "CWE-863", "CWE-284", "CWE-285", "CWE-732", "CWE-639"], "Control de acceso roto"],
  [["CWE-787", "CWE-119", "CWE-120", "CWE-121", "CWE-122", "CWE-416", "CWE-125", "CWE-190", "CWE-843", "CWE-415"], "Corrupción de memoria"],
  [["CWE-22", "CWE-23", "CWE-36", "CWE-73"], "Acceso indebido a archivos"],
  [["CWE-434"], "Subida de archivos maliciosos"],
  [["CWE-89"], "Inyección SQL"],
  [["CWE-79"], "Secuencias de comandos (XSS)"],
  [["CWE-918"], "Falsificación de solicitudes (SSRF)"],
  [["CWE-352"], "Falsificación de solicitudes (CSRF)"],
  [["CWE-798", "CWE-321", "CWE-259"], "Credenciales incrustadas"],
  [["CWE-200", "CWE-532", "CWE-312"], "Exposición de información"],
  [["CWE-601"], "Redirección abierta"],
  [["CWE-20", "CWE-1287"], "Validación de datos insuficiente"],
];

const NAME_ES = [
  [/remote code execution|code execution/i, "Ejecución remota de código"],
  [/command injection/i, "Inyección de comandos"],
  [/authentication bypass|missing authentication|improper authentication/i, "Evasión de autenticación"],
  [/privilege escalation|elevation of privilege/i, "Escalada de privilegios"],
  [/use-after-free|out-of-bounds|buffer overflow|memory corruption|type confusion|heap/i, "Corrupción de memoria"],
  [/path traversal|directory traversal/i, "Acceso indebido a archivos"],
  [/deserialization/i, "Ejecución remota de código"],
  [/sql injection/i, "Inyección SQL"],
  [/cross-site scripting|xss/i, "Secuencias de comandos (XSS)"],
  [/security feature bypass/i, "Evasión de controles de seguridad"],
  [/information disclosure/i, "Exposición de información"],
];

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });

async function getJson(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "netbluepr.com threat dashboard" },
    });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function loadKev() {
  let lastErr;
  for (const url of KEV_URLS) {
    try {
      const data = await getJson(url);
      if (Array.isArray(data?.vulnerabilities)) return data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("KEV no disponible");
}

async function loadEpss(cves) {
  const out = {};
  for (let i = 0; i < cves.length; i += 80) {
    const chunk = cves.slice(i, i + 80);
    try {
      const data = await getJson(`${EPSS_URL}?cve=${chunk.join(",")}`, 7000);
      for (const row of data?.data || []) {
        out[row.cve] = { epss: Number(row.epss) || 0, percentile: Number(row.percentile) || 0 };
      }
    } catch {
      // EPSS es un complemento: si falla, se ordena sin él.
    }
  }
  return out;
}

const dayInPR = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

function typeEs(v) {
  for (const [re, label] of NAME_ES) if (re.test(v.vulnerabilityName || "")) return label;
  for (const [cwes, label] of CWE_ES) if ((v.cwes || []).some((c) => cwes.includes(c))) return label;
  return "Vulnerabilidad explotada";
}

function vendorLink(notes = "") {
  const urls = notes.split(/\s*;\s*|\s+/).filter((u) => /^https?:\/\//.test(u));
  return urls.find((u) => !/cisa\.gov|nvd\.nist\.gov/.test(u)) || null;
}

const isSmb = (vendor, product) => {
  const s = `${vendor} ${product}`.toLowerCase();
  return SMB_VENDORS.some((k) => s.includes(k));
};

function level(score) {
  if (score >= 70) return { key: "critica", label: "Crítica" };
  if (score >= 50) return { key: "alta", label: "Alta" };
  return { key: "elevada", label: "Elevada" };
}

async function build() {
  const kev = await loadKev();
  const today = dayInPR();
  const all = kev.vulnerabilities;

  const recent = all.filter((v) => {
    const age = daysBetween(v.dateAdded, today);
    return age >= 0 && age <= WINDOW_DAYS;
  });
  const pool = recent.length >= 5 ? recent : [...all].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)).slice(0, 40);

  const epss = await loadEpss(pool.map((v) => v.cveID));

  // Agrupar por fabricante + producto: cuatro CVE del mismo producto son una sola amenaza.
  const groups = new Map();
  for (const v of pool) {
    const key = `${v.vendorProject}|${v.product}`.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }

  const threats = [...groups.values()].map((items) => {
    items.sort((a, b) => (epss[b.cveID]?.epss || 0) - (epss[a.cveID]?.epss || 0) || b.dateAdded.localeCompare(a.dateAdded));
    const lead = items[0];
    const newest = items.reduce((m, v) => (v.dateAdded > m ? v.dateAdded : m), lead.dateAdded);
    const age = Math.max(0, daysBetween(newest, today));
    const maxEpss = Math.max(0, ...items.map((v) => epss[v.cveID]?.epss || 0));
    const maxPct = Math.max(0, ...items.map((v) => epss[v.cveID]?.percentile || 0));
    const ransomware = items.some((v) => v.knownRansomwareCampaignUse === "Known");
    const smb = isSmb(lead.vendorProject, lead.product);
    const due = items.map((v) => v.dueDate).filter(Boolean).sort()[0] || null;

    const score =
      40 * Math.exp(-age / 6) +
      35 * maxEpss +
      (ransomware ? 15 : 0) +
      (smb ? 10 : 0) +
      Math.min(6, (items.length - 1) * 2);

    return {
      score: Math.round(Math.min(100, score)),
      vendor: lead.vendorProject,
      product: lead.product,
      title: lead.vulnerabilityName,
      type: typeEs(lead),
      description: lead.shortDescription,
      cves: items.map((v) => ({
        id: v.cveID,
        epss: epss[v.cveID]?.epss ?? null,
        url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
      })),
      dateAdded: newest,
      daysAgo: age,
      dueDate: due,
      ransomware,
      smbRelevant: smb,
      epss: maxEpss || null,
      epssPercentile: maxPct || null,
      advisory: vendorLink(lead.notes),
      action: `Actualice ${lead.product} (${lead.vendorProject}) siguiendo el aviso del fabricante. Si todavía no hay parche, aplique las mitigaciones publicadas o desconecte el equipo de Internet hasta poder actualizar.`,
    };
  });

  threats.sort((a, b) => b.score - a.score || b.dateAdded.localeCompare(a.dateAdded));
  const top = threats.slice(0, 5).map((t, i) => ({ rank: i + 1, level: level(t.score), ...t }));

  const within = (n) => all.filter((v) => { const a = daysBetween(v.dateAdded, today); return a >= 0 && a < n; });
  return {
    generatedAt: new Date().toISOString(),
    day: today,
    sources: {
      kev: { name: "CISA KEV", version: kev.catalogVersion, released: kev.dateReleased, url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog" },
      epss: { name: "FIRST EPSS", url: "https://www.first.org/epss/" },
    },
    stats: {
      catalogTotal: kev.count ?? all.length,
      addedToday: within(1).length,
      added7d: within(7).length,
      added30d: within(30).length,
      ransomware30d: within(30).filter((v) => v.knownRansomwareCampaignUse === "Known").length,
    },
    threats: top,
  };
}

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Método no permitido." }, 405);
  let store = null;
  try {
    store = getStore({ name: "threats" });
  } catch {
    // Blobs no disponible (por ejemplo, fuera de Netlify): seguimos sin respaldo.
  }

  try {
    const data = await build();
    await store?.setJSON("latest", data).catch(() => {});
    return json(data, 200, {
      "cache-control": "public, max-age=300",
      "netlify-cdn-cache-control": "public, durable, s-maxage=1800, stale-while-revalidate=3600",
    });
  } catch (err) {
    console.error("threats:", err);
    const last = store ? await store.get("latest", { type: "json" }).catch(() => null) : null;
    if (last) {
      return json({ ...last, stale: true }, 200, {
        "cache-control": "public, max-age=60",
        "netlify-cdn-cache-control": "public, s-maxage=300",
      });
    }
    return json({ error: "No pudimos obtener los datos en este momento." }, 503, { "cache-control": "no-store" });
  }
};

export const config = { path: "/api/threats" };
