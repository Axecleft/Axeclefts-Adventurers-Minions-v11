/**
 * A&M v2 — the character plan and everything worked out from it, with no Foundry code.
 *
 * A plan records choices only:
 *   { v, kind: "character" | "npc", name, sex, alignment, deity, age, height, weight, languages: [keys], customLanguages,
 *     img, tokenImg, race: uuid,
 *     abilities: { method, base: { str … }, budget, dice },
 *     hp: { method: "average" | "max" | "roll", maxFirst },
 *     subSkills: [{ tag: "crf1", parent: "crf", name: "Weaponsmithing" }],
 *     gestalt: false (two classes a level, core/gestalt.js: a gestalt level's cls is "gestalt:<uuid A>|<uuid B>"),
 *     levels: [{ cls: uuid, hp, skills: { key: points }, feats: [{ slot, uuid, choice }], increase: "str" | null }] }
 * Skill "points" are what is spent: a cross-class point buys half a rank (as D35E's level records).
 *
 * The catalog (built by catalog.js from the compendiums) is plain data:
 *   races:   Map uuid → { uuid, name, en, ability: { str: 2 … }, la, ext: { size, languages, bonusLanguages, favored, bonusFeat, skillPoints, vision } }
 *   classes: Map uuid → { uuid, name, en, kind, hd, bab, saves: { fort, ref, will }, perLevel, classSkills: { key: true },
 *                         casting: { type, half } | null, maxLevel, ext: { bonusFeats: [{ levels, from, psionic, ignorePrereqs }] } }
 *   feats:   Map uuid → { uuid, name, en, base, psionic, epic, choice: { kind, options } | null, req: {…} | null }
 *   skills:  [{ key, label, ability, rt, arbitrary }]
 */
import { loses, trimLost, chosenFeatures, styleGrants, classSkillsFor, optionFeats, bonusFeatsFor } from "./variants.js";
import * as R from "./rules.js";
import { specIssues } from "./spells.js";
import { ensureGestalt, partsOfClass } from "./gestalt.js";
import { prestigeIssues } from "./prestige.js";

export const PLAN_VERSION = 1;

export function newPlan(o = {}) {
  return {
    v: PLAN_VERSION, kind: o.kind ?? "character", name: "", sex: "", alignment: "tn", deity: "", age: "", height: "", weight: "",
    languages: [], customLanguages: "", img: "", tokenImg: "", race: null, gestalt: false,
    abilities: { method: o.abilityMethod ?? "pointbuy", base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, budget: o.budget ?? 25, dice: "4d6" },
    hp: { method: o.hpMethod ?? "average", maxFirst: o.maxFirst ?? true },
    subSkills: [],
    levels: [],
    spells: {},                       // class uuid → [{ uuid, name, level, prepared, domain?, special? }]
    specs: {},                        // class uuid → { domains: [uuid, uuid] } (cleric) or { school: uuid | null, prohibited: [codes] } (wizard)
    gear: { items: [], loot: true },  // standard gear (core/gear.js entries); loot: treasure for the rest of the wealth
    ...o.plan,
  };
}

export const newLevel = (cls = null) => ({ cls, hp: 0, skills: {}, feats: [], increase: null });

/** The English name without a choice placeholder: "Weapon Focus (No Weapon Selected)" → "Weapon Focus". */
const PLACEHOLDER = /\s*\((?:No [^)]*Selected|No [^)]*Set|undefined|None|All)\)\s*$/i;
export const baseName = (en) => String(en ?? "").replace(PLACEHOLDER, "").trim();
const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** The skills a class has as class skills; a sub-skill (Craft: Weaponsmithing) follows its parent. */
const isClassSkill = (cls, key, plan, cat) => {
  if (!cls) return false;
  const sub = plan.subSkills?.find((s) => s.tag === key);
  return !!classSkillsFor(plan, cls, cat)?.[sub ? sub.parent : key];
};

/* -------------------------------------------- */
/*  Working out the character                   */
/* -------------------------------------------- */

/**
 * Everything the plan adds up to, level by level.
 * → { level, race, abilities, mods, bab, saves, hp, classes: [{ cls, levels }], perLevel: [...], ranks: { key: ranks },
 *     feats: [{ level, slot, feat, choice }], cl: { arcane, divine }, can: { … } }
 */
export function derive(plan, cat) {
  ensureGestalt(cat.classes);
  const race = plan.race ? cat.races.get(plan.race) ?? null : null;
  const counts = new Map();          // class uuid → levels so far (a gestalt class counts as one class item)
  const partCounts = new Map();      // the classes themselves (both classes of a gestalt level) → levels so far
  const partOrder = [];
  const order = [];                  // class uuids in the order first taken
  const points = {};                 // skill key → points so far (raw)
  const ranksFrom = {};              // skill key → ranks so far
  const featsTaken = [];             // { level, slot, feat, choice }
  const perLevel = [];
  const increases = [];
  const racial = race?.ability ?? {};
  const abilityAt = (level) => {
    const out = {};
    for (const a of R.ABILITIES) out[a] = (Number(plan.abilities?.base?.[a]) || 0) + (Number(racial[a]) || 0);
    for (const inc of increases) if (inc.level <= level && inc.ability) out[inc.ability] += 1;
    return out;
  };
  const progression = () => {
    let bab = 0; const saves = { fort: 0, ref: 0, will: 0 };
    for (const [uuid, n] of counts) {
      const c = cat.classes.get(uuid); if (!c) continue;
      bab += R.babFor(c.bab, n);
      for (const s of ["fort", "ref", "will"]) saves[s] += R.saveFor(c.saves?.[s], n, c.kind);
    }
    return { bab, saves };
  };
  const casting = () => {
    const cl = { arcane: 0, divine: 0, any: 0 };
    const can = { turnUndead: false, wildShape: false, arcane: false, divine: false, spells: false };
    for (const [uuid, n] of partCounts) {
      const c = cat.classes.get(uuid); if (!c) continue;
      const en = baseName(c.en);
      if (c.casting?.type) {
        const lvl = c.casting.half ? (n >= 4 ? Math.floor(n / 2) : 0) : n;
        const t = c.casting.type === "arcane" ? "arcane" : "divine";
        cl[t] = Math.max(cl[t], lvl);
        if (lvl > 0) { can[t] = true; can.spells = true; }
      }
      if ((en === "Cleric" && n >= 1) || (en === "Paladin" && n >= 4)) can.turnUndead = true;
      if (en === "Druid" && n >= 5) can.wildShape = true;
    }
    cl.any = Math.max(cl.arcane, cl.divine);
    return { cl, can };
  };

  (plan.levels ?? []).forEach((lv, i) => {
    const level = i + 1;
    const c = lv.cls ? cat.classes.get(lv.cls) ?? null : null;
    if (lv.increase && R.hasIncrease(level)) increases.push({ level, ability: lv.increase });
    if (c) { if (!counts.has(c.uuid)) order.push(c.uuid); counts.set(c.uuid, (counts.get(c.uuid) ?? 0) + 1); }
    const classLevel = c ? counts.get(c.uuid) : 0;
    const parts = partsOfClass(c).map((pc) => {
      if (!partCounts.has(pc.uuid)) partOrder.push(pc.uuid);
      partCounts.set(pc.uuid, (partCounts.get(pc.uuid) ?? 0) + 1);
      return { cls: pc, level: partCounts.get(pc.uuid) };
    });
    const ab = abilityAt(level);
    const { bab, saves } = progression();
    // Skill points
    const ext = race?.ext ?? {};
    const gain = c ? R.skillPointsFor({ perLevel: c.perLevel, intMod: R.mod(ab.int), first: level === 1,
      raceFirst: ext.skillPoints?.first ?? 0, raceLevel: ext.skillPoints?.perLevel ?? 0 }) : 0;
    let spent = 0;
    for (const [k, p] of Object.entries(lv.skills ?? {})) {
      const pts = Number(p) || 0; if (!pts) continue;
      spent += pts;
      points[k] = (points[k] ?? 0) + pts;
      ranksFrom[k] = (ranksFrom[k] ?? 0) + (isClassSkill(c, k, plan, cat) ? pts : pts / 2);
    }
    // Class skills for maximum ranks: a class skill of any class taken so far
    const anyClassSkill = (k) => [...counts.keys()].some((u) => isClassSkill(cat.classes.get(u), k, plan, cat));
    // Feat slots
    const slots = [];
    if (R.hasFeat(level)) slots.push({ slot: "general" });
    if (level === 1 && ext.bonusFeat) slots.push({ slot: "race" });
    // Class bonus feats, by each class's own level (both classes of a gestalt level)
    parts.forEach(({ cls: pc, level: pl }, ki) => bonusFeatsFor(pc.ext?.bonusFeats ?? [], chosenFeatures(plan, pc, cat)).forEach((b, bi) => {
      if (b.levels?.includes(pl)) slots.push({ slot: ki ? `class${ki}_${bi}` : `class${bi}`, cls: pc.uuid, classLevel: pl, from: b.from ?? [], psionic: !!b.psionic, ignorePrereqs: !!b.ignorePrereqs, special: !!b.special, orFeat: !!b.orFeat });
    }));
    for (const f of lv.feats ?? []) {
      const feat = f.uuid ? cat.feats.get(f.uuid) : null;
      if (feat) featsTaken.push({ level, slot: f.slot, feat, choice: f.choice ?? null });
    }
    // Feats a class feature gives (a ranger's combat style: Rapid Shot at 2nd…): taken, without a slot
    for (const { cls: pc, level: pl } of parts) for (const g of styleGrants(chosenFeatures(plan, pc, cat), pl).filter((x) => x.level === pl)) {
      const feat = grantedFeat(cat, g.feat);
      if (feat) featsTaken.push({ level, slot: "granted", feat, choice: null, granted: { cls: pc.uuid, feature: g.feature, key: g.key } });
    }
    for (const { cls: pc, level: pl } of parts) for (const g of optionFeats(chosenFeatures(plan, pc, cat), pl).filter((x) => x.level === pl)) {
      const feat = grantedFeat(cat, g.feat);
      if (feat) featsTaken.push({ level, slot: "granted", feat, choice: null, granted: { cls: pc.uuid, feature: g.key, key: g.key } });
    }
    const { cl, can } = casting();
    perLevel.push({
      level, cls: c, classLevel, parts, abilities: ab, bab, saves, hd: c?.hd ?? 0, hp: Number(lv.hp) || 0,
      skillPoints: { gain, spent, left: gain - spent }, ranks: { ...ranksFrom }, anyClassSkill, maxClass: R.maxRanks(level, true), maxCross: R.maxRanks(level, false),
      slots, increase: R.hasIncrease(level), cl, can,
      features: parts.flatMap(({ cls: pc, level: pl }) => classFeatures(pc, pl, cat, chosenFeatures(plan, pc, cat)).map((f) => ({ ...f, cls: pc.uuid, classLevel: pl }))),
    });
  });

  const level = perLevel.length;
  const last = perLevel[level - 1];
  const abilities = abilityAt(level);
  const mods = Object.fromEntries(R.ABILITIES.map((a) => [a, R.mod(abilities[a])]));
  const { bab, saves } = progression();
  const ranks = Object.fromEntries(Object.entries(ranksFrom).map(([k, v]) => [k, Math.floor(v)]));
  const hpRolled = perLevel.reduce((n, p) => n + p.hp, 0);
  const hp = perLevel.reduce((n, p) => n + Math.max(1, p.hp + R.mod(p.abilities.con)), 0);
  return {
    level, race, abilities, mods, bab, saves, hpRolled, hp,
    classes: order.map((u) => ({ cls: cat.classes.get(u), levels: counts.get(u) })),
    parts: partOrder.map((u) => ({ cls: cat.classes.get(u), levels: partCounts.get(u) })), // the classes themselves (spellcasting, class levels)
    perLevel, ranks, points, feats: featsTaken, cl: last?.cl ?? { arcane: 0, divine: 0, any: 0 }, can: last?.can ?? {},
    ecl: level + (Number(race?.la) || 0),
  };
}

/**
 * The multiclass XP penalty (SRD): when two of a character's classes are two or more levels apart, -20% XP for each
 * class not within one level of the highest-level class. The favored class doesn't count (a human's or half-elf's is
 * its highest-level class), nor do prestige classes and racial hit dice; gestalt characters have none.
 * → { pct, behind: [cls], top: cls | null, favored: cls | null }
 */
export function xpPenalty(plan, d) {
  if (plan.gestalt) return { pct: 0, behind: [], top: null, favored: null };
  const list = (d.classes ?? []).filter((c) => c.cls).map((c) => ({ en: c.cls.en, kind: c.cls.kind, levels: c.levels, cls: c.cls }));
  const r = xpPenaltyOf(list, d.race?.ext?.favored ?? null);
  return { pct: r.pct, behind: r.behind.map((c) => c.cls), top: r.top?.cls ?? null, favored: r.favored?.cls ?? null };
}

/** A feat a class feature gives, by name: the catalog's (D35E's first, not epic). */
export function grantedFeat(cat, name) {
  const list = cat?.list?.feats ?? [...(cat?.feats?.values?.() ?? [])];
  const same2 = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  const hits = list.filter((f) => !f.special && (same2(f.base, name) || same2(f.name, name)));
  return hits.find((f) => String(f.uuid).startsWith("Compendium.D35E.")) ?? hits[0] ?? null;
}

/** Can a class be of an alignment? A variant's own list (the bardic sage's neutral ones), else the SRD's limits. */
export const clsAlignmentOk = (cls, alignment) => (cls?.alignments?.length && alignment ? cls.alignments.includes(alignment) : R.alignmentOk(baseName(cls?.en), alignment));

/**
 * What a class gains at one of its levels: D35E's class abilities for that class and level (cat.features, by the
 * class's English name: "Evasion" at Rogue 2), and the class's own notes ("Sneak Attack +2d6" at 3rd), one of each name.
 * → [{ name, uuid | null }]
 */
export function classFeatures(cls, classLevel, cat, chosen = []) {
  if (!cls || !(classLevel > 0)) return [];
  const en = baseName(cls.en ?? cls.name).toLowerCase();
  const plain = en.replace(/\s*\([^)]*\)\s*$/, "");
  const list = cat?.features?.get?.(en) ?? cat?.features?.get?.(plain) ?? [];
  const out = [], seen = new Set();
  const add = (name, uuid) => { const k = String(name).trim().toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push({ name: String(name).trim(), uuid: uuid ?? null }); };
  // D35E's own items first (the same ability in another compendium is left out)
  // What the variant class and the class feature variants chosen (whirling frenzy…) take away, and what they give
  const lose = [...(cls.variant?.lose ?? []), ...chosen.flatMap((c) => c.lose ?? [])];
  for (const f of [...list].sort((a, b) => Number(b.d35e) - Number(a.d35e))) if (f.level === classLevel && !loses(lose, f.name, classLevel)) add(f.name, f.uuid);
  for (const n of cls.notes ?? []) if (n.level === classLevel) { const name = trimLost(lose, n.name, n.level); if (name) add(name, null); }
  for (const c of chosen) for (const [level, name] of c.gain ?? []) if (Number(level) === classLevel) add(name, null);
  for (const c of chosen) for (const [level, feature, feat] of c.grants ?? []) if (Number(level) === classLevel) add(`${feature} (${c.key}): ${feat}`, null);
  return out;
}

/**
 * The SRD multiclass XP penalty for a list of classes [{ en, kind (base | prestige | racial | minion), levels }] and the
 * race's favored class (an English class name, "any" for the highest-level class, or null). Only base classes count.
 * → { pct, behind: [entries], top: entry | null, favored: entry | null }
 */
export function xpPenaltyOf(classes, fav) {
  const list = (classes ?? []).filter((c) => c.kind === "base" && c.levels > 0);
  let favored = null;
  const plain = (s) => baseName(s ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
  if (fav === "any") favored = [...list].sort((a, b) => b.levels - a.levels)[0] ?? null;
  else if (fav) favored = list.find((c) => plain(c.en) === plain(fav)) ?? null;
  const counted = list.filter((c) => c !== favored);
  if (counted.length < 2) return { pct: 0, behind: [], top: null, favored };
  const top = counted.reduce((a, b) => (b.levels > a.levels ? b : a));
  const behind = counted.filter((c) => top.levels - c.levels > 1);
  return { pct: behind.length * 20, behind, top, favored };
}

/* -------------------------------------------- */
/*  Feat prerequisites                          */
/* -------------------------------------------- */

/**
 * Does a feat's prerequisite data hold at a level?
 * state: a perLevel entry; taken: feats taken so far (this level's other slots included).
 * → { ok, missing: [{ key, data }] } (texts are built by the window, translated).
 */
export function prereqs(feat, choice, state, taken, d) {
  const req = feat?.req;
  if (!req) return { ok: true, missing: [], unchecked: !feat?.req };
  const missing = [];
  for (const [a, min] of Object.entries(req.ab ?? {})) if ((state.abilities?.[a] ?? 0) < min) missing.push({ key: "ab", ability: a, min });
  if (req.bab && state.bab < req.bab) missing.push({ key: "bab", min: req.bab });
  if (req.char && state.level < req.char) missing.push({ key: "char", min: req.char });
  if (req.cl && (state.cl?.any ?? 0) < req.cl) missing.push({ key: "cl", min: req.cl });
  for (const [k, min] of Object.entries(req.skills ?? {})) if (Math.floor(state.ranks?.[k] ?? 0) < min) missing.push({ key: "skill", skill: k, min });
  for (const [en, min] of Object.entries(req.cls ?? {})) {
    const have = classLevelsAt(d, state.level, en);
    if (have < min) missing.push({ key: "cls", cls: en, min });
  }
  for (const c of req.can ?? []) if (!state.can?.[c]) missing.push({ key: "can", can: c });
  for (const need of req.feats ?? []) if (!hasFeat(need, choice, taken)) missing.push({ key: "feat", feat: need.replace(/[*=].*$/, ""), choice: need.includes("=") ? need.split("=")[1] : need.endsWith("*") ? choice?.value ?? null : null });
  if (req.anyFeats?.length && !req.anyFeats.some((n) => hasFeat(n, choice, taken))) missing.push({ key: "anyFeat", feats: req.anyFeats });
  return { ok: !missing.length, missing, special: req.special ?? null };
}

/** Levels in a class (by English name) at a character level. */
export function classLevelsAt(d, level, en) {
  let n = 0;
  for (const p of d.perLevel.slice(0, level)) for (const x of p.parts ?? []) if (same(baseName(x.cls.en), en)) n++;
  return n;
}

/** "Power Attack", "Weapon Focus*" (the same choice), "Spell Focus=con" (that choice). */
function hasFeat(need, choice, taken) {
  const star = need.endsWith("*"), eq = need.indexOf("=");
  const name = need.replace(/\*$/, "").split("=")[0];
  const want = star ? choice?.value : eq > 0 ? need.slice(eq + 1) : null;
  return taken.some((t) => same(t.feat.base, name) && (want == null || String(t.choice?.value ?? "") === String(want)));
}

/** Feats taken up to a level, and the other feats of that level (so two feats of one level can build on each other). */
export function takenUpTo(d, level, exceptSlot = null) {
  return d.feats.filter((f) => f.level < level || (f.level === level && f.slot !== exceptSlot));
}

/* -------------------------------------------- */
/*  Checks                                      */
/* -------------------------------------------- */

/**
 * What isn't right yet: [{ step, level, code, data, severity: "error" | "warn" | "info" }].
 * Errors stop nothing (the GM can still create the actor); they are the rules being broken.
 */
export function check(plan, cat, d = derive(plan, cat)) {
  const out = [];
  const add = (step, code, data = {}, severity = "warn", level = null) => out.push({ step, code, data, severity, level });
  if (!plan.name?.trim()) add("basics", "noName", {}, "info");
  if (!d.race) add("basics", "noRace");
  if (plan.abilities?.method === "pointbuy") {
    const spent = R.pointTotal(plan.abilities.base), budget = Number(plan.abilities.budget) || 0;
    if (spent > budget) add("abilities", "overBudget", { n: spent - budget }, "error");
    else if (spent < budget) add("abilities", "underBudget", { n: budget - spent }, "info");
  }
  if (!plan.levels?.length) add("classes", "noLevels", {}, "error");
  const seen = new Set();
  d.perLevel.forEach((p) => {
    const L = p.level;
    if (!p.cls) { add("classes", "noClass", { level: L }, "error", L); return; }
    for (const { cls: pc, level: pl } of p.parts) {
      if (!seen.has(pc.uuid)) {
        seen.add(pc.uuid);
        if (!clsAlignmentOk(pc, plan.alignment)) add("classes", "alignment", { cls: pc.name }, "warn", L);
      }
      if (pc.maxLevel && pl > pc.maxLevel) add("classes", "maxLevel", { cls: pc.name, max: pc.maxLevel }, "error", L);
    }
    // Gestalt: two different classes every level
    if (plan.gestalt && !p.cls.gestalt) add("classes", "gestaltOne", { level: L }, "warn", L);
    if (p.cls.gestalt && p.cls.gestalt[0].uuid === p.cls.gestalt[1].uuid) add("classes", "gestaltSame", { level: L, cls: p.cls.gestalt[0].name }, "error", L);
    if (p.hp < 1 || p.hp > p.hd) add("classes", "hp", { level: L, hd: p.hd }, "warn", L);
    if (p.increase && !plan.levels[L - 1]?.increase) add("abilities", "increase", { level: L }, "warn", L);
    if (p.skillPoints.left > 0) add("skills", "unspent", { level: L, n: p.skillPoints.left }, "info", L);
    if (p.skillPoints.left < 0) add("skills", "overspent", { level: L, n: -p.skillPoints.left }, "error", L);
    for (const [k, r] of Object.entries(p.ranks)) {
      const max = p.anyClassSkill(k) ? p.maxClass : p.maxCross;
      if (r > max) add("skills", "maxRanks", { level: L, skill: k, max }, "error", L);
    }
    const lv = plan.levels[L - 1];
    // A feat whose slot is gone (the level's class changed)
    for (const f of lv.feats ?? []) if (f.uuid && !p.slots.some((s) => s.slot === f.slot)) add("feats", "noSlot", { level: L, feat: cat.feats.get(f.uuid)?.name ?? "?" }, "warn", L);
    for (const s of p.slots) {
      const pick = lv.feats?.find((f) => f.slot === s.slot);
      if (!pick?.uuid) { add("feats", "emptySlot", { level: L, slot: s.slot }, "warn", L); continue; }
      const feat = cat.feats.get(pick.uuid);
      if (!feat) continue;
      if (feat.choice && !pick.choice?.value) add("feats", "noChoice", { level: L, feat: feat.name }, "warn", L);
      // A special ability (the rogue's): only in its own slots, each once (Skill Mastery can be taken again)
      if (feat.special) {
        if (!s.special || !(s.from ?? []).some((n) => same(n, feat.base))) add("feats", "notHere", { level: L, feat: feat.name }, "error", L);
        else if (!feat.req?.multi && takenUpTo(d, L, s.slot).some((t) => t.feat.special && same(t.feat.base, feat.base))) add("feats", "specialTwice", { level: L, feat: feat.name }, "error", L);
        continue;
      }
      if (s.ignorePrereqs) continue;
      const res = prereqs(feat, pick.choice, p, takenUpTo(d, L, s.slot), d);
      if (!res.ok) add("feats", "prereq", { level: L, feat: feat.name, missing: res.missing }, "warn", L);
    }
  });
  // Domains, specialist schools and their special slots
  for (const [code, data, severity] of specIssues(plan, cat, d)) add("spells", code, data, severity);
  // The same feat twice (unless it can be taken again with a different choice)
  const keys = new Map();
  for (const f of d.feats) {
    const multi = !!f.feat.req?.multi;
    const k = `${f.feat.base.toLowerCase()}|${multi ? f.choice?.value ?? "" : ""}`;
    if (keys.has(k) && (!multi || f.choice?.value != null)) add("feats", "twice", { feat: f.feat.name, level: f.level }, "warn", f.level);
    keys.set(k, true);
  }
  // Multiclass XP penalty (SRD): -20% for each class more than one level below the highest (favored and prestige classes don't count)
  const xp = xpPenalty(plan, d);
  if (xp.pct) add("classes", "xpPenalty", { pct: xp.pct, classes: xp.behind.map((c) => c.name), top: xp.top.name, favored: xp.favored?.name ?? null }, "warn");
  // Prestige classes: their requirements met before the first level taken (data/prestige.json, a GM's own in the world)
  try { out.push(...prestigeIssues(plan, cat, d, cat.data?.prestige ?? {}, cat.prestigeCustom?.() ?? {}, cat.prestigeOpts ?? {})); } catch (e) { console.warn("A&M | prestige requirements", e); }
  return out;
}
