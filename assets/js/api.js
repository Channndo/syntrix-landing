/**
 * Shared browser client for api.syntrix.solutions — JSON, credentials omitted, Bearer JWT when set.
 */
(function () {
  var LEGACY_TOKEN_KEY = 'syntrix_access_token';
  var TOKEN_KEY = 'syntrix_jwt';
  /** Normalized email → device-trust JWT (skip security questions on this browser). */
  var DEVICE_TRUST_MAP_KEY = 'syntrix_device_trust_by_email';
  /** Netlify redirect proxy — must match netlify.toml `from` path (no trailing slash). */
  var SAME_ORIGIN_API_PROXY_PREFIX = '/scanner-api';

  /**
   * Use https://current-host/scanner-api/... so Netlify proxies to the scanner (see netlify.toml).
   * Covers localhost (netlify dev), syntrix.solutions (production), and *.netlify.app previews.
   */
  function useSameOriginApiProxy() {
    if (window.SYNTRIX_DISABLE_LOCAL_API_PROXY === true) return false;
    try {
      var h = (window.location.hostname || '').toLowerCase();
      if (h === 'localhost' || h === '127.0.0.1') return true;
      if (h === 'syntrix.solutions' || h === 'www.syntrix.solutions') return true;
      if (h.slice(-12) === '.netlify.app') return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function apiBase() {
    if (useSameOriginApiProxy()) {
      return String(window.location.origin + SAME_ORIGIN_API_PROXY_PREFIX).replace(/\/$/, '');
    }
    var raw = window.SYNTRIX_API_BASE || 'https://api.syntrix.solutions';
    return String(raw).replace(/\/$/, '');
  }

  function getToken() {
    var t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      var legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
      if (legacy) {
        localStorage.setItem(TOKEN_KEY, legacy);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
        t = legacy;
      }
    }
    return t;
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      clearToken();
    }
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }

  function getDeviceTrustToken(email) {
    var em = String(email || '')
      .trim()
      .toLowerCase();
    if (!em) return null;
    try {
      var raw = localStorage.getItem(DEVICE_TRUST_MAP_KEY);
      var map = raw ? JSON.parse(raw) : {};
      return map[em] || null;
    } catch (e) {
      return null;
    }
  }

  function setDeviceTrustToken(email, token) {
    var em = String(email || '')
      .trim()
      .toLowerCase();
    if (!em || !token) return;
    try {
      var raw = localStorage.getItem(DEVICE_TRUST_MAP_KEY);
      var map = raw ? JSON.parse(raw) : {};
      map[em] = token;
      localStorage.setItem(DEVICE_TRUST_MAP_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function clearDeviceTrustTokens() {
    localStorage.removeItem(DEVICE_TRUST_MAP_KEY);
  }

  /**
   * @param {string} path absolute path on API host (e.g. /api/auth/password/login)
   * @param {object} [body] JSON-serializable body; omit for no body
   * @param {{ skipAuth?: boolean, headers?: Record<string,string> }} [opts]
   */
  async function apiPost(path, body, opts) {
    opts = opts || {};
    var url = apiBase() + (path.charAt(0) === '/' ? path : '/' + path);
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (!opts.skipAuth) {
      var tok = getToken();
      if (tok) headers.Authorization = 'Bearer ' + tok;
    }
    var init = {
      method: 'POST',
      credentials: 'omit',
      headers: headers,
    };
    if (body !== undefined && body !== null) {
      init.body = JSON.stringify(body);
    }
    var r = await fetch(url, init);
    var data = await r.json().catch(function () {
      return {};
    });
    return { ok: r.ok, status: r.status, data: data };
  }

  /**
   * @param {string} path
   * @param {{ skipAuth?: boolean, headers?: Record<string,string> }} [opts]
   */
  async function apiGet(path, opts) {
    opts = opts || {};
    var url = apiBase() + (path.charAt(0) === '/' ? path : '/' + path);
    var headers = Object.assign({}, opts.headers || {});
    if (!opts.skipAuth) {
      var tok = getToken();
      if (tok) headers.Authorization = 'Bearer ' + tok;
    }
    var r = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      headers: headers,
    });
    var data = await r.json().catch(function () {
      return {};
    });
    return { ok: r.ok, status: r.status, data: data };
  }

  /**
   * @param {string} path
   * @param {object} body JSON-serializable
   * @param {{ skipAuth?: boolean, headers?: Record<string,string> }} [opts]
   */
  async function apiPatch(path, body, opts) {
    opts = opts || {};
    var url = apiBase() + (path.charAt(0) === '/' ? path : '/' + path);
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (!opts.skipAuth) {
      var tok = getToken();
      if (tok) headers.Authorization = 'Bearer ' + tok;
    }
    var r = await fetch(url, {
      method: 'PATCH',
      credentials: 'omit',
      headers: headers,
      body: JSON.stringify(body),
    });
    var data = await r.json().catch(function () {
      return {};
    });
    return { ok: r.ok, status: r.status, data: data };
  }

  /**
   * multipart/form-data POST (omit Content-Type so the browser sets the boundary)
   * @param {string} path
   * @param {FormData} formData
   * @param {{ skipAuth?: boolean, headers?: Record<string,string> }} [opts]
   */
  async function apiPostForm(path, formData, opts) {
    opts = opts || {};
    var url = apiBase() + (path.charAt(0) === '/' ? path : '/' + path);
    var headers = Object.assign({}, opts.headers || {});
    if (!opts.skipAuth) {
      var tok = getToken();
      if (tok) headers.Authorization = 'Bearer ' + tok;
    }
    var r = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      headers: headers,
      body: formData,
    });
    var data = await r.json().catch(function () {
      return {};
    });
    return { ok: r.ok, status: r.status, data: data };
  }

  /**
   * Raw fetch with optional Bearer token (e.g. binary avatar GET).
   * @param {string} path
   * @param {RequestInit} [init]
   */
  function apiAuthorizedFetch(path, init) {
    init = init || {};
    var url = apiBase() + (path.charAt(0) === '/' ? path : '/' + path);
    var headers = new Headers(init.headers || {});
    if (!init.skipAuth) {
      var tok = getToken();
      if (tok) headers.set('Authorization', 'Bearer ' + tok);
    }
    return fetch(url, Object.assign({}, init, { credentials: 'omit', headers: headers }));
  }

  window.SyntrixApi = {
    apiBase: apiBase,
    apiPost: apiPost,
    apiGet: apiGet,
    apiPatch: apiPatch,
    apiPostForm: apiPostForm,
    apiAuthorizedFetch: apiAuthorizedFetch,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    getDeviceTrustToken: getDeviceTrustToken,
    setDeviceTrustToken: setDeviceTrustToken,
    clearDeviceTrustTokens: clearDeviceTrustTokens,
  };
})();
