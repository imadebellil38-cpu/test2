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

module.exports = router;
