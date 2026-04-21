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

// Haversine distance in km
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371,
        rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad,
        dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseCircle(circleStr) {
    if (!circleStr) return null;
    const parts = circleStr.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const [latStr, lngStr] = parts[0].split(',');
    return {
        lat: parseFloat(latStr),
        lng: parseFloat(lngStr),
        radius: parseFloat(parts[1])
    };
}

export default async function handler(req, res) {
    // Protect with a shared secret so only Vercel cron can call this
    const secret = req.headers['x-cron-secret'];
    if (secret !== process.env.CRON_SECRET) {
        return res.status(401).json({
            error: 'Unauthorized'
        });
    }

    // 1. Fetch latest alerts from LTA
    const ltaRes = await fetch('https://datamall2.mytransport.sg/ltaodataservice/PubFloodAlerts', {
        headers: {
            AccountKey: process.env.LTA_ACCOUNT_KEY,
            Accept: 'application/json'
        }
    });
    if (!ltaRes.ok) return res.status(502).json({
        error: 'LTA fetch failed'
    });
    const {
        value: alerts
    } = await ltaRes.json();

    const activeAlerts = (alerts || []).filter(a => a.msgType !== 'Cancel');
    if (activeAlerts.length === 0) return res.status(200).json({
        sent: 0,
        reason: 'No active alerts'
    });

    // 2. Load all push subscriptions
    const {
        data: subs,
        error
    } = await supabase.from('sgfw_push_subscriptions').select('*');
    if (error) return res.status(500).json({
        error: error.message
    });
    if (!subs || subs.length === 0) return res.status(200).json({
        sent: 0,
        reason: 'No subscribers'
    });

    // 3. For each subscriber, check if any alert is near their saved location
    let sent = 0;
    const stale = [];

    await Promise.all(subs.map(async (sub) => {
        const subscription = JSON.parse(sub.subscription);

        // Find nearest alert to this subscriber's saved location
        const nearbyAlert = activeAlerts.find(a => {
            if (!sub.lat || !sub.lng) return true; // no location saved → send all
            const c = parseCircle(a.circle);
            if (!c) return false;
            return haversine(sub.lat, sub.lng, c.lat, c.lng) <= (c.radius + 5);
        });

        if (!nearbyAlert) return;

        const payload = JSON.stringify({
            title: nearbyAlert.headline || 'Flood Alert',
            body: nearbyAlert.description || nearbyAlert.areaDesc || 'A flood alert has been issued near you.',
            url: 'https://sgflood.uwuapps.org'
        });

        try {
            await webpush.sendNotification(subscription, payload);
            sent++;
        } catch (err) {
            // 410 Gone = subscription expired/unsubscribed, clean it up
            if (err.statusCode === 410) stale.push(sub.endpoint);
            else console.error('Push send error:', err.message);
        }
    }));

    // 4. Remove stale subscriptions
    if (stale.length > 0) {
        await supabase.from('sgfw_push_subscriptions').delete().in('endpoint', stale);
    }

    return res.status(200).json({
        sent,
        staleCleaned: stale.length
    });
}