/**
 * Receives signup / waitlist POSTs from the landing site.
 *
 * Delivery paths: scanner ingest, webhook, Resend, Apps Script — see env vars in repo README / netlify.toml.
 */

const ALLOW_ORIGIN = process.env.SYNTRIX_ORIGIN || "*";

const WAITLIST_SCANNER_INGEST_URL = (
  process.env.WAITLIST_SCANNER_INGEST_URL || ""
).trim();
const WAITLIST_INGEST_SECRET = (process.env.WAITLIST_INGEST_SECRET || "").trim();

const SIGNUP_WEBHOOK_URL = (process.env.SIGNUP_WEBHOOK_URL || "").trim();
const SIGNUP_WEBHOOK_SECRET = (process.env.SIGNUP_WEBHOOK_SECRET || "").trim();

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const SIGNUP_NOTIFY_TO = (process.env.SIGNUP_NOTIFY_TO || "").trim();
const RESEND_FROM = (process.env.RESEND_FROM || "").trim();

const APPS_SCRIPT_URL_RAW = (
  process.env.APPS_SCRIPT_URL ||
  process.env.APPS_SCRIPT_DEPLOYMENT_ID ||
  ""
).trim();
const APPS_SCRIPT_SECRET = (process.env.APPS_SCRIPT_SECRET || "").trim();

/** Max JSON body size (bytes) — rejects oversized POSTs. */
const MAX_BODY_BYTES = Number(process.env.SIGNUP_MAX_BODY_BYTES || 65536);

/** Simple sliding-window limit per client IP (best-effort on warm instances). */
const RATE_WINDOW_MS = Number(process.env.SIGNUP_RATE_WINDOW_MS || 900000);
const RATE_MAX = Number(process.env.SIGNUP_RATE_MAX || 40);
const rateBuckets = new Map();

function resolveAppsScriptEndpoint(raw) {
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w-]+$/.test(raw)) {
    return `https://script.google.com/macros/s/${raw}/exec`;
  }
  return raw;
}

const APPS_SCRIPT_URL = resolveAppsScriptEndpoint(APPS_SCRIPT_URL_RAW);

function clientIp(event) {
  const xf =
    event.headers["x-forwarded-for"] ||
    event.headers["X-Forwarded-For"] ||
    "";
  const first = String(xf).split(",")[0].trim();
  return first || "unknown";
}

function pruneRateBuckets(now) {
  if (rateBuckets.size < 2000) return;
  const cutoff = now - RATE_WINDOW_MS * 2;
  for (const [ip, b] of rateBuckets) {
    if (b.resetAt < cutoff) rateBuckets.delete(ip);
  }
}

function rateLimitOk(ip) {
  const now = Date.now();
  pruneRateBuckets(now);
  const b = rateBuckets.get(ip);
  if (!b || now > b.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (b.count >= RATE_MAX) return false;
  b.count += 1;
  return true;
}

function headers(extra = {}) {
  return {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function deliveryMode() {
  if (WAITLIST_SCANNER_INGEST_URL && WAITLIST_INGEST_SECRET)
    return "scanner_ingest";
  if (SIGNUP_WEBHOOK_URL) return "webhook";
  if (RESEND_API_KEY && SIGNUP_NOTIFY_TO && RESEND_FROM) return "resend";
  if (APPS_SCRIPT_URL) return "apps_script";
  return null;
}

function signupTextBody(payload) {
  return [
    "New Syntrix signup / waitlist entry",
    "",
    `Email: ${payload.email}`,
    `Full name: ${payload.name || "(none)"}`,
    `Phone: ${payload.phone || "(none)"}`,
    `Business address: ${payload.business_address || "(none)"}`,
    `How they heard about us: ${payload.referral_source || "(none)"}`,
    `Source: ${payload.source || ""}`,
    `Type: ${payload.type || ""}`,
    `Time: ${payload.ts}`,
  ].join("\n");
}

/**
 * Many backends return HTTP 200 with JSON { ok: false } (e.g. Apps Script). Treat as failure.
 */
function jsonIndicatesFailure(data) {
  return data && typeof data === "object" && data.ok === false;
}

async function deliverScanner(payload) {
  const res = await fetch(WAITLIST_SCANNER_INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WAITLIST_INGEST_SECRET}`,
    },
    redirect: "follow",
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Scanner waitlist ingest HTTP", res.status);
    return { ok: false };
  }
  try {
    const data = JSON.parse(text);
    if (jsonIndicatesFailure(data)) {
      console.error("Scanner waitlist ingest logical failure");
      return { ok: false };
    }
  } catch {
    /* non-JSON success — accept if 2xx */
  }
  return { ok: true };
}

async function deliverWebhook(payload) {
  const h = { "Content-Type": "application/json" };
  if (SIGNUP_WEBHOOK_SECRET) {
    h["X-Syntrix-Secret"] = SIGNUP_WEBHOOK_SECRET;
  }
  const res = await fetch(SIGNUP_WEBHOOK_URL, {
    method: "POST",
    headers: h,
    redirect: "follow",
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Webhook HTTP", res.status);
    return { ok: false };
  }
  try {
    const data = JSON.parse(text);
    if (jsonIndicatesFailure(data)) {
      console.error("Webhook logical failure");
      return { ok: false };
    }
  } catch {
    /* plain-text OK */
  }
  return { ok: true };
}

async function deliverResend(payload) {
  const toList = SIGNUP_NOTIFY_TO.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: toList,
      subject: `[Syntrix signup] ${payload.email}`,
      text: signupTextBody(payload),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Resend HTTP", res.status);
    return { ok: false };
  }
  try {
    const data = JSON.parse(text);
    if (data.error) {
      console.error("Resend API error field present");
      return { ok: false };
    }
  } catch {
    /* ignore */
  }
  return { ok: true };
}

async function deliverAppsScript(payload) {
  const body = {
    ...(APPS_SCRIPT_SECRET ? { secret: APPS_SCRIPT_SECRET } : {}),
    ...payload,
  };
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("Apps Script non-JSON or parse error", res.status);
    return { ok: false };
  }
  if (!res.ok || jsonIndicatesFailure(data)) {
    console.error(
      "Apps Script delivery failed",
      res.status,
      (data && data.error) || ""
    );
    return { ok: false };
  }
  if (data.ok !== true) {
    console.error("Apps Script response missing ok:true");
    return { ok: false };
  }
  return { ok: true };
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: headers() };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const rawBody = event.body || "";
  if (typeof rawBody === "string" && Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return {
      statusCode: 413,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: "payload_too_large" }),
    };
  }

  const ip = clientIp(event);
  if (!rateLimitOk(ip)) {
    return {
      statusCode: 429,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: "rate_limited" }),
    };
  }

  const mode = deliveryMode();
  if (!mode) {
    return {
      statusCode: 503,
      headers: headers(),
      body: JSON.stringify({
        ok: false,
        error: "waitlist_not_configured",
        message:
          "Configure delivery environment variables on Netlify (see signup-notify source).",
      }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: "invalid_json" }),
    };
  }

  const email = String(body.email || "").trim().slice(0, 320);
  if (!email || !isValidEmail(email)) {
    return {
      statusCode: 400,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: "invalid_email" }),
    };
  }

  const name = body.name ? String(body.name).trim().slice(0, 200) : "";
  const phone = body.phone ? String(body.phone).trim().slice(0, 40) : "";
  const business_address = body.business_address
    ? String(body.business_address).trim().slice(0, 500)
    : "";
  const referral_source = body.referral_source
    ? String(body.referral_source).trim().slice(0, 200)
    : "";
  const source = body.source ? String(body.source).slice(0, 120) : "signup_page";
  const type = body.type ? String(body.type).slice(0, 80) : "waitlist";

  const payload = {
    email,
    name,
    phone,
    business_address,
    referral_source,
    source,
    type,
    ts: new Date().toISOString(),
  };

  try {
    let ok = false;
    if (mode === "scanner_ingest") {
      ok = (await deliverScanner(payload)).ok;
    } else if (mode === "webhook") {
      ok = (await deliverWebhook(payload)).ok;
    } else if (mode === "resend") {
      ok = (await deliverResend(payload)).ok;
    } else {
      ok = (await deliverAppsScript(payload)).ok;
    }

    if (!ok) {
      return {
        statusCode: 502,
        headers: headers(),
        body: JSON.stringify({
          ok: false,
          error: "delivery_failed",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: headers(),
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    console.error("signup-notify exception", e && e.message ? e.message : e);
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: "forward_failed" }),
    };
  }
};
