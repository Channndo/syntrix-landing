/**
 * Submit waitlist / signup interest to Netlify Function → Google Apps Script → Sheet + email.
 */
(function () {
  async function submitWaitlist(fields) {
    const endpoint =
      `${window.location.origin}/.netlify/functions/signup-notify`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fields.email,
        name: fields.name || '',
        source: fields.source || 'signup_page',
        type: fields.type || 'waitlist',
      }),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      const err = new Error(data.message || data.error || `Server error (${res.status})`);
      err.code = data.error;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  window.SyntrixWaitlist = { submitWaitlist };
})();
