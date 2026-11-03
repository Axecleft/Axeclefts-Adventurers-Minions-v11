/**
 * A&M v2 — gestalt class items on the actor (see core/gestalt.js for the rules side).
 *
 * gestaltClassData(key, plan, cat): the class item for one pairing ("Fighter // Wizard"), built from the two classes:
 *   - the better hit die, base attack bonus, saves and skill points; both class skill lists;
 *   - both classes' features, each at its own class level (D35E's class-abilities compendium, and a homebrew class's
 *     own list), in the item's list of added abilities (D35E finds features by class name, and this name is new);
 *   - for each casting class, a Bonus Arcane or Divine Spellcaster Level at each level (spent on its spellbook);
 *   - the note of the two classes it was built from (description and flags.axeclefts-adventurers-minions.gestalt).
 * casterCopyData(uuid): a casting class at level 0, for its spell table only (no BAB, saves, skills or features).
 * psionicComponentData(uuid, levels, cat): for a psionic class in gestalt classes, a locked class feature that adds the power
 *   points those levels give (D35E works power points out from a class item's own level, which the level-0 copy doesn't have)
 *   and as many psionic bonus manifester levels, which A&M spends on the class's spellbook.
 */
import { partsOf, levelMap, isGestalt } from "../core/gestalt.js";
import { MOD, currentCatalog, setSource } from "./catalog.js";
import { isVariant } from "../core/variants.js";
import { variantClassData, applySpontaneous } from "./variants.js";
import { createTag } from "./extras.js";

const t = (s, d) => globalThis.AxecleftTools?.t?.(s, d) ?? s;
const RANK = { low: 0, med: 1, high: 2 };
const better = (a, b) => ((RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a);
const BONUS_CL = { arcane: "prs-arcane-cl*", divine: "prs-div-cl*" };
const zero = (f) => !f || String(f).trim() === "0";

/** D35E's class features by class name: [{ uid, level }] (its class-abilities compendium; loaded once a session). */
let featureCache = null;
async function classFeatures() {
  if (featureCache) return featureCache;
  featureCache = new Map();
  const pack = game.packs.get("D35E.class-abilities");
  if (!pack) return featureCache;
  let index = [];
  try { index = await pack.getIndex({ fields: ["system.associations", "system.uniqueId"] }); } catch (e) { return featureCache; }
  for (const e of index) {
    const uid = e.system?.uniqueId;
    if (!uid) continue;
    for (const [name, level] of e.system?.associations?.classes ?? []) {
      if (!featureCache.has(name)) featureCache.set(name, []);
      featureCache.get(name).push({ uid, level: Number(level) || 0 });
    }
  }
  return featureCache;
}

async function docData(uuid) {
  // A variant class: its class item as A&M builds it (named "Barbarian (Bear Totem)")
  if (isVariant(uuid)) { const data = await variantClassData(uuid, currentCatalog()); return { doc: { name: data.name, uuid: null, pack: null }, data }; }
  const doc = await fromUuid(uuid);
  if (!doc) throw new Error(t("Couldn't find {uuid}.", { uuid }));
  const data = doc.toObject();
  delete data._id;
  return { doc, data };
}

/** The tag a class gets on the sheet (as D35E makes it from the name). */
const tagOf = (name) => createTag(name);

/** Is this class a spellcaster whose spells A&M places (arcane or divine)? */
const castType = (sys) => { const s = String(sys?.spellcastingType ?? "none").toLowerCase(); return s === "arcane" || s === "divine" ? s : null; };

/**
 * The class item data for a gestalt pairing. levels and hp are set by the caller (as for any class item).
 * casters: the casting classes of the plan that get a level-0 copy (their uuids), for the bonus caster levels.
 */
export async function gestaltClassData(key, plan, cat) {
  const [ua, ub] = partsOf(key);
  const A = await docData(ua), B = await docData(ub);
  const ea = cat.classes.get(ua), eb = cat.classes.get(ub);
  const sa = A.data.system ?? {}, sb = B.data.system ?? {};
  const map = levelMap(plan.levels).filter((x) => x.item === key);
  const features = await classFeatures();
  const added = [], seen = new Set();
  const push = (uid, level) => { const k = `${uid}@${level}`; if (!seen.has(k)) { seen.add(k); added.push({ uid, level }); } };
  const nonActive = [];
  const changes = [...(sa.changes ?? []), ...(sb.changes ?? [])];
  const bonusByType = {};
  for (const [uuid, part, sys, entry] of [[ua, A, sa, ea], [ub, B, sb, eb]]) {
    // (a variant's item already lists its features: its standard class's by name would bring back the ones it loses)
    const own = [...(entry?.variant ? [] : [...(features.get(entry?.en ?? part.doc.name) ?? []), ...(features.get(part.doc.name) ?? [])]), ...(sys.addedAbilities ?? []).map((x) => ({ uid: x.uid, level: Number(x.level) || 0 }))];
    const type = castType(sys);
    for (const m of map) {
      const p = m.parts.find((x) => x.uuid === uuid);
      if (!p) continue;
      for (const f of own) if (f.level === p.level || (p.level === 1 && f.level <= 0)) push(f.uid, m.itemLevel);
      for (const n of sys.nonActiveClassAbilities ?? []) if (Number(n?.[0]) === p.level || (p.level === 1 && Number(n?.[0]) <= 0)) nonActive.push([m.itemLevel, n[1], n[2]]);
      if (type) {
        // One Bonus Spellcaster Level ability per type and level (D35E keeps one of each); a second caster of the same type gets a change instead
        const k = `${type}@${m.itemLevel}`;
        if (!seen.has(k)) { seen.add(k); added.push({ uid: BONUS_CL[type], level: m.itemLevel }); }
        else bonusByType[type] = (bonusByType[type] ?? 0) + 1;
      }
    }
  }
  for (const [type, n] of Object.entries(bonusByType)) changes.push([String(n), "prestigeCl", type === "arcane" ? "arcaneCl" : "divineCl", "untyped"]);
  // A class whose own formulas use its tag (the monk's AC: @classes.monk.level) gives the item its tag, unless it casts (its copy keeps that tag)
  const usesTag = (data) => JSON.stringify(data.system?.changes ?? []).includes(`@classes.${tagOf(data.name)}.`) && !castType(data.system);
  const tagFrom = usesTag(A.data) ? A.data : usesTag(B.data) ? B.data : null;
  const name = `${A.doc.name} // ${B.doc.name}`;
  const link = (part) => (part.doc.uuid ? `@UUID[${part.doc.uuid}]{${part.doc.name}}` : part.doc.name);
  const data = foundry.utils.deepClone(A.data);
  data.name = name;
  if (A.doc.pack) setSource(data, null);
  const sys = data.system;
  Object.assign(sys, {
    classType: ea?.kind === "prestige" || eb?.kind === "prestige" ? "prestige" : "base",
    hd: Math.max(Number(sa.hd) || 0, Number(sb.hd) || 0),
    bab: better(sa.bab, sb.bab),
    skillsPerLevel: Math.max(Number(sa.skillsPerLevel) || 0, Number(sb.skillsPerLevel) || 0),
    classSkills: Object.fromEntries([...new Set([...Object.keys(sa.classSkills ?? {}), ...Object.keys(sb.classSkills ?? {})])].map((k) => [k, !!(sa.classSkills?.[k] || sb.classSkills?.[k])])),
    maxLevel: Math.max(Number(sa.maxLevel) || 20, Number(sb.maxLevel) || 20),
    customTag: tagFrom ? tagOf(tagFrom.name) : "",
    automaticFeatures: true,
    addedAbilities: added,
    disabledAbilities: [],
    nonActiveClassAbilities: nonActive.sort((x, y) => x[0] - y[0]),
    changes,
    // Spellcasting stays with the casting classes' own copies
    spellcastingType: "none", spellsPerLevel: [], spellsKnownPerLevel: [], hasSpellbook: false, hasSpecialSlot: false, allSpellsKnown: false, spellcastingAbility: "", halfCasterLevel: false,
    // …and so do power points (a psionic class's copy and its Gestalt Psionics feature): none from the gestalt class itself
    powerPointTable: {}, powerPointBonusBaseAbility: "", powersKnown: {}, powersMaxLevel: {},
    sneakAttackFormula: !zero(sa.sneakAttackFormula) ? sa.sneakAttackFormula : sb.sneakAttackFormula ?? "0",
    sneakAttackGroup: !zero(sa.sneakAttackFormula) ? sa.sneakAttackGroup : sb.sneakAttackGroup ?? "none",
    turnUndeadLevelFormula: !zero(sa.turnUndeadLevelFormula) ? sa.turnUndeadLevelFormula : sb.turnUndeadLevelFormula ?? "0",
  });
  sys.savingThrows = Object.fromEntries(["fort", "ref", "will"].map((s) => [s, { ...(sa.savingThrows?.[s] ?? {}), value: better(sa.savingThrows?.[s]?.value, sb.savingThrows?.[s]?.value) }]));
  foundry.utils.setProperty(sys, "description.value",
    `<p><strong>${t("Gestalt")}</strong> (${t("Unearthed Arcana, in the SRD's variant rules")}): ${t("built by Adventurers and Minions from {a} and {b}.", { a: link(A), b: link(B) })}</p>
<p>${t("The better hit die, base attack bonus, saves and skill points of the two classes, both class skill lists and both classes' features. Spellcasting stays with each casting class (a copy of it at level 0), which gets a bonus caster level at every level of this class.")}</p>`);
  foundry.utils.setProperty(data, `flags.${MOD}.gestalt`, { key, classes: [{ uuid: ua, name: A.doc.name }, { uuid: ub, name: B.doc.name }] });
  return data;
}

/** A casting class at level 0: its spell table and casting ability only. */
export async function casterCopyData(uuid) {
  const { doc, data } = await docData(uuid);
  if (doc.pack) setSource(data, doc.uuid);
  const s = data.system;
  Object.assign(s, {
    levels: 0, hp: 0, bab: "low", skillsPerLevel: 0, classSkills: {}, automaticFeatures: false, addedAbilities: [], changes: [],
    fc: { hp: { value: 0 }, skill: { value: 0 }, alt: { value: 0 } }, sneakAttackFormula: "0", turnUndeadLevelFormula: "0",
  });
  s.savingThrows = Object.fromEntries(["fort", "ref", "will"].map((k) => [k, { ...(s.savingThrows?.[k] ?? {}), value: "low" }]));
  foundry.utils.setProperty(data, `flags.${MOD}.gestaltCaster`, { uuid });
  // A spontaneous caster (spontaneous casting, or its variant): the copy's spellbook is spontaneous too
  const e = currentCatalog()?.classes?.get(uuid);
  if (e) applySpontaneous(data, e);
  return data;
}

/**
 * The casting classes of a gestalt plan that need a level-0 copy (no class item of their own), and the levels each gets
 * as bonus caster levels (its levels inside gestalt classes). → Map uuid → bonus levels
 */
export function gestaltCasters(plan, cat) {
  const out = new Map(), own = new Set();
  for (const lv of plan.levels ?? []) {
    if (!isGestalt(lv.cls)) { if (lv.cls) own.add(lv.cls); continue; }
    for (const u of partsOf(lv.cls)) if (["arcane", "divine", "psionic"].includes(cat.classes.get(u)?.casting?.type)) out.set(u, (out.get(u) ?? 0) + 1);
  }
  return { bonus: out, needsCopy: [...out.keys()].filter((u) => !own.has(u)) };
}

/**
 * The psionic component of a gestalt character: a class feature ("Gestalt Psionics: Psion (Nomad)") that adds the power
 * points of a psionic class's gestalt levels to the actor's pool (the class table, plus half the levels × the key
 * ability's modifier, which stays a live formula) and as many psionic bonus manifester levels. Locked like D35E's own
 * class features, so it isn't removed by accident; Edit builds it again when the levels change.
 */
export async function psionicComponentData(uuid, levels, cat) {
  const { doc } = await docData(uuid);
  const s = doc.system ?? {};
  const table = s.powerPointTable ?? {};
  const base = Number(Array.isArray(table) ? table[levels - 1] : table[levels]) || 0;
  const ab = s.powerPointBonusBaseAbility || s.spellcastingAbility || "int";
  const formula = `${base} + max(0, floor(0.5 * ${levels} * @abilities.${ab}.mod))`;
  return {
    name: t("Gestalt Psionics: {cls}", { cls: doc.name }), type: "feat", img: doc.img,
    system: {
      featType: "classFeat", userNonRemovable: true, source: t("Gestalt"),
      changes: [[formula, "psionic", "powerPoints", "untyped"], [String(levels), "prestigeCl", "psionicCl", "untyped"]],
      description: { value: `<p>${t("Gestalt (Unearthed Arcana): the power points and manifester level of {cls} {n}, which manifests at level 0 beside the gestalt class. Added by Adventurers and Minions; it is rebuilt when the character's levels change.", { cls: doc.uuid ? `@UUID[${doc.uuid}]{${doc.name}}` : doc.name, n: levels })}</p>` },
    },
    flags: { [MOD]: { gestaltPsionic: { uuid, levels } } },
  };
}
