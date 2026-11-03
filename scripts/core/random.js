/**
 * A&M v2 — random characters, with no Foundry code. Fills a plan the same way a person would on the steps,
 * following each class's profile (data/profiles.json, modelled on the DMG's sample NPCs).
 *
 * randomPlan(opts, cat, data, rng) → plan
 *   opts: { kind, race, sex, alignment, classes: [{ cls, levels }], level, method, budget, hpMethod, maxFirst }
 *         anything left empty is chosen (race, sex, alignment, class, level).
 *   data: { profiles: { classes: { "Fighter": {...} } }, names: { races, lists } }
 * reroll(plan, part, cat, data, rng): part = "name" | "abilities" | "hp" | "skills" | "feats" | "all".
 */
import * as R from "./rules.js";
import { newPlan, newLevel, derive, prereqs, takenUpTo, baseName, clsAlignmentOk } from "./plan.js";
import { allSpells, favoriteSpells, addSpecials, specFor, specKind, domainAllowed, prohibitedCount, SCHOOLS } from "./spells.js";
import { standardGear, kitGear, wantsKit } from "./gear.js";
import { gestaltKey, ensureGestalt, partsOf } from "./gestalt.js";
import { requirementsOf, missingFor, stateAt } from "./prestige.js";
import { classSkillsFor } from "./variants.js";

const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const weighted = (pairs, rng) => {
  const total = pairs.reduce((n, [, w]) => n + w, 0);
  let r = rng() * total;
  for (const [v, w] of pairs) { r -= w; if (r < 0) return v; }
  return pairs.at(-1)?.[0];
};
const dieOf = (rng) => (n) => Math.floor(rng() * n) + 1;
const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** Races most often met (when none is chosen); others only when chosen. */
const RACE_WEIGHTS = { "Human": 50, "Dwarf, Hill": 12, "Halfling, Lightfoot": 10, "Elf, High": 8, "Gnome, Rock": 8, "Half-Elf": 8, "Half-Orc": 4 };
const PC_CLASSES = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Wizard"];
const NPC_CLASSES = { "Commoner (NPC)": 30, "Warrior (NPC)": 20, "Expert (NPC)": 18, "Aristocrat (NPC)": 6, "Adept (NPC)": 6 };

export const profileOf = (cls, data) => {
  if (cls?.gestalt) { // a gestalt class: the first class's profile, with the second's skills and feats after its own
    const [a, b] = cls.gestalt.map((c) => profileOf(c, data));
    const join = (x, y) => [...(x ?? []), ...(y ?? []).filter((v) => !(x ?? []).some((w) => JSON.stringify(w) === JSON.stringify(v)))];
    // The abilities in the first class's order, with a casting ability of either class right after its first
    const cast = cls.gestalt.map((c) => c.casting?.ability).filter(Boolean);
    const first = (a.abilities ?? R.ABILITIES)[0];
    const abilities = [...new Set([first, ...cast, ...(a.abilities ?? R.ABILITIES), ...(b.abilities ?? [])])];
    // Skills alternate between the two classes' favourites (a fighter // rogue climbs and searches)
    const mix = (x = [], y = []) => { const out = []; for (let i = 0; i < Math.max(x.length, y.length); i++) for (const v of [x[i], y[i]]) if (v != null && !out.includes(v)) out.push(v); return out; };
    return { ...b, ...a, abilities, increases: a.increases?.length ? a.increases : [first], skills: mix(a.skills, b.skills), feats: join(a.feats, b.feats), subSkills: { ...(b.subSkills ?? {}), ...(a.subSkills ?? {}) }, alignments: (a.alignments ?? R.ALIGNMENTS).filter((x) => (b.alignments ?? R.ALIGNMENTS).includes(x)) };
  }
  const all = data?.profiles?.classes ?? {};
  // "Psion (Egoist)" → the Psion profile
  const base = all[baseName(cls?.en)] ?? all[cls?.en] ?? all[baseName(cls?.en).replace(/\s*\([^)]*\)\s*$/, "")] ?? genericProfile(cls);
  // A build of the class (data.variants: { class uuid: "Archer" }): its fields replace the class's own
  const v = cls?.uuid ? data?.variants?.[cls.uuid] : null;
  return v && base.variants?.[v] ? { ...base, ...base.variants[v], variant: v } : base;
};

/** The builds of a class: [{ key: "" (its own), label }, { key: "Archer", label: "Archer" }…]. */
export function variantsOf(cls, data) {
  if (!cls || cls.gestalt) return [];
  const base = profileOf(cls, { ...data, variants: {} });
  const keys = Object.keys(base.variants ?? {}).filter((k) => base.variants[k]);
  return keys.length ? [{ key: "", label: base.label || "Standard" }, ...keys.map((k) => ({ key: k, label: k }))] : [];
}

/**
 * The profiles with a GM's own (world setting): { Class: { label?, own?, variants: { name: profile | null } } }. A GM's
 * build replaces the shipped one of the same name; null hides a shipped build; label renames the class's own build and
 * own changes its fields.
 */
export function mergeProfiles(profiles, custom) {
  const out = { ...(profiles ?? {}), classes: { ...(profiles?.classes ?? {}) } };
  for (const [en, c] of Object.entries(custom ?? {})) {
    if (!c || typeof c !== "object") continue;
    const key = Object.keys(out.classes).find((k) => k.toLowerCase() === en.toLowerCase()) ?? en;
    const base = out.classes[key] ?? {};
    const variants = { ...(base.variants ?? {}) };
    for (const [name, v] of Object.entries(c.variants ?? {})) { if (v === null) delete variants[name]; else variants[name] = v; }
    out.classes[key] = { ...base, ...(c.own ?? {}), ...(c.label ? { label: c.label } : {}), variants };
  }
  return out;
}

/** Random builds for the plan's classes (opts.variants: { class uuid: build | "random" }), only for classes that have some. */
function chooseVariants(opts, plan, cat, data, rng) {
  const out = {};
  const uuids = [...new Set(plan.levels.flatMap((lv) => partsOf(lv.cls)))];
  for (const u of uuids) {
    const list = variantsOf(cat.classes.get(u), data);
    if (!list.length) continue;
    const asked = opts.variants?.[u];
    out[u] = asked !== undefined && asked !== "random" && list.some((v) => v.key === asked) ? asked : pick(list, rng).key;
  }
  return out;
}
/** A profile worked out from the class itself, for classes without one. */
function genericProfile(cls) {
  const casting = cls?.casting?.ability;
  const ab = casting ? [casting] : cls?.bab === "high" ? ["str", "con"] : ["dex", "con"];
  const order = [...ab, ...["str", "dex", "con", "wis", "int", "cha"].filter((a) => !ab.includes(a))];
  return { abilities: order, increases: [order[0]], skills: Object.keys(cls?.classSkills ?? {}), feats: ["Improved Initiative", "Toughness", "Iron Will", "Lightning Reflexes", "Great Fortitude", "Dodge", "Alertness"], alignments: R.ALIGNMENTS, generic: true };
}

const byEn = (list, en) => list.find((e) => same(baseName(e.en), en) || same(e.en, en));

/* ---------- Parts ---------- */

function chooseRace(opts, cat, rng) {
  if (opts.race && cat.races.has(opts.race)) return opts.race;
  const list = [...cat.races.values()];
  const pairs = list.filter((r) => RACE_WEIGHTS[r.en]).map((r) => [r.uuid, RACE_WEIGHTS[r.en]]);
  return pairs.length ? weighted(pairs, rng) : list.length ? pick(list, rng).uuid : null;
}

function randomClass(opts, cat, rng, not = []) {
  const all = [...cat.classes.values()].filter((c) => !not.includes(c.uuid) && !c.variant && !c.gestalt); // a variant only when asked for
  if (opts.kind === "npc" && rng() < 0.6) { const pairs = Object.entries(NPC_CLASSES).map(([n, w]) => [byEn(all, n), w]).filter(([c]) => c); if (pairs.length) return weighted(pairs, rng); }
  const core = PC_CLASSES.map((n) => byEn(all, n)).filter(Boolean);
  return core.length ? pick(core, rng) : pick(all.filter((c) => c.kind === "base"), rng);
}

function chooseClasses(opts, cat, rng) {
  // Rows: a class (or "" for a random one) with its levels (0: to be worked out)
  let rows = (opts.classes ?? []).filter((r) => (r.cls && cat.classes.has(r.cls)) || !r.cls).map((r) => ({ cls: r.cls || null, levels: Math.max(0, Number(r.levels) || 0) }));
  if (!rows.length) rows = [{ cls: null, levels: 0 }];
  // A random class that can share an alignment with the others (no monk/barbarian mixes)
  const fits = (uuids) => R.ALIGNMENTS.some((a) => uuids.every((u) => clsAlignmentOk(cat.classes.get(u), a)) && (!opts.alignment || a === opts.alignment));
  for (const r of rows) if (!r.cls) {
    const others = rows.map((x) => x.cls).filter(Boolean);
    for (let tries = 0; tries < 20 && !r.cls; tries++) { const c = randomClass(opts, cat, rng, others)?.uuid; if (c && fits([...others, c])) r.cls = c; }
    r.cls ??= randomClass(opts, cat, rng, others)?.uuid ?? null;
  }
  rows = rows.filter((r) => r.cls);
  const total = Math.max(0, Number(opts.level) || 0);
  // Levels: what was asked, else the total spread over the classes without a number, else 1 to 5
  const fixed = rows.reduce((n, r) => n + r.levels, 0);
  const open = rows.filter((r) => !r.levels);
  if (open.length) {
    if (total) {
      let left = Math.max(open.length, total - fixed);
      open.forEach((r, i) => { const share = i === open.length - 1 ? left : Math.max(1, Math.round(left / (open.length - i))); r.levels = share; left -= share; });
    } else {
      // No level given: 1 to 5 for a single class, 1 to 3 in each class of a mix
      open.forEach((r) => { r.levels = rows.length === 1 ? 1 + Math.floor(rng() * 5) : 1 + Math.floor(rng() * 3); });
    }
  }
  return rows.filter((r) => r.levels > 0);
}

function chooseAlignment(opts, classes, cat, data, rng) {
  const allowed = (a) => classes.every((r) => clsAlignmentOk(cat.classes.get(r.cls), a));
  if (opts.alignment && R.ALIGNMENTS.includes(opts.alignment)) return opts.alignment;
  const prof = profileOf(cat.classes.get(classes[0]?.cls), data);
  const list = (prof.alignments ?? R.ALIGNMENTS).filter(allowed);
  const pool = list.length ? list : R.ALIGNMENTS.filter(allowed);
  if (!pool.length) return "tn";
  return weighted(pool.map((a, i) => [a, pool.length - i]), rng);
}

/** Point buy by the profile's order: the first ability up to 16, then the others, while points last. */
function pointBuy(order, budget) {
  const s = Object.fromEntries(R.ABILITIES.map((a) => [a, 8]));
  const caps = [16, 14, 14, 12, 12, 10];
  let left = budget;
  // Each ability in turn up to its cap (raising them all a point at a time left every score near 12)
  for (let i = 0; i < order.length; i++) {
    const a = order[i];
    while (s[a] < caps[i] && R.pointCost(s[a] + 1) - R.pointCost(s[a]) <= left) { left -= R.pointCost(s[a] + 1) - R.pointCost(s[a]); s[a]++; }
  }
  // Points still left: raise the first ability as far as they go
  while (s[order[0]] < 18 && R.pointCost(s[order[0]] + 1) - R.pointCost(s[order[0]]) <= left) { left -= R.pointCost(s[order[0]] + 1) - R.pointCost(s[order[0]]); s[order[0]]++; }
  return s;
}

export function rollAbilities(plan, cat, data, rng) {
  const ab = plan.abilities;
  const prof = profileOf(cat.classes.get(plan.levels[0]?.cls), data);
  const order = prof.abilities ?? R.ABILITIES;
  if (ab.method === "pointbuy") { ab.base = pointBuy(order, Number(ab.budget) || 25); ab.pool = null; ab.pick = {}; }
  else {
    const pool = ab.method === "elite" ? R.ARRAYS.elite.slice() : ab.method === "nonelite" ? R.ARRAYS.nonelite.slice() : R.ABILITIES.map(() => R.rollScore(ab.dice ?? "4d6", dieOf(rng)));
    if (ab.method === "typed") ab.method = "roll";
    ab.pool = pool;
    const idx = pool.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).map(([, i]) => i);
    ab.pick = {}; order.forEach((a, n) => { ab.pick[a] = String(idx[n]); });
    for (const a of R.ABILITIES) ab.base[a] = pool[Number(ab.pick[a])];
  }
  // Increases at 4, 8, 12 … by the profile
  const inc = prof.increases?.length ? prof.increases : [order[0]];
  let n = 0;
  plan.levels.forEach((lv, i) => { lv.increase = R.hasIncrease(i + 1) ? inc[Math.min(n++, inc.length - 1)] : null; });
}

export function rollHp(plan, cat, rng) {
  plan.levels.forEach((lv, i) => {
    const c = cat.classes.get(lv.cls);
    lv.hp = c ? R.hpFor(c.hd, { method: plan.hp?.method ?? "average", first: i === 0, maxFirst: plan.hp?.maxFirst !== false, die: dieOf(rng) }) : 0;
  });
}

/** Named sub-skills (Craft, Perform, Profession) a profile uses, added to the plan; → the key to spend on. */
function subKey(plan, parent, name) {
  let s = plan.subSkills.find((x) => x.parent === parent && same(x.name, name));
  if (!s) { let n = 1; while (plan.subSkills.some((x) => x.tag === `${parent}${n}`)) n++; s = { tag: `${parent}${n}`, parent, name }; plan.subSkills.push(s); }
  return s.tag;
}

/** only: a Set of levels to redo (Edit's Fill in); the other levels keep their skills. */
export function rollSkills(plan, cat, data, rng, { only = null } = {}) {
  plan.levels.forEach((lv, i) => { if (!only || only.has(i + 1)) lv.skills = {}; });
  const arbitrary = new Set(cat.skills.filter((s) => s.arbitrary).map((s) => s.key));
  for (let L = 1; L <= plan.levels.length; L++) {
    if (only && !only.has(L)) continue;
    const lv = plan.levels[L - 1], cls = cat.classes.get(lv.cls); if (!cls) continue;
    const prof = profileOf(cls, data);
    const keys = (prof.skills ?? []).map((k) => (arbitrary.has(k) ? (prof.subSkills?.[k] ? subKey(plan, k, prof.subSkills[k]) : null) : k)).filter(Boolean);
    const cs = classSkillsFor(plan, cls, cat);
    const classSkill = (k) => { const sub = plan.subSkills.find((s) => s.tag === k); return !!cs[sub ? sub.parent : k]; };
    // Class skills first, in the profile's order; then the class's other skills (not Craft/Perform/Profession without a name)
    const order = [...keys.filter(classSkill), ...Object.keys(cs).filter((k) => !keys.includes(k) && !arbitrary.has(k))];
    const d = derive(plan, cat), p = d.perLevel[L - 1], prev = d.perLevel[L - 2];
    let left = p.skillPoints.gain;
    const ranks = (k) => (prev?.ranks?.[k] ?? 0) + (lv.skills[k] ?? 0) * (classSkill(k) ? 1 : 0.5);
    const max = (k) => (p.anyClassSkill(k) ? p.maxClass : p.maxCross);
    // Spread over the first few skills (as the DMG's NPCs do): a round adds a rank to each skill still below its maximum
    const perLevel = L === 1 ? Math.floor(p.skillPoints.gain / 4) : p.skillPoints.gain;
    const focus = order.slice(0, Math.max(2, perLevel));
    // Each point to the skill (of the first few) with the fewest ranks, so they rise together; then any class skill
    for (const list of [focus, order]) {
      while (left > 0) {
        const open = list.filter((k) => ranks(k) + (classSkill(k) ? 1 : 0.5) <= max(k));
        if (!open.length) break;
        const k = open.reduce((best, x) => (ranks(x) < ranks(best) ? x : best), open[0]);
        lv.skills[k] = (lv.skills[k] ?? 0) + 1; left--;
      }
    }
  }
}

/** The feats a slot may take, best first. */
function candidates(slot, cls, prof, firstProf, cat, d) {
  const all = cat.list?.feats ?? [...cat.feats.values()].filter((f) => !f.special);
  const specials = cat.list?.specials ?? [...cat.feats.values()].filter((f) => f.special);
  const find = (f) => {
    const name = typeof f === "string" ? f : f.name;
    const pool = slot.special ? [...specials, ...all] : all;
    const feat = pool.find((x) => same(x.base, name) && !x.epic) ?? pool.find((x) => same(x.name, name));
    return feat ? { feat, choice: typeof f === "string" ? null : f.choice ?? null } : null;
  };
  const list = [...(prof.feats ?? []), ...(firstProf && firstProf !== prof ? firstProf.feats ?? [] : [])].map(find).filter(Boolean);
  if (slot.special) {
    // A class special ability (the rogue's): the profile's for that level, the others in turn, or (when allowed) a feat
    const bonus = prof.bonusFeats ?? {};
    const from = new Set((slot.from ?? []).map((n) => n.toLowerCase()));
    const fixed = bonus[String(slot.classLevel)] ? [find(bonus[String(slot.classLevel)])].filter(Boolean) : [];
    const order = [...Object.values(bonus).filter((v) => typeof v === "string"), ...(slot.from ?? [])];
    const own = [...new Set(order.map((n) => n.toLowerCase()))].filter((n) => from.has(n)).map((n) => specials.find((x) => x.base.toLowerCase() === n)).filter(Boolean).map((feat) => ({ feat, choice: null }));
    const feats = slot.orFeat ? [...list, ...all.filter((f) => !f.epic && !f.psionic && !f.req?.monster && !f.choice && f.req).map((feat) => ({ feat, choice: null, fallback: true }))] : [];
    return [...fixed, ...own, ...feats];
  }
  if (slot.slot.startsWith("class")) {
    const classLevel = slot.classLevel;
    const bonus = prof.bonusFeats ?? {};
    const fixed = bonus[String(classLevel)] ? [find(bonus[String(classLevel)])].filter(Boolean) : [];
    const own = Array.isArray(bonus.wizard) ? bonus.wizard.map(find).filter(Boolean) : [];
    const from = new Set((slot.from ?? []).map((n) => n.toLowerCase()));
    const fits = (c) => from.has(c.feat.base.toLowerCase()) || (slot.psionic && c.feat.psionic);
    return [...fixed, ...own.filter(fits), ...list.filter(fits), ...all.filter((f) => !f.epic && fits({ feat: f })).map((feat) => ({ feat, choice: null, fallback: true }))];
  }
  const generalFallback = all.filter((f) => !f.epic && !f.psionic && !f.req?.monster && !f.choice && f.req).map((feat) => ({ feat, choice: null, fallback: true }));
  return [...list, ...generalFallback];
}

/** only(level, slot): the slots to fill again (Edit's Fill in); the other slots keep their feats. */
export function rollFeats(plan, cat, data, rng, { only = null } = {}) {
  plan.levels.forEach((lv, i) => { lv.feats = only ? lv.feats.filter((f) => !only(i + 1, f.slot)) : []; });
  const firstProf = profileOf(cat.classes.get(plan.levels[0]?.cls), data);
  for (let L = 1; L <= plan.levels.length; L++) {
    let d = derive(plan, cat);
    const p = d.perLevel[L - 1]; if (!p?.cls) continue;
    const prof = profileOf(p.cls, data);
    for (const s of p.slots) {
      if (only && !only(L, s.slot)) continue;
      d = derive(plan, cat);
      const state = d.perLevel[L - 1];
      const taken = takenUpTo(d, L, s.slot);
      // Taken already: the same feat (with the same choice, for feats taken once per weapon, skill or school)
      const has = (feat, choice) => taken.some((t) => same(t.feat.base, feat.base) && (!feat.choice || !feat.req?.multi || String(t.choice?.value ?? "") === String(choice?.value ?? "")));
      // A class bonus feat follows its own class's profile and level (a gestalt level has two classes)
      const own = s.cls ? cat.classes.get(s.cls) : null;
      const list = candidates({ ...s, classLevel: s.classLevel ?? state.classLevel }, own ?? p.cls, own ? profileOf(own, data) : prof, firstProf, cat, d);
      let chosen = null;
      const fallbacks = [];
      for (const c of list) {
        let choice = null;
        if (c.feat.choice) {
          if (c.choice) {
            const o = c.feat.choice.kind === "custom" ? c.feat.choice.options.find((x) => same(x.value, c.choice)) : { value: c.choice, label: cat.skills.find((k) => k.key === c.choice)?.label ?? c.choice };
            if (!o) continue;
            choice = { value: o.value, label: o.label };
          } else continue; // a feat needing a choice the profile didn't give
        }
        if (has(c.feat, choice)) continue;
        const ok = s.ignorePrereqs || prereqs(c.feat, choice, state, taken, d).ok;
        if (!ok) continue;
        if (c.fallback) { fallbacks.push({ ...c, choiceObj: choice }); continue; }
        chosen = { ...c, choiceObj: choice }; break;
      }
      if (!chosen && fallbacks.length) chosen = pick(fallbacks, rng);
      if (chosen) plan.levels[L - 1].feats.push({ slot: s.slot, uuid: chosen.feat.uuid, choice: chosen.choiceObj ?? null });
    }
  }
}

export function rollLanguages(plan, cat, rng) {
  const d = derive(plan, cat), race = d.race, ext = race?.ext ?? {};
  const auto = ext.languages ?? [];
  const list = (ext.bonusLanguages === "any" || !race ? cat.languages.map((l) => l.key) : ext.bonusLanguages ?? []).filter((k) => !auto.includes(k));
  const n = Math.max(0, R.mod(d.perLevel[0]?.abilities?.int ?? 10));
  const out = [];
  if (list.includes("common") && n) out.push("common");
  const rest = list.filter((k) => !out.includes(k));
  while (out.length < n && rest.length) out.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  plan.languages = out;
}

/** Spells for each caster class (needs data.extras.spellIndex). */
/**
 * A cleric's two domains and a wizard's school (specialist or not, and its prohibited schools), by the class profile:
 * profile.domains (favourite domain names), profile.specialist (the chance of specializing, default 0.5),
 * profile.schools (favourite schools, codes), profile.prohibit (schools it gives up first). Only classes with no choice
 * yet, unless force. Alignment domains only for clerics who share that alignment (SRD).
 */
export function rollSpecs(plan, cat, d, profiles, rng, { force = false } = {}) {
  plan.specs ??= {};
  for (const { cls } of d.parts ?? d.classes) {
    const kind = specKind(cls);
    if (!kind || (plan.specs[cls.uuid] && !force)) continue;
    const prof = profiles?.classes?.[baseName(cls.en)] ?? {};
    if (kind === "domains") {
      const all = (cat.list?.domains ?? []).filter((x) => domainAllowed(x, plan.alignment));
      const name = (x) => x.en.replace(/\s*domain$/i, "").trim().toLowerCase();
      const fav = (prof.domains ?? []).map((n) => all.find((x) => name(x) === String(n).toLowerCase())).filter(Boolean);
      const out = [];
      const pool = [...fav];
      while (out.length < 2 && pool.length) out.push(pool.splice(Math.floor(rng() * Math.min(pool.length, 4)), 1)[0]);
      const rest = all.filter((x) => !out.includes(x));
      while (out.length < 2 && rest.length) out.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
      plan.specs[cls.uuid] = { domains: out.map((x) => x.uuid) };
    } else {
      const schools = cat.list?.schools ?? [];
      if (!schools.length || rng() >= (prof.specialist ?? 0.5)) { plan.specs[cls.uuid] = { school: null, prohibited: [] }; continue; }
      const favKeys = (prof.schools ?? []).filter((k) => schools.some((x) => x.key === k));
      const key = favKeys.length && rng() < 0.7 ? favKeys[Math.floor(rng() * Math.min(favKeys.length, 3))] : pick(schools, rng).key;
      const school = schools.find((x) => x.key === key);
      const order = [...(prof.prohibit ?? []), ...SCHOOLS].filter((k, i, a) => k !== key && k !== "div" && a.indexOf(k) === i);
      const prohibited = [];
      const pool = [...order];
      while (prohibited.length < prohibitedCount(key) && pool.length) prohibited.push(pool.splice(Math.floor(rng() * Math.min(pool.length, 3)), 1)[0]);
      plan.specs[cls.uuid] = { school: school?.uuid ?? null, prohibited: school ? prohibited : [] };
    }
  }
}

export function rollSpells(plan, cat, data, rng) {
  if (!data?.extras?.spellIndex) return;
  rollSpecs(plan, cat, derive(plan, cat), data.profiles, rng);
  plan.spells = allSpells(plan, cat, derive(plan, cat), data.extras.spellIndex, data.profiles, rng, { nonSrd: Number(data.settings?.nonSrdSpells ?? 1) || 0 });
}
/**
 * Edit: the spells new levels bring, added to what each caster class has (its spells stay): as many spells of each
 * level as a fresh character would have, and the day's prepared spells topped up to its slots.
 */
export function mergeSpells(plan, cat, data, rng) {
  if (!data?.extras?.spellIndex) return;
  const d = derive(plan, cat);
  rollSpecs(plan, cat, d, data.profiles, rng);
  const fresh = allSpells(plan, cat, d, data.extras.spellIndex, data.profiles, rng, { nonSrd: Number(data.settings?.nonSrdSpells ?? 1) || 0 });
  plan.spells ??= {};
  for (const [cls, list] of Object.entries(fresh)) {
    const have = (plan.spells[cls] ??= []);
    const levels = [...new Set(list.map((s) => s.level))];
    for (const sl of levels) {
      const want = list.filter((s) => s.level === sl);
      const here = () => have.filter((s) => s.level === sl);
      const known = (s) => have.some((h) => h.level === sl && (h.uuid === s.uuid || same(h.name, s.name)));
      for (const s of want) { if (here().length >= want.length) break; if (!known(s)) have.push({ ...s }); }
      // Prepared: up to what a fresh character prepares at this level
      const day = want.reduce((n, s) => n + (s.prepared || 0), 0);
      let prepared = here().reduce((n, s) => n + (s.prepared || 0), 0);
      const order = [...here()].sort((a, b) => (want.find((w) => w.uuid === b.uuid)?.prepared || 0) - (want.find((w) => w.uuid === a.uuid)?.prepared || 0));
      for (let i = 0; prepared < day && order.length && i < 200; i++) { order[i % order.length].prepared = (order[i % order.length].prepared || 0) + 1; prepared++; }
    }
  }
  // Domain spells and special slots of the new spell levels (the ones already chosen stay)
  for (const { cls, levels } of d.parts ?? d.classes) {
    const spec = specFor(plan, cat, cls);
    if (!spec.kind || !plan.spells[cls.uuid]) continue;
    const fav = favoriteSpells(data.profiles, cls);
    addSpecials(plan.spells[cls.uuid], cls, levels, d.abilities[cls.casting?.ability || "int"], data.extras.spellIndex, spec, { favorites: fav, rng, keep: true });
  }
}
/** The DMG's standard gear for the main class at the character's level (needs data.extras.gear). */
export function rollGear(plan, cat, data, { kit = true } = {}) {
  if (!data?.extras?.gear) return;
  const d = derive(plan, cat);
  // The main class's build may change its weapons (an archer's bow, a two-handed sword, no shield)
  const main = [...(d.classes ?? [])].sort((a, b) => b.levels - a.levels)[0]?.cls;
  const mods = main ? profileOf(main, { ...data, variants: plan.variants ?? data.variants ?? {} }).gear ?? null : null;
  const items = standardGear(plan, cat, data.extras.gear, d, mods);
  // The adventuring kit (Ultimate Equipment's class kits) for a PC, or when ticked (not for an edit: the actor has its own)
  if (kit && wantsKit(plan)) items.push(...kitGear(plan, cat, data.extras.gear, d));
  plan.gear = { items, loot: plan.gear?.loot !== false, ...(typeof plan.gear?.kit === "boolean" ? { kit: plan.gear.kit } : {}), ...(plan.gear?.startGold ? { startGold: plan.gear.startGold } : {}) };
}

export function rollName(plan, cat, data, rng) {
  const race = cat.races.get(plan.race);
  const en = String(race?.en ?? "Human");
  const map = data?.names?.races ?? {};
  const key = map[en] ?? map[en.split(",")[0].trim()] ?? "human";
  const lists = data?.names?.lists?.[key] ?? data?.names?.lists?.human;
  if (!lists) return;
  const sex = /^f/i.test(plan.sex) ? "female" : "male";
  plan.name = `${pick(lists[sex] ?? lists.male, rng)} ${pick(lists.last, rng)}`;
}

/* ---------- Whole characters ---------- */

/**
 * A random character, one part at a time: yields the name of the part it is about to roll ("abilities", "spells"…),
 * so a caller can show progress between parts; returns the plan.
 */
function* planSteps(opts, cat, data, rng) {
  yield "classes";
  ensureGestalt(cat.classes);
  const plan = newPlan({ kind: opts.kind || "character", abilityMethod: opts.method || "elite", budget: opts.budget || 25, hpMethod: opts.hpMethod || "average", maxFirst: opts.maxFirst ?? true });
  plan.race = chooseRace(opts, cat, rng);
  plan.sex = opts.sex || (rng() < 0.5 ? "Male" : "Female");
  let classes;
  if (opts.gestalt) {
    // Gestalt: two classes (as asked, else random ones that can share an alignment) at every level
    const rows = (opts.classes ?? []).slice(0, 2);
    const total = Math.max(1, Number(opts.level) || Math.max(...rows.map((r) => Number(r.levels) || 0), 0) || 1 + Math.floor(rng() * 5));
    while (rows.length < 2) rows.push({ cls: "" });
    classes = chooseClasses({ ...opts, level: 0, classes: rows.map((r) => ({ cls: r.cls, levels: total })) }, cat, rng);
    if (classes.length === 2 && classes[0].cls === classes[1].cls) classes[1].cls = randomClass(opts, cat, rng, [classes[0].cls])?.uuid ?? classes[1].cls;
    plan.gestalt = true;
    for (let i = 0; i < total; i++) plan.levels.push(newLevel(gestaltKey(classes[0]?.cls, classes[1]?.cls)));
  } else {
    classes = chooseClasses(opts, cat, rng);
    for (const r of classes) for (let i = 0; i < r.levels; i++) plan.levels.push(newLevel(r.cls));
  }
  // Each class's build (Archer, Two-handed…): the rolls below follow it
  plan.variants = chooseVariants(opts, plan, cat, data, rng);
  data = { ...data, variants: plan.variants };
  plan.alignment = chooseAlignment(opts, classes, cat, data, rng);
  yield "abilities";
  rollAbilities(plan, cat, data, rng);
  rollHp(plan, cat, rng);
  yield "skills";
  rollSkills(plan, cat, data, rng);
  yield "feats";
  rollFeats(plan, cat, data, rng);
  // A prestige class (opts.prestige: "random" or one class), from the first level the character qualifies for it
  if (opts.prestige) {
    const pr = addPrestige(plan, cat, opts.prestige, rng);
    if (pr) {
      rollHp(plan, cat, rng);
      const later = new Set(Array.from({ length: plan.levels.length - pr.from + 1 }, (_, i) => pr.from + i));
      rollSkills(plan, cat, data, rng, { only: later });
      rollFeats(plan, cat, data, rng, { only: (L) => L >= pr.from });
    }
    plan._prestige = pr ? { cls: pr.cls, from: pr.from } : { none: true };
  }
  rollLanguages(plan, cat, rng);
  yield "spells";
  rollSpells(plan, cat, data, rng);
  yield "gear";
  rollGear(plan, cat, data);
  if (opts.name) plan.name = opts.name; else rollName(plan, cat, data, rng);
  plan._random = { ...opts };
  return plan;
}

/**
 * A prestige class for a random character: the first character level (from 6th for a random one) at which it meets the
 * requirements of one (SRD, or the GM's own), and the levels after it in that class (to its maximum). which: "random"
 * or a class uuid. The character's choices up to then stay. → { cls, from (the first prestige level) } or null.
 */
export function addPrestige(plan, cat, which, rng = Math.random) {
  const total = plan.levels.length;
  if (plan.gestalt || total < 2) return null;
  const srd = cat.data?.prestige ?? {}, custom = cat.prestigeCustom?.() ?? {};
  let list = [...cat.classes.values()].filter((c) => c.kind === "prestige" && !c.variant && !c.gestalt);
  if (which !== "random") list = list.filter((c) => c.uuid === which);
  list = list.map((c) => ({ c, req: requirementsOf(c, srd, custom) })).filter((x) => x.req);
  if (!list.length) return null;
  const d = derive(plan, cat);
  for (let L = which === "random" ? 5 : 1; L < total; L++) {
    const state = stateAt(plan, cat, d, L);
    const ok = list.filter((x) => !missingFor(x.req, state, cat.prestigeOpts ?? {}).length);
    if (!ok.length) continue;
    const { c } = pick(ok, rng);
    const n = Math.min(total - L, Number(c.maxLevel) || 10);
    for (let i = L; i < L + n; i++) plan.levels[i] = { ...newLevel(c.uuid), increase: plan.levels[i].increase ?? null };
    return { cls: c.uuid, from: L + 1 };
  }
  return null;
}

/** A random character (all at once). */
export function randomPlan(opts, cat, data, rng = Math.random) {
  const it = planSteps(opts, cat, data, rng);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
/** A random character, awaiting onStep(part) before each part (the window shows it and the browser gets to draw). */
export async function randomPlanAsync(opts, cat, data, rng = Math.random, onStep = null) {
  const it = planSteps(opts, cat, data, rng);
  let r = it.next();
  while (!r.done) { if (onStep) await onStep(r.value); r = it.next(); }
  return r.value;
}

/** Roll one part of a plan again. Abilities change skill points and prerequisites, so skills and feats follow. */
export function reroll(plan, part, cat, data, rng = Math.random) {
  data = { ...data, variants: plan.variants ?? data?.variants ?? {} };
  if (part === "all") return randomPlan(plan._random ?? {}, cat, data, rng);
  if (part === "name") rollName(plan, cat, data, rng);
  if (part === "hp") rollHp(plan, cat, rng);
  if (part === "abilities") { rollAbilities(plan, cat, data, rng); rollSkills(plan, cat, data, rng); rollFeats(plan, cat, data, rng); rollLanguages(plan, cat, rng); rollSpells(plan, cat, data, rng); rollGear(plan, cat, data); }
  if (part === "spells") rollSpells(plan, cat, data, rng);
  if (part === "gear") rollGear(plan, cat, data);
  if (part === "skills") rollSkills(plan, cat, data, rng);
  if (part === "feats") rollFeats(plan, cat, data, rng);
  return plan;
}
