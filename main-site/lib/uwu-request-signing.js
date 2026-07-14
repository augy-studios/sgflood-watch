// Shared client-side request signing for UwU Apps PWAs.
// Browser-only (uses window.crypto.subtle, localStorage, sessionStorage).

const LS_KEY = 'uwu_signing_key';
const SS_KEY = 'uwu_signing_key';

export function storeSigningKey(signingKey, keyId, persistent = false) {
    const payload = JSON.stringify({ signingKey, keyId });
    if (persistent) {
        localStorage.setItem(LS_KEY, payload);
        sessionStorage.removeItem(SS_KEY);
    } else {
        sessionStorage.setItem(SS_KEY, payload);
        localStorage.removeItem(LS_KEY);
    }
}

export function getSigningKey() {
    try {
        const fromLocal = localStorage.getItem(LS_KEY);
        if (fromLocal) return JSON.parse(fromLocal);
    } catch { /* ignore corrupt entry */ }
    try {
        const fromSession = sessionStorage.getItem(SS_KEY);
        if (fromSession) return JSON.parse(fromSession);
    } catch { /* ignore corrupt entry */ }
    return null;
}

export function clearSigningKey() {
    localStorage.removeItem(LS_KEY);
    sessionStorage.removeItem(SS_KEY);
}

export async function initGuestKey(appId) {
    if (getSigningKey()) return; // already have a key (guest or remembered login)

    const res = await fetch(`/api/auth/guest-key?app=${encodeURIComponent(appId)}`);
    if (!res.ok) throw new Error('Failed to obtain guest signing key');
    const data = await res.json();
    storeSigningKey(data.signing_key, data.key_id, false);
}

async function hmacHex(key, message) {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
        'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Returns the exact body string that will be sent, or null if there is no body
function normalizeBody(body) {
    if (body === undefined || body === null) return null;
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    return str === '{}' ? null : str;
}

export async function signedFetch(url, options = {}) {
    const keyEntry = getSigningKey();
    if (!keyEntry) {
        throw new Error('signedFetch: no signing key in localStorage or sessionStorage');
    }
    const { signingKey, keyId } = keyEntry;

    const method = (options.method || 'GET').toUpperCase();
    const absolute = new URL(url, window.location.origin);
    const path = absolute.pathname + absolute.search;

    const bodyStr = normalizeBody(options.body);
    const bodyHash = bodyStr === null ? 'empty' : await hmacHex(signingKey, bodyStr);

    const ts = Date.now().toString();
    const message = `${ts}:${method}:${path}:${bodyHash}`;
    const token = await hmacHex(signingKey, message);

    const headers = new Headers(options.headers || {});
    headers.set('X-Request-Token', token);
    headers.set('X-Request-TS', ts);
    headers.set('X-Key-ID', keyId);

    return fetch(url, { ...options, headers });
}
