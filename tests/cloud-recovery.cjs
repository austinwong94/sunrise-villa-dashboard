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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => typeof openEncryptedBackup === 'function');
    const results = await page.evaluate(async () => {
      const checks = [];
      const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });
      const clone = value => JSON.parse(JSON.stringify(value));
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      const originalRecovery = createRecoverySnapshot;
      const originalWriteRecovery = writeRecoverySnapshots;
      let remote;
      let readError;
      let readDelay;
      let writes;
      let reads;
      let lastLimit;
      function reset({ dirty = true, ready = true } = {}) {
        window.clearTimeout(cloudSaveTimer);
        createRecoverySnapshot = originalRecovery;
        writeRecoverySnapshots = originalWriteRecovery;
        authGeneration += 1;
        cloudUser = { id: 'recovery-owner' };
        cloudReady = ready;
        cloudRecordId = 'row';
        cloudKnownUpdatedAt = 'version-one';
        cloudDirty = dirty;
        cloudConflict = false;
        cloudRevision = 0;
        cloudSavePromise = null;
        cloudLoadPromise = null;
        documentHasUnsavedChanges = false;
        localStorage.clear();
        bookings = [normalizeBooking({ id: 'local-booking', guest: 'Local private guest', arrival: '2026-09-22', nights: 2, revenue: 2000, paid: 1000 })];
        documents = [];
        taxPlan = defaultTaxPlan();
        profitData = {};
        appSettings = defaultAppSettings();
        writeSyncState();
        syncCloudAuthUi();
        remote = { id: 'row', updated_at: 'version-two', data: clone({ ...allAppData(), bookings: [] }) };
        readError = null;
        readDelay = 0;
        writes = [];
        reads = 0;
        lastLimit = 0;
        supabaseClient = { from() {
          let payload;
          const filters = {};
          return {
            select() { return this; }, eq(key, value) { filters[key] = value; return this; }, order() { return this; },
            limit(value) { lastLimit = value; return this; },
            update(value) { payload = clone(value); return this; }, insert(value) { payload = clone(value); return this; },
            then(resolve, reject) { return this.maybeSingle().then(result => ({ ...result, data: result.error ? null : result.data ? [result.data] : [] })).then(resolve, reject); },
            single() { return this.maybeSingle(); },
            async maybeSingle() {
              if (!payload) {
                reads++;
                const result = clone({ data: remote, error: readError });
                await delay(readDelay);
                return result;
              }
              if (filters.updated_at && remote?.updated_at !== filters.updated_at) return { data: null, error: null };
              writes.push(payload);
              remote = { id: 'row', ...payload };
              return { data: { id: 'row', updated_at: payload.updated_at }, error: null };
            }
          };
        } };
      }
      async function reload() {
        if (typeof reloadCloudCopy === 'function') return reloadCloudCopy();
        document.querySelector('#syncNoticeReload').click();
        await delay(10);
        if (cloudLoadPromise) await cloudLoadPromise;
      }
      window.confirm = () => true;
      reset({ ready: false });
      remote = null;
      await loadCloudSnapshot();
      check('Missing cloud row preserves pending local bookings and performs no insert', bookings.length === 1 && writes.length === 0 && cloudDirty && cloudConflict);
      check('Missing row opens only the authenticated recovery workspace', cloudReady && !document.querySelector('#appShell').hidden);

      reset();
      cloudConflict = true;
      createRecoverySnapshot = () => false;
      const previousSync = localStorage.getItem(SYNC_STATE_KEY);
      await reload();
      check('Recovery failure cannot replace local records during cloud reload', bookings.length === 1 && cloudDirty && cloudConflict && localStorage.getItem(SYNC_STATE_KEY) === previousSync);

      reset();
      readError = { message: 'Simulated connection failure' };
      await reload();
      check('Failed cloud reload retains local version and pending state', bookings.length === 1 && cloudDirty && cloudKnownUpdatedAt === 'version-one' && readSyncState().dirty);

      reset();
      cloudConflict = true;
      readDelay = 80;
      const pendingReload = reload();
      await delay(15);
      const pendingState = readSyncState();
      check('Pending edits remain marked unsaved throughout a cloud read', pendingState.dirty && pendingState.updatedAt === 'version-one');
      bookings[0].guest = 'Edited during reload';
      saveBookings();
      await pendingReload;
      window.clearTimeout(cloudSaveTimer);
      check('Edits during cloud reload are kept, not overwritten or uploaded', bookings[0]?.guest === 'Edited during reload' && cloudDirty && writes.length === 0);

      reset({ dirty: false });
      remote.updated_at = '';
      await loadCloudSnapshot();
      check('Unversioned cloud records are rejected without replacing local records', bookings.length === 1 && cloudKnownUpdatedAt === 'version-one' && cloudStatusMode === 'error');

      reset({ dirty: false });
      readError = { code: 'PGRST116', message: 'Multiple rows' };
      await loadCloudSnapshot();
      check('Plural cloud lookup keeps records when the API returns an error', lastLimit === 2 && bookings.length === 1 && cloudStatusMessage === 'Multiple rows');
      check('A failed cloud lookup never automatically writes over its records', writes.length === 0 && cloudStatusMode === 'error');

      reset({ dirty: false, ready: false });
      cloudKnownUpdatedAt = '';
      localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({ userId: cloudUser.id, updatedAt: 'previous-version', dirty: false }));
      remote = null;
      await loadCloudSnapshot();
      check('Missing previously saved workspace preserves its recovery version', cloudKnownUpdatedAt === 'previous-version' && readSyncState().updatedAt === 'previous-version' && writes.length === 0);
      await loadCloudSnapshot();
      check('Repeated reload cannot turn a missing workspace into an empty insert', bookings.length === 1 && writes.length === 0 && cloudConflict);

      reset();
      window.confirm = () => false;
      const beforeCancel = JSON.stringify(allAppData().bookings);
      await reload();
      check('Cancelling reload sends no read or write and retains pending changes', reads === 0 && writes.length === 0 && cloudDirty && JSON.stringify(bookings) === beforeCancel);
      window.confirm = () => true;

      reset();
      await reload();
      check('Confirmed reload applies the validated cloud copy without uploading stale records', bookings.length === 0 && writes.length === 0 && !cloudDirty && !cloudConflict && cloudKnownUpdatedAt === 'version-two');
      check('Successful replacement first saves a recovery point with the previous records', loadRecoverySnapshots().some(snapshot => snapshot.data.bookings[0]?.guest === 'Local private guest'));
      check('Reload button becomes available again after success', !document.querySelector('#syncNoticeReload').disabled);

      reset();
      readError = { message: 'Offline' };
      await reload();
      readError = null;
      await reload();
      check('A failed read can be retried successfully without resetting the page', bookings.length === 0 && !cloudDirty && cloudStatusMode === 'connected');

      reset();
      remote.data = { bookings: [], taxPlan: { expenses: [null] } };
      await reload();
      check('Malformed cloud collections cannot partly overwrite records or save-version state', bookings.length === 1 && cloudDirty && cloudKnownUpdatedAt === 'version-one');

      reset();
      remote.data.ownerId = 'different-owner';
      await reload();
      check('Mismatched cloud owner blocks loading and subsequent writes', bookings.length === 1 && cloudDirty && cloudConflict && await saveCloudSnapshot() === false && writes.length === 0);

      reset();
      cloudKnownUpdatedAt = '';
      check('An update cannot bypass version checking when its version is absent', await saveCloudSnapshot() === false && cloudConflict && writes.length === 0);

      reset();
      localStorage.setItem(SYNC_STATE_KEY, 'null');
      check('Corrupt sync metadata does not crash startup', Object.keys(readSyncState()).length === 0);
      localStorage.setItem(SYNC_STATE_KEY, '[]');
      check('Non-record sync metadata is rejected', Object.keys(readSyncState()).length === 0);

      reset();
      localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({ userId: cloudUser.id, dirty: false, updatedAt: 'version-two' }));
      await loadCloudSnapshot();
      check('A shared-cache clean flag cannot hide this tab\'s pending edits', bookings.length === 1 && cloudDirty && cloudConflict && writes.length === 0);

      reset({ ready: false });
      remote.updated_at = 'version-one';
      await loadCloudSnapshot();
      check('Pending edits resume saving when the remote version is unchanged', writes.length === 1 && remote.data.bookings[0]?.guest === 'Local private guest' && !cloudDirty && cloudReady);

      reset();
      cloudRecordId = '';
      cloudKnownUpdatedAt = '';
      cloudDirty = false;
      cloudReady = false;
      bookings = [];
      writeSyncState();
      remote = null;
      await loadCloudSnapshot();
      check('A genuinely new account initializes once after a successful empty read', writes.length === 1 && bookings.length === 0 && cloudReady && !cloudDirty && cloudStatusMode === 'connected');

      reset();
      cloudConflict = true;
      readDelay = 100;
      const changingSession = reload();
      await delay(15);
      await applyCloudSession(null);
      const lockedStatus = cloudStatusMessage;
      await changingSession;
      check('An old account response cannot apply records after session lock', !cloudReady && !cloudUser && bookings.length === 1 && cloudStatusMessage === lockedStatus && writes.length === 0 && document.querySelector('#appShell').hidden);
      check('Reload controls are released even after session lock', !document.querySelector('#syncNoticeReload').disabled);

      reset();
      readDelay = 100;
      const concurrentReload = reload();
      await delay(15);
      check('Manual or reconnect saves cannot run during replacement reads', await saveCloudSnapshot() === false && writes.length === 0);
      await concurrentReload;
      check('Replacement read settles before any new writes', bookings.length === 0 && writes.length === 0 && !cloudLoadPromise);

      reset();
      maybeAutoSyncIcal = () => {};
      loadBookingCandidates = () => {};
      mergeServerIcalBlocks = () => {};
      readDelay = 80;
      const oldAccountRead = loadCloudSnapshot();
      await delay(10);
      remote = { id: 'other-row', updated_at: 'other-version', data: { version: 3, ownerId: 'other-owner', bookings: [], documents: [], taxPlan: defaultTaxPlan(), profitData: {}, appSettings: defaultAppSettings() } };
      await applyCloudSession({ user: { id: 'other-owner' } });
      await oldAccountRead;
      check('Switching accounts during a cloud read applies only the new owner workspace', cloudUser.id === 'other-owner' && cloudReady && bookings.length === 0 && cloudRecordId === 'other-row' && writes.length === 0);
      const previousAccountCopy = loadRecoverySnapshots().find(snapshot => snapshot.reason === 'Before switching accounts');
      check('Account-switch recovery tags both envelope and records with their original owner', previousAccountCopy?.ownerId === 'recovery-owner' && previousAccountCopy.data.ownerId === 'recovery-owner' && previousAccountCopy.data.bookings[0]?.guest === 'Local private guest');
      check('Previous-account recovery stays hidden from the new account', !visibleRecoverySnapshots().some(snapshot => snapshot.id === previousAccountCopy?.id));

      reset({ dirty: false });
      setCloudStatus('offline', 'Connection lost', 'Reconnect to check your saved records.');
      check('Offline status never claims all changes are saved', !document.querySelector('#dataHealthStatus').textContent.includes('All changes saved'));
      window.clearTimeout(cloudSaveTimer);
      return checks;
    });
    const output = process.env.AUDIT_OUTPUT || '/private/tmp/sunrise-cloud-recovery';
    fs.mkdirSync(output, { recursive: true });
    let responsiveStates = 0;
    for (const width of [1440, 1080, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => {
        setView('calendar');
        setCloudStatus('error', 'Cloud record not found', 'Your previous cloud workspace is missing. Local records were kept and automatic saving is paused. Download a full backup before investigating; no empty workspace was uploaded.');
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Recovery warning fits ' + width);
      await page.locator('#syncNotice').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#syncNoticeBackup').isVisible(), true);
      assert.equal(await page.locator('#syncNoticeReload').isVisible(), true);
      await page.screenshot({ path: path.join(output, width + '-cloud-recovery.png') });
      responsiveStates++;
    }
    console.log(JSON.stringify({ passed: results.filter(result => result.passed).length, responsiveStates, checks: results, errors }, null, 2));
    assert.deepEqual(results.filter(result => !result.passed), [], 'Cloud recovery checks');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
