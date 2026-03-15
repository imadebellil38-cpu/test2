const { Router } = require('express');
const db = require('../db');

const router = Router();

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

let stripe = null;
if (STRIPE_SECRET) {
  stripe = require('stripe')(STRIPE_SECRET);
} else {
  console.warn('\x1b[33m[WARN] STRIPE_SECRET_KEY not set — payments disabled\x1b[0m');
}

// Packs leads (one-time payments)
const PACKS = {
  starter:    { credits: 500,  price: process.env.STRIPE_PRICE_STARTER    || '', label: 'Starter 500 leads',    eur: 100 },
  prospecteur:{ credits: 1000, price: process.env.STRIPE_PRICE_PROSPECTEUR|| '', label: 'Prospecteur 1000 leads',eur: 190 },
  chasseur:   { credits: 2000, price: process.env.STRIPE_PRICE_CHASSEUR   || '', label: 'Chasseur 2000 leads',   eur: 360 },
  legende:    { credits: 3000, price: process.env.STRIPE_PRICE_LEGENDE    || '', label: 'Légende 3000 leads',    eur: 550 },
};

// POST /api/stripe/checkout — create Stripe Checkout session
router.post('/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Paiement non configuré. Ajoutez STRIPE_SECRET_KEY dans .env' });

  const { pack } = req.body;
  if (!pack || !PACKS[pack]) return res.status(400).json({ error: 'Pack invalide.' });
  if (!PACKS[pack].price) return res.status(400).json({ error: `STRIPE_PRICE_${pack.toUpperCase()} non configuré dans .env` });

  const user = db.prepare('SELECT id, email, stripe_customer_id FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  try {
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: String(user.id) } });
      customerId = customer.id;
      db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment', // one-time
      line_items: [{ price: PACKS[pack].price, quantity: 1 }],
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}/pricing?success=1&pack=${pack}`,
      cancel_url:  `${process.env.APP_URL || 'http://localhost:3000'}/pricing?cancelled=1`,
      metadata: { user_id: String(user.id), pack, credits: String(PACKS[pack].credits) },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[STRIPE] Checkout error:', err.message);
    res.status(500).json({ error: 'Erreur Stripe: ' + err.message });
  }
});

// GET /api/stripe/status
router.get('/status', (req, res) => {
  res.json({
    enabled: !!stripe,
    packs: Object.fromEntries(Object.entries(PACKS).map(([k, v]) => [k, { credits: v.credits, eur: v.eur, configured: !!v.price }]))
  });
});

module.exports = { router, stripe, STRIPE_WEBHOOK_SECRET, PACKS };
