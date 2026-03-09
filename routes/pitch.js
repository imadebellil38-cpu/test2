const { Router } = require('express');
const https = require('https');
const validator = require('validator');
const db = require('../db');

const router = Router();

// API key from environment
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('\x1b[31m[WARN] ANTHROPIC_API_KEY not set in .env — pitch generation will fail\x1b[0m');
}

const VALID_PITCH_TYPES = ['appel', 'email', 'sms', 'linkedin', 'fiche', 'keywords'];

const PITCH_PROMPTS = {
  appel: (name, niche, pays, rating, reviews, ownerName) =>
`Tu es un expert commercial en création de sites web pour artisans et PME. Génère un script d'appel téléphonique en français pour démarcher ${name}, un(e) ${niche} basé(e) à ${pays}.

Informations :
- Entreprise : ${name}${ownerName ? '\n- Gérant/Propriétaire : ' + ownerName : ''}
- Activité : ${niche}
- Ville : ${pays}
- Note Google : ${rating}
- Nombre d'avis Google : ${reviews}
- Situation : visible sur Google Maps, mais SANS site web

Rédige le script selon ces critères :
1. Présentation rapide (prénom fictif + agence web locale)
2. Accroche basée sur leurs avis Google pour briser la glace
3. Problème concret : clients perdus chaque mois sans site (pas de RDV en ligne, horaires introuvables, concurrents avec site captent les leads)
4. Solution simple, rapide à mettre en place
5. Question de clôture pour obtenir un rendez-vous de 15 minutes

Durée de lecture à voix haute : 60 à 90 secondes. Ton : naturel, humain, chaleureux — pas agressif ni trop vendeur. Commence directement par le script sans titre ni introduction.`,

  email: (name, niche, pays, rating, reviews, ownerName) =>
`Tu es un expert commercial en création de sites web pour artisans et PME. Rédige un email de prospection en français pour démarcher ${name}, un(e) ${niche} basé(e) à ${pays}.

Informations :
- Entreprise : ${name}${ownerName ? '\n- Gérant/Propriétaire : ' + ownerName : ''}
- Activité : ${niche}
- Ville : ${pays}
- Note Google : ${rating}
- Nombre d'avis Google : ${reviews}
- Situation : visible sur Google Maps, mais SANS site web

L'email doit :
1. Avoir un objet accrocheur (ligne "Objet :")
2. Être court (150 mots max)
3. Mentionner leurs avis Google comme accroche positive
4. Expliquer le problème (clients perdus sans site web)
5. Proposer un appel de 15 min
6. Ton : professionnel mais humain, pas trop vendeur

Commence directement par "Objet :" sans titre ni introduction.`,

  sms: (name, niche, pays, rating, reviews, ownerName) =>
`Tu es un expert commercial en création de sites web. Rédige un SMS de prospection court en français pour ${name}, un(e) ${niche} à ${pays}.${ownerName ? ' Gérant : ' + ownerName + '.' : ''}

Infos : ${reviews} avis Google, note ${rating}, pas de site web.

Le SMS doit :
1. Faire maximum 300 caractères
2. Être direct et accrocheur
3. Mentionner un bénéfice concret
4. Inclure un appel à l'action (rappel, lien, rdv)
5. Ton : amical, pas agressif

Commence directement par le SMS sans titre.`,

  linkedin: (name, niche, pays, rating, reviews, ownerName) =>
`Tu es un expert commercial en création de sites web. Rédige un message LinkedIn de prospection en français pour contacter ${ownerName ? ownerName + ', gérant de ' + name : 'le gérant de ' + name}, un(e) ${niche} à ${pays}.

Informations :
- Entreprise : ${name}${ownerName ? '\n- Gérant/Propriétaire : ' + ownerName : ''}
- Activité : ${niche}
- Ville : ${pays}
- Note Google : ${rating}
- Nombre d'avis Google : ${reviews}
- Situation : visible sur Google Maps, mais SANS site web

Le message doit :
1. Être court (100 mots max)
2. Commencer par une accroche personnalisée (avis Google, ville)
3. Expliquer rapidement le problème et la solution
4. Proposer un échange rapide
5. Ton : décontracté, professionnel, comme un vrai message LinkedIn

Commence directement par le message sans titre.`,

  keywords: (name, niche) =>
`Tu es un assistant de prospection. L'utilisateur cherche des commerces de type : "${niche}".

Génère une liste de mots-clés (en français ET en anglais) qu'on pourrait trouver dans le NOM d'un commerce qui correspond à cette niche.

Règles :
- Donne UNIQUEMENT les mots-clés, séparés par des virgules
- Inclus les variantes (singulier/pluriel, anglais/français)
- Inclus les noms de marques/univers populaires liés à cette niche
- Inclus le vocabulaire argot/familier du milieu
- Minimum 30 mots-clés
- Pas de phrase, pas d'explication, juste les mots séparés par des virgules
- Commence directement par les mots-clés`,

  fiche: (name, niche, pays, rating, reviews, ownerName) =>
`Tu es un assistant de prospection B2B. À partir des informations suivantes, donne-moi une FICHE RAPIDE de cette entreprise pour préparer un appel commercial.

Informations :
- Nom : ${name}${ownerName ? '\n- Gérant/Propriétaire : ' + ownerName : ''}
- Secteur recherché : ${niche}
- Ville : ${pays}
- Note Google : ${rating}
- Nombre d'avis Google : ${reviews}

Donne-moi ces informations de manière concise et structurée :

1. **Spécialité probable** : déduis la spécialité à partir du nom
2. **Type d'établissement** : (ex: fast-food, gastro, salon haut de gamme, artisan de quartier…)
3. **Clientèle cible** : (ex: familles, jeunes actifs, touristes, pros…)
4. **Gamme de prix probable** : (€, €€, €€€)
5. **Points forts à mentionner** : basé sur la note et les avis, 2-3 arguments pour briser la glace à l'appel
6. **Accroche suggérée** : une phrase d'ouverture naturelle pour démarrer l'appel

Sois direct et concis. Pas de blabla. Commence directement par la fiche.`,
};

function callClaude(apiKey, prospect, niche, pitchType) {
  return new Promise((resolve, reject) => {
    const pays = prospect.city || '';
    const rating = prospect.rating ? prospect.rating + '/5' : 'non renseignée';
    const reviews = prospect.reviews || 0;
    const ownerName = prospect.owner_name || '';
    const promptFn = PITCH_PROMPTS[pitchType] || PITCH_PROMPTS.appel;
    const prompt = promptFn(prospect.name, niche, pays, rating, reviews, ownerName);

    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Réponse invalide de l\'API Anthropic')); }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Anthropic API timeout')); });
    req.write(body);
    req.end();
  });
}

function callClaudeRaw(apiKey, prompt, maxTokens = 900) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Réponse invalide de l\'API Anthropic')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Anthropic API timeout')); });
    req.write(body);
    req.end();
  });
}

// POST /api/pitch
router.post('/', async (req, res) => {
  const { prospect, niche, pitchType } = req.body;

  // ── Validate inputs ──
  if (!prospect || typeof prospect !== 'object' || !prospect.name) {
    return res.status(400).json({ error: 'Données du prospect invalides.' });
  }
  if (!niche || typeof niche !== 'string' || niche.trim().length === 0) {
    return res.status(400).json({ error: 'Niche requise.' });
  }
  const type = VALID_PITCH_TYPES.includes(pitchType) ? pitchType : 'appel';

  // ── Resolve API key ──
  const user = db.prepare('SELECT anthropic_key FROM users WHERE id = ?').get(req.user.id);
  const apiKey = ANTHROPIC_API_KEY || (user && user.anthropic_key);
  if (!apiKey) {
    return res.status(400).json({ error: 'Clé API Anthropic non configurée. Contactez l\'administrateur.' });
  }

  try {
    const result = await callClaude(apiKey, prospect, validator.trim(niche), type);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[PITCH] Error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la génération du pitch. Réessayez.' });
  }
});

// POST /api/pitch/keywords
router.post('/keywords', async (req, res) => {
  const { niche } = req.body;

  // ── Validate ──
  if (!niche || typeof niche !== 'string' || niche.trim().length === 0) {
    return res.status(400).json({ error: 'Niche requise.' });
  }

  const user = db.prepare('SELECT anthropic_key FROM users WHERE id = ?').get(req.user.id);
  const apiKey = ANTHROPIC_API_KEY || (user && user.anthropic_key);
  if (!apiKey) {
    return res.status(400).json({ error: 'Clé API Anthropic non configurée.' });
  }

  try {
    const result = await callClaude(apiKey, { name: '', city: '' }, validator.trim(niche), 'keywords');
    const text = result.body?.content?.[0]?.text || '';
    const keywords = text.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 1);
    res.json({ keywords });
  } catch (err) {
    console.error('[KEYWORDS] Error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la génération des mots-clés.' });
  }
});

// ── Google Custom Search helper ──
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

function googleSearch(query) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ key: GOOGLE_API_KEY, cx: GOOGLE_CSE_ID, q: query, num: '3', lr: 'lang_fr' });
    const url = `https://customsearch.googleapis.com/customsearch/v1?${params}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ items: [] }); }
      });
    }).on('error', () => resolve({ items: [] }));
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// POST /api/pitch/extract-owners — extract owner names (2 phases: name analysis + Google search)
router.post('/extract-owners', async (req, res) => {
  const { prospects } = req.body;

  if (!Array.isArray(prospects) || prospects.length === 0) {
    return res.status(400).json({ error: 'Aucun prospect fourni.' });
  }
  if (prospects.length > 200) {
    return res.status(400).json({ error: 'Maximum 200 prospects à la fois.' });
  }

  // ── Check credits (costs 3) ──
  const user = db.prepare('SELECT credits, anthropic_key FROM users WHERE id = ?').get(req.user.id);
  if (!user || user.credits < 3) {
    return res.status(400).json({ error: `Crédits insuffisants (${user ? user.credits : 0}/3 requis).` });
  }
  const apiKey = ANTHROPIC_API_KEY || user.anthropic_key;
  if (!apiKey) {
    return res.status(400).json({ error: 'Clé API Anthropic non configurée.' });
  }

  const updateStmt = db.prepare('UPDATE prospects SET owner_name = ? WHERE id = ? AND user_id = ?');
  const results = [];

  try {
    // ════════════════════════════════════════
    // PHASE 1 — Extract from business names
    // ════════════════════════════════════════
    const list = prospects.map((p, i) => `${i + 1}. "${p.name}" (${p.city || '?'})`).join('\n');
    const prompt1 = `Voici une liste de noms d'entreprises/commerces. Pour chacun, essaie d'extraire le nom du gérant/propriétaire SI il est visible dans le nom de l'entreprise.

Règles :
- Si le nom d'entreprise contient clairement un prénom+nom de personne (ex: "Bucci Stéphane", "PELLEGRIN Dylan PLOMBIER"), extrais-le au format "Prénom Nom"
- Si le nom contient "Dr" ou "Docteur" + nom, extrais-le
- Si le nom contient un patronyme évident (ex: "Caprara Yoann Plomberie"), extrais-le
- Si c'est un nom de marque/enseigne sans nom de personne (ex: "La Flânerie", "SULTAN KABAB"), mets ""
- Ne devine PAS. Si tu n'es pas sûr, mets ""

Réponds UNIQUEMENT avec un JSON array, un objet par ligne, format: [{"i":1,"n":"Prénom Nom"},{"i":2,"n":""}]
Pas de texte avant/après, juste le JSON.

Liste :
${list}`;

    const r1 = await callClaudeRaw(apiKey, prompt1, 2000);
    if (r1.status !== 200) {
      const errMsg = r1.body?.error?.message || 'Erreur API Anthropic';
      return res.status(r1.status).json({ error: errMsg });
    }

    const text1 = r1.body?.content?.[0]?.text || '[]';
    const match1 = text1.match(/\[[\s\S]*\]/);
    let parsed1 = [];
    if (match1) { try { parsed1 = JSON.parse(match1[0]); } catch {} }

    // Apply phase 1 results
    const stillMissing = []; // prospects where no name found
    for (const item of parsed1) {
      const idx = item.i - 1;
      if (idx >= 0 && idx < prospects.length) {
        const ownerName = (item.n || '').trim().substring(0, 200);
        if (ownerName) {
          updateStmt.run(ownerName, prospects[idx].id, req.user.id);
          results.push({ id: prospects[idx].id, owner_name: ownerName });
        } else {
          stillMissing.push({ idx, prospect: prospects[idx] });
        }
      }
    }
    // Prospects not in parsed1 response
    const foundIdxs = new Set(parsed1.map(it => it.i - 1));
    for (let i = 0; i < prospects.length; i++) {
      if (!foundIdxs.has(i)) stillMissing.push({ idx: i, prospect: prospects[i] });
    }

    // ════════════════════════════════════════
    // PHASE 2 — Claude deep search for remaining
    // ════════════════════════════════════════
    const toSearch = stillMissing.slice(0, 50); // max 50 per batch

    if (toSearch.length > 0) {
      const listP2 = toSearch.map((s, i) =>
        `${i + 1}. "${s.prospect.name}" — ${s.prospect.city || '?'}`
      ).join('\n');

      const prompt2 = `Tu es un expert des entreprises françaises. Voici une liste de commerces/entreprises. Pour chacun, essaie de trouver le nom du gérant, propriétaire ou dirigeant.

Tu peux utiliser tes connaissances sur :
- Les registres d'entreprises françaises (societe.com, pappers.fr, infogreffe)
- Les franchises connues (qui est le franchisé local ?)
- Les indices dans le nom ou la ville
- Les entreprises connues publiquement

Règles STRICTES :
- Si tu CONNAIS le nom du dirigeant de cette entreprise, donne-le au format "Prénom Nom"
- Si tu n'es PAS SÛR à 90%+, mets "" — ne devine JAMAIS
- Ne confonds pas le nom de l'enseigne avec le dirigeant (ex: "Franck Provost" est une marque, pas forcément le gérant local)
- Pour les franchises nationales (Dessange, Franck Provost, etc), mets "" car le gérant local est inconnu

Réponds UNIQUEMENT avec un JSON array: [{"i":1,"n":"Prénom Nom"},{"i":2,"n":""}]

Entreprises :
${listP2}`;

      const r2 = await callClaudeRaw(apiKey, prompt2, 3000);
      if (r2.status === 200) {
        const text2 = r2.body?.content?.[0]?.text || '[]';
        const match2 = text2.match(/\[[\s\S]*\]/);
        let parsed2 = [];
        if (match2) { try { parsed2 = JSON.parse(match2[0]); } catch {} }

        for (const item of parsed2) {
          const si = item.i - 1;
          if (si >= 0 && si < toSearch.length) {
            const ownerName = (item.n || '').trim().substring(0, 200);
            const prospectIdx = toSearch[si].idx;
            if (ownerName) {
              updateStmt.run(ownerName, prospects[prospectIdx].id, req.user.id);
            }
            results.push({ id: prospects[prospectIdx].id, owner_name: ownerName });
          }
        }
      }
    }

    // Add empty results for truly unfound ones
    const foundIds = new Set(results.map(r => r.id));
    for (const p of prospects) {
      if (!foundIds.has(p.id)) results.push({ id: p.id, owner_name: '' });
    }

    // Only deduct credits if at least 1 name was found
    const totalFound = results.filter(r => r.owner_name).length;
    const creditsUsed = totalFound > 0 ? 3 : 0;
    if (creditsUsed > 0) {
      db.prepare('UPDATE users SET credits = credits - 3 WHERE id = ?').run(req.user.id);
    }

    const phase2Count = toSearch.length;
    res.json({ results, creditsUsed, phase2Searched: phase2Count, totalFound });
  } catch (err) {
    console.error('[EXTRACT-OWNERS] Error:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'extraction. Réessayez.' });
  }
});

module.exports = router;
