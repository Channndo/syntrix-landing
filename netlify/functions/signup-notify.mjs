/**
 * Receives signup / waitlist POSTs from the landing site and delivers them without
 * requiring Google Apps Script.
 *
 * Configure ONE delivery path (first match wins):
 *
 * 1) Webhook — set SIGNUP_WEBHOOK_URL (+ optional SIGNUP_WEBHOOK_SECRET header value)
 * 2) Email via Resend — RESEND_API_KEY, SIGNUP_NOTIFY_TO, RESEND_FROM
 * 3) Legacy — APPS_SCRIPT_URL (+ optional APPS_SCRIPT_SECRET in JSON body)
 *
 * Netlify → Site settings → Environment variables.
 * Optional: SYNTRIX_ORIGIN for CORS (default *).
 */

const ALLOW_ORIGIN = process.env.SYNTRIX_ORIGIN || "*";

const SIGNUP_WEBHOOK_URL = (process.env.SIGNUP_WEBHOOK_URL || "").trim();
const SIGNUP_WEBHOOK_SECRET = (process.env.SIGNUP_WEBHOOK_SECRET || "").trim();

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const SIGNUP_NOTIFY_TO = (process.env.SIGNUP_NOTIFY_TO || "").trim();
const RESEND_FROM = (process.env.RESEND_FROM || "").trim();

const APPS_SCRIPT_URL = (process.env.APPS_SCRIPT_URL || "").trim();
const APPS_SCRIPT_SECRET = (process.env.APPS_SCRIPT_SECRET || "").trim();

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
    `Name: ${payload.name || "(none)"}`,
    `Source: ${payload.source || ""}`,
    `Type: ${payload.type || ""}`,
    `Time: ${payload.ts}`,
  ].join("\n");
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
    console.error("Webhook response", res.status, text);
    return { ok: false };
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
    console.error("Resend response", res.status, text);
    return { ok: false };
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
  if (!res.ok) {
    console.error("Apps Script response", res.status, text);
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

  const mode = deliveryMode();
  if (!mode) {
    return {
      statusCode: 503,
      headers: headers(),
      body: JSON.stringify({
        ok: false,
        error: "waitlist_not_configured",
        message:
          "Set SIGNUP_WEBHOOK_URL, or Resend (RESEND_API_KEY + SIGNUP_NOTIFY_TO + RESEND_FROM), or legacy APPS_SCRIPT_URL.",
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

  const email = String(body.email || "")
    .trim()
    .slice(0, 320);
  if (!email || !isValidEmail(email)) {
    return {
      statusCode: 400,
      headers: headers(),
      body: JSON.stringify({ ok: false, error: "invalid_email" }),
    };
  }

  const name = body.name ? String(body.name).trim().slice(0, 200) : "";
  const source = body.source ? String(body.source).slice(0, 120) : "signup_page";
  const type = body.type ? String(body.type).slice(0, 80) : "waitlist";

  const payload = {
    email,
    name,
    source,
    type,
    ts: new Date().toISOString(),
  };

  try {
    let ok = false;
    if (mode === "webhook") {
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
