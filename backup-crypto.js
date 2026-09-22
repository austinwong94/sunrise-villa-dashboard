const VillaBackup = (() => {
  const FORMAT = 'sunrise-villa-encrypted-backup';
  const ITERATIONS = 600000;
  const MAX_BYTES = 64 * 1024 * 1024;
  const MAX_FILE_BYTES = 90 * 1024 * 1024;
  const encoder = new TextEncoder();
  const context = encoder.encode('Sunrise Villa encrypted backup v1');

  function cryptoApi() {
    if (!globalThis.crypto?.subtle) throw new Error('Encryption is unavailable in this browser. Open the HTTPS website in a supported browser. No unencrypted file was created.');
    return globalThis.crypto;
  }
  function base64(bytes) {
    let result = '';
    for (let i = 0; i < bytes.length; i += 16384) result += String.fromCharCode(...bytes.subarray(i, i + 16384));
    return btoa(result);
  }
  function unbase64(value) {
    if (typeof value !== 'string' || value.length > MAX_FILE_BYTES || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid encrypted backup encoding.');
    const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
    const bytes = new Uint8Array(value.length / 4 * 3 - padding);
    let offset = 0;
    for (let i = 0; i < value.length; i += 16384) {
      const chunk = value.slice(i, i + 16384);
      const decoded = atob(chunk);
      if (btoa(decoded) !== chunk) throw new Error('Invalid encrypted backup encoding.');
      for (let j = 0; j < decoded.length; j += 1) bytes[offset++] = decoded.charCodeAt(j);
    }
    return bytes;
  }
  function isEncrypted(value) { return value?.format === FORMAT; }
  function inspect(value) {
    if (!isEncrypted(value) || value.version !== 1 || value.kdf?.name !== 'PBKDF2' || value.kdf.hash !== 'SHA-256' || value.kdf.iterations !== ITERATIONS
      || value.cipher?.name !== 'AES-GCM' || value.cipher.bits !== 256 || value.cipher.tagLength !== 128) {
      throw new Error('Unsupported encrypted backup format. Update the application before opening this file.');
    }
    if (value.kdf.salt?.length !== 24 || value.cipher.iv?.length !== 16) throw new Error('Invalid encrypted backup salt or nonce.');
    const salt = unbase64(value.kdf.salt);
    const iv = unbase64(value.cipher.iv);
    if (salt.length !== 16 || iv.length !== 12 || typeof value.ciphertext !== 'string' || value.ciphertext.length > Math.ceil((MAX_BYTES + 16) / 3) * 4) throw new Error('Invalid encrypted backup size or parameters.');
    return { salt, iv };
  }
  async function derive(password, salt, usages) {
    if (typeof password !== 'string' || !password.length || password.length > 1024) throw new Error('Enter a backup password between 1 and 1,024 characters.');
    const material = encoder.encode(password);
    try {
      const key = await cryptoApi().subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
      return await cryptoApi().subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, { name: 'AES-GCM', length: 256 }, false, usages);
    } finally { material.fill(0); }
  }
  async function encrypt(data, password) {
    if (typeof password !== 'string' || password.length < 14 || password.length > 1024) throw new Error('Use a backup passphrase of at least 14 characters (up to 1,024).');
    const api = cryptoApi();
    const plaintext = encoder.encode(JSON.stringify(data));
    try {
      if (plaintext.length > MAX_BYTES) throw new Error('This backup exceeds the 64 MB encryption limit. Use a database backup for larger archives.');
      const salt = api.getRandomValues(new Uint8Array(16));
      const iv = api.getRandomValues(new Uint8Array(12));
      const key = await derive(password, salt, ['encrypt']);
      const ciphertext = await api.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: context }, key, plaintext);
      return { format: FORMAT, version: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: base64(salt) },
        cipher: { name: 'AES-GCM', bits: 256, tagLength: 128, iv: base64(iv) }, ciphertext: base64(new Uint8Array(ciphertext)) };
    } finally { plaintext.fill(0); }
  }
  async function decrypt(envelope, password) {
    const { salt, iv } = inspect(envelope);
    const ciphertext = unbase64(envelope.ciphertext);
    if (ciphertext.length < 16 || ciphertext.length > MAX_BYTES + 16) throw new Error('Invalid encrypted backup size.');
    const key = await derive(password, salt, ['decrypt']);
    let plaintext;
    try {
      plaintext = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: context }, key, ciphertext));
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    } catch { throw new Error('The password is incorrect or this backup is damaged. No records were changed.'); }
    finally { plaintext?.fill(0); }
  }
  return Object.freeze({ encrypt, decrypt, inspect, isEncrypted, MAX_FILE_BYTES });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VillaBackup;
