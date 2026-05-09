/**
 * Submit waitlist / signup interest to the Netlify function `signup-notify` (server-side delivery only).
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
        phone: fields.phone || '',
        business_address: fields.business_address || '',
        referral_source: fields.referral_source || '',
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
