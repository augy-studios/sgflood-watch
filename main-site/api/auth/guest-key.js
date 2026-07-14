import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const GUEST_TTL_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Same-origin requests can arrive with no Origin header at all - that's normal,
    // only reject when an Origin is present and not allow-listed.
    const origin = req.headers.origin;
    if (origin) {
        const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
        if (!allowed.includes(origin)) {
            return res.status(403).json({ error: 'Origin not allowed' });
        }
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    const appId = (req.query.app || 'unknown').toString();
    const keyId = crypto.randomUUID();
    const signingKey = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + GUEST_TTL_MS).toISOString();

    const { error } = await supabase.from('uwu_signing_keys').insert({
        session_token: keyId,
        signing_key: signingKey,
        is_guest: true,
        app_id: appId,
        created_at: new Date().toISOString(),
        expires_at: expiresAt
    });

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ key_id: keyId, signing_key: signingKey });
}
