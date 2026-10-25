/* Reproducible browser-only QA fixture. Inject before loading /booking.
 * It mocks auth/profile, public booking reads, booking mutations, status reads,
 * and Mayar; menu image URLs remain real read-only URLs. No source imports.
 */
(() => {
  const realFetch = window.fetch.bind(window);
  const imageBase = "https://supabase.yumme.id/storage/v1/object/public/app-assets/migrated/products/";
  const products = [
    { id: "qa-1031", _id: "jh70bx1jakb3nabafjhe4twszh821x6n", name: "Nasi Hamburg Jepang", price: 30000, image: imageBase + "jh70bx1jakb3nabafjhe4twszh821x6n-image.jpg", categoryId: "qa-food", menuNumber: 1031, isAvailable: true },
    { id: "qa-1032", _id: "jh718sbzfp53nn7a6hz7gjdp4s82166x", name: "Nasi Ayam Charsiu", price: 30000, image: imageBase + "jh718sbzfp53nn7a6hz7gjdp4s82166x-image.jpg", categoryId: "qa-food", menuNumber: 1032, isAvailable: true },
    { id: "qa-1033", _id: "jh72azys9d3rw0pkndjs7ggann821r1q", name: "Nasi Ayam Mentega", price: 30000, image: imageBase + "jh72azys9d3rw0pkndjs7ggann821r1q-image.jpg", categoryId: "qa-food", menuNumber: 1033, isAvailable: true },
  ];
  const callKey = "qa-call-log-v1";
  const readCalls = () => { try { const value = JSON.parse(sessionStorage.getItem(callKey) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } };
  const state = { mode: sessionStorage.getItem("qa-payment-mode") || "pending", failAttachOnce: sessionStorage.getItem("qa-fail-attach-once") === "1" && sessionStorage.getItem("qa-fail-attach-consumed") !== "1", delayStatus: Number(sessionStorage.getItem("qa-delay-status") || 0), failStatusOnce: sessionStorage.getItem("qa-fail-status-once") === "1" && sessionStorage.getItem("qa-fail-status-consumed") !== "1", calls: readCalls(), attachCount: 0, bookings: {} };
  const saveCalls = () => sessionStorage.setItem(callKey, JSON.stringify(state.calls));
  const record = (entry) => { state.calls.push(entry); saveCalls(); };
  const json = (body, status = 200) => new Response(JSON.stringify(body && typeof body === "object" && "data" in body ? { success: status < 400, ...body } : body), { status, headers: { "Content-Type": "application/json" } });
  const booking = (code, paymentStatus = "pending") => ({ bookingId: "qa-booking-1", bookingCode: code, status: "pending", paymentStatus, date: "2099-01-02", arrivalTime: "12:00", guests: 2, tableCount: 1, totalAmount: 90000, items: products.map((p) => ({ productId: p.id, name: p.name, price: p.price, quantity: 1 })) });
  window.__qa = {
    state,
    setMode(mode) { state.mode = mode; },
    counts() { return { total: state.calls.length, create: state.calls.filter((x) => x.action === "create").length, attach: state.calls.filter((x) => x.action === "attach-payment").length, status: state.calls.filter((x) => x.action === "status").length, mayar: state.calls.filter((x) => x.action === "mayar").length }; },
    booking(code = "BK-QA-001") { return state.bookings[code] || booking(code, state.mode === "paid" ? "paid" : "pending"); },
    reset() { state.calls.length = 0; saveCalls(); state.attachCount = 0; state.failAttachOnce = false; state.delayStatus = 0; state.failStatusOnce = false; state.bookings = {}; sessionStorage.removeItem("qa-payment-mode"); sessionStorage.removeItem("qa-auth-mode"); sessionStorage.removeItem("booking-draft-v2"); sessionStorage.removeItem("booking-pending-result"); localStorage.removeItem("booking-last-code"); }
  };
  window.fetch = async (input, init = {}) => {
    const url = String(typeof input === "string" ? input : input.url);
    const method = String(init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
    const external = (() => { try { return new URL(url, location.href).origin !== location.origin; } catch { return true; } })();
    const mockExternal = url.includes("/functions/v1/public-booking") || url.includes("/functions/v1/mayar-proxy") || url.includes("/api/auth/") || url.includes("/api/customer/");
    if (external && method !== "GET" && !mockExternal) return json({ success: false, error: "QA fail-closed: external mutation blocked" }, 599);
    const authMode = sessionStorage.getItem("qa-auth-mode") || "authenticated";
    if (url.includes("/api/auth/get-session")) return authMode === "authenticated" ? json({ user: { id: "qa-customer-001", name: "QA Customer", email: "qa.customer@example.test" }, session: { id: "qa-session-001" } }) : json({ session: null });
    if (url.includes("/api/customer/profile")) return authMode === "authenticated" ? json({ success: true, customer: { source_id: "qa-customer-001", name: "QA Customer", email: "qa.customer@example.test", phone: "081234567890" } }) : json({ success: false, customer: null }, 401);
    if (url.includes("/rest/v1/pos_booking_settings")) return json([{ slug: "booking", title: "Booking Djiwa Tentram", description: "QA menu", isActive: true, bookingWindowDays: 90, defaultMaxPeople: 40, defaultMaxTables: 10, defaultPeoplePerTable: 4, bookingTypes: [{ key: "group-meal", label: "Makan bersama", description: "Pesan untuk rombongan" }], eventTypes: [] }]);
    if (url.includes("/rest/v1/pos_booking_date_capacity")) return json([{ slug: "booking", date: "2026-10-26", maxPeople: 40, maxTables: 10, peoplePerTable: 4, isClosed: false }]);
    if (url.includes("/rest/v1/pos_products_all")) return json(products);
    if (url.includes("/rest/v1/pos_categories")) return json([{ _id: "qa-food", name: "Menu utama", displayOrder: 1 }]);
    if (url.includes("/functions/v1/mayar-proxy")) {
      const body = JSON.parse(init.body || "{}"); record({ action: "mayar", body });
      return json({ success: true, data: { id: "qa-invoice-1", link: `${location.origin}/mock-mayar/qa-invoice-1` } });
    }
    if (url.includes("/functions/v1/public-booking") || url.includes("api.djiwatentram.web.id/api/public-booking")) {
      const body = JSON.parse(init.body || "{}");
      record({ action: body.action, body });
      if (body.action === "create") { const b = booking("BK-QA-001", "pending"); state.bookings[b.bookingCode] = b; return json({ data: b }); }
      if (body.action === "attach-payment") { state.attachCount += 1; if (state.failAttachOnce) { state.failAttachOnce = false; sessionStorage.setItem("qa-fail-attach-consumed", "1"); return json({ error: "QA attach failure" }, 500); } return json({ data: { ok: true } }); }
      if (body.action === "status") { const code = body.bookingCode || "BK-QA-001"; if (state.failStatusOnce) { state.failStatusOnce = false; return json({ error: "QA status failure" }, 500); } if (state.delayStatus) await new Promise((resolve) => setTimeout(resolve, state.delayStatus)); const current = state.bookings[code] || booking(code, "pending"); const paid = sessionStorage.getItem("qa-payment-mode") === "paid"; return json({ data: { ...current, paymentStatus: paid ? "paid" : "pending" } }); }
      return json({ data: {} });
    }
    return realFetch(input, init);
  };
})();