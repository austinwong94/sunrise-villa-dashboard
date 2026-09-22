function legacyMonthlyCosts(data = profitData) {
  return Object.entries(data || {}).flatMap(([monthKey, record]) => {
    if (!/^(Windmill:)?\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return [];
    const villa = monthKey.startsWith('Windmill:') ? 'Windmill' : 'Sunrise';
    return (record.oneOffCosts || []).map(cost => ({ monthKey, month: monthKey.slice(-7), property: villa + ' Villa', cost }));
  });
}

function sameLegacySource(a, b) {
  return Boolean(a && b && a.monthKey === b.monthKey && a.costId === b.costId);
}

function linkedLegacyExpense(monthKey, costId, expenses = taxPlan.expenses || []) {
  return expenses.find(expense => expense.financeMode === 'legacy' && sameLegacySource(expense.legacyCost, { monthKey, costId }));
}

function legacySourceFor(expense, costs = legacyMonthlyCosts()) {
  return costs.find(row => sameLegacySource(expense.legacyCost, { monthKey: row.monthKey, costId: row.cost.id }));
}

function validateLegacyExpenseLinks(data) {
  const seen = new Set();
  const costs = legacyMonthlyCosts(data.profitData);
  for (const expense of data.taxPlan?.expenses || []) {
    if (expense.financeMode !== 'legacy') continue;
    const row = legacySourceFor(expense, costs);
    const key = JSON.stringify(expense.legacyCost);
    if (!row || row.property !== expense.property || row.month !== expense.date.slice(0, 7) || VillaLedger.cents(row.cost.amount) !== VillaLedger.cents(expense.amount) || seen.has(key)) {
      throw new Error('A linked monthly cost is missing, duplicated or no longer matches its expense record. No records were changed.');
    }
    seen.add(key);
  }
}

function selectedLegacyExpenseSource() {
  try { return JSON.parse(document.querySelector('#expenseLegacyCost')?.value || 'null'); }
  catch { return null; }
}

function legacyExpenseCandidates(expense) {
  return legacyMonthlyCosts().filter(row => row.property === expense.property && row.month === expense.date.slice(0, 7)
    && VillaLedger.cents(row.cost.amount) === VillaLedger.cents(expense.amount));
}

function renderLegacyExpenseOptions(expense) {
  const select = document.querySelector('#expenseLegacyCost');
  if (!select) return;
  const saved = (taxPlan.expenses || []).find(item => item.id === els.taxExpenseId.value);
  const source = expense?.legacyCost || selectedLegacyExpenseSource() || saved?.legacyCost;
  const draft = { id: els.taxExpenseId.value, date: els.taxExpenseDate.value, property: els.taxExpenseProperty.value, amount: Number(els.taxExpenseAmount.value) };
  const rows = legacyMonthlyCosts().filter(row => {
    const linked = linkedLegacyExpense(row.monthKey, row.cost.id);
    const isExisting = saved?.financeMode === 'legacy' && sameLegacySource(saved.legacyCost, { monthKey: row.monthKey, costId: row.cost.id });
    return (!linked || linked.id === draft.id) && (isExisting || (row.property === draft.property && row.month === draft.date.slice(0, 7) && VillaLedger.cents(row.cost.amount) === VillaLedger.cents(draft.amount)));
  });
  select.innerHTML = '<option value="">Select matching monthly cost</option>' + rows.map(row => `<option value="${escapeHtml(JSON.stringify({ monthKey: row.monthKey, costId: row.cost.id }))}">${escapeHtml(row.cost.description || row.cost.category)} · ${escapeHtml(monthLabel(row.month))} · ${money(row.cost.amount)}</option>`).join('');
  select.value = source ? JSON.stringify(source) : '';
  const visible = document.querySelector('#expenseFinanceMode').value === 'legacy';
  document.querySelector('#expenseLegacyCostLabel').hidden = !visible;
  select.required = visible;
}

function validateExpenseFinanceChange(expense) {
  const existing = (taxPlan.expenses || []).find(item => item.id === expense.id);
  if (expense.financeMode === 'legacy') {
    const row = legacySourceFor(expense);
    const linked = row && linkedLegacyExpense(row.monthKey, row.cost.id);
    const editingLink = existing?.financeMode === 'legacy' && sameLegacySource(existing.legacyCost, expense.legacyCost);
    if (!row || row.property !== expense.property || row.month !== expense.date.slice(0, 7) || (linked && linked.id !== expense.id)
      || (!editingLink && VillaLedger.cents(row.cost.amount) !== VillaLedger.cents(expense.amount))) {
      throw new Error('Choose an unlinked monthly cost with the same property, month and amount. For an existing link, keep its property and month unchanged.');
    }
  }
  if (expense.financeMode === 'legacy' && existing?.financeMode === 'additional') {
    if (!window.confirm('Link these as the same cost? Finance currently includes both entries. Removing the duplicate charge will reduce Finance costs by ' + money(existing.amount) + '.')) return false;
  }
  const additionalChanged = !existing || existing.financeMode !== 'additional' || existing.property !== expense.property || existing.date.slice(0, 7) !== expense.date.slice(0, 7) || VillaLedger.cents(existing.amount) !== VillaLedger.cents(expense.amount);
  if (expense.financeMode === 'additional' && additionalChanged && legacyExpenseCandidates(expense).length) {
    if (!window.confirm('A monthly cost with the same property, month and amount already exists. Choose "Already in monthly costs" to link it without adding another charge. Is this definitely a separate additional cost?')) return false;
  }
  if (existing?.financeMode === 'legacy' && expense.financeMode !== 'legacy') {
    if (!window.confirm('Unlink this expense? The original monthly cost will stay in Finance. An additional expense will count separately.')) return false;
  }
  return true;
}

function prepareExpenseFinanceChange(expense) {
  if (expense.financeMode !== 'legacy') return profitData;
  const row = legacySourceFor(expense);
  if (!row) throw new Error('The linked monthly cost is no longer available.');
  return { ...profitData, [row.monthKey]: { ...profitData[row.monthKey], oneOffCosts: profitData[row.monthKey].oneOffCosts.map(cost => cost.id === row.cost.id ? { ...cost, amount: expense.amount } : cost) } };
}

function openLegacyCostRecord(monthKey, costId, expenseId) {
  const row = legacyMonthlyCosts().find(item => item.monthKey === monthKey && item.cost.id === costId);
  if (!row) return;
  const linked = linkedLegacyExpense(monthKey, costId);
  const matches = (taxPlan.expenses || []).filter(expense => ['unreviewed', 'tax-only', 'additional'].includes(expense.financeMode)
    && expense.property === row.property && expense.date.slice(0, 7) === row.month && VillaLedger.cents(expense.amount) === VillaLedger.cents(row.cost.amount));
  if (!linked && expenseId === undefined && matches.length) {
    const dialog = document.querySelector('#legacyExpenseMatch');
    dialog.innerHTML = `<header class="booking-workspace-head"><h2 id="legacyMatchTitle">Possible existing receipts</h2><button class="ghost-button" type="button" data-match-cancel>Cancel</button></header><p class="workspace-notice">${escapeHtml(row.cost.description || row.cost.category)} · ${money(row.cost.amount)} · ${escapeHtml(monthLabel(row.month))}</p><div class="expense-review-list">${matches.map(expense => `<div class="expense-review-row"><span><strong>${escapeHtml(expense.vendor || expense.category)}</strong><small>${shortDate(expense.date)} · ${escapeHtml(expense.receipt || 'No reference')}</small></span><button type="button" class="ghost-button" data-match-expense="${escapeHtml(expense.id)}" data-match-month="${escapeHtml(monthKey)}" data-match-cost="${escapeHtml(costId)}">Use existing</button></div>`).join('')}</div><button type="button" class="ghost-button" data-match-expense="" data-match-month="${escapeHtml(monthKey)}" data-match-cost="${escapeHtml(costId)}">None match: new receipt record</button>`;
    dialog.showModal();
    return;
  }
  showFinanceSection('expenses');
  if (linked) fillTaxExpenseForm(linked.id);
  else if (expenseId && matches.some(expense => expense.id === expenseId)) {
    fillTaxExpenseForm(expenseId);
    document.querySelector('#expenseFinanceMode').value = 'legacy';
    renderLegacyExpenseOptions({ legacyCost: { monthKey, costId } });
  } else {
    clearTaxExpenseForm();
    els.taxExpenseDate.value = '';
    els.taxExpenseProperty.value = row.property;
    els.taxExpenseAmount.value = row.cost.amount;
    els.taxExpenseNotes.value = row.cost.description;
    els.taxExpenseCategory.value = taxExpenseCategories.includes(row.cost.category) ? row.cost.category : 'Other';
    document.querySelector('#expenseFinanceMode').value = 'legacy';
    if (row.cost.receiptImage) {
      pendingTaxExpenseAttachment = { name: row.cost.receiptName || 'Receipt', type: 'image/jpeg', dataUrl: row.cost.receiptImage, attachedAt: new Date().toISOString() };
      els.taxExpenseAttachmentStatus.textContent = 'Attached: ' + pendingTaxExpenseAttachment.name;
    }
    renderLegacyExpenseOptions();
    showSaveStatus(els.taxExpenseSaveStatus, 'Monthly cost: ' + monthLabel(row.month) + '. Enter the actual receipt date before linking.');
  }
  document.querySelector('#expenseEntryDisclosure').open = true;
  els.taxExpenseDate.focus();
  els.taxExpenseForm.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function renderExpenseReview() {
  const host = document.querySelector('#expenseReview');
  if (!host) return;
  const filters = taxExpenseFilters();
  const property = filters.property === 'Selected' ? activeVillaKey() + ' Villa' : filters.property;
  const legacy = legacyMonthlyCosts().filter(row => Number(row.month.slice(0, 4)) === filters.year && (property === 'All' || row.property === property) && (filters.month === 'All' || row.month.slice(5) === filters.month));
  const pending = filteredTaxExpenses().filter(expense => expense.financeMode === 'unreviewed');
  const unlinked = legacy.filter(row => !linkedLegacyExpense(row.monthKey, row.cost.id));
  host.querySelector('summary').textContent = `Review older costs · ${pending.length} awaiting review · ${unlinked.length} unlinked costs`;
  host.querySelector('.expense-review-body').innerHTML = `<h3>Expense records awaiting Finance review</h3><div class="expense-review-list">${pending.map(expense => `<div class="expense-review-row"><span><strong>${escapeHtml(expense.vendor || expense.category)}</strong><small>${shortDate(expense.date)} · ${escapeHtml(expense.property)} · ${money(expense.amount)}</small></span><button type="button" class="ghost-button" data-review-expense="${expense.id}">Review</button></div>`).join('') || '<p class="recovery-fineprint">No unreconciled expense records in this filter.</p>'}</div>
    <h3>Monthly costs already included in Finance</h3><div class="expense-review-list">${legacy.map(row => {
      const linked = linkedLegacyExpense(row.monthKey, row.cost.id);
      return `<div class="expense-review-row"><span><strong>${escapeHtml(row.cost.description || row.cost.category)}</strong><small>${escapeHtml(monthLabel(row.month))} · ${escapeHtml(row.property)} · ${money(row.cost.amount)}${linked ? ' · Linked' : ''}</small></span><button type="button" class="ghost-button" data-legacy-month="${escapeHtml(row.monthKey)}" data-legacy-cost="${escapeHtml(row.cost.id)}">${linked ? 'Open record' : 'Link receipt'}</button></div>`;
    }).join('') || '<p class="recovery-fineprint">No older itemized monthly costs in this period.</p>'}</div>`;
}

function initializeExpenseReview() {
  const label = document.createElement('label');
  label.id = 'expenseLegacyCostLabel'; label.hidden = true;
  label.innerHTML = 'Original monthly cost<select id="expenseLegacyCost"><option value="">Select matching monthly cost</option></select>';
  document.querySelector('#expenseFinanceMode').closest('.form-grid').append(label);
  [els.taxExpenseDate, els.taxExpenseAmount, els.taxExpenseProperty, document.querySelector('#expenseFinanceMode')].forEach(control => control.addEventListener('change', () => renderLegacyExpenseOptions()));
  const review = document.createElement('details');
  review.id = 'expenseReview'; review.className = 'expense-imports expense-review';
  review.innerHTML = '<summary>Review older costs</summary><div class="expense-review-body"></div>';
  document.querySelector('.expense-imports').before(review);
  review.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.dataset.reviewExpense) { fillTaxExpenseForm(button.dataset.reviewExpense); els.taxExpenseForm.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    if (button?.dataset.legacyCost) openLegacyCostRecord(button.dataset.legacyMonth, button.dataset.legacyCost);
  });
  const dialog = document.createElement('dialog');
  dialog.id = 'legacyExpenseMatch'; dialog.className = 'booking-workspace';
  dialog.setAttribute('aria-labelledby', 'legacyMatchTitle');
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.replaceChildren());
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.hasAttribute('data-match-cancel')) dialog.close();
    if (button?.hasAttribute('data-match-expense')) {
      const { matchMonth, matchCost, matchExpense } = button.dataset;
      dialog.close();
      openLegacyCostRecord(matchMonth, matchCost, matchExpense || null);
    }
  });
  renderExpenseReview();
}

initializeExpenseReview();
