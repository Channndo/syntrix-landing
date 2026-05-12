(() => {
  function apiBase() {
    return window.SyntrixApi ? window.SyntrixApi.apiBase() : (window.SYNTRIX_API_BASE || '').replace(/\/$/, '');
  }

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

  function passwordAuthEnabled() {
    return window.SYNTRIX_PASSWORD_AUTH === true || window.SYNTRIX_PASSWORD_AUTH === 'true';
  }

  function isAuth0Configured() {
    return Boolean(domain() && clientId() && window.auth0);
  }

  function isConfigured() {
    if (passwordAuthEnabled()) return true;
    return isAuth0Configured();
  }

  /** Returns an error message string if invalid, or null if OK (mirrors API rules). */
  function validatePasswordPolicy(password) {
    const p = password || '';
    if (p.length < 12) return 'Password must be at least 12 characters.';
    let hasLetter = false;
    let hasDigit = false;
    let hasSpecial = false;
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (/[a-zA-Z]/.test(c)) hasLetter = true;
      if (/[0-9]/.test(c)) hasDigit = true;
      if (/[^A-Za-z0-9\s]/.test(c)) hasSpecial = true;
    }
    if (!hasLetter) return 'Password must include at least one letter.';
    if (!hasDigit) return 'Password must include at least one number.';
    if (!hasSpecial) {
      return 'Password must include at least one special character (e.g. ! @ # $ % ^ & *).';
    }
    return null;
  }

  function decodeJwtPayload(token) {
    try {
      const part = token.split('.')[1];
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(b64);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  async function init() {
    if (passwordAuthEnabled()) {
      return;
    }
    if (!isAuth0Configured()) {
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
      useRefreshTokens: false,
    });

    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state')) {
      const appState = await auth0Client.handleRedirectCallback();
      cachedProfile = null;
      const returnTo = appState?.returnTo || `${window.location.origin}/index.html`;
      window.location.replace(returnTo);
      return;
    }
  }

  async function isAuthenticated() {
    if (window.SyntrixApi && window.SyntrixApi.getToken()) return true;
    if (!auth0Client) return false;
    return auth0Client.isAuthenticated();
  }

  function markJustSignedIn() {
    try {
      sessionStorage.setItem('syntrix_just_signed_in', '1');
    } catch (e) {}
  }

  function formatApiError(data) {
    const d = data && data.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
      return d.map((x) => (typeof x === 'string' ? x : x.msg || JSON.stringify(x))).join(' ');
    }
    return (data && data.message) || 'Request failed';
  }

  function passwordAuthDisabledHelp() {
    return (
      'Password sign-up is turned off on the scanner API. Set SYNTRIX_PASSWORD_AUTH=true and SYNTRIX_JWT_SECRET (min 32 characters) on the API host, save environment variables, redeploy the service (e.g. Render), then retry — or contact chandler@syntrix.solutions.'
    );
  }

  function signupEndpointNotFoundHelp() {
    const host = apiBase() || '(your API host)';
    return (
      'Sign-up endpoint was not found (HTTP 404). The scanner API may need a redeploy on Render, or the site may be pointing at the wrong API. ' +
      `Confirm POST /api/auth/password/register exists — open ${host}/docs in the browser.`
    );
  }

  function explainRegisterFailure(status, data) {
    const detail = formatApiError(data);
    if (status === 409) {
      if (/already registered|duplicate/i.test(detail)) {
        return 'An account with this email already exists. Try signing in instead.';
      }
      return detail || 'This email is already registered.';
    }
    if (status === 403) {
      if (/password authentication is disabled|disabled on this api/i.test(detail)) {
        return passwordAuthDisabledHelp();
      }
      return detail || passwordAuthDisabledHelp();
    }
    if (status === 404) {
      if (detail && detail !== 'Not Found') return detail;
      return signupEndpointNotFoundHelp();
    }
    return detail || 'Sign-up failed';
  }

  function ensurePasswordAuthFeature() {
    if (window.SYNTRIX_AUTH_ENABLED !== true) {
      throw new Error('Coming soon — early access only.');
    }
    if (!window.SyntrixApi) {
      throw new Error('API client not loaded; include assets/js/api.js before auth.js.');
    }
  }

  async function loginWithPassword(email, password) {
    ensurePasswordAuthFeature();
    const em = String(email || '')
      .trim()
      .toLowerCase();
    const body = { email: em, password };
    const dt = window.SyntrixApi.getDeviceTrustToken(em);
    if (dt) body.device_trust_token = dt;
    const { ok, status, data } = await window.SyntrixApi.apiPost('/api/auth/password/login', body, {
      skipAuth: true,
    });
    if (!ok) {
      const detail = formatApiError(data);
      if (status === 401 && /invalid credentials/i.test(detail)) {
        throw new Error('Email or password is incorrect.');
      }
      throw new Error(detail);
    }
    if (data.password_change_required && data.change_session_token) {
      try {
        sessionStorage.setItem('syntrix_pw_change_token', data.change_session_token);
        sessionStorage.setItem('syntrix_pw_change_reason', data.reason || '');
        sessionStorage.setItem('syntrix_pw_change_email', em);
      } catch (e) {}
      window.location.href = `${window.location.origin}/change-password.html`;
      return data;
    }
    if (data.requires_security_questions && data.challenge_token) {
      return data;
    }
    if (data.access_token) {
      window.SyntrixApi.setToken(data.access_token);
      markJustSignedIn();
    }
    cachedProfile = null;
    return data;
  }

  async function completeLoginSecurity(challengeToken, answer1, answer2, trustDevice, loginEmail) {
    ensurePasswordAuthFeature();
    const { ok, status, data } = await window.SyntrixApi.apiPost(
      '/api/auth/password/login/security',
      {
        challenge_token: challengeToken,
        answer1: answer1 || '',
        answer2: answer2 || '',
        trust_device: Boolean(trustDevice),
      },
      { skipAuth: true }
    );
    if (!ok) {
      const detail = formatApiError(data);
      if (status === 401 && /incorrect security/i.test(detail)) {
        throw new Error('Those answers do not match what we have on file.');
      }
      throw new Error(detail);
    }
    if (data.password_change_required && data.change_session_token) {
      try {
        sessionStorage.setItem('syntrix_pw_change_token', data.change_session_token);
        sessionStorage.setItem('syntrix_pw_change_reason', data.reason || '');
        const raw =
          (typeof loginEmail === 'string' && loginEmail) ||
          (document.getElementById('pw-login-email') &&
            document.getElementById('pw-login-email').value) ||
          '';
        sessionStorage.setItem('syntrix_pw_change_email', String(raw).trim().toLowerCase());
      } catch (e) {}
      window.location.href = `${window.location.origin}/change-password.html`;
      return data;
    }
    if (data.access_token) {
      window.SyntrixApi.setToken(data.access_token);
      markJustSignedIn();
    }
    if (trustDevice && data.device_trust_token && loginEmail) {
      window.SyntrixApi.setDeviceTrustToken(
        String(loginEmail).trim().toLowerCase(),
        data.device_trust_token
      );
    }
    cachedProfile = null;
    return data;
  }

  async function changePassword(currentPassword, newPassword) {
    ensurePasswordAuthFeature();
    let changeTok = null;
    try {
      changeTok = sessionStorage.getItem('syntrix_pw_change_token');
    } catch (e) {}
    const body = {
      current_password: currentPassword,
      new_password: newPassword,
    };
    if (changeTok) body.change_session_token = changeTok;
    const { ok, status, data } = await window.SyntrixApi.apiPost('/api/auth/password/change', body, {
      skipAuth: Boolean(changeTok),
    });
    if (!ok) {
      const detail = formatApiError(data);
      if (status === 400 && /password_reused|password reused/i.test(detail)) {
        throw new Error(
          'Choose a new password you have not used recently (last 24 passwords are remembered).'
        );
      }
      if (status === 401 && /incorrect current password/i.test(detail)) {
        throw new Error('Current password is incorrect.');
      }
      throw new Error(detail);
    }
    if (data.access_token) {
      window.SyntrixApi.setToken(data.access_token);
      markJustSignedIn();
    }
    try {
      sessionStorage.removeItem('syntrix_pw_change_token');
      sessionStorage.removeItem('syntrix_pw_change_reason');
      sessionStorage.removeItem('syntrix_pw_change_email');
    } catch (e) {}
    cachedProfile = null;
    return data;
  }

  async function registerWithPassword(email, password, firstName, lastName, security) {
    ensurePasswordAuthFeature();
    const body = {
      email,
      password,
      first_name: (firstName || '').trim(),
      last_name: (lastName || '').trim(),
      security_q1_id: security.security_q1_id,
      security_q2_id: security.security_q2_id,
      security_answer1: security.security_answer1,
      security_answer2: security.security_answer2,
    };
    const { ok, status, data } = await window.SyntrixApi.apiPost('/api/auth/password/register', body, {
      skipAuth: true,
    });
    if (!ok) throw new Error(explainRegisterFailure(status, data));
    if (data.access_token) {
      window.SyntrixApi.setToken(data.access_token);
      markJustSignedIn();
    }
    cachedProfile = null;
    return data;
  }

  async function getAccessToken() {
    const stored = window.SyntrixApi ? window.SyntrixApi.getToken() : null;
    if (stored) return stored;
    if (!auth0Client) throw new Error('Sign-in is not configured yet');
    const aud = audience();
    const opts = aud ? { authorizationParams: { audience: aud } } : {};
    return auth0Client.getTokenSilently(opts);
  }

  async function getProfile() {
    const stored = window.SyntrixApi ? window.SyntrixApi.getToken() : null;
    if (stored) {
      const p = decodeJwtPayload(stored);
      if (p && (p.email || p.sub)) {
        return { email: p.email, sub: p.sub, name: p.email };
      }
    }
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
    if (passwordAuthEnabled()) {
      throw new Error('Use the email and password fields on this page.');
    }
    if (!auth0Client) {
      throw new Error(
        'Sign-in is not configured yet. Set identity variables on the Netlify build, or paste domain and client ID in assets/js/auth-overlay.js'
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
    if (window.SyntrixApi) {
      window.SyntrixApi.clearToken();
      window.SyntrixApi.clearDeviceTrustTokens();
    }
    cachedProfile = null;
    if (auth0Client) {
      auth0Client.logout({
        logoutParams: { returnTo: `${window.location.origin}/index.html` },
      });
      return;
    }
    // Password JWT only: no Auth0 redirect — reload so nav / scan UI re-checks auth state.
    window.location.reload();
  }

  /** After 5 min idle, session-idle.js clears JWT only; refresh UI without wiping Remember-this-device. */
  function invalidateSessionForIdle() {
    cachedProfile = null;
    window.location.reload();
  }

  window.SyntrixAuth = {
    init,
    isConfigured,
    isAuth0Configured,
    passwordAuthEnabled,
    validatePasswordPolicy,
    loginWithPassword,
    completeLoginSecurity,
    changePassword,
    registerWithPassword,
    isAuthenticated,
    getAccessToken,
    getProfile,
    login,
    logout,
    invalidateSessionForIdle,
    apiBase,
  };
})();
