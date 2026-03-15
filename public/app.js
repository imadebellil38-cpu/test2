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
    icon: '🎯',
    msg: 'Aucun prospect en Cold Call',
    hint: 'Lance un scan pour trouver des prospects ↑',
  },
  to_recall: {
    icon: '🔄',
    msg: 'Aucun prospect à rappeler',
    hint: 'Les prospects intéressés apparaîtront ici',
  },
  meeting_to_set: {
    icon: '📅',
    msg: 'Aucun rendez-vous à poser',
    hint: '',
  },
  meeting_confirmed: {
    icon: '✅',
    msg: 'Aucun rendez-vous confirmé',
    hint: '',
  },
  closed: {
    icon: '💰',
    msg: 'Aucun client closé',
    hint: 'Vos deals gagnés apparaîtront ici',
  },
  refused: {
    icon: '🚫',
    msg: 'Aucun refus',
    hint: '',
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
    return true;
  });
}

/* ─────────────────────────────────────────
   RENDER LIST (desktop + mobile)
───────────────────────────────────────── */
function renderList() {
  const prospects = getFilteredProspects().sort((a, b) => calcHeat(b) - calcHeat(a));
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
      <button class="act-btn act-btn-meeting act-btn-primary" onclick="moveStage(${id},'meeting_to_set')">📅 Poser RDV</button>
      <button class="act-btn act-btn-refuse" onclick="moveStage(${id},'refused')">❌ Refus</button>
    `;
  }
  if (stage === 'meeting_to_set') {
    return `
      <button class="act-btn act-btn-confirm act-btn-primary" onclick="moveStage(${id},'meeting_confirmed')">✅ RDV Confirmé</button>
      <button class="act-btn act-btn-refuse" onclick="moveStage(${id},'refused')">❌ Refus</button>
    `;
  }
  if (stage === 'meeting_confirmed') {
    return `
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
      ? `<a class="act-btn act-btn-call" href="tel:${escAttr(p.phone)}">📞</a>`
      : '';

    tr.innerHTML = `
      <td>
        <div class="prospect-name" onclick="openDetail(${p.id})">${esc(p.name || '—')}</div>
        ${p.address ? `<div class="prospect-addr">${esc(p.address)}</div>` : ''}
      </td>
      <td>
        <div class="phone-cell">
          ${p.phone
            ? `<a class="phone-call-link" href="tel:${escAttr(p.phone)}" title="Appuyer pour appeler">📞 ${esc(p.phone)}</a>`
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
        <div class="actions-cell">
          ${callLink}
          <button class="btn-more" onclick="openDetail(${p.id})" title="Voir fiche">···</button>
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
      <div class="card-signals">${buildHeatBadge(p)}${signals ? ' ' + signals : ''}</div>
      <div class="card-actions">${actions}</div>
    `;
    wrap.appendChild(card);
  });
}

/* ─────────────────────────────────────────
   MOVE STAGE (optimistic)
───────────────────────────────────────── */
async function moveStage(id, stage) {
  const prospect = allProspects.find(p => p.id === id);
  if (!prospect) return;

  const oldStage = prospect.pipeline_stage;
  // Optimistic update
  prospect.pipeline_stage = stage;
  updateBadges();
  renderList();

  const res = await apiPut(`/api/prospects/${id}/stage`, { stage });
  if (!res || !res.ok) {
    // Revert
    prospect.pipeline_stage = oldStage;
    updateBadges();
    renderList();
    showToast((res && res.error) || 'Erreur lors du déplacement.', 'error');
    return;
  }

  const stageMessages = {
    to_recall:          '🔄 Déplacé vers À Rappeler',
    meeting_to_set:     '📅 Rendez-vous à poser !',
    meeting_confirmed:  '✅ RDV confirmé !',
    closed:             '💰 CLOSÉ ! Bravo !',
    refused:            '❌ Marqué comme refusé.',
    cold_call:          '↩️ Remis en Cold Call.',
  };
  const isSuccess = stage === 'closed';
  showToast(stageMessages[stage] || 'Étape mise à jour.', isSuccess ? 'success' : 'info');

  if (stage === 'closed') {
    launchConfetti();
  }
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
    showToast('Prospect supprimé.', 'info');
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
    showToast(`📋 ${phone} copié !`, 'success', 2000);
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
    showToast('Pitch copié !', 'success', 2000);
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
    showToast(`${name} ajouté en Cold Call !`, 'success');
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
    showToast('Tape un métier avant de lancer !', 'warn');
    return;
  }

  const btn        = document.getElementById('btn-scan');
  const statusWrap = document.getElementById('scan-status');
  const statusText = document.getElementById('scan-status-text');
  const fillBar    = document.getElementById('scan-progress-fill');

  if (btn)        btn.disabled = true;
  if (statusWrap) statusWrap.style.display = 'flex';
  if (statusText) statusText.textContent   = 'Scan en cours...';

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
    if (statusText) statusText.textContent = `✅ ${count} prospects ajoutés !`;
    showToast(`🎯 ${count} prospects ajoutés en Cold Call`, 'success', 4000);

    await loadProspects();
    switchTab('cold_call');

  } catch (e) {
    clearInterval(progressTimer);
    showToast('Erreur de connexion', 'error');
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

  const today = new Date(); today.setHours(0,0,0,0);
  const endWeek = new Date(today); endWeek.setDate(endWeek.getDate() + 7);

  const withRappel = prospects
    .filter(p => p.rappel)
    .sort((a, b) => new Date(a.rappel) - new Date(b.rappel));

  const todayList   = withRappel.filter(p => { const d = new Date(p.rappel); d.setHours(0,0,0,0); return d <= today; });
  const weekList    = withRappel.filter(p => { const d = new Date(p.rappel); d.setHours(0,0,0,0); return d > today && d <= endWeek; });
  const laterList   = withRappel.filter(p => { const d = new Date(p.rappel); d.setHours(0,0,0,0); return d > endWeek; });

  renderRappelList('rappel-today-list', todayList, 'urgent');
  renderRappelList('rappel-week-list', weekList, 'soon');
  renderRappelList('rappel-later-list', laterList, 'later');

  document.getElementById('rappel-today-section').style.display = todayList.length ? '' : 'none';
  document.getElementById('rappel-week-section').style.display  = weekList.length  ? '' : 'none';
  document.getElementById('rappel-later-section').style.display = laterList.length ? '' : 'none';
  document.getElementById('rappel-empty').style.display = withRappel.length === 0 ? '' : 'none';

  // Dot in nav
  const dot = document.getElementById('nav-notif-dot');
  if (dot) dot.style.display = todayList.length > 0 ? '' : 'none';

  // Browser notification for today
  if (todayList.length > 0 && Notification.permission === 'granted') {
    new Notification('🔔 ProspectHunter', {
      body: `${todayList.length} rappel(s) prévu(s) aujourd'hui !`,
      icon: '/favicon.ico'
    });
  }
}

function renderRappelList(containerId, items, type) {
  const el = document.getElementById(containerId);
  if (!items.length) { el.innerHTML = ''; return; }
  el.innerHTML = items.map(p => {
    const d = new Date(p.rappel);
    const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const stageLabel = { cold_call:'📞 Cold Call', to_recall:'🔄 À Rappeler', meeting_to_set:'📅 RDV à poser', meeting_confirmed:'✅ RDV confirmé', closed:'✅ Closé', refused:'❌ Refusé' }[p.pipeline_stage] || p.pipeline_stage;
    return `
      <div class="rappel-card rappel-${type}" onclick="openDetail(${p.id})">
        <div class="rappel-card-left">
          <div class="rappel-card-name">${esc(p.name)}</div>
          <div class="rappel-card-meta">${p.phone ? esc(p.phone) + ' · ' : ''}${stageLabel}</div>
          ${p.notes ? `<div class="rappel-card-notes">${esc(p.notes.substring(0, 80))}${p.notes.length > 80 ? '…' : ''}</div>` : ''}
        </div>
        <div class="rappel-card-date rappel-date-${type}">
          <span>${dateStr}</span>
        </div>
      </div>`;
  }).join('');
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
