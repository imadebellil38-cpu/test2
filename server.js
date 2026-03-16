// ── Load environment variables FIRST ──
const path_env = require('path');
const _env = require('dotenv').config({ path: path_env.join(__dirname, '.env') });
// dotenvx v17 parses but doesn't always inject — force it
if (_env.parsed) Object.assign(process.env, _env.parsed);

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Init database (creates tables on first run)
require('./db');

const { requireAuth } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Request logger ──
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const color = res.statusCode >= 400 ? '\x1b[31m' : res.statusCode >= 300 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${color}${req.method}\x1b[0m ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ── Security headers ──
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for SPA
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ──
const corsOrigins = process.env.CORS_ORIGINS || '*';
app.use(cors({
  origin: corsOrigins === '*' ? '*' : corsOrigins.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Compression (gzip) ──
app.use(compression());

// ── Body parser ──
app.use(express.json({ limit: '2mb' }));

// ── Global rate limiter (100 req / 15 min per IP) ──
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans quelques minutes.' },
});
app.use('/api/', globalLimiter);

// ── Strict rate limiter for search (10 req / 15 min per IP) ──
const searchLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.SEARCH_RATE_LIMIT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de recherches. Réessayez dans quelques minutes.' },
});

// === Pages (BEFORE static so they take priority) ===
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/pricing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pricing.html')));

// ── Static files (CSS, JS, images) ──
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProd ? '1d' : 0,
  index: false, // Don't serve index.html on / — landing.html handles that
}));

// === Public auth routes (rate-limited on login/register only) ===
app.use('/api', require('./routes/auth'));

// === Protected routes (require JWT) ===
app.use('/api/search', requireAuth, searchLimiter, require('./routes/search'));
app.use('/api/prospects', requireAuth, require('./routes/prospects'));
app.use('/api/pitch', requireAuth, require('./routes/pitch'));
app.use('/api/admin', requireAuth, require('./routes/admin'));
app.use('/api/subscription', requireAuth, require('./routes/subscription'));
app.use('/api/referral', requireAuth, require('./routes/referral'));

// ── 404 handler for API routes ──
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route introuvable.' });
});

// ── Global error handler ──
app.use((err, req, res, next) => {
  console.error('\x1b[31m[ERROR]\x1b[0m', err.stack || err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: isProd ? 'Erreur interne du serveur.' : (err.message || 'Erreur interne.'),
  });
});

// ── Start ──
const http = require('http');
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`\x1b[36m⚡ ProspectHunter SaaS\x1b[0m démarré sur \x1b[4mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`   Mode: ${isProd ? 'production' : 'development'} | Rate limit: ${process.env.RATE_LIMIT_MAX_REQUESTS || 100} req/15min`);
});
server.on('error', (err) => {
  console.error('\x1b[31m[ERROR] Impossible de démarrer le serveur:\x1b[0m', err.message);
  process.exit(1);
});
