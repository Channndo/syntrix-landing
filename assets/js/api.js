/**
 * Shared browser client for api.syntrix.solutions — JSON, credentials omitted, Bearer JWT when set.
 */
(function () {
  var LEGACY_TOKEN_KEY = 'syntrix_access_token';
  var TOKEN_KEY = 'syntrix_jwt';

  function apiBase() {
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

  window.SyntrixApi = {
    apiBase: apiBase,
    apiPost: apiPost,
    apiGet: apiGet,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
  };
})();
