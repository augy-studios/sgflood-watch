// Same Nominatim endpoint main-site/script.js uses for area search.
// Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
// requires a descriptive User-Agent and caps usage at ~1 request/second, which
// the bot's low personal-use traffic comfortably stays under.
const USER_AGENT = 'SGFloodWatchBot/1.0 (+https://sgflood.uwuapps.org)';

export async function searchLocation(query) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=sg`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Nominatim search failed with status ${res.status}`);
    const results = await res.json();
    if (!results.length) return null;

    const top = results[0];
    return {
        lat: parseFloat(top.lat),
        lng: parseFloat(top.lon),
        label: top.display_name
    };
}
