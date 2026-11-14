// Parses game-data CSVs and merges them into the planner's data.

import { parseTable } from './csv.js';
import { statKey, norm, normName, STATS } from './stats.js';

// ---- stat ID mapping ----
// div2hub uses kebab-case IDs like "critical-hit-chance"; the planner uses snake_case keys
// like "chc". Most map through the existing statKey() alias table, but a few need explicit overrides.

const STAT_MAP = {
  'health-damage':         'dth',
  'dtoc':                  'ooc',
  'total-armor':           'armor_pct',
  'increased-threat':      'x_increased_threat',
  'reduced-threat':        'x_reduced_threat',
  'electronic-damage':     'x_electronic_damage',
  'scanner-pulse-haste':   'x_scanner_pulse_haste',
  'outgoing-healing':      'x_outgoing_healing',
  'damage-resistance':     'x_damage_resistance',
  'burn-resistance':       'x_burn_resistance',
  'bleed-resistance':      'x_bleed_resistance',
  'shock-resistance':      'x_shock_resistance',
  'blind-deaf-resistance': 'x_blind_deaf_resistance',
  'disorient-resistance':  'x_disorient_resistance',
  'ensnare-resistance':    'x_ensnare_resistance',
};

// Register display names for the new x_ stats so they show up properly.
const EXTRA_STATS = {
  x_increased_threat:      ['Increased Threat', '%', 'other'],
  x_reduced_threat:        ['Reduced Threat', '%', 'other'],
  x_electronic_damage:     ['Electronic Damage', '%', 'skill'],
  x_scanner_pulse_haste:   ['Scanner Pulse Haste', '%', 'skill'],
  x_outgoing_healing:      ['Outgoing Healing', '%', 'skill'],
  x_damage_resistance:     ['Damage Resistance', '%', 'defense'],
  x_burn_resistance:       ['Burn Resistance', '%', 'defense'],
  x_bleed_resistance:      ['Bleed Resistance', '%', 'defense'],
  x_shock_resistance:      ['Shock Resistance', '%', 'defense'],
  x_blind_deaf_resistance: ['Blind/Deaf Resistance', '%', 'defense'],
  x_disorient_resistance:  ['Disorient Resistance', '%', 'defense'],
  x_ensnare_resistance:    ['Ensnare Resistance', '%', 'defense'],
};

function ensureExtraStats() {
  for (const [key, def] of Object.entries(EXTRA_STATS)) {
    if (!STATS[key]) STATS[key] = def;
  }
}

// Convert a div2hub stat ID to the planner's stat key.
function mapStat(id, isPercent = true) {
  if (!id) return null;
  if (STAT_MAP[id]) return STAT_MAP[id];
  // Try turning "critical-hit-chance" into "critical hit chance" and running through statKey().
  const label = id.replace(/-/g, ' ');
  return statKey(label, isPercent);
}

// Parse a value string like "15%", "170000", "1.5" into a number and whether it's a percentage.
function parseVal(s) {
  const t = String(s || '').trim();
  const pct = t.endsWith('%');
  const v = parseFloat(t.replace('%', '').replace(/,/g, ''));
  return { value: isNaN(v) ? 0 : v, pct };
}

// ---- attribute enrichment ----
// div2hub/attributes.csv has: id, stat_id, range_min, range_max, proto_max, compatibility, category, fidelity
// We extract proto_max values and named-item fixed attributes.

function readDiv2Attributes(rows) {
  const weaponCores = [];     // weapon core attribute ranges
  const weaponMinors = [];    // weapon minor attribute ranges
  const gearCores = [];       // gear core ranges
  const gearMinors = [];      // gear minor attribute ranges
  const gearMods = [];        // gear mod ranges
  const namedAttrs = [];      // named item fixed attributes

  for (const row of rows) {
    const id = row.id || '';
    const statId = row.stat_id || '';
    const { value: rangeMax, pct } = parseVal(row.range_max);
    const { value: protoMax } = parseVal(row.proto_max);
    const compat = row.compatibility || '';
    const stat = mapStat(statId, pct);
    if (!stat || isNaN(rangeMax)) continue;

    const proto = protoMax > rangeMax ? protoMax : null;

    if (compat.includes('weapon-minor')) {
      weaponMinors.push({ stat, max: rangeMax, proto });
    } else if (id.endsWith('-weapon-core')) {
      weaponCores.push({ stat, max: rangeMax, proto });
    } else if (compat.includes('gear-core')) {
      const core = stat === 'armor' ? 'defense' : stat === 'skill_tier' ? 'utility' : 'offense';
      gearCores.push({ core, stat, max: rangeMax, proto });
    } else if (compat.includes('gear-minor')) {
      const color = /offensive/.test(row.category) ? 'offense' : /defensive/.test(row.category) ? 'defense' : 'utility';
      gearMinors.push({ stat, max: rangeMax, color, proto });
    } else if (compat.includes('gear-mod')) {
      const color = /offensive/.test(row.category) ? 'offense' : /defensive/.test(row.category) ? 'defense' : 'utility';
      gearMods.push({ stat, max: rangeMax, color });
    } else if (compat === 'N/A' && !id.endsWith('-weapon-core')) {
      // Named item fixed attribute: id like "dtoc-foxs-prayer", "damage-to-armor-contractors-gloves"
      // Extract the item name from the ID by removing the stat prefix.
      const prefix = statId + '-';
      const itemSlug = id.startsWith(prefix) ? id.slice(prefix.length) : '';
      if (itemSlug) {
        namedAttrs.push({
          slug: itemSlug,
          stat,
          max: rangeMax,
          proto,
        });
      }
    }
  }

  return { weaponCores, weaponMinors, gearCores, gearMinors, gearMods, namedAttrs };
}

// ---- talent descriptions ----

function readDiv2Talents(rows) {
  const out = new Map();
  for (const row of rows) {
    const name = (row.name || '').trim();
    const desc = (row.description || '').trim();
    const compat = (row.compatibility || '').trim();
    if (!name || !desc) continue;
    out.set(norm(name), { name, text: desc, compatibility: compat });
  }
  return out;
}

// ---- brand sets ----
// Format: name, default_core_stat_id, 1pc_bonus, 2pc_bonus, 3pc_bonus
// Bonuses are like "stat:protection-from-elites:12%"

function parseBonusStat(s) {
  const t = String(s || '').trim();
  if (!t || t === 'N/A') return [];
  // Can be pipe-separated: "stat:a:val|stat:b:val"
  return t.split('|').map(part => {
    const m = part.match(/^(?:stat:)?([^:]+):(.+)$/);
    if (!m) return null;
    const { value, pct } = parseVal(m[2]);
    const stat = mapStat(m[1], pct);
    return stat ? [stat, value] : null;
  }).filter(Boolean);
}

function readDiv2BrandSets(rows) {
  const out = new Map();
  for (const row of rows) {
    const name = (row.name || '').trim();
    if (!name || name === 'Improvised') continue;
    out.set(norm(name), {
      name,
      core: row.default_core_stat_id === 'armor' ? 'defense' : row.default_core_stat_id === 'skill-tier' ? 'utility' : 'offense',
      bonuses: [
        { pieces: 1, effects: parseBonusStat(row['1pc_bonus']) },
        { pieces: 2, effects: parseBonusStat(row['2pc_bonus']) },
        { pieces: 3, effects: parseBonusStat(row['3pc_bonus']) },
      ],
    });
  }
  return out;
}

// ---- gear sets ----
// Format: name, default_core_stat_id, 1pc_bonus, 2pc_bonus, 3pc_bonus, 4pc_bonus
// 4pc is "talent:TalentName", bonuses have pipe-separated alternatives

function readDiv2GearSets(rows) {
  const out = new Map();
  for (const row of rows) {
    const name = (row.name || '').trim();
    if (!name) continue;
    const four = (row['4pc_bonus'] || '').trim();
    const talentMatch = four.match(/^talent:(.+)$/);
    out.set(norm(name), {
      name,
      core: row.default_core_stat_id === 'armor' ? 'defense' : row.default_core_stat_id === 'skill-tier' ? 'utility' : 'offense',
      bonuses: [
        { pieces: 2, effects: parseBonusStat(row['2pc_bonus']) },
        { pieces: 3, effects: parseBonusStat(row['3pc_bonus']) },
      ],
      fourTalent: talentMatch ? talentMatch[1] : '',
    });
  }
  return out;
}

// ---- weapon mods ----
// Format: name, category, compatibility, stats
// stats like "headshot-damage:30%" or "headshot-damage:45%|critical-hit-damage:-5%"

function readDiv2WeaponMods(rows) {
  const out = new Map();
  for (const row of rows) {
    const name = (row.name || '').trim();
    if (!name) continue;
    const effects = parseBonusStat(row.stats);
    const slot = ({ optics: 'optic', magazine: 'magazine', muzzle: 'muzzle', underbarrel: 'underbarrel' })[row.category] || row.category;
    out.set(norm(name), { name, slot, compatibility: row.compatibility || '', effects });
  }
  return out;
}

// ---- stat display names ----

function readDiv2Stats(rows) {
  const out = new Map();
  for (const row of rows) {
    const id = (row.id || '').trim();
    const name = (row.name || '').trim();
    if (id && name) out.set(id, name);
  }
  return out;
}

// ---- loading ----

async function get(url, ms = 10000) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), ms);
  try {
    const res = await fetch(url, { signal: control.signal });
    if (!res.ok) throw new Error(`${res.status} for ${url}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

export async function loadDiv2Hub() {
  try {
    ensureExtraStats();
    const files = ['attributes', 'stats', 'brand_sets', 'gear_sets', 'gear_mods',
      'gear_talents', 'weapon_talents', 'weapon_mods', 'augments'];
    const texts = {};
    await Promise.all(files.map(async f => {
      try { texts[f] = await get(`data/div2hub/${f}.csv`); }
      catch { texts[f] = ''; }
    }));

    const parse = key => parseTable(texts[key] || '');
    return {
      attributes: readDiv2Attributes(parse('attributes')),
      statNames: readDiv2Stats(parse('stats')),
      brandSets: readDiv2BrandSets(parse('brand_sets')),
      gearSets: readDiv2GearSets(parse('gear_sets')),
      gearTalents: readDiv2Talents(parse('gear_talents')),
      weaponTalents: readDiv2Talents(parse('weapon_talents')),
      weaponMods: readDiv2WeaponMods(parse('weapon_mods')),
      gearMods: parse('gear_mods'),
      augments: parse('augments'),
    };
  } catch (err) {
    console.warn('div2hub game data not loaded.', err);
    return null;
  }
}

// ---- merging into the planner's db ----

// Enrich the sheet's attribute ranges with div2hub proto values where the sheet is missing them.
function mergeAttributes(sheetAttrs, hubAttrs) {
  const A = sheetAttrs;

  // Weapon core proto.
  const hubWC = hubAttrs.weaponCores.find(c => c.stat === 'weapon_damage' || c.stat === 'ar_damage');
  if (hubWC?.proto && !A.weaponCoreProto) A.weaponCoreProto = hubWC.proto;

  // Weapon class attributes (HSD, CHC, etc.) — fill proto where missing.
  for (const hub of hubAttrs.weaponCores) {
    for (const [type, cls] of Object.entries(A.classes)) {
      if (cls.stat === hub.stat && hub.proto && !cls.proto) cls.proto = hub.proto;
    }
  }

  // Weapon minors.
  for (const hub of hubAttrs.weaponMinors) {
    const entry = A.weaponMinors.find(a => a.stat === hub.stat);
    if (entry && hub.proto && !entry.proto) entry.proto = hub.proto;
    // If the sheet is missing this minor entirely, add it.
    if (!entry && hub.max) A.weaponMinors.push({ stat: hub.stat, max: hub.max, proto: hub.proto });
  }

  // Gear cores.
  for (const hub of hubAttrs.gearCores) {
    const entry = A.cores[hub.core];
    if (entry && hub.proto && !entry.proto) entry.proto = hub.proto;
  }

  // Gear minors.
  for (const hub of hubAttrs.gearMinors) {
    const entry = A.gearMinors.find(a => a.stat === hub.stat);
    if (entry && hub.proto && !entry.proto) entry.proto = hub.proto;
    if (!entry && hub.max) A.gearMinors.push({ stat: hub.stat, max: hub.max, color: hub.color, proto: hub.proto });
  }

  // Gear mods — the sheet often has fewer mod types than div2hub.
  for (const hub of hubAttrs.gearMods) {
    const entry = A.gearMods.find(a => a.stat === hub.stat);
    if (!entry && hub.max) A.gearMods.push({ stat: hub.stat, max: hub.max, color: hub.color });
  }
}

// Match named item attribute data from div2hub to named/exotic items in the db.
// The slug in div2hub is like "foxs-prayer" or "contractors-gloves"; we try fuzzy matching.
function mergeNamedAttributes(db, namedAttrs) {
  for (const na of namedAttrs) {
    const slug = na.slug.replace(/-/g, '');
    // Search weapons and gear for a matching item.
    const match = db.gear.find(g => normName(g.name).replace(/[^a-z0-9]/g, '') === slug)
      || db.weapons.find(w => normName(w.name).replace(/[^a-z0-9]/g, '') === slug);
    if (!match) continue;

    // Store enriched attribute info on the item for use in resolveGear/weaponAttributes.
    if (!match._hubAttrs) match._hubAttrs = [];
    match._hubAttrs.push({ stat: na.stat, max: na.max, proto: na.proto });
  }
}

// Fill in talent descriptions from div2hub where the sheet has none or shorter text.
function mergeTalents(sheetTalents, hubTalents) {
  for (const talent of sheetTalents) {
    const hub = hubTalents.get(norm(talent.name));
    if (!hub) continue;
    // If the sheet's description is empty or very short, use div2hub's.
    if (!talent.text || talent.text.length < 10) {
      talent.text = hub.text;
    }
    // Store the div2hub text as a reference for display.
    talent._hubText = hub.text;
  }
}

// Supplement brand set bonuses: fill in effects that text-parsing missed.
function mergeBrandSets(sheetBrands, hubBrands) {
  for (const brand of sheetBrands) {
    const hub = hubBrands.get(norm(brand.name));
    if (!hub) continue;
    for (let i = 0; i < brand.bonuses.length; i++) {
      const sb = brand.bonuses[i];
      const hb = hub.bonuses.find(h => h.pieces === sb.pieces);
      if (!hb) continue;
      // If the sheet parsed zero effects but div2hub has them, use div2hub's.
      if ((!sb.effects || sb.effects.length === 0) && hb.effects.length > 0) {
        sb.effects = hb.effects;
      }
    }
  }
}

// Same for gear sets.
function mergeGearSets(sheetSets, hubSets) {
  for (const set of sheetSets) {
    const hub = hubSets.get(norm(set.name));
    if (!hub) continue;
    for (const sb of set.bonuses) {
      const hb = hub.bonuses.find(h => h.pieces === sb.pieces);
      if (!hb) continue;
      if ((!sb.effects || sb.effects.length === 0) && hb.effects.length > 0) {
        sb.effects = hb.effects;
      }
    }
  }
}

// Supplement weapon mods: fill in effects from div2hub where the sheet missed them.
function mergeWeaponMods(sheetMods, hubMods) {
  for (const mod of sheetMods) {
    const hub = hubMods.get(norm(mod.name));
    if (!hub) continue;
    if ((!mod.effects || mod.effects.length === 0) && hub.effects.length > 0) {
      mod.effects = hub.effects;
    }
  }
}

// Main enrichment entry point: call after finish() with the div2hub data.
export function enrichWithDiv2Hub(db, hub) {
  if (!hub) return;

  // 1. Attribute ranges with proto maxes.
  mergeAttributes(db.attributes, hub.attributes);

  // 2. Named item fixed attribute enrichment.
  mergeNamedAttributes(db, hub.attributes.namedAttrs);

  // 3. Talent descriptions.
  mergeTalents(db.weaponTalents, hub.weaponTalents);
  mergeTalents(db.gearTalents, hub.gearTalents);

  // 4. Brand set bonuses.
  mergeBrandSets(db.brands, hub.brandSets);

  // 5. Gear set bonuses.
  mergeGearSets(db.gearsets, hub.gearSets);

  // 6. Weapon mods.
  mergeWeaponMods(db.weaponMods, hub.weaponMods);

  // 7. Store the hub reference on db for later use (e.g., named item proto display).
  db.hub = hub;
}
