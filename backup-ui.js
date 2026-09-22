let backupOperation = null;

function closeBackupDialog() {
  backupOperation = null;
  const dialog = document.querySelector('#encryptedBackupDialog');
  if (dialog?.open) dialog.close();
  dialog?.replaceChildren();
}

function canUseBackup(job) {
  return Boolean(job && backupOperation === job && cloudReady && cloudUser?.id === job.ownerId);
}

function openBackupPasswordDialog(job) {
  if (!cloudUser || !cloudReady) throw new Error('Log in and load your workspace first.');
  backupOperation = { ...job, ownerId: cloudUser.id };
  const exporting = job.mode === 'export';
  const title = exporting ? 'Encrypted backup' : job.verifyOnly ? 'Check encrypted backup' : 'Unlock backup';
  const dialog = document.querySelector('#encryptedBackupDialog');
  dialog.innerHTML = `<header class="booking-workspace-head"><h2 id="encryptedBackupTitle">${title}</h2><button class="ghost-button" type="button" data-close-backup>Cancel</button></header>
    <p class="workspace-notice">${exporting ? 'Choose a separate backup passphrase and keep it in your password manager. A lost passphrase cannot be reset. It does not change your website login.' : escapeHtml(job.source.label || 'Encrypted file') + '. Enter the passphrase used when this backup was created.'}</p>
    <form id="backupPasswordForm" class="backup-password-form">
      <label>Backup passphrase<input id="backupPassphrase" type="password" autocomplete="new-password" minlength="${exporting ? 14 : 1}" maxlength="1024" required ${exporting ? 'placeholder="At least 14 characters"' : ''} /></label>
      ${exporting ? '<label>Confirm passphrase<input id="backupPassphraseConfirm" type="password" autocomplete="new-password" maxlength="1024" required /></label>' : ''}
      <label class="recovery-option"><input id="backupShowPassphrase" type="checkbox" /> Show passphrase</label>
      <p id="backupPasswordStatus" role="status" aria-live="polite"></p>
      <div class="workspace-actions"><button class="ghost-button" type="button" data-close-backup>Cancel</button><button id="submitBackupPassword" class="primary-button" type="submit">${exporting ? 'Download encrypted backup' : job.verifyOnly ? 'Check file' : 'Unlock and review'}</button></div>
    </form>`;
  if (!dialog.open) dialog.showModal();
  document.querySelector('#backupPassphrase').focus();
}

function openEncryptedBackup(options = {}) {
  openBackupPasswordDialog({ mode: 'export', track: options.track !== false });
}

function openEncryptedImport(envelope, source, verifyOnly = false) {
  VillaBackup.inspect(envelope);
  openBackupPasswordDialog({ mode: 'import', envelope, source, verifyOnly });
}

function renderBackupSafety() {
  const node = document.querySelector('#backupFileCheckStatus');
  if (node) node.textContent = appSettings.lastBackupCheckAt ? 'File last checked: ' + shortDateTimeLabel(appSettings.lastBackupCheckAt) : 'No backup file checked yet';
}

function showBackupVerification(data, source) {
  if (!cloudUser || !cloudReady) throw new Error('Log in before checking private backups.');
  validateBackupData(data);
  if (data.ownerId && data.ownerId !== cloudUser.id) throw new Error('This backup belongs to a different account.');
  prepareRestoreData(data);
  const payload = Array.isArray(data) ? { bookings: data } : data;
  const counts = recoveryCounts(payload);
  const files = attachmentSlots(payload);
  const missing = files.filter(slot => slot.name && !slot.object[slot.field]).length;
  const dialog = document.querySelector('#encryptedBackupDialog');
  backupOperation = null;
  dialog.innerHTML = `<header class="booking-workspace-head"><h2 id="encryptedBackupTitle">Backup file checked</h2><button class="ghost-button" type="button" data-close-backup>Close</button></header><p>${escapeHtml(source.label || 'Backup file')}</p><p class="workspace-notice">The file opened and its structure is valid. Nothing was restored. This does not certify a server backup or a complete disaster-recovery test.</p><dl class="booking-facts"><div><dt>Bookings</dt><dd>${counts.bookings}</dd></div><div><dt>Documents</dt><dd>${counts.documents}</dd></div><div><dt>Expenses</dt><dd>${counts.expenses}</dd></div><div><dt>Attached files</dt><dd>${files.filter(slot => slot.object[slot.field]).length}</dd></div></dl>${missing ? `<p class="workspace-notice">${missing} named attachment(s) are missing their file contents.</p>` : ''}`;
  if (!dialog.open) dialog.showModal();
  appSettings = { ...appSettings, lastBackupCheckAt: new Date().toISOString() };
  saveAppSettings();
  renderBackupSafety();
}

async function submitBackupPassword(event) {
  event.preventDefault();
  const job = backupOperation;
  if (!canUseBackup(job) || job.busy) return;
  const form = event.target;
  if (!form.reportValidity()) return;
  const password = document.querySelector('#backupPassphrase').value;
  const status = document.querySelector('#backupPasswordStatus');
  const submit = document.querySelector('#submitBackupPassword');
  try {
    if (job.mode === 'export' && password !== document.querySelector('#backupPassphraseConfirm').value) throw new Error('The passphrases do not match.');
    job.busy = true;
    submit.disabled = true;
    status.textContent = job.mode === 'export' ? 'Encrypting...' : 'Checking password and file...';
    if (job.mode === 'export') {
      const data = allAppData();
      validateBackupData(data);
      const envelope = await VillaBackup.encrypt(data, password);
      if (!canUseBackup(job)) return;
      downloadJsonFile(`sunrise-villa-${new Date().toISOString().replace(/[:.]/g, '-')}.svbackup.json`, envelope);
      if (job.track) {
        appSettings = { ...appSettings, lastBackupAt: new Date().toISOString() };
        saveAppSettings(); renderBackupStatus();
      }
      form.querySelectorAll('input[type="password"], input[type="text"]').forEach(input => { input.value = ''; input.type = 'password'; });
      document.querySelector('#backupShowPassphrase').checked = false;
      status.textContent = 'Encrypted download requested. Confirm it is in Downloads, keep a separate copy, and use Check backup file to test it.';
    } else {
      const data = await VillaBackup.decrypt(job.envelope, password);
      if (!canUseBackup(job)) return;
      // Validate before closing the dialog so an invalid payload leaves a visible error.
      validateBackupData(data);
      if (data.ownerId && data.ownerId !== cloudUser.id) throw new Error('This backup belongs to a different account.');
      if (job.verifyOnly) showBackupVerification(data, job.source);
      else { openRestorePreview(data, job.source); closeBackupDialog(); }
    }
  } catch (error) {
    if (canUseBackup(job)) {
      status.textContent = error.message;
      form.querySelectorAll('input[type="password"], input[type="text"]').forEach(input => { input.value = ''; });
    }
  } finally { job.busy = false; if (submit.isConnected) submit.disabled = false; }
}

async function checkBackupFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const ownerId = cloudUser?.id;
  try {
    if (!cloudReady || !ownerId) throw new Error('Log in before checking a backup.');
    if (file.size > VillaBackup.MAX_FILE_BYTES) throw new Error('This file exceeds the 90 MB import limit.');
    const payload = JSON.parse(await file.text());
    if (!cloudReady || cloudUser?.id !== ownerId) return;
    if (VillaBackup.isEncrypted(payload)) openEncryptedImport(payload, { label: file.name }, true);
    else showBackupVerification(payload, { label: file.name });
  } catch (error) {
    if (cloudReady && cloudUser?.id === ownerId) window.alert(error instanceof SyntaxError ? 'This file is not valid JSON. No records were changed.' : error.message || 'This backup could not be checked. No records were changed.');
  }
  finally { event.target.value = ''; }
}

function initializeBackupSecurity() {
  const dialog = document.createElement('dialog');
  dialog.id = 'encryptedBackupDialog'; dialog.className = 'booking-workspace backup-password-dialog';
  dialog.setAttribute('aria-labelledby', 'encryptedBackupTitle');
  document.body.append(dialog);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeBackupDialog(); });
  dialog.addEventListener('click', event => { if (event.target.closest('[data-close-backup]')) closeBackupDialog(); });
  dialog.addEventListener('submit', submitBackupPassword);
  dialog.addEventListener('change', event => {
    if (event.target.id === 'backupShowPassphrase') dialog.querySelectorAll('#backupPassphrase, #backupPassphraseConfirm').forEach(input => { input.type = event.target.checked ? 'text' : 'password'; });
  });
  const exportButton = document.createElement('button');
  exportButton.id = 'exportEncryptedBackup'; exportButton.type = 'button'; exportButton.className = 'ghost-button'; exportButton.textContent = 'Encrypted backup';
  exportButton.addEventListener('click', () => openEncryptedBackup());
  document.querySelector('#exportJson').before(exportButton);
  document.querySelector('#exportJson').textContent = 'Plain JSON backup';
  const section = document.createElement('section');
  section.className = 'backup-safety-section'; section.setAttribute('aria-label', 'Backups');
  section.innerHTML = '<h2>Backups</h2><div class="workspace-actions"><button id="settingsEncryptedBackup" type="button" class="primary-button">Encrypted backup</button><label class="ghost-button file-button">Check backup file<input id="checkBackupFile" type="file" accept="application/json,.json" /></label></div><p id="backupFileCheckStatus" class="recovery-fineprint"></p><p class="recovery-fineprint">Server backup coverage is not verified here. Keep a separate copy outside this browser and Supabase project.</p>';
  document.querySelector('.workspace-settings-tools').after(section);
  section.querySelector('#settingsEncryptedBackup').addEventListener('click', () => openEncryptedBackup());
  section.querySelector('#checkBackupFile').addEventListener('change', checkBackupFile);
  renderBackupSafety();
}

initializeBackupSecurity();
