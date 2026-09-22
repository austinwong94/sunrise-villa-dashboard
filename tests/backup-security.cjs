const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const backup = require('../backup-crypto.js');
const { inspectPublicAccess } = require('../scripts/check-public-access.cjs');

async function run() {
  const checks = [];
  const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
  const reject = async (name, callback) => { await assert.rejects(callback); checks.push(name); };
  const password = 'test-only separate backup phrase';
  const data = { version: 3, ownerId: 'test-owner', bookings: [{ guest: 'Fictional Guest', paid: 2044 }], documents: [{ bank: 'Test Bank', reference: 'TEST-123' }], attachment: 'data:image/png;base64,AAAA', notes: 'Unicode \u6797\u5148\u751f' };
  const first = await backup.encrypt(data, password);
  const second = await backup.encrypt(data, password);
  check('Encrypted backup roundtrips all fields', JSON.stringify(await backup.decrypt(first, password)) === JSON.stringify(data));
  check('Encrypted file exposes no guest, bank, owner or password', ['Fictional Guest', 'TEST-123', 'test-owner', password].every(text => !JSON.stringify(first).includes(text)));
  check('Every export gets a new salt, nonce and ciphertext', first.kdf.salt !== second.kdf.salt && first.cipher.iv !== second.cipher.iv && first.ciphertext !== second.ciphertext);
  check('Ciphertext includes a full 128-bit authentication tag', Buffer.from(first.ciphertext, 'base64').length === Buffer.byteLength(JSON.stringify(data)) + 16);
  await reject('Wrong password cannot decrypt', () => backup.decrypt(first, 'incorrect backup password'));
  const changed = structuredClone(first);
  const bytes = Buffer.from(changed.ciphertext, 'base64'); bytes[0] ^= 1;
  changed.ciphertext = bytes.toString('base64');
  await reject('Changed encrypted contents fail authentication', () => backup.decrypt(changed, password));
  await reject('Weak export passphrases are rejected', () => backup.encrypt(data, 'short'));
  await reject('Excessive passphrase input is bounded', () => backup.encrypt(data, 'x'.repeat(1025)));
  await reject('Unknown backup format is not silently opened', () => backup.decrypt({ ...first, version: 2 }, password));
  await reject('Untrusted excessive KDF work is rejected', () => backup.decrypt({ ...first, kdf: { ...first.kdf, iterations: 999999999 } }, password));
  await reject('Weakened KDF parameters are rejected', () => backup.decrypt({ ...first, kdf: { ...first.kdf, iterations: 1 } }, password));
  await reject('Invalid nonce length is rejected', () => backup.decrypt({ ...first, cipher: { ...first.cipher, iv: 'AAAA' } }, password));
  await reject('Invalid ciphertext encoding is rejected', () => backup.decrypt({ ...first, ciphertext: '!!!!' }, password));
  const ciphertext = Buffer.from(first.ciphertext, 'base64');
  const key = crypto.pbkdf2Sync(password, Buffer.from(first.kdf.salt, 'base64'), 600000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(first.cipher.iv, 'base64'));
  decipher.setAAD(Buffer.from('Sunrise Villa encrypted backup v1'));
  decipher.setAuthTag(ciphertext.subarray(-16));
  check('Independent Node AES-GCM decrypts the Web Crypto file', Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString('utf8') === JSON.stringify(data));
  key.fill(0);
  const withoutCrypto = vm.runInNewContext(fs.readFileSync(require.resolve('../backup-crypto.js'), 'utf8') + '\nVillaBackup;', { TextEncoder, TextDecoder, Uint8Array, btoa, atob });
  await reject('Missing Web Crypto fails without plaintext fallback', () => withoutCrypto.encrypt(data, password));

  const config = { url: 'https://test-project.supabase.co', key: 'sb_publishable_test_only' };
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url: url.toString(), init });
    return url.pathname.includes('/settings') ? { status: 200, json: async () => ({ disable_signup: true, ignoredPrivateField: 'do-not-log' }) }
      : { status: 401, json: async () => ({ code: '42501' }) };
  };
  const report = await inspectPublicAccess(config, fetcher);
  check('Access check makes only read-only public requests', requests.length === 4 && requests.every(request => request.init.method === 'GET' && !request.init.headers.Authorization && !request.init.body && request.init.redirect === 'error'));
  check('Table probes request IDs only, never guest records', requests.filter(request => request.url.includes('/rest/')).every(request => request.url.endsWith('?select=id&limit=1')));
  check('Access result distinguishes confirmed permission denial', report.tables.every(row => row.result === 'permission_denied') && report.auth.publicSignupDisabled);
  check('Access report logs only selected non-private settings', !JSON.stringify(report).includes('do-not-log'));
  const empty = await inspectPublicAccess(config, async () => ({ status: 200, json: async () => [] }));
  check('Empty result is not treated as proof of security', empty.tables.every(row => row.result === 'no_rows_inconclusive'));
  const exposed = await inspectPublicAccess(config, async () => ({ status: 200, json: async () => [{ id: 'private-row-id' }] }));
  check('Exposure is flagged without printing the returned row', exposed.tables.every(row => row.result === 'row_exposed') && !JSON.stringify(exposed).includes('private-row-id'));
  const invalid = await inspectPublicAccess(config, async () => ({ status: 401, json: async () => ({ message: 'invalid API key' }) }));
  check('Invalid API key is not mistaken for access protection', invalid.tables.every(row => row.result === 'unverified'));
  const outage = await inspectPublicAccess(config, async () => { throw new Error('network issue'); });
  check('Network outage is reported as unverified', outage.tables.every(row => row.result === 'request_failed'));
  await reject('Audit refuses secret keys', () => inspectPublicAccess({ ...config, key: 'sb_secret_not_real' }, fetcher));
  await reject('Audit refuses sending keys to arbitrary hosts', () => inspectPublicAccess({ ...config, url: 'https://example.invalid' }, fetcher));
  console.log(JSON.stringify({ securityChecks: checks.length, checks }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });
