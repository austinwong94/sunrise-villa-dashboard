let bookingWorkspaceId = '';
let bookingWorkspaceTab = 'overview';
let financeSection = 'reports';
let workspacePaymentDirty = false;

function bookingReceiptPayments(booking) {
  return VillaLedger.entries(booking).filter(entry => !entry.voidedAt && entry.kind === 'payment' && entry.date)
    .map(entry => normalizePayment({ ...entry, amount: VillaLedger.amount(entry.amountSen) }));
}

function updateBookingRecord(next, reason) {
  createRecoverySnapshot(reason);
  bookings = bookings.map(booking => booking.id === next.id ? next : booking);
  saveBookings();
  renderAll();
}

function openBookingWorkspace(id, tab = 'overview') {
  if (!bookings.some(booking => booking.id === id)) return;
  bookingWorkspaceId = id;
  bookingWorkspaceTab = tab;
  workspacePaymentDirty = false;
  renderBookingWorkspace();
  const dialog = document.querySelector('#bookingWorkspace');
  if (!dialog.open) dialog.showModal();
}

function closeBookingWorkspace() {
  if (workspacePaymentDirty && !window.confirm('Discard the unrecorded payment?')) return false;
  document.querySelector('#bookingWorkspace').close();
  workspacePaymentDirty = false;
  return true;
}

function renderBookingWorkspace() {
  const booking = bookings.find(item => item.id === bookingWorkspaceId);
  if (!booking) return;
  const host = document.querySelector('#bookingWorkspace');
  const ledger = VillaLedger.entries(booking);
  const unresolved = ledger.filter(entry => entry.kind === 'opening' && !entry.voidedAt).reduce((sum, entry) => sum + entry.amountSen, 0);
  const docs = documents.filter(doc => doc.bookingId === booking.id);
  host.innerHTML = `
    <header class="booking-workspace-head"><div><h2 id="bookingWorkspaceTitle">${escapeHtml(booking.guest)}</h2><p>${escapeHtml(villaOf(booking))} Villa · ${shortDate(booking.arrival)} to ${shortDate(departureFor(booking))}</p></div><button class="ghost-button" type="button" data-workspace-close aria-label="Close booking">Close</button></header>
    <div class="workspace-metrics"><span>Total due<strong>${money(totalToReceiveFor(booking))}</strong></span><span>Received<strong>${money(booking.paid)}</strong></span><span>Outstanding<strong>${money(balanceFor(booking))}</strong></span><span>Deposit to refund<strong>${money(refundPendingFor(booking))}</strong></span></div>
    <nav class="workspace-tabs" aria-label="Booking sections">${['overview', 'payments', 'documents', 'messages'].map(tab => `<button type="button" class="ghost-button ${tab === bookingWorkspaceTab ? 'active' : ''}" aria-pressed="${tab === bookingWorkspaceTab}" data-booking-section="${tab}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join('')}</nav>
    <section ${bookingWorkspaceTab === 'overview' ? '' : 'hidden'}>
      <dl class="booking-facts"><div><dt>Contact</dt><dd>${escapeHtml(booking.contact || 'Not recorded')}</dd></div><div><dt>Channel</dt><dd>${escapeHtml(booking.channel)}</dd></div><div><dt>Stay status</dt><dd>${escapeHtml(booking.status)}</dd></div><div><dt>Nights</dt><dd>${booking.nights}</dd></div><div><dt>Accommodation</dt><dd>${money(booking.revenue)}</dd></div><div><dt>Security deposit</dt><dd>${money(booking.depositAmount)}</dd></div></dl>
      <button type="button" class="primary-button" data-workspace-edit>Edit booking</button>
      ${booking.incidentLog ? `<h3>Notes</h3><p>${escapeMultiline(booking.incidentLog)}</p>` : ''}
    </section>
    <section ${bookingWorkspaceTab === 'payments' ? '' : 'hidden'}>
      ${unresolved ? `<p class="workspace-notice">${money(VillaLedger.amount(unresolved))} was recorded before transaction details. Match transfers below to preserve the received total.</p>` : ''}
      <form id="workspacePaymentForm" class="workspace-payment-form">
        <label>Payment action<select name="action"><option value="new">New money received</option>${unresolved ? '<option value="match">Match previously recorded money</option>' : ''}</select></label>
        <label>Amount (RM)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
        <label>Transaction date<input name="date" type="date" required value="${isoDate(new Date())}" /></label>
        <label>Bank / method<input name="bank" placeholder="Bank transfer, cash" /></label>
        <label class="wide-field">Reference<input name="reference" autocomplete="off" /></label>
        <label class="workspace-check"><input name="deposit" type="checkbox" ${booking.depositPaid ? 'checked' : ''} /> Security deposit received</label>
        <button class="primary-button" type="submit">Record payment</button>
      </form>
      <p id="workspacePaymentStatus" role="status"></p>
      <div class="workspace-table-scroll"><table class="workspace-table"><thead><tr><th>Date</th><th>Bank / reference</th><th>Amount</th><th>Status</th></tr></thead><tbody>${ledger.length ? ledger.map(entry => `<tr><td>${entry.date ? shortDate(entry.date) : 'Not recorded'}</td><td>${escapeHtml(entry.bank || entry.note || 'Payment')}<small>${escapeHtml(entry.reference)}</small></td><td class="money-cell">${money(VillaLedger.amount(entry.amountSen))}</td><td>${entry.voidedAt ? 'Voided' : entry.kind === 'opening' ? 'To reconcile' : entry.kind === 'adjustment' ? 'Correction' : `<button type="button" class="small-action danger" data-void-payment="${escapeHtml(entry.id)}">Void</button>`}</td></tr>`).join('') : '<tr><td colspan="4">No money recorded.</td></tr>'}</tbody></table></div>
    </section>
    <section ${bookingWorkspaceTab === 'documents' ? '' : 'hidden'}>
      <div class="workspace-actions"><button class="primary-button" type="button" data-booking-document="Official Receipt">Create receipt</button><button class="ghost-button" type="button" data-booking-document="Invoice">Create invoice</button></div>
      <div class="workspace-document-list">${docs.length ? docs.map(doc => `<button class="workspace-document-row" type="button" data-booking-open-document="${doc.id}"><strong>${escapeHtml(doc.code)}</strong><span>${escapeHtml(doc.type)} · ${shortDate(doc.date)} · ${escapeHtml(doc.status)}</span></button>`).join('') : '<p>No linked documents.</p>'}</div>
    </section>
    <section ${bookingWorkspaceTab === 'messages' ? '' : 'hidden'}>
      ${[['checkin', 'Check-in details'], ['guide', 'Guest guide'], ['review', 'Review request']].map(([type, label]) => `<div class="workspace-message-row"><span><strong>${label}</strong><small>${type === 'checkin' ? hasCheckinBeenSent(booking) ? 'Marked sent' : 'Not marked sent' : booking.sentLog?.[type] ? 'Marked sent ' + shortDate(booking.sentLog[type]) : 'Not marked sent'}</small></span><button type="button" class="ghost-button" data-booking-message="${type}">Open WhatsApp</button><button type="button" class="ghost-button" data-booking-message-done="${type}">Mark sent</button></div>`).join('')}
    </section>`;
}

function recordWorkspacePayment(event) {
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  const booking = bookings.find(item => item.id === bookingWorkspaceId);
  const values = new FormData(form);
  const payment = VillaLedger.normalize({ amount: values.get('amount'), date: values.get('date'), bank: values.get('bank'), reference: values.get('reference') });
  try {
    rejectDuplicateTransfer(booking, [payment]);
    let next = values.get('action') === 'match' ? VillaLedger.reconcile(booking, [payment], '') : VillaLedger.append(booking, payment);
    next.depositPaid = Boolean(values.get('deposit'));
    if (!next.depositPaid) next.depositRefunded = false;
    updateBookingRecord(next, 'Before recording payment');
    workspacePaymentDirty = false;
    renderBookingWorkspace();
    document.querySelector('#workspacePaymentStatus').textContent = 'Payment recorded. Check cloud save status before closing.';
  } catch (error) { document.querySelector('#workspacePaymentStatus').textContent = error.message; }
}

function rejectDuplicateTransfer(booking, entries) {
  const existing = VillaLedger.entries(booking);
  const seen = [];
  entries.forEach(entry => {
    const sameId = existing.find(item => item.id === entry.id);
    if (sameId && (sameId.voidedAt || sameId.amountSen !== entry.amountSen || sameId.date !== entry.date || sameId.reference !== entry.reference || sameId.bank !== entry.bank)) throw new Error('A linked transfer was changed or voided. Correct it in the booking payment history first.');
    if (!sameId && [...existing, ...seen].some(item => !item.voidedAt && item.reference && item.reference === entry.reference && item.date === entry.date && item.amountSen === entry.amountSen)) throw new Error('A transfer with this date, reference and amount is already recorded.');
    seen.push(entry);
  });
}

function recordReceiptPayments() {
  if (!validateDocumentForm()) return;
  const doc = formDocument();
  const booking = bookings.find(item => item.id === doc.bookingId);
  if (!booking) { setDocumentFeedback('Select a booking before recording these payments.'); return; }
  const incoming = doc.payments.map(payment => VillaLedger.normalize({ ...payment, receiptId: doc.id }));
  try {
    rejectDuplicateTransfer(booking, incoming);
    const mode = document.querySelector('#receiptPostingMode').value;
    const fresh = incoming.filter(entry => !VillaLedger.entries(booking).some(item => item.id === entry.id));
    if (!fresh.length) { setDocumentFeedback('These payments are already recorded.'); return; }
    const total = VillaLedger.total(fresh);
    if (!window.confirm(`${mode === 'match' ? 'Match' : 'Record'} ${money(total)} for ${booking.guest}? ${mode === 'match' ? 'The received total will stay unchanged.' : 'This increases the booking received total.'}`)) return;
    const next = mode === 'match' ? VillaLedger.reconcile(booking, incoming, doc.id) : fresh.reduce((current, payment) => VillaLedger.append(current, payment), booking);
    updateBookingRecord(next, 'Before posting receipt payments');
    setDocumentFeedback('Payments recorded in the booking. Save the receipt to keep this document.', true);
    renderDocumentPreview();
  } catch (error) { setDocumentFeedback(error.message); }
}

function receiptPreviouslyReceived(doc) {
  const booking = bookings.find(item => item.id === doc.bookingId);
  if (!booking || !Array.isArray(booking.paymentLedger)) return Number(doc.previouslyReceived || 0);
  const ids = new Set(doc.payments.map(payment => payment.id));
  return Math.max(0, VillaLedger.total(VillaLedger.entries(booking).filter(entry => !ids.has(entry.id))));
}

function financeExpenses(monthValue, villa = activeVillaKey()) {
  return (taxPlan.expenses || []).filter(expense => ['additional', 'commitment'].includes(expense.financeMode)
    && expense.property === villa + ' Villa' && expense.date.slice(0, 7) === monthValue);
}

function unifiedExpenseBreakdown(monthValue, baseline) {
  const breakdown = { ...baseline };
  const rows = financeExpenses(monthValue);
  rows.filter(expense => expense.financeMode === 'additional').forEach(expense => {
    const bucket = oneOffCostBucket({ category: expense.category, description: expense.notes });
    breakdown[bucket] += Number(expense.amount || 0);
    breakdown.adHoc += Number(expense.amount || 0);
  });
  const replacements = new Map();
  rows.filter(expense => expense.financeMode === 'commitment').forEach(expense => {
    replacements.set(expense.commitmentId, (replacements.get(expense.commitmentId) || 0) + Number(expense.amount || 0));
  });
  replacements.forEach((actual, id) => {
    const commitment = (appSettings.commitments || []).find(item => item.id === id && (item.villa || 'Sunrise') === activeVillaKey());
    if (!commitment) { breakdown.other += actual; breakdown.adHoc += actual; return; }
    const planned = commitmentActiveInMonth(commitment, monthValue) ? commitmentAmountFor(commitment, monthValue) : 0;
    breakdown[commitmentBucket(commitment)] += actual - planned;
    breakdown.commitments += actual - planned;
  });
  breakdown.total = ['housekeeping', 'maintenance', 'utilities', 'propertyLoan', 'loans', 'supplies', 'other'].reduce((sum, key) => sum + breakdown[key], 0);
  return breakdown;
}

function renderExpenseFinanceOptions(expense) {
  const select = document.querySelector('#expenseFinanceMode');
  if (!select) return;
  select.value = expense ? expense.financeMode || 'unreviewed' : 'additional';
  const commitments = appSettings.commitments || [];
  document.querySelector('#expenseCommitment').innerHTML = '<option value="">Choose commitment</option>' + commitments.map(item => `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(item.villa || 'Sunrise')}</option>`).join('');
  document.querySelector('#expenseCommitment').value = expense?.commitmentId || '';
  document.querySelector('#expenseCommitmentLabel').hidden = select.value !== 'commitment';
  if (typeof renderLegacyExpenseOptions === 'function') renderLegacyExpenseOptions(expense);
}

function showFinanceSection(mode) {
  financeSection = ['reports', 'payments', 'expenses'].includes(mode) ? mode : 'reports';
  setView('dashboard');
  document.querySelectorAll('[data-finance-section]').forEach(button => {
    const selected = button.dataset.financeSection === financeSection;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelector('#financeReports').hidden = financeSection !== 'reports';
  document.querySelector('#financePayments').hidden = financeSection !== 'payments';
  document.querySelector('#financeExpenses').hidden = financeSection !== 'expenses';
  if (financeSection === 'reports') renderDashboard();
  if (financeSection === 'payments') renderFinancePayments();
  if (financeSection === 'expenses') { renderTaxExpenses(); renderExpenseFinanceOptions((taxPlan.expenses || []).find(item => item.id === els.taxExpenseId.value)); }
}

function renderFinancePayments() {
  const host = document.querySelector('#financePayments');
  if (!host) return;
  const list = scopedBookings().filter(booking => !isExcludedBooking(booking));
  const cash = list.flatMap(booking => VillaLedger.entries(booking)).filter(entry => !entry.voidedAt && entry.kind === 'payment' && entry.date.startsWith(selectedMonth));
  const legacy = list.flatMap(booking => VillaLedger.entries(booking)).filter(entry => !entry.voidedAt && entry.kind === 'opening');
  const open = list.filter(booking => balanceFor(booking) > 0 || refundPendingFor(booking) > 0).sort((a, b) => a.arrival.localeCompare(b.arrival));
  host.innerHTML = `<div class="workspace-metrics"><span>Recorded transfers · ${escapeHtml(monthLabel(selectedMonth))}<strong>${money(VillaLedger.total(cash))}</strong></span><span>Historical receipts to reconcile · all dates<strong>${money(VillaLedger.total(legacy))}</strong></span></div><h3>Open balances and deposits · all dates</h3><div class="workspace-table-scroll"><table class="workspace-table"><thead><tr><th>Guest</th><th>Arrival</th><th>Received</th><th>Outstanding</th><th>Deposit to refund</th></tr></thead><tbody>${open.map(booking => `<tr><td><button type="button" class="workspace-link" data-workspace-booking="${booking.id}">${escapeHtml(booking.guest)}</button></td><td>${shortDate(booking.arrival)}</td><td class="money-cell">${money(booking.paid)}</td><td class="money-cell">${money(balanceFor(booking))}</td><td class="money-cell">${money(refundPendingFor(booking))}</td></tr>`).join('') || '<tr><td colspan="5">No open balances or deposits.</td></tr>'}</tbody></table></div>`;
}

function renderWorkflowShell() {
  document.body.dataset.workspaceView = activeView;
  document.body.dataset.financeSection = financeSection;
  document.querySelector('[data-view="bookings"]')?.classList.toggle("active", activeView === "bookings" || activeView === "guests");
  if (activeView === 'dashboard') els.pageTitle.textContent = 'Finance';
  if (activeView === 'guide') els.pageTitle.textContent = 'Settings';
  if (activeView === 'dashboard' && financeSection === 'payments') renderFinancePayments();
}

function initializeWorkflowUI() {
  const dialog = document.createElement('dialog');
  dialog.id = 'bookingWorkspace';
  dialog.className = 'booking-workspace';
  dialog.setAttribute('aria-labelledby', 'bookingWorkspaceTitle');
  document.body.append(dialog);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeBookingWorkspace(); });
  dialog.addEventListener('input', event => { if (event.target.closest('#workspacePaymentForm')) workspacePaymentDirty = true; });
  dialog.addEventListener('submit', event => { if (event.target.id === 'workspacePaymentForm') recordWorkspacePayment(event); });
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const booking = bookings.find(item => item.id === bookingWorkspaceId);
    if (button.hasAttribute('data-workspace-close')) closeBookingWorkspace();
    if (button.dataset.bookingSection) {
      if (workspacePaymentDirty && !window.confirm('Discard the unrecorded payment?')) return;
      workspacePaymentDirty = false;
      bookingWorkspaceTab = button.dataset.bookingSection;
      renderBookingWorkspace();
    }
    if (button.hasAttribute('data-workspace-edit') && closeBookingWorkspace()) openBookingDialog(booking, true);
    if (button.dataset.voidPayment && window.confirm('Void this transfer? Its history will remain and the received total will decrease. Any issued receipt must be amended separately.')) {
      const ledger = VillaLedger.entries(booking).map(entry => entry.id === button.dataset.voidPayment ? { ...entry, voidedAt: new Date().toISOString() } : entry);
      try { updateBookingRecord(VillaLedger.withEntries(booking, ledger), 'Before voiding payment'); renderBookingWorkspace(); }
      catch (error) { window.alert(error.message); }
    }
    if (button.dataset.bookingDocument && confirmDocumentReplacement() && closeBookingWorkspace()) {
      setView('documents');
      els.docType.value = button.dataset.bookingDocument;
      prefillDocFromBooking(booking.id);
      setDocumentFeedback('Unsaved document', true);
    }
    if (button.dataset.bookingOpenDocument && confirmDocumentReplacement() && closeBookingWorkspace()) {
      setView('documents');
      fillDocumentForm(documents.find(doc => doc.id === button.dataset.bookingOpenDocument));
    }
    if (button.dataset.bookingMessage) openWhatsappForBooking(booking, button.dataset.bookingMessage);
    if (button.dataset.bookingMessageDone) { markNudgeSent(booking.id, button.dataset.bookingMessageDone); renderDetails(); renderBookingWorkspace(); }
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-workspace-booking]');
    if (target) openBookingWorkspace(target.dataset.workspaceBooking, 'payments');
  });
  window.addEventListener('beforeunload', event => {
    if (workspacePaymentDirty) { event.preventDefault(); event.returnValue = ''; }
  });

  const receiptTools = document.createElement('div');
  receiptTools.className = 'receipt-posting-tools';
  receiptTools.innerHTML = '<label>Booking payment action<select id="receiptPostingMode"><option value="match">Match previously recorded money</option><option value="new">New money received</option></select></label><button type="button" class="ghost-button" id="recordReceiptPayments">Record in booking</button><span class="helper-text">Saving or duplicating a document does not record money.</span>';
  els.receiptPaymentSection.append(receiptTools);
  document.querySelector('#recordReceiptPayments').addEventListener('click', recordReceiptPayments);

  const dashboard = document.querySelector('#dashboardView');
  const reports = document.createElement('div');
  reports.id = 'financeReports';
  while (dashboard.firstChild) reports.append(dashboard.firstChild);
  const nav = document.createElement('nav');
  nav.className = 'workspace-tabs';
  nav.setAttribute('aria-label', 'Finance');
  nav.innerHTML = ['reports', 'payments', 'expenses'].map(mode => `<button type="button" class="ghost-button ${mode === 'reports' ? 'active' : ''}" data-finance-section="${mode}" aria-pressed="${mode === 'reports'}">${mode[0].toUpperCase() + mode.slice(1)}</button>`).join('');
  nav.addEventListener('click', event => { if (event.target.dataset.financeSection) showFinanceSection(event.target.dataset.financeSection); });
  const payments = document.createElement('section');
  payments.id = 'financePayments'; payments.hidden = true;
  const expenses = document.createElement('section');
  expenses.id = 'financeExpenses'; expenses.hidden = true;
  const expensePanel = document.querySelector('[data-tax-inner-panel="expenses"]');
  expensePanel.classList.add('unified-expenses');
  expenses.append(expensePanel);
  dashboard.append(nav, reports, payments, expenses);
  document.querySelector('[data-view="dashboard"]').lastChild.textContent = 'Finance';

  const imports = document.createElement('details');
  imports.className = 'expense-imports';
  imports.innerHTML = '<summary>Import receipts</summary>';
  imports.append(document.querySelector('#taxScanCard'), document.querySelector('#taxBatchCard'));
  expensePanel.append(imports);
  const entry = document.querySelector('.tax-expense-entry');
  const entryDisclosure = document.createElement('details');
  entryDisclosure.id = 'expenseEntryDisclosure';
  entryDisclosure.className = 'expense-entry-disclosure';
  entryDisclosure.innerHTML = '<summary>Add / edit expense</summary>';
  entry.before(entryDisclosure);
  entryDisclosure.append(entry);
  const financeFields = document.createElement('div');
  financeFields.className = 'form-grid two-col';
  financeFields.innerHTML = '<label>Finance reporting<select id="expenseFinanceMode"><option value="additional">Additional actual expense</option><option value="commitment">Replaces a recurring commitment</option><option value="legacy">Already in monthly costs</option><option value="tax-only">Tax record only</option><option value="unreviewed">Existing record: not reconciled</option></select></label><label id="expenseCommitmentLabel" hidden>Recurring commitment<select id="expenseCommitment"></select></label>';
  els.taxExpenseForm.querySelector('.tax-expense-grid').after(financeFields);
  document.querySelector('#expenseFinanceMode').addEventListener('change', event => {
    document.querySelector('#expenseCommitmentLabel').hidden = event.target.value !== 'commitment';
  });
  renderExpenseFinanceOptions();

  const guideNav = document.querySelector('[data-view="guide"]');
  guideNav.lastChild.textContent = 'Settings';
  guideNav.title = 'Settings';
  document.querySelector('.nav-tabs').append(guideNav);
  const settingsTools = document.createElement('div');
  settingsTools.className = 'workspace-settings-tools';
  settingsTools.append(document.querySelector('#themeMenu'));
  const backup = document.createElement('button');
  backup.type = 'button'; backup.className = 'ghost-button'; backup.textContent = 'Download backup';
  backup.addEventListener('click', downloadBackup);
  settingsTools.append(backup);
  document.querySelector('#guideView').prepend(settingsTools);

  const bookingSource = els.docFromBooking.closest("label");
  bookingSource.classList.add("document-booking-source");
  bookingSource.querySelector(".form-hint")?.remove();
  document.querySelector(".document-editor-tools").prepend(bookingSource);
  const documentPreviewSwitch = document.createElement('div');
  documentPreviewSwitch.className = 'workspace-tabs document-mobile-switch';
  documentPreviewSwitch.innerHTML = '<button type="button" class="ghost-button active" data-mobile-document="editor">Editor</button><button type="button" class="ghost-button" data-mobile-document="preview">Preview</button><button type="button" class="ghost-button" data-mobile-print>Print / PDF</button>';
  documentPreviewSwitch.addEventListener('click', event => {
    if (event.target.hasAttribute('data-mobile-print')) {
      if (!els.documentForm.checkValidity()) {
        document.querySelector('#documentsView').dataset.mobileDocument = 'editor';
        documentPreviewSwitch.querySelector('[data-mobile-document="editor"]').click();
      }
      printDocumentPreview();
      return;
    }
    const mode = event.target.dataset.mobileDocument;
    if (!mode) return;
    document.querySelector('#documentsView').dataset.mobileDocument = mode;
    documentPreviewSwitch.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.mobileDocument === mode));
    if (mode === 'preview') renderDocumentPreview();
  });
  document.querySelector('.documents-layout').before(documentPreviewSwitch);
  const propertyFilter = document.createElement("label");
  propertyFilter.innerHTML = '<span>Property</span><select id="expensePropertyFilter"><option value="Selected">Selected property</option><option value="All">All properties</option><option>Sunrise Villa</option><option>Windmill Villa</option><option>Shared</option></select>';
  document.querySelector(".tax-expense-toolbar").prepend(propertyFilter);
  propertyFilter.querySelector("select").addEventListener("change", renderTaxExpenses);

  const rates = document.createElement("details");
  rates.className = "quote-rate-options";
  rates.innerHTML = '<summary>Rates and night breakdown</summary><div class="quote-grid"></div>';
  const quoteGrid = document.querySelector(".quote-card > .quote-grid");
  quoteGrid.after(rates);
  ["quoteWeekdayNights", "quoteWeekendNights", "quoteHolidayNights", "quoteWeekdayRate", "quoteWeekendRate", "quoteHolidayRate", "quoteCleaningFee"].forEach(id => rates.querySelector(".quote-grid").append(document.querySelector("#" + id).closest("label")));
  ["quoteTemplateInput", "checkinTemplateInput", "guideTemplateInput", "reminderTemplateInput"].forEach(id => {
    const label = document.querySelector("#" + id)?.closest("label");
    if (!label) return;
    const editor = document.createElement("details");
    editor.className = "template-editor";
    editor.innerHTML = "<summary>Edit template</summary>";
    label.before(editor);
    editor.append(label);
    const hint = editor.nextElementSibling;
    if (hint?.classList.contains("helper-text")) editor.append(hint);
  });
  [["openQuoteMessage", "Open WhatsApp"], ["openWhatsappMessage", "Open WhatsApp"], ["openGuideMessage", "Open WhatsApp"], ["openReminderMessage", "Open WhatsApp"]].forEach(([id, label]) => {
    const button = document.querySelector("#" + id); if (button) button.textContent = label;
  });
  const guestTab = document.querySelector('[data-view="guests"]');
  const bookingTabs = document.createElement("div");
  bookingTabs.className = "workspace-tabs booking-subnav";
  bookingTabs.append(guestTab);
  document.querySelector("#bookingsView").prepend(bookingTabs);
  const returnToBookings = document.createElement("button");
  returnToBookings.type = "button"; returnToBookings.className = "ghost-button"; returnToBookings.textContent = "All bookings";
  returnToBookings.addEventListener("click", () => { setView("bookings"); renderBookingsTable(); });
  document.querySelector("#guestsView").prepend(returnToBookings);
  renderWorkflowShell();
}

initializeWorkflowUI();
