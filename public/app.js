'use strict';

/* ─────────────────────────────────────────
   AUTH
───────────────────────────────────────── */
const token = localStorage.getItem('ph_token');
if (!token) { window.location.href = '/login'; }

const AUTH = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + token,
  'X-Requested-With': 'XMLHttpRequest',
};

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let allProspects   = [];
let currentTab     = 'cold_call';
let currentSubTab  = 'meeting_to_set';
let currentProspect = null;
let pitchType      = 'appel';
let saveTimer      = null;

/* Scan selections (driven by buttons, not dropdowns) */
let scanCountry = 'fr';
let scanMode    = 'site';
let userCredits = 0;

/* ─────────────────────────────────────────
   STAGE CONFIG
───────────────────────────────────────── */
const STAGE_LABEL = {
  cold_call:          '📞 Cold Call',
  to_recall:          '🔄 À Rappeler',
  meeting_to_set:     '🗓️ À poser',
  meeting_confirmed:  '✅ Confirmé',
  closed:             '💰 Closé',
  refused:            '❌ Refusé',
};

const STAGE_CLASS = {
  cold_call:          'stage-cold_call',
  to_recall:          'stage-to_recall',
  meeting_to_set:     'stage-meeting_to_set',
  meeting_confirmed:  'stage-meeting_confirmed',
  closed:             'stage-closed',
  refused:            'stage-refused',
};

const EMPTY_STATE = {
  cold_call: {
    icon: '🏜️',
    msg: 'Désert ici... pas un prospect à l\'horizon',
    hint: '⬆️ Lance la machine là-haut et remplis ce pipeline, champion !',
  },
  to_recall: {
    icon: '📞',
    msg: 'Personne à rappeler pour l\'instant',
    hint: 'Clique "Intéressé" sur un prospect et il débarque ici comme par magie 🪄',
  },
  meeting_to_set: {
    icon: '📅',
    msg: 'Aucun RDV à poser... pour l\'instant',
    hint: 'Les prospects chauds finissent toujours par vouloir te voir 😎',
  },
  meeting_confirmed: {
    icon: '🤝',
    msg: 'Pas encore de RDV confirmé',
    hint: 'Quand un RDV est calé, il atterrit ici. Patience, ça vient !',
  },
  closed: {
    icon: '🏆',
    msg: 'Pas encore de close ? Allez champion !',
    hint: 'C\'est ici que la magie opère — tes deals gagnés arrivent bientôt 💰',
  },
  refused: {
    icon: '💪',
    msg: 'Aucun refus — tu gères ou t\'as pas encore commencé ?',
    hint: 'Les refus c\'est de l\'or : chaque objection améliore tes scripts',
  },
};

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function showToast(msg, type = 'info', duration = 3500) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const icons = { success: '✓', error: '✗', info: 'ℹ', warn: '⚠' };
  const t = document.createElement('div');
  t.className = `toast toast-${type === 'warn' ? 'info' : type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, duration);
}

/* ─────────────────────────────────────────
   API HELPERS
───────────────────────────────────────── */
async function apiGet(url) {
  const r = await fetch(url, { headers: AUTH });
  if (r.status === 401) { logout(); return null; }
  return r.json();
}
async function apiPut(url, body) {
  const r = await fetch(url, { method: 'PUT', headers: AUTH, body: JSON.stringify(body) });
  if (r.status === 401) { logout(); return null; }
  const data = await r.json();
  return r.ok ? data : { ...data, ok: false };
}
async function apiPost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: AUTH, body: JSON.stringify(body) });
  if (r.status === 401) { logout(); return null; }
  return r.json();
}
async function apiDelete(url) {
  const r = await fetch(url, { method: 'DELETE', headers: AUTH });
  if (r.status === 401) { logout(); return null; }
  return r.json();
}

/* ─────────────────────────────────────────
   LOGOUT
───────────────────────────────────────── */
function logout() {
  localStorage.removeItem('ph_token');
  localStorage.removeItem('ph_user');
  window.location.href = '/login';
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
async function init() {
  // Load user info
  try {
    const meData = await apiGet('/api/me');
    if (meData && meData.user) {
      const u = meData.user;
      const emailEl = document.getElementById('user-email-display');
      if (emailEl) emailEl.textContent = u.email;
      userCredits = u.credits || 0;
      updateProspectsSlider();
    }
  } catch (e) {}

  await loadProspects();
}

/* ─────────────────────────────────────────
   LOAD PROSPECTS
───────────────────────────────────────── */
async function loadProspects() {
  showTableSkeleton();
  const data = await apiGet('/api/prospects');
  if (!data) return;

  allProspects = Array.isArray(data) ? data : [];
  // Ensure all have a stage
  allProspects.forEach(p => {
    if (!p.pipeline_stage) p.pipeline_stage = 'cold_call';
  });

  updateBadges();
  renderList();
}

/* ─────────────────────────────────────────
   BADGES
───────────────────────────────────────── */
function updateBadges() {
  const counts = {
    cold_call: 0, to_recall: 0,
    meeting_to_set: 0, meeting_confirmed: 0,
    closed: 0, refused: 0,
  };
  allProspects.forEach(p => {
    if (counts[p.pipeline_stage] !== undefined) counts[p.pipeline_stage]++;
  });

  const active = allProspects.filter(p => p.pipeline_stage !== 'refused' && p.pipeline_stage !== 'closed').length;
  const totalEl = document.getElementById('hstat-total');
  if (totalEl) totalEl.textContent = active;

  document.getElementById('badge-cold_call').textContent = counts.cold_call;
  document.getElementById('badge-to_recall').textContent = counts.to_recall;
  document.getElementById('badge-meeting').textContent   = counts.meeting_to_set + counts.meeting_confirmed;
  document.getElementById('badge-closed').textContent    = counts.closed;
  document.getElementById('badge-refused').textContent   = counts.refused;

  // Sub-tab badges
  const bMts = document.getElementById('badge-meeting_to_set');
  const bMc  = document.getElementById('badge-meeting_confirmed');
  if (bMts) { bMts.textContent = counts.meeting_to_set || ''; bMts.style.display = counts.meeting_to_set ? '' : 'none'; }
  if (bMc)  { bMc.textContent  = counts.meeting_confirmed || ''; bMc.style.display  = counts.meeting_confirmed ? '' : 'none'; }
}

/* ─────────────────────────────────────────
   TAB SWITCHING
───────────────────────────────────────── */
function switchTab(stage) {
  currentTab = stage;
  document.querySelectorAll('.pipe-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.stage === stage);
  });

  const meetingSubtabs = document.getElementById('meeting-subtabs');
  if (meetingSubtabs) {
    meetingSubtabs.style.display = stage === 'meeting' ? 'flex' : 'none';
  }

  renderList();
}

function switchSubTab(sub) {
  currentSubTab = sub;
  document.querySelectorAll('.sub-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.sub === sub);
  });
  renderList();
}

/* ─────────────────────────────────────────
   FILTERS
───────────────────────────────────────── */
function applyFilters() { renderList(); }

function getFilteredProspects() {
  const searchVal = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

  let stages = [];
  if (currentTab === 'meeting') {
    stages = [currentSubTab];
  } else if (currentTab === 'cold_call') {
    stages = ['cold_call'];
  } else if (currentTab === 'to_recall') {
    stages = ['to_recall'];
  } else if (currentTab === 'closed') {
    stages = ['closed'];
  } else if (currentTab === 'refused') {
    stages = ['refused'];
  }

  return allProspects.filter(p => {
    if (!stages.includes(p.pipeline_stage)) return false;
    if (searchVal) {
      const name  = (p.name    || '').toLowerCase();
      const phone = (p.phone   || '').toLowerCase();
      const addr  = (p.address || '').toLowerCase();
      const city  = (p.city    || '').toLowerCase();
      if (!name.includes(searchVal) && !phone.includes(searchVal) && !addr.includes(searchVal) && !city.includes(searchVal)) return false;
    }
    // Signal filter
    if (typeof activeSignalFilter !== 'undefined' && activeSignalFilter !== 'all') {
      switch (activeSignalFilter) {
        case 'nosite': if (p.website_url && p.website_url !== '') return false; break;
        case 'nofb': if (p.has_facebook !== 0 && p.has_facebook !== -1) return false; break;
        case 'noig': if (p.has_instagram !== 0 && p.has_instagram !== -1) return false; break;
        case 'notk': if (p.has_tiktok !== 0 && p.has_tiktok !== -1) return false; break;
        case 'hot': if (calcHeat(p) < 8) return false; break;
        case 'owner': if (!p.owner_name || p.owner_name === '') return false; break;
      }
    }
    return true;
  });
}

/* ─────────────────────────────────────────
   RENDER LIST (desktop + mobile)
───────────────────────────────────────── */
function renderList() {
  const sortMode = document.getElementById('sort-select')?.value || 'heat';
  const prospects = getFilteredProspects().sort((a, b) => {
    if (sortMode === 'recent') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    if (sortMode === 'oldest') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    return calcHeat(b) - calcHeat(a);
  });
  const empty     = document.getElementById('empty-state');
  const tblWrap   = document.getElementById('tbl-wrap');
  const cardsWrap = document.getElementById('cards-wrap');

  if (prospects.length === 0) {
    if (empty) {
      // Determine which empty config to use
      const key = currentTab === 'meeting' ? currentSubTab : currentTab;
      const cfg = EMPTY_STATE[key] || { icon: '🏜️', msg: 'Aucun prospect.', hint: '' };
      const iconEl = document.getElementById('empty-icon');
      const msgEl  = document.getElementById('empty-msg');
      const hintEl = document.getElementById('empty-hint');
      if (iconEl) iconEl.textContent = cfg.icon;
      if (msgEl)  msgEl.textContent  = cfg.msg;
      if (hintEl) hintEl.textContent = cfg.hint;
      empty.style.display = 'block';
    }
    if (tblWrap)   tblWrap.style.display   = 'none';
    if (cardsWrap) cardsWrap.style.display = 'none';
    return;
  }

  if (empty)     empty.style.display     = 'none';
  if (tblWrap)   tblWrap.style.display   = 'block';
  if (cardsWrap) cardsWrap.style.display = 'flex';

  renderTable(prospects);
  renderCards(prospects);
}

/* ─────────────────────────────────────────
   HEAT SCORE
───────────────────────────────────────── */
function calcHeat(p) {
  let score = 0;
  if (!p.website_url || p.website_url === '') score += 3;
  if (p.has_facebook  === 0) score += 3;
  if (p.has_instagram === 0) score += 3;
  if (p.has_tiktok    === 0) score += 3;
  const rev = p.reviews ?? 0;
  if (rev < 10) score += 2;
  if (rev < 5)  score += 1;
  if (p.rating && p.rating < 3.5) score += 1;
  return score;
}

function buildDateChip(p) {
  const now = new Date();
  let dateStr = null, isUrgent = false, label = '';

  if ((p.pipeline_stage === 'meeting_to_set' || p.pipeline_stage === 'meeting_confirmed') && p.meeting_date) {
    const d = new Date(p.meeting_date);
    const hasTime = p.meeting_date.includes(' ');
    if (hasTime && d < now) isUrgent = true;
    dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = hasTime ? ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    label = `📅 RDV ${dateStr}${timeStr}`;
  } else if (p.pipeline_stage === 'to_recall' && p.rappel) {
    const d = new Date(p.rappel);
    const hasTime = p.rappel.includes(' ');
    if (hasTime && d < now) isUrgent = true;
    dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = hasTime ? ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    label = `🔄 Rappel ${dateStr}${timeStr}`;
  }

  if (!label) return '';
  return `<div class="row-date-chip${isUrgent ? ' row-date-urgent' : ''}">${label}</div>`;
}

function buildHeatBadge(p) {
  const score = calcHeat(p);
  if (score >= 6) return `<span class="heat-badge heat-burning" title="Score ${score}/9">🔥🔥 Brûlant</span>`;
  if (score >= 3) return `<span class="heat-badge heat-hot"     title="Score ${score}/9">🔥 Chaud</span>`;
  if (score >= 2) return `<span class="heat-badge heat-warm"    title="Score ${score}/9">🌡️ Tiède</span>`;
  return             `<span class="heat-badge heat-cold"        title="Score ${score}/9">❄️ Froid</span>`;
}

/* ─────────────────────────────────────────
   SIGNAL BADGES
───────────────────────────────────────── */
function buildSignals(p) {
  const badges = [];
  if (!p.website_url || p.website_url === '') {
    badges.push(`<span class="signal-badge sig-nosite">🌐 Sans site</span>`);
  }
  if (p.has_facebook === 0) {
    badges.push(`<span class="signal-badge sig-nofb">f/ Sans FB</span>`);
  }
  if (p.has_instagram === 0) {
    badges.push(`<span class="signal-badge sig-noig">📸 Sans IG</span>`);
  }
  if (p.has_tiktok === 0) {
    badges.push(`<span class="signal-badge sig-notk">♪ Sans TK</span>`);
  }
  return badges.join('');
}

/* ─────────────────────────────────────────
   ACTION BUTTONS — per stage
───────────────────────────────────────── */
function buildMainAction(p) {
  const stage = p.pipeline_stage;
  const id    = p.id;

  if (stage === 'cold_call') {
    return `
      <button class="act-btn act-btn-interested act-btn-primary" onclick="moveStage(${id},'to_recall')">✅ Intéressé</button>
      <button class="act-btn act-btn-refuse" onclick="moveStage(${id},'refused')">❌ Refus</button>
    `;
  }
  if (stage === 'to_recall') {
    return `
      <button class="act-btn act-btn-back" onclick="moveStage(${id},'cold_call')" title="Revenir en Cold Call">◀ Retour</button>
      <button class="act-btn act-btn-meeting act-btn-primary" onclick="moveStage(${id},'meeting_to_set')">📅 Poser RDV</button>
      <button class="act-btn act-btn-refuse" onclick="moveStage(${id},'refused')">❌ Refus</button>
    `;
  }
  if (stage === 'meeting_to_set') {
    return `
      <button class="act-btn act-btn-back" onclick="moveStage(${id},'to_recall')" title="Revenir À Rappeler">◀ Retour</button>
      <button class="act-btn act-btn-confirm act-btn-primary" onclick="moveStage(${id},'meeting_confirmed')">✅ RDV Confirmé</button>
      <button class="act-btn act-btn-refuse" onclick="moveStage(${id},'refused')">❌ Refus</button>
    `;
  }
  if (stage === 'meeting_confirmed') {
    return `
      <button class="act-btn act-btn-back" onclick="moveStage(${id},'meeting_to_set')" title="Revenir RDV à poser">◀ Retour</button>
      <button class="act-btn act-btn-close act-btn-primary" onclick="moveStage(${id},'closed')">💰 Closé !</button>
      <button class="act-btn act-btn-refuse" onclick="moveStage(${id},'refused')">❌ Refus</button>
    `;
  }
  if (stage === 'closed' || stage === 'refused') {
    return `
      <button class="act-btn act-btn-restore" onclick="moveStage(${id},'cold_call')">↩️ Réactiver</button>
      ${stage === 'refused' ? `<button class="act-btn act-btn-delete" onclick="deleteProspect(${id})" title="Supprimer">🗑</button>` : ''}
    `;
  }
  return '';
}

/* ─────────────────────────────────────────
   RENDER TABLE (desktop)
───────────────────────────────────────── */
function renderTable(prospects) {
  const tbody = document.getElementById('prospects-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  prospects.forEach(p => {
    const tr = document.createElement('tr');
    tr.dataset.stage = p.pipeline_stage;

    const signals = buildSignals(p);
    const actions = buildMainAction(p);

    const phoneDisplay = p.phone || '—';
    const phoneCopy = p.phone
      ? `<button class="btn-copy-phone" onclick="copyPhone('${escAttr(p.phone)}', event)" title="Copier">📋</button>`
      : '';

    const callLink = p.phone
      ? `<a class="btn-call-big" href="tel:${escAttr(p.phone)}">📞 Appeler</a>`
      : `<span class="btn-call-big btn-call-disabled">Pas de tél.</span>`;

    const dateChip = buildDateChip(p);
    const objBadge = (p.pipeline_stage === 'refused' && p.objection)
      ? `<span class="refused-obj-badge">❌ ${esc(p.objection)}</span>` : '';
    const notesBtn = p.notes
      ? `<button class="notes-peek-btn" onclick="toggleNotesPreview(${p.id}, this)" title="Voir les notes">📝 Notes</button>
         <div class="notes-preview" id="notes-preview-${p.id}" style="display:none">${esc(p.notes)}</div>`
      : '';
    tr.innerHTML = `
      <td>
        <div class="prospect-name" onclick="openDetail(${p.id})">${esc(p.name || '—')}</div>
        ${p.address ? `<div class="prospect-addr">${esc(p.address)}</div>` : ''}
        ${dateChip}
        ${objBadge}
        ${notesBtn}
      </td>
      <td>
        <div class="phone-cell">
          ${p.phone
            ? `<a class="phone-call-link" href="tel:${escAttr(p.phone)}" title="Appuyer pour appeler"><span>📞 ${esc(p.phone)}</span></a>`
            : `<span class="phone-text">—</span>`
          }
          ${phoneCopy}
        </div>
      </td>
      <td>
        <div class="signals-cell">
          ${buildHeatBadge(p)}
          ${signals}
        </div>
      </td>
      <td><div class="actions-cell">${actions}</div></td>
      <td>
        <div class="actions-cell row-quick-actions">
          ${callLink}
          <button class="btn-fiche" onclick="openDetail(${p.id})" title="Voir la fiche complète">📋 Fiche</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ─────────────────────────────────────────
   RENDER CARDS (mobile)
───────────────────────────────────────── */
function renderCards(prospects) {
  const wrap = document.getElementById('cards-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  prospects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'prospect-card';
    card.dataset.stage = p.pipeline_stage;

    const signals = buildSignals(p);
    const actions = buildMainAction(p);

    const callBtn = p.phone
      ? `<a class="card-call-btn" href="tel:${escAttr(p.phone)}">📞 Appeler</a>`
      : '';

    const cityLine = [p.city, p.niche].filter(Boolean).join(' · ') || p.address || '';

    card.innerHTML = `
      <div class="card-top">
        <div class="card-name-wrap">
          <div class="card-name" onclick="openDetail(${p.id})">${esc(p.name || '—')}</div>
          ${cityLine ? `<div class="card-sub">${esc(cityLine)}</div>` : ''}
        </div>
        ${callBtn}
      </div>
      <div class="card-signals">${buildHeatBadge(p)}${signals ? ' ' + signals : ''}${buildDateChip(p)}${(p.pipeline_stage === 'refused' && p.objection) ? `<span class="refused-obj-badge">❌ ${esc(p.objection)}</span>` : ''}</div>
      ${p.notes ? `<div class="card-notes-row"><button class="notes-peek-btn" onclick="toggleNotesPreview('c${p.id}', this)">📝 Notes</button><div class="notes-preview" id="notes-preview-c${p.id}" style="display:none">${esc(p.notes)}</div></div>` : ''}
      <div class="card-actions">${actions}</div>
    `;
    wrap.appendChild(card);
  });
}

/* ─────────────────────────────────────────
   MOVE STAGE (optimistic)
───────────────────────────────────────── */
/* ─────────────────────────────────────────
   OBJECTION MODAL
───────────────────────────────────────── */
let _objectionTargetId = null;
let _objectionValue    = '';
let _stageTargetId     = null;
let _stageTargetStage  = null;

let _dealTargetId = null;
let _dealType = ''; let _dealRec = '';

function moveStage(id, stage) {
  if (stage === 'refused') {
    _objectionTargetId = id;
    _objectionValue    = '';
    document.querySelectorAll('.obj-chip').forEach(c => c.classList.remove('obj-chip-selected'));
    document.getElementById('objection-input').value = '';
    document.getElementById('objection-overlay').style.display = 'flex';
    return;
  }
  if (stage === 'closed') {
    _dealTargetId = id; _dealType = ''; _dealRec = '';
    document.querySelectorAll('.deal-chip').forEach(c => c.classList.remove('deal-chip-selected'));
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('deal-date-input').value = today;
    document.getElementById('deal-modal-overlay').style.display = 'flex';
    return;
  }
  if (stage === 'to_recall' || stage === 'meeting_to_set' || stage === 'meeting_confirmed') {
    _stageTargetId    = id;
    _stageTargetStage = stage;
    const isRecall = stage === 'to_recall';
    document.getElementById('stage-modal-title').textContent       = isRecall ? '🔄 À Rappeler — date & heure' : '📅 Rendez-vous — date & heure';
    document.getElementById('stage-modal-confirm-btn').textContent = isRecall ? 'Enregistrer le rappel' : 'Confirmer le RDV';
    document.getElementById('stage-time-optional').style.display   = isRecall ? '' : 'none';
    document.getElementById('stage-date-input').value  = '';
    document.getElementById('stage-time-input').value  = '';
    document.getElementById('stage-notes-input').value = '';
    document.querySelectorAll('.date-shortcut').forEach(b => b.classList.remove('date-shortcut-active'));
    document.getElementById('stage-modal-overlay').style.display = 'flex';
    return;
  }
  _doMoveStage(id, stage, null, null, null, null);
}

function setDateShortcut(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  document.getElementById('stage-date-input').value = `${yyyy}-${mm}-${dd}`;
  document.querySelectorAll('.date-shortcut').forEach(b => b.classList.remove('date-shortcut-active'));
  event.target.classList.add('date-shortcut-active');
}

function closeStageModal() {
  document.getElementById('stage-modal-overlay').style.display = 'none';
  _stageTargetId = null; _stageTargetStage = null;
}

function confirmStageModal() {
  if (!_stageTargetId) return;
  // Capture before closeStageModal() nulls them
  const id       = _stageTargetId;
  const stage    = _stageTargetStage;
  const date     = document.getElementById('stage-date-input').value;
  const time     = document.getElementById('stage-time-input').value;
  const notes    = document.getElementById('stage-notes-input').value.trim();
  const isRecall = stage === 'to_recall';
  const datetime = date ? (time ? `${date} ${time}` : date) : null;
  closeStageModal();
  if (isRecall) {
    _doMoveStage(id, 'to_recall', null, datetime, null, notes || null);
  } else {
    _doMoveStage(id, stage, null, null, datetime, notes || null);
  }
}

function selectObjChip(btn) {
  document.querySelectorAll('.obj-chip').forEach(c => c.classList.remove('obj-chip-selected'));
  btn.classList.add('obj-chip-selected');
  document.getElementById('objection-input').value = '';
  _objectionValue = btn.textContent;
}

function onObjInput(input) {
  document.querySelectorAll('.obj-chip').forEach(c => c.classList.remove('obj-chip-selected'));
  _objectionValue = input.value.trim();
}

function closeObjectionModal() {
  document.getElementById('objection-overlay').style.display = 'none';
  _objectionTargetId = null;
}

function confirmObjection() {
  if (!_objectionTargetId) return;
  const id  = _objectionTargetId; // capture AVANT close qui null l'id
  const obj = _objectionValue || document.getElementById('objection-input').value.trim() || 'Non précisé';
  closeObjectionModal();
  _doMoveStage(id, 'refused', obj, null, null, null);
}

async function _doMoveStage(id, stage, objection, rappel, meeting_date, notes, deal_type, deal_date, deal_recurrence) {
  const prospect = allProspects.find(p => p.id === id);
  if (!prospect) return;

  const oldStage = prospect.pipeline_stage;
  prospect.pipeline_stage = stage;
  if (objection)       prospect.objection       = objection;
  if (rappel)          prospect.rappel          = rappel;
  if (meeting_date)    prospect.meeting_date    = meeting_date;
  if (notes)           prospect.notes           = notes;
  if (deal_type)       prospect.deal_type       = deal_type;
  if (deal_date)       prospect.deal_date       = deal_date;
  if (deal_recurrence) prospect.deal_recurrence = deal_recurrence;
  updateBadges();
  renderList();

  const body = { stage };
  if (objection)       body.objection       = objection;
  if (rappel)          body.rappel          = rappel;
  if (meeting_date)    body.meeting_date    = meeting_date;
  if (notes)           body.notes           = notes;
  if (deal_type)       body.deal_type       = deal_type;
  if (deal_date)       body.deal_date       = deal_date;
  if (deal_recurrence) body.deal_recurrence = deal_recurrence;
  const res = await apiPut(`/api/prospects/${id}/stage`, body);
  if (!res || !res.ok) {
    prospect.pipeline_stage = oldStage;
    updateBadges();
    renderList();
    showToast((res && res.error) || 'Erreur lors du déplacement.', 'error');
    return;
  }

  const stageMessages = {
    to_recall:          '🔄 Hop, dans la file d\'attente — tu le rappelles quand ?',
    meeting_to_set:     '📅 Ça chauffe ! Pose ce RDV et ferme le deal 🔥',
    meeting_confirmed:  '✅ RDV calé ! Plus qu\'à closer maintenant 💪',
    closed:             '🎉 BOOM ! CLOSÉ ! Un de plus dans la poche ! 🏆💰',
    refused:            `💔 Refus noté${objection ? ' — "' + objection + '"' : ''}. C'est de l'or pour tes scripts !`,
    cold_call:          '↩️ Retour en Cold Call — on remet ça !',
  };
  const isSuccess = stage === 'closed';
  showToast(stageMessages[stage] || 'Étape mise à jour.', isSuccess ? 'success' : 'info');

  if (stage === 'closed') launchConfetti();
}

/* ── DEAL MODAL ── */
function selectDealChip(group, btn, val) {
  const selector = group === 'type' ? '#deal-type-chips .deal-chip' : '#deal-rec-chips .deal-chip';
  document.querySelectorAll(selector).forEach(c => c.classList.remove('deal-chip-selected'));
  btn.classList.add('deal-chip-selected');
  if (group === 'type') _dealType = val; else _dealRec = val;
}
function closeDealModal() {
  document.getElementById('deal-modal-overlay').style.display = 'none';
  _dealTargetId = null;
}
function confirmDeal() {
  if (!_dealTargetId) return;
  const id       = _dealTargetId;
  const dealDate = document.getElementById('deal-date-input').value;
  closeDealModal();
  _doMoveStage(id, 'closed', null, null, null, null, _dealType || null, dealDate || null, _dealRec || null);
}

/* ── CALL ATTEMPTS ── */
let _attemptType = ''; let _attemptResult = '';

function selectAttemptChip(group, btn) {
  const cls = group === 'type' ? '.attempt-type-chip' : '.attempt-result-chip';
  document.querySelectorAll(cls).forEach(c => c.classList.remove('chip-selected'));
  btn.classList.add('chip-selected');
  if (group === 'type') _attemptType = btn.dataset.val;
  else _attemptResult = btn.dataset.val;
}

async function logAttempt() {
  if (!currentProspect) return;
  if (!_attemptType)   return showToast('Choisis un type de contact', 'error');
  if (!_attemptResult) return showToast('Choisis un résultat', 'error');
  const note = document.getElementById('attempt-note').value.trim();
  const res = await apiPost(`/api/prospects/${currentProspect.id}/attempts`, {
    attempt_type: _attemptType, result: _attemptResult, note
  });
  if (!res || res.error) return showToast(res?.error || 'Erreur', 'error');
  document.getElementById('attempt-note').value = '';
  _attemptType = ''; _attemptResult = '';
  document.querySelectorAll('.attempt-type-chip,.attempt-result-chip').forEach(c => c.classList.remove('chip-selected'));
  showToast('📝 Contact loggué — ton futur toi te remerciera !', 'success');
  loadAttempts(currentProspect.id);
}

async function loadAttempts(prospectId) {
  const attempts = await apiGet(`/api/prospects/${prospectId}/attempts`);
  const el = document.getElementById('attempt-list');
  if (!el) return;
  const TYPE_ICON   = { call:'📞', sms:'💬', email:'📧', dm:'📱' };
  const RESULT_LABEL = { no_answer:'Pas répondu', voicemail:'Messagerie', callback:'Rappel demandé', positive:'Positif ✅', negative:'Négatif ❌' };
  if (!attempts || !attempts.length) {
    el.innerHTML = '<div class="activity-empty">Aucun contact loggué.</div>'; return;
  }
  el.innerHTML = attempts.map(a => {
    const d = new Date(a.created_at);
    const when = d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    return `<div class="attempt-row">
      <span class="attempt-icon">${TYPE_ICON[a.attempt_type] || '📞'}</span>
      <span class="attempt-info"><strong>${RESULT_LABEL[a.result] || a.result}</strong>${a.note ? ` — <em>${esc(a.note)}</em>` : ''}</span>
      <span class="attempt-date">${when}</span>
    </div>`;
  }).join('');
}

function toggleNotesPreview(id, btn) {
  const el = document.getElementById(`notes-preview-${id}`);
  if (!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? '' : 'none';
  btn.textContent = open ? '📝 Masquer' : '📝 Notes';
}

/* ─────────────────────────────────────────
   DELETE PROSPECT
───────────────────────────────────────── */
async function deleteProspect(id) {
  if (!confirm('Supprimer ce prospect définitivement ?')) return;
  const res = await apiDelete(`/api/prospects/${id}`);
  if (res && res.ok) {
    allProspects = allProspects.filter(p => p.id !== id);
    updateBadges();
    renderList();
    showToast('🗑️ Prospect supprimé — RIP 🪦', 'info');
  } else {
    showToast('Erreur lors de la suppression.', 'error');
  }
}

/* ─────────────────────────────────────────
   COPY PHONE
───────────────────────────────────────── */
function copyPhone(phone, event) {
  if (event) event.stopPropagation();
  navigator.clipboard.writeText(phone).then(() => {
    showToast(`📋 ${phone} copié — va closer ça ! 💪`, 'success', 2000);
  }).catch(() => {
    showToast('Impossible de copier.', 'error');
  });
}

/* ─────────────────────────────────────────
   DETAIL MODAL
───────────────────────────────────────── */
function openDetail(id) {
  const p = allProspects.find(x => x.id === id);
  if (!p) return;
  currentProspect = p;

  document.getElementById('detail-name').textContent = p.name || '—';
  document.getElementById('detail-meta').textContent =
    [p.city, p.niche].filter(Boolean).join(' · ') || p.address || '';

  buildDetailInfo(p);

  const notesEl  = document.getElementById('m-notes');
  const rappelEl = document.getElementById('m-rappel');
  const ownerEl  = document.getElementById('m-owner');
  if (notesEl)  notesEl.value  = p.notes      || '';
  if (rappelEl) rappelEl.value = p.rappel      || '';
  if (ownerEl)  ownerEl.value  = p.owner_name || '';

  const savedEl = document.getElementById('crm-saved');
  if (savedEl) savedEl.style.display = 'none';

  switchModalTab('info');
  loadAttempts(p.id); // charge l'historique des contacts

  const overlay = document.getElementById('detail-overlay');
  if (overlay) overlay.classList.add('open');
}

function closeDetailModal() {
  const overlay = document.getElementById('detail-overlay');
  if (overlay) overlay.classList.remove('open');
  currentProspect = null;
}

function buildDetailInfo(p) {
  const c = document.getElementById('detail-info-content');
  if (!c) return;

  const signals    = buildSignals(p);
  const stageBadge = `<span class="stage-badge ${STAGE_CLASS[p.pipeline_stage]}">${STAGE_LABEL[p.pipeline_stage] || p.pipeline_stage}</span>`;

  let html = `
    <div class="detail-grid" style="margin-bottom:1rem;">
      <div class="detail-item">
        <div class="detail-label">Téléphone</div>
        <div class="detail-value">
          ${p.phone
            ? `<div class="phone-cell"><span>${esc(p.phone)}</span><button class="btn-copy-phone" onclick="copyPhone('${escAttr(p.phone)}', event)">📋</button></div>`
            : '—'}
        </div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Adresse</div>
        <div class="detail-value">${esc(p.address || '—')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Note Google</div>
        <div class="detail-value">${p.rating ? `⭐ ${p.rating} (${p.reviews || 0} avis)` : '—'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Niche</div>
        <div class="detail-value">${esc(p.niche || '—')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Étape pipeline</div>
        <div class="detail-value">${stageBadge}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Ajouté le</div>
        <div class="detail-value">${p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : '—'}</div>
      </div>
    </div>
  `;

  if (signals) {
    html += `
      <div style="margin-bottom:1rem;">
        <div class="detail-label" style="margin-bottom:.5rem;">Signaux</div>
        <div style="display:flex;gap:.3rem;flex-wrap:wrap;">${signals}</div>
      </div>
    `;
  }

  if (p.website_url) {
    html += `
      <div class="detail-item" style="margin-bottom:.75rem;">
        <div class="detail-label">Site web</div>
        <div class="detail-value">
          <a href="${escAttr(p.website_url)}" target="_blank" rel="noopener" style="color:var(--stage-cold)">${esc(p.website_url)}</a>
        </div>
      </div>
    `;
  }

  c.innerHTML = html;
}

/* ─────────────────────────────────────────
   MODAL TAB SWITCHING
───────────────────────────────────────── */
function switchModalTab(tab) {
  document.querySelectorAll('.mtab').forEach(t => t.classList.toggle('active', t.dataset.mtab === tab));
  document.querySelectorAll('.mtab-panel').forEach(p => p.classList.toggle('active', p.dataset.mtab === tab));
}

/* ─────────────────────────────────────────
   PITCH TYPE
───────────────────────────────────────── */
function setPitchType(type) {
  pitchType = type;
  document.querySelectorAll('.pitch-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
}

/* ─────────────────────────────────────────
   GENERATE PITCH
───────────────────────────────────────── */
async function generatePitch() {
  if (!currentProspect) return;

  const p     = currentProspect;
  const stage = p.pipeline_stage;

  const stageContext = {
    cold_call:         'pitch de prospection téléphonique à froid',
    to_recall:         'pitch de rappel pour fixer un rendez-vous',
    meeting_to_set:    'pitch pour confirmer le rendez-vous',
    meeting_confirmed: 'pitch de vente pour closer',
    closed:            'pitch de fidélisation client',
    refused:           'pitch de relance après refus',
  };

  const btn  = document.getElementById('btn-gen-pitch');
  const zone = document.getElementById('pitch-zone');
  if (btn)  { btn.disabled = true; btn.textContent = '✨ Génération...'; }
  if (zone) zone.innerHTML = `<div class="pitch-result" style="color:var(--muted)">Génération en cours...</div>`;

  try {
    const res = await fetch('/api/pitch', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({
        prospect: {
          name:        p.name,
          phone:       p.phone,
          address:     p.address,
          city:        p.city,
          niche:       p.niche,
          rating:      p.rating,
          reviews:     p.reviews,
          search_mode: p.search_mode,
          owner_name:  p.owner_name,
        },
        niche:     p.niche || p.city || '',
        pitchType: pitchType,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (zone) zone.innerHTML = `<div class="pitch-result" style="color:var(--red-tx)">${esc(err.error || 'Erreur lors de la génération.')}</div>`;
      return;
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text || data.pitch || data.text || '';
    if (zone) {
      zone.innerHTML = `
        <div class="pitch-result">${esc(text)}</div>
        <button class="btn-copy-pitch" onclick="copyPitch(this)">📋 Copier le pitch</button>
      `;
    }
  } catch (e) {
    if (zone) zone.innerHTML = `<div class="pitch-result" style="color:var(--red-tx)">Erreur réseau.</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Générer le pitch'; }
  }
}

function copyPitch(btn) {
  const pitchEl = btn.previousElementSibling;
  if (!pitchEl) return;
  navigator.clipboard.writeText(pitchEl.textContent.trim()).then(() => {
    showToast('📋 Pitch copié — envoie la sauce ! 🔥', 'success', 2000);
    btn.textContent = '✓ Copié !';
    setTimeout(() => { btn.textContent = '📋 Copier le pitch'; }, 2000);
  });
}

/* ─────────────────────────────────────────
   CRM SAVE (debounced)
───────────────────────────────────────── */
function debounceSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCRM, 1000);
}

async function saveCRM() {
  if (!currentProspect) return;
  const notes      = document.getElementById('m-notes')?.value  || '';
  const rappel     = document.getElementById('m-rappel')?.value || '';
  const owner_name = document.getElementById('m-owner')?.value  || '';

  const res = await apiPut(`/api/prospects/${currentProspect.id}/notes`, { notes, rappel, owner_name });
  if (res && res.ok) {
    currentProspect.notes      = notes;
    currentProspect.rappel     = rappel;
    currentProspect.owner_name = owner_name;
    const savedEl = document.getElementById('crm-saved');
    if (savedEl) {
      savedEl.style.display = 'block';
      setTimeout(() => { savedEl.style.display = 'none'; }, 2000);
    }
  }
}

/* ─────────────────────────────────────────
   ADD PROSPECT MODAL
───────────────────────────────────────── */
function openAddModal() {
  const overlay = document.getElementById('add-overlay');
  if (overlay) overlay.classList.add('open');
  const nameEl = document.getElementById('add-name');
  if (nameEl) { nameEl.value = ''; nameEl.focus(); }
  ['add-phone', 'add-address', 'add-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const errEl = document.getElementById('add-error');
  if (errEl) errEl.style.display = 'none';
}

function closeAddModal() {
  const overlay = document.getElementById('add-overlay');
  if (overlay) overlay.classList.remove('open');
}

async function submitAddProspect() {
  const name    = document.getElementById('add-name')?.value.trim()    || '';
  const phone   = document.getElementById('add-phone')?.value.trim()   || '';
  const address = document.getElementById('add-address')?.value.trim() || '';
  const notes   = document.getElementById('add-notes')?.value.trim()   || '';

  const errEl = document.getElementById('add-error');
  if (!name) {
    if (errEl) { errEl.textContent = 'Le nom est requis.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';

  const btn = document.getElementById('btn-add-submit');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/prospects/manual', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ name, phone, address, notes }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (errEl) { errEl.textContent = data.error || 'Erreur.'; errEl.style.display = 'block'; }
      return;
    }
    allProspects.unshift(data);
    updateBadges();
    closeAddModal();
    switchTab('cold_call');
    showToast(`🎯 ${name} ajouté — un de plus dans le viseur ! 🔫`, 'success');
  } catch (e) {
    if (errEl) { errEl.textContent = 'Erreur réseau.'; errEl.style.display = 'block'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ─────────────────────────────────────────
   NICHE PICKER
───────────────────────────────────────── */
const NICHES = {
  batiment: [
    { icon: '🔧', label: 'Plombier' },
    { icon: '⚡', label: 'Électricien' },
    { icon: '🪟', label: 'Menuisier' },
    { icon: '🎨', label: 'Peintre' },
    { icon: '🧱', label: 'Maçon' },
    { icon: '🔑', label: 'Serrurier' },
    { icon: '🔥', label: 'Chauffagiste' },
    { icon: '❄️', label: 'Climaticien' },
    { icon: '🏠', label: 'Toiturier' },
    { icon: '🌿', label: 'Jardinier' },
    { icon: '🏊', label: 'Pisciniste' },
    { icon: '🪵', label: 'Carreleur' },
  ],
  restaurant: [
    { icon: '🍕', label: 'Pizzeria' },
    { icon: '🥖', label: 'Boulangerie' },
    { icon: '🥩', label: 'Boucherie' },
    { icon: '🍰', label: 'Pâtisserie' },
    { icon: '🍽️', label: 'Restaurant' },
    { icon: '☕', label: 'Café / Bar' },
    { icon: '🛒', label: 'Épicerie' },
    { icon: '🎂', label: 'Traiteur' },
  ],
  sante: [
    { icon: '🦷', label: 'Dentiste' },
    { icon: '🩺', label: 'Médecin' },
    { icon: '💊', label: 'Pharmacie' },
    { icon: '🐾', label: 'Vétérinaire' },
    { icon: '👁️', label: 'Opticien' },
    { icon: '🤸', label: 'Kiné' },
    { icon: '🧘', label: 'Ostéopathe' },
    { icon: '💉', label: 'Infirmier' },
    { icon: '🧠', label: 'Psychologue' },
    { icon: '🦶', label: 'Podologue' },
  ],
  beaute: [
    { icon: '✂️', label: 'Coiffeur' },
    { icon: '💈', label: 'Barbier' },
    { icon: '💅', label: 'Onglerie' },
    { icon: '🌸', label: 'Institut beauté' },
    { icon: '🖋️', label: 'Tatoueur' },
    { icon: '✨', label: 'Esthétique' },
    { icon: '💆', label: 'Spa / Massage' },
  ],
  auto: [
    { icon: '🔩', label: 'Garage auto' },
    { icon: '🚗', label: 'Carrosserie' },
    { icon: '🔍', label: 'Contrôle technique' },
    { icon: '🛞', label: 'Pneumatiques' },
    { icon: '🚐', label: 'Déménageur' },
  ],
  services: [
    { icon: '🧹', label: 'Nettoyage' },
    { icon: '👔', label: 'Pressing' },
    { icon: '🏡', label: 'Agence immo' },
    { icon: '📊', label: 'Comptable' },
    { icon: '⚖️', label: 'Avocat' },
    { icon: '📸', label: 'Photographe' },
    { icon: '🏋️', label: 'Salle de sport' },
    { icon: '🚘', label: 'Auto-école' },
    { icon: '💐', label: 'Fleuriste' },
    { icon: '📱', label: 'Agence comm.' },
  ],
};

function renderNicheChips(cat) {
  const container = document.getElementById('niche-chips');
  container.innerHTML = '';
  (NICHES[cat] || []).forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'niche-chip';
    btn.innerHTML = `<span class="niche-chip-icon">${n.icon}</span><span>${n.label}</span>`;
    btn.onclick = () => {
      document.getElementById('scan-niche').value = n.label;
      document.querySelectorAll('.niche-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const disp = document.getElementById('niche-selected-display');
      if (disp) {
        disp.innerHTML = `✅ Sélectionné : <strong>${n.icon} ${n.label}</strong> — clique sur <b>⚡ Lancer</b> pour démarrer`;
        disp.style.display = '';
      }
    };
    container.appendChild(btn);
  });
}

function switchNicheCat(btn) {
  document.querySelectorAll('.niche-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderNicheChips(btn.dataset.cat);
}

// Init chips on load
document.addEventListener('DOMContentLoaded', () => {
  renderNicheChips('batiment');
});

/* ─────────────────────────────────────────
   SCAN — country / mode selectors
───────────────────────────────────────── */
function selectCountry(btn) {
  scanCountry = btn.dataset.country;
  document.querySelectorAll('.flag-btn').forEach(b => b.classList.toggle('active', b === btn));
}

function selectMode(btn) {
  scanMode = btn.dataset.mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
}

function updateProspectsSlider() {
  const slider = document.getElementById('prospects-slider');
  if (!slider) return;
  const multiplier = scanMode === 'both' ? 2 : 1;
  const maxAllowed = Math.min(100, Math.max(1, Math.floor((userCredits || 100) / multiplier)));
  slider.max = maxAllowed;
  if (parseInt(slider.value) > maxAllowed) slider.value = maxAllowed;
  const val = parseInt(slider.value);
  const cost = val * multiplier;
  const el = document.getElementById('prospects-count');
  const costEl = document.getElementById('credits-cost');
  const maxEl = document.getElementById('prospects-max-label');
  if (el) el.textContent = val;
  if (costEl) costEl.textContent = cost;
  if (maxEl) maxEl.textContent = maxAllowed + ' max';
}

function toggleScanPanel() {
  const body = document.getElementById('scan-body');
  const toggleBtn = document.getElementById('scan-toggle-btn');
  if (!body) return;
  const isCollapsed = body.style.display === 'none';
  body.style.display = isCollapsed ? '' : 'none';
  if (toggleBtn) {
    toggleBtn.classList.toggle('collapsed', !isCollapsed);
    toggleBtn.title = isCollapsed ? 'Réduire' : 'Agrandir';
  }
}

/* ─────────────────────────────────────────
   LAUNCH SCAN
───────────────────────────────────────── */
async function launchScan() {
  const niche = document.getElementById('scan-niche').value.trim();

  if (!niche) {
    document.getElementById('scan-niche').focus();
    showToast('🤔 Euh... tu veux chercher quoi exactement ? Tape un métier !', 'warn');
    return;
  }

  const btn        = document.getElementById('btn-scan');
  const statusWrap = document.getElementById('scan-status');
  const statusText = document.getElementById('scan-status-text');
  const fillBar    = document.getElementById('scan-progress-fill');

  if (btn)        btn.disabled = true;
  if (statusWrap) statusWrap.style.display = 'flex';
  if (statusText) statusText.textContent   = '🔍 La machine tourne... on déniche les pépites...';

  // Animated progress bar (indeterminate feel)
  let progress = 0;
  const progressTimer = setInterval(() => {
    progress = Math.min(progress + Math.random() * 12, 85);
    if (fillBar) fillBar.style.width = progress + '%';
  }, 400);

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ niche, country: scanCountry, mode: scanMode, numProspects: parseInt(document.getElementById('prospects-slider')?.value || 10) }),
    });
    const data = await res.json();

    clearInterval(progressTimer);
    if (fillBar) fillBar.style.width = '100%';

    if (!res.ok) {
      showToast(data.error || 'Erreur lors du scan', 'error');
      return;
    }

    const count = data.count || (data.prospects && data.prospects.length) || 0;
    if (statusText) statusText.textContent = `🎯 ${count} pépites trouvées !`;
    showToast(`🎯 ${count} prospects frais dans le pipeline — à toi de jouer ! 🚀`, 'success', 4000);

    await loadProspects();
    switchTab('cold_call');

  } catch (e) {
    clearInterval(progressTimer);
    showToast('😵 Erreur de connexion — Internet est en pause café ?', 'error');
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(() => {
      if (statusWrap) statusWrap.style.display = 'none';
      if (fillBar)    fillBar.style.width = '0%';
    }, 3500);
  }
}

/* ─────────────────────────────────────────
   SKELETON LOADER
───────────────────────────────────────── */
function showTableSkeleton() {
  const tbody   = document.getElementById('prospects-tbody');
  const tblWrap = document.getElementById('tbl-wrap');
  const empty   = document.getElementById('empty-state');
  const cardsWrap = document.getElementById('cards-wrap');

  if (tbody) {
    tbody.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const tr = document.createElement('tr');
      tr.className = 'skeleton-row';
      tr.innerHTML = `<td colspan="5"><div style="display:grid;grid-template-columns:2fr 1fr 1fr 2fr .5fr;gap:.5rem;"><div class="skeleton-cell"></div><div class="skeleton-cell"></div><div class="skeleton-cell"></div><div class="skeleton-cell"></div><div class="skeleton-cell"></div></div></td>`;
      tbody.appendChild(tr);
    }
  }
  if (tblWrap)   tblWrap.style.display   = 'block';
  if (empty)     empty.style.display     = 'none';
  if (cardsWrap) cardsWrap.style.display = 'none';
}

/* ─────────────────────────────────────────
   CONFETTI
───────────────────────────────────────── */
function launchConfetti() {
  const colors = ['#3b82f6', '#a855f7', '#14b8a6', '#22c55e', '#f97316', '#f43f5e', '#fff'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;z-index:99999;
      width:${5+Math.random()*7}px;height:${5+Math.random()*7}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      border-radius:${Math.random()>.5?'50%':'2px'};
      left:${20+Math.random()*60}%;top:-10px;
      pointer-events:none;opacity:1;
      animation:confettiFall ${1.4+Math.random()*2}s cubic-bezier(.22,1,.36,1) forwards;
      animation-delay:${Math.random()*.4}s;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

const confettiStyle = document.createElement('style');
confettiStyle.textContent = `
  @keyframes confettiFall {
    0%   { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg) scale(.3); opacity: 0; }
  }
`;
document.head.appendChild(confettiStyle);

/* ─────────────────────────────────────────
   ESCAPE HELPERS
───────────────────────────────────────── */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ─────────────────────────────────────────
   KEYBOARD SHORTCUTS
───────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeDetailModal();
    closeAddModal();
  }
});

/* ─────────────────────────────────────────
   VIEW SWITCHER (Pipeline | Rappels | Analyse)
───────────────────────────────────────── */
function switchView(view) {
  ['pipeline', 'rappels', 'analyse'].forEach(v => {
    document.getElementById('view-' + v).style.display = v === view ? '' : 'none';
  });
  document.querySelectorAll('.app-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  if (view === 'rappels') loadRappels();
  if (view === 'analyse') loadAnalyse();
}

/* ─────────────────────────────────────────
   RAPPELS
───────────────────────────────────────── */
async function loadRappels() {
  const prospects = await apiGet('/api/prospects');
  if (!prospects) return;

  const now     = new Date();
  const today   = new Date(); today.setHours(23,59,59,999);
  const endWeek = new Date(); endWeek.setDate(endWeek.getDate() + 7); endWeek.setHours(23,59,59,999);

  // Build unified agenda items from rappels + meetings
  const items = [];
  prospects.forEach(p => {
    if (p.pipeline_stage === 'to_recall' && p.rappel) {
      items.push({ ...p, _agendaDate: p.rappel, _agendaType: 'recall' });
    }
    if ((p.pipeline_stage === 'meeting_to_set' || p.pipeline_stage === 'meeting_confirmed') && p.meeting_date) {
      items.push({ ...p, _agendaDate: p.meeting_date, _agendaType: 'meeting' });
    }
  });

  // Sort chronologically
  items.sort((a, b) => new Date(a._agendaDate) - new Date(b._agendaDate));

  const overdueList = items.filter(p => new Date(p._agendaDate) <= today);
  const weekList    = items.filter(p => { const d = new Date(p._agendaDate); return d > today && d <= endWeek; });
  const laterList   = items.filter(p => new Date(p._agendaDate) > endWeek);

  renderAgendaList('agenda-overdue-list', overdueList, now);
  renderAgendaList('agenda-week-list',    weekList,    now);
  renderAgendaList('agenda-later-list',   laterList,   now);

  document.getElementById('agenda-overdue-section').style.display = overdueList.length ? '' : 'none';
  document.getElementById('agenda-week-section').style.display    = weekList.length    ? '' : 'none';
  document.getElementById('agenda-later-section').style.display   = laterList.length   ? '' : 'none';
  document.getElementById('rappel-empty').style.display           = items.length === 0 ? '' : 'none';

  // Nav dot
  const dot = document.getElementById('nav-notif-dot');
  if (dot) dot.style.display = overdueList.length > 0 ? '' : 'none';

  // Browser notification
  if (overdueList.length > 0 && Notification.permission === 'granted') {
    new Notification('🔔 ProspectHunter', {
      body: `${overdueList.length} rappel(s)/RDV prévu(s) aujourd'hui !`,
      icon: '/favicon.ico'
    });
  }
}

function renderAgendaList(containerId, items, now) {
  const el = document.getElementById(containerId);
  if (!el || !items.length) { if (el) el.innerHTML = ''; return; }

  el.innerHTML = items.map(p => {
    const dateStr   = p._agendaDate;
    const d         = new Date(dateStr);
    const hasTime   = dateStr.includes(' ') && dateStr.split(' ')[1] !== '00:00';
    const isOverdue = hasTime && d < now;
    const isMeeting = p._agendaType === 'meeting';

    const timeDisplay = hasTime
      ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '—';
    const dayDisplay = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

    const borderClass = isOverdue ? 'agenda-card-overdue'
                      : isMeeting ? 'agenda-card-meeting'
                      : 'agenda-card-recall';

    const tag = isOverdue
      ? `<span class="agenda-tag tag-overdue">🚨 EN RETARD</span>`
      : isMeeting
        ? `<span class="agenda-tag tag-meeting">📅 RDV</span>`
        : `<span class="agenda-tag tag-recall">🔄 Rappel</span>`;

    const stageLabel = {
      to_recall: 'À Rappeler', meeting_to_set: 'RDV à poser', meeting_confirmed: 'RDV confirmé'
    }[p.pipeline_stage] || p.pipeline_stage;

    const notesPreview = p.notes ? esc(p.notes.substring(0, 60)) + (p.notes.length > 60 ? '…' : '') : '';
    const notesFull    = p.notes && p.notes.length > 60 ? esc(p.notes) : '';

    return `
      <div class="agenda-card ${borderClass}" onclick="openDetail(${p.id})">
        <div class="agenda-hour-col ${isOverdue ? 'hour-overdue' : isMeeting ? 'hour-meeting' : 'hour-recall'}">
          <div class="agenda-hour">${timeDisplay}</div>
          <div class="agenda-day">${dayDisplay}</div>
        </div>
        <div class="agenda-content">
          <div class="agenda-top-row">
            <span class="agenda-name">${esc(p.name || '—')}</span>
            ${tag}
          </div>
          ${p.phone ? `<a class="agenda-phone" href="tel:${escAttr(p.phone)}" onclick="event.stopPropagation()">📞 ${esc(p.phone)}</a>` : ''}
          ${notesPreview ? `
            <div class="agenda-notes-row" onclick="event.stopPropagation()">
              <span class="agenda-notes-preview" id="notes-prev-${p.id}">${notesPreview}</span>
              ${notesFull ? `
                <span class="agenda-notes-full" id="notes-full-${p.id}" style="display:none">${notesFull}</span>
                <button class="agenda-expand-btn" id="expand-btn-${p.id}" onclick="toggleAgendaNotes(${p.id})">▼</button>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </div>`;
  }).join('');
}

function toggleAgendaNotes(id) {
  const prev = document.getElementById(`notes-prev-${id}`);
  const full = document.getElementById(`notes-full-${id}`);
  const btn  = document.getElementById(`expand-btn-${id}`);
  if (!full) return;
  const expanded = full.style.display !== 'none';
  prev.style.display = expanded ? '' : 'none';
  full.style.display = expanded ? 'none' : '';
  btn.textContent    = expanded ? '▼' : '▲';
}

async function requestNotifPerm() {
  if (!('Notification' in window)) { showToast('Notifications non supportées sur ce navigateur', 'error'); return; }
  const perm = await Notification.requestPermission();
  const btn = document.getElementById('btn-notif');
  if (perm === 'granted') {
    btn.textContent = '✅ Notifications activées';
    btn.disabled = true;
    showToast('Notifications activées !', 'success');
    loadRappels();
  } else {
    showToast('Notifications refusées', 'error');
  }
}

/* ─────────────────────────────────────────
   AGENDA PANEL (quick view)
───────────────────────────────────────── */
function openAgenda() {
  const panel = document.getElementById('agenda-panel');
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
  if (panel.style.display !== 'none') renderAgendaPanel();
}
function closeAgenda() {
  document.getElementById('agenda-panel').style.display = 'none';
}

function renderAgendaPanel() {
  const now = new Date();
  const items = allProspects
    .filter(p => (p.rappel && p.pipeline_stage === 'to_recall') || (p.meeting_date && (p.pipeline_stage === 'meeting_to_set' || p.pipeline_stage === 'meeting_confirmed')))
    .map(p => ({
      ...p,
      _date: new Date(p.pipeline_stage === 'to_recall' ? p.rappel : p.meeting_date),
      _type: p.pipeline_stage === 'to_recall' ? 'rappel' : 'rdv'
    }))
    .sort((a, b) => a._date - b._date);

  // Update count badge
  const countEl = document.getElementById('agenda-count');
  if (countEl) { countEl.textContent = items.length; countEl.style.display = items.length ? '' : 'none'; }

  const body = document.getElementById('agenda-panel-body');
  if (!items.length) { body.innerHTML = '<div class="agenda-empty">Aucun rappel ou RDV planifié.</div>'; return; }

  body.innerHTML = items.map(p => {
    const isOverdue = p._date < now;
    const dayStr  = p._date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = (p.rappel || p.meeting_date || '').includes(' ')
      ? p._date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const notePreview = p.notes ? p.notes.substring(0, 60) + (p.notes.length > 60 ? '…' : '') : '';
    return `<div class="agenda-item ${isOverdue ? 'agenda-overdue' : ''}" onclick="openDetail(${p.id}); closeAgenda();">
      <div class="agenda-item-time">
        ${isOverdue ? '🔴' : p._type === 'rdv' ? '📅' : '🔄'}
        <strong>${timeStr || '—'}</strong>
        <span class="agenda-item-day">${dayStr}</span>
      </div>
      <div class="agenda-item-name">${esc(p.name || '—')}</div>
      ${notePreview ? `<div class="agenda-item-note">${esc(notePreview)}</div>` : ''}
    </div>`;
  }).join('');
}

/* ─────────────────────────────────────────
   ANALYSE
───────────────────────────────────────── */
async function loadAnalyse() {
  // Pipeline breakdown from allProspects (already loaded)
  const stages = { cold_call: 0, to_recall: 0, meeting: 0, closed: 0, refused: 0 };
  allProspects.forEach(p => {
    if (p.pipeline_stage === 'cold_call')           stages.cold_call++;
    else if (p.pipeline_stage === 'to_recall')      stages.to_recall++;
    else if (p.pipeline_stage === 'meeting_to_set' || p.pipeline_stage === 'meeting_confirmed') stages.meeting++;
    else if (p.pipeline_stage === 'closed')         stages.closed++;
    else if (p.pipeline_stage === 'refused')        stages.refused++;
  });

  const total = allProspects.length;
  const called = allProspects.filter(p => p.status === 'called').length;
  const rate = total > 0 ? Math.round((stages.closed / total) * 100) : 0;

  document.getElementById('kpi-total').textContent   = total;
  document.getElementById('kpi-called').textContent  = called;
  document.getElementById('kpi-meeting').textContent = stages.meeting;
  document.getElementById('kpi-closed').textContent  = stages.closed;
  document.getElementById('kpi-rate').textContent    = rate + '%';

  // Bars
  const maxVal = Math.max(...Object.values(stages), 1);
  const setPbar = (id, val) => {
    document.getElementById('pbar-' + id).style.width = Math.round((val / maxVal) * 100) + '%';
    document.getElementById('pbar-' + id + '-n').textContent = val;
  };
  setPbar('cold',    stages.cold_call);
  setPbar('recall',  stages.to_recall);
  setPbar('meeting', stages.meeting);
  setPbar('closed',  stages.closed);
  setPbar('refused', stages.refused);

  // Search history
  const searches = await apiGet('/api/prospects/searches');
  const searchEl = document.getElementById('search-history');
  const MODE_LABEL = { site:'🌐 Sans site', social:'📱 Sans réseaux', both:'🌐📱 Les deux', fewreviews:'⭐ <10 avis', owners:'🤖 Gérants IA', new:'🆕 Récents' };
  if (searchEl) {
    if (searches && searches.length) {
      searchEl.innerHTML = `
        <table class="search-hist-table">
          <thead><tr><th>Niche</th><th>Mode</th><th>Résultats</th><th>Date</th></tr></thead>
          <tbody>${searches.slice(0,30).map(s => {
            const d = new Date(s.created_at);
            const when = d.toLocaleDateString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
            return `<tr>
              <td class="sh-niche">${esc(s.niche)}</td>
              <td><span class="sh-mode-badge">${MODE_LABEL[s.search_mode]||s.search_mode}</span></td>
              <td class="sh-count">${s.results_count}</td>
              <td class="sh-date">${when}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>`;
    } else {
      searchEl.innerHTML = '<div class="activity-empty">Aucune recherche enregistrée.</div>';
    }
  }

  // Objection report
  const objData = await apiGet('/api/prospects/analytics/objections');
  const reportEl = document.getElementById('objection-report');
  if (objData && objData.rows && objData.rows.length > 0) {
    const maxObj = Math.max(...objData.rows.map(r => r.count), 1);
    reportEl.innerHTML = `
      <div class="obj-report-total">Sur <strong>${objData.total}</strong> refus total${objData.total > 1 ? 's' : ''} :</div>
      ${objData.rows.map(r => {
        const pct = Math.round((r.count / objData.total) * 100);
        const w   = Math.round((r.count / maxObj) * 100);
        return `<div class="obj-report-row">
          <span class="obj-report-label">${r.objection}</span>
          <div class="pbar-track"><div class="pbar-fill pbar-refused" style="width:${w}%"></div></div>
          <span class="obj-report-count">${r.count} <small>(${pct}%)</small></span>
        </div>`;
      }).join('')}
    `;
  } else {
    reportEl.innerHTML = '<div class="activity-empty">Pas encore de refus enregistrés.</div>';
  }

  // Activity log
  const data = await apiGet('/api/prospects/analytics');
  if (data && data.activityLog) {
    const logEl = document.getElementById('activity-log');
    if (!data.activityLog.length) {
      logEl.innerHTML = '<div class="activity-empty">Aucune activité récente.</div>';
    } else {
      const actionLabel = { status_change: '🔄 Statut modifié', stage_change: '➡️ Étape changée', manual_add: '➕ Prospect ajouté', search: '🔍 Recherche lancée' };
      logEl.innerHTML = data.activityLog.map(a => {
        const d = new Date(a.created_at);
        const when = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        return `<div class="activity-row">
          <span class="activity-action">${actionLabel[a.action] || a.action}</span>
          <span class="activity-when">${when}</span>
        </div>`;
      }).join('');
    }
  }
}

/* ─────────────────────────────────────────
   START
───────────────────────────────────────── */
init();

/* ══════════════════════════════════════════
   PREVIOUS SEARCHES
══════════════════════════════════════════ */
function togglePrevSearches() {
  const body = document.getElementById('prev-searches-body');
  const btn = document.getElementById('prev-searches-toggle');
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  btn.classList.toggle('open', isHidden);
  if (isHidden) loadPrevSearches();
}

async function loadPrevSearches() {
  const list = document.getElementById('prev-searches-list');
  try {
    const token = localStorage.getItem('ph_token');
    const res = await fetch('/api/search/history', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) throw new Error('Erreur');
    const data = await res.json();
    if (!data.history || data.history.length === 0) {
      list.innerHTML = '<div class="prev-search-empty">Aucune recherche précédente.</div>';
      return;
    }
    const modeLabels = { site: '🌐 Sans site', social: '📱 Sans réseaux', both: '🔥 Les deux', fewreviews: '⭐ <10 avis', owners: '🤖 Gérants IA', new: '🆕 Récents' };
    list.innerHTML = data.history.slice(0, 10).map(s => {
      const modeLabel = modeLabels[s.mode] || s.mode;
      const d = new Date(s.created_at);
      const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `<div class="prev-search-card" onclick="rerunSearch('${(s.niche || '').replace(/'/g, "\'")}','${s.mode || 'site'}','${s.country || 'fr'}')">
        <div class="prev-search-icon">${modeLabels[s.mode] ? modeLabels[s.mode].split(' ')[0] : '🔍'}</div>
        <div class="prev-search-info">
          <div class="prev-search-niche">${s.niche || 'Recherche'} — ${modeLabel}</div>
          <div class="prev-search-meta">${dateStr} · ${s.country === 'ch' ? '🇨🇭' : s.country === 'be' ? '🇧🇪' : '🇫🇷'}</div>
        </div>
        <div class="prev-search-count">${s.results_count || '?'} résultats</div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="prev-search-empty">Erreur de chargement.</div>';
  }
}

function rerunSearch(niche, mode, country) {
  const nicheInput = document.getElementById('scan-niche');
  if (nicheInput) nicheInput.value = niche;
  // Select mode
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  // Select country
  document.querySelectorAll('.flag-btn').forEach(b => b.classList.toggle('active', b.dataset.country === country));
  // Open scan panel if closed
  const scanBody = document.getElementById('scan-body');
  if (scanBody && scanBody.style.display === 'none') toggleScanPanel();
  showToast('🔍 Recherche pré-remplie — clique "Lancer" !');
}

/* ══════════════════════════════════════════
   MASS ACTIONS: Pitch IA / Export Excel / Export PDF
══════════════════════════════════════════ */
async function massPitchIA() {
  const prospects = getCurrentVisibleProspects();
  if (!prospects || prospects.length === 0) return showToast('❌ Aucun prospect visible');
  if (prospects.length > 20) return showToast('⚠️ Max 20 prospects à la fois');
  showToast('🤖 Génération des pitchs IA en cours...');
  let count = 0;
  const token = localStorage.getItem('ph_token');
  for (const p of prospects) {
    try {
      await fetch('/api/pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ prospect_id: p.id, type: 'appel' })
      });
      count++;
    } catch (e) { /* skip */ }
  }
  showToast(`✅ ${count} pitchs générés !`);
}

function getCurrentVisibleProspects() {
  if (typeof allProspects !== 'undefined' && typeof currentStage !== 'undefined') {
    return allProspects.filter(p => p.stage === currentStage);
  }
  return [];
}

function exportExcel() {
  const prospects = getCurrentVisibleProspects();
  if (!prospects || prospects.length === 0) return showToast('❌ Aucun prospect à exporter');
  const headers = ['Nom', 'Téléphone', 'Adresse', 'Site', 'Score', 'Stage', 'Notes'];
  const rows = prospects.map(p => [
    p.name || '', p.phone || '', p.address || '', p.website || '', p.heat_score || '', p.stage || '', (p.notes || '').replace(/\n/g, ' ')
  ]);
  let csv = '\uFEFF' + headers.join(';') + '\n' + rows.map(r => r.map(c => '"' + (c + '').replace(/"/g, '""') + '"').join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'prospects_' + (currentStage || 'export') + '.csv';
  a.click(); URL.revokeObjectURL(url);
  showToast('📗 Export Excel téléchargé !');
}

function exportPDF() {
  const prospects = getCurrentVisibleProspects();
  if (!prospects || prospects.length === 0) return showToast('❌ Aucun prospect à exporter');
  const heatLabels = { 5: '🔥🔥 Brûlant', 4: '🔥 Chaud', 3: '🌤️ Tiède', 2: '❄️ Froid', 1: '🧊 Glacial' };
  let html = `<html><head><meta charset="utf-8"><title>ProspectHunter — Export</title>
    <style>body{font-family:Arial,sans-serif;padding:2rem;color:#111}h1{font-size:1.4rem;margin-bottom:1rem}
    table{width:100%;border-collapse:collapse;font-size:.8rem}th,td{border:1px solid #ddd;padding:.5rem;text-align:left}
    th{background:#f5f5f5;font-weight:700}.badge{padding:.15rem .4rem;border-radius:4px;font-size:.7rem;font-weight:700}</style></head><body>
    <h1>🎯 ProspectHunter — ${prospects.length} prospects (${currentStage || 'export'})</h1>
    <p style="color:#666;font-size:.8rem">Exporté le ${new Date().toLocaleDateString('fr-FR')}</p>
    <table><thead><tr><th>Nom</th><th>Téléphone</th><th>Adresse</th><th>Score</th><th>Signaux</th></tr></thead><tbody>`;
  for (const p of prospects) {
    const heat = heatLabels[p.heat_score] || '—';
    const signals = [];
    if (!p.website) signals.push('🌐 Sans site');
    if (!p.has_facebook) signals.push('f/ Sans FB');
    if (!p.has_instagram) signals.push('📸 Sans IG');
    html += `<tr><td><strong>${p.name || ''}</strong></td><td>${p.phone || '—'}</td><td>${p.address || '—'}</td><td>${heat}</td><td>${signals.join(', ') || '—'}</td></tr>`;
  }
  html += '</tbody></table></body></html>';
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.print(); }, 500);
  showToast('📕 Export PDF ouvert pour impression !');
}

/* ══════════════════════════════════════════
   SIGNAL FILTERS
══════════════════════════════════════════ */
let activeSignalFilter = 'all';

function filterBySignal(signal, btn) {
  activeSignalFilter = signal;
  // Update active state
  document.querySelectorAll('.sig-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  applyFilters();
}

// Patch applyFilters to include signal filtering
const _originalApplyFilters = typeof applyFilters === 'function' ? applyFilters : null;

if (_originalApplyFilters) {
  const _origRender = typeof renderProspects === 'function' ? renderProspects : null;
  
  // Override to add signal filtering after the original filter
  window._signalFilterProspects = function(prospects) {
    if (activeSignalFilter === 'all') return prospects;
    return prospects.filter(p => {
      switch (activeSignalFilter) {
        case 'nosite': return !p.website_url && !p.website;
        case 'nofb': return p.has_facebook === 0 || p.has_facebook === -1;
        case 'noig': return p.has_instagram === 0 || p.has_instagram === -1;
        case 'notk': return p.has_tiktok === 0 || p.has_tiktok === -1;
        case 'hot': return (p.heat_score || 0) >= 4;
        case 'owner': return p.owner_name && p.owner_name.length > 0;
        default: return true;
      }
    });
  };
}
