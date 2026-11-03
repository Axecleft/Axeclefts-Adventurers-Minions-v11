/**
 * A&M v2 — the catalog: races, classes, feats and skills found in this world and its compendiums.
 * Loaded once a session (Reload in the window loads it again).
 */
import { classEntry, raceEntry, featEntry, specEntry, isSpec, pickable } from "../core/catalog-data.js";
import { baseName } from "../core/plan.js";
import { ensureGestalt } from "../core/gestalt.js";
import { proficiencies } from "../core/arms.js";
import { variantEntries, spontaneousCasting, arcaneDomainEntries } from "../core/variants.js";

export const MOD = "axeclefts-adventurers-minions";
/** The id A&M had while it was "Adventurers and Minions v2" (1.14.0.x): actors and worlds made then keep their data under it. */
export const LEGACY_MOD = "axeclefts-aam2";
/** A&M's flags on a document: under its id, or under the v2 id for actors made before 1.14.2.0. */
export const flagsOf = (doc) => doc?.flags?.[MOD] ?? doc?.flags?.[LEGACY_MOD];
/** The compendium an item came from: _stats.compendiumSource (Foundry v12+), flags.core.sourceId (v11). */
export const sourceOf = (doc) => doc?._stats?.compendiumSource ?? doc?.flags?.core?.sourceId ?? null;
/** Record (or clear, with null) where new item data came from, where this Foundry version keeps it. */
export function setSource(data, uuid) {
  if ((game.release?.generation ?? 11) >= 12) foundry.utils.setProperty(data, "_stats.compendiumSource", uuid);
  else foundry.utils.setProperty(data, "flags.core.sourceId", uuid);
}
const A = () => globalThis.AxecleftTools;
const t = (s) => A()?.t?.(s) ?? s;
let cache = null;

async function json(file) {
  try { return await foundry.utils.fetchJsonWithTimeout(`modules/${MOD}/data/${file}`); }
  catch (e) { console.warn(`${MOD} | couldn't read data/${file}`, e); return {}; }
}

/** The English name of an item (Babele, our own flag), for matching rules data. */
const english = (doc, pack) => {
  try { return A()?.enName?.(doc, { pack }) || doc.name; } catch (e) { return doc.name; }
};

/** Compendiums to look in: every Item compendium, unless the GM ticked some in the settings. */
function itemPacks() {
  let only = [];
  try { only = game.settings.get(MOD, "packs") ?? []; } catch (e) { /* not set */ }
  return [...game.packs].filter((p) => p.documentName === "Item" && p.visible !== false && (!only.length || only.includes(p.collection))); // players: only the compendiums they can see
}

const WANT = new Set(["class", "race", "feat"]);

export async function loadCatalog({ force = false, onProgress } = {}) {
  if (cache && !force) return cache;
  const [classExt, raceExt, featData, profiles, names, prestige, variants] = await Promise.all([json("classes.json"), json("races.json"), json("feats.json"), json("profiles.json"), json("names.json"), json("prestige.json"), json("variants.json")]);
  const fd = featData.feats ?? {};
  const races = new Map(), classes = new Map(), feats = new Map(), specs = new Map();
  const features = new Map(); // class English name (lower case) → [{ level, name, uuid }]
  // Class special abilities a slot can take (the rogue's): class abilities from D35E's Class Abilities, by English name
  const specialNames = new Set([...Object.values(classExt).flatMap((c) => (c?.bonusFeats ?? []).filter((b) => b.special).flatMap((b) => b.from ?? [])),
    ...Object.values(variants?.variants ?? {}).flatMap((l) => Object.values(l ?? {}).flatMap((v) => v?.specialsAdd ?? []))].map((n) => n.toLowerCase()));
  const specialOk = (e, pack) => e.type === "feat" && e.system?.featType === "classFeat" && (specialNames.has(String(e.name).toLowerCase()) || pack?.collection === "D35E.class-abilities");
  const add = (doc, pack, source) => {
    const en = english(doc, pack);
    const uuid = doc.uuid;
    if (doc.type === "class") { const e = classEntry(doc, { uuid, en, source, ext: classExt }); if (e.kind !== "template") classes.set(uuid, e); }
    else if (doc.type === "race") races.set(uuid, raceEntry(doc, { uuid, en, source, ext: raceExt }));
    else if (doc.type === "feat" && pickable(doc)) feats.set(uuid, featEntry(doc, { uuid, en, source, data: fd }));
    else if (doc.type === "feat" && doc.system?.featType === "classFeat") {
      if (!specialNames.has(String(en).toLowerCase())) return;
      const e = featEntry(doc, { uuid, en, source, data: fd });
      // A special ability: no prerequisites; Skill Mastery takes its skills (3 + Int modifier) and can be taken again
      feats.set(uuid, { ...e, special: true, req: /^skill mastery$/i.test(e.base) ? { multi: true } : {}, choice: /^skill mastery$/i.test(e.base) ? { kind: "skills" } : null });
    }
    else if (isSpec(doc)) specs.set(uuid, specEntry(doc, { uuid, en, source })); // domains and specialist schools
  };
  for (const doc of game.items ?? []) if (WANT.has(doc.type)) add(doc, null, game.i18n.localize("DOCUMENT.Items") || "World");
  const packs = itemPacks();
  let n = 0;
  for (const p of packs) {
    onProgress?.(++n, packs.length, p.title);
    let index;
    try { index = await p.getIndex({ fields: ["type", "system.featType", "system.associations"] }); } catch (e) { continue; }
    // Class features D35E adds by class level (its Class Abilities: "Evasion" for Rogue 2, Monk 2, Ranger 9)
    for (const e of index) {
      if (e.type !== "feat" || e.system?.featType !== "classFeat") continue;
      for (const a of e.system?.associations?.classes ?? []) {
        if (!Array.isArray(a) || !a[0] || !(Number(a[1]) > 0)) continue;
        const k = String(a[0]).toLowerCase();
        if (!features.has(k)) features.set(k, []);
        features.get(k).push({ level: Number(a[1]), name: e.name, uuid: e.uuid ?? `Compendium.${p.collection}.Item.${e._id}`, d35e: String(p.collection).startsWith("D35E.") });
      }
    }
    const ids = [...index].filter((e) => WANT.has(e.type) && (e.type !== "feat" || ["feat", "", undefined, "spellSpecialization"].includes(e.system?.featType) || specialOk(e, p))).map((e) => e._id);
    if (!ids.length) continue;
    let docs = [];
    try { docs = await p.getDocuments({ _id__in: ids }); } catch (e) { try { docs = (await p.getDocuments()).filter((d) => ids.includes(d.id)); } catch (e2) { continue; } }
    for (const d of docs) add(d, p, p.title);
  }
  // The same name from two places: say which is which
  // A feat waiting for its choice shows without the placeholder ("Weapon Focus (No Weapon Selected)" → "Weapon Focus")
  for (const e of feats.values()) if (e.choice) e.name = baseName(e.name);
  // The same domain or school in several compendiums: keep one (D35E's)
  const specSeen = new Map();
  for (const e of specs.values()) { const k = `${e.isDomain}|${e.key || e.en.toLowerCase()}`; const o = specSeen.get(k); if (!o || (e.uuid.startsWith("Compendium.D35E.") && !o.uuid.startsWith("Compendium.D35E."))) specSeen.set(k, e); }
  specs.clear(); for (const e of specSeen.values()) specs.set(e.uuid, e);
  for (const m of [races, classes, feats, specs]) {
    const count = {};
    for (const e of m.values()) count[e.name] = (count[e.name] ?? 0) + 1;
    for (const e of m.values()) e.label = count[e.name] > 1 ? `${e.name} (${e.source})` : e.name;
  }
  // Skills (D35E's list; Craft, Perform and Profession take named sub-skills)
  const model = game.model?.Actor?.character?.skills ?? game.system?.model?.Actor?.character?.skills ?? {};
  const arbitrary = new Set(CONFIG.D35E?.arbitrarySkills ?? ["crf", "prf", "pro"]);
  const skills = Object.entries(CONFIG.D35E?.skills ?? {}).map(([key, label]) => ({
    key, label: game.i18n.localize(label), ability: model[key]?.ability ?? "int", rt: !!model[key]?.rt, arbitrary: arbitrary.has(key),
  })).sort((a, b) => a.label.localeCompare(b.label));
  const languages = Object.entries(CONFIG.D35E?.languages ?? {}).map(([key, label]) => ({ key, label: game.i18n.localize(label) })).sort((a, b) => a.label.localeCompare(b.label));
  const sorted = (m) => [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
  // Variant classes (Unearthed Arcana): made from the standard classes found (world setting Variant classes)
  // Spontaneous casting (world setting): the standard casters cast as their Spontaneous … variant says (and so do their variants)
  const spont = spontaneousOn();
  if (spont) for (const c of classes.values()) {
    if (c.kind !== "base" || !c.casting) continue;
    const list = Object.entries(variants?.variants ?? {}).find(([en]) => en.toLowerCase() === baseName(c.en).toLowerCase())?.[1] ?? {};
    const spec = Object.values(list).find((v) => v?.spontaneous)?.spontaneous;
    if (spec) c.casting = spontaneousCasting(c.casting, spec, variants?.spontaneousKnown ?? []);
  }
  if (variantsOn()) for (const e of variantEntries([...classes.values()], variants?.variants ?? {}, { label: (k) => t(k), baseName, table: variants?.spontaneousKnown ?? [], skip: (k, v) => spont && !!v.spontaneous })) classes.set(e.uuid, e);
  ensureGestalt(classes); // gestalt keys answer with the class A&M builds from two
  // Domain wizard (Unearthed Arcana): the arcane domains a wizard can take instead of a school
  const arcane = variantsOn() ? arcaneDomainEntries(variants?.arcaneDomains ?? {}, (k) => `${t(k)} (${t("arcane domain")})`) : [];
  for (const e of arcane) specs.set(e.uuid, e);
  cache = { races, classes, feats, specs, skills, languages, data: { profiles, names, prestige: prestige?.classes ?? {} }, list: { races: sorted(races), classes: sorted(classes), feats: sorted(feats).filter((f) => !f.special), specials: specialList(feats), domains: sorted(specs).filter((e) => e.isDomain && !e.arcane), schools: sorted(specs).filter((e) => !e.isDomain), arcaneDomains: arcane.sort((a, b) => a.label.localeCompare(b.label)) }, loadedAt: Date.now() };
  cache.features = features;
  cache.featureOptions = variantsOn() ? variants?.features ?? {} : {}; // class feature variants (whirling frenzy…)
  cache.prestigeCustom = prestigeCustom; // the GM's own prestige requirements (read each check: they can change)
  cache.prestigeOpts = prestigeOpts(cache);
  return cache;
}

export const catalogLoaded = () => !!cache;
/** The catalog as loaded (null before). */
export const currentCatalog = () => cache;
const spontaneousOn = () => { try { return game.settings.get(MOD, "spontaneousCasting") === true; } catch (e) { return false; } };
const variantsOn = () => { try { return game.settings.get(MOD, "classVariants") !== false; } catch (e) { return true; } };

/**
 * Prestige class requirements: the SRD's (data/prestige.json) and the GM's own (world setting "prestigeReqs":
 * { "English class name": requirements | null }, edited on the start page's Prestige requirements). A GM's entry
 * replaces the SRD's; null means "no requirements".
 */
/** Class special abilities (the rogue's), one of each (D35E's first), by name. */
function specialList(feats) {
  const by = new Map();
  for (const f of feats.values()) if (f.special) {
    const k = f.base.toLowerCase(), o = by.get(k);
    if (!o || (f.uuid.startsWith("Compendium.D35E.") && !o.uuid.startsWith("Compendium.D35E."))) by.set(k, f);
  }
  return [...by.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * What the prestige checks need from the spell list and the gear data (loaded with the extras): a spell's school, and
 * whether a character is proficient with all martial weapons. Before the extras load the checks that need them pass.
 */
function prestigeOpts(cat) {
  let schools = null, from = null;
  return {
    schoolOf(uuid) {
      const list = cat.extrasData?.spellIndex;
      if (!list) return null;
      if (from !== list) { schools = new Map(list.map((s) => [s.uuid, s.school])); from = list; }
      return schools.get(uuid) ?? null;
    },
    proficient(state) {
      const gear = cat.extrasData?.gear;
      if (!gear?.proficiency) return true;
      const classes = [...state.classLevels.keys()].map((u) => ({ cls: cat.classes.get(u) })).filter((x) => x.cls);
      return proficiencies({ classes, race: state.race, feats: state.taken }, gear).weapons.has("martial");
    },
  };
}

export function prestigeCustom() {
  try { return game.settings.get(MOD, "prestigeReqs") ?? {}; } catch (e) { return {}; }
}

