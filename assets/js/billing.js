(() => {
  function formatApiError(data) {
    const d = data && data.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
      return d.map((x) => (typeof x === 'string' ? x : x.msg || JSON.stringify(x))).join(' ');
    }
    return (data && data.message) || '';
  }

  function explainCheckoutFailure(status, data) {
    const detail = formatApiError(data);
    if (status === 401) {
      return 'Your session expired. Sign in again from the account page, then return here to subscribe.';
    }
    if (status === 503) {
      return (
        detail ||
        'Checkout is not available yet — the server needs Stripe keys and price IDs. Contact support if this continues.'
      );
    }
    if (status === 502) {
      return detail || 'Payment provider returned an error. Try again or contact support.';
    }
    return detail || 'Checkout failed';
  }

  async function startCheckout(plan) {
    const { ok, status, data } = await window.SyntrixApi.apiPost('/api/billing/checkout-session', { plan }, {});
    if (!ok) {
      throw new Error(explainCheckoutFailure(status, data));
    }
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
      return;
    }
    throw new Error('Checkout failed — no redirect URL from server.');
  }

  async function openPortal() {
    const { ok, status, data } = await window.SyntrixApi.apiPost('/api/billing/portal-session', null, {});
    if (!ok) {
      throw new Error(explainCheckoutFailure(status, data));
    }
    if (data.portal_url) {
      window.location.href = data.portal_url;
      return;
    }
    throw new Error('Could not open billing portal.');
  }

  window.SyntrixBilling = { startCheckout, openPortal };
})();
