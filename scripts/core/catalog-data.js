/**
 * A&M v2 — turning D35E items (from compendiums or the world) into catalog entries, with no Foundry code.
 * The Foundry side (catalog.js) finds the items; these functions read them.
 */
import { baseName } from "./plan.js";

const get = (o, path) => path.split(".").reduce((c, k) => (c == null ? c : c[k]), o);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** "base" | "prestige" | "minion" | "racial" | "template" (a class item's kind). */
export const classKind = (sys) => String(sys?.classType || "base").toLowerCase();

/** A table by class level ({ "1": 3, … } or [3, …]) → [_, level 1, level 2, …] (numbers). */
const tableOf = (t) => {
  if (Array.isArray(t)) return [0, ...t.map((v) => num(v, 0))];
  if (t && typeof t === "object") { const out = [0]; for (let L = 1; L <= 40 && (String(L) in t); L++) out.push(num(t[L], 0)); return out; }
  return [];
};

/** A class item → { uuid, name, en, kind, hd, bab, saves, perLevel, classSkills, casting, maxLevel, ext }. */
export function classEntry(doc, { uuid, en, source, ext = {} } = {}) {
  const s = doc.system ?? {};
  const st = s.savingThrows ?? {};
  const type = String(s.spellcastingType ?? "none").toLowerCase();
  const english = en ?? doc.name;
  return {
    uuid: uuid ?? doc.uuid, name: doc.name, en: english, source: source ?? "",
    kind: classKind(s), hd: num(s.hd, 8), bab: s.bab ?? "low",
    saves: { fort: st.fort?.value ?? "low", ref: st.ref?.value ?? "low", will: st.will?.value ?? "low" },
    perLevel: num(s.skillsPerLevel, 2),
    classSkills: Object.fromEntries(Object.entries(s.classSkills ?? {}).filter(([, v]) => v === true)),
    casting: type === "arcane" || type === "divine" ? {
      type, half: !!s.halfCasterLevel, ability: s.spellcastingAbility || null, book: !!s.hasSpellbook, spontaneous: !!s.spellcastingSpontaneus,
      allKnown: !!s.allSpellsKnown, special: !!s.hasSpecialSlot, perDay: s.spellsPerLevel ?? [], known: s.spellsKnownPerLevel ?? [],
    } : type === "psionic" ? {
      // Psionics (SRD): powers known and the highest power level by class level, power points from the key ability
      type: "psionic", half: false, ability: s.powerPointBonusBaseAbility || s.spellcastingAbility || null,
      powersKnown: tableOf(s.powersKnown), powersMax: tableOf(s.powersMaxLevel), points: tableOf(s.powerPointTable),
    } : null,
    maxLevel: num(s.maxLevel, 20) || null,
    // The class's own feature notes by class level (D35E's "non-active" abilities: "Sneak Attack +2d6" at 3rd)
    notes: (Array.isArray(s.nonActiveClassAbilities) ? s.nonActiveClassAbilities : []).filter((r) => Array.isArray(r) && Number(r[0]) > 0 && r[1]).map((r) => ({ level: Number(r[0]), name: String(r[1]) })),
    ext: ext[baseName(english)] ?? ext[english] ?? {},
  };
}

/** A race item → { uuid, name, en, ability: { str: 2 … }, la, creatureType, ext }. */
export function raceEntry(doc, { uuid, en, source, ext = {} } = {}) {
  const s = doc.system ?? {};
  const ability = {};
  for (const ch of s.changes ?? []) {
    const [formula, target, sub] = Array.isArray(ch) ? ch : [ch.formula, ch.target, ch.subTarget];
    if (target === "ability" && /^(str|dex|con|int|wis|cha)$/.test(sub ?? "")) {
      const n = Number(formula);
      if (Number.isFinite(n)) ability[sub] = (ability[sub] ?? 0) + n;
    }
  }
  const english = en ?? doc.name;
  return { uuid: uuid ?? doc.uuid, name: doc.name, en: english, source: source ?? "", ability, la: num(s.la, 0), creatureType: s.creatureType ?? "humanoid", ext: ext[english] ?? {} };
}

/**
 * A feat item → { uuid, name, en, base, src, psionic, epic, choice, req }.
 * choice: { kind: "custom", attr, options: [{ value, label }] } (a select list on the feat, as Weapon Focus),
 *         { kind: "skill", change } (a skill bonus whose skill is chosen, as Skill Focus), or null.
 */
export function featEntry(doc, { uuid, en, source, data = {} } = {}) {
  const s = doc.system ?? {};
  const english = en ?? doc.name;
  const base = baseName(english);
  let choice = null;
  for (const [attr, ca] of Object.entries(s.customAttributes ?? {})) {
    const list = ca?.selectListArray;
    if (list && Object.keys(list).length) {
      const options = Object.entries(list).filter(([v, l]) => !/^no\b|^none$/i.test(String(l)) && v !== "no").map(([value, label]) => ({ value, label }));
      choice = { kind: "custom", attr, name: ca.name ?? "", options };
      break;
    }
  }
  if (!choice) {
    const idx = (s.changes ?? []).findIndex((c) => (Array.isArray(c) ? c[1] : c?.target) === "skill" && !(Array.isArray(c) ? c[2] : c?.subTarget));
    if (idx >= 0) choice = { kind: "skill", change: idx };
  }
  const src = String(s.bookSource ?? "");
  const req = data[base] ?? data[english] ?? null;
  return { uuid: uuid ?? doc.uuid, name: doc.name, en: english, base, src, psionic: /psionic/i.test(src), epic: /epic/i.test(src) || /^epic /i.test(base), choice, req, featType: s.featType ?? "feat" };
}

/** Is this feat a "general" feat a character can pick? (Not a class or racial ability stored as a feat item.) */
export const pickable = (doc) => (doc?.type === "feat") && ["feat", "", undefined, null].includes(doc.system?.featType);

export { get, num };

/** A spell (item or index entry) → { uuid, name, school, classes: { Wizard: 1 }, domains: { Fire: 2 } }. */
export function spellEntry(doc, { uuid } = {}) {
  const la = doc.system?.learnedAt ?? {};
  const pairs = (l) => Object.fromEntries((Array.isArray(l) ? l : []).filter((p) => Array.isArray(p) && p.length >= 2).map(([k, v]) => [String(k), Number(v)]));
  return { uuid: uuid ?? doc.uuid, name: doc.name, school: doc.system?.school ?? "", classes: pairs(la.class), domains: pairs(la.domain) };
}

/**
 * A domain or a specialist school (D35E's Spell Schools and Domains: feat items of type "spellSpecialization") →
 * { uuid, name, en, isDomain, key, label, spells: [{ level, name, uuid }] }.
 * key: a domain's name in lower case ("fire"), or a school's code ("evo"), as D35E keeps it in spellSpecializationName.
 */
export function specEntry(doc, { uuid, en, source } = {}) {
  const s = doc.system ?? {};
  const ss = s.spellSpecialization ?? {};
  const english = en ?? doc.name;
  const spells = Object.values(ss.spells ?? {}).filter((x) => x?.name).map((x) => ({
    level: Number(x.level) || 0, name: x.name, uuid: x.id && x.pack ? `Compendium.${x.pack}.Item.${x.id}` : null,
  })).sort((a, b) => a.level - b.level);
  return { uuid: uuid ?? doc.uuid, name: doc.name, en: english, source: source ?? "", isDomain: !!ss.isDomain,
    key: String(s.spellSpecializationName ?? "").split(",")[0].trim().toLowerCase(), spells };
}
export const isSpec = (doc) => doc?.type === "feat" && doc.system?.featType === "spellSpecialization";
