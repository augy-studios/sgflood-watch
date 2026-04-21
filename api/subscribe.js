import {
    createClient
} from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        const {
            subscription,
            lat,
            lng,
            label
        } = req.body;
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({
                error: 'Invalid subscription object'
            });
        }

        const {
            error
        } = await supabase.from('sgfw_push_subscriptions').upsert({
            endpoint: subscription.endpoint,
            subscription: JSON.stringify(subscription),
            lat: lat || null,
            lng: lng || null,
            label: label || 'My Location',
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'endpoint'
        });

        if (error) return res.status(500).json({
            error: error.message
        });
        return res.status(200).json({
            ok: true
        });
    }

    if (req.method === 'DELETE') {
        const {
            endpoint
        } = req.body;
        if (!endpoint) return res.status(400).json({
            error: 'endpoint required'
        });

        const {
            error
        } = await supabase
            .from('sgfw_push_subscriptions')
            .delete()
            .eq('endpoint', endpoint);

        if (error) return res.status(500).json({
            error: error.message
        });
        return res.status(200).json({
            ok: true
        });
    }

    return res.status(405).json({
        error: 'Method not allowed'
    });
}