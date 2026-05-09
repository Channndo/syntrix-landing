/**
 * Emergency / local Auth0 wiring (runs AFTER auth-config.js from the build).
 *
 * Netlify CI may leave domain/client empty if env vars weren’t set. Fill the three
 * strings below and deploy — SPA Client ID + Auth0 Domain are fine to ship in frontend
 * (never put an Application Client Secret here).
 *
 * Auth0 Dashboard → Applications → SPA app:
 *   - Domain → Settings (“Domain”)
 *   - Client ID
 * APIs → Identifier → same string as AUTH0_AUDIENCE on your Render scanner API (optional).
 *
 * Allowed Callback URL MUST include exactly:
 *   https://YOUR_DOMAIN/auth-callback.html
 */
(function () {
  var DOMAIN = '';
  var CLIENT_ID = '';
  var AUDIENCE = '';

  function t(s) {
    return (s || '').trim();
  }
  var d = t(DOMAIN);
  var c = t(CLIENT_ID);
  var a = t(AUDIENCE);
  if (d) window.SYNTRIX_AUTH0_DOMAIN = d;
  if (c) window.SYNTRIX_AUTH0_CLIENT_ID = c;
  if (a) window.SYNTRIX_AUTH0_AUDIENCE = a;
})();
