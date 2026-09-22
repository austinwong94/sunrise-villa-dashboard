const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const backup = require('../backup-crypto.js');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.AUDIT_OUTPUT || '/private/tmp/sunrise-encrypted-backups';

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
    const errors = [], downloads = [], requests = [], checks = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('download', download => downloads.push(download));
    page.on('request', request => requests.push(request.postData() || ''));
    page.on('dialog', dialog => dialog.dismiss());
    await page.route('https://**/*', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
    await page.evaluate(() => {
      supabaseClient = null; cloudReady = true; cloudUser = { id: 'backup-test-owner', email: 'test@example.invalid' };
      appSettings = defaultAppSettings(); documents = []; profitData = {};
      bookings = [normalizeBooking({ id: 'private-booking', guest: 'Fictional Private Guest', arrival: '2026-12-01', nights: 2, revenue: 3088, depositAmount: 500, paid: 2044 })];
      taxPlan = { ...defaultTaxPlan(), expenses: [normalizeTaxExpense({ id: 'private-expense', date: '2026-09-22', amount: 99, attachment: { name: 'test.png', type: 'image/png', dataUrl: 'data:image/png;base64,AAAA' } })] };
      syncCloudAuthUi(); setView('guide'); renderAll();
    });
    const records = () => page.evaluate(() => JSON.stringify([bookings, documents, taxPlan, profitData]));
    const original = await records();
    await page.locator('#settingsEncryptedBackup').click();
    await page.locator('#backupPassphrase').fill('different password first');
    await page.locator('#backupPassphraseConfirm').fill('different password second');
    await page.locator('#submitBackupPassword').click();
    check('Mismatched passphrases do not download a file', downloads.length === 0 && (await page.locator('#backupPasswordStatus').textContent()).includes('do not match'));
    const password = 'browser test backup phrase';
    await page.locator('#backupPassphrase').fill(password);
    await page.locator('#backupPassphraseConfirm').fill(password);
    await page.locator('#backupShowPassphrase').check();
    check('Passphrase visibility is an explicit toggle', await page.locator('#backupPassphrase').getAttribute('type') === 'text');
    const downloadReady = page.waitForEvent('download');
    await page.locator('#submitBackupPassword').click();
    const downloaded = await downloadReady;
    const file = fs.readFileSync(await downloaded.path());
    const encrypted = JSON.parse(file.toString('utf8'));
    const decoded = await backup.decrypt(encrypted, password);
    check('Browser creates a password-protected full backup', backup.isEncrypted(encrypted) && downloaded.suggestedFilename().endsWith('.svbackup.json') && decoded.taxPlan.expenses[0].attachment.dataUrl && decoded.bookings[0].paid === 2044);
    check('Downloaded file does not contain plaintext guest records', !file.includes('Fictional Private Guest') && !file.includes(password));
    check('Successful download clears passphrase fields', await page.locator('#backupPassphrase').inputValue() === '' && await page.locator('#backupPassphraseConfirm').inputValue() === '');
    check('Backup password is never stored in browser storage or sent over the network', await page.evaluate(secret => !JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]).includes(secret), password) && requests.every(body => !body.includes(password)));
    check('Export does not change operational records', await records() === original);
    await page.locator('#encryptedBackupDialog [data-close-backup]').first().click();
    await page.locator('#restoreBackup').setInputFiles({ name: downloaded.suggestedFilename(), mimeType: 'application/json', buffer: file });
    await page.locator('#encryptedBackupDialog').waitFor({ state: 'visible' });
    check('Encrypted restore asks for its backup passphrase first', await page.locator('#encryptedBackupDialog').isVisible() && !await page.locator('#restorePreview').isVisible());
    await page.locator('#backupPassphrase').fill('wrong password');
    await page.locator('#submitBackupPassword').click();
    await page.waitForFunction(() => document.querySelector('#backupPasswordStatus').textContent.includes('incorrect'));
    check('Wrong password leaves all records untouched', await records() === original);
    await page.locator('#backupPassphrase').fill(password);
    await page.locator('#submitBackupPassword').click();
    await page.waitForFunction(() => document.querySelector('#restorePreview').open);
    check('Correct password leads to review, never automatic replacement', await records() === original && !await page.locator('#encryptedBackupDialog').isVisible());
    await page.locator('#restorePreview [data-restore-close]').first().click();
    await page.locator('#checkBackupFile').setInputFiles({ name: 'verify.svbackup.json', mimeType: 'application/json', buffer: file });
    await page.locator('#backupPassphrase').fill(password);
    await page.locator('#submitBackupPassword').click();
    await page.waitForFunction(() => document.querySelector('#encryptedBackupTitle').textContent === 'Backup file checked');
    check('Checking a backup validates it without restoring', await records() === original && !await page.locator('#restorePreview').isVisible());
    check('File-check date is distinct from cloud sync or export', Boolean(await page.evaluate(() => appSettings.lastBackupCheckAt)) && (await page.locator('#backupFileCheckStatus').textContent()).includes('File last checked'));
    await page.locator('#encryptedBackupDialog [data-close-backup]').click();
    await page.locator('#checkBackupFile').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(decoded)) });
    await page.waitForFunction(() => document.querySelector('#encryptedBackupTitle')?.textContent === 'Backup file checked');
    check('Existing plain JSON backups remain checkable', (await page.locator('#encryptedBackupTitle').textContent()) === 'Backup file checked' && await records() === original);
    await page.locator('#encryptedBackupDialog [data-close-backup]').click();
    await page.evaluate(() => {
      const deriveKey = crypto.subtle.deriveKey.bind(crypto.subtle);
      crypto.subtle.deriveKey = async (...args) => { await new Promise(resolve => setTimeout(resolve, 120)); return deriveKey(...args); };
      openEncryptedBackup();
    });
    await page.locator('#backupPassphrase').fill(password);
    await page.locator('#backupPassphraseConfirm').fill(password);
    await page.locator('#submitBackupPassword').click();
    await page.evaluate(() => { cloudReady = false; syncCloudAuthUi(); });
    await page.waitForTimeout(300);
    check('Session lock cancels an in-flight export and clears sensitive controls', downloads.length === 1 && !await page.locator('#encryptedBackupDialog').isVisible() && (await page.locator('#encryptedBackupDialog').textContent()) === '' && await page.evaluate(() => backupOperation === null));
    await page.evaluate(() => { cloudReady = true; syncCloudAuthUi(); });
    fs.mkdirSync(output, { recursive: true });
    for (const width of [1440, 1080, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ['export', 'unlock', 'checked']) {
        await page.evaluate(({ mode, encrypted, decoded }) => {
          closeBackupDialog(); closeRestorePreview();
          if (mode === 'export') openEncryptedBackup();
          if (mode === 'unlock') openEncryptedImport(encrypted, { label: 'Test encrypted backup.json' });
          if (mode === 'checked') showBackupVerification(decoded, { label: 'Test encrypted backup.json' });
        }, { mode, encrypted, decoded });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await page.locator('#encryptedBackupDialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
        await page.screenshot({ path: `${output}/${width}-backup-${mode}.png` });
      }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ backupWorkflowChecks: checks.length, checks, responsiveStates: 9, errors }, null, 2));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
