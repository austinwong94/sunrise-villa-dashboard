const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');

async function run() {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + (req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => process.env.TEST_BASE_URL && route.request().url().startsWith(process.env.TEST_BASE_URL) ? route.continue() : route.abort());
    await page.goto(process.env.TEST_BASE_URL || `http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => typeof openEncryptedBackup === 'function');
    await page.waitForTimeout(100);
    const checks = await page.evaluate(async () => {
      const checks = [];
      window.copyCheck = (name, ok) => { if (!ok) throw Error(name); checks.push(name); };
      const clone = value => JSON.parse(JSON.stringify(value));
      cloudUser = { id: 'synthetic-copy-owner' };
      authGeneration++;
      cloudReady = false;
      cloudDirty = false;
      cloudConflict = false;
      cloudRecordId = '';
      cloudKnownUpdatedAt = '';
      localStorage.clear();
      bookings = [];
      documents = [];
      profitData = {};
      taxPlan = defaultTaxPlan();
      appSettings = defaultAppSettings();
      writeSyncState();
      const makeRow = (id, date, name) => ({ id, updated_at: date, data: clone({ ...allAppData(), bookings: [normalizeBooking({ id: id + '-booking', guest: name, arrival: '2026-10-01', nights: 2, revenue: 3000, paid: 1000 })] }) });
      window.copyFixture = {
        rows: [makeRow('latest', '2026-09-24T00:00:00.000Z', 'Recent Synthetic Guest'), makeRow('earlier', '2026-09-01T00:00:00.000Z', 'Earlier Synthetic Guest')],
        writes: [], delay: 0, queries: []
      };
      window.initialCopies = clone(copyFixture.rows);
      supabaseClient = supabase.createClient('https://test-project.supabase.co', 'sb_publishable_synthetic_test_only', {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: async (input, options) => {
          const url = new URL(input);
          const method = options.method || 'GET';
          const f = copyFixture;
          if (url.searchParams.get('user_id') !== 'eq.synthetic-copy-owner') throw Error('Missing owner filter');
          f.queries.push({ method, select: url.searchParams.get('select') });
          if (f.delay) await new Promise(resolve => setTimeout(resolve, f.delay));
          let data;
          if (method === 'GET') {
            if (url.searchParams.get('data_type') !== 'eq.full_app_backup' || url.searchParams.get('record_key') !== 'eq.sunrise-villa-main') throw Error('Missing workspace filters');
            data = clone(f.rows).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id)).slice(0, Number(url.searchParams.get('limit')));
            if (url.searchParams.get('select') === 'id,updated_at') data = data.map(({ id, updated_at }) => ({ id, updated_at }));
          } else if (method === 'PATCH') {
            const id = url.searchParams.get('id')?.slice(3);
            const row = f.rows.find(row => row.id === id && 'eq.' + row.updated_at === url.searchParams.get('updated_at'));
            if (!row) data = [];
            else {
              const payload = JSON.parse(options.body);
              f.writes.push({ id, payload: clone(payload) });
              Object.assign(row, payload);
              data = [{ id: row.id, updated_at: row.updated_at }];
            }
          } else throw Error('Unexpected write method: ' + method);
          return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } }
      });
      await loadCloudSnapshot();
      copyCheck('Real SDK opens the latest duplicate snapshot instead of blocking login', cloudReady && !document.querySelector('#appShell').hidden && bookings[0]?.guest === 'Recent Synthetic Guest');
      copyCheck('Duplicate discovery never writes or deletes a cloud record', copyFixture.writes.length === 0 && copyFixture.rows.length === 2 && JSON.stringify(copyFixture.rows) === JSON.stringify(initialCopies));
      copyCheck('Saving stays paused until the owner confirms the copy', cloudConflict && cloudCopyReview.needsReview && await saveCloudSnapshot() === false);
      copyCheck('Recovery action is available in the workspace', !document.querySelector('#reviewCloudCopies').hidden);
      return checks;
    });
    await page.locator('#reviewCloudCopies').click();
    assert.equal(await page.locator('#cloudCopiesDialog').isVisible(), true);
    assert.equal(await page.locator('#confirmCloudCopy').isDisabled(), true);
    checks.push('Review opens and confirmation requires an explicit acknowledgement');
    const downloadEvent = page.waitForEvent('download');
    await page.locator('[data-copy-download="1"]').click();
    const download = await downloadEvent;
    const downloaded = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(downloaded.bookings[0].guest, 'Earlier Synthetic Guest');
    checks.push('Other saved copy downloads as an intact restorable backup');
    const output = process.env.AUDIT_OUTPUT || '/private/tmp/sunrise-copies';
    fs.mkdirSync(output, { recursive: true });
    for (const width of [1440, 1080, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Copy review fits ' + width);
      await page.screenshot({ path: path.join(output, width + '-cloud-copies.png') });
    }
    await page.locator('#cloudCopiesConfirmed').check();
    await page.locator('#confirmCloudCopy').click();
    await page.waitForFunction(() => !document.querySelector('#cloudCopiesDialog').open && !cloudDirty && !cloudConflict);
    const rest = await page.evaluate(async () => {
      const result = [];
      const check = (name, ok) => { if (!ok) throw Error(name); result.push(name); };
      const clone = value => JSON.parse(JSON.stringify(value));
      check('Confirmation updates only the reviewed row with optimistic version checking', copyFixture.writes.length >= 1 && copyFixture.writes.every(write => write.id === 'latest'));
      check('The older copy remains byte-for-byte unchanged', JSON.stringify(copyFixture.rows.find(row => row.id === 'earlier')) === JSON.stringify(initialCopies[1]));
      check('Received money and bookings are not merged or duplicated', bookings.length === 1 && bookings[0].paid === 1000 && bookings[0].revenue === 3000);
      appSettings = defaultAppSettings();
      cloudReady = false;
      await loadCloudSnapshot();
      check('Saved confirmation prevents the same duplicate warning on later logins', cloudReady && !cloudConflict && !cloudCopyReview.needsReview && bookings[0].guest === 'Recent Synthetic Guest');
      copyFixture.rows = [clone(copyFixture.rows.find(row => row.id === 'latest'))];
      await loadCloudSnapshot();
      check('Normal single-row workspaces still load with the real SDK', cloudReady && !cloudConflict && !cloudCopyReview);
      copyFixture.rows.push(clone(initialCopies[1]));
      copyFixture.rows[1].updated_at = '2099-01-01T00:00:00.000Z';
      await loadCloudSnapshot();
      check('A changed sibling copy triggers a fresh review instead of hiding its edits', cloudConflict && cloudCopyReview.needsReview && bookings[0].guest === 'Earlier Synthetic Guest');
      openCloudCopyReview();
      document.querySelector('#cloudCopiesConfirmed').checked = true;
      document.querySelector('#confirmCloudCopy').disabled = false;
      copyFixture.rows[1].updated_at = '2099-02-01T00:00:00.000Z';
      const writesBefore = copyFixture.writes.length;
      await confirmCloudCopy();
      check('Confirmation rechecks cloud versions and refuses stale selections', copyFixture.writes.length === writesBefore && cloudConflict && document.querySelector('#cloudCopiesStatus').textContent.includes('changed'));
      await loadCloudSnapshot({ replaceLocal: true });
      openCloudCopyReview();
      document.querySelector('#cloudCopiesConfirmed').checked = true;
      document.querySelector('#confirmCloudCopy').disabled = false;
      copyFixture.delay = 100;
      const confirming = confirmCloudCopy();
      await new Promise(resolve => setTimeout(resolve, 10));
      await applyCloudSession(null);
      await confirming;
      check('Session lock cancels confirmation and clears copy contents', copyFixture.writes.length === writesBefore && !cloudCopyReview && !document.querySelector('#cloudCopiesDialog').textContent && document.querySelector('#appShell').hidden);
      window.clearTimeout(cloudSaveTimer);
      return result;
    });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ duplicateRecoveryChecks: checks.length + rest.length, checks: [...checks, ...rest], responsiveStates: 3, errors }, null, 2));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
