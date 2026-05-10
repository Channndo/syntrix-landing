/** Loads MIRA after DOM ready when mira-chat.js is present. */
(function () {
  function boot() {
    if (!window.MiraChat || typeof window.MiraChat.init !== 'function') return;
    window.MiraChat.init().catch(function () {});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
