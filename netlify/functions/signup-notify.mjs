/**
 * Receives signup / waitlist submissions from the landing site and forwards them
 * to a Google Apps Script “Web app” URL (see scripts/google-apps-script-sample.txt).
 *
 * Netlify → Site settings → Environment variables:
 *   APPS_SCRIPT_URL   (required)   Web app URL from Apps Script deploy
 *   APPS_SCRIPT_SECRET (optional)  Must match EXPECTED_SECRET in the script
 *   SYNTRIX_ORIGIN     (optional)  Allowed CORS origin, default https://syntrix.solutions
 */
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET || "";
/** Use * so deploy previews / local still work unless you override SYNTRIX_ORIGIN. */
const ALLOW_ORIGIN = process.env.SYNTRIX_ORIGIN || "*";

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

  if (!APPS_SCRIPT_URL) {
    return {
      statusCode: 503,
      headers: headers(),
      body: JSON.stringify({
        ok: false,
        error: "waitlist_not_configured",
        message: "Server has not set APPS_SCRIPT_URL yet.",
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
    ...(APPS_SCRIPT_SECRET ? { secret: APPS_SCRIPT_SECRET } : {}),
    email,
    name,
    source,
    type,
    ts: new Date().toISOString(),
  };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "follow",
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("Apps Script response", res.status, text);
      return {
        statusCode: 502,
        headers: headers(),
        body: JSON.stringify({
          ok: false,
          error: "sheet_proxy_failed",
          status: res.status,
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
