/* Pure financial helpers. Legacy totals remain unchanged until explicitly reconciled. */
const VillaLedger = (() => {
  const cents = value => Math.round((Number(value) || 0) * 100);
  const amount = value => value / 100;
  function normalize(entry) {
    return {
      id: String(entry.id || crypto.randomUUID()),
      kind: ['payment', 'opening', 'adjustment'].includes(entry.kind) ? entry.kind : 'payment',
      amountSen: Number.isSafeInteger(entry.amountSen) ? entry.amountSen : cents(entry.amount),
      originalAmountSen: Number.isSafeInteger(entry.originalAmountSen) ? entry.originalAmountSen : Number.isSafeInteger(entry.amountSen) ? entry.amountSen : cents(entry.amount),
      date: String(entry.date || ''),
      bank: String(entry.bank || ''),
      mode: String(entry.mode || ''),
      reference: String(entry.reference || ''),
      note: String(entry.note || ''),
      receiptId: String(entry.receiptId || ''),
      createdAt: String(entry.createdAt || new Date().toISOString()),
      voidedAt: String(entry.voidedAt || ''),
    };
  }
  function entries(booking) {
    if (Array.isArray(booking.paymentLedger)) return booking.paymentLedger.map(normalize);
    return cents(booking.paid) ? [normalize({
      id: 'legacy-' + booking.id, kind: 'opening', amountSen: cents(booking.paid),
      note: 'Previously recorded received total; transaction details not yet reconciled',
    })] : [];
  }
  const total = ledger => amount(ledger.reduce((sum, entry) => sum + (entry.voidedAt ? 0 : entry.amountSen), 0));
  const received = booking => Array.isArray(booking.paymentLedger) ? total(entries(booking)) : amount(cents(booking.paid));
  function withEntries(booking, ledger) {
    const normalized = ledger.map(normalize);
    if (normalized.some(entry => !Number.isSafeInteger(entry.amountSen)) || cents(total(normalized)) < 0) throw new Error('Invalid payment total.');
    if (new Set(normalized.map(entry => entry.id)).size !== normalized.length) throw new Error('Duplicate payment ID.');
    return { ...booking, paymentLedger: normalized, paid: total(normalized) };
  }
  function setTotal(booking, value, date = '', kind = 'adjustment') {
    const ledger = entries(booking);
    const difference = cents(value) - cents(total(ledger));
    if (difference) ledger.push(normalize({
      amountSen: difference, kind, date,
      note: kind === 'payment' ? 'Marked fully received' : 'Manual received-total correction',
    }));
    return withEntries(booking, ledger);
  }
  function append(booking, payment) {
    const entry = normalize(payment);
    if (entry.amountSen <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw new Error('Enter a positive payment amount and transaction date.');
    const ledger = entries(booking);
    if (ledger.some(item => item.id === entry.id)) throw new Error('This payment is already recorded.');
    return withEntries(booking, [...ledger, entry]);
  }
  function reconcile(booking, payments, receiptId) {
    const ledger = entries(booking);
    const incoming = payments.map(payment => normalize({ ...payment, receiptId }));
    if (incoming.some(entry => entry.amountSen <= 0 || !entry.date)) throw new Error('Every transfer needs an amount and date.');
    const fresh = incoming.filter(entry => !ledger.some(existing => existing.id === entry.id));
    const incomingTotal = fresh.reduce((sum, entry) => sum + entry.amountSen, 0);
    const openingTotal = ledger.filter(entry => !entry.voidedAt && entry.kind === 'opening').reduce((sum, entry) => sum + entry.amountSen, 0);
    if (incomingTotal > openingTotal) throw new Error('These transfers exceed the unreconciled received total. Record new money separately.');
    let remaining = incomingTotal;
    const next = ledger.map(entry => {
      if (entry.voidedAt || entry.kind !== 'opening' || !remaining) return entry;
      const used = Math.min(entry.amountSen, remaining);
      remaining -= used;
      return { ...entry, amountSen: entry.amountSen - used };
    });
    return withEntries(booking, [...next, ...fresh]);
  }
  return { cents, amount, normalize, entries, total, received, withEntries, setTotal, append, reconcile };
})();
