const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.AUDIT_OUTPUT || '/private/tmp/sunrise-workflows';

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
    await page.waitForFunction(() => typeof openBookingWorkspace === 'function');
    const results = await page.evaluate(async () => {
      supabaseClient = null; cloudReady = true;
      cloudUser = { id: 'test-owner', email: 'test@example.invalid' };
      syncCloudAuthUi(); appSettings = defaultAppSettings(); documents = [];
      window.confirm = () => true;
      const today = isoDate(new Date());
      const day = n => isoDate(addDays(dateObj(today), n));
      const make = (id, extra = {}) => normalizeBooking({ id, guest: id, villa: 'Sunrise', channel: 'Direct', status: 'confirmed', arrival: day(2), nights: 2, revenue: 2000, depositAmount: 0, paid: 0, contact: '+60123456789', ...extra });
      const results = [];
      const check = (name, condition) => { if (!condition) throw new Error(name); results.push(name); };
      bookings = [make('guest-a', { paid: 1000 }), make('guest-b')];
      setView('documents');
      fillDocumentForm({ ...defaultDocumentDraft(), type: 'Official Receipt', guestName: 'guest-a', billTo: 'Guest A Company', billAddress: 'Guest A address', remarks: 'Guest A terms', payments: [{ bank: 'BANK A', reference: 'REF-A', date: today, amount: 1000 }] });
      prefillDocFromBooking('guest-b');
      check('Switching guest clears previous banking and billing details', formDocument().guestName === 'guest-b' && !formDocument().billTo && !formDocument().billAddress && !formDocument().remarks && !formDocument().payments.some(payment => payment.reference === 'REF-A'));
      check('Unpaid booking does not inherit receipt amount', paymentTotalFor(formDocument()) === 0);
      setDocumentFeedback('Unsaved changes', true);
      validateDocumentForm();
      check('Validation feedback preserves unsaved state', documentHasUnsavedChanges);
      appSettings.activeVilla = 'Windmill'; renderDocBookingPicker();
      check('Property switch does not drop document booking link', els.docFromBooking.value === 'guest-b');
      appSettings.activeVilla = 'Sunrise';

      bookings = [make('wa-checked', { whatsappSent: true }), make('review-done', { arrival: day(-2), nights: 1, sentLog: { review: day(-1) } })];
      check('W/A checkbox and check-in tasks agree', !sendTodayItems().some(item => item.booking.id === 'wa-checked' && item.type === 'checkin'));
      check('Review task does not repeat each day after sending', !sendTodayItems().some(item => item.type === 'review'));
      bookings = [make('wa-launch-only')]; renderToday();
      window.open = () => null;
      document.querySelector('[data-send="checkin"]').click();
      check('Blocked WhatsApp launch never marks sent', !hasCheckinBeenSent(bookings[0]) && sendTodayItems().some(item => item.type === 'checkin'));
      document.querySelector('[data-mark-sent="checkin"]').click();
      check('Explicit sent confirmation updates calendar and tasks', bookings[0].whatsappSent && !sendTodayItems().some(item => item.type === 'checkin'));
      setWhatsappSent(bookings[0].id, false);
      check('Unchecking W/A reopens the check-in task', !hasCheckinBeenSent(bookings[0]) && sendTodayItems().some(item => item.type === 'checkin'));

      bookings = [make('paid-airbnb', { channel: 'Airbnb', paid: 2000, arrival: day(1) }), make('overdue-airbnb', { channel: 'Airbnb', arrival: day(-3), nights: 2 }), make('departed-unpaid', { arrival: day(-3), nights: 2 }), make('inquiry-today', { status: 'inquiry', arrival: today }), make('partial-deposit', { arrival: day(-3), nights: 2, paid: 100, depositAmount: 500, depositPaid: true })];
      renderToday();
      const attention = document.querySelector('.today-attention');
      check('Paid Airbnb payouts are not pending', !attention.querySelector('[data-open-booking="paid-airbnb"]'));
      check('Overdue Airbnb and departed direct balances remain actionable', attention.querySelector('[data-open-booking="overdue-airbnb"]') && attention.querySelector('[data-open-booking="departed-unpaid"]'));
      check('Inquiries do not appear as arrivals or in-house', !document.querySelector('.today-columns [data-open-booking="inquiry-today"]'));
      check('Refund task matches actual received deposit', [...attention.querySelectorAll('[data-open-booking="partial-deposit"] .today-flag')].some(node => node.textContent === money(100)));
      check('Inquiries do not count as completed stays', guestStatsList([bookings[3]])[0].stays === 0);
      check('Same name without phone does not silently merge guests', guestStatsList([make('one', { guest: 'Example', contact: '' }), make('two', { guest: 'Example', contact: '' })]).length === 2);

      bookings = [make('posting-booking', { paid: 1000 })];
      els.docType.value = "Official Receipt"; prefillDocFromBooking("posting-booking");
      renderPaymentRows([normalizePayment({ id: "posted-one", bank: "Test Bank", reference: "POST-1", date: today, amount: 600 }), normalizePayment({ id: "posted-two", bank: "Test Bank", reference: "POST-2", date: today, amount: 400 })]);
      document.querySelector("#receiptPostingMode").value = "match";
      document.querySelector("#recordReceiptPayments").click();
      check("Receipt posting button reconciles multiple transfers", bookings[0].paid === 1000 && bookings[0].paymentLedger.filter(item => item.kind === "payment").length === 2);
      document.querySelector("#recordReceiptPayments").click();
      check("Repeated receipt posting cannot duplicate received money", bookings[0].paid === 1000 && bookings[0].paymentLedger.length === 3);
      openBookingWorkspace("posting-booking", "payments");
      const paymentForm = document.querySelector("#workspacePaymentForm");
      paymentForm.elements.amount.value = "250"; paymentForm.elements.bank.value = "Test Bank"; paymentForm.elements.reference.value = "POST-3";
      paymentForm.requestSubmit();
      check("Payment form records a transfer and refreshes the booking", bookings[0].paid === 1250 && document.querySelector("#workspacePaymentStatus").textContent.includes("recorded"));
      closeBookingWorkspace();

      let booking = make('ledger-booking', { paid: 1000, depositAmount: 500, guest: 'Test Booking' });
      const payment = VillaLedger.normalize({ id: 'transfer-001', amount: 600, date: today, bank: 'Test Bank', reference: 'BANK-001' });
      booking = VillaLedger.reconcile(booking, [payment], 'receipt-001');
      check('Reconciling legacy payments preserves received total', booking.paid === 1000 && booking.paymentLedger.find(entry => entry.kind === 'opening').amountSen === 40000);
      booking = VillaLedger.reconcile(booking, [payment], 'receipt-001');
      check('Reconciliation is idempotent', booking.paid === 1000 && booking.paymentLedger.filter(entry => entry.id === payment.id).length === 1);
      booking = VillaLedger.append(booking, { id: 'transfer-002', amount: 250, date: today, reference: 'BANK-002' });
      check('New payment increases total once', booking.paid === 1250);
      let rejected = false;
      try { VillaLedger.append(booking, { ...payment, amountSen: 60000 }); } catch { rejected = true; }
      check('Duplicate transaction IDs are rejected', rejected);
      bookings = [booking];
      fillDocumentForm({ ...defaultDocumentDraft(), type: 'Official Receipt', bookingId: booking.id, guestName: booking.guest, accommodationFee: 2000, securityDeposit: 500, payments: [normalizePayment({ ...payment, amount: 600 })] });
      const receipt = formDocument();
      check('Receipt separates this transfer from other payments', receipt.previouslyReceived === 650 && standaloneDocumentHtml(receipt).includes('RM 1,250.00'));
      saveCurrentDocument();
      duplicateCurrentDocument(); saveCurrentDocument();
      check('Saving and duplicating receipts never duplicate cash', bookings[0].paid === 1250);
      createBalanceInvoiceFromReceipt(documents[0].id);
      check('Linked balance invoice uses all booking payments', formDocument().previouslyReceived === 1250 && formDocument().amountDue === 1250);
      setFullReceived(booking.id, true); setFullReceived(booking.id, true);
      check('Full-received shortcut adds only remaining balance once', bookings[0].paid === 2500 && bookings[0].paymentLedger.length === 4);
      const backup = JSON.parse(JSON.stringify(allAppData()));
      restoreAppData(backup);
      check('Backup roundtrip retains transaction IDs and bank references', bookings[0].paymentLedger.some(entry => entry.id === 'transfer-001' && entry.reference === 'BANK-001'));
      const broken = JSON.parse(JSON.stringify(backup)); broken.bookings[0].paymentLedger[0].amountSen += 1;
      rejected = false;
      try { restoreAppData(broken); } catch { rejected = true; }
      check('Backup mismatch rejects before replacing records', rejected && bookings[0].paid === 2500);

      const month = today.slice(0, 7); selectedMonth = month;
      profitData = {}; taxPlan.expenses = [];
      appSettings.commitments = [normalizeCommitment({ id: 'utility-plan', villa: 'Sunrise', name: 'Electricity and Water', amount: 200, starts: month })];
      taxPlan.expenses = [normalizeTaxExpense({ id: 'legacy-tax', amount: 50, date: today }), normalizeTaxExpense({ id: 'actual-bill', amount: 170, date: today, property: 'Sunrise Villa', financeMode: 'commitment', commitmentId: 'utility-plan', category: 'Other' }), normalizeTaxExpense({ id: 'new-cost', amount: 40, date: today, property: 'Sunrise Villa', financeMode: 'additional', category: 'Other' })];
      check('Actual commitment replaces budget without double counting', expenseTotalFor(month) === 210);
      check('Expense summary subtotals agree with the total', expenseBreakdownFor(month).adHoc === 40 && expenseBreakdownFor(month).commitments === 170);
      check('Existing tax records stay unreviewed without changing totals', taxPlan.expenses[0].financeMode === 'unreviewed');
      appSettings.activeVilla = 'Windmill';
      check('Unified expenses remain property scoped', expenseTotalFor(month) === 0);
      appSettings.activeVilla = 'Sunrise';
      showFinanceSection('expenses');
      check('Tax and Finance share the same expense form', document.querySelectorAll('#taxExpenseForm').length === 1 && document.querySelector('#financeExpenses').contains(els.taxExpenseForm));
      openBookingWorkspace(booking.id, 'payments');
      check('Booking panel links payments and saved documents', document.querySelector('#workspacePaymentForm') && document.querySelectorAll('[data-booking-open-document]').length === 2);
      cloudReady = false; syncCloudAuthUi();
      check('Locking the session closes and clears private dialogs', !document.querySelector('#bookingWorkspace').open && !document.querySelector('#bookingWorkspace').textContent);
      cloudReady = true; syncCloudAuthUi();
      const future = { ...allAppData(), version: 999 };
      let futureRejected = false;
      try { validateBackupData(future); } catch { futureRejected = true; }
      check('Future backup schemas cannot be silently downgraded', futureRejected);
      window.alert = () => {};
      window.confirm = () => true;
      appSettings.activeVilla = 'Sunrise'; appSettings.commitments = [];
      const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/4p0AAAAASUVORK5CYII=';
      profitData = { [month]: { ...defaultProfitMonth(), oneOffCosts: [{ id: 'historic-cost', category: 'Supplies', description: 'Test supplies', amount: 80, receiptName: 'test.png', receiptImage: image }] } };
      taxPlan = { ...defaultTaxPlan(), expenses: [normalizeTaxExpense({ id: 'historic-receipt', date: today, property: 'Sunrise Villa', amount: 80, vendor: 'Test supplier', attachment: { name: 'test.png', type: 'image/png', dataUrl: image } })] };
      showFinanceSection('expenses');
      openLegacyCostRecord(month, 'historic-cost');
      check('Older cost review suggests an existing receipt before creating another', document.querySelector('#legacyExpenseMatch').open && document.querySelector('[data-match-expense="historic-receipt"]'));
      document.querySelector('[data-match-expense="historic-receipt"]').click();
      check('Matching receipt opens an explicit unsaved link', taxPlan.expenses[0].financeMode === 'unreviewed' && selectedLegacyExpenseSource().costId === 'historic-cost');
      els.taxExpenseForm.requestSubmit();
      check('Linking keeps one expense and counts the historical cost only once', taxPlan.expenses.length === 1 && taxPlan.expenses[0].financeMode === 'legacy' && expenseTotalFor(month) === 80);
      check('Linking preserves the original receipt image', profitData[month].oneOffCosts[0].receiptImage === image && taxPlan.expenses[0].attachment.dataUrl === image);
      fillTaxExpenseForm('historic-receipt');
      els.taxExpenseAmount.value = '95';
      els.taxExpenseForm.requestSubmit();
      check('Changing a linked amount updates both records together', taxPlan.expenses[0].amount === 95 && profitData[month].oneOffCosts[0].amount === 95 && expenseTotalFor(month) === 95);
      fillTaxExpenseForm('historic-receipt');
      document.querySelector('#expenseFinanceMode').value = 'additional';
      window.confirm = () => false;
      els.taxExpenseForm.requestSubmit();
      check('Cancelling duplicate-cost warning changes no records', taxPlan.expenses[0].financeMode === 'legacy' && expenseTotalFor(month) === 95);
      window.confirm = () => true;
      let invalidLinkRejected = false;
      try { validateExpenseFinanceChange({ ...taxPlan.expenses[0], property: 'Windmill Villa' }); } catch { invalidLinkRejected = true; }
      check('Historical links cannot cross properties', invalidLinkRejected);
      invalidLinkRejected = false;
      try { validateExpenseFinanceChange({ ...taxPlan.expenses[0], date: '2030-01-01' }); } catch { invalidLinkRejected = true; }
      check('Historical links cannot silently move costs to another month', invalidLinkRejected);
      const linkedBackup = JSON.parse(JSON.stringify(allAppData()));
      restoreAppData(linkedBackup);
      check('Backup roundtrip preserves expense links and totals', taxPlan.expenses[0].legacyCost.costId === 'historic-cost' && expenseTotalFor(month) === 95);
      const invalidLink = JSON.parse(JSON.stringify(linkedBackup));
      invalidLink.profitData[month].oneOffCosts = [];
      invalidLinkRejected = false;
      try { restoreAppData(invalidLink); } catch { invalidLinkRejected = true; }
      check('Missing source cost rejects restore before replacing records', invalidLinkRejected && expenseTotalFor(month) === 95);
      const duplicateLink = JSON.parse(JSON.stringify(linkedBackup));
      duplicateLink.taxPlan.expenses.push({ ...duplicateLink.taxPlan.expenses[0], id: 'duplicate-link' });
      invalidLinkRejected = false;
      try { restoreAppData(duplicateLink); } catch { invalidLinkRejected = true; }
      check('Two expenses cannot link the same monthly cost in a backup', invalidLinkRejected && taxPlan.expenses.length === 1);
      deleteTaxExpense('historic-receipt');
      check('Deleting a linked receipt leaves the original Finance cost intact', taxPlan.expenses.length === 0 && expenseTotalFor(month) === 95);
      openLegacyCostRecord(month, 'historic-cost');
      check('New historical receipt requires a real date, not an invented day', els.taxExpenseDate.value === '' && !els.taxExpenseForm.checkValidity());
      restoreAppData(linkedBackup);

      const recordsOnly = stripAttachmentImages(JSON.parse(JSON.stringify(allAppData())));
      check('Browser recovery omits large images without changing live files', !recordsOnly.profitData[month].oneOffCosts[0].receiptImage && !recordsOnly.taxPlan.expenses[0].attachment.dataUrl && profitData[month].oneOffCosts[0].receiptImage === image);
      const recovered = prepareRestorePreview(recordsOnly);
      check('Recovery retains matching current receipt files by default', recovered.retained === 2 && recovered.missing === 0 && recovered.staged.taxPlan.expenses[0].attachment.dataUrl === image);
      const noRetention = prepareRestorePreview(recordsOnly, false);
      check('Restore comparison reports missing attachment content', noRetention.missing === 2 && noRetention.attached === 0);
      const differentFile = JSON.parse(JSON.stringify(recordsOnly));
      differentFile.taxPlan.expenses[0].attachment.name = 'different.png';
      check('Recovery never borrows a different receipt file', !prepareRestorePreview(differentFile).staged.taxPlan.expenses[0].attachment.dataUrl);
      const partial = prepareRestorePreview([]);
      check('Bookings-only backups preserve other collections', partial.staged.taxPlan.expenses.length === 1 && partial.staged.documents.length === documents.length);
      const before = workspaceFingerprint();
      openRestorePreview(recordsOnly, { label: '<img src=x onerror=alert(1)>', recordsOnly: true });
      check('Preview is read-only and safely escapes filenames', before === workspaceFingerprint() && !document.querySelector('#restorePreview img'));
      check('Preview displays collection differences including transfers', document.querySelector('#restoreComparison').textContent.includes('Booking transfers'));
      document.querySelector('#restorePreview [data-restore-close]').click();
      check('Cancel clears the preview and changes no saved data', !pendingRestore && !document.querySelector('#restorePreview').open && before === workspaceFingerprint());
      const replacement = JSON.parse(JSON.stringify(allAppData()));
      replacement.bookings = [];
      const comparison = prepareRestorePreview(replacement).comparisons.find(row => row.label === 'Bookings');
      check('Restore reports records that will be removed', comparison.removed === bookings.length && comparison.after === 0);
      let ownerRejected = false;
      try { openRestorePreview({ ...recordsOnly, ownerId: 'other-account' }); } catch { ownerRejected = true; }
      check('A backup tagged to another account is rejected', ownerRejected && before === workspaceFingerprint());
      cloudConflict = true;
      let conflictRejected = false;
      try { openRestorePreview(recordsOnly); } catch { conflictRejected = true; }
      cloudConflict = false;
      check('Restore cannot bypass an unresolved cloud conflict', conflictRejected);

      openRestorePreview(replacement);
      await confirmRestorePreview();
      check('Restore requires a full-backup acknowledgement', bookings.length > 0 && document.querySelector('#restorePreviewStatus').textContent.includes('full backup'));
      document.querySelector('#restoreBackupConfirmed').checked = true;
      const originalSnapshotWriter = writeRecoverySnapshots;
      writeRecoverySnapshots = () => false;
      await confirmRestorePreview();
      writeRecoverySnapshots = originalSnapshotWriter;
      check('Recovery storage failure aborts restore without losing data', bookings.length > 0 && document.querySelector('#restorePreviewStatus').textContent.includes('Restore stopped'));
      closeRestorePreview();
      openRestorePreview(replacement);
      document.querySelector('#restoreBackupConfirmed').checked = true;
      bookings = bookings.map(item => ({ ...item, guest: 'Edited after preview' }));
      await confirmRestorePreview();
      check('Stale restore preview cannot overwrite newer edits', bookings[0].guest === 'Edited after preview' && document.querySelector('#restorePreviewStatus').textContent.includes('changed after'));
      closeRestorePreview();
      openRestorePreview(recordsOnly);
      document.querySelector('#restoreBackupConfirmed').checked = true;
      await confirmRestorePreview();
      check('Confirmed restore preserves files and closes the dialog', bookings[0].guest !== 'Edited after preview' && taxPlan.expenses[0].attachment.dataUrl === image && !pendingRestore);
      check('Restore creates a recoverable before-state', visibleRecoverySnapshots().some(snapshot => snapshot.data.bookings?.some(item => item.guest === 'Edited after preview')));
      openRestorePreview(recordsOnly);
      cloudReady = false; syncCloudAuthUi();
      check('Session lock clears pending restore data and private preview', !pendingRestore && !document.querySelector('#restorePreview').textContent);
      cloudReady = true; syncCloudAuthUi();
      return results;
    });
    const importPayload = await page.evaluate(() => stripAttachmentImages(allAppData()));
    const originalFingerprint = await page.evaluate(() => workspaceFingerprint());
    await page.locator('#restoreBackup').setInputFiles({ name: 'test-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(importPayload)) });
    assert.equal(await page.locator('#restorePreview').isVisible(), true);
    assert.equal(await page.evaluate(() => workspaceFingerprint()), originalFingerprint);
    results.push('File import opens the review without replacing records');
    const downloadPending = page.waitForEvent('download');
    await page.locator('#restoreDownloadCurrent').click();
    const downloaded = await downloadPending;
    const savedExport = JSON.parse(fs.readFileSync(await downloaded.path(), 'utf8'));
    assert.ok(savedExport.taxPlan.expenses[0].attachment.dataUrl);
    assert.ok(savedExport.bookings[0].paymentLedger.length);
    assert.equal(savedExport.ownerId, 'test-owner');
    results.push('Pre-restore download contains full attachments and payment history');
    await page.locator('#restorePreview [data-restore-close]').first().click();
    assert.equal(await page.locator('#restoreBackup').inputValue(), '');
    results.push('Backup file input resets for repeat imports');
    fs.mkdirSync(output, { recursive: true });
    for (const width of [1440, 1080, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const state of ['payments', 'expenses', 'expense-form', 'booking-payments', 'booking-messages', 'expense-review', 'restore-preview']) {
        await page.evaluate(state => {
          document.querySelector('#bookingWorkspace').close();
          closeRestorePreview();
          document.querySelector('#expenseReview').open = state === 'expense-review';
          if (state === 'restore-preview') { showFinanceSection('expenses'); openRestorePreview(stripAttachmentImages(allAppData()), { label: 'Browser recovery point', recordsOnly: true }); }
          else if (state.startsWith('booking-')) openBookingWorkspace(bookings[0].id, state.slice(8));
          else {
            showFinanceSection(state === 'payments' ? 'payments' : 'expenses');
            document.querySelector('#expenseEntryDisclosure').open = state === 'expense-form';
          }
          window.scrollTo(0, 0);
        }, state);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, state + ' fits ' + width);
        if (state === 'restore-preview') assert.equal(await page.locator('#restoreComparison .workspace-table-scroll').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Restore differences fit without sideways scrolling');
        await page.screenshot({ path: `${output}/${width}-${state}.png` });
      }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ workflowChecks: results.length, checks: results, responsiveStates: 21, errors }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
