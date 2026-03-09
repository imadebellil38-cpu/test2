const { Router } = require('express');
const validator = require('validator');
const db = require('../db');

const router = Router();

const VALID_STATUSES = ['todo', 'called', 'nope', 'client'];

// GET /api/prospects/searches — search history for current user
router.get('/searches', (req, res) => {
  const searches = db.prepare(
    'SELECT id, niche, country, results_count, search_mode, created_at FROM searches WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json(searches);
});

// GET /api/prospects — get all prospects for current user
router.get('/', (req, res) => {
  const prospects = db.prepare(
    'SELECT * FROM prospects WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json(prospects);
});

// PUT /api/prospects/:id/status — update status
router.put('/:id/status', (req, res) => {
  const { status } = req.body;

  // ── Validate ──
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Statut invalide. Choix: ${VALID_STATUSES.join(', ')}` });
  }

  const prospect = db.prepare('SELECT id FROM prospects WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

  db.prepare('UPDATE prospects SET status = ? WHERE id = ?').run(status, id);
  res.json({ ok: true });
});

// PUT /api/prospects/:id/notes — update notes + rappel + owner_name
router.put('/:id/notes', (req, res) => {
  const { notes, rappel, owner_name } = req.body;

  // ── Validate ──
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });

  const cleanNotes = typeof notes === 'string' ? validator.trim(notes).substring(0, 2000) : '';
  const cleanRappel = typeof rappel === 'string' ? validator.trim(rappel).substring(0, 100) : '';
  const cleanOwner = typeof owner_name === 'string' ? validator.trim(owner_name).substring(0, 200) : '';

  const prospect = db.prepare('SELECT id FROM prospects WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

  db.prepare('UPDATE prospects SET notes = ?, rappel = ?, owner_name = ? WHERE id = ?')
    .run(cleanNotes, cleanRappel, cleanOwner, id);
  res.json({ ok: true });
});

// DELETE /api/prospects/:id — delete a prospect
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });

  const prospect = db.prepare('SELECT id FROM prospects WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' });

  db.prepare('DELETE FROM prospects WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
