/**
 * A&M v2 — spells for casters, with no Foundry code.
 *
 * Spell index entries: { uuid, name, school, classes: { Wizard: 1, … }, domains: { Fire: 2, … } } (from learnedAt).
 * A class's spells in the plan: plan.spells[classUuid] = [{ uuid, name, level, prepared }]
 *   - Wizard (spellbook): all SRD 0-level spells, 3 + Int modifier 1st-level spells, then 2 a level; plus spells found
 *     adventuring (at each spell level above 0: 1, and 1 more for every 2 class levels since it gained that spell level),
 *     mostly SRD; prepared to fill its slots.
 *   - Sorcerer, bard (spells known): their table's spells known, mostly SRD; cast spontaneously.
 *   - Cleric, druid, paladin, ranger, adept (whole list): every SRD spell of the levels they can cast, plus
 *     (non-SRD setting × caster level) non-SRD spells at each of those levels; some prepared to fill their slots.
 * SRD spells are D35E's own (its compendium); every other compendium's spells are non-SRD. A non-SRD setting of 0 means none.
 *
 * Domains and specialist schools (classes with D35E's special slot: cleric, wizard). plan.specs[classUuid]:
 *   { domains: [specUuid, specUuid] }                         a cleric's two domains
 *   { school: specUuid | null, prohibited: ["nec", "ill"] }   a specialist wizard's school and prohibited schools
 * SRD: a cleric has one domain spell slot at each spell level from 1st, filled with one of its domains' spells of that level;
 * a specialist has one extra slot at each spell level for a spell of its school, and can't learn or cast prohibited
 * schools' spells (two schools; one for a diviner). Spells in the plan carry domain: true (a domain spell) and
 * special: true (prepared in that level's special slot, besides its other prepared copies).
 */
import { variantSpells, chosenFeatures, isArcaneDomain } from "./variants.js";
import * as R from "./rules.js";
import { baseName } from "./plan.js";

const num = (v) => (v === "" || v == null ? -1 : Number(v));
/** "Adept (NPC)" → "Adept"; the name spells use in learnedAt. */
export const listName = (cls) => baseName(cls?.en ?? "").replace(/\s*\(NPC\)\s*$/i, "").trim();

/** How a class casts: "book" | "known" | "prepared" | "powers" (psionic: powers known, manifested with power points) | null. */
export function castingKind(cls) {
  const c = cls?.casting;
  if (c?.type === "psionic") return c.powersKnown?.length > 1 ? "powers" : null;
  if (!c || (c.type !== "arcane" && c.type !== "divine")) return null;
  if (c.spontaneous && c.known?.length) return "known";
  if (c.book && !c.allKnown) return "book";
  return "prepared";
}

/** Bonus spells a day for a spell level from the casting ability modifier (SRD table). */
export const bonusSpells = (mod, sl) => (sl >= 1 && mod >= sl ? Math.floor((mod - sl) / 4) + 1 : 0);

/** Spells a day by spell level (0–9) at a class level; -1 where the class has none. */
export function slots(cls, classLevel, abilityScore) {
  const row = (cls?.casting?.perDay ?? []).find((r) => Number(r?.[0]) === classLevel) ?? cls?.casting?.perDay?.[classLevel - 1];
  if (!row) return [];
  const mod = R.mod(abilityScore);
  return row.slice(1).map((v, sl) => { const base = num(v); return base < 0 ? -1 : base + bonusSpells(mod, sl); });
}
/** Spells known by spell level at a class level (sorcerer, bard). */
export function knownCounts(cls, classLevel) {
  const row = (cls?.casting?.known ?? []).find((r) => Number(r?.[0]) === classLevel) ?? cls?.casting?.known?.[classLevel - 1];
  return row ? row.slice(1).map((v) => Math.max(0, num(v))) : [];
}

/**
 * The names a class's spells (or powers) are listed under in learnedAt. D35E's powers list the SRD psion/wilder powers
 * under "Wilder" (and "Psion/Wilder" for the ones psychic warriors share), discipline powers under the discipline, and
 * other psion powers under "Psion". So a psion's: the psion/wilder lists and its discipline's ("Psion (Egoist)" → Egoist),
 * then "Psion" for a power level those leave empty; a wilder's: the psion/wilder lists.
 */
export function listNames(cls) {
  const n = listName(cls), lower = n.toLowerCase();
  if (cls?.casting?.type !== "psionic") return [lower];
  const m = n.match(/^psion\s*\(([^)]+)\)$/i);
  if (m || lower === "psion") return ["wilder", "psion/wilder", lower, ...(m ? [m[1].trim().toLowerCase()] : [])];
  if (lower === "wilder") return ["wilder", "psion/wilder"];
  return [lower];
}
/** A psion's discipline, as its powers list it ("Psion (Egoist)" → "egoist"), or null. */
export const disciplineOf = (cls) => (cls?.casting?.type === "psionic" ? listName(cls).match(/^psion\s*\(([^)]+)\)$/i)?.[1]?.trim().toLowerCase() ?? null : null);
const isPsion = (cls) => cls?.casting?.type === "psionic" && /^psion\b/i.test(listName(cls));
/** The spells (or powers) of a class's list at a level. */
export const listFor = (index, cls, sl) => {
  const hit = (names) => index.filter((s) => Object.entries(s.classes).some(([k, v]) => names.has(k.toLowerCase()) && v === sl));
  const out = hit(new Set(listNames(cls)));
  // A variant class: its standard class's list with its own changes (a divine bard's, a paladin of tyranny's)
  return variantSpells(out.length || !isPsion(cls) ? out : hit(new Set(["psion"])), index, cls, sl);
};

/* ---------- Psionic powers (SRD) ---------- */

/** Powers known at a class level (the class table). */
export const powersKnownAt = (cls, classLevel) => Number(cls?.casting?.powersKnown?.[Math.min(classLevel, (cls?.casting?.powersKnown?.length ?? 1) - 1)]) || 0;
/** The highest power level a class can learn at a class level. */
export const powerMaxAt = (cls, classLevel) => Number(cls?.casting?.powersMax?.[Math.min(classLevel, (cls?.casting?.powersMax?.length ?? 1) - 1)]) || 0;
/** Power points a day: the class table plus the key ability's bonus (half the class level × its modifier, as D35E works it out). */
export const powerPointsAt = (cls, classLevel, score) => {
  const base = Number(cls?.casting?.points?.[Math.min(classLevel, (cls?.casting?.points?.length ?? 1) - 1)]) || 0;
  return base + Math.max(0, Math.floor(0.5 * classLevel * R.mod(score)));
};

/** D35E's own spells are the SRD's. */
export const isSrd = (s) => (s?.srd != null ? !!s.srd : String(s?.uuid ?? "").startsWith("Compendium.D35E."));
/** The share of non-SRD spells among spells chosen (spellbooks found, spells known), when non-SRD spells are allowed. */
export const NON_SRD_SHARE = 0.25;

/** The first class level at which a class has spells of a spell level (0 if never). */
export function gainedAt(cls, sl, score = 10) {
  for (let L = 1; L <= 20; L++) if ((slots(cls, L, score)[sl] ?? -1) >= 0) return L;
  return 0;
}
/** Caster level from class level: half for classes whose spells start at 4th level (paladin, ranger). */
export function casterLevel(cls, classLevel) {
  const first = Math.min(...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((sl) => gainedAt(cls, sl) || 99));
  return first >= 4 && first < 99 ? Math.floor(classLevel / 2) : classLevel;
}

/* ---------- Domains and specialist schools ---------- */

export const SCHOOLS = ["abj", "con", "div", "enc", "evo", "ill", "nec", "trs"];
export const SCHOOL_NAMES = { abj: /*t*/"Abjuration", con: /*t*/"Conjuration", div: /*t*/"Divination", enc: /*t*/"Enchantment", evo: /*t*/"Evocation", ill: /*t*/"Illusion", nec: /*t*/"Necromancy", trs: /*t*/"Transmutation" };
/** How a class specializes: "domains" (a divine caster with D35E's special slot: cleric), "school" (an arcane one with a spellbook: wizard), or null. */
export function specKind(cls) {
  const c = cls?.casting;
  if (!c?.special) return null;
  return c.type === "divine" ? "domains" : c.type === "arcane" && c.book ? "school" : null;
}
/** How many prohibited schools a specialist chooses: one for a diviner, else two (SRD). */
export const prohibitedCount = (schoolKey) => (schoolKey === "div" ? 1 : 2);
/** Spell levels with a special slot at a class level: every level from 1st the class casts. */
export function specialLevels(cls, classLevel, score) {
  // A spontaneous cleric knows its domain spells instead; a spontaneous specialist casts one more spell a day of its school instead
  if (cls?.casting?.spontaneous && (cls.casting.auto === "domains" || cls.casting.book)) return [];
  return slots(cls, classLevel, score).map((v, sl) => (sl >= 1 && v >= 0 ? sl : 0)).filter(Boolean);
}
/** SRD: a cleric can't take an alignment domain (Good, Evil, Law, Chaos) its own alignment doesn't share. */
export function domainAllowed(spec, alignment) {
  const a = String(alignment ?? "tn");
  return { good: a[1] === "g", evil: a[1] === "e", law: a[0] === "l", chaos: a[0] === "c" }[spec?.key] ?? true;
}
/** A class's choice in the plan, with its catalog entries: { kind, domains: [entry], school: entry | null, prohibited: [codes] }. */
export function specFor(plan, cat, cls) {
  const kind = specKind(cls);
  const sp = plan?.specs?.[cls?.uuid] ?? {};
  const school = kind === "school" && sp.school ? cat?.specs?.get(sp.school) ?? null : null;
  // A domain wizard (Unearthed Arcana): an arcane domain in place of the school, no prohibited schools
  const arcane = isArcaneDomain(school);
  return { kind, domains: kind === "domains" ? (sp.domains ?? []).map((u) => cat?.specs?.get(u)).filter(Boolean) : [],
    school, arcane, prohibited: school && !arcane ? [...(sp.prohibited ?? [])] : [],
    // A specialist wizard variant that gives up the specialty spell (prescience, spontaneous dispelling…): no school slot
    noSlot: !!school && !arcane && chosenFeatures(plan, cls, cat).some((c) => c.noSlot) };
}
/** The domain spells of a set of domains at a spell level, as spell index entries ({ …, domain: name }). */
export function domainSpells(domains, sl, index) {
  const out = [];
  for (const dm of domains) for (const x of dm.spells ?? []) {
    if (x.level !== sl) continue;
    const e = (x.uuid && index.find((s) => s.uuid === x.uuid)) || index.find((s) => s.name.toLowerCase() === x.name.toLowerCase())
      || (x.uuid ? { uuid: x.uuid, name: x.name, school: "", classes: {}, domains: {} } : null);
    if (e && !out.some((o) => o.uuid === e.uuid)) out.push({ ...e, from: dm.name });
  }
  return out;
}

/** A spell's (power's) level on a class's lists. */
const levelIn = (s, cls) => { const names = new Set(listNames(cls)); const hit = Object.entries(s.classes ?? {}).filter(([k]) => names.has(k.toLowerCase())).map(([, v]) => v); return hit.length ? Math.min(...hit) : null; };

/** Pick n spells, favourites first, then mostly SRD: each other pick is non-SRD at the given share (when any are left). */
function chooseMixed(pool, n, favorites, taken, rng, share) {
  const free = pool.filter((s) => !taken.has(s.uuid));
  const out = choose(free, Math.min(n, (favorites ?? []).length), favorites, taken, rng, true);
  const srd = free.filter((s) => isSrd(s) && !taken.has(s.uuid)), non = free.filter((s) => !isSrd(s) && !taken.has(s.uuid));
  while (out.length < n && (srd.length || non.length)) {
    const from = (share > 0 && non.length && (rng() < share || !srd.length)) ? non : srd.length ? srd : share > 0 ? non : null;
    if (!from) break;
    const s = from.splice(Math.floor(rng() * from.length), 1)[0];
    out.push(s); taken.add(s.uuid);
  }
  return out;
}

/** Pick n spells: favourites first (by name), then at random; never the same one twice. */
function choose(pool, n, favorites, taken, rng, favOnly = false) {
  const out = [];
  const free = pool.filter((s) => !taken.has(s.uuid));
  const fav = (favorites ?? []).map((f) => free.find((s) => s.name.toLowerCase() === String(f).toLowerCase())).filter(Boolean);
  for (const s of fav) { if (out.length >= n) break; if (!out.includes(s)) out.push(s); }
  const rest = favOnly ? [] : free.filter((s) => !out.includes(s));
  while (out.length < n && rest.length) out.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  for (const s of out) taken.add(s.uuid);
  return out;
}

/** Fill slots from a list of spells of one level: each spell prepared about as often (favourites first). */
function prepare(spells, count) {
  const prepared = new Map();
  if (!spells.length || count <= 0) return prepared;
  for (let i = 0; i < count; i++) { const s = spells[i % spells.length]; prepared.set(s.uuid, (prepared.get(s.uuid) ?? 0) + 1); }
  return prepared;
}

/**
 * A class's spells for a character: [{ uuid, name, level, prepared }].
 * classLevel: levels in the class; score: its casting ability score; favorites: spell names the profile prefers.
 */
export function classSpells(cls, classLevel, score, index, { favorites = [], rng = Math.random, nonSrd = 1, spec = null, exclude = null } = {}) {
  const kind = castingKind(cls);
  if (!kind || classLevel < 1) return [];
  // A specialist never learns its prohibited schools' spells
  const banned = new Set(spec?.prohibited ?? []);
  if (banned.size) index = index.filter((s) => !banned.has(s.school));
  const perDay = slots(cls, classLevel, score);
  const maxSl = perDay.reduce((m, v, sl) => (v >= 0 ? sl : m), -1);
  const share = nonSrd > 0 ? NON_SRD_SHARE : 0;
  const out = [];
  const taken = new Set(exclude ?? []); // exclude: powers another psionic class of the character already knows
  if (kind === "powers") {
    // Powers known: each class level's new powers, mostly of the highest level it can learn then (one a level lower)
    let had = 0;
    for (let L = 1; L <= classLevel; L++) {
      const n = powersKnownAt(cls, L) - had, top = Math.max(1, powerMaxAt(cls, L));
      had = powersKnownAt(cls, L);
      for (let i = 0; i < n; i++) {
        const pl = Math.max(1, top - (i % 3 === 2 ? 1 : 0));
        // A psion's first new power each level is one of its discipline's when there's one left (the rest: favourites, then any)
        const disc = i === 0 ? disciplineOf(cls) : null;
        let [s] = disc ? chooseMixed(listFor(index, cls, pl).filter((x) => Object.keys(x.classes).some((k) => k.toLowerCase() === disc)), 1, favorites, taken, rng, share) : [];
        if (!s) [s] = chooseMixed(listFor(index, cls, pl), 1, favorites, taken, rng, share);
        for (let low = pl - 1; !s && low >= 1; low--) [s] = chooseMixed(listFor(index, cls, low), 1, favorites, taken, rng, share);
        if (s) out.push({ uuid: s.uuid, name: s.name, level: s.classes ? levelIn(s, cls) ?? pl : pl, prepared: 0, ...(isSrd(s) ? {} : { srd: false }) });
      }
    }
    return out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }
  if (kind === "book") {
    // Every SRD 0-level spell; 3 + Int modifier 1st-level spells; then 2 new spells each level, of levels it can cast then
    const book = new Map();
    const srdOnly = (l) => { const x = l.filter(isSrd); return x.length ? x : l; };
    for (const s of srdOnly(listFor(index, cls, 0))) { book.set(s.uuid, { ...s, level: 0 }); taken.add(s.uuid); }
    for (const s of choose(srdOnly(listFor(index, cls, 1)), 3 + Math.max(0, R.mod(score)), favorites, taken, rng)) book.set(s.uuid, { ...s, level: 1 });
    for (let L = 2; L <= classLevel; L++) {
      const top = slots(cls, L, score).reduce((m, v, sl) => (v > 0 ? sl : m), 0);
      for (let i = 0; i < 2; i++) {
        const sl = Math.max(1, top - (i === 1 && top > 1 ? 1 : 0));
        const [s] = choose(srdOnly(listFor(index, cls, sl)), 1, favorites, taken, rng);
        if (s) book.set(s.uuid, { ...s, level: sl });
      }
    }
    // Spells found adventuring: 1 at each spell level, and 1 more for every 2 class levels since that spell level
    for (let sl = 1; sl <= maxSl; sl++) {
      const n = 1 + Math.floor(Math.max(0, classLevel - (gainedAt(cls, sl, score) || classLevel)) / 2);
      for (const s of chooseMixed(listFor(index, cls, sl), n, [], taken, rng, share)) book.set(s.uuid, { ...s, level: sl });
    }
    for (let sl = 0; sl <= 9; sl++) {
      const known = [...book.values()].filter((s) => s.level === sl);
      const fav = known.sort((a, b) => favRank(a, favorites) - favRank(b, favorites));
      // A spontaneous wizard casts any spell of its book: nothing to prepare
      const prep = cls.casting?.spontaneous ? new Map() : prepare(fav, perDay[sl] > 0 ? perDay[sl] : 0);
      for (const s of known) out.push({ uuid: s.uuid, name: s.name, level: sl, prepared: prep.get(s.uuid) ?? 0, ...(isSrd(s) ? {} : { srd: false }) });
    }
  } else if (kind === "known") {
    const counts = knownCounts(cls, classLevel);
    counts.forEach((n, sl) => { if (n > 0) for (const s of chooseMixed(listFor(index, cls, sl), n, favorites, taken, rng, share)) out.push({ uuid: s.uuid, name: s.name, level: sl, prepared: 0, ...(isSrd(s) ? {} : { srd: false }) }); });
  } else {
    // The whole list: every SRD spell of the levels it can cast, and non-SRD spells (setting × caster level) at each
    const cl = casterLevel(cls, classLevel);
    for (let sl = 0; sl <= maxSl; sl++) {
      if (!(perDay[sl] >= 0)) continue;
      const list = listFor(index, cls, sl);
      const all = list.filter(isSrd);
      if (nonSrd > 0) all.push(...choose(list.filter((s) => !isSrd(s)), Math.round(nonSrd * cl), [], new Set(), rng));
      all.sort((a, b) => a.name.localeCompare(b.name));
      const n = perDay[sl];
      const picks = n > 0 ? choose(all, Math.min(n, Math.max(1, Math.ceil(n / 2) + 1)), favorites, new Set(), rng) : [];
      const prep = prepare(picks, n);
      for (const s of all) out.push({ uuid: s.uuid, name: s.name, level: sl, prepared: prep.get(s.uuid) ?? 0, ...(isSrd(s) ? {} : { srd: false }) });
    }
  }
  // A spontaneous druid knows summon nature's ally of each level it casts (Unearthed Arcana)
  if (cls.casting?.spontaneous && cls.casting.auto === "summon") {
    const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
    for (let sl = 1; sl <= maxSl; sl++) {
      if (!(perDay[sl] >= 0)) continue;
      const s = index.find((x) => x.name.toLowerCase().replace(/[’']/g, "'") === `summon nature's ally ${ROMAN[sl]}`.toLowerCase());
      if (s && !out.some((o) => o.uuid === s.uuid)) out.push({ uuid: s.uuid, name: s.name, level: sl, prepared: 0, auto: true });
    }
  }
  if (spec?.kind) addSpecials(out, cls, classLevel, score, index, spec, { favorites, rng });
  return out;
}

/**
 * Domain spells and the special slots (cleric's domain slot, specialist's school slot) added to a class's spells:
 * each domain spell is on the list (domain: true); at each spell level from 1st one spell is special (prepared in the slot).
 */
export function addSpecials(out, cls, classLevel, score, index, spec, { favorites = [], rng = Math.random, keep = false } = {}) {
  const levels = spec?.noSlot ? [] : specialLevels(cls, classLevel, score);
  for (const s of out) if (!keep) delete s.special;
  // A spontaneous cleric knows its domain spells of every level it casts (Unearthed Arcana)
  const knowsDomains = cls?.casting?.spontaneous && cls.casting.auto === "domains";
  const castable = knowsDomains ? slots(cls, classLevel, score).map((v, sl) => (sl >= 1 && v >= 0 ? sl : 0)).filter(Boolean) : [];
  // A domain wizard's domain spells go in its spellbook as soon as it can cast them (not counted in the spells it learns)
  const arcane = spec.kind === "school" && spec.arcane && spec.school;
  const inBook = arcane ? slots(cls, classLevel, score).map((v, sl) => (sl >= 1 && v >= 0 ? sl : 0)).filter(Boolean) : castable;
  if ((spec.kind === "domains" && spec.domains.length) || arcane) {
    const doms = arcane ? [spec.school] : spec.domains;
    for (let sl = 1; sl <= 9; sl++) {
      for (const d of domainSpells(doms, sl, index)) {
        const have = out.find((s) => s.level === sl && (s.uuid === d.uuid || s.name.toLowerCase() === d.name.toLowerCase()));
        if (have) have.domain = true;
        else if (levels.includes(sl) || inBook.includes(sl)) out.push({ uuid: d.uuid, name: d.name, level: sl, prepared: 0, domain: true, ...(isSrd(d) ? {} : { srd: false }) });
      }
    }
    for (const sl of levels) {
      if (keep && out.some((s) => s.level === sl && s.special)) continue;
      const pool = out.filter((s) => s.level === sl && s.domain);
      const [pick] = choose(pool, 1, favorites, new Set(), rng);
      if (pick) pick.special = true;
    }
  } else if (spec.kind === "school" && spec.school) {
    const schoolOf = new Map(index.map((s) => [s.uuid, s.school]));
    for (const sl of levels) {
      if (keep && out.some((s) => s.level === sl && s.special)) continue;
      let pool = out.filter((s) => s.level === sl && schoolOf.get(s.uuid) === spec.school.key);
      if (!pool.length) {
        // No spell of the school at this level yet: one more for the spellbook (as a specialist would pick)
        const [extra] = choose(listFor(index, cls, sl).filter((s) => s.school === spec.school.key && isSrd(s)), 1, favorites, new Set(out.map((s) => s.uuid)), rng);
        if (extra) { out.push({ uuid: extra.uuid, name: extra.name, level: sl, prepared: 0 }); pool = [out.at(-1)]; }
      }
      const preferred = [...pool].sort((a, b) => (b.prepared || 0) - (a.prepared || 0));
      const [pick] = choose(preferred, 1, favorites, new Set(), () => 0);
      if (pick) pick.special = true;
    }
  }
  return out;
}
const favRank = (s, favorites) => { const i = (favorites ?? []).findIndex((f) => String(f).toLowerCase() === s.name.toLowerCase()); return i < 0 ? 999 : i; };

/** A class profile's favourite spells or powers ("Psion (Egoist)" uses the Psion profile). */
export const favoriteSpells = (profiles, cls) => {
  const all = profiles?.classes ?? {}, en = baseName(cls?.en);
  return (all[en] ?? all[en.replace(/\s*\([^)]*\)\s*$/, "")])?.spells ?? [];
};

/** Every caster class of a character → { [classUuid]: spells }. */
export function allSpells(plan, cat, d, index, profiles, rng = Math.random, { nonSrd = 1 } = {}) {
  const out = {}, knownPowers = new Set();
  for (const { cls, levels } of d.parts ?? d.classes) {
    if (!castingKind(cls)) continue;
    const ability = cls.casting?.ability || "int";
    const fav = favoriteSpells(profiles, cls);
    // A second psionic class learns other powers than the first (it can manifest those already), for a wider repertoire
    const powers = castingKind(cls) === "powers";
    out[cls.uuid] = classSpells(cls, levels, d.abilities[ability], index, { favorites: fav, rng, nonSrd, spec: specFor(plan, cat, cls), exclude: powers ? knownPowers : null });
    if (powers) for (const x of out[cls.uuid]) knownPowers.add(x.uuid);
  }
  return out;
}

/** Rule checks for domains, schools and special slots: [[code, data, severity]] (plan.check adds them to the Spells step). */
export function specIssues(plan, cat, d) {
  const out = [];
  for (const { cls, levels } of d.parts ?? d.classes) {
    // Psionic powers known: as many as the class table gives, none above the highest power level it can learn
    if (castingKind(cls) === "powers") {
      const list = plan.spells?.[cls.uuid] ?? [], max = powersKnownAt(cls, levels), top = powerMaxAt(cls, levels);
      if (list.length > max) out.push(["powersMany", { cls: cls.name, n: list.length, max }, "warn"]);
      else if (list.length < max) out.push(["powersFew", { cls: cls.name, n: max - list.length }, "info"]);
      for (const x of list) if (x.level > top) out.push(["powerLevel", { cls: cls.name, power: x.name, level: x.level, max: top }, "warn"]);
      continue;
    }
    const spec = specFor(plan, cat, cls);
    if (!spec.kind) continue;
    if (spec.kind === "domains") {
      if (spec.domains.length !== 2) out.push(["domainsCount", { cls: cls.name, n: spec.domains.length }, "warn"]);
      for (const dm of spec.domains) if (!domainAllowed(dm, plan.alignment)) out.push(["domainAlignment", { cls: cls.name, domain: dm.name }, "warn"]);
    } else if (spec.school && !spec.arcane) {
      if (spec.prohibited.includes(spec.school.key)) out.push(["prohibitedOwn", { cls: cls.name, school: spec.school.name }, "error"]);
      else if (spec.prohibited.length !== prohibitedCount(spec.school.key)) out.push(["prohibitedCount", { cls: cls.name, n: prohibitedCount(spec.school.key) }, "warn"]);
    }
    const list = plan.spells?.[cls.uuid];
    if (list?.length && (spec.kind === "domains" ? spec.domains.length : spec.school)) {
      const score = d.abilities?.[cls.casting?.ability || "int"] ?? 10;
      for (const sl of spec.noSlot ? [] : specialLevels(cls, levels, score)) if (!list.some((x) => x.level === sl && x.special)) out.push([spec.kind === "domains" || spec.arcane ? "noDomainSlot" : "noSchoolSlot", { cls: cls.name, level: sl }, "info"]);
    }
  }
  return out;
}
