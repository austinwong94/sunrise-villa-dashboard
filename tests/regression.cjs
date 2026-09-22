const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');

async function run() {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + (req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => typeof renderAll === 'function');
    assert.equal(await page.locator('#appShell').isVisible(), false, 'Workspace must be locked before login');
    assert.equal(await page.evaluate(() => bookings.length), 0, 'Fresh browsers must not seed demo bookings');
    const results = await page.evaluate(async () => {
      const results = [];
      const check = (name, ok) => { if (!ok) throw new Error(name); results.push(name); };
      supabaseClient = null;
      cloudUser = { id: 'test-owner', email: 'test@example.invalid' };
      cloudReady = true;
      syncCloudAuthUi();
      appSettings = defaultAppSettings();
      const booking = normalizeBooking({ id: 'test-booking', guest: 'Test Guest', arrival: '2026-09-30', nights: 3, revenue: 3088, depositAmount: 500, paid: 2044, depositPaid: true, whatsappSent: true, sentLog: { checkin: '2026-09-21' } });
      bookings = [booking];
      check('Partial balance includes refundable deposit once', balanceFor(booking) === 1544);
      check('Refund does not change outstanding accommodation payment', balanceFor({ ...booking, depositRefunded: true }) === 1544 && refundPendingFor({ ...booking, depositRefunded: true }) === 0);
      check('Refund liability cannot exceed actual cash received', refundPendingFor({ ...booking, paid: 100 }) === 100);
      check('Refunded and still-held deposits are distinct', totalsForBookings([{ ...booking, depositRefunded: true }]).depositsRefunded === 500 && totalsForBookings([{ ...booking, depositRefunded: true }]).refundPending === 0);
      check('Cross-month income is not counted twice', totalsFor('2026-09').revenue === 3088 && totalsFor('2026-10').revenue === 0);
      check('Occupancy splits cross-month stays correctly', stayPerformanceForMonth('2026-09').bookedNights === 1 && stayPerformanceForMonth('2026-10').bookedNights === 2);
      check('Complimentary bookings excluded from finances', balanceFor({ ...booking, excludeFromCalculations: true }) === 0);
      check('Unconfirmed enquiries excluded from finances', totalsForBookings([{ ...booking, status: 'quoted' }]).revenue === 0);
      setFullReceived(booking.id, true);
      check('Mark fully received includes the deposit', bookings[0].paid === 3588 && bookings[0].depositPaid && refundPendingFor(bookings[0]) === 500);
      bookings = [{ ...booking, paid: 4000 }];
      setFullReceived(booking.id, true);
      check('Full payment shortcut preserves overpayments', bookings[0].paid === 4000);
      bookings = [booking];
      check('Same-day checkout allows a new arrival', conflictingBookings({ ...booking, id: 'another', arrival: '2026-10-03', nights: 1 }).length === 0);
      check('Overlapping stays are detected', conflictingBookings({ ...booking, id: 'another', arrival: '2026-10-02', nights: 1 }).length === 1);
      check('Different villas may overlap', conflictingBookings({ ...booking, id: 'another', villa: 'Windmill' }).length === 0);
      openBookingDialog(booking, true);
      els.guestInput.value = 'Updated Guest';
      els.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      check('Editing a booking retains WhatsApp history', bookings[0].whatsappSent === true && bookings[0].sentLog.checkin === '2026-09-21');
      selectedMonth = '2027-09';
      renderDashboard();
      check('Annual summary follows the selected year', els.overallTitle.textContent.includes('2027') && els.overallRevenue.textContent === money(0));
      setSelectedMonth('2026-09');
      renderBookingMonthFilter();
      check('Booking month filter follows the selected month', els.bookingMonthFilter.value === 'Selected');
      setView('messages');
      setMessageFlow('quote');
      check('Quotations do not expose confirmed guest fields', document.querySelector('.message-details-card').hidden && !document.querySelector('.quote-card').hidden);
      setMessageFlow('checkin');
      check('Check-in flow does not include enquiry fields', !document.querySelector('.message-details-card').hidden && document.querySelector('.quote-card').hidden);
      check('Local Malaysian phone numbers become international numbers', formatPhoneForWhatsapp('012-345 6789') === '60123456789');
      check('International phone numbers are preserved', formatPhoneForWhatsapp('+44 7700 900123') === '447700900123');
      setView('documents');
      const receipt = normalizeDocument({ ...defaultDocumentDraft(), type: 'Official Receipt', guestName: 'Test Guest', guestContact: '+60 12-345 6789', accommodationFee: 3088, securityDeposit: 500, payments: [
        { bank: 'RHB', reference: 'FIRST-REF', date: '2026-09-01', amount: 1000 },
        { bank: 'Maybank', reference: 'SECOND-REF', date: '2026-09-10', amount: 1044 },
      ] });
      fillDocumentForm(receipt);
      check('Receipt number matches its type', formDocument().code.includes('-RA08'));
      const markup = standaloneDocumentHtml(receipt);
      check('Receipt contains both references and banks', ['FIRST-REF', 'SECOND-REF', 'RHB', 'Maybank'].every(text => markup.includes(text)));
      check('Receipt contains transaction dates, guest contact and correct balance', markup.includes('01 Sep 2026') && markup.includes('10 Sep 2026') && markup.includes('+60 12-345 6789') && markup.includes('RM 1,544.00'));
      check('Saved receipt accepts partial payment', validateDocumentForm());
      documents = [];
      saveCurrentDocument();
      const first = documents[0];
      duplicateCurrentDocument();
      saveCurrentDocument();
      check('Duplicate documents have distinct numbers', documents.length === 2 && documents[0].code !== documents[1].code);
      const savedCode = documents[0].code;
      fillDocumentForm(documents[0]);
      els.docRemarks.value = 'Updated remarks';
      saveCurrentDocument();
      check('Amending a document retains its saved number', documents[0].code === savedCode);
      createBalanceInvoiceFromReceipt(first.id);
      const invoice = formDocument();
      check('Balance invoice subtracts all receipt transactions', invoice.type === 'Invoice' && invoice.previouslyReceived === 2044 && invoice.amountDue === 1544);
      check('Balance invoice does not disclose transfer references', !standaloneDocumentHtml(invoice).includes('FIRST-REF'));
      fillDocumentForm({ ...defaultDocumentDraft(), type: 'Official Receipt', guestName: 'Unpaid', accommodationFee: 3000 });
      check('Selecting receipt does not invent full payment', paymentTotalFor(formDocument()) === 0);
      renderPaymentRows([normalizePayment({}), normalizePayment({ bank: 'RHB', reference: 'KEEP', date: '2026-09-21', amount: 100 })]);
      document.querySelector('[data-remove-payment="0"]').click();
      check('Removing a blank row keeps the correct transaction', paymentRowsFromForm()[0].reference === 'KEEP');
      fillDocumentForm({ ...defaultDocumentDraft(), guestName: '<img src=x onerror=alert(1)>', billAddress: '<script>alert(1)</script>' });
      check('Document guest fields are escaped', !standaloneDocumentHtml(formDocument()).includes('<img src=x') && !standaloneDocumentHtml(formDocument()).includes('<script>'));
      const before = JSON.stringify(bookings);
      try { restoreAppData({ bookings: [{ guest: 'Broken', arrival: '2026-02-30', nights: 1 }] }); } catch (_) {}
      check('Invalid backup is rejected before changing data', JSON.stringify(bookings) === before);
      check('Asset-only workspaces qualify for recovery', hasMeaningfulAppData({ bookings: [], documents: [], taxPlan: { assets: [{}] }, profitData: {} }));
      check('Saved payment metadata survives normalization', normalizeDocument(first).payments[1].reference === 'SECOND-REF' && normalizeDocument(first).payments[1].date === '2026-09-10');
      appSettings.activeVilla = 'Sunrise';
      profitData = { '2026-09': { oneOffCosts: [{ id: 'legacy-cost', amount: 90 }] } };
      check('Legacy Sunrise expenses survive unchanged', adHocExpenseTotalFor('2026-09') === 90);
      appSettings.activeVilla = 'Windmill';
      check('Sunrise costs do not leak into Windmill', adHocExpenseTotalFor('2026-09') === 0 && commitmentTotalFor('2026-09') === 0);
      saveSelectedProfitMonth({ oneOffCosts: [{ id: 'windmill-cost', amount: 40 }] });
      check('Each villa keeps independent monthly costs', profitMonth('2026-09', 'Sunrise').oneOffCosts[0].amount === 90 && profitMonth('2026-09', 'Windmill').oneOffCosts[0].amount === 40);
      appSettings.activeVilla = 'Sunrise';
      const loan = normalizeCommitment({ amount: 100, starts: '2026-09', expires: '2026-11', overrides: { '2026-10': 75 } });
      check('Loan starts and ends in the intended months', !commitmentActiveInMonth(loan, '2026-08') && commitmentActiveInMonth(loan, '2026-11') && !commitmentActiveInMonth(loan, '2026-12'));
      check('Annual loan override preserves other months', commitmentAmountFor(loan, '2026-10') === 75 && commitmentAmountFor(loan, '2026-09') === 100);
      appSettings.commitments = [loan];
      const backup = JSON.parse(JSON.stringify(allAppData()));
      restoreAppData(backup);
      check('Full backup roundtrip preserves payments and costs', documents.find(doc => doc.id === first.id).payments[1].reference === 'SECOND-REF' && profitMonth('2026-09', 'Windmill').oneOffCosts[0].amount === 40);
      check('Saved private commitments survive without public defaults', appSettings.commitments.length === 1 && appSettings.commitments[0].amount === 100);
      const stable = JSON.stringify(bookings);
      let rejected = false;
      try { restoreAppData({ ...backup, bookings: [], taxPlan: { expenses: [null] } }); } catch (_) { rejected = true; }
      check('Malformed nested backup cannot partially replace bookings', rejected && JSON.stringify(bookings) === stable);
      rejected = false;
      try { restoreAppData({ ...backup, bookings: [booking, booking] }); } catch (_) { rejected = true; }
      check('Duplicate booking IDs are rejected on restore', rejected && JSON.stringify(bookings) === stable);
      bookings = [normalizeBooking({ ...booking, arrival: isoDate(addDays(new Date(), -1)), nights: 1 })];
      els.messageBookingSelect.innerHTML = '';
      check('Checkout-today guests are excluded from message fallback', selectedMessageBooking() === undefined);
      setView('documents');
      fillDocumentForm(first);
      setDocumentWorkspace('archive');
      check('Archive is separate from document editing', !document.querySelector('.document-archive').hidden && document.querySelector('.documents-layout').hidden);
      setDocumentWorkspace('editor');
      return results;
    });
    const printOutput = process.env.AUDIT_OUTPUT || '/private/tmp/sunrise-audit-final';
    fs.mkdirSync(printOutput, { recursive: true });
    for (const [index, type] of ['Quotation', 'Invoice', 'Official Receipt'].entries()) {
      const html = await page.evaluate(type => standaloneDocumentHtml(normalizeDocument({
        ...defaultDocumentDraft(), type, guestName: 'Alex Morgan', guestContact: '+60 12-345 6789',
        billTo: 'Example Company', billAddress: '12 Example Road\nBentong, Pahang', accommodationFee: 3088, securityDeposit: 500,
        payments: [{ bank: 'RHB', reference: 'FIRST-REF', date: '2026-09-01', amount: 1000 }, { bank: 'Maybank', reference: 'SECOND-REF', date: '2026-09-10', amount: 1044 }]
      })), type);
      const printPage = await browser.newPage();
      await printPage.setContent(html);
      await printPage.pdf({ path: path.join(printOutput, 'document-' + index + '.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
      assert.equal(await printPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, type + ' fits horizontally');
      await printPage.close();
    }
    const syncResults = await page.evaluate(async () => {
      const results = [];
      const check = (name, ok) => { if (!ok) throw new Error(name); results.push(name); };
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      window.clearTimeout(cloudSaveTimer);
      let remote = { id: 'row', updated_at: 'old', data: allAppData() };
      let requests = 0;
      let inFlight = 0;
      let maxInFlight = 0;
      const writes = [];
      supabaseClient = { from() {
        let payload;
        const filters = {};
        return {
          update(value) { payload = value; return this; },
          insert(value) { payload = value; return this; },
          select() { return this; },
          eq(key, value) { filters[key] = value; return this; },
          order() { return this; }, limit() { return this; },
          single() { return this.maybeSingle(); },
          async maybeSingle() {
            requests++;
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await delay(35);
            inFlight--;
            if (!payload) return { data: remote, error: null };
            if (filters.updated_at && filters.updated_at !== remote.updated_at) return { data: null, error: null };
            remote = { id: 'row', ...payload };
            writes.push(payload);
            return { data: { id: 'row', updated_at: payload.updated_at }, error: null };
          }
        };
      } };
      cloudRecordId = 'row';
      cloudKnownUpdatedAt = 'old';
      cloudReady = true;
      cloudDirty = true;
      cloudConflict = false;
      const firstSave = saveCloudSnapshot();
      await delay(5);
      bookings = [...bookings, normalizeBooking({ guest: 'Second edit', arrival: '2026-12-01', nights: 1, revenue: 1000 })];
      scheduleCloudSave();
      await Promise.all([firstSave, saveCloudSnapshot()]);
      window.clearTimeout(cloudSaveTimer);
      check('Cloud writes are serialized', maxInFlight === 1);
      check('Edits made during a save are included in a following save', writes.length === 2 && remote.data.bookings.some(b => b.guest === 'Second edit') && !cloudDirty);
      remote.updated_at = 'changed-on-another-device';
      cloudDirty = true;
      const count = writes.length;
      const conflictResult = await saveCloudSnapshot();
      check('Atomic conflict check never overwrites another device', conflictResult === false && cloudConflict && writes.length === count);
      renderAll();
      check('Save errors remain visible after rendering', document.querySelector('#dataHealthStatus').textContent.includes('attention') && !document.querySelector('#syncNotice').hidden);
      const beforeRefresh = requests;
      await applyCloudSession({ user: cloudUser });
      check('Session refresh does not reload or overwrite unsaved work', requests === beforeRefresh);
      cloudConflict = false;
      cloudDirty = false;
      writeSyncState();
      remote = { id: 'row', updated_at: 'new', data: { ...allAppData(), bookings: [], documents: [] } };
      await loadCloudSnapshot();
      check('Confirmed cloud deletions load without reviving stale browser rows', bookings.length === 0 && documents.length === 0);
      cloudReady = false;
      syncCloudAuthUi();
      supabaseClient = { from() { return { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, async maybeSingle() { return { data: null, error: { message: 'Simulated outage' } }; } }; } };
      await loadCloudSnapshot();
      check('Failed cloud load leaves private workspace locked', document.querySelector('#appShell').hidden && !cloudReady);
      check('Saving is blocked until cloud load succeeds', await saveCloudSnapshot() === false);
      taxPlan = { ...defaultTaxPlan(), expenses: [normalizeTaxExpense({ vendor: 'Private prior account', amount: 99 })] };
      createRecoverySnapshot('Prior account recovery');
      cloudDirty = false;
      writeSyncState();
      maybeAutoSyncIcal = () => {};
      loadBookingCandidates = () => {};
      mergeServerIcalBlocks = () => {};
      supabaseClient = { from() { return { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, async maybeSingle() { return { data: { id: 'other-row', updated_at: 'other', data: { bookings: [], documents: [] } }, error: null }; } }; } };
      await applyCloudSession({ user: { id: 'another-owner' } });
      check('Changing accounts does not inherit old tax records', taxPlan.expenses.length === 0);
      check('Recovery history is restricted to its account', !visibleRecoverySnapshots().some(snapshot => snapshot.data.taxPlan?.expenses?.some(expense => expense.vendor === 'Private prior account')));
      return results;
    });
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log(JSON.stringify({ passed: results.length + syncResults.length + 2, checks: [...results, ...syncResults], errors }, null, 2));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
