(() => {
  const API_BASE = window.SYNTRIX_API_BASE || 'https://api.syntrix.solutions';

  async function authHeaders() {
    const token = await window.SyntrixAuth.getAccessToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  async function startCheckout(plan) {
    const headers = await authHeaders();
    const response = await fetch(`${API_BASE}/api/billing/checkout-session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ plan }),
    });
    if (!response.ok) {
      throw new Error(`Checkout failed (${response.status})`);
    }
    const payload = await response.json();
    if (payload.checkout_url) {
      window.location.href = payload.checkout_url;
    }
  }

  async function openPortal() {
    const headers = await authHeaders();
    const response = await fetch(`${API_BASE}/api/billing/portal-session`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Portal session failed (${response.status})`);
    }
    const payload = await response.json();
    if (payload.portal_url) {
      window.location.href = payload.portal_url;
    }
  }

  window.SyntrixBilling = { startCheckout, openPortal };
})();
