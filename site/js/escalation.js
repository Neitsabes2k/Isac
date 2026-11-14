// Weekly Escalation rotation: this week's missions, today's target loot and the vendor caches.
// data/escalation.json is rewritten by the GitHub Action (tools/update_escalation.py); the
// page reads it again with smart polling — fast after reset, slower otherwise.

import { dateLocale } from './i18n.js?v=4';
import { gearArt, slotArt, weaponArt } from './art.js';
import { loadCustom, loadSnapshot, finish } from './data.js';
import { readSheet } from './sheet.js';

const RESET_HOUR = 8; // daily reset, UTC
const REFRESH_NORMAL = 2 * 60000;   // 2 min when data is fresh
const REFRESH_STALE  = 15000;       // 15s when waiting for today's data
const REFRESH_STALE_MAX = 3 * 3600000; // stop fast-polling after 3 hours
const PROTO_CDN = 'https://prototrack.gg';

const SLOTS = [[/mask/i, 'mask'], [/backpack/i, 'backpack'], [/chest/i, 'chest'], [/glove/i, 'gloves'], [/holster/i, 'holster'], [/knee/i, 'kneepads']];
const WEAPONS = [[/assault|\bars?\b/i, 'ar'], [/smg|submachine/i, 'smg'], [/lmg|light machine/i, 'lmg'], [/mmr|marksman/i, 'mmr'],
  [/shotgun/i, 'shotgun'], [/pistol|sidearm/i, 'pistol'], [/rifle/i, 'rifle']];
const CORE = { offense: 'Weapon damage', defense: 'Armor', utility: 'Skill tier' };
const SLOT_NAMES = { mask: 'Mask', backpack: 'Backpack', chest: 'Chest', gloves: 'Gloves', holster: 'Holster', kneepads: 'Kneepads' };

let data = null, last = '', db = null, refreshTimer = null, staleStart = 0;

const $ = sel => document.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const two = n => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const date = (iso, year = true) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });

// The game's day runs from 08:00 UTC to 08:00 UTC.
const gameDay = now => new Date(now - RESET_HOUR * 3600000).toISOString().slice(0, 10);

function nextReset(now) {
  const d = new Date(now);
  const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESET_HOUR);
  return reset > now ? reset : reset + 86400000;
}

function lastReset(now) {
  const d = new Date(now);
  const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESET_HOUR);
  return reset <= now ? reset : reset - 86400000;
}

function isStale() {
  if (!data) return false;
  return data.date !== gameDay(Date.now());
}

// Smart refresh: fast after reset, normal otherwise
function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const interval = isStale() ? REFRESH_STALE : REFRESH_NORMAL;
  refreshTimer = setInterval(() => load().catch(() => {}), interval);
}

function cacheArt(cache) {
  if (cache.icon) return `<img class="esc-cache-icon" src="${esc(cache.icon)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
  const slot = SLOTS.find(([re]) => re.test(cache.item));
  if (slot) return slotArt(slot[1]);
  const type = WEAPONS.find(([re]) => re.test(cache.item));
  return type ? weaponArt({ name: '', type: type[1] }) : '';
}

function lootInfo(name) {
  if (!db) return null;
  const key = v => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = key(name);
  const same = x => key(x.name) === wanted || (wanted.length > 5 && (key(x.name).startsWith(wanted) || wanted.startsWith(key(x.name))));
  return db.gearsets.find(same) || db.brands.find(same) || null;
}

const lines = text => esc(text).replace(/\n/g, '<br>');
const talentHtml = (label, t) => (t ? `<div class="detail-talent"><span class="eyebrow">${label}</span><h4>${esc(t.name || '')}</h4><p class="note">${lines(t.text)}</p></div>` : '');

function details(name) {
  const item = lootInfo(name);
  if (!item) return `<p class="note">No details are on record for ${esc(name)}.</p>`;
  const named = db.gear.filter(g => g.quality === 'named' && g.brand === item.name);
  return `<p class="detail-kind"><span class="tag strong">${item.kind === 'gearset' ? 'Gear set' : 'Brand set'}</span><span class="tag">Core: ${CORE[item.core] || item.core}</span></p>
    <dl class="rows">${item.bonuses.filter(b => b.text).map(b => `<div><dt>${b.pieces} ${b.pieces === 1 ? 'piece' : 'pieces'}</dt><dd>${esc(b.text)}</dd></div>`).join('')}</dl>
    ${item.kind === 'gearset' ? talentHtml('4 pieces', item.four) + talentHtml('Chest talent', item.chest) + talentHtml('Backpack talent', item.backpack) : ''}
    ${named.length ? `<h3 class="detail-title">Named items</h3>${named.map(g => `<div class="detail-talent"><span class="eyebrow">${SLOT_NAMES[g.slot] || g.slot}</span><h4>${esc(g.name)}</h4>
      <p class="note">${g.talent ? `<b>${esc(g.talent.name)}</b><br>${lines(g.talent.text)}` : lines(g.perk || '')}</p></div>`).join('')}` : ''}`;
}

function open(name) {
  const dialog = $('#loot');
  dialog.innerHTML = `<div class="sheet-inner">
    <header class="sheet-head"><div class="loot">${gearArt({ name, slot: 'chest', quality: 'highend' })}<div><p class="eyebrow">Target loot</p><h2>${esc(name)}</h2></div></div>
      <button class="btn icon" data-close aria-label="Close">✕</button></header>
    <div class="sheet-body">${details(name)}</div>
  </div>`;
  if (!dialog.open) dialog.showModal();
}

function seenHtml(x) {
  const apps = x.appearances || 1;
  const seen = x.last_seen_days === null || x.last_seen_days === undefined
    ? 'First time'
    : x.last_seen_days === 1 ? 'Yesterday' : `${x.last_seen_days} days ago`;
  return `<div class="seen"><div><span class="eyebrow">Appearances</span><b>${apps} ${apps === 1 ? 'time' : 'times'}</b></div>
    <div><span class="eyebrow">Last seen</span><b class="when-seen">${seen}</b></div></div>`;
}

function factionIcon(m) {
  if (!m.factionIcon) return '';
  return `<img class="esc-faction-icon" src="${esc(m.factionIcon)}" alt="${esc(m.faction)}" loading="lazy" onerror="this.style.display='none'">`;
}

function lootIcon(m) {
  if (!m.lootIcon) return gearArt({ name: m.loot, slot: 'chest', quality: 'highend' });
  return `<img class="esc-loot-icon" src="${esc(m.lootIcon)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode(''))">`;
}

function render() {
  const now = Date.now();
  const stale = isStale();
  const updated = data.updated ? new Date(data.updated).toLocaleString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '—';

  // Track stale start for stopping fast-poll after 2 hours
  if (stale && !staleStart) staleStart = now;
  if (!stale) staleStart = 0;

  // If stale for too long, switch to normal polling
  if (stale && staleStart && (now - staleStart > REFRESH_STALE_MAX)) {
    scheduleRefresh();
  }

  $('#escalation').innerHTML = `
    <section class="panel season-head">
      <div class="esc-header-row">
        <div>
          <p class="eyebrow">Escalation</p>
          <h2 class="season-name">Weekly rotation · Target loot</h2>
          <p class="note">This week's Escalation missions, the loot each one targets today, and the Requisition vendor's daily caches.</p>
        </div>
        <button class="esc-refresh-btn" id="esc-refresh" title="Check for updates" aria-label="Check for updates">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
        </button>
      </div>
      <div class="info-bar">
        <div><span class="note">Loot date</span><b>${date(data.date)}</b></div>
        <div><span class="note">Rotation week</span><b>${date(data.week[0], false)} – ${date(data.week[1])}</b></div>
        <div><span class="note">Last updated</span><b>${esc(updated)} UTC</b></div>
        <div class="reset"><span class="note">Next reset · ${two(RESET_HOUR)}:00 UTC</span><b id="reset"></b></div>
      </div>
      ${stale ? `<div class="esc-stale-banner">
        <div class="esc-stale-dot"></div>
        <span>Waiting for today's target loot — showing ${date(data.date)}. Missions stay the same all week.</span>
      </div>` : ''}
    </section>
    <h2 class="section">Escalation missions <em>${two(data.missions.length)}</em></h2>
    <div class="rotation">${data.missions.map(m => `<article class="rotation-row">
      <div class="esc-mission">${factionIcon(m)}<div><span class="eyebrow">${esc(m.faction || 'Mission')}</span><h3>${esc(m.mission)}</h3></div></div>
      <button class="loot" data-loot="${esc(m.loot)}" title="Show what ${esc(m.loot)} gives">${lootIcon(m)}<span><span class="eyebrow">Target loot</span><h3>${esc(m.loot)}</h3></span></button>
      ${seenHtml(m)}
    </article>`).join('')}</div>
    ${data.caches.length ? `<h2 class="section">Escalation Requisition vendor <em>Daily caches</em></h2>
    <div class="caches">${data.caches.map(c => `<article class="rotation-row">
      <div class="loot">${cacheArt(c)}<div><span class="eyebrow">${esc(c.type)}</span><h3>${esc(c.item)}</h3></div></div>
      ${seenHtml(c)}
    </article>`).join('')}</div>` : ''}
    <p class="note">Missions change every Tuesday and target loot every day at ${two(RESET_HOUR)}:00 UTC. Select a target loot to see its bonuses. Confirm in game before spending tokens.</p>`;
  tick();
}

function tick() {
  if (!data) return;
  const now = Date.now(), left = Math.floor((nextReset(now) - now) / 1000), el = $('#reset');
  if (el) el.textContent = `${two(left / 3600)}:${two(left / 60 % 60)}:${two(left % 60)}`;

  // When the clock crosses the reset boundary, switch to fast polling and re-render
  const wasStale = !!document.querySelector('#escalation .esc-stale-banner');
  const nowStale = data.date !== gameDay(now);
  if (wasStale !== nowStale) {
    scheduleRefresh();
    render();
  }
}

async function load() {
  let response;
  try {
    // Live API: fetches ProtoTrack in real-time via Cloudflare Function
    response = await fetch('/api/escalation', { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status);
  } catch (_) {
    // Fallback to static file (updated by GitHub Action)
    response = await fetch('data/escalation.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('The rotation could not be read.');
  }
  const text = await response.text();
  const wasStale = isStale();
  if (text === last) return;
  last = text;
  data = JSON.parse(text);

  // If data just went from stale to fresh, show a brief notification
  if (wasStale && !isStale()) {
    scheduleRefresh(); // switch back to normal polling
  }

  render();
}

async function manualRefresh() {
  const btn = $('#esc-refresh');
  if (btn) btn.classList.add('spinning');
  try {
    await load();
  } catch (e) {
    // silently ignore
  } finally {
    if (btn) setTimeout(() => btn.classList.remove('spinning'), 600);
  }
}

document.addEventListener('click', e => {
  const loot = e.target.closest('[data-loot]');
  if (loot) open(loot.dataset.loot);
  if (e.target.closest('[data-close]') || e.target.id === 'loot') $('#loot').close();
  if (e.target.closest('#esc-refresh')) manualRefresh();
});

// Game data feeds the pop-up; the page does not wait for it.
Promise.all([loadCustom(), loadSnapshot()]).then(([custom, snapshot]) => { db = finish(readSheet(snapshot), custom); }).catch(console.error);

load().then(() => {
  setInterval(tick, 1000);
  scheduleRefresh();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) load().catch(() => {});
  });
}).catch(err => {
  $('#escalation').innerHTML = `<section class="panel"><h2>The rotation could not be loaded</h2><p class="note">${esc(err.message)}</p></section>`;
});
