/**
 * MIRA — in-app cybersecurity assistant (Ollama via Syntrix API).
 * Docked launcher + floating FAB + panel (chat-tool style).
 */
(function () {
  var LS_TOUR = 'syntrix_mira_tour_choice';
  var SS_JUST = 'syntrix_just_signed_in';

  var TOUR_TEXT =
    "Welcome to Syntrix — here's the quick tour:\n\n" +
    '1. **Home** — Enter an MCP or agent URL and run a scan; watch progress and read findings in plain language.\n' +
    '2. **Account** — Profile, avatar, and session settings.\n' +
    '3. **Billing** — Subscribe to Pro or Team when you are ready (Stripe Checkout).\n\n' +
    "I'm here anytime to explain **severity levels**, what a finding means, or how to fix it — ask me anything.";

  var QUICK_PROMPTS = [
    { label: 'What do severity levels mean?', prompt: 'Explain Syntrix scan severity levels (critical, high, medium, low) in plain language.' },
    { label: 'How should I read a finding?', prompt: 'How should I interpret and prioritize a Syntrix security finding?' },
    { label: 'Prompt injection basics', prompt: 'What is prompt injection on an MCP or agent endpoint, and how does Syntrix detect it?' },
  ];

  var state = {
    open: false,
    messages: [],
    loading: false,
    /** HTTP completed (no thrown fetch). */
    statusResponded: false,
    /** status endpoint returned 2xx. */
    statusHttpOk: false,
    /** Server reports MIRA on (only meaningful if statusHttpOk). */
    miraEnabled: false,
    uiBuilt: false,
    started: false,
    suggestionsHidden: false,
  };

  function apiBase() {
    return window.SyntrixApi ? window.SyntrixApi.apiBase() : '';
  }

  function hasToken() {
    return !!(window.SyntrixApi && window.SyntrixApi.getToken());
  }

  async function fetchStatus() {
    var base = apiBase();
    if (!base) {
      return { responded: false, httpOk: false, enabled: false };
    }
    try {
      var r = await fetch(base + '/api/mira/status', { credentials: 'omit' });
      var d = await r.json().catch(function () {
        return {};
      });
      return {
        responded: true,
        httpOk: r.ok,
        enabled: !!(r.ok && d.enabled),
      };
    } catch (e) {
      return { responded: false, httpOk: false, enabled: false };
    }
  }

  function miraChatAllowed() {
    return state.statusResponded && state.statusHttpOk && state.miraEnabled;
  }

  function getUnavailableMsg() {
    if (!state.statusResponded) {
      return (
        'Cannot reach the scanner API. Deploy the latest `landing/` to Netlify so /scanner-api proxies to the scanner, then hard-refresh. For local dev run `netlify dev` from the landing folder. ' +
        'You can disable the proxy with SYNTRIX_DISABLE_LOCAL_API_PROXY in config.js if the API allows this origin in CORS.'
      );
    }
    if (!state.statusHttpOk) {
      return (
        'The API did not return MIRA status. Deploy an updated scanner so GET /api/mira/status exists on api.syntrix.solutions ' +
        'and set SYNTRIX_MIRA_ENABLED. The landing site proxies /scanner-api to that API (see netlify.toml).'
      );
    }
    return 'MIRA is disabled on this API (SYNTRIX_MIRA_ENABLED).';
  }

  function updateDisclaimer() {
    var el = document.querySelector('.mira-disclaimer');
    if (!el) return;
    el.classList.remove('mira-disclaimer--warn');
    if (!miraChatAllowed()) {
      el.textContent = getUnavailableMsg();
      el.classList.add('mira-disclaimer--warn');
    } else {
      el.textContent =
        'AI-generated answers for cybersecurity guidance. Verify before acting on critical decisions.';
    }
  }

  function syncComposerAvailability() {
    var allowed = miraChatAllowed();
    var ta = document.querySelector('.mira-composer textarea');
    var sendBtn = document.querySelector('.mira-send');
    var busy = !!state.loading;
    if (ta) {
      ta.disabled = !allowed || busy;
      ta.placeholder = allowed
        ? 'Ask MIRA about scans, findings, or how to fix issues…'
        : 'MIRA unavailable until the API reports ready…';
    }
    if (sendBtn) sendBtn.disabled = !allowed || busy;
    document.querySelectorAll('.mira-chip').forEach(function (c) {
      var off = !allowed || busy;
      c.disabled = off;
      c.classList.toggle('mira-chip--disabled', off);
    });
  }

  function hideSuggestionsRow() {
    if (state.suggestionsHidden) return;
    state.suggestionsHidden = true;
    var row = document.querySelector('.mira-suggestions');
    if (row) row.setAttribute('hidden', '');
  }

  function setLauncherVisible(on) {
    var el = document.querySelector('.mira-launcher');
    if (el) el.hidden = !on;
  }

  function appendMsg(role, text, extraClass) {
    var wrap = document.querySelector('.mira-messages');
    if (!wrap) return;
    var div = document.createElement('div');
    div.className = 'mira-msg mira-msg-' + role + (extraClass ? ' ' + extraClass : '');
    div.textContent = text;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
  }

  function setTyping(on) {
    var el = document.querySelector('.mira-typing');
    if (el) el.textContent = on ? 'MIRA is thinking…' : '';
  }

  async function sendChatWithText(text) {
    var trimmed = (text || '').trim();
    if (!trimmed || state.loading) return;

    if (!miraChatAllowed()) {
      appendMsg('error', getUnavailableMsg(), 'mira-msg-error');
      return;
    }

    if (!hasToken()) {
      appendMsg('error', 'Sign in to chat with MIRA.', 'mira-msg-error');
      return;
    }

    hideSuggestionsRow();

    appendMsg('user', trimmed);
    state.messages.push({ role: 'user', content: trimmed });

    state.loading = true;
    setTyping(true);
    syncComposerAvailability();

    try {
      var res = await window.SyntrixApi.apiPost(
        '/api/mira/chat',
        { messages: state.messages },
        {}
      );
      if (!res.ok) {
        var detail =
          res.data && res.data.detail
            ? typeof res.data.detail === 'string'
              ? res.data.detail
              : JSON.stringify(res.data.detail)
            : 'Could not reach MIRA.';
        appendMsg('assistant', detail, 'mira-msg-error');
        state.messages.pop();
        return;
      }
      var reply = (res.data && res.data.message) || '';
      if (reply) {
        state.messages.push({ role: 'assistant', content: reply });
        appendMsg('assistant', reply);
      }
    } catch (e) {
      appendMsg('assistant', e.message || String(e), 'mira-msg-error');
      state.messages.pop();
    } finally {
      state.loading = false;
      setTyping(false);
      syncComposerAvailability();
    }
  }

  async function sendChat() {
    var ta = document.querySelector('.mira-composer textarea');
    if (!ta || state.loading) return;
    var text = (ta.value || '').trim();
    if (!text) return;
    ta.value = '';
    await sendChatWithText(text);
  }

  function togglePanel() {
    var panel = document.querySelector('.mira-panel');
    var launcher = document.querySelector('.mira-launcher');
    if (!panel) return;
    state.open = !state.open;
    panel.hidden = !state.open;
    if (launcher) launcher.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    setLauncherVisible(!state.open);
    if (state.open) {
      var ta = document.querySelector('.mira-composer textarea');
      if (ta) setTimeout(function () { ta.focus(); }, 150);
    }
  }

  function openPanel() {
    var panel = document.querySelector('.mira-panel');
    var launcher = document.querySelector('.mira-launcher');
    if (!panel) return;
    state.open = true;
    panel.hidden = false;
    if (launcher) launcher.setAttribute('aria-expanded', 'true');
    setLauncherVisible(false);
    var ta = document.querySelector('.mira-composer textarea');
    if (ta) setTimeout(function () { ta.focus(); }, 100);
  }

  function buildPanelMarkup() {
    var chips = QUICK_PROMPTS.map(function (q) {
      return (
        '<button type="button" class="mira-chip" data-prompt="' +
        String(q.prompt).replace(/"/g, '&quot;') +
        '">' +
        escapeHtml(q.label) +
        '</button>'
      );
    }).join('');

    return (
      '<div class="mira-panel-header">' +
      '<div class="mira-panel-brand">' +
      '<img src="assets/mira-logo.svg" alt="" width="36" height="36" />' +
      '<div class="mira-panel-titles">' +
      '<div class="mira-panel-name-row">' +
      '<span class="mira-panel-name">MIRA</span>' +
      '<span class="mira-badge">AI</span>' +
      '</div>' +
      '<span class="mira-panel-sub">Machine Intelligence &amp; Risk Advisor</span>' +
      '</div></div>' +
      '<button type="button" class="mira-panel-close" aria-label="Close chat">&times;</button>' +
      '</div>' +
      '<p class="mira-disclaimer">AI-generated answers for cybersecurity guidance. Verify before acting on critical decisions.</p>' +
      '<div class="mira-suggestions">' +
      '<span class="mira-suggestions-label">Try asking</span>' +
      '<div class="mira-chip-row">' + chips + '</div>' +
      '</div>' +
      '<div class="mira-messages" role="log" aria-live="polite"></div>' +
      '<div class="mira-typing" aria-live="polite"></div>' +
      '<div class="mira-composer">' +
      '<label class="mira-sr-only" for="mira-composer-input">Message MIRA</label>' +
      '<textarea id="mira-composer-input" rows="2" placeholder="Ask MIRA about scans, findings, or how to fix issues…" maxlength="8000"></textarea>' +
      '<button type="button" class="mira-send" aria-label="Send message">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '</button></div>'
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function wireChips(panel) {
    panel.querySelectorAll('.mira-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var prompt = btn.getAttribute('data-prompt') || '';
        sendChatWithText(prompt);
      });
    });
  }

  function buildUI() {
    if (state.uiBuilt) return;
    state.uiBuilt = true;

    var dock = document.createElement('div');
    dock.className = 'mira-dock';
    dock.setAttribute('data-mira-dock', '');

    var launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'mira-launcher';
    launcher.setAttribute('aria-label', 'Open MIRA security assistant');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.innerHTML =
      '<span class="mira-launcher-inner">' +
      '<span class="mira-launcher-copy">' +
      '<strong>MIRA</strong>' +
      '<span class="mira-launcher-desc">Security assistant · ask in plain language</span>' +
      '</span>' +
      '<span class="mira-launcher-icon-wrap">' +
      '<img src="assets/mira-logo.svg" alt="" width="34" height="34" />' +
      '</span>' +
      '</span>';

    var panel = document.createElement('div');
    panel.className = 'mira-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'MIRA chat');
    panel.innerHTML = buildPanelMarkup();

    dock.appendChild(launcher);
    document.body.appendChild(dock);
    document.body.appendChild(panel);

    launcher.addEventListener('mouseenter', function () {
      launcher.classList.add('mira-launcher--hover');
    });
    launcher.addEventListener('mouseleave', function () {
      launcher.classList.remove('mira-launcher--hover');
    });

    launcher.addEventListener('click', function () {
      togglePanel();
    });

    panel.querySelector('.mira-panel-close').addEventListener('click', function () {
      togglePanel();
    });
    wireChips(panel);
    panel.querySelector('.mira-send').addEventListener('click', sendChat);
    panel.querySelector('.mira-composer textarea').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.open) {
        e.preventDefault();
        togglePanel();
      }
    });

    if (!miraChatAllowed()) {
      appendMsg('assistant', getUnavailableMsg());
    } else if (!hasToken()) {
      appendMsg(
        'assistant',
        'Hi — sign in to chat with MIRA. I explain vulnerabilities, severities, and scan results in plain English.'
      );
    } else {
      appendMsg(
        'assistant',
        "Hi — I'm MIRA. Ask about findings, threat modeling, or how to remediate what Syntrix reports."
      );
    }
  }

  function injectTourMessage() {
    state.messages = [];
    var wrap = document.querySelector('.mira-messages');
    if (wrap) wrap.innerHTML = '';
    state.messages.push({ role: 'assistant', content: TOUR_TEXT });
    appendMsg('assistant', TOUR_TEXT);
    openPanel();
  }

  function showTourOffer() {
    try {
      if (localStorage.getItem(LS_TOUR)) return;
      if (sessionStorage.getItem(SS_JUST) !== '1') return;
      if (!hasToken()) return;
    } catch (e) {
      return;
    }

    sessionStorage.removeItem(SS_JUST);

    var overlay = document.createElement('div');
    overlay.className = 'mira-tour-overlay';
    overlay.innerHTML =
      '<div class="mira-tour-card">' +
      '<h3>Meet MIRA</h3>' +
      '<p>Would you like a quick walkthrough of Syntrix? I can explain Home, Account, and Billing — and I\'m always here for security questions in plain language.</p>' +
      '<div class="mira-tour-actions">' +
      '<button type="button" class="mira-tour-primary" id="mira-tour-yes">Start the tour</button>' +
      '<button type="button" class="mira-tour-secondary" id="mira-tour-no">Not now</button>' +
      '</div></div>';

    document.body.appendChild(overlay);

    overlay.querySelector('#mira-tour-yes').addEventListener('click', function () {
      try {
        localStorage.setItem(LS_TOUR, 'accepted');
      } catch (e) {}
      overlay.remove();
      buildUI();
      injectTourMessage();
    });
    overlay.querySelector('#mira-tour-no').addEventListener('click', function () {
      try {
        localStorage.setItem(LS_TOUR, 'dismissed');
      } catch (e) {}
      overlay.remove();
    });
  }

  async function init() {
    if (state.started) return;
    state.started = true;

    var st = await fetchStatus();
    state.statusResponded = st.responded;
    state.statusHttpOk = st.httpOk;
    state.miraEnabled = st.enabled;

    buildUI();
    updateDisclaimer();
    syncComposerAvailability();

    if (hasToken() && miraChatAllowed()) {
      showTourOffer();
    }
  }

  window.MiraChat = { init: init, openPanel: openPanel };
})();
