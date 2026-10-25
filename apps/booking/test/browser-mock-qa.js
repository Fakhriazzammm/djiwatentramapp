/*
 * Browser QA runner for the booking app. Run in browser_exec against the local
 * Vite app after installing the local fetch fixture (all mutations mocked).
 * This intentionally imports the real client module; it does not alter source.
 */
export async function verifyPaymentRecovery() {
  const client = await import('/src/lib/client.ts?qa-recovery=1');
  const booking = {
    bookingId: 'booking-mock-1', bookingCode: 'BK-MOCK-001', status: 'pending',
    paymentStatus: 'pending', date: '2099-01-02', arrivalTime: '12:00', guests: 2,
    tableCount: 1, totalAmount: 25000,
    items: [{ productId: 'prod-1', name: 'Nasi Goreng Mock', price: 25000, quantity: 1 }],
  };
  const draft = {
    date: '2099-01-02', arrivalTime: '12:00', guests: 2, tableCount: 1,
    items: booking.items,
    customer: { name: 'QA Guest', phone: '081234567890', email: 'qa@example.test', notes: '' },
    customAnswers: {},
  };
  window.__qa.state.failAttachOnce = true;
  let attachError = '';
  try { await client.createBookingPayment(booking, draft); }
  catch (error) { attachError = String(error?.message || error); }
  const persistedAfterError = sessionStorage.getItem('booking-payment-BK-MOCK-001');
  // Keep this page alive: a reload aborts the caller's promise and makes the
  // recovery assertion flaky. A cache-busted import exercises a fresh module
  // while sessionStorage still represents the post-refresh browser state.
  const retryClient = await import('/src/lib/client.ts?qa-recovery=2');
  const recovered = await retryClient.createBookingPayment(booking, draft);
  return { attachError, persistedAfterError, recovered, counts: window.__qa.counts() };
}

export async function verifyMayarRedirectReturn() {
  const client = await import('/src/lib/client.ts?qa-redirect=1');
  const booking = { bookingId: 'booking-mock-1', bookingCode: 'BK-MOCK-001', status: 'pending', paymentStatus: 'pending', date: '2099-01-02', arrivalTime: '12:00', guests: 2, tableCount: 1, totalAmount: 25000, items: [{ productId: 'prod-1', name: 'Nasi Goreng Mock', price: 25000, quantity: 1 }] };
  const draft = { date: booking.date, arrivalTime: booking.arrivalTime, guests: 2, tableCount: 1, items: booking.items, customer: { name: 'QA Guest', phone: '081234567890', email: 'qa@example.test', notes: '' }, customAnswers: {} };
  let request;
  const oldFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : input.url);
    if (url.includes('/functions/v1/mayar-proxy')) {
      request = JSON.parse(init.body || '{}');
      return new Response(JSON.stringify({ success: true, data: { id: 'inv-mock-1', link: `${location.origin}/mock-mayar/inv-mock-1` } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return oldFetch(input, init);
  };
  sessionStorage.clear();
  const payment = await client.createBookingPayment(booking, draft);
  const outboundUrl = payment.invoiceUrl;
  const returnUrl = request.redirectUrl;
  return { outboundUrl, returnUrl, provider: request.extraData?.slug ? 'mayar (mock proxy)' : 'unknown', item: request.items?.[0], total: request.items?.reduce((sum, item) => sum + item.rate * item.quantity, 0) };
}
// In browser_exec: await verifyPaymentRecovery(); await verifyMayarRedirectReturn()
