/**
 * Social Media Check Service
 * Uses Google Custom Search API to detect Facebook/Instagram/TikTok presence
 */
const https = require('https');

const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || '';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Google Custom Search request
 */
function googleSearchRequest(query, apiKey, cseId) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      key: apiKey,
      cx: cseId,
      q: query,
      num: '3', // max 3 results to check
    });

    const options = {
      hostname: 'customsearch.googleapis.com',
      path: `/customsearch/v1?${params.toString()}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(parsed?.error?.message || `Google CSE HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) { reject(new Error('Invalid Google CSE response')); }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Google CSE timeout')); });
    req.end();
  });
}

/**
 * Check if a business has Facebook, Instagram, or TikTok presence
 * @param {string} businessName - The business name
 * @param {string} city - The city name
 * @param {string} [apiKey] - Google API key (defaults to env)
 * @param {string} [cseId] - Custom Search Engine ID (defaults to env)
 * @returns {Promise<{facebook: number, instagram: number, tiktok: number}>}
 *   -1 = not checked, 0 = not found, 1 = found
 */
async function checkSocialMedia(businessName, city, apiKey, cseId) {
  const key = apiKey || GOOGLE_API_KEY;
  const cx = cseId || GOOGLE_CSE_ID;

  // If no CSE configured, return unchecked
  if (!cx || !key) {
    console.log(`[SOCIAL] Skipping check for "${businessName}" — no GOOGLE_CSE_ID configured`);
    return { facebook: -1, instagram: -1, tiktok: -1 };
  }

  const result = { facebook: 0, instagram: 0, tiktok: 0 };

  try {
    // Single query searching all 3 platforms
    const query = `"${businessName}" ${city} (site:facebook.com OR site:instagram.com OR site:tiktok.com)`;
    const response = await googleSearchRequest(query, key, cx);

    const items = response.items || [];

    for (const item of items) {
      const link = (item.link || '').toLowerCase();
      const displayLink = (item.displayLink || '').toLowerCase();

      if (link.includes('facebook.com') || displayLink.includes('facebook.com')) {
        result.facebook = 1;
      }
      if (link.includes('instagram.com') || displayLink.includes('instagram.com')) {
        result.instagram = 1;
      }
      if (link.includes('tiktok.com') || displayLink.includes('tiktok.com')) {
        result.tiktok = 1;
      }
    }

    console.log(`[SOCIAL] "${businessName}" → FB:${result.facebook} IG:${result.instagram} TT:${result.tiktok}`);
  } catch (err) {
    console.error(`[SOCIAL] Error checking "${businessName}":`, err.message);
    // Return -1 (unchecked) on error
    return { facebook: -1, instagram: -1, tiktok: -1 };
  }

  return result;
}

/**
 * Batch check social media for multiple prospects
 * @param {Array<{name: string, city: string}>} prospects
 * @param {string} [apiKey]
 * @param {string} [cseId]
 * @returns {Promise<Array<{facebook: number, instagram: number, tiktok: number}>>}
 */
async function batchCheckSocialMedia(prospects, apiKey, cseId) {
  const results = [];

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];
    const social = await checkSocialMedia(p.name, p.city, apiKey, cseId);
    results.push(social);

    // Throttle: 200ms between requests to respect rate limits
    if (i < prospects.length - 1) {
      await delay(200);
    }
  }

  return results;
}

/**
 * Check if CSE is configured
 */
function isSocialCheckAvailable() {
  return !!(GOOGLE_CSE_ID && GOOGLE_API_KEY);
}

module.exports = { checkSocialMedia, batchCheckSocialMedia, isSocialCheckAvailable };
