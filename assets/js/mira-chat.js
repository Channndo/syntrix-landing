/**
 * MIRA — the floating security assistant on syntrix.solutions.
 *
 * I keep this file boring on purpose: one widget, one API shape, no framework roulette.
 * Flow: status ping → if enabled, mount launcher + panel; attachments become JSON on send.
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
    { label: 'Exec summary from screenshots', prompt: 'I attached screenshots of security findings. Please give a concise executive summary for leadership: overall risk in one short paragraph, then the top issues by severity, business impact in plain language, and prioritized next steps. Note anything you cannot read clearly.' },
  ];

  /** @type {{ filename: string, mime_type: string, encoding: string, data: string }[]} */
  var pendingAttachments = [];

  var MIRA_MAX_FILES = 10;
  var MIRA_MAX_FILE_BYTES = 4 * 1024 * 1024;

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

  /** Never block MIRA launcher forever on a hung /api/mira/status request */
  function fetchStatusWithTimeout(ms) {
    var cap = typeof ms === 'number' && ms > 0 ? ms : 12000;
    return Promise.race([
      fetchStatus(),
      new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ responded: false, httpOk: false, enabled: false });
        }, cap);
      }),
    ]);
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
    var attachBtn = document.querySelector('.mira-attach-btn');
    var busy = !!state.loading;
    if (ta) {
      ta.disabled = !allowed || busy;
      ta.placeholder = allowed
        ? 'Ask MIRA about scans, findings, or how to fix issues…'
        : 'MIRA unavailable until the API reports ready…';
    }
    if (sendBtn) sendBtn.disabled = !allowed || busy;
    if (attachBtn) attachBtn.disabled = !allowed || busy;
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

  /** One bubble per uploaded file — separate from the text message so images read clearly in-thread. */
  function appendUserAttachmentBubble(att) {
    var wrap = document.querySelector('.mira-messages');
    if (!wrap || !att) return;
    var div = document.createElement('div');
    div.className = 'mira-msg mira-msg-user mira-msg-attach';
    var mime = String(att.mime_type || '');
    if (mime.indexOf('image/') === 0 && att.encoding === 'base64' && att.data) {
      var img = document.createElement('img');
      img.className = 'mira-attach-preview';
      img.alt = att.filename || 'Attached image';
      img.loading = 'lazy';
      img.src = 'data:' + mime + ';base64,' + att.data;
      div.appendChild(img);
      var cap = document.createElement('div');
      cap.className = 'mira-attach-caption';
      cap.textContent = att.filename || '';
      div.appendChild(cap);
    } else {
      var label = document.createElement('div');
      label.className = 'mira-attach-file-label';
      label.textContent = att.filename || 'Attached file';
      div.appendChild(label);
    }
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
  }

  function setTyping(on) {
    var el = document.querySelector('.mira-typing');
    if (el) el.textContent = on ? 'MIRA is thinking…' : '';
  }

  function guessMimeFromName(name) {
    var n = String(name || '').toLowerCase();
    if (n.endsWith('.pdf')) return 'application/pdf';
    if (n.endsWith('.md') || n.endsWith('.markdown')) return 'text/markdown';
    if (n.endsWith('.json')) return 'application/json';
    if (n.endsWith('.csv')) return 'text/csv';
    if (n.endsWith('.xml')) return 'text/xml';
    if (n.endsWith('.yaml') || n.endsWith('.yml')) return 'text/yaml';
    if (n.endsWith('.txt') || n.endsWith('.log') || n.endsWith('.env')) return 'text/plain';
    return '';
  }

  function isTextLikeFile(mime, filename) {
    var m = String(mime || '').toLowerCase();
    if (m.startsWith('text/')) return true;
    if (
      m === 'application/json' ||
      m === 'application/xml' ||
      m === 'application/x-yaml' ||
      m === 'text/yaml' ||
      m === 'application/yaml'
    )
      return true;
    return !!guessMimeFromName(filename);
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunk = 0x8000;
    var binary = '';
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function readFileAsUtf8(file, maxChars) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var t = String(reader.result || '');
        if (t.length > maxChars) t = t.slice(0, maxChars) + '\n[…truncated locally…]';
        resolve(t);
      };
      reader.onerror = function () {
        reject(new Error('Could not read file.'));
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ''));
      };
      reader.onerror = function () {
        reject(new Error('Could not read file.'));
      };
      reader.readAsDataURL(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error('Could not read file.'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * @returns {Promise<{ filename: string, mime_type: string, encoding: string, data: string }>}
   */
  async function fileToAttachment(file) {
    var name = file.name || 'file';
    var mime = (file.type || '').trim() || guessMimeFromName(name);
    if (file.size > MIRA_MAX_FILE_BYTES) {
      throw new Error(name + ' is larger than 4MB.');
    }
    if (mime.indexOf('image/') === 0) {
      var dataUrl = await readFileAsDataURL(file);
      var comma = dataUrl.indexOf(',');
      var b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      return {
        filename: name,
        mime_type: mime || 'image/png',
        encoding: 'base64',
        data: b64,
      };
    }
    if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
      var buf = await readFileAsArrayBuffer(file);
      return {
        filename: name,
        mime_type: 'application/pdf',
        encoding: 'base64',
        data: arrayBufferToBase64(buf),
      };
    }
    if (isTextLikeFile(mime, name)) {
      var text = await readFileAsUtf8(file, 120000);
      return {
        filename: name,
        mime_type: mime || guessMimeFromName(name) || 'text/plain',
        encoding: 'utf8',
        data: text,
      };
    }
    throw new Error(
      'Unsupported type for "' +
        name +
        '". Use an image, PDF, or text file (txt, md, json, csv, yaml, xml, log).'
    );
  }

  function renderPendingFiles() {
    var row = document.querySelector('.mira-pending-files');
    if (!row) return;
    if (!pendingAttachments.length) {
      row.innerHTML = '';
      row.hidden = true;
      return;
    }
    row.hidden = false;
    row.innerHTML = pendingAttachments
      .map(function (a, idx) {
        return (
          '<span class="mira-file-chip">' +
          escapeHtml(a.filename) +
          '<button type="button" class="mira-file-chip-remove" data-idx="' +
          idx +
          '" aria-label="Remove file">&times;</button></span>'
        );
      })
      .join('');
    row.querySelectorAll('.mira-file-chip-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ix = parseInt(btn.getAttribute('data-idx'), 10);
        if (!isNaN(ix)) {
          pendingAttachments.splice(ix, 1);
          renderPendingFiles();
        }
      });
    });
  }

  async function onMiraFileInputChange(ev) {
    var input = ev.target;
    var files = input.files;
    if (!files || !files.length) return;
    var errs = [];
    for (var i = 0; i < files.length; i++) {
      if (pendingAttachments.length >= MIRA_MAX_FILES) {
        errs.push('Maximum ' + MIRA_MAX_FILES + ' attachments per message.');
        break;
      }
      try {
        pendingAttachments.push(await fileToAttachment(files[i]));
      } catch (e) {
        errs.push(files[i].name + ': ' + (e.message || String(e)));
      }
    }
    input.value = '';
    renderPendingFiles();
    if (errs.length) {
      appendMsg('error', errs.join('\n'), 'mira-msg-error');
    }
  }

  async function sendChatWithText(text) {
    var trimmed = (text || '').trim();
    var hasFiles = pendingAttachments.length > 0;
    if ((!trimmed && !hasFiles) || state.loading) return;

    if (!miraChatAllowed()) {
      appendMsg('error', getUnavailableMsg(), 'mira-msg-error');
      return;
    }

    hideSuggestionsRow();

    var userContent =
      trimmed ||
      (hasFiles
        ? 'Please analyze the attached file(s). Focus on anything security-relevant or actionable.'
        : '');

    var snapshot = pendingAttachments.map(function (a) {
      return {
        filename: a.filename,
        mime_type: a.mime_type,
        encoding: a.encoding,
        data: a.data,
      };
    });

    if (trimmed) {
      appendMsg('user', trimmed);
    }
    if (hasFiles) {
      snapshot.forEach(function (a) {
        appendUserAttachmentBubble(a);
      });
    }

    state.messages.push({ role: 'user', content: userContent });

    state.loading = true;
    setTyping(true);
    syncComposerAvailability();

    try {
      var body = { messages: state.messages };
      if (snapshot.length) body.attachments = snapshot;

      var res = await window.SyntrixApi.apiPost('/api/mira/chat', body, {});
      if (!res.ok) {
        appendMsg('assistant', formatMiraChatError(res), 'mira-msg-error');
        state.messages.pop();
        return;
      }
      pendingAttachments = [];
      renderPendingFiles();
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
    if (!text && !pendingAttachments.length) return;
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
      '<span class="mira-panel-sub">Machine Intelligence &amp; Risk Advisor · Mindroot cognitive layer</span>' +
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
      '<div class="mira-attach-toolbar">' +
      '<input type="file" id="mira-file-input" class="mira-file-input" multiple ' +
      'accept="image/*,.pdf,.txt,.md,.markdown,.csv,.json,.xml,.yaml,.yml,.log,.env" />' +
      '<button type="button" class="mira-attach-btn" aria-label="Add images or documents">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>' +
      '<span>Add</span>' +
      '</button></div>' +
      '<div class="mira-pending-files" hidden></div>' +
      '<div class="mira-composer-row">' +
      '<label class="mira-sr-only" for="mira-composer-input">Message MIRA</label>' +
      '<textarea id="mira-composer-input" rows="2" placeholder="Ask MIRA about scans, findings, or how to fix issues…" maxlength="8000"></textarea>' +
      '<button type="button" class="mira-send" aria-label="Send message">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '</button></div></div>'
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Turn FastAPI / proxy errors into readable chat bubbles (422 arrays, plain-text bodies, status hints). */
  function formatMiraChatError(res) {
    var st = res && typeof res.status === 'number' ? res.status : 0;
    var d = (res && res.data) || {};
    var msg = '';
    if (typeof d.detail === 'string' && d.detail.trim()) {
      msg = d.detail.trim();
    } else if (Array.isArray(d.detail)) {
      msg = d.detail
        .map(function (x) {
          if (typeof x === 'string') return x;
          if (x && typeof x.msg === 'string') return x.msg;
          if (x && Array.isArray(x.loc) && typeof x.msg === 'string') return x.loc.join('.') + ': ' + x.msg;
          try {
            return JSON.stringify(x);
          } catch (e) {
            return String(x);
          }
        })
        .filter(Boolean)
        .join('\n');
    } else if (d && typeof d.message === 'string' && d.message.trim()) {
      msg = d.message.trim();
    }
    if (!msg) {
      if (st === 413) msg = 'Request too large for MIRA.';
      else if (st === 429) msg = 'Too many requests — please slow down.';
      else if (st === 502 || st === 503) msg = 'MIRA backend is temporarily unavailable.';
      else if (st === 504) msg = 'MIRA timed out waiting for the model.';
      else if (st >= 400) msg = 'Request could not be completed.';
      else msg = 'Could not reach MIRA.';
    }
    var hint = '';
    if (st === 413) {
      hint =
        '\n\nTip: use a shorter message or fewer / smaller files (each file max 4MB; total request has a server cap).';
    } else if (st === 429) {
      hint = '\n\nTip: wait a minute, then try again.';
    } else if (st === 400) {
      hint =
        '\n\nTip: for images use PNG, JPEG, GIF, or WebP; declared type must match the file. PDFs must be real PDF files.';
    } else if (st === 502 || st === 503 || st === 504) {
      hint = '\n\nTip: if this persists, the model host may be busy — try again in a few minutes.';
    }
    return 'MIRA error (HTTP ' + (st || '—') + '):\n' + msg + hint;
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
      '<img src="assets/mira-logo.svg" alt="" width="36" height="36" />' +
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
    var fileInput = panel.querySelector('#mira-file-input');
    var attachBtn = panel.querySelector('.mira-attach-btn');
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', function () {
        fileInput.click();
      });
      fileInput.addEventListener('change', onMiraFileInputChange);
    }
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
  }

  function seedWelcomeMessage() {
    var wrap = document.querySelector('.mira-messages');
    if (!wrap) return;
    wrap.innerHTML = '';
    state.messages = [];
    pendingAttachments = [];
    renderPendingFiles();
    if (!miraChatAllowed()) {
      appendMsg('assistant', getUnavailableMsg());
    } else {
      var welcome =
        "Hi — I'm MIRA. Ask about vulnerabilities, scan findings, severities, or remediation in plain English.";
      if (hasToken()) {
        welcome +=
          " While you're signed in, I keep context from our conversations for more tailored guidance.";
      }
      appendMsg('assistant', welcome);
    }
  }

  function injectTourMessage() {
    state.messages = [];
    pendingAttachments = [];
    renderPendingFiles();
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

    // Mount FAB + panel shell immediately so the launcher never depends on API latency.
    buildUI();

    var st = await fetchStatusWithTimeout(12000);
    state.statusResponded = st.responded;
    state.statusHttpOk = st.httpOk;
    state.miraEnabled = st.enabled;

    seedWelcomeMessage();
    updateDisclaimer();
    syncComposerAvailability();

    if (hasToken() && miraChatAllowed()) {
      showTourOffer();
    }
  }

  window.MiraChat = { init: init, openPanel: openPanel };
})();
