(() => {
  function domain() {
    return (window.SYNTRIX_AUTH0_DOMAIN || '').trim();
  }
  function clientId() {
    return (window.SYNTRIX_AUTH0_CLIENT_ID || '').trim();
  }
  function audience() {
    return (window.SYNTRIX_AUTH0_AUDIENCE || '').trim();
  }

  /** One fixed callback URL — must match the SPA app’s allowed callback URLs exactly. */
  function redirectUri() {
    return `${window.location.origin}/auth-callback.html`;
  }

  let auth0Client = null;
  let cachedProfile = null;

  function isConfigured() {
    return Boolean(domain() && clientId() && window.auth0);
  }

  async function init() {
    if (!isConfigured()) {
      return;
    }

    const authParams = { redirect_uri: redirectUri() };
    const aud = audience();
    if (aud) {
      authParams.audience = aud;
    }

    auth0Client = await window.auth0.createAuth0Client({
      domain: domain(),
      clientId: clientId(),
      authorizationParams: authParams,
      cacheLocation: 'localstorage',
      // Set true only if the identity app has refresh tokens + rotation enabled
      useRefreshTokens: false,
    });

    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state')) {
      // SDK returns your appState object directly (not wrapped).
      const appState = await auth0Client.handleRedirectCallback();
      cachedProfile = null;
      const returnTo = appState?.returnTo || `${window.location.origin}/index.html`;
      window.location.replace(returnTo);
      return;
    }
  }

  async function isAuthenticated() {
    if (!auth0Client) return false;
    return auth0Client.isAuthenticated();
  }

  async function getAccessToken() {
    if (!auth0Client) throw new Error('Sign-in is not configured yet');
    const aud = audience();
    const opts = aud ? { authorizationParams: { audience: aud } } : {};
    return auth0Client.getTokenSilently(opts);
  }

  async function getProfile() {
    if (!auth0Client) return null;
    if (!cachedProfile) {
      const authed = await auth0Client.isAuthenticated();
      if (!authed) return null;
      cachedProfile = await auth0Client.getUser();
    }
    return cachedProfile;
  }

  /**
   * @param {'login'|'signup'} mode
   * @param {string} [returnTo] full URL to open after sign-in completes (default: current page)
   */
  async function login(mode, returnTo) {
    if (!auth0Client) {
      throw new Error(
        'Sign-in is not configured yet. Set identity variables on Netlify for the auth config build, or paste domain and client ID in assets/js/auth-overlay.js'
      );
    }
    const target =
      returnTo || `${window.location.origin}${window.location.pathname}${window.location.search}`;
    await auth0Client.loginWithRedirect({
      authorizationParams: {
        redirect_uri: redirectUri(),
        screen_hint: mode === 'signup' ? 'signup' : 'login',
      },
      appState: { returnTo: target },
    });
  }

  async function logout() {
    if (!auth0Client) return;
    cachedProfile = null;
    auth0Client.logout({
      logoutParams: { returnTo: `${window.location.origin}/index.html` },
    });
  }

  window.SyntrixAuth = {
    init,
    isConfigured,
    isAuthenticated,
    getAccessToken,
    getProfile,
    login,
    logout,
  };
})();
