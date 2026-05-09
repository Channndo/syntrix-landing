/**
 * Submit signup leads to the Netlify function `signup-notify` (server-side delivery only).
 */
(function () {
  async function submitSignupLead(fields) {
    const endpoint =
      `${window.location.origin}/.netlify/functions/signup-notify`;
    const payload = {
      email: fields.email || '',
      company_email: fields.company_email || '',
      first_name: fields.first_name || '',
      last_name: fields.last_name || '',
      name: fields.name || '',
      phone: fields.phone || '',
      business_name: fields.business_name || '',
      business_address: fields.business_address || '',
      supervisor_name: fields.supervisor_name || '',
      employee_first_name: fields.employee_first_name || '',
      employee_last_name: fields.employee_last_name || '',
      referral_source: fields.referral_source || '',
      referral_source_secondary: fields.referral_source_secondary || '',
      source: fields.source || 'signup_page',
      type: fields.type || 'waitlist',
    };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

  /** @deprecated use submitSignupLead */
  async function submitWaitlist(fields) {
    return submitSignupLead(fields);
  }

  window.SyntrixWaitlist = { submitSignupLead, submitWaitlist };
})();
