(() => {
  const domain = window.SYNTRIX_AUTH0_DOMAIN || '';
  const clientId = window.SYNTRIX_AUTH0_CLIENT_ID || '';
  const audience = window.SYNTRIX_AUTH0_AUDIENCE || '';
  const redirectUri = window.location.origin + window.location.pathname;
  let auth0Client = null;
  let cachedProfile = null;

  async function init() {
    if (!window.auth0 || !domain || !clientId) return;
    auth0Client = await window.auth0.createAuth0Client({
      domain,
      clientId,
      authorizationParams: {
        audience,
        redirect_uri: redirectUri,
      },
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
    });

    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state')) {
      await auth0Client.handleRedirectCallback();
      params.delete('code');
      params.delete('state');
      params.delete('error');
      params.delete('error_description');
      const target = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
      window.history.replaceState({}, document.title, target);
    }
  }

  async function isAuthenticated() {
    if (!auth0Client) return false;
    return auth0Client.isAuthenticated();
  }

  async function getAccessToken() {
    if (!auth0Client) throw new Error('Auth0 is not configured');
    return auth0Client.getTokenSilently();
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

  async function login(mode) {
    if (!auth0Client) throw new Error('Auth0 is not configured');
    await auth0Client.loginWithRedirect({
      authorizationParams: {
        screen_hint: mode === 'signup' ? 'signup' : 'login',
      },
    });
  }

  async function logout() {
    if (!auth0Client) return;
    auth0Client.logout({
      logoutParams: { returnTo: window.location.origin + window.location.pathname },
    });
  }

  window.SyntrixAuth = {
    init,
    isAuthenticated,
    getAccessToken,
    getProfile,
    login,
    logout,
  };
})();
