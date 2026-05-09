/**
 * Optional local SPA identity overrides (runs AFTER auth-config.js from the build).
 *
 * Netlify CI may leave domain/client empty if env vars weren’t set. Fill the three
 * strings below and deploy — SPA client ID + issuer domain are fine to ship in the frontend
 * (never put a client secret here).
 *
 * From your hosted identity console (SPA / native app):
 *   - Issuer domain (“Domain” / authority URL host)
 *   - Client ID
 * Optional API identifier — same string as the scanner API expects for JWT audience (optional).
 *
 * Allowed callback URL MUST include exactly:
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
