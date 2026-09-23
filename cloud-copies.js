let cloudCopyReview = null;

function cloudCopyVersions(rows) {
  return rows.map(row => ({ id: row.id, updatedAt: row.updated_at }));
}

function clearCloudCopyReview() {
  cloudCopyReview = null;
  const dialog = document.querySelector('#cloudCopiesDialog');
  if (dialog?.open) dialog.close();
  dialog?.replaceChildren();
  renderCloudCopyAction();
}

function inspectCloudCopies(rows) {
  if (!Array.isArray(rows)) throw new Error('Unexpected cloud response. Your records were not replaced.');
  clearCloudCopyReview();
  if (!rows.length) return null;
  let selected = null;
  let lastError;
  for (const row of rows) {
    if (row?.data?.ownerId && row.data.ownerId !== cloudUser.id) {
      throw Object.assign(new Error('The cloud workspace owner does not match this account. Nothing was replaced.'), { pauseSaving: true });
    }
    try {
      if (!row?.id || typeof row.updated_at !== 'string' || !row.updated_at) throw new Error('The cloud record has no valid save version. Nothing was replaced.');
      if (!row.data) throw new Error('The cloud record has no workspace data. Nothing was replaced.');
      prepareRestoreData(row.data);
      if (!selected) selected = row;
    } catch (error) { lastError = error; }
  }
  if (!selected) throw Object.assign(lastError || new Error('No valid saved workspace was found.'), { pauseSaving: true });
  if (rows.length > 1) {
    const otherRows = cloudCopyVersions(rows.filter(row => row.id !== selected.id));
    const choice = selected.data.appSettings?.cloudWorkspaceSelection;
    const approved = choice?.rowId === selected.id && JSON.stringify(choice.otherRows) === JSON.stringify(otherRows);
    cloudCopyReview = { ownerId: cloudUser.id, generation: authGeneration, activeId: selected.id,
      rows: JSON.parse(JSON.stringify(rows)), needsReview: !approved };
  }
  return selected;
}

function renderCloudCopyAction() {
  const button = document.querySelector('#reviewCloudCopies');
  if (button) button.hidden = !cloudCopyReview?.needsReview || !cloudReady || cloudCopyReview.ownerId !== cloudUser?.id;
}

function openCloudCopyReview() {
  const review = cloudCopyReview;
  if (!review || !cloudReady || review.ownerId !== cloudUser?.id) return;
  const dialog = document.querySelector('#cloudCopiesDialog');
  dialog.innerHTML = `<header class="booking-workspace-head"><div><h2 id="cloudCopiesTitle">Review saved copies</h2><p>Your two most recent cloud copies</p></div><button type="button" class="ghost-button" data-copies-close>Close</button></header>
    <p class="workspace-notice">The latest valid cloud copy is marked below. Pending local edits are kept. No copies have been deleted or merged. Download each copy before confirming; older copies remain in Supabase.</p>
    <div class="workspace-table-scroll"><table class="workspace-table"><thead><tr><th>Saved copy</th><th>Last updated</th><th>Bookings</th><th>Documents</th><th>Expenses</th><th>Backup</th></tr></thead><tbody>${review.rows.map((row, index) => {
      const counts = recoveryCounts(row.data || {});
      return `<tr><th scope="row">${row.id === review.activeId ? 'Latest valid copy' : 'Other saved copy'}</th><td data-label="Updated">${escapeHtml(shortDateTimeLabel(row.updated_at))}</td><td data-label="Bookings">${counts.bookings}</td><td data-label="Documents">${counts.documents}</td><td data-label="Expenses">${counts.expenses}</td><td><button type="button" class="ghost-button compact" data-copy-download="${index}">Download copy</button></td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="recovery-fineprint">Downloads contain private records and receipt files. Store them securely. Confirming saves future changes to the open workspace only; it does not combine any records from the other copy.</p>
    <label class="recovery-option"><input type="checkbox" id="cloudCopiesConfirmed" /> I have checked the open workspace and want to continue with this copy</label>
    <p id="cloudCopiesStatus" role="status"></p><div class="workspace-actions"><button type="button" class="ghost-button" data-copies-close>Not now</button><button type="button" class="primary-button" id="confirmCloudCopy" disabled>Use this workspace</button></div>`;
  if (!dialog.open) dialog.showModal();
}

async function confirmCloudCopy() {
  const review = cloudCopyReview;
  const status = document.querySelector('#cloudCopiesStatus');
  const button = document.querySelector('#confirmCloudCopy');
  if (!review || !document.querySelector('#cloudCopiesConfirmed')?.checked || button?.disabled) return;
  button.disabled = true;
  const stillCurrent = () => cloudCopyReview === review && cloudReady && cloudUser?.id === review.ownerId && authGeneration === review.generation;
  try {
    if (cloudLoadPromise || cloudSavePromise) throw new Error('Wait for the current cloud request to finish, then try again.');
    const active = review.rows.find(row => row.id === review.activeId);
    if (!stillCurrent()) return;
    if (cloudRecordId !== active.id || cloudKnownUpdatedAt !== active.updated_at) throw new Error('This device also has unsaved changes from a different version. Download your current backup, then use Load cloud copy before confirming.');
    status.textContent = 'Checking that neither saved copy has changed...';
    const { data, error } = await supabaseClient.from('app_data').select('id, updated_at')
      .eq('data_type', CLOUD_DATA_TYPE).eq('record_key', CLOUD_RECORD_KEY).eq('user_id', review.ownerId)
      .order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(2);
    if (!stillCurrent()) return;
    if (error) throw error;
    if (!Array.isArray(data) || JSON.stringify(cloudCopyVersions(data)) !== JSON.stringify(cloudCopyVersions(review.rows))) {
      throw new Error('The cloud copies changed while you were reviewing. Close this window and use Load cloud copy to review the latest versions.');
    }
    appSettings = { ...appSettings, cloudWorkspaceSelection: { rowId: active.id, otherRows: cloudCopyVersions(review.rows.filter(row => row.id !== active.id)) } };
    review.needsReview = false;
    cloudConflict = false;
    saveAppSettings();
    const saved = await saveCloudSnapshot();
    if (!stillCurrent()) return;
    if (!saved) {
      status.textContent = 'Your selection has not reached the cloud yet. Keep this page open and use Retry saving. Other copies have not been changed.';
      return;
    }
    document.querySelector('#cloudCopiesDialog').close();
    renderAll();
  } catch (error) {
    if (stillCurrent()) status.textContent = error.message || 'Could not check the saved copies. Nothing was replaced.';
  } finally {
    if (stillCurrent()) button.disabled = false;
    renderCloudCopyAction();
  }
}

function initializeCloudCopyReview() {
  const action = document.createElement('button');
  action.type = 'button';
  action.id = 'reviewCloudCopies';
  action.className = 'primary-button compact';
  action.textContent = 'Review saved copies';
  action.hidden = true;
  action.addEventListener('click', openCloudCopyReview);
  document.querySelector('#syncNotice .heading-actions')?.prepend(action);
  const dialog = document.createElement('dialog');
  dialog.id = 'cloudCopiesDialog';
  dialog.className = 'booking-workspace restore-preview';
  dialog.setAttribute('aria-labelledby', 'cloudCopiesTitle');
  document.body.append(dialog);
  dialog.addEventListener('change', () => { document.querySelector('#confirmCloudCopy').disabled = !document.querySelector('#cloudCopiesConfirmed').checked; });
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-copies-close]')) dialog.close();
    if (event.target.closest('#confirmCloudCopy')) confirmCloudCopy();
    const download = event.target.closest('[data-copy-download]');
    if (download && cloudReady && cloudCopyReview?.ownerId === cloudUser?.id) {
      const row = cloudCopyReview.rows[Number(download.dataset.copyDownload)];
      if (row?.data) downloadJsonFile('sunrise-villa-cloud-copy-' + (Number(download.dataset.copyDownload) + 1) + '-' + isoDate(new Date()) + '.json', row.data);
    }
  });
}

initializeCloudCopyReview();
