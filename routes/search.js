const { Router } = require('express');
const https = require('https');
const validator = require('validator');
const db = require('../db');
const { batchCheckSocialMedia, isSocialCheckAvailable } = require('../services/socialCheck');

const router = Router();

const VALID_SEARCH_MODES = ['site', 'social', 'both'];

// API key from environment
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error('\x1b[31m[WARN] GOOGLE_API_KEY not set in .env — search will fail\x1b[0m');
}

// City lists
const CITIES = {
  fr: [
    {name:'Paris',lat:48.8566,lng:2.3522},{name:'Marseille',lat:43.2965,lng:5.3698},
    {name:'Lyon',lat:45.7640,lng:4.8357},{name:'Toulouse',lat:43.6047,lng:1.4442},
    {name:'Nice',lat:43.7102,lng:7.2620},{name:'Nantes',lat:47.2184,lng:-1.5536},
    {name:'Strasbourg',lat:48.5734,lng:7.7521},{name:'Montpellier',lat:43.6108,lng:3.8767},
    {name:'Bordeaux',lat:44.8378,lng:-0.5792},{name:'Lille',lat:50.6292,lng:3.0573},
    {name:'Rennes',lat:48.1173,lng:-1.6778},{name:'Reims',lat:49.2583,lng:3.7994},
    {name:'Toulon',lat:43.1242,lng:5.928},{name:'Saint-Étienne',lat:45.4397,lng:4.3872},
    {name:'Le Havre',lat:49.4944,lng:0.1079},{name:'Grenoble',lat:45.1885,lng:5.7245},
    {name:'Dijon',lat:47.3220,lng:5.0415},{name:'Angers',lat:47.4784,lng:-0.5632},
    {name:'Nîmes',lat:43.8367,lng:4.3601},{name:'Clermont-Ferrand',lat:45.7772,lng:3.0870},
    {name:'Le Mans',lat:48.0061,lng:0.1996},{name:'Aix-en-Provence',lat:43.5297,lng:5.4474},
    {name:'Brest',lat:48.3904,lng:-4.4861},{name:'Tours',lat:47.3941,lng:0.6848},
    {name:'Amiens',lat:49.8941,lng:2.2958},{name:'Limoges',lat:45.8336,lng:1.2611},
    {name:'Perpignan',lat:42.6887,lng:2.8948},{name:'Metz',lat:49.1193,lng:6.1757},
    {name:'Besançon',lat:47.2378,lng:6.0241},{name:'Orléans',lat:47.9029,lng:1.9093},
    {name:'Rouen',lat:49.4432,lng:1.0993},{name:'Mulhouse',lat:47.7508,lng:7.3359},
    {name:'Caen',lat:49.1829,lng:-0.3707},{name:'Nancy',lat:48.6921,lng:6.1844},
    {name:'Argenteuil',lat:48.9472,lng:2.2467},{name:'Saint-Denis',lat:48.9362,lng:2.3574},
    {name:'Montreuil',lat:48.8638,lng:2.4484},{name:'Roubaix',lat:50.6942,lng:3.1746},
    {name:'Tourcoing',lat:50.7239,lng:3.1612},{name:'Avignon',lat:43.9493,lng:4.8055},
    {name:'Dunkerque',lat:51.0343,lng:2.3768},{name:'Créteil',lat:48.7905,lng:2.4559},
    {name:'Nanterre',lat:48.8924,lng:2.2071},{name:'Poitiers',lat:46.5802,lng:0.3404},
    {name:'Versailles',lat:48.8014,lng:2.1301},{name:'Courbevoie',lat:48.8966,lng:2.2529},
    {name:'Vitry-sur-Seine',lat:48.7876,lng:2.4015},{name:'Colombes',lat:48.9225,lng:2.2549},
    {name:'Pau',lat:43.2951,lng:-0.3708},{name:'Aulnay-sous-Bois',lat:48.9385,lng:2.4905},
    {name:'Asnières-sur-Seine',lat:48.9117,lng:2.2885},{name:'Rueil-Malmaison',lat:48.8769,lng:2.1894},
    {name:'La Rochelle',lat:46.1603,lng:-1.1511},{name:'Antibes',lat:43.5808,lng:7.1239},
    {name:'Saint-Maur-des-Fossés',lat:48.7933,lng:2.4925},{name:'Calais',lat:50.9513,lng:1.8587},
    {name:'Cannes',lat:43.5528,lng:7.0174},{name:'Béziers',lat:43.3442,lng:3.2192},
    {name:'Colmar',lat:48.0794,lng:7.3584},{name:'Bourges',lat:47.0810,lng:2.3988},
    {name:'Quimper',lat:47.9960,lng:-4.0999},{name:'Valence',lat:44.9334,lng:4.8924},
    {name:'Troyes',lat:48.2973,lng:4.0744},{name:'Lorient',lat:47.7483,lng:-3.3600},
    {name:'Chambéry',lat:45.5646,lng:5.9178},{name:'Niort',lat:46.3234,lng:-0.4584},
    {name:'Laval',lat:48.0735,lng:-0.7696},{name:'Sète',lat:43.4075,lng:3.6976},
    {name:'Ajaccio',lat:41.9192,lng:8.7386},{name:'Bastia',lat:42.6970,lng:9.4503},
  ],
  ch: [
    {name:'Zurich',lat:47.3769,lng:8.5417},{name:'Genève',lat:46.2044,lng:6.1432},
    {name:'Bâle',lat:47.5596,lng:7.5886},{name:'Lausanne',lat:46.5197,lng:6.6323},
    {name:'Berne',lat:46.9480,lng:7.4474},{name:'Winterthour',lat:47.5056,lng:8.7241},
    {name:'Lucerne',lat:47.0502,lng:8.3093},{name:'Saint-Gall',lat:47.4245,lng:9.3767},
    {name:'Lugano',lat:46.0037,lng:8.9511},{name:'Bienne',lat:47.1368,lng:7.2467},
    {name:'Thoune',lat:46.7580,lng:7.6280},{name:'Fribourg',lat:46.8065,lng:7.1620},
    {name:'Schaffhouse',lat:47.6960,lng:8.6361},{name:'Neuchâtel',lat:46.9900,lng:6.9293},
    {name:'Sion',lat:46.2270,lng:7.3586},{name:'Montreux',lat:46.4312,lng:6.9107},
    {name:'Yverdon',lat:46.7785,lng:6.6411},{name:'Nyon',lat:46.3833,lng:6.2398},
    {name:'Delémont',lat:47.3653,lng:7.3469},{name:'Martigny',lat:46.1029,lng:7.0714},
  ],
  be: [
    {name:'Bruxelles',lat:50.8503,lng:4.3517},{name:'Anvers',lat:51.2194,lng:4.4025},
    {name:'Gand',lat:51.0543,lng:3.7174},{name:'Charleroi',lat:50.4108,lng:4.4446},
    {name:'Liège',lat:50.6326,lng:5.5797},{name:'Bruges',lat:51.2093,lng:3.2247},
    {name:'Namur',lat:50.4674,lng:4.8720},{name:'Louvain',lat:50.8798,lng:4.7005},
    {name:'Mons',lat:50.4542,lng:3.9563},{name:'Malines',lat:51.0259,lng:4.4776},
    {name:'Aalst',lat:50.9376,lng:4.0376},{name:'Courtrai',lat:50.8279,lng:3.2649},
    {name:'Hasselt',lat:50.9307,lng:5.3375},{name:'Ostende',lat:51.2304,lng:2.9152},
    {name:'Saint-Nicolas',lat:51.1564,lng:4.1429},{name:'Tournai',lat:50.6060,lng:3.3880},
    {name:'Genk',lat:50.9653,lng:5.5014},{name:'Seraing',lat:50.5836,lng:5.5006},
    {name:'La Louvière',lat:50.4791,lng:4.1859},{name:'Verviers',lat:50.5895,lng:5.8636},
  ],
};

const VALID_COUNTRIES = Object.keys(CITIES);

function googlePlacesRequest(apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'places.googleapis.com',
      path: '/v1/places:searchText',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(parsed?.error?.message || `Google API HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) { reject(new Error('Réponse invalide Google Places')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Google API timeout')); });
    req.write(payload);
    req.end();
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// GET /api/search/cities — return city counts per country
router.get('/cities', (req, res) => {
  const counts = {};
  for (const [code, list] of Object.entries(CITIES)) {
    counts[code] = list.length;
  }
  res.json(counts);
});

// POST /api/search — search (1 credit = 1 prospect)
router.post('/', async (req, res) => {
  const userId = req.user.id;

  // ── Validate API key availability ──
  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'Clé Google API non configurée. Contactez l\'administrateur.' });
  }

  // ── Check credits ──
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (user.credits <= 0) return res.status(403).json({ error: 'Plus de crédits disponibles. Passez à un plan supérieur.' });

  // ── Extract & validate inputs ──
  const { niche, country, smartKeywords, numProspects, geoMode, geoLat, geoLng, geoRadius, searchMode: rawMode } = req.body;

  // Search mode: 'site' (no website), 'social' (no socials), 'both' (neither)
  const searchMode = VALID_SEARCH_MODES.includes(rawMode) ? rawMode : 'site';
  const creditMultiplier = searchMode === 'both' ? 2 : 1;

  // If social mode requested, check CSE availability
  if ((searchMode === 'social' || searchMode === 'both') && !isSocialCheckAvailable()) {
    return res.status(400).json({ error: 'Vérification réseaux sociaux non configurée. Ajoutez GOOGLE_CSE_ID dans les paramètres serveur.' });
  }

  if (!niche || typeof niche !== 'string') {
    return res.status(400).json({ error: 'Niche requise.' });
  }
  const sanitizedNiche = validator.escape(validator.trim(niche)).substring(0, 100);
  if (!sanitizedNiche) return res.status(400).json({ error: 'Niche invalide.' });

  const countryCode = (typeof country === 'string' ? country.toLowerCase().trim() : 'fr');
  if (!geoMode && !VALID_COUNTRIES.includes(countryCode)) {
    return res.status(400).json({ error: 'Pays non supporté. Choix: ' + VALID_COUNTRIES.join(', ') });
  }

  // Validate numProspects (account for credit multiplier)
  const requestedNum = Math.max(1, Math.min(parseInt(numProspects, 10) || 5, 200));
  const maxAffordable = Math.floor(user.credits / creditMultiplier);
  const maxProspects = Math.min(requestedNum, maxAffordable);
  if (maxProspects <= 0) return res.status(403).json({ error: 'Plus de crédits disponibles.' });

  // Validate geo params if geo mode
  if (geoMode) {
    if (typeof geoLat !== 'number' || typeof geoLng !== 'number' || geoLat < -90 || geoLat > 90 || geoLng < -180 || geoLng > 180) {
      return res.status(400).json({ error: 'Coordonnées géographiques invalides.' });
    }
  }

  // Validate smartKeywords
  const validKeywords = Array.isArray(smartKeywords) ? smartKeywords.filter(k => typeof k === 'string').slice(0, 100) : [];

  console.log(`[SEARCH] user=${userId} niche="${sanitizedNiche}" geo=${geoMode ? 'yes' : countryCode} searchMode=${searchMode} maxProspects=${maxProspects} creditX=${creditMultiplier}`);

  // ── Log search ──
  const searchLabel = geoMode ? 'geo' : countryCode;
  const searchResult = db.prepare('INSERT INTO searches (user_id, niche, country, search_mode) VALUES (?, ?, ?, ?)').run(userId, sanitizedNiche, searchLabel, searchMode);
  const searchId = searchResult.lastInsertRowid;

  // ── Normalize function for keyword filtering ──
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const keywords = validKeywords.map(k => norm(k));

  const seenPhones = new Set();
  const prospects = [];

  // Get existing phones for this user to avoid duplicates
  const existingPhones = db.prepare('SELECT phone FROM prospects WHERE user_id = ?').all(userId);
  existingPhones.forEach(p => seenPhones.add(p.phone));

  // Collect target: same as maxProspects (no over-fetch needed — we sort, not filter)
  const collectMax = maxProspects;

  // ── Helper: process places from a Google API response ──
  function processPlaces(places, cityName) {
    for (const place of places) {
      if (prospects.length >= collectMax) break;

      const name = place.displayName?.text || '';
      const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || null;
      const websiteUrl = place.websiteUri || '';
      if (!phone || seenPhones.has(phone)) continue;

      // Mode 'site' or 'both': filter OUT businesses WITH a website
      if ((searchMode === 'site' || searchMode === 'both') && websiteUrl) continue;

      // Mode 'social': keep all businesses (with or without website)
      // Website filter NOT applied — we only care about social media

      // Smart keyword filter
      if (keywords.length > 0) {
        const nameLow = norm(name);
        if (!keywords.some(k => nameLow.includes(k))) continue;
      }

      seenPhones.add(phone);
      prospects.push({
        name: validator.escape(name).substring(0, 200),
        phone: phone.substring(0, 30),
        address: (place.formattedAddress || '').substring(0, 300),
        rating: place.rating ?? null,
        reviews: place.userRatingCount ?? 0,
        city: cityName,
        website_url: websiteUrl,
        has_facebook: -1,
        has_instagram: -1,
        has_tiktok: -1,
      });
    }
  }

  try {
    if (geoMode && geoLat && geoLng) {
      // ── GEO MODE: search around user's location ──
      const radiusMeters = Math.max(1000, Math.min((parseInt(geoRadius, 10) || 30) * 1000, 100000));
      let pageToken = null;

      for (let page = 1; page <= 5; page++) {
        if (prospects.length >= maxProspects) break;

        const body = {
          textQuery: niche, // Use original niche for Google (not escaped)
          languageCode: 'fr',
          locationBias: { circle: { center: { latitude: geoLat, longitude: geoLng }, radius: radiusMeters } },
          maxResultCount: 20,
        };
        if (pageToken) body.pageToken = pageToken;

        try {
          const data = await googlePlacesRequest(GOOGLE_API_KEY, body);
          const places = data.places || [];
          processPlaces(places, 'Autour de moi');

          pageToken = data.nextPageToken || null;
          if (!pageToken || places.length === 0) break;
          if (page < 5) await delay(300);
        } catch (err) {
          console.error(`[SEARCH] Geo search error page ${page}:`, err.message);
          break;
        }
      }

    } else {
      // ── CITY MODE: iterate through country cities ──
      const allCities = CITIES[countryCode];

      for (const city of allCities) {
        if (prospects.length >= maxProspects) break;

        let pageToken = null;

        for (let page = 1; page <= 3; page++) {
          if (prospects.length >= maxProspects) break;

          const body = {
            textQuery: `${niche} ${city.name}`,
            languageCode: 'fr',
            regionCode: countryCode,
            locationBias: { circle: { center: { latitude: city.lat, longitude: city.lng }, radius: 50000 } },
            maxResultCount: 20,
          };
          if (pageToken) body.pageToken = pageToken;

          try {
            const data = await googlePlacesRequest(GOOGLE_API_KEY, body);
            const places = data.places || [];
            processPlaces(places, city.name);

            pageToken = data.nextPageToken || null;
            if (!pageToken || places.length === 0) break;
            if (page < 3) await delay(300);
          } catch (err) {
            console.error(`[SEARCH] City ${city.name} error:`, err.message);
            break;
          }
        }

        await delay(150);
      }
    }

    console.log(`[SEARCH] Google Places done. Collected ${prospects.length} raw prospects for user ${userId}`);

    // ── Social media check (modes: social, both) ──
    if (searchMode === 'social' || searchMode === 'both') {
      // Check up to maxProspects (no need for big pool — we keep all results)
      const toCheck = prospects.slice(0, maxProspects);
      console.log(`[SEARCH] Running social media check on ${toCheck.length} prospects...`);
      const socialResults = await batchCheckSocialMedia(toCheck, GOOGLE_API_KEY);

      for (let i = 0; i < toCheck.length; i++) {
        toCheck[i].has_facebook = socialResults[i].facebook;
        toCheck[i].has_instagram = socialResults[i].instagram;
        toCheck[i].has_tiktok = socialResults[i].tiktok;
      }

      // Sort: prospects WITHOUT social media first (best prospects on top)
      toCheck.sort((a, b) => {
        const scoreA = (a.has_facebook === 0 ? 0 : 1) + (a.has_instagram === 0 ? 0 : 1) + (a.has_tiktok === 0 ? 0 : 1);
        const scoreB = (b.has_facebook === 0 ? 0 : 1) + (b.has_instagram === 0 ? 0 : 1) + (b.has_tiktok === 0 ? 0 : 1);
        return scoreA - scoreB; // fewer social = better = first
      });

      const noSocial = toCheck.filter(p => p.has_facebook === 0 && p.has_instagram === 0 && p.has_tiktok === 0).length;

      // Replace prospects array
      prospects.length = 0;
      prospects.push(...toCheck);

      console.log(`[SEARCH] Social check done: ${noSocial}/${toCheck.length} without social media (sorted best first)`);
    } else {
      // Mode 'site': trim to maxProspects
      prospects.length = Math.min(prospects.length, maxProspects);
    }

    console.log(`[SEARCH] Final: ${prospects.length}/${maxProspects} prospects for user ${userId}`);

    // ── Charge credits (×1 for site/social, ×2 for both) ──
    const creditsToCharge = prospects.length * creditMultiplier;
    if (creditsToCharge > 0) {
      db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(creditsToCharge, userId);
    }

    // ── Save prospects to DB (transaction) ──
    const insert = db.prepare(`
      INSERT INTO prospects (user_id, name, phone, address, rating, reviews, city, niche, search_id, website_url, has_facebook, has_instagram, has_tiktok, search_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items) => {
      for (const p of items) {
        insert.run(userId, p.name, p.phone, p.address, p.rating, p.reviews, p.city, sanitizedNiche, searchId,
          p.website_url || '', p.has_facebook, p.has_instagram, p.has_tiktok, searchMode);
      }
    });
    insertMany(prospects);

    // Update search results count
    db.prepare('UPDATE searches SET results_count = ? WHERE id = ?').run(prospects.length, searchId);

    // Get updated credits
    const updated = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);

    res.json({
      ok: true,
      count: prospects.length,
      credits: updated.credits,
      searchMode,
      prospects: prospects.map((p, i) => ({
        id: i,
        ...p,
        status: 'todo',
        notes: '',
        rappel: '',
      })),
    });

  } catch (err) {
    console.error('[SEARCH] Fatal error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recherche. Réessayez.' });
  }
});

// GET /api/search/modes — return available search modes
router.get('/modes', (req, res) => {
  res.json({
    socialCheckAvailable: isSocialCheckAvailable(),
    modes: [
      { id: 'site', label: 'Sans site web', icon: '🔍', cost: 1, available: true },
      { id: 'social', label: 'Sans réseaux', icon: '📱', cost: 1, available: isSocialCheckAvailable() },
      { id: 'both', label: 'Complet', icon: '🔥', cost: 2, available: isSocialCheckAvailable() },
    ],
  });
});

module.exports = router;
