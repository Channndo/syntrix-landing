/**
 * Password-session idle timeout: after 5 minutes with no user activity, remove the access JWT only.
 * Device-trust tokens (Remember this device) stay in localStorage so sign-in with password stays quick.
 * Loaded after api.js + auth.js on authenticated app pages.
 */
(function () {
  var IDLE_MS = 5 * 60 * 1000;
  var THROTTLE_MS = 800;
  var timer = null;
  var lastThrottle = 0;

  function hasSession() {
    return window.SyntrixApi && window.SyntrixApi.getToken();
  }

  function clearIdleTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function armTimer() {
    clearIdleTimer();
    if (!hasSession()) return;
    timer = setTimeout(onIdle, IDLE_MS);
  }

  function onIdle() {
    timer = null;
    if (!hasSession()) return;
    window.SyntrixApi.clearToken();
    try {
      if (window.SyntrixAuth && typeof window.SyntrixAuth.invalidateSessionForIdle === 'function') {
        window.SyntrixAuth.invalidateSessionForIdle();
      } else {
        window.location.reload();
      }
    } catch (e) {
      window.location.reload();
    }
  }

  function onActivity() {
    if (!hasSession()) return;
    var now = Date.now();
    if (now - lastThrottle < THROTTLE_MS) return;
    lastThrottle = now;
    armTimer();
  }

  function start() {
    if (!hasSession()) return;
    var events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'wheel'];
    events.forEach(function (ev) {
      document.addEventListener(ev, onActivity, { passive: true, capture: true });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && hasSession()) armTimer();
    });
    armTimer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
