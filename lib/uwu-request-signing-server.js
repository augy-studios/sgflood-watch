// Shared server-side request signing verification for UwU Apps PWAs (Vercel functions).
import crypto from 'node:crypto';

const MAX_SKEW_MS = 30 * 1000;

function hmacHex(key, message) {
    return crypto.createHmac('sha256', key).update(message).digest('hex');
}

function timingSafeEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

// Reads the raw request body as a string. Only works if bodyParser is disabled
// for the route (export const config = { api: { bodyParser: false } }).
export function readRawBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

// Derives the body string used for hashing when the raw body wasn't captured.
// Vercel's body parser sets req.body = {} for GET/DELETE even with no body sent,
// so an empty object is treated the same as "no body".
function bodyStringFromParsed(req) {
    if (req.method === 'GET' || req.body === undefined || req.body === null) return null;
    const str = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    return str === '{}' ? null : str;
}

// rawBody: optional pre-read raw body string (pass this when bodyParser is disabled
// to guarantee an exact byte match with what the client signed).
export async function verifySignedRequest(req, supabase, rawBody) {
    const token = req.headers['x-request-token'];
    const ts = req.headers['x-request-ts'];
    const keyId = req.headers['x-key-id'];

    if (!token || !ts || !keyId) {
        return { valid: false, reason: 'Missing signing headers' };
    }

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > MAX_SKEW_MS) {
        return { valid: false, reason: 'Timestamp out of range' };
    }

    const { data: keyRow, error: keyErr } = await supabase
        .from('uwu_signing_keys')
        .select('signing_key, expires_at')
        .eq('session_token', keyId)
        .maybeSingle();

    if (keyErr || !keyRow) {
        return { valid: false, reason: 'Unknown signing key' };
    }
    if (new Date(keyRow.expires_at).getTime() < Date.now()) {
        return { valid: false, reason: 'Signing key expired' };
    }

    const bodyStr = rawBody !== undefined ? (rawBody === '' ? null : rawBody) : bodyStringFromParsed(req);
    const bodyHash = bodyStr === null ? 'empty' : hmacHex(keyRow.signing_key, bodyStr);

    const path = req.url; // includes query string, matches client path + search
    const message = `${ts}:${req.method}:${path}:${bodyHash}`;
    const expectedToken = hmacHex(keyRow.signing_key, message);

    if (!timingSafeEqualHex(token, expectedToken)) {
        return { valid: false, reason: 'Invalid signature' };
    }

    const { data: usedRow } = await supabase
        .from('uwu_used_request_tokens')
        .select('token')
        .eq('token', token)
        .maybeSingle();

    if (usedRow) {
        return { valid: false, reason: 'Replayed request' };
    }

    const { error: insertErr } = await supabase
        .from('uwu_used_request_tokens')
        .insert({ token, session_token: keyId, used_at: new Date().toISOString() });

    if (insertErr) {
        return { valid: false, reason: 'Failed to record request token' };
    }

    return { valid: true, reason: 'ok' };
}
