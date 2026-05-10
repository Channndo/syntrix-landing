/**
 * Password visibility toggles [data-password-toggle-for="inputId"].
 * Eye control appears only after the user types (password fields only).
 */
(function () {
  function wireToggle(btn, input, wrap) {
    function sync() {
      var has = (input.value || '').length > 0;
      if (wrap) wrap.classList.toggle('has-value', has);
      if (!has) {
        input.type = 'password';
        btn.classList.remove('is-visible');
        btn.setAttribute('aria-label', 'Show password');
      }
    }

    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    sync();

    btn.addEventListener('click', function () {
      if ((input.value || '').length === 0) return;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.classList.toggle('is-visible', show);
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }

  function wire() {
    document.querySelectorAll('[data-password-toggle-for]').forEach(function (btn) {
      var id = btn.getAttribute('data-password-toggle-for');
      var input = id && document.getElementById(id);
      if (!input) return;
      var wrap = input.closest('.auth-input-password-wrap');
      wireToggle(btn, input, wrap);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
