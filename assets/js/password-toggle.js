/**
 * Wire buttons [data-password-toggle-for="inputId"] to toggle input type password/text.
 */
(function () {
  function wire() {
    document.querySelectorAll('[data-password-toggle-for]').forEach(function (btn) {
      var id = btn.getAttribute('data-password-toggle-for');
      var input = id && document.getElementById(id);
      if (!input) return;
      btn.addEventListener('click', function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.classList.toggle('is-visible', show);
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
