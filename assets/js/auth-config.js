/**
 * Auth0 SPA settings — required for login and sign-up.
 *
 * 1. Auth0 Dashboard → Applications → Create Application → Single Page Application
 * 2. Settings → Allowed Callback URLs:
 *      https://syntrix.solutions/auth-callback.html
 *      http://localhost:8888/auth-callback.html   (if you test locally)
 * 3. Allowed Logout URLs: https://syntrix.solutions, http://localhost:8888
 * 4. Allowed Web Origins: https://syntrix.solutions, http://localhost:8888
 * 5. APIs → Create API (if you use an audience for the scanner API) — use the same
 *    identifier here as AUTH0_AUDIENCE on Render.
 *
 * Paste your values below, commit, and redeploy the landing site.
 */
window.SYNTRIX_AUTH0_DOMAIN = '';
window.SYNTRIX_AUTH0_CLIENT_ID = '';
/** API Identifier from Auth0 → APIs (same as backend AUTH0_AUDIENCE). Leave '' only for login-only tests. */
window.SYNTRIX_AUTH0_AUDIENCE = '';
