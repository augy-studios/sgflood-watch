import { SEVERITY_EMOJI, distanceToAlert, isNearby, sortBySeverity } from './lta.js';

export function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatDistance(km) {
    if (km === null) return null;
    return km < 1 ? `~${Math.round(km * 1000)}m away` : `~${km.toFixed(1)}km away`;
}

export function formatAlert(alert, refLat = null, refLng = null) {
    const emoji = SEVERITY_EMOJI[alert.severity] || '⚪';
    const lines = [`${emoji} <b>${escapeHtml(alert.headline || 'Flood Alert')}</b> (${escapeHtml(alert.severity || 'Unknown')})`];

    if (alert.areaDesc) lines.push(`📍 ${escapeHtml(alert.areaDesc)}`);
    if (alert.description) lines.push(escapeHtml(alert.description));
    if (alert.instruction) lines.push(`💡 ${escapeHtml(alert.instruction)}`);

    if (refLat !== null && refLng !== null) {
        const dist = formatDistance(distanceToAlert(refLat, refLng, alert));
        const nearTag = isNearby(refLat, refLng, alert) ? ' \\- ⚠️ <b>near you</b>' : '';
        if (dist) lines.push(`📏 ${dist}${nearTag}`);
    }

    return lines.join('\n');
}

export function formatActiveAlertsList(activeAlerts, refLat = null, refLng = null, limit = 10) {
    if (activeAlerts.length === 0) {
        return '✅ No active flood alerts island-wide right now.';
    }
    const sorted = sortBySeverity(activeAlerts);
    const shown = sorted.slice(0, limit);
    const blocks = shown.map(a => formatAlert(a, refLat, refLng));
    let text = `🚨 <b>${activeAlerts.length} active flood alert${activeAlerts.length === 1 ? '' : 's'}</b>\n\n${blocks.join('\n\n')}`;
    if (sorted.length > limit) {
        text += `\n\n…and ${sorted.length - limit} more. Open the web app for the full list.`;
    }
    return text;
}
