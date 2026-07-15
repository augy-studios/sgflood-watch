import { createHash } from 'node:crypto';

const LTA_URL = 'https://datamall2.mytransport.sg/ltaodataservice/PubFloodAlerts';

// Ported from main-site/script.js and main-site/api/*.js so the bot's notion
// of "active", "nearby" and "severity" matches the web app exactly.
export const SEVERITY_ORDER = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 };
export const SEVERITY_EMOJI = { Extreme: '🔴', Severe: '🟠', Moderate: '🟡', Minor: '🟢' };

export async function fetchFloodAlerts() {
    const apiKey = process.env.LTA_ACCOUNT_KEY;
    if (!apiKey) return { ok: false, error: 'LTA_ACCOUNT_KEY is not configured', alerts: [] };

    try {
        const res = await fetch(LTA_URL, {
            headers: { AccountKey: apiKey, Accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`LTA API responded with status ${res.status}`);
        const data = await res.json();
        return { ok: true, alerts: data.value || [] };
    } catch (err) {
        return { ok: false, error: err.message, alerts: [] };
    }
}

// "lat,lng radius" → {lat, lng, radius (km)}
export function parseCircle(circleStr) {
    if (!circleStr) return null;
    const parts = circleStr.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const [latStr, lngStr] = parts[0].split(',');
    return { lat: parseFloat(latStr), lng: parseFloat(lngStr), radius: parseFloat(parts[1]) };
}

// Haversine distance in km
export function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isActive(alert) {
    return alert.msgType !== 'Cancel';
}

// A stable identity for an alert instance so restarts / polls can tell
// "same alert as before" apart from "a new one was just issued". LTA doesn't
// expose a dedicated id field, so headline+areaDesc+circle is used instead.
export function alertKey(alert) {
    return createHash('sha1')
        .update(`${alert.headline || ''}|${alert.areaDesc || ''}|${alert.circle || ''}`)
        .digest('hex')
        .slice(0, 20);
}

// Distance (km) from a point to an alert's broadcast-circle centre, or null
// if the alert has no parseable circle.
export function distanceToAlert(lat, lng, alert) {
    const c = parseCircle(alert.circle);
    if (!c) return null;
    return haversine(lat, lng, c.lat, c.lng);
}

// Same "near enough" rule as main-site (circle radius + 5km buffer).
export function isNearby(lat, lng, alert) {
    const c = parseCircle(alert.circle);
    if (!c) return false;
    return haversine(lat, lng, c.lat, c.lng) <= (c.radius + 5);
}

export function sortBySeverity(alerts) {
    return [...alerts].sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0));
}
