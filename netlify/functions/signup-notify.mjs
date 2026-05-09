/**
 * Receives signup / waitlist POSTs from the landing site.
 *
 * First matching delivery wins:
 *
 * 0) Scanner API (SQLite waitlist_leads — no Google/Resend)
 *    WAITLIST_SCANNER_INGEST_URL  e.g. https://YOUR_API/api/public/waitlist
 *    WAITLIST_INGEST_SECRET       Bearer token — must equal scanner SYNTRIX_WAITLIST_INGEST_SECRET
 * 1) Webhook — SIGNUP_WEBHOOK_URL (+ optional SIGNUP_WEBHOOK_SECRET)
 * 2) Email — RESEND_* trio
 * 3) Legacy — APPS_SCRIPT_URL (full HTTPS URL) or bare Apps Script deployment token only
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

/**
 * Netlify UI sometimes rejects URL-shaped values; you can store only the middle segment
 * from .../macros/s/THIS_PART/exec
 */
function resolveAppsScriptEndpoint(raw) {
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w-]+$/.test(raw)) {
    return `https://script.google.com/macros/s/${raw}/exec`;
  }
  return raw;
}

const APPS_SCRIPT_URL = resolveAppsScriptEndpoint(APPS_SCRIPT_URL_RAW);

function headers(extra = {}) {
  return {
    "Content-Type": "application/json",
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
    console.error("Scanner waitlist ingest", res.status, text);
    return { ok: false };
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
  await res.text();
  if (!res.ok) return { ok: false };
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
  await res.text();
  if (!res.ok) return { ok: false };
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
  await res.text();
  if (!res.ok) return { ok: false };
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

  const mode = deliveryMode();
  if (!mode) {
    return {
      statusCode: 503,
      headers: headers(),
      body: JSON.stringify({
        ok: false,
        error: "waitlist_not_configured",
        message:
          "Configure WAITLIST_SCANNER_INGEST_URL + WAITLIST_INGEST_SECRET on Netlify " +
          "(matches scanner SYNTRIX_WAITLIST_INGEST_SECRET), or SIGNUP_WEBHOOK_URL / Resend / APPS_SCRIPT_URL.",
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
    console.error(e);
    return {
      statusCode: 500,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: "forward_failed" }),
    };
  }
};
