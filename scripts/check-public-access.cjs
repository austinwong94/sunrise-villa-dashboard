const fs = require('node:fs');
const path = require('node:path');

function publicConfig() {
  const source = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
  const value = name => source.match(new RegExp('const ' + name + ' = "([^"\\n]+)";'))?.[1];
  return { url: value('SUPABASE_URL'), key: value('SUPABASE_PUBLISHABLE_KEY') };
}

// GETs only, with the public key. Never log row contents or send user sessions.
async function inspectPublicAccess(config, fetcher = fetch) {
  const origin = new URL(config.url);
  if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.supabase.co') || origin.username || origin.password || !config.key?.startsWith('sb_publishable_')) {
    throw new Error('A Supabase HTTPS project URL and publishable key are required. Secret keys are not accepted.');
  }
  const report = { checkedAt: new Date().toISOString(), project: origin.hostname, mode: 'anonymous-read-only', tables: [] };
  async function get(route) {
    const response = await fetcher(new URL(route, origin.origin), { method: 'GET', headers: { apikey: config.key, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  }
  for (const table of ['app_data', 'ical_blocks', 'booking_candidates']) {
    try {
      const { status, body } = await get('/rest/v1/' + table + '?select=id&limit=1');
      const result = [401, 403].includes(status) && body?.code === '42501' ? 'permission_denied'
        : status === 200 && Array.isArray(body) ? body.length ? 'row_exposed' : 'no_rows_inconclusive'
        : 'unverified';
      report.tables.push({ table, status, result });
    } catch { report.tables.push({ table, result: 'request_failed' }); }
  }
  try {
    const { status, body } = await get('/auth/v1/settings');
    report.auth = { status, publicSignupDisabled: typeof body?.disable_signup === 'boolean' ? body.disable_signup : null };
  } catch { report.auth = { status: null, publicSignupDisabled: null }; }
  report.limits = 'Does not test writes, signed-in account isolation, Storage, views, RPCs, edge functions or backup availability.';
  return report;
}

module.exports = { inspectPublicAccess };
if (require.main === module) inspectPublicAccess(publicConfig()).then(report => {
  console.log(JSON.stringify(report, null, 2));
  if (report.tables.some(row => row.result === 'row_exposed')) process.exitCode = 2;
  else if (report.tables.some(row => row.result !== 'permission_denied')) process.exitCode = 1;
}).catch(() => { console.error('Public-access check failed. No writes were attempted.'); process.exitCode = 1; });
