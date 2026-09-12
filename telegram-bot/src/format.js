import { SEVERITY_EMOJI, distanceToAlert, isNearby, sortBySeverity } from './lta.js';

// Structured views are sent as Telegram Rich Messages (Bot API 10.1+), written
// in Telegram's Rich Markdown dialect (GitHub-Flavored Markdown: headings,
// bullet lists, pipe tables). Every builder here returns the message contract
// used by reply.js:
//
//     { markdown: <Rich Markdown string>, fallback: <plain text string> }
//
// `fallback` carries the same information as plain text and is what gets sent
// if Telegram rejects the rich payload. One-line notices skip the rich path
// entirely and go out as ordinary plain-text replies.

// Characters that start markup in Rich Markdown. `<` and `&` are included
// because Rich Markdown also accepts inline HTML.
const MD_SPECIALS = /([\\*_~`|[\]#>=$!<&])/g;

// Escape user/data text for Telegram's Rich Markdown dialect.
export function escapeMd(text) {
    return String(text ?? '').replace(MD_SPECIALS, '\\$1');
}

// Escape for a GFM table cell or a single-line list item; also flattens
// newlines so the row / item stays intact.
export function escapeCell(text) {
    return escapeMd(String(text ?? '').replace(/\s*\r?\n\s*/g, ' '));
}

// GFM pipe table. Cell contents are escaped here, so callers pass raw values.
export function mdTable(headers, rows) {
    const lines = [
        '| ' + headers.join(' | ') + ' |',
        '| ' + headers.map(() => '---').join(' | ') + ' |'
    ];
    for (const row of rows) {
        lines.push('| ' + row.map(escapeCell).join(' | ') + ' |');
    }
    return lines.join('\n');
}

function formatDistance(km) {
    if (km === null) return null;
    return km < 1 ? `≈${Math.round(km * 1000)}m away` : `≈${km.toFixed(1)}km away`;
}

function severityEmoji(alert) {
    return SEVERITY_EMOJI[alert.severity] || '⚪';
}

function distanceInfo(alert, refLat, refLng) {
    if (refLat === null || refLng === null) return null;
    return {
        text: formatDistance(distanceToAlert(refLat, refLng, alert)),
        near: isNearby(refLat, refLng, alert)
    };
}

// One alert as a "## heading + bullets" section (markdown) and as a plain
// text block (fallback).
export function formatAlert(alert, refLat = null, refLng = null) {
    const emoji = severityEmoji(alert);
    const headline = alert.headline || 'Flood Alert';
    const severity = alert.severity || 'Unknown';
    const dist = distanceInfo(alert, refLat, refLng);

    // Headings and list items are single-line constructs, so LTA strings go
    // through escapeCell (which flattens newlines) rather than escapeMd.
    const md = [`## ${emoji} ${escapeCell(headline)}`, `**Severity:** ${escapeCell(severity)}`];
    const plain = [`${emoji} ${headline} (${severity})`];

    if (alert.areaDesc) {
        md.push(`- 📍 ${escapeCell(alert.areaDesc)}`);
        plain.push(`📍 ${alert.areaDesc}`);
    }
    if (alert.description) {
        md.push(`- ${escapeCell(alert.description)}`);
        plain.push(alert.description);
    }
    if (alert.instruction) {
        md.push(`- 💡 ${escapeCell(alert.instruction)}`);
        plain.push(`💡 ${alert.instruction}`);
    }
    if (dist?.text) {
        md.push(`- 📏 ${escapeCell(dist.text)}${dist.near ? ' — ⚠️ **near you**' : ''}`);
        plain.push(`📏 ${dist.text}${dist.near ? ' — ⚠️ near you' : ''}`);
    }

    return { markdown: md.join('\n'), fallback: plain.join('\n') };
}

// Island-wide (or near-a-point) list of active alerts. Returns
// `{ markdown, fallback }`; `markdown` is null when the list is empty, since
// "no alerts" is a one-line notice that doesn't need the rich path.
export function formatActiveAlertsList(activeAlerts, refLat = null, refLng = null, { title = null, limit = 10 } = {}) {
    const titleMd = title ? `# ${escapeCell(title)}\n\n` : '';
    const titlePlain = title ? `📍 ${title}\n\n` : '';

    if (activeAlerts.length === 0) {
        return {
            markdown: null,
            fallback: `${titlePlain}✅ No active flood alerts island-wide right now.`
        };
    }

    const sorted = sortBySeverity(activeAlerts);
    const shown = sorted.slice(0, limit);
    const count = activeAlerts.length;
    const heading = `🚨 ${count} active flood alert${count === 1 ? '' : 's'}`;
    const withDistance = refLat !== null && refLng !== null;

    const headers = ['Alert', 'Severity', 'Area', ...(withDistance ? ['Distance'] : [])];
    const rows = shown.map(a => {
        const dist = distanceInfo(a, refLat, refLng);
        return [
            `${severityEmoji(a)} ${a.headline || 'Flood Alert'}`,
            a.severity || 'Unknown',
            a.areaDesc || '—',
            ...(withDistance ? [dist?.text ? `${dist.text}${dist.near ? ' ⚠️' : ''}` : '—'] : [])
        ];
    });

    const sections = shown.map(a => formatAlert(a, refLat, refLng));
    const md = [
        `${titleMd}${title ? '## ' : '# '}${heading}`,
        mdTable(headers, rows),
        ...sections.map(s => s.markdown)
    ];
    const plain = [`${titlePlain}${heading}`, ...sections.map(s => s.fallback)];

    if (sorted.length > limit) {
        const more = `…and ${sorted.length - limit} more. Open the web app for the full list.`;
        md.push(escapeMd(more));
        plain.push(more);
    }

    return { markdown: md.join('\n\n'), fallback: plain.join('\n\n') };
}
