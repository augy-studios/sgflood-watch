export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({
        error: 'Method not allowed'
    });

    const apiKey = process.env.LTA_ACCOUNT_KEY;
    if (!apiKey) return res.status(500).json({
        error: 'LTA API key not configured'
    });

    try {
        const response = await fetch(
            'https://datamall2.mytransport.sg/ltaodataservice/PubFloodAlerts', {
                headers: {
                    'AccountKey': apiKey,
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`LTA API responded with status ${response.status}`);
        }

        const data = await response.json();
        return res.status(200).json({
            ok: true,
            fetchedAt: new Date().toISOString(),
            alerts: data.value || []
        });
    } catch (err) {
        console.error('Flood alert fetch error:', err);
        return res.status(502).json({
            ok: false,
            error: 'Failed to fetch flood alert data',
            details: err.message
        });
    }
}