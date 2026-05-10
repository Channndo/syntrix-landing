(() => {
  async function startCheckout(plan) {
    const { ok, data } = await window.SyntrixApi.apiPost('/api/billing/checkout-session', { plan }, {});
    if (!ok) {
      throw new Error(`Checkout failed`);
    }
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    }
  }

  async function openPortal() {
    const { ok, data } = await window.SyntrixApi.apiPost('/api/billing/portal-session', null, {});
    if (!ok) {
      throw new Error(`Portal session failed`);
    }
    if (data.portal_url) {
      window.location.href = data.portal_url;
    }
  }

  window.SyntrixBilling = { startCheckout, openPortal };
})();
