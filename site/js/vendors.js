// language: JavaScript, file: js/vendors.js, target: ES2020 module
// Division 2 vendor inventory — ProtoTrack public API, ProtoTrack-style UI

/* ---- i18n (shared engine translates static HTML + MutationObserver) ---- */
import './i18n.js?v=4';
const L = () => document.documentElement.dataset.lang || 'en';
const t = (en, fr) => L() === 'fr' ? fr : en;
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const fmt = n => { const v = Number(n); return isNaN(v) ? String(n) : v.toLocaleString('en-US'); };

/* ---- ProtoTrack public API ---- */
const API = 'https://prototrack.gg/api/vendor-reset-public.php';

/* ---- vendor key mapping (API id → internal key) ---- */
const VENDOR_META = [
  { key: '__all__',  en: 'Weekly Overview',  fr: 'Aperçu hebdo',    loc: '',                        dz: false },
  { key: 'wh',      en: 'White House',       fr: 'Maison-Blanche',  loc: 'DC',                      dz: false, match: 'White House' },
  { key: 'cd',      en: 'Countdown',         fr: 'Countdown',       loc: 'DC',                      dz: false, match: 'Countdown' },
  { key: 'clan',    en: 'Clan',              fr: 'Clan',            loc: 'DC',                      dz: false, match: 'Clan' },
  { key: 'theater', en: 'Theater',           fr: 'Le Théâtre',      loc: 'DC',                      dz: false, match: 'Theater' },
  { key: 'campus',  en: 'Campus',            fr: 'Le Campus',       loc: 'DC',                      dz: false, match: 'Campus' },
  { key: 'castle',  en: 'Castle',            fr: 'Castle',          loc: 'DC',                      dz: false, match: 'Castle' },
  { key: 'dze',     en: 'Dark Zone East',    fr: 'DZ Est',          loc: t('Dark Zone', 'DZ'),      dz: true,  match: 'Dark Zone East' },
  { key: 'dzw',     en: 'Dark Zone West',    fr: 'DZ Ouest',        loc: t('Dark Zone', 'DZ'),      dz: true,  match: 'Dark Zone West' },
  { key: 'dzs',     en: 'Dark Zone South',   fr: 'DZ Sud',          loc: t('Dark Zone', 'DZ'),      dz: true,  match: 'Dark Zone South' },
  { key: 'haven',   en: 'Haven',             fr: 'Haven',           loc: 'NYC',                     dz: false, match: 'Haven' },
  { key: 'benitez', en: 'Roy Benitez',       fr: 'Roy Benitez',     loc: 'DC',                      dz: false, match: 'Roy Benitez' },
  { key: 'bridge',  en: 'Bridge',            fr: 'Bridge',          loc: 'Brooklyn',                dz: false, match: 'Bridge' },
  { key: 'cassie',  en: 'Cassie Mendoza',    fr: 'Cassie Mendoza',  loc: t('Roaming', 'Itinérant'), dz: false, match: 'Cassie Mendoza' },
  { key: 'danny',   en: 'Danny Weaver',      fr: 'Danny Weaver',    loc: t('Special', 'Spécial'),   dz: false, match: 'Danny Weaver' },
];

/* ---- bar color from roll category ---- */
function barColor(cat) {
  if (cat === 'offensive') return 'red';
  if (cat === 'defensive') return 'blue';
  return 'yellow';
}

/* ---- state ---- */
let allOffers = [];   // flat array of offers, each with _vendorKey, _vendorName, _region
let activeVendor = '__all__';
let activeType = 'all';
let searchQuery = '';
let mustBuyOnly = false;

/* ---- DOM refs ---- */
const $loading       = document.getElementById('vendor-loading');
const $error         = document.getElementById('vendor-error');
const $errorMsg      = document.getElementById('vendor-error-msg');
const $grid          = document.getElementById('vendor-grid');
const $noResults     = document.getElementById('vendor-no-results');
const $countdown     = document.getElementById('vendor-countdown');
const $search        = document.getElementById('vendor-search');
const $typeSelect    = document.getElementById('vendor-type-select');
const $mustBuy       = document.getElementById('vendor-must-buy');
const $viewTitle     = document.getElementById('vdr-view-title');
const $offerCount    = document.getElementById('vdr-offer-count');
const $sidebarNav    = document.getElementById('vdr-sidebar-nav');
const $sidebar       = document.getElementById('vdr-sidebar');
const $sidebarToggle = document.getElementById('vdr-sidebar-toggle');

/* ---- reset timer ---- */
function nextReset() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 10, 0, 0));
  const day = d.getUTCDay();
  const daysUntil = (2 - day + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntil);
  if (d <= now) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

function updateCountdown() {
  if (!$countdown) return;
  const diff = nextReset() - Date.now();
  if (diff <= 0) { $countdown.textContent = t('Resetting…', 'Réinitialisation…'); return; }
  const days = Math.floor(diff / 86400000);
  const hrs  = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const p = [];
  if (days > 0) p.push(`<b>${days}</b><i>${t('d', 'j')}</i>`);
  p.push(`<b>${String(hrs).padStart(2, '0')}</b><i>h</i>`);
  p.push(`<b>${String(mins).padStart(2, '0')}</b><i>m</i>`);
  p.push(`<b>${String(secs).padStart(2, '0')}</b><i>s</i>`);
  $countdown.innerHTML = p.join(' ');
}
setInterval(updateCountdown, 1000);
updateCountdown();

/* ---- current reset week (most recent Tuesday 10:00 UTC) ---- */
function currentWeek() {
  const now = new Date();
  // Reset happens Tuesday 10:00 UTC — before that, the previous week is still active
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  if (d.getUTCDay() === 2 && d.getUTCHours() < 10) d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ---- fetch from ProtoTrack ---- */
async function fetchVendorData() {
  try {
    const week = currentWeek();
    const resp = await fetch(`${API}?mode=week&week=${encodeURIComponent(week)}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json.success) throw new Error('API returned error');

    const data = json.data;
    allOffers = [];

    for (const vendor of data.vendors) {
      // find matching vendor meta
      const meta = VENDOR_META.find(m => m.match === vendor.name);
      const vendorKey = meta ? meta.key : vendor.name.toLowerCase().replace(/\s+/g, '');

      for (const offer of vendor.offers) {
        offer._vendorKey = vendorKey;
        offer._vendorName = vendor.name;
        offer._region = vendor.region || '';
        allOffers.push(offer);
      }
    }

    $loading.hidden = true;
    buildSidebar();
    renderCards();
  } catch (err) {
    $loading.hidden = true;
    $error.hidden = false;
    $errorMsg.textContent = t(
      'Failed to load vendor data. Try refreshing the page.',
      'Impossible de charger les données. Essayez de rafraîchir la page.'
    );
    console.error('Vendor fetch error:', err);
  }
}

/* ---- sidebar builder ---- */
function buildSidebar() {
  if (!$sidebarNav) return;

  const vendorCounts = new Map();
  for (const o of allOffers) {
    vendorCounts.set(o._vendorKey, (vendorCounts.get(o._vendorKey) || 0) + 1);
  }

  let html = '';
  for (const v of VENDOR_META) {
    const name = L() === 'fr' ? v.fr : v.en;
    const isAll = v.key === '__all__';
    const count = isAll ? allOffers.length : (vendorCounts.get(v.key) || 0);
    if (!isAll && count === 0) continue;
    const activeCls = activeVendor === v.key ? ' active' : '';
    const dzCls = v.dz ? ' dz' : '';
    const locTag = v.loc ? `<span class="vdr-sidebar-btn-loc">${esc(v.loc)}</span>` : '';
    html += `<button class="vdr-sidebar-btn${activeCls}${dzCls}" data-vendor="${esc(v.key)}">
      <div class="vdr-sidebar-btn-top">
        <span class="vdr-sidebar-btn-name">${esc(name)}</span>
        ${locTag}
      </div>
      <span class="vdr-sidebar-btn-sub">${count} ${t('items', 'objets')}</span>
    </button>`;
  }

  $sidebarNav.innerHTML = html;

  $sidebarNav.querySelectorAll('.vdr-sidebar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeVendor = btn.dataset.vendor;
      $sidebarNav.querySelectorAll('.vdr-sidebar-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCards();
      if ($sidebar) $sidebar.classList.remove('open');
    });
  });
}

/* ---- filtering ---- */
function getFiltered() {
  let items = allOffers;

  if (activeVendor !== '__all__') {
    items = items.filter(i => i._vendorKey === activeVendor);
  }

  if (activeType !== 'all') {
    items = items.filter(i => i.type === activeType);
  }

  if (mustBuyOnly) {
    items = items.filter(i => i.mustBuy);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i => {
      const parts = [
        i.name, i._vendorName, i.brand, i.slot, i.talent,
        ...i.rolls.map(r => r.name)
      ].filter(Boolean).join(' ').toLowerCase();
      return parts.includes(q);
    });
  }

  return items;
}

/* ---- render cards ---- */
function renderCards() {
  const filtered = getFiltered();
  const mustBuyItems = filtered.filter(i => i.mustBuy);
  const regularItems = filtered.filter(i => !i.mustBuy);

  if ($viewTitle) {
    if (activeVendor === '__all__') {
      $viewTitle.textContent = t('Weekly Overview', 'Aperçu hebdomadaire');
    } else {
      const vdef = VENDOR_META.find(v => v.key === activeVendor);
      $viewTitle.textContent = vdef ? (L() === 'fr' ? vdef.fr : vdef.en) : activeVendor;
    }
  }

  if ($offerCount) {
    $offerCount.textContent = `${filtered.length} ${t('items', 'objets')}`;
  }

  if (filtered.length === 0 && allOffers.length > 0) {
    $grid.innerHTML = '';
    $noResults.hidden = false;
    return;
  }
  $noResults.hidden = true;

  let html = '';

  // Must Buy section
  if (mustBuyItems.length > 0 && !mustBuyOnly) {
    html += `<div class="vdr-section-header">
      <span class="vdr-section-icon">🔥</span>
      <span class="vdr-section-title">${t('Must Buy', 'À acheter')}</span>
      <span class="vdr-section-count">${mustBuyItems.length} ${t('items', 'objets')}</span>
    </div>`;
    html += `<div class="vdr-grid-section">`;
    for (const item of mustBuyItems) html += renderCard(item, true);
    html += `</div>`;

    html += `<div class="vdr-section-header vdr-section-header--regular">
      <span class="vdr-section-title">${t('All Items', 'Tous les objets')}</span>
      <span class="vdr-section-count">${regularItems.length} ${t('items', 'objets')}</span>
    </div>`;
    html += `<div class="vdr-grid-section">`;
    for (const item of regularItems) html += renderCard(item, false);
    html += `</div>`;
  } else {
    html += `<div class="vdr-grid-section">`;
    for (const item of filtered) html += renderCard(item, item.mustBuy);
    html += `</div>`;
  }

  $grid.innerHTML = html;
  bindCardEvents();
}

const PROTO_CDN = 'https://prototrack.gg';

/* ---- card renderer ---- */
function renderCard(offer, showMustBuy) {
  const isGear   = offer.type === 'gear';
  const isWeapon = offer.type === 'weapon';
  const isMod    = offer.type === 'mod';
  const isCache  = offer.type === 'cache';

  // rarity badge
  let badgeHtml = '';
  let nameColor = '--he';
  if (showMustBuy) {
    badgeHtml = `<span class="vdr-card-badge vdr-must-buy-badge">${t('Must Buy', 'À acheter')}</span>`;
  } else if (offer.gearSet) {
    badgeHtml = `<span class="vdr-card-badge q-gearset">${t('Gear Set', 'Set')}</span>`;
    nameColor = '--ok';
  } else if (offer.isNamed) {
    badgeHtml = `<span class="vdr-card-badge q-named">${t('Named', 'Nommé')}</span>`;
  } else if (isGear || isWeapon) {
    badgeHtml = `<span class="vdr-card-badge q-he">${t('High-End', 'Supérieur')}</span>`;
  }

  // sub-info
  const subParts = [];
  if (isGear) {
    if (offer.slot) subParts.push(offer.slot);
    if (offer.brand) subParts.push(offer.brand);
  } else if (isWeapon) {
    if (offer.slot) subParts.push(offer.slot);
  } else if (isMod) {
    if (offer.slot) subParts.push(offer.slot);
  } else if (isCache) {
    subParts.push(offer.slot || t('Cache', 'Cache'));
  }

  // icons
  const itemIcon = offer.icon ? `<img class="vdr-card-icon" src="${PROTO_CDN}${esc(offer.icon)}" alt="" loading="lazy">` : '';
  const brandIconHtml = offer.brandIcon ? `<img class="vdr-card-brand-icon" src="${PROTO_CDN}${esc(offer.brandIcon)}" alt="" loading="lazy">` : '';

  let h = `<div class="vdr-card${showMustBuy ? ' vdr-card--must-buy' : ''}">`;

  // ---- HEAD ----
  h += `<div class="vdr-card-head">
    <div class="vdr-card-head-left">
      ${itemIcon}
      <div class="vdr-card-head-text">
        <span class="vdr-card-name" style="color:var(${nameColor})">${esc(offer.name || '—')}</span>
        <span class="vdr-card-type">${esc(subParts.join(' · '))}</span>
      </div>
    </div>
    <div class="vdr-card-head-right">
      ${brandIconHtml}
      ${badgeHtml}
    </div>
  </div>`;

  // ---- BODY ----
  h += `<div class="vdr-card-body">`;

  // rolls (core + attributes)
  for (const roll of offer.rolls) {
    // skip non-stat rolls like purchase limits
    if (roll.attributeId === 'cache-purchase-limit') continue;

    const label = roll.name || roll.attributeId;
    const val = roll.value;
    const max = roll.max;
    const unit = roll.unit || '';
    const color = barColor(roll.category);
    const pct = max ? Math.min(Math.round((val / max) * 100), 100) : 50;
    const valStr = val != null ? String(val) : '';
    const maxStr = max ? `${t('Library max', 'Max biblio')} ${max}${unit}` : '';
    const pctOfMax = max && val != null ? ` · ${pct}% ${t('of max', 'du max')}` : '';

    h += `<div class="vdr-stat-row">
      <div class="vdr-stat-top">
        <span class="vdr-stat-label">${esc(label)}</span>
        <span class="vdr-stat-val ${color}">${esc(valStr)}${esc(unit)}</span>
      </div>
      <div class="vdr-stat-bar ${color}"><i style="width:${pct}%"></i></div>
      ${maxStr ? `<div class="vdr-stat-meta">${esc(maxStr)}${pctOfMax}</div>` : ''}
    </div>`;
  }

  // talent
  if (offer.talent) {
    h += `<div class="vdr-card-talent">
      <span class="vdr-talent-icon">★</span>
      <div class="vdr-talent-text">
        <span class="vdr-talent-name">${esc(offer.talent)}</span>
        ${offer.talentDescription ? `
          <button class="vdr-talent-desc-toggle">▶ ${t('Talent description', 'Description du talent')}</button>
          <div class="vdr-talent-desc">${esc(offer.talentDescription)}</div>
        ` : ''}
      </div>
    </div>`;
  }

  // price
  if (offer.price) {
    const currencyLabel = offer.currency || t('Credits', 'Crédits');
    h += `<div class="vdr-card-price">
      <span class="vdr-price-label">${t('Price', 'Prix')}</span>
      <span class="vdr-price-val">${fmt(offer.price)} ${esc(currencyLabel)}</span>
    </div>`;
  }

  // expertise badge
  if (offer.expertise) {
    h += `<div class="vdr-card-expertise">${t('Expertise', 'Expertise')}</div>`;
  }

  // weapon base values
  const wr = offer.weaponReference;
  if (wr) {
    h += `<div class="vdr-card-extra">
      <button class="vdr-extra-toggle">▶ ${t('Weapon base values', 'Valeurs de base')}</button>
      <div class="vdr-extra-content">
        <div class="vdr-base-row"><span>${t('Base damage', 'Dégâts de base')}</span><span>${fmt(wr.baseDamage)}</span></div>
        <div class="vdr-base-row"><span>${t('Base RPM', 'Cadence de tir')}</span><span>${fmt(wr.baseRpm)}</span></div>
        <div class="vdr-base-row"><span>${t('Base magazine', 'Chargeur')}</span><span>${fmt(wr.baseMagazine)}</span></div>
        <div class="vdr-base-row"><span>${t('Base reload (s)', 'Rechargement (s)')}</span><span>${wr.reloadSeconds}</span></div>
        <div class="vdr-base-row"><span>${t('Optimal range (m)', 'Portée optimale (m)')}</span><span>${wr.optimalRange}</span></div>
      </div>
    </div>`;
  }

  // set bonuses
  if (offer.setBonuses && offer.setBonuses.length > 0) {
    let bonusRows = '';
    for (const b of offer.setBonuses) {
      bonusRows += `<div class="vdr-base-row"><span>${esc(b.label)}</span><span>${esc(b.value)}</span></div>`;
    }
    h += `<div class="vdr-card-extra">
      <button class="vdr-extra-toggle">▶ ${t('Set bonuses', 'Bonus de set')}</button>
      <div class="vdr-extra-content">${bonusRows}</div>
    </div>`;
  }

  h += `</div>`; // end card-body

  // ---- FOOTER ----
  const vendorDisplay = (() => {
    const vdef = VENDOR_META.find(v => v.key === offer._vendorKey);
    if (vdef) return L() === 'fr' ? vdef.fr : vdef.en;
    return offer._vendorName || offer._vendorKey;
  })();
  h += `<div class="vdr-card-foot">
    <button class="vdr-card-vendor-btn" data-goto-vendor="${esc(offer._vendorKey)}">${t('View at', 'Voir chez')} ${esc(vendorDisplay)}</button>
  </div>`;

  h += `</div>`; // end card
  return h;
}

/* ---- bind card events ---- */
function bindCardEvents() {
  // talent toggles
  $grid.querySelectorAll('.vdr-talent-desc-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const desc = btn.parentElement.querySelector('.vdr-talent-desc');
      if (desc) {
        const open = desc.classList.toggle('open');
        btn.textContent = open
          ? `▼ ${t('Hide description', 'Masquer')}`
          : `▶ ${t('Talent description', 'Description du talent')}`;
      }
    });
  });

  // extra section toggles (weapon base values, set bonuses)
  $grid.querySelectorAll('.vdr-extra-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      if (content) {
        const open = content.classList.toggle('open');
        const label = btn.textContent.slice(2); // remove arrow
        btn.textContent = (open ? '▼' : '▶') + ' ' + label.trim();
      }
    });
  });

  // "View at [vendor]" buttons
  $grid.querySelectorAll('.vdr-card-vendor-btn[data-goto-vendor]').forEach(btn => {
    btn.addEventListener('click', () => {
      const vKey = btn.dataset.gotoVendor;
      activeVendor = vKey;
      $sidebarNav.querySelectorAll('.vdr-sidebar-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.vendor === vKey);
      });
      renderCards();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

/* ---- events: type filter ---- */
if ($typeSelect) {
  $typeSelect.addEventListener('change', () => {
    activeType = $typeSelect.value;
    renderCards();
  });
}

/* ---- events: must buy filter ---- */
if ($mustBuy) {
  $mustBuy.addEventListener('change', () => {
    mustBuyOnly = $mustBuy.checked;
    renderCards();
  });
}

/* ---- events: search ---- */
let searchTimer;
if ($search) {
  $search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = $search.value.trim();
      renderCards();
    }, 200);
  });
}

/* ---- events: mobile sidebar toggle ---- */
if ($sidebarToggle && $sidebar) {
  $sidebarToggle.addEventListener('click', () => {
    $sidebar.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if ($sidebar.classList.contains('open') &&
        !$sidebar.contains(e.target) &&
        !$sidebarToggle.contains(e.target)) {
      $sidebar.classList.remove('open');
    }
  });
}

/* ---- init ---- */
fetchVendorData();
