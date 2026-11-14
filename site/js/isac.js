// ISAC Player Intelligence System
// Powered by ProtoTrack.gg ISAC Network via Cloudflare Worker proxy.

// ---- i18n (shared engine translates static HTML + MutationObserver) ----
import './i18n.js?v=4';
const lang = document.documentElement.dataset.lang || 'en';
const t = (en, fr) => lang === 'fr' ? fr : en;

// ---- Config ----
const WORKER_URL = 'https://isac-proxy.anxkioalt.workers.dev';
const CACHE_KEY = 'isac.cache';
const CACHE_TTL = 5 * 60 * 1000;

function cached(key) {
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY}.${key}`);
    if (raw) { const c = JSON.parse(raw); if (Date.now() - c.t < CACHE_TTL) return c.d; }
  } catch {}
  return null;
}
function cache(key, data) {
  try { sessionStorage.setItem(`${CACHE_KEY}.${key}`, JSON.stringify({ t: Date.now(), d: data })); } catch {}
}

// ---- Helpers ----
const $ = sel => document.querySelector(sel);
const num = v => Number(v) || 0;
const fmt = n => (isFinite(n) ? Math.round(n).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US') : '—');
const compact = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : fmt(n));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pct(part, total) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function dailyAvg(kills, timePlayed) {
  const days = num(timePlayed) / 86400;
  return days >= 0.1 ? fmt(Math.round(num(kills) / days)) : '—';
}

// ---- Section icons ----
const SI = {
  combat: `<svg class="isac-si" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><line x1="12" y1="1" x2="12" y2="5" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="19" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>`,
  clock: `<svg class="isac-si" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="12,6 12,12 16,14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  dz: `<svg class="isac-si" viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="12" y1="10" x2="12" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg>`,
  faction: `<svg class="isac-si" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  prog: `<svg class="isac-si" viewBox="0 0 24 24"><polyline points="3,17 9,11 13,15 21,7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="15,7 21,7 21,13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  status: `<svg class="isac-si" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  spec: `<svg class="isac-si" viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 17,14 18,21 12,17 6,21 7,14 2,9 9,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  shield: `<svg class="isac-si" viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5.55-3.84 10.74-8 12-4.16-1.26-8-6.45-8-12V6l8-4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  user: `<svg class="isac-si" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 21v-1a8 8 0 0 1 16 0v1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

// ---- UI builders ----

function sec(icon, title, sub, body) {
  return `<div class="isac-sec">
    <div class="isac-sec-head">
      ${icon}<span class="isac-sec-htitle">${esc(title)}</span>
      ${sub ? `<span class="isac-sec-hsub">${sub}</span>` : ''}
    </div>
    <div class="isac-sec-body">${body}</div>
  </div>`;
}

function kvRow(label, value) {
  return `<div class="isac-kv"><span class="isac-kv-label">${esc(label)}</span><span class="isac-kv-val">${value}</span></div>`;
}

function statBox(label, value, accent) {
  const border = accent ? ` style="border-bottom:2px solid ${accent}"` : '';
  return `<div class="isac-stat-box"${border}><span class="isac-stat-box-label">${esc(label)}</span><b class="isac-stat-box-val">${value}</b></div>`;
}

// ---- Donut chart ----
function donutSVG(headPct) {
  const p = Math.max(0, Math.min(100, num(headPct)));
  const r = 54;
  const c = 2 * Math.PI * r;
  const filled = (p / 100) * c;
  const gap = c - filled;
  return `<div class="isac-donut-wrap">
    <svg class="isac-donut" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>
      <circle class="isac-donut-arc" cx="70" cy="70" r="${r}" fill="none"
        stroke="var(--accent)" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${filled.toFixed(1)} ${gap.toFixed(1)}"
        transform="rotate(-90 70 70)"/>
      <text class="isac-donut-pct" x="70" y="66" text-anchor="middle" dominant-baseline="middle">${p.toFixed(1)}%</text>
      <text class="isac-donut-label" x="70" y="86" text-anchor="middle">${t('HEADSHOT', 'HEADSHOT')}</text>
    </svg>
  </div>`;
}

// ---- Faction icons ----
const FACTION_ICONS = {
  blackTusk: `<svg viewBox="0 0 32 32" class="isac-fc-icon"><polygon points="16,2 30,16 16,30 2,16" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="16,8 24,16 16,24 8,16" fill="currentColor" opacity="0.4"/></svg>`,
  trueSons: `<svg viewBox="0 0 32 32" class="isac-fc-icon"><rect x="14" y="2" width="4" height="28" fill="currentColor"/><rect x="8" y="6" width="16" height="10" fill="currentColor" opacity="0.5"/><rect x="10" y="4" width="2" height="4" fill="currentColor"/></svg>`,
  outcasts: `<svg viewBox="0 0 32 32" class="isac-fc-icon"><path d="M16 2c0 0-8 10-8 18a8 8 0 0 0 16 0c0-8-8-18-8-18z" fill="currentColor" opacity="0.6"/><path d="M16 8c0 0-4 6-4 11a4 4 0 0 0 8 0c0-5-4-11-4-11z" fill="currentColor"/></svg>`,
  hyenas: `<svg viewBox="0 0 32 32" class="isac-fc-icon"><polygon points="16,2 20,12 30,12 22,18 25,28 16,22 7,28 10,18 2,12 12,12" fill="currentColor" opacity="0.7"/></svg>`
};

function factionCard(name, icon, kills, color) {
  return `<div class="isac-faction-card" style="--fc:${color}">
    <div class="isac-fc-icon-wrap" style="color:${color}">${icon}</div>
    <span class="isac-fc-name">${esc(name)}</span>
    <b class="isac-fc-kills">${fmt(kills)}</b>
  </div>`;
}

// ---- Time rows ----
function timeRow(label, formatted, color) {
  return `<div class="isac-time-entry">
    <span class="isac-time-dot" style="background:${color}"></span>
    <span class="isac-time-label">${esc(label)}</span>
    <span class="isac-time-val">${esc(formatted || '—')}</span>
  </div>`;
}

// ---- Tab switching ----
document.querySelectorAll('.isac-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.isac-tab').forEach(t => {
      t.classList.remove('on');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('on');
    tab.setAttribute('aria-selected', 'true');
    const target = tab.dataset.tab;
    document.querySelectorAll('.isac-tab-panel').forEach(p => {
      const show = p.id === `tab-${target}`;
      p.hidden = !show;
      p.classList.toggle('active', show);
    });
  });
});

// ---- Platform ----
let platform = 'uplay';
let _lastStats = {}, _lastCombat = {};
document.querySelectorAll('[data-platform]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-platform]').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    platform = btn.dataset.platform;
  });
});

function platformLabel(p) {
  return { uplay: 'PC', psn: 'PlayStation', xbl: 'Xbox' }[p] || p;
}

// ---- API ----
async function fetchIsac(username, plat) {
  const key = `${plat}:${username.toLowerCase()}`;
  const hit = cached(key);
  if (hit) return hit;

  const res = await fetch(`${WORKER_URL}/isac/${encodeURIComponent(plat)}/${encodeURIComponent(username)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = `HTTP ${res.status}`;
    let detail = '';
    try { const j = JSON.parse(body); msg = j.error || j.message || msg; detail = j.detail || ''; } catch {}
    // The worker wraps upstream "not found" as a 502 with the real response in detail
    if (/no player|not found/i.test(detail) || /no player|not found/i.test(msg) || res.status === 404)
      throw new Error('Player not found');
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.status === false) throw new Error(data.message || 'Player not found');
  cache(key, data);
  return data;
}

// ---- Anti-cheat API (second fetch, uses Ubisoft identifier) ----
async function fetchIsacAnticheat(plat, identifier, retries = 2) {
  const key = `ac:${plat}:${identifier.toLowerCase()}`;
  const hit = cached(key);
  if (hit) return hit;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
    try {
      const res = await fetch(`${WORKER_URL}/isac/${encodeURIComponent(plat)}/${encodeURIComponent(identifier)}?anti_cheat=1`);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = `HTTP ${res.status}`;
        try { const j = JSON.parse(body); msg = j.error || j.message || msg; } catch {}
        if (attempt < retries) continue;
        throw new Error(msg);
      }
      const data = await res.json();
      if (data.status === false) {
        if (attempt < retries) continue;
        throw new Error(data.message || 'Anti-cheat data unavailable');
      }
      cache(key, data);
      return data;
    } catch (err) {
      if (attempt >= retries) throw err;
    }
  }
}

// ---- Merit guide data ----
const MERITS = [
  { name: 'Pyromaniac', desc: t('Kill targets while they are affected by burn.', 'Éliminer des cibles affectées par la brûlure.'), req: t('At least 25,000 kills', 'Au moins 25 000 éliminations') },
  { name: 'Bleeding Edge', desc: t('Kill targets while they are affected by bleed.', 'Éliminer des cibles affectées par le saignement.'), req: t('At least 25,000 kills', 'Au moins 25 000 éliminations') },
  { name: 'Foam King', desc: t('Kill targets while they are foamed.', 'Éliminer des cibles piégées dans la mousse.'), req: t('At least 4,000 kills', 'Au moins 4 000 éliminations') },
  { name: 'Electrified', desc: t('Kill targets while they are shocked.', 'Éliminer des cibles électrocutées.'), req: t('At least 4,000 kills', 'Au moins 4 000 éliminations') },
  { name: 'Elemental Gadgetry', desc: t('Reach the required number of skill kills.', "Atteindre le nombre requis d'éliminations de compétences."), req: t('At least 150,000 skill kills', 'Au moins 150 000 éliminations de compétences') },
  { name: 'The Looter', desc: t('Loot the required number of items.', "Récupérer le nombre requis d'objets."), req: t('At least 50,000 items', 'Au moins 50 000 objets') },
  { name: 'Survivor', desc: t('Get kills while using the Survivalist specialization.', 'Éliminer en utilisant la spécialisation Survivant.'), req: t('At least 15,000 kills', 'Au moins 15 000 éliminations') },
  { name: 'The White Death', desc: t('Get kills while using the Sharpshooter specialization.', "Éliminer en utilisant la spécialisation Tireur d'élite."), req: t('At least 15,000 kills', 'Au moins 15 000 éliminations') },
  { name: 'Demolition Man', desc: t('Get kills while using the Demolitionist specialization.', 'Éliminer en utilisant la spécialisation Artificier.'), req: t('At least 15,000 kills', 'Au moins 15 000 éliminations') },
  { name: 'Firewall', desc: t('Get kills while using the Firewall specialization.', 'Éliminer en utilisant la spécialisation Pare-feu.'), req: t('At least 15,000 kills', 'Au moins 15 000 éliminations') },
  { name: 'Decorated Soldier', desc: t('Reach the required Commendation Score.', 'Atteindre le score de recommandation requis.'), req: t('At least 3,000 score', 'Au moins 3 000 points') },
  { name: 'Oxidizer Warrior', desc: t('Get the required number of kills with Oxidizer.', "Obtenir le nombre requis d'éliminations avec l'Oxydeur."), req: t('At least 9,000 kills', 'Au moins 9 000 éliminations') },
  { name: 'Mad Bomber', desc: t('Get the required number of grenade kills.', "Obtenir le nombre requis d'éliminations à la grenade."), req: t('At least 10,000 grenade kills', 'Au moins 10 000 éliminations à la grenade') },
  { name: 'Gold Rush', desc: t('Reach the required amount of e-credits.', "Atteindre le montant requis d'e-crédits."), req: t('At least 3,000,000 e-credits', 'Au moins 3 000 000 e-crédits') },
  { name: 'Bounty Hunter', desc: t('Complete the required number of bounties.', 'Terminer le nombre requis de primes.'), req: t('At least 100 bounties', 'Au moins 100 primes') },
];

// Merit guide dialog
const meritDialog = $('#merit-guide');
const meritGuideBtn = $('#merit-guide-btn');
const meritGuideClose = $('#merit-guide-close');
const meritGuideBody = $('#merit-guide-body');

if (meritGuideBtn && meritDialog) {
  meritGuideBody.innerHTML =
    `<p class="note" style="margin-bottom:14px">${t('15 automatic merits · Definitions and minimum requirements', '15 mérites automatiques · Définitions et exigences minimales')}</p>`
    + MERITS.map(m => `<div class="isac-merit-item">
        <b>${esc(m.name)}</b>
        <p>${esc(m.desc)}</p>
        <span class="note">${esc(m.req)}</span>
      </div>`).join('');

  meritGuideBtn.addEventListener('click', () => meritDialog.showModal());
  meritGuideClose.addEventListener('click', () => meritDialog.close());
  meritDialog.addEventListener('click', e => { if (e.target === meritDialog) meritDialog.close(); });
}

// ---- Shared section builders ----

function buildCombatAnalysis(combat) {
  const hsPct = num(combat.percentageOfHeadshots);
  const bsPct = 100 - hsPct;
  const hs = num(combat.headshots);
  const bs = num(combat.bodyshots);
  const totalHits = num(combat.hits || combat.totalHits || (hs + bs + num(combat.criticalHits)));
  const bsHsRatio = hs > 0 ? (bs / hs).toFixed(2) : '—';
  const hsBsRatio = bs > 0 ? (hs / bs).toFixed(2) : '—';
  return sec(SI.combat, t('Combat analysis', 'Analyse de combat'), '', `
    ${donutSVG(hsPct)}
    <div class="isac-hit-grid">
      ${statBox(t('Headshots / hr', 'Headshots / h'), fmt(num(combat.headshotsPerHour)), 'var(--accent)')}
      ${statBox(t('Bodyshots / hr', 'Bodyshots / h'), fmt(num(combat.bodyshotsPerHour)))}
      ${statBox(t('Critical Hits / hr', 'Coups crit. / h'), fmt(num(combat.criticalHitsPerHour)), 'var(--he)')}
      ${statBox(t('All Hits / hr', 'Tous coups / h'), fmt(num(combat.hitsPerHour)))}
    </div>
    <div class="isac-kv-list" style="margin-top:10px">
      ${kvRow(t('Hits', 'Coups'), fmt(totalHits))}
      ${kvRow(t('Headshots', 'Headshots'), fmt(hs))}
      ${kvRow(t('Bodyshots', 'Bodyshots'), fmt(bs))}
      ${kvRow(t('Critical hits', 'Coups critiques'), fmt(num(combat.criticalHits)))}
      ${kvRow(t('Bodyshot / headshot ratio', 'Ratio bodyshot / headshot'), bsHsRatio)}
      ${kvRow(t('Headshot / bodyshot ratio', 'Ratio headshot / bodyshot'), hsBsRatio)}
    </div>
    <div class="isac-legend">
      <span class="isac-legend-item"><span class="isac-legend-dot" style="background:var(--accent)"></span> ${t('Headshots', 'Headshots')} ${hsPct.toFixed(1)}%</span>
      <span class="isac-legend-item"><span class="isac-legend-dot" style="background:var(--line-2)"></span> ${t('Bodyshots', 'Bodyshots')} ${bsPct.toFixed(1)}%</span>
    </div>
    <p class="note" style="text-align:center;margin-top:8px">${t('Percentages and ratios supplied by ISAC.', 'Pourcentages et ratios fournis par ISAC.')}</p>
  `);
}

function buildFactionKills(stats) {
  const factions = [
    { name: 'Black Tusk', kills: num(stats.blackTuskKilled), icon: FACTION_ICONS.blackTusk, color: 'var(--blue)' },
    { name: 'True Sons', kills: num(stats.trueSonsKilled), icon: FACTION_ICONS.trueSons, color: 'var(--red)' },
    { name: 'Outcasts', kills: num(stats.outcastsKilled), icon: FACTION_ICONS.outcasts, color: 'var(--s0)' },
    { name: 'Hyenas', kills: num(stats.hyenasKilled), icon: FACTION_ICONS.hyenas, color: 'var(--he)' },
  ];
  return sec(SI.faction, t('Faction kills', 'Éliminations par faction'), '', `
    <div class="isac-faction-cards">${factions.map(f => factionCard(f.name, f.icon, f.kills, f.color)).join('')}</div>
  `);
}

function buildTimeInField(stats) {
  return sec(SI.clock, t('Time in the field', 'Temps sur le terrain'), '', `
    <div class="isac-time-list">
      ${timeRow(t('PvE Time', 'Temps PvE'), stats.timePlayedPveFormatted, 'var(--ok)')}
      ${timeRow(t('Dark Zone Time', 'Temps Dark Zone'), stats.timePlayedDarkZoneFormatted, 'var(--red)')}
      ${timeRow(t('Rogue Time', 'Temps Renégat'), stats.timePlayedRogueFormatted, 'var(--he)')}
    </div>
  `);
}

function buildDarkZoneConflict(stats) {
  return sec(SI.dz, t('Dark Zone & Conflict', 'Dark Zone & Conflit'), '', `
    <div class="isac-kv-list">
      ${kvRow(t('DZ Level', 'Niveau DZ'), fmt(num(stats.darkzoneLevel)))}
      ${kvRow(t('Conflict Level', 'Niveau Conflit'), fmt(num(stats.conflictLevel)))}
      ${kvRow(t('Rogues Killed', 'Renégats éliminés'), fmt(num(stats.roguesKilled)))}
      ${kvRow(t('Time as Rogue', 'Temps en Renégat'), stats.timePlayedRogueFormatted || '—')}
      ${kvRow(t('Longest Rogue', 'Plus long Renégat'), stats.timePlayedRogueLongestFormatted || '—')}
    </div>
  `);
}

function buildCombatSidebar(stats, combat) {
  return sec(SI.combat, t('Combat', 'Combat'), '', `
    <div class="isac-kv-list">
      ${kvRow(t('NPC Kills', 'Élims PNJ'), fmt(num(stats.killsNpc)))}
      ${kvRow(t('PvP Kills', 'Élims PvP'), fmt(num(stats.killsPvp)))}
      ${kvRow(t('Headshot Kills', 'Élims headshot'), fmt(num(combat.headshots)))}
      ${kvRow(t('Headshots', 'Headshots'), fmt(num(combat.headshots)))}
      ${kvRow(t('Critical Hits', 'Coups critiques'), fmt(num(combat.criticalHits)))}
      ${kvRow(t('Skill Kills', 'Élims compétences'), fmt(num(stats.sumSkillKills)))}
      ${kvRow(t('Daily NPC Kills', 'Élims PNJ / jour'), dailyAvg(stats.killsNpc, stats.timePlayed))}
    </div>
  `);
}

function buildStatusEffects(stats) {
  return sec(SI.status, t('Status effects', 'Effets de statut'), '', `
    <div class="isac-kv-list">
      ${kvRow(t('Burning', 'Brûlure'), fmt(num(stats.burningKills)))}
      ${kvRow(t('Shock', 'Choc'), fmt(num(stats.shockKills)))}
      ${kvRow(t('Bleed', 'Saignement'), fmt(num(stats.bleedingKills)))}
      ${kvRow(t('Ensnare', 'Piège'), fmt(num(stats.ensnareKills)))}
      ${kvRow(t('Grenades', 'Grenades'), fmt(num(stats.grenadeKills)))}
    </div>
  `);
}

function buildSpecializations(stats) {
  return sec(SI.spec, t('Specializations', 'Spécialisations'), '', `
    <div class="isac-kv-list">
      ${kvRow('Gunner', fmt(num(stats.gunnerKills)))}
      ${kvRow('Sharpshooter', fmt(num(stats.sharpshooterKills)))}
      ${kvRow('Survivalist', fmt(num(stats.survivalistKills)))}
      ${kvRow('Technician', fmt(num(stats.technicianKills)))}
      ${kvRow('Demolitionist', fmt(num(stats.demolitionistKills)))}
      ${kvRow('Firewall', fmt(num(stats.firewallKills)))}
    </div>
  `);
}

function buildProgressionSection(stats) {
  return sec(SI.prog, t('Progression', 'Progression'), '', `
    <div class="isac-prog-boxes">
      ${statBox(t('Commendation', 'Recommandation'), fmt(num(stats.commendationScore)), 'var(--he)')}
      ${statBox('Open World XP', fmt(num(stats.openWorldXp)), 'var(--ok)')}
      ${statBox('Clan XP', fmt(num(stats.clanXp)), 'var(--blue)')}
    </div>
    <span class="isac-sec-sublabel">${t('Loot & activities', 'Butin & activités')}</span>
    <div class="isac-kv-list">
      ${kvRow(t('Items Looted', 'Objets récupérés'), fmt(num(stats.itemsLooted)))}
      ${kvRow(t('Exotics Crafted', 'Exotiques fabriqués'), fmt(num(stats.craftedExotics)))}
      ${kvRow(t('Projects Completed', 'Projets terminés'), fmt(num(stats.projectsCompleted)))}
      ${kvRow(t('Bounties Completed', 'Primes terminées'), fmt(num(stats.bountiesCompleted)))}
    </div>
  `);
}

// ---- Tab renderers ----

function renderOverview(stats, combat) {
  $('#tab-overview').innerHTML = `
    <div class="isac-cols">
      <div class="isac-col-main">${buildCombatAnalysis(combat)}</div>
      <div class="isac-col-side">
        ${buildTimeInField(stats)}
        ${buildDarkZoneConflict(stats)}
      </div>
    </div>
    ${buildFactionKills(stats)}
    <div class="isac-three-sections">
      ${buildCombatSidebar(stats, combat)}
      ${buildProgressionSection(stats)}
      ${buildStatusEffects(stats)}
    </div>
  `;
}

function renderCombat(stats, combat) {
  $('#tab-combat').innerHTML = `
    <div class="isac-cols">
      <div class="isac-col-main">${buildCombatAnalysis(combat)}</div>
      <div class="isac-col-side">${buildCombatSidebar(stats, combat)}</div>
    </div>
    ${buildFactionKills(stats)}
    <div class="isac-two-sections">
      ${buildStatusEffects(stats)}
      ${buildSpecializations(stats)}
    </div>
  `;
}

function renderDarkZone(stats) {
  $('#tab-darkzone').innerHTML = `
    <div class="isac-cols">
      <div class="isac-col-main">${buildDarkZoneConflict(stats)}</div>
      <div class="isac-col-side">${buildTimeInField(stats)}</div>
    </div>
    ${buildFactionKills(stats)}
  `;
}

function renderProgression(stats) {
  $('#tab-progression').innerHTML = `
    ${sec(SI.prog, t('Progression', 'Progression'), t('ISAC statistics', 'Statistiques ISAC'), `
      <div class="isac-prog-boxes">
        ${statBox(t('Commendation Score', 'Score recommandation'), fmt(num(stats.commendationScore)), 'var(--he)')}
        ${statBox('Open World XP', fmt(num(stats.openWorldXp)), 'var(--ok)')}
        ${statBox('Clan XP', fmt(num(stats.clanXp)), 'var(--blue)')}
      </div>
      <span class="isac-sec-sublabel">${t('Loot & activities', 'Butin & activités')}</span>
      <div class="isac-kv-list">
        ${kvRow(t('Items Looted', 'Objets récupérés'), fmt(num(stats.itemsLooted)))}
        ${kvRow(t('Exotics Crafted', 'Exotiques fabriqués'), fmt(num(stats.craftedExotics)))}
        ${kvRow(t('Projects Completed', 'Projets terminés'), fmt(num(stats.projectsCompleted)))}
        ${kvRow(t('Bounties Completed', 'Primes terminées'), fmt(num(stats.bountiesCompleted)))}
      </div>
    `)}
  `;
}

function renderIsacProfile(prov) {
  const identifier = prov.identifier || '';
  const usernameChanges = prov.usernameChangeWhen;
  $('#tab-isac-prof').innerHTML = `
    <div class="isac-prof-header">
      <h3 class="isac-prof-title">${t('Full ISAC Profile', 'Profil ISAC complet')}</h3>
      <span class="isac-prof-sub">${t('Supplied by ISAC', 'Fourni par ISAC')}</span>
    </div>
    <div class="isac-prof-grid">
      <div class="isac-prof-box">
        <span class="isac-prof-box-label">${t('Ubisoft identifier', 'Identifiant Ubisoft')}</span>
        <span class="isac-prof-box-val isac-mono">${identifier ? esc(identifier) : '—'}</span>
      </div>
      <div class="isac-prof-box">
        <span class="isac-prof-box-label">${t('Username Change Availability', 'Disponibilité changement de nom')}</span>
        <b class="isac-prof-box-val">${usernameChanges != null ? usernameChanges : '—'}</b>
      </div>
    </div>
  `;
}

// ---- Backfill combat data from anti-cheat computed metrics ----
function backfillCombatFromAC(acPayload) {
  const computed = acPayload?.data?.computed;
  if (!computed) return;
  let changed = false;
  if (computed.totalCriticalHits && !_lastCombat.criticalHits) {
    _lastCombat.criticalHits = computed.totalCriticalHits.input_value;
    changed = true;
  }
  if (computed.criticalHitsPerHour && !_lastCombat.criticalHitsPerHour) {
    _lastCombat.criticalHitsPerHour = computed.criticalHitsPerHour.input_value;
    changed = true;
  }
  if (changed) {
    renderOverview(_lastStats, _lastCombat);
    renderCombat(_lastStats, _lastCombat);
  }
}

// ---- Anti-cheat Display (fetches ProtoTrack server-computed values via second request) ----

// Metric key → human label (mirrors ProtoTrack's isac-anti-cheat.js)
const AC_METRIC_LABELS = {
  headshotsPerHour: t('Headshots / hour', 'Headshots / heure'),
  bodyshotsPerHour: t('Bodyshots / hour', 'Bodyshots / heure'),
  criticalHitsPerHour: t('Critical hits / hour', 'Coups critiques / heure'),
  weaponHitsPerHour: t('Weapon hits / hour', 'Coups arme / heure'),
  npcKillsPerHour: t('NPC kills / hour', 'Éliminations PNJ / heure'),
  percentageOfHeadshots: t('Headshot %', '% Headshot'),
  percentageOfCriticalHits: t('Critical hit %', '% Coups critiques'),
  bsToHsRatio: t('Bodyshots per headshot', 'Bodyshots par headshot'),
  headshotKillRatio: t('Headshot kill ratio', 'Ratio élimination headshot'),
  totalHeadshots: t('Total headshots', 'Total headshots'),
  totalBodyshots: t('Total bodyshots', 'Total bodyshots'),
  totalCriticalHits: t('Total critical hits', 'Total coups critiques'),
  timePlayed: t('Time played', 'Temps joué'),
};

function renderAnticheatLoading() {
  $('#tab-anticheat').innerHTML = `
    <div class="isac-ac-head-row">
      <div class="isac-ac-head-left">${SI.shield}<h3 class="isac-ac-heading">${t('Anti-cheat analysis', 'Analyse anti-triche')}</h3></div>
    </div>
    <div class="isac-scanning"><div class="isac-scan-ring"></div><span>${t('Computing anti-cheat assessment…', 'Calcul de l\'analyse anti-triche…')}</span></div>
  `;
}

function renderAnticheatError(msg) {
  $('#tab-anticheat').innerHTML = `
    <div class="isac-ac-head-row">
      <div class="isac-ac-head-left">${SI.shield}<h3 class="isac-ac-heading">${t('Anti-cheat analysis', 'Analyse anti-triche')}</h3></div>
      <button class="btn small" id="ac-recompute">${t('Retry', 'Réessayer')}</button>
    </div>
    <p class="note warn">${t('Anti-cheat analysis failed: ', 'Échec de l\'analyse anti-triche: ')}${esc(msg)}</p>
  `;
}

function renderAnticheat(payload) {
  const data = payload.data || {};
  const advisory = data.advisory || {};
  const computed = data.computed || {};

  // --- Format helpers ---
  const numeric = v => typeof v === 'number' && Number.isFinite(v);
  const fmtVal = v => numeric(v) ? new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 4 }).format(v) : '—';
  const fmtPct = v => numeric(v) ? `${new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}%` : '—';
  const fraction = v => numeric(v) && v >= 0 && v <= 1 ? fmtPct(v * 100) : '—';
  function probColor(v) { return v > 50 ? 'red' : v > 20 ? 'amber' : 'green'; }
  function yesNo(val) {
    return val === true
      ? `<span class="isac-yn yes">${t('YES', 'OUI')}</span>`
      : val === false
      ? `<span class="isac-yn no">${t('NO', 'NON')}</span>`
      : '—';
  }
  function flagBadge(flag) {
    const f = (flag || '').toLowerCase();
    const cls = f === 'extreme' ? 'flag-extreme' : f === 'strong' ? 'flag-mild' : 'flag-normal';
    return `<span class="isac-flag ${cls}">${esc(flag || '—')}</span>`;
  }

  // --- Verdict ---
  const verdictRaw = data.scorable === false ? 'NOT SCORABLE'
    : data.verdict === 'RULE_FLAG' ? 'FLAGGED BY RULE'
    : data.verdict === 'RULE_CLEAR' ? 'CLEARED BY RULE'
    : (data.verdict || 'CLEAR').replaceAll('_', ' ');
  const verdictUpper = verdictRaw.toUpperCase();
  const isFlagged = data.should_flag === true || data.is_cheater === true || verdictUpper.includes('FLAG');
  const isReview = data.should_review === true || verdictUpper.includes('REVIEW');

  let verdictClass = 'legit';
  let verdictLabel = t('Legitimate', 'Légitime');
  let verdictDesc = t(
    'This player has been analyzed and their statistics appear to be within normal parameters.',
    "Ce joueur a été analysé et ses statistiques semblent être dans les paramètres normaux."
  );
  if (isFlagged) {
    verdictClass = 'flagged';
    verdictLabel = t('Flagged', 'Signalé');
    verdictDesc = t(
      'This player has been flagged for suspicious activity. Their statistics show significant anomalies.',
      'Ce joueur a été signalé pour activité suspecte. Ses statistiques montrent des anomalies significatives.'
    );
  } else if (isReview) {
    verdictClass = 'suspect';
    verdictLabel = t('Review', 'Examen');
    verdictDesc = t(
      'This player has been queued for review. Their statistics show anomalies warranting investigation.',
      "Ce joueur a été mis en file d'attente pour examen. Ses statistiques montrent des anomalies."
    );
  }

  const verdictHeading = `${verdictRaw}${data.action ? ' — ' + data.action : ''}`;
  const verdictSub = t(
    `Cheater probability ${fmtPct(data.cheater_percentage)}. Confidence ${fraction(data.confidence_score)}.${data.review_priority && data.review_priority !== 'NONE' ? ` Review priority: ${data.review_priority}.` : ' No review required.'}`,
    `Probabilité triche ${fmtPct(data.cheater_percentage)}. Confiance ${fraction(data.confidence_score)}.${data.review_priority && data.review_priority !== 'NONE' ? ` Priorité examen: ${data.review_priority}.` : ' Aucun examen requis.'}`
  );

  // --- Rule banner ---
  let ruleBanner = '';
  if (data.rule) {
    const marginStr = numeric(data.margin_over_threshold) ? ` · ${t('Margin', 'Marge')}: ${fmtVal(data.margin_over_threshold)}` : '';
    ruleBanner = `
      <div class="isac-ac-rule-banner">
        <div class="isac-ac-rule-label">${esc(data.rule)}</div>
        <p class="isac-ac-rule-desc">${esc(data.reason || '')}${marginStr}</p>
      </div>`;
  }

  // --- Model / advisory section ---
  const hasAdvisory = advisory.available === true;
  const modelSection = hasAdvisory ? `
    <div class="isac-ac-metrics-head"><h4>${t('Model score', 'Score du modèle')}</h4>${advisory.advisory_only === true ? `<span class="isac-tag">${t('Advisory only', 'Consultatif uniquement')}</span>` : ''}</div>
    <div class="isac-ac-model-grid">
      <div class="isac-ac-card"><span class="isac-ac-card-label">${t('Score', 'Score')}</span><b class="isac-ac-card-val">${fraction(advisory.score)}</b></div>
      <div class="isac-ac-card"><span class="isac-ac-card-label">${t('Queue Cutoff', 'Seuil file')}</span><b class="isac-ac-card-val">${fraction(advisory.queue_threshold)}</b></div>
      <div class="isac-ac-card"><span class="isac-ac-card-label">${t('Model Probability', 'Probabilité modèle')}</span><b class="isac-ac-card-val">${fmtPct(advisory.cheater_percentage)}</b></div>
      <div class="isac-ac-card"><span class="isac-ac-card-label">${t('Would Queue Independently', 'Mise en file indépendante')}</span><b class="isac-ac-card-val">${yesNo(advisory.would_queue_independently)}</b></div>
      <div class="isac-ac-card"><span class="isac-ac-card-label">${t('Model Population', 'Population modèle')}</span><b class="isac-ac-card-val">${esc(advisory.model_population || '—')}</b></div>
    </div>` : '';

  // --- Model score bar ---
  const validScore = numeric(advisory.score) && advisory.score >= 0 && advisory.score <= 1;
  const validCutoff = numeric(advisory.queue_threshold) && advisory.queue_threshold >= 0 && advisory.queue_threshold <= 1;
  const modelBar = hasAdvisory && validScore ? `
    <div class="isac-ac-model-bar-wrap">
      <div class="isac-ac-model-bar">
        <div class="isac-ac-model-fill" style="width:${(advisory.score * 100).toFixed(1)}%"></div>
        ${validCutoff ? `<div class="isac-ac-model-cutoff" style="left:${(advisory.queue_threshold * 100).toFixed(1)}%"><span>${fraction(advisory.queue_threshold)}</span></div>` : ''}
      </div>
      <div class="isac-ac-model-bar-labels">
        <span>0%</span>${validCutoff ? `<span>${t('Queue cutoff', 'Seuil file')}</span>` : '<span></span>'}<span>100%</span>
      </div>
    </div>` : '';

  // --- Caveat ---
  const caveatHTML = advisory.caveat ? `<p class="note isac-ac-caveat">${esc(advisory.caveat)}</p>` : '';

  // --- Metric breakdown table ---
  const metricKeys = Object.keys(AC_METRIC_LABELS).filter(k => computed[k]);
  let metricsHTML = '';
  if (metricKeys.length) {
    const rows = metricKeys.map(key => {
      const m = computed[key];
      const aboveCutoff = numeric(m.input_value) && numeric(m.p99) && m.input_value > m.p99;
      return `<tr>
        <td>${esc(AC_METRIC_LABELS[key])}</td>
        <td${aboveCutoff ? ' class="above-cutoff"' : ''}>${fmtVal(m.input_value)}${aboveCutoff ? ' ↑' : ''}</td>
        <td>${fmtVal(m.median_value)}</td>
        <td>${fmtVal(m.p99)}</td>
        <td>${fmtVal(m.deviation_value)}</td>
        <td>${numeric(m.deviation_percentage) ? fmtPct(m.deviation_percentage) : '—'}</td>
        <td>${fmtVal(m.z_score)}</td>
        <td>${fmtVal(m.std_z_score)}</td>
        <td>${flagBadge(m.flag)}</td>
      </tr>`;
    }).join('');
    metricsHTML = `
      <div class="isac-ac-metrics-head"><h4>${t('Metric breakdown', 'Répartition des métriques')}</h4></div>
      <div class="isac-ac-table-wrap">
        <table class="isac-ac-table">
          <thead><tr>
            <th>${t('METRIC', 'MÉTRIQUE')}</th><th>${t('INPUT', 'ENTRÉE')}</th><th>${t('MEDIAN', 'MÉDIANE')}</th>
            <th>${t('TOP 1% CUTOFF', 'SEUIL TOP 1%')}</th><th>${t('DEVIATION', 'DÉVIATION')}</th>
            <th>${t('% DEVIATION', '% DÉVIATION')}</th><th>${t('Z-SCORE', 'Z-SCORE')}</th>
            <th>${t('STD Z-SCORE', 'Z-SCORE STD')}</th><th>${t('FLAG', 'INDICATEUR')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } else {
    metricsHTML = `
      <div class="isac-ac-metrics-head"><h4>${t('Metric breakdown', 'Répartition des métriques')}</h4></div>
      <p class="note">${t('No metric data available from ProtoTrack for this player.', 'Aucune donnée métrique disponible sur ProtoTrack pour ce joueur.')}</p>`;
  }

  // --- Note ---
  const noteHTML = data.note ? `<p class="note isac-ac-note">${esc(data.note)}</p>` : '';

  // --- Timestamp ---
  const fetchDate = new Date(payload.fetchedAt);
  const fetchStr = !isNaN(fetchDate.getTime()) ? fetchDate.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-GB') : '';
  const retrievedHTML = `<p class="isac-ac-retrieved">${t('Computed for', 'Calculé pour')} ${esc(payload.platform || '')} · ${esc(payload.identifier || '')}${fetchStr ? ' · ' + fetchStr : ''}</p>`;

  // --- Assemble ---
  $('#tab-anticheat').innerHTML = `
    <div class="isac-ac-head-row">
      <div class="isac-ac-head-left">${SI.shield}<h3 class="isac-ac-heading">${t('Anti-cheat analysis', 'Analyse anti-triche')}</h3></div>
      <button class="btn small" id="ac-recompute">${t('Recompute', 'Recalculer')}</button>
    </div>
    <div class="isac-ac-verdict-box ${verdictClass}">
      <svg class="isac-ac-verdict-icon" viewBox="0 0 24 24">
        ${verdictClass === 'legit'
          ? '<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/>'
          : verdictClass === 'suspect'
          ? '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/>'
          : '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>'}
      </svg>
      <div>
        <b class="isac-ac-verdict-heading">${esc(verdictHeading)}</b>
        <p class="isac-ac-verdict-desc">${verdictSub}</p>
      </div>
    </div>
    ${ruleBanner}
    <div class="isac-ac-row4">
      <div class="isac-ac-card">
        <span class="isac-ac-card-label">${t('Cheater Probability', 'Probabilité triche')}</span>
        <b class="isac-ac-card-val ${probColor(data.cheater_percentage)}">${fmtPct(data.cheater_percentage)}</b>
        <span class="isac-ac-card-sub">${esc(data.classification_tier || (verdictClass === 'legit' ? t('Cleared', 'Acquitté') : verdictLabel))}</span>
      </div>
      <div class="isac-ac-card">
        <span class="isac-ac-card-label">${t('Confidence Score', 'Score confiance')}</span>
        <b class="isac-ac-card-val">${fraction(data.confidence_score)}</b>
        <span class="isac-ac-card-sub">${t('Provider confidence', 'Confiance fournisseur')}</span>
      </div>
      <div class="isac-ac-card">
        <span class="isac-ac-card-label">${t('Model Score', 'Score modèle')}</span>
        <b class="isac-ac-card-val">${hasAdvisory ? fraction(advisory.score) : '—'}</b>
        <span class="isac-ac-card-sub">${advisory.advisory_only === true ? t('Advisory only', 'Consultatif') : t('Provider model score', 'Score modèle fournisseur')}</span>
      </div>
      <div class="isac-ac-card">
        <span class="isac-ac-card-label">${t('Headshots / hour', 'Headshots / heure')}</span>
        <b class="isac-ac-card-val">${fmtVal(data.headshotsPerHour)}</b>
        <span class="isac-ac-card-sub">${t('Primary rule input', 'Entrée règle primaire')}</span>
      </div>
    </div>
    <div class="isac-ac-row4">
      <div class="isac-ac-card"><span class="isac-ac-card-label">${t('Verdict', 'Verdict')}</span><b class="isac-ac-card-val">${esc(verdictRaw)}</b></div>
      <div class="isac-ac-card"><span class="isac-ac-card-label">${t('Action', 'Action')}</span><b class="isac-ac-card-val">${esc(data.action || '—')}</b></div>
      <div class="isac-ac-card"><span class="isac-ac-card-label">${t('Review Priority', 'Priorité examen')}</span><b class="isac-ac-card-val">${esc(data.review_priority || '—')}</b></div>
      <div class="isac-ac-card"><span class="isac-ac-card-label">${t('Deciding Stage', 'Étape décisive')}</span><b class="isac-ac-card-val">${numeric(data.stage) ? fmtVal(data.stage) : '—'}</b></div>
    </div>
    <div class="isac-ac-row4">
      <div class="isac-ac-card yn">${yesNo(data.scorable)}<span class="isac-ac-card-label">${t('Scorable', 'Évaluable')}</span></div>
      <div class="isac-ac-card yn">${yesNo(data.should_flag)}<span class="isac-ac-card-label">${t('Should Flag', 'À signaler')}</span></div>
      <div class="isac-ac-card yn">${yesNo(data.should_review)}<span class="isac-ac-card-label">${t('Should Review', 'À examiner')}</span></div>
      <div class="isac-ac-card yn">${yesNo(data.is_cheater)}<span class="isac-ac-card-label">${t('Is Cheater', 'Est tricheur')}</span></div>
    </div>
    ${modelSection}
    ${modelBar}
    ${caveatHTML}
    ${metricsHTML}
    ${noteHTML}
    ${retrievedHTML}
  `;
}

// ---- Main render ----
function render(response) {
  const d = response.data || response;
  const prov = d.providerData || {};
  const stats = prov.stats || d.stats || {};
  const combat = prov.combat || d.combat || {};
  _lastStats = stats;
  _lastCombat = combat;

  // Identity card
  const avatar = d.avatarUrl || prov.avatarUrl || '';
  $('#isac-avatar').src = avatar;
  $('#isac-avatar').alt = d.username || '';
  $('#isac-name').textContent = d.username || prov.username || 'Unknown';
  $('#isac-platform-sub').textContent = platformLabel(d.platform || prov.platform || platform);

  // Verdict in identity card
  const status = d.accountStatus || 'Unknown';
  const isCheater = d.isCheater || false;
  const isBoosted = d.isBoosted || false;
  let verdictClass = 'legit';
  if (isCheater) verdictClass = 'flagged';
  else if (isBoosted) verdictClass = 'suspect';
  else if (/suspect|flagged|under review/i.test(status)) verdictClass = 'suspect';
  else if (/banned|cheater/i.test(status)) verdictClass = 'flagged';

  const verdictEl = $('#isac-verdict');
  verdictEl.className = `isac-verdict-area ${verdictClass}`;
  verdictEl.innerHTML = `
    <svg class="isac-verdict-icon" viewBox="0 0 24 24">
      ${verdictClass === 'legit'
        ? '<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/>'
        : verdictClass === 'suspect'
        ? '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/>'
        : '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>'}
    </svg>
    <div>
      <b class="isac-verdict-heading">${esc(status)}</b>
      ${isBoosted ? `<span class="badge boosted">${t('Boosted', 'Boosté')}</span>` : ''}
      ${d.isCheaterCompanion ? `<span class="badge flagged-badge">${t('Cheater Companion', 'Compagnon de triche')}</span>` : ''}
    </div>
  `;

  // Merits
  const merits = d.merits || prov.merits || [];
  const meritsEl = $('#isac-merits');
  meritsEl.innerHTML = merits.length
    ? merits.map(m => `<span class="badge merit">${esc(m)}</span>`).join('')
    : `<span class="note">${t('No merits earned yet', 'Aucun mérite obtenu')}</span>`;

  // Quick stats bar — ProtoTrack layout: Total playtime / NPC kills / PvP kills / Skill kills
  $('#isac-quickstats').innerHTML = `
    <div class="isac-qs"><span class="isac-qs-label">${t('Total playtime', 'Temps de jeu total')}</span><b class="isac-qs-val accent">${stats.timePlayedFormatted || '—'}</b></div>
    <div class="isac-qs"><span class="isac-qs-label">${t('NPC kills', 'Élims PNJ')}</span><b class="isac-qs-val">${fmt(num(stats.killsNpc))}</b></div>
    <div class="isac-qs"><span class="isac-qs-label">${t('PvP kills', 'Élims PvP')}</span><b class="isac-qs-val">${fmt(num(stats.killsPvp))}</b></div>
    <div class="isac-qs"><span class="isac-qs-label">${t('Skill kills', 'Élims compétences')}</span><b class="isac-qs-val">${fmt(num(stats.sumSkillKills))}</b></div>
  `;

  // Reset tabs to Overview
  document.querySelectorAll('.isac-tab').forEach(t => {
    t.classList.remove('on');
    t.setAttribute('aria-selected', 'false');
  });
  const firstTab = document.querySelector('.isac-tab[data-tab="overview"]');
  firstTab.classList.add('on');
  firstTab.setAttribute('aria-selected', 'true');
  document.querySelectorAll('.isac-tab-panel').forEach(p => {
    p.hidden = true;
    p.classList.remove('active');
  });
  $('#tab-overview').hidden = false;
  $('#tab-overview').classList.add('active');

  // Render all tabs
  renderOverview(stats, combat);
  renderCombat(stats, combat);
  renderDarkZone(stats);
  renderProgression(stats);
  renderIsacProfile(prov);

  // Anti-cheat: fetch server-computed data via second request using Ubisoft identifier
  const acIdentifier = prov.identifier;
  if (acIdentifier) {
    renderAnticheatLoading();
    fetchIsacAnticheat(platform, acIdentifier)
      .then(acPayload => {
        renderAnticheat(acPayload);
        backfillCombatFromAC(acPayload);
        const acBtn = $('#ac-recompute');
        if (acBtn) acBtn.addEventListener('click', () => {
          // Clear cache and re-fetch
          try { sessionStorage.removeItem(`${CACHE_KEY}.ac:${platform}:${acIdentifier.toLowerCase()}`); } catch {}
          renderAnticheatLoading();
          fetchIsacAnticheat(platform, acIdentifier)
            .then(p => { renderAnticheat(p); backfillCombatFromAC(p); })
            .catch(e => { renderAnticheatError(e.message); });
        });
      })
      .catch(err => {
        console.error('[ISAC] Anti-cheat fetch failed:', err);
        renderAnticheatError(err.message);
        const retryBtn = $('#ac-recompute');
        if (retryBtn) retryBtn.addEventListener('click', () => {
          renderAnticheatLoading();
          fetchIsacAnticheat(platform, acIdentifier)
            .then(p => { renderAnticheat(p); backfillCombatFromAC(p); })
            .catch(e => { renderAnticheatError(e.message); });
        });
      });
  } else {
    $('#tab-anticheat').innerHTML = `
      <div class="isac-ac-head-row">
        <div class="isac-ac-head-left">${SI.shield}<h3 class="isac-ac-heading">${t('Anti-cheat analysis', 'Analyse anti-triche')}</h3></div>
      </div>
      <p class="note">${t('No Ubisoft identifier available — anti-cheat analysis requires a linked profile.', "Aucun identifiant Ubisoft disponible — l'analyse anti-triche nécessite un profil lié.")}</p>
    `;
  }

  // Footer timestamp
  const ts = response.fetchedAt || response.source || '';
  const footerNote = $('#isac-footer-note');
  if (footerNote && ts) {
    const d2 = new Date(ts);
    footerNote.textContent = `${t('Data fetched', 'Données récupérées le')} ${d2.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-US')}`;
  }
}

// ---- Search ----
const qInput = $('#isac-query');
const searchBtn = $('#isac-search');

async function doSearch() {
  const q = qInput.value.trim();
  if (!q) return;
  const resultsEl = $('#isac-results');
  // Ubisoft usernames: letters, digits, dots, hyphens, underscores, 1-50 chars
  if (!/^[\w.\-]{1,50}$/i.test(q)) {
    resultsEl.hidden = false;
    resultsEl.innerHTML = `<p class="note warn">${t(
      'Invalid username. Only letters, numbers, dots, hyphens and underscores are allowed.',
      'Nom d\'utilisateur invalide. Seuls les lettres, chiffres, points, tirets et underscores sont acceptés.'
    )}</p>`;
    return;
  }
  resultsEl.hidden = false;
  resultsEl.innerHTML = `<div class="isac-scanning"><div class="isac-scan-ring"></div><span>${t('Scanning agent…', 'Analyse en cours…')}</span></div>`;
  $('#isac-profile').hidden = true;
  $('#isac-empty').hidden = true;

  try {
    const response = await fetchIsac(q, platform);
    resultsEl.hidden = true;
    render(response);
    $('#isac-profile').hidden = false;
    $('#isac-profile').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error('[ISAC] Fetch failed:', err);
    let friendly;
    if (/not found|Player not found/i.test(err.message)) {
      friendly = t('Username not found. Check the spelling and platform.', 'Nom d\'utilisateur introuvable. Vérifiez l\'orthographe et la plateforme.');
    } else if (/unreachable|Unexpected response|upstream failed|isac lookup failed/i.test(err.message) || /^HTTP 50[0-9]/.test(err.message)) {
      friendly = t(
        'ISAC is temporarily unavailable. Updating — please try again later.',
        'ISAC est temporairement indisponible. Mise à jour en cours — réessayez plus tard.'
      );
    } else {
      friendly = `${t('Error: ', 'Erreur: ')}${esc(err.message)}`;
    }
    resultsEl.innerHTML = `<p class="note warn">${friendly}</p>`;
  }
}

searchBtn.addEventListener('click', doSearch);
qInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
