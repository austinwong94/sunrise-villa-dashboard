let pendingRestore = null;

function workspaceFingerprint() {
  return JSON.stringify([bookings, documents, taxPlan, profitData, appSettings]);
}

function restoreCollections(data) {
  return [
    ['Bookings', data.bookings || []],
    ['Documents', data.documents || []],
    ['Expense records', data.taxPlan?.expenses || []],
    ['Assets', data.taxPlan?.assets || []],
    ['Past earnings', data.taxPlan?.earnings || []],
    ['Earnings files', data.taxPlan?.earningsDocs || []],
    ['Tax reference files', data.taxPlan?.lhdnDocs || []],
    ['Recurring commitments', data.appSettings?.commitments || []],
    ['Guest profiles', Object.entries(data.appSettings?.guestProfiles || {}).map(([id, value]) => ({ ...value, id }))],
    ['Calendar connections', data.appSettings?.ical?.sources || []],
    ['Imported calendar blocks', data.appSettings?.ical?.imported || []],
    ['Tax year rules', Object.entries(data.taxPlan?.yearProfiles || {}).map(([id, value]) => ({ ...value, id }))],
    ['Monthly cost records', Object.entries(data.profitData || {}).map(([id, value]) => ({ ...value, id }))],
    ['Booking transfers', (data.bookings || []).flatMap(booking => (booking.paymentLedger || []).map(entry => ({ ...entry, id: booking.id + ':' + entry.id })))],
  ];
}

function restoreComparison(before, after) {
  const previous = new Map(restoreCollections(before));
  return restoreCollections(after).map(([label, rows]) => {
    const oldRows = previous.get(label);
    const old = new Map(oldRows.map((item, index) => [item.id || 'row:' + index, item]));
    const next = new Map(rows.map((item, index) => [item.id || 'row:' + index, item]));
    return { label, before: oldRows.length, after: rows.length,
      added: [...next.keys()].filter(id => !old.has(id)).length,
      removed: [...old.keys()].filter(id => !next.has(id)).length,
      changed: [...next.keys()].filter(id => old.has(id) && JSON.stringify(old.get(id)) !== JSON.stringify(next.get(id))).length };
  });
}

// Only recover an attachment from the same record AND filename, never another guest's file.
function attachmentSlots(data) {
  const slots = [];
  for (const key of ['expenses', 'assets']) {
    for (const row of data.taxPlan?.[key] || []) if (row.attachment) slots.push({ key: key + ':' + row.id, object: row.attachment, field: 'dataUrl', name: row.attachment.name });
  }
  for (const key of ['earningsDocs', 'lhdnDocs']) {
    for (const row of data.taxPlan?.[key] || []) slots.push({ key: key + ':' + row.id, object: row, field: 'dataUrl', name: row.name || row.filename || '' });
  }
  for (const [month, record] of Object.entries(data.profitData || {})) {
    for (const cost of record.oneOffCosts || []) slots.push({ key: 'cost:' + month + ':' + cost.id, object: cost, field: 'receiptImage', name: cost.receiptName });
  }
  return slots;
}

function prepareRestorePreview(data, keepAttachments = true) {
  const staged = JSON.parse(JSON.stringify(prepareRestoreData(data)));
  const current = new Map(attachmentSlots(allAppData()).map(slot => [slot.key, slot]));
  let retained = 0;
  for (const slot of attachmentSlots(staged)) {
    const old = current.get(slot.key);
    if (keepAttachments && !slot.object[slot.field] && slot.name && slot.name === old?.name && old.object[old.field]) {
      slot.object[slot.field] = old.object[old.field];
      retained += 1;
    }
  }
  const slots = attachmentSlots(staged);
  return { staged, retained, attached: slots.filter(slot => slot.object[slot.field]).length,
    missing: slots.filter(slot => slot.name && !slot.object[slot.field]).length,
    comparisons: restoreComparison(allAppData(), staged) };
}

function closeRestorePreview() {
  pendingRestore = null;
  const dialog = document.querySelector('#restorePreview');
  if (dialog?.open) dialog.close();
  dialog?.replaceChildren();
}

function openRestorePreview(data, source = {}) {
  if (!cloudUser || !cloudReady) throw new Error('Log in and load your workspace before restoring.');
  if (cloudConflict) throw new Error('Resolve the cloud save conflict before restoring a backup.');
  validateBackupData(data);
  const owner = source.ownerId || data.ownerId;
  if (owner && owner !== cloudUser.id) throw new Error('This backup belongs to a different account. No records were changed.');
  pendingRestore = { data: JSON.parse(JSON.stringify(data)), source, ownerId: cloudUser.id, baseline: workspaceFingerprint() };
  const dialog = document.querySelector('#restorePreview');
  dialog.innerHTML = `<header class="booking-workspace-head"><div><h2 id="restorePreviewTitle">Review backup restore</h2><p>${escapeHtml(source.label || 'Backup file')}</p></div><button class="ghost-button" type="button" data-restore-close>Cancel</button></header>
    <p class="workspace-notice">This replaces records in the backup's collections; it does not merge them. Collections absent from older backups stay unchanged.${source.recordsOnly ? ' Browser recovery points may not contain receipt images.' : ''}</p>
    <label class="recovery-option"><input type="checkbox" id="restoreKeepAttachments" checked /> Keep matching current attachments missing from this backup</label>
    <div id="restoreComparison"></div>
    <div class="recovery-protection"><div class="workspace-actions"><button class="ghost-button" type="button" id="restoreDownloadEncrypted">Encrypted current backup</button><button class="ghost-button" type="button" id="restoreDownloadCurrent">Plain JSON current backup</button></div><label class="recovery-option"><input id="restoreBackupConfirmed" type="checkbox" /> I have saved a full copy of the current records</label></div>
    <p id="restorePreviewStatus" role="status"></p><div class="workspace-actions"><button class="ghost-button" type="button" data-restore-close>Cancel</button><button class="primary-button" type="button" id="confirmRestore">Restore reviewed backup</button></div>`;
  renderRestoreComparison();
  if (!dialog.open) dialog.showModal();
}

function renderRestoreComparison() {
  if (!pendingRestore) return;
  const preview = prepareRestorePreview(pendingRestore.data, document.querySelector('#restoreKeepAttachments').checked);
  pendingRestore.staged = preview.staged;
  const totals = data => (data.bookings || []).reduce((sum, booking) => sum + VillaLedger.cents(booking.paid || 0), 0);
  const beforeFiles = attachmentSlots(allAppData()).filter(slot => slot.object[slot.field]).length;
  const visibleRows = preview.comparisons.filter(row => row.before || row.after || row.label === 'Bookings');
  const emptyCount = preview.comparisons.length - visibleRows.length;
  document.querySelector('#restoreComparison').innerHTML = `<div class="workspace-table-scroll"><table class="workspace-table recovery-table"><thead><tr><th>Records</th><th>Now</th><th>After</th><th>Added</th><th>Changed</th><th>Removed</th></tr></thead><tbody>${visibleRows.map(row => `<tr><th scope="row">${row.label}</th><td data-label="Now">${row.before}</td><td data-label="After">${row.after}</td><td data-label="Added">${row.added}</td><td data-label="Changed">${row.changed}</td><td data-label="Removed" class="${row.removed ? 'restore-removals' : ''}">${row.removed}</td></tr>`).join('')}</tbody></table></div>${emptyCount ? `<p class="recovery-fineprint">${emptyCount} empty collections unchanged.</p>` : ''}
    <dl class="booking-facts"><div><dt>Booking received totals (all records)</dt><dd>${money(VillaLedger.amount(totals(allAppData())))} → ${money(VillaLedger.amount(totals(preview.staged)))}</dd></div><div><dt>Attached files</dt><dd>${beforeFiles} → ${preview.attached}${preview.retained ? ' (' + preview.retained + ' retained)' : ''}</dd></div></dl>
    ${preview.missing ? `<p class="workspace-notice">${preview.missing} attachment(s) have a filename but no file content. Their images cannot be recovered from this backup.</p>` : ''}
    <p class="recovery-fineprint">Settings and templates in the backup will also be restored. Cloud saves are not an independent backup.</p>`;
}

async function confirmRestorePreview() {
  const pending = pendingRestore;
  if (!pending) return;
  const status = document.querySelector('#restorePreviewStatus');
  const button = document.querySelector('#confirmRestore');
  try {
    if (!document.querySelector('#restoreBackupConfirmed').checked && hasMeaningfulAppData()) throw new Error('Save a full backup of the current records and confirm above before restoring.');
    button.disabled = true;
    if (cloudSavePromise) await cloudSavePromise;
    if (pendingRestore !== pending) return;
    if (!cloudReady || cloudUser?.id !== pending.ownerId || cloudConflict) throw new Error('Your cloud session changed. Close this preview and check the cloud status.');
    if (workspaceFingerprint() !== pending.baseline) throw new Error('Your records changed after this preview opened. Cancel and reopen the backup to review the latest differences.');
    restoreAppData(pending.staged);
    closeRestorePreview();
    window.alert('Backup restored locally. Check that the cloud status says all changes saved before closing. Your previous records remain in browser recovery history.');
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}

function initializeRestorePreview() {
  const dialog = document.createElement('dialog');
  dialog.id = 'restorePreview';
  dialog.className = 'booking-workspace restore-preview';
  dialog.setAttribute('aria-labelledby', 'restorePreviewTitle');
  document.body.append(dialog);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeRestorePreview(); });
  dialog.addEventListener('change', event => { if (event.target.id === 'restoreKeepAttachments') renderRestoreComparison(); });
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-restore-close]')) closeRestorePreview();
    if (event.target.id === 'confirmRestore') confirmRestorePreview();
    if (event.target.id === 'restoreDownloadEncrypted') openEncryptedBackup({ track: false });
    if (event.target.id === 'restoreDownloadCurrent') downloadJsonFile(`sunrise-villa-before-restore-${isoDate(new Date())}.json`, allAppData());
  });
}

initializeRestorePreview();
