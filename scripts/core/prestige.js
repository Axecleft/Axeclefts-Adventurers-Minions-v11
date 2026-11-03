/**
 * A&M — prestige class requirements (SRD), with no Foundry code.
 *
 * Requirements (data/prestige.json, and a GM's own kept in the world) are met before the first level of a prestige
 * class is taken: they are checked against the character as it is at the level before. Fields are described in
 * data/prestige.json. → requirementsAt(), the missing ones, and check issues for the plan.
 */
import * as R from "./rules.js";
import { baseName } from "./plan.js";
import { slots, castingKind } from "./spells.js";

const lower = (s) => String(s ?? "").toLowerCase().trim();
const same = (a, b) => lower(a) === lower(b);

/** The alignments a requirement allows ("any evil" → le, ne, ce), or null for any. */
export function alignmentsFor(align) {
  if (!align) return null;
  if (Array.isArray(align)) return align.map(lower);
  const a = lower(align).replace(/^any\s+/, "").replace(/[-\s]/g, "");
  const L = ["lg", "ln", "le"], C = ["cg", "cn", "ce"], G = ["lg", "ng", "cg"], E = ["le", "ne", "ce"];
  const all = R.ALIGNMENTS;
  const map = { lawful: L, chaotic: C, good: G, evil: E, neutral: ["ln", "ng", "tn", "nn", "ne", "cn"],
    nonlawful: all.filter((x) => !L.includes(x)), nonchaotic: all.filter((x) => !C.includes(x)),
    nongood: all.filter((x) => !G.includes(x)), nonevil: all.filter((x) => !E.includes(x)) };
  return map[a] ?? all.filter((x) => x === a);
}

const METAMAGIC = ["Empower Spell", "Enlarge Spell", "Extend Spell", "Heighten Spell", "Maximize Spell", "Quicken Spell", "Silent Spell", "Still Spell", "Widen Spell"];
const ITEM_CREATION = ["Brew Potion", "Craft Construct", "Craft Magic Arms and Armor", "Craft Rod", "Craft Staff", "Craft Wand", "Craft Wondrous Item", "Forge Ring", "Scribe Scroll"];

/** Does a taken feat match "Name" or "Name=choice" (the choice's value or its name, e.g. Weapon Focus=longbow)? */
function featMatches(t, need) {
  const [name, want] = String(need).split("=");
  if (!same(t.feat?.base ?? t.feat?.en ?? t.feat?.name, name)) return false;
  if (!want) return true;
  const w = lower(want), v = lower(t.choice?.value), l = lower(t.choice?.label);
  return v === w || l === w || (w.length > 2 && (v.includes(w) || l.includes(w)));
}

/**
 * The highest spell level a character can cast of a kind ("arcane" | "divine"), from each casting class's slots at
 * its class level (bonus spells count, as for a paladin's first spells).
 */
function castMax(state, kind) {
  let best = -1;
  for (const [u, n] of state.classLevels) {
    const c = state.cat.classes.get(u);
    if (!c?.casting || c.casting.type === "psionic" || (kind && c.casting.type !== kind)) continue;
    const row = slots(c, n, state.abilities?.[c.casting.ability] ?? 10);
    row.forEach((v, sl) => { if (v > 0 && sl > best) best = sl; });
  }
  return best;
}
/** Psionics: the highest power level a character manifests, its manifester level, and whether it has power points. */
function psionics(state) {
  let manifest = 0, ml = 0, pp = false;
  for (const [u, n] of state.classLevels) {
    const c = state.cat.classes.get(u);
    if (c?.casting?.type !== "psionic") continue;
    ml = Math.max(ml, n);
    const max = Number(c.casting.powersMax?.[n]) || 0; // [0, level 1, level 2…]
    manifest = Math.max(manifest, max);
    pp = true;
  }
  if (state.taken.some((t) => featMatches(t, "Wild Talent")) || state.taken.some((t) => /^psionic /i.test(t.feat?.base ?? ""))) pp = true;
  return { manifest, ml, pp };
}
/** Sneak attack dice from the SRD classes that have it. */
function sneakDice(state) {
  let n = 0;
  for (const [u, lv] of state.classLevels) {
    const en = baseName(state.cat.classes.get(u)?.en ?? "");
    if (/^rogue$/i.test(en)) n += Math.ceil(lv / 2);
    else if (/^assassin$/i.test(en)) n += Math.ceil(lv / 2);
    else if (/^arcane trickster$/i.test(en)) n += Math.floor(lv / 2);
    else if (/^blackguard$/i.test(en)) n += lv >= 4 ? Math.floor((lv - 1) / 3) : 0;
  }
  return n;
}
/**
 * A race meets a race requirement when the requirement's words are all in the race's name, English or shown: "Dwarf"
 * is met by Dwarf, "Dwarf, Hill", "Hill Dwarf" and "Deep Dwarf (Duergar)". A hyphenated name is one word, so "Elf"
 * isn't met by Half-Elf (the SRD names Half-Elf where it's allowed).
 */
const words = (s) => lower(s).replace(/[’']/g, "").split(/[^a-z0-9-]+/).filter(Boolean);
export function raceMatches(race, need) {
  const want = words(need);
  if (!race || !want.length) return false;
  return [race.en, race.name].some((n) => { const have = new Set(words(n)); return want.every((w) => have.has(w)); });
}

/** The plan's spells (and powers) known, with the class that casts them: [{ name, uuid, level, cls }]. */
const knownSpells = (plan) => Object.entries(plan.spells ?? {}).flatMap(([cls, list]) => (list ?? []).map((s) => ({ ...s, cls })));

/**
 * The character as it is at a level: { level, abilities, bab, ranks, classLevels: Map(uuid → levels), taken (feats),
 * alignment, race, languages, plan, cat, d }. Level 0: a character with nothing yet.
 */
export function stateAt(plan, cat, d, level) {
  const p = level > 0 ? d.perLevel[level - 1] : null;
  const classLevels = new Map();
  for (const x of d.perLevel.slice(0, Math.max(0, level))) for (const part of x.parts ?? []) classLevels.set(part.cls.uuid, (classLevels.get(part.cls.uuid) ?? 0) + 1);
  const raceLangs = d.race?.ext?.languages ?? [];
  return {
    level, abilities: p?.abilities ?? d.abilities ?? {}, bab: p?.bab ?? 0, ranks: p?.ranks ?? {}, classLevels,
    taken: d.feats.filter((f) => f.level <= level), alignment: plan.alignment, race: d.race,
    languages: [...raceLangs, ...(plan.languages ?? [])].map(lower), plan, cat, d,
  };
}

/**
 * What a character is missing for a prestige class's requirements at a state: [{ key, ... }] (empty: it qualifies).
 * opts: { schoolOf(uuid) → school key, proficient(state) → martial weapons, skillLabel(key) }.
 */
export function missingFor(req, state, opts = {}) {
  const out = [];
  if (!req) return out;
  const miss = (key, data = {}) => out.push({ key, ...data });
  if (req.race?.length && !req.race.some((r) => raceMatches(state.race, r))) miss("race", { list: req.race });
  const okAlign = alignmentsFor(req.align);
  if (okAlign && !okAlign.includes(lower(state.alignment))) miss("align", { align: Array.isArray(req.align) ? req.align.join(", ").toUpperCase() : req.align });
  if (req.bab && state.bab < req.bab) miss("bab", { min: req.bab });
  for (const [k, min] of Object.entries(req.skills ?? {})) if (Math.floor(state.ranks?.[k] ?? 0) < min) miss("skill", { skill: k, min });
  for (const s of req.subSkills ?? []) {
    const subs = (state.plan.subSkills ?? []).filter((x) => x.parent === s.parent && (!s.name || lower(x.name).includes(lower(s.name))));
    const best = Math.max(0, ...subs.map((x) => Math.floor(state.ranks?.[x.tag] ?? 0)));
    if (best < s.min) miss("subSkill", { skill: s.parent, name: s.name, min: s.min });
  }
  if (req.skillsAny) {
    const n = (req.skillsAny.keys ?? []).filter((k) => Math.floor(state.ranks?.[k] ?? 0) >= req.skillsAny.min).length;
    if (n < (req.skillsAny.count ?? 1)) miss("skillsAny", { count: req.skillsAny.count, min: req.skillsAny.min, keys: req.skillsAny.keys });
  }
  for (const f of req.feats ?? []) if (!state.taken.some((t) => featMatches(t, f))) miss("feat", { feat: f.replace("=", " (") + (f.includes("=") ? ")" : "") });
  if (req.anyFeats?.length && !req.anyFeats.some((f) => state.taken.some((t) => featMatches(t, f)))) miss("anyFeat", { list: req.anyFeats.map((f) => f.replace("=", " (") + (f.includes("=") ? ")" : "")) });
  if (req.featsFrom) {
    const list = [...(req.featsFrom.list ?? []), ...(req.featsFrom.metamagic ? METAMAGIC : []), ...(req.featsFrom.itemCreation ? ITEM_CREATION : [])];
    const n = state.taken.filter((t) => list.some((f) => featMatches(t, f))).length;
    if (n < (req.featsFrom.count ?? 1)) miss("featsFrom", { count: req.featsFrom.count ?? 1, metamagic: !!req.featsFrom.metamagic, itemCreation: !!req.featsFrom.itemCreation, list: req.featsFrom.list ?? [] });
  }
  if (req.featCount) {
    const choices = new Set(state.taken.filter((t) => featMatches(t, req.featCount.feat)).map((t) => lower(t.choice?.value ?? t.choice?.label ?? "")));
    if (choices.size < req.featCount.count) miss("featCount", { feat: req.featCount.feat, count: req.featCount.count });
  }
  for (const kind of ["arcane", "divine", "any"]) {
    const want = req.spells?.[kind];
    if (want == null) continue;
    if (castMax(state, kind === "any" ? null : kind) < want) miss("spells", { kind, level: want });
  }
  if (req.spontaneousArcane) {
    const ok = [...state.classLevels.keys()].some((u) => { const c = state.cat.classes.get(u); return c?.casting?.type === "arcane" && (castingKind(c) === "known" || !!c.casting.spontaneous); });
    if (!ok) miss("spontaneousArcane");
  }
  const spells = knownSpells(state.plan);
  for (const name of [...(req.knowsSpells ?? []), ...(req.knowsPowers ?? [])]) {
    const s = spells.find((x) => same(x.name, name) || same(x.en, name));
    const c = s ? state.cat.classes.get(s.cls) : null;
    const can = s && c && (c.casting?.type === "psionic" ? psionics(state).manifest >= (s.level ?? 0) : castMax(state, c.casting?.type) >= (s.level ?? 0)) && state.classLevels.has(s.cls);
    if (!can) miss("knows", { name });
  }
  if (req.spellSchools && opts.schoolOf) {
    const schools = new Set(spells.filter((s) => (s.level ?? 0) >= req.spellSchools.level && state.classLevels.has(s.cls)).map((s) => opts.schoolOf(s.uuid)).filter(Boolean));
    if (schools.size < req.spellSchools.count) miss("spellSchools", { level: req.spellSchools.level, count: req.spellSchools.count });
  }
  if (req.schoolSpells && opts.schoolOf) {
    const of = spells.filter((s) => state.classLevels.has(s.cls) && lower(opts.schoolOf(s.uuid)) === lower(req.schoolSpells.school));
    const distinct = new Set(of.map((s) => lower(s.name)));
    if (distinct.size < req.schoolSpells.count || (req.schoolSpells.highLevel && !of.some((s) => (s.level ?? 0) >= req.schoolSpells.highLevel)))
      miss("schoolSpells", { school: req.schoolSpells.school, count: req.schoolSpells.count, highLevel: req.schoolSpells.highLevel ?? 0 });
  }
  if (req.psionics) {
    const ps = psionics(state);
    if (req.psionics.manifest && ps.manifest < req.psionics.manifest) miss("manifest", { level: req.psionics.manifest });
    if (req.psionics.ml && ps.ml < req.psionics.ml) miss("ml", { level: req.psionics.ml });
    if (req.psionics.pp && !ps.pp) miss("pp");
  }
  if (req.sneak && sneakDice(state) < req.sneak) miss("sneak", { dice: req.sneak });
  for (const c of req.can ?? []) {
    const monk = [...state.classLevels].find(([u]) => /^monk$/i.test(baseName(state.cat.classes.get(u)?.en ?? "")))?.[1] ?? 0;
    if (c === "stillMind" && monk < 3) miss("can", { can: c });
  }
  if (req.martial && opts.proficient && !opts.proficient(state)) miss("martial");
  for (const lang of req.languages ?? []) if (!state.languages.some((l) => l === lower(lang) || l.includes(lower(lang)))) miss("language", { name: lang });
  return out;
}

/** The requirements of a class (by its English name): the GM's own (world) first, else the SRD's; null when none are known ({ _source: "none" }: none, by the GM). */
export function requirementsOf(cls, srd = {}, custom = {}) {
  const en = baseName(cls?.en ?? cls?.name ?? "");
  const key = (map) => Object.keys(map ?? {}).find((k) => same(k, en));
  const ck = key(custom);
  if (ck) return custom[ck] ? { ...custom[ck], _source: "custom" } : { _source: "none" }; // the GM said: no requirements
  const sk = key(srd);
  return sk ? { ...srd[sk], _source: "srd" } : null;
}

/**
 * Prestige issues for a plan: each prestige class, checked at the level it is first taken against the character one
 * level before. → [{ step: "classes", code: "prestige", data: { cls, level, missing, special }, severity, level }]
 * (a rule broken), "prestigeSpecial" (a requirement A&M can't check: a reminder) and "prestigeUnknown" (no data).
 */
export function prestigeIssues(plan, cat, d, srd = {}, custom = {}, opts = {}) {
  const out = [];
  const seen = new Set();
  d.perLevel.forEach((p, i) => {
    for (const part of p.parts ?? [p.cls ? { cls: p.cls } : null].filter(Boolean)) {
      const c = part.cls;
      if (!c || c.kind !== "prestige" || seen.has(c.uuid)) continue;
      seen.add(c.uuid);
      const level = i + 1;
      const req = requirementsOf(c, srd, custom);
      if (!req) { out.push({ step: "classes", code: "prestigeUnknown", data: { cls: c.name }, severity: "info", level }); continue; }
      const missing = missingFor(req, stateAt(plan, cat, d, level - 1), opts);
      if (missing.length) out.push({ step: "classes", code: "prestige", data: { cls: c.name, level, missing }, severity: "error", level });
      if (req.special) out.push({ step: "classes", code: "prestigeSpecial", data: { cls: c.name, special: req.special }, severity: "info", level });
    }
  });
  return out;
}

/* ---------- The GM's editor (Prestige requirements, start page): requirements ↔ form values ---------- */

const ANY_ALIGN = ["any lawful", "any chaotic", "any good", "any evil", "any nonlawful", "any nonchaotic", "any nongood", "any nonevil"];
/** The fields the editor's form shows; the rest (skillsAny, featsFrom, featCount, spellSchools, schoolSpells) are kept as they are. */
export const FORM_KEYS = ["race", "align", "bab", "skills", "subSkills", "feats", "anyFeats", "spells", "spontaneousArcane", "knowsSpells", "psionics", "knowsPowers", "sneak", "can", "martial", "languages", "special"];
const featLine = (f) => (f.includes("=") ? `${f.slice(0, f.indexOf("="))} (${f.slice(f.indexOf("=") + 1)})` : f);
const lineFeat = (s) => { const m = s.match(/^(.+?)\s*\((.+)\)\s*$/); return m ? `${m[1].trim()}=${m[2].trim()}` : s.trim(); };
const lines = (s) => String(s ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const commas = (s) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };

/** Requirements → the editor's form values. */
export function toForm(req) {
  const r = req ?? {};
  return {
    race: (r.race ?? []).join(", "), align: alignmentsFor(r.align) ?? [], bab: r.bab ?? 0,
    skills: Object.entries(r.skills ?? {}).map(([key, min]) => ({ key, min })),
    subSkills: (r.subSkills ?? []).map((s) => ({ parent: s.parent, name: s.name ?? "", min: s.min ?? 0 })),
    feats: (r.feats ?? []).map(featLine).join("\n"), anyFeats: (r.anyFeats ?? []).map(featLine).join("\n"),
    arcane: r.spells?.arcane ?? 0, divine: r.spells?.divine ?? 0, any: r.spells?.any ?? 0, spontaneousArcane: !!r.spontaneousArcane,
    knowsSpells: (r.knowsSpells ?? []).join("\n"),
    manifest: r.psionics?.manifest ?? 0, ml: r.psionics?.ml ?? 0, pp: !!r.psionics?.pp, knowsPowers: (r.knowsPowers ?? []).join("\n"),
    sneak: r.sneak ?? 0, martial: !!r.martial, stillMind: (r.can ?? []).includes("stillMind"),
    languages: (r.languages ?? []).join(", "), special: r.special ?? "",
  };
}

/** The editor's form values → requirements (keep: the current requirements, whose fields the form doesn't show stay). */
export function fromForm(f, keep = {}) {
  const out = {};
  for (const [k, v] of Object.entries(keep ?? {})) if (!FORM_KEYS.includes(k) && !k.startsWith("_")) out[k] = v;
  const race = commas(f.race); if (race.length) out.race = race;
  const al = [...new Set((f.align ?? []).map(lower))].filter((a) => R.ALIGNMENTS.includes(a));
  if (al.length && al.length < R.ALIGNMENTS.length) {
    const key = [...al].sort().join();
    out.align = ANY_ALIGN.find((a) => [...alignmentsFor(a)].sort().join() === key) ?? al;
  }
  if (int(f.bab)) out.bab = int(f.bab);
  const skills = Object.fromEntries((f.skills ?? []).filter((s) => s.key && int(s.min)).map((s) => [s.key, int(s.min)]));
  if (Object.keys(skills).length) out.skills = skills;
  const subs = (f.subSkills ?? []).filter((s) => s.parent && int(s.min)).map((s) => ({ parent: s.parent, name: String(s.name ?? "").trim(), min: int(s.min) }));
  if (subs.length) out.subSkills = subs;
  const feats = lines(f.feats).map(lineFeat); if (feats.length) out.feats = feats;
  const anyFeats = lines(f.anyFeats).map(lineFeat); if (anyFeats.length) out.anyFeats = anyFeats;
  const spells = {}; for (const k of ["arcane", "divine", "any"]) if (int(f[k])) spells[k] = int(f[k]);
  if (Object.keys(spells).length) out.spells = spells;
  if (f.spontaneousArcane) out.spontaneousArcane = true;
  const ks = lines(f.knowsSpells); if (ks.length) out.knowsSpells = ks;
  const ps = {}; if (int(f.manifest)) ps.manifest = int(f.manifest); if (int(f.ml)) ps.ml = int(f.ml); if (f.pp) ps.pp = true;
  if (Object.keys(ps).length) out.psionics = ps;
  const kp = lines(f.knowsPowers); if (kp.length) out.knowsPowers = kp;
  if (int(f.sneak)) out.sneak = int(f.sneak);
  if (f.stillMind) out.can = ["stillMind"];
  if (f.martial) out.martial = true;
  const langs = commas(f.languages); if (langs.length) out.languages = langs;
  if (String(f.special ?? "").trim()) out.special = String(f.special).trim();
  return out;
}
