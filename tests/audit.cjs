const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.AUDIT_OUTPUT || '/private/tmp/sunrise-audit';
fs.mkdirSync(output, { recursive: true });

async function run() {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
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
    page.on('pageerror', err => errors.push(err.message));
    await page.route('https://**/*', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => typeof renderAll === 'function');
    await page.evaluate(() => {
      supabaseClient = null;
      cloudUser = { id: 'test-user', email: 'test@example.invalid' };
      if (typeof cloudReady !== 'undefined') cloudReady = true;
      syncCloudAuthUi();
      bookings = [
        { guest: 'Alex Morgan', arrival: '2026-09-20', nights: 3, revenue: 5088, paid: 2500, depositAmount: 500, depositPaid: true },
        { guest: 'Priya Raman', arrival: '2026-09-24', nights: 2, revenue: 2888, paid: 3388, depositAmount: 500, depositPaid: true },
        { guest: 'Daniel & Family', arrival: '2026-09-28', nights: 1, revenue: 2488, paid: 0, channel: 'Airbnb', depositAmount: 0 },
        { guest: 'Cross-month Guest', arrival: '2026-09-30', nights: 3, revenue: 6000, paid: 3000, depositAmount: 500 },
        { guest: 'Past Guest', arrival: '2026-09-02', nights: 1, revenue: 2000, paid: 2500, depositAmount: 500, depositPaid: true },
      ].map((b, index) => normalizeBooking({ ...b, contact: '6012345678' + index }));
      selectedMonth = '2026-09';
      appSettings = { ...defaultAppSettings(), sidebarPinned: true };
      document.querySelector('#appShell').classList.add('sidebar-pinned');
      documents = [];
      renderAll();
    });
    const findings = [];
    for (const width of [1440, 1080, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of ['today', 'calendar', 'dashboard', 'bookings', 'guests', 'messages', 'guide', 'documents', 'tax']) {
        await page.evaluate(view => { setView(view); renderAll(); window.scrollTo(0, 0); }, view);
        await page.waitForTimeout(300);
        const layout = await page.evaluate(() => ({
          bodyWidth: document.documentElement.scrollWidth,
          outliers: [...document.querySelectorAll('body *')].filter(el => el.checkVisibility() && el.getBoundingClientRect().right > innerWidth + 2 && !el.closest('.table-scroll')).map(el => ({id: el.id, tag: el.tagName, cls: String(el.className).slice(0,70), right: Math.round(el.getBoundingClientRect().right), pos: getComputedStyle(el).position})).slice(0, 15),
          width: innerWidth,
          boxes: [...document.querySelectorAll('#bookingsView, #bookingsView .table-panel, #bookingsView .table-scroll, #bookingsTable, #bookingsView .booking-toolbar')].map(el => ({ cls: el.className, width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left, overflow: getComputedStyle(el).overflowX, min: getComputedStyle(el).minWidth, display: getComputedStyle(el).display })),
          overflow: [...document.querySelectorAll('.view.active input, .view.active select, .view.active textarea, .view.active button, .view.active .section-heading')]
            .filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().right > innerWidth + 2 && !el.closest('.table-scroll'))
            .map(el => ({ id: el.id, cls: el.className, right: Math.round(el.getBoundingClientRect().right) })).slice(0, 12)
        }));
        findings.push({ width, view, ...layout });
        await page.screenshot({ path: `${output}/${width}-${view}.png`, fullPage: false });
      }
    }
    const expanded = [];
    for (const width of [1440, 1080, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const state of ['filters', 'columns', 'annual', 'commitments', 'checkin', 'expenses', 'assets', 'claim']) {
        await page.evaluate(state => {
          document.querySelectorAll('#bookingsView details[open]').forEach(node => node.open = false);
          if (state === 'filters' || state === 'columns') {
            setView('bookings');
            document.querySelector('#bookingsView .' + (state === 'filters' ? 'filter-drawer' : 'column-drawer')).open = true;
          } else if (state === 'annual' || state === 'commitments') {
            setView('dashboard');
            appSettings.dashboardMode = state === 'annual' ? 'annual' : 'monthly';
            renderDashboard();
            if (state === 'commitments') document.querySelector('.commitments-block').open = true;
          } else if (state === 'checkin') {
            setView('messages'); setMessageFlow('checkin');
          } else { setView('tax'); setTaxInnerTab(state); }
        }, state);
        await page.waitForTimeout(300);
        const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expanded.push({ width, state, bodyWidth });
        await page.screenshot({ path: output + '/' + width + '-' + state + '.png' });
      }
    }
    assert.deepEqual(expanded.filter(item => item.bodyWidth > item.width + 2), [], 'Expanded controls must not widen the page');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { setView('documents'); fillDocumentForm({ ...defaultDocumentDraft(), type: 'Official Receipt', accommodationFee: 3088, securityDeposit: 500, guestName: 'Alex Morgan', payments: [{ bank: 'RHB', reference: 'TEST-001', date: '2026-09-20', amount: 2044 }] }); });
    await page.locator('#receiptPaymentSection').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/receipt-editor.png` });
    fs.writeFileSync(`${output}/findings.json`, JSON.stringify({ errors, findings }, null, 2));
    const overflow = findings.filter(f => f.bodyWidth > f.width + 2 || f.overflow.length);
    console.log(JSON.stringify({ errors, overflow, viewportsChecked: findings.length, expandedStatesChecked: expanded.length, output }, null, 2));
    assert.deepEqual(errors, [], 'No browser errors during navigation');
    assert.deepEqual(overflow, [], 'Pages and their controls must fit all checked viewports');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(err => { console.error(err); process.exitCode = 1; });
