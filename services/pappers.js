const https = require('https');

const PAPPERS_API_KEY = process.env.PAPPERS_API_KEY || '';

/**
 * Search Pappers API for a company and return the owner/manager name
 * @param {string} companyName - Business name
 * @param {string} city - City for better matching
 * @returns {Promise<string>} Owner name or ''
 */
function findOwnerName(companyName, city) {
  if (!PAPPERS_API_KEY) return Promise.resolve('');

  // Clean company name for search
  const q = companyName.replace(/[✂🔥💇📍]/g, '').trim();
  const params = new URLSearchParams({
    api_token: PAPPERS_API_KEY,
    q,
    par_page: '1',
  });
  if (city) params.append('code_postal', '');

  const url = `https://api.pappers.fr/v2/recherche?${params}`;

  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const company = json.resultats?.[0];
          if (!company) return resolve('');

          // Try to find the main dirigeant (représentant légal)
          const dirigeants = company.dirigeants || company.representants || [];
          if (dirigeants.length === 0) return resolve('');

          // Priority: président, gérant, directeur général
          const priority = ['président', 'gérant', 'directeur général', 'directeur'];
          let best = dirigeants[0];
          for (const d of dirigeants) {
            const qual = (d.qualite || '').toLowerCase();
            if (priority.some(p => qual.includes(p))) {
              best = d;
              break;
            }
          }

          const prenom = best.prenom || best.prenom_usuel || '';
          const nom = best.nom || best.nom_usage || '';
          if (!nom && !prenom) return resolve('');

          resolve(`${prenom} ${nom}`.trim());
        } catch {
          resolve('');
        }
      });
    });

    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

/**
 * Batch lookup owner names for multiple prospects
 * @param {Array} prospects - Array of prospect objects with name and city
 * @returns {Promise<string[]>} Array of owner names
 */
async function batchFindOwners(prospects) {
  if (!PAPPERS_API_KEY) return prospects.map(() => '');

  const results = [];
  for (const p of prospects) {
    // Rate limit: small delay between calls
    const name = await findOwnerName(p.name, p.city);
    results.push(name);
    if (name) await new Promise(r => setTimeout(r, 200)); // politeness delay
  }
  return results;
}

module.exports = { findOwnerName, batchFindOwners };
