/**
 * A&M — variant classes on the actor (see core/variants.js for the catalog side).
 *
 * variantClassData(uuid, cat): the class item of a variant ("Barbarian (Bear Totem)"), made from its standard class:
 *   - the variant's hit die, base attack bonus, saves, skill points, class skills and spell tables;
 *   - the standard class's features (D35E's class-abilities compendium, by class name and level) less those it loses,
 *     with the abilities it gains, in the item's list of added abilities (D35E finds features by class name, and this
 *     name is new); the class's own notes, less those it loses, with what the variant gains as notes on the sheet;
 *   - the standard class's tag ("barbarian"), so its formulas (a monk's AC: @classes.monk.level) still work;
 *   - D35E changes the variant makes (+2 on a skill), from the class level it gives them;
 *   - flags.axeclefts-adventurers-minions.variant: { uuid, base, key } (Edit finds the variant again by it).
 */
import { MOD, flagsOf, setSource } from "./catalog.js";
import { grantedFeat } from "../core/plan.js";
import { createTag } from "./extras.js";
import { parseVariant, loses, trimLost, chosenFeatures, featureOptionsFor, styleGrants, optionFeats } from "../core/variants.js";

const t = (s, d) => globalThis.AxecleftTools?.t?.(s, d) ?? String(s).replace(/\{(\w+)\}/g, (m, k) => (d?.[k] ?? m));

/** D35E's class abilities: [{ uid, name, classes: [[class, level]] }] (loaded once a session). */
let abilityCache = null;
async function classAbilities() {
  if (abilityCache) return abilityCache;
  abilityCache = [];
  const pack = game.packs.get("D35E.class-abilities");
  if (!pack) return abilityCache;
  try {
    const index = await pack.getIndex({ fields: ["system.associations", "system.uniqueId"] });
    for (const e of index) if (e.system?.uniqueId) abilityCache.push({ uid: e.system.uniqueId, name: e.name, classes: e.system?.associations?.classes ?? [], uuid: e.uuid ?? `Compendium.D35E.class-abilities.Item.${e._id}` });
  } catch (e) { /* none */ }
  return abilityCache;
}

/**
 * A spontaneous caster's class item (variant, or the world setting Spontaneous casting): D35E's spontaneous spellbook,
 * the spell tables A&M worked out, no domain slot for a cleric that knows its domain spells, and not the whole list known.
 */
export function applySpontaneous(data, entry) {
  const c = entry?.casting;
  if (!c?.aamSpontaneous || !["arcane", "divine"].includes(c.type)) return data;
  const sys = data.system ?? (data.system = {});
  sys.spellcastingSpontaneus = true;
  sys.allSpellsKnown = false;
  sys.spellsPerLevel = c.perDay;
  if (c.known?.length) sys.spellsKnownPerLevel = c.known;
  if (c.auto === "domains" || c.book) sys.hasSpecialSlot = false; // no domain or school slot (see extras: a specialist's +1 a day)
  return data;
}

/**
 * The class feature variants a character takes (whirling frenzy, favored environment…) on its class item: the features
 * they take away leave the item's added abilities and are disabled where D35E adds them by class name, the class's notes
 * lose them, and what they give is added as notes. flags.axeclefts-adventurers-minions.features: the names (Edit reads them).
 */
export async function applyFeatureOptions(data, cls, plan, cat) {
  if (!Object.keys(featureOptionsFor(cls, cat)).length) return data;
  const chosen = chosenFeatures(plan, cls, cat);
  foundry.utils.setProperty(data, `flags.${MOD}.features`, chosen.map((c) => c.key));
  if (!chosen.length) return data;
  const sys = data.system ?? (data.system = {});
  const lose = chosen.flatMap((c) => c.lose ?? []);
  const all = await classAbilities();
  sys.addedAbilities = (sys.addedAbilities ?? []).filter((x) => { const a = all.find((y) => y.uid === x.uid); return !a || !loses(lose, a.name, Number(x.level)); });
  const disabled = [...(sys.disabledAbilities ?? [])];
  for (const a of all) for (const [c, level] of a.classes) {
    if (String(c) !== data.name || !loses(lose, a.name, Number(level))) continue;
    disabled.push({ uid: a.uid.endsWith("*") ? a.uid.replace("*", `${data.name}-${level}`) : a.uid, level: Number(level) });
  }
  sys.disabledAbilities = disabled;
  // More class skills (social proficiency, shadow shaper…); no school slot (a specialist variant giving up the specialty spell)
  for (const k of chosen.flatMap((c) => c.skillsAdd ?? [])) (sys.classSkills ??= {})[k] = true;
  if (chosen.some((c) => c.noSlot)) sys.hasSpecialSlot = false;
  sys.nonActiveClassAbilities = (sys.nonActiveClassAbilities ?? []).map((n) => { const name = trimLost(lose, n?.[1], Number(n?.[0])); return name ? (name === n[1] ? n : [n[0], name, n[2]]) : null; }).filter(Boolean)
    .concat(chosen.flatMap((c) => (c.gain ?? []).map(([level, name]) => [Number(level), String(name), `<p>${String(name)}</p>`])))
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  foundry.utils.setProperty(sys, "description.value", `<p><strong>${t("Class feature variants")}</strong> (${t("Unearthed Arcana, in the SRD's variant rules")}): ${chosen.map((c) => t(c.key)).join(", ")}.</p>${sys.description?.value ?? ""}`);
  return data;
}

/**
 * A ranger's combat style on the actor (class feature variants with grants): for each class level reached, D35E's class
 * ability (Combat Style, Improved Combat Style, Combat Style Mastery) named after the style ("Combat Style (Archery)"),
 * linking the feat it gives (D35E's linked items add Rapid Shot with it). D35E's own description-only ones are disabled
 * on the class item (applyFeatureOptions) and removed here. A style no longer taken, or a level no longer reached, leaves
 * with its feat. flags.axeclefts-adventurers-minions.combatStyle: { cls, key, level }.
 */
export async function syncCombatStyles(actor, plan, cat, d) {
  const want = [];
  const lost = new Set();
  for (const { cls, levels } of d.parts ?? d.classes ?? []) {
    if (!cls || cls.gestalt) continue;
    const chosen = chosenFeatures(plan, cls, cat).filter((c) => c.grants?.length);
    for (const c of chosen) for (const n of c.lose ?? []) lost.add(String(n).toLowerCase());
    for (const g of styleGrants(chosen, levels)) want.push({ cls, ...g });
  }
  const id = (x) => `${x.cls?.uuid ?? x.cls}|${x.key}|${x.level}`;
  const have = actor.items.filter((i) => flagsOf(i)?.combatStyle);
  const keep = new Set(want.map(id));
  const gone = have.filter((i) => !keep.has(id(flagsOf(i).combatStyle)));
  // D35E's own (description-only) combat style features, where a style now gives them
  const stock = actor.items.filter((i) => i.type === "feat" && !flagsOf(i)?.combatStyle && lost.has(String(i.name).toLowerCase()));
  const linked = (src) => actor.items.filter((i) => src.system?.linkId && i.system?.linkSourceId === src.system.linkId);
  const loose = actor.items.filter((i) => flagsOf(i)?.styleFeat && !keep.has(id(flagsOf(i).styleFeat)));
  const goneIds = [...new Set([...gone, ...stock, ...loose].flatMap((i) => [i.id, ...linked(i).map((x) => x.id)]))];
  if (goneIds.length) await actor.deleteEmbeddedDocuments("Item", goneIds);
  const kept = new Set(have.filter((i) => !gone.includes(i)).map((i) => id(flagsOf(i).combatStyle)));
  const all = await classAbilities();
  const add = [];
  for (const w of want) {
    if (kept.has(id(w))) continue;
    const feat = grantedFeat(cat, w.feat);
    if (!feat) continue;
    const ab = all.find((a) => a.name.toLowerCase() === String(w.feature).toLowerCase());
    const doc = ab ? await fromUuid(ab.uuid).catch(() => null) : null;
    const data = doc ? doc.toObject() : { name: w.feature, type: "feat", system: { featType: "classFeat", description: { value: "" } } };
    delete data._id;
    data.name = `${doc?.name ?? w.feature} (${t(w.key)})`;
    const sys = data.system ?? (data.system = {});
    sys.uniqueId = "";
    sys.source = `${w.cls.name} ${w.level}`;
    sys.addedLevel = w.level;
    const m = String(feat.uuid).match(/^Compendium\.([^.]+\.[^.]+)\.(?:Item\.)?([^.]+)$/);
    if (m) sys.linkedItems = [{ packId: m[1], itemId: m[2], pack: m[1], name: feat.name, img: feat.img ?? "" }];
    foundry.utils.setProperty(sys, "description.value", `<p><strong>${t("Combat style")}: ${t(w.key)}.</strong> ${t("Treated as having {feat} (added with this feature), only in light or no armor.", { feat: feat.name })}</p>${sys.description?.value ?? ""}`);
    foundry.utils.setProperty(data, `flags.${MOD}.combatStyle`, { cls: w.cls.uuid, key: w.key, level: w.level });
    add.push(data);
    // A feat outside the compendiums can't be linked: it goes on beside the feature
    if (!m) { const f = await fromUuid(feat.uuid).catch(() => null); if (f) { const fd = f.toObject(); delete fd._id; foundry.utils.setProperty(fd, `flags.${MOD}.styleFeat`, { cls: w.cls.uuid, key: w.key, level: w.level }); add.push(fd); } }
  }
  // Feats class feature variants give without a slot (a conjurer's Augment Summoning): on the actor while taken
  const wantFeats = [];
  for (const { cls, levels } of d.parts ?? d.classes ?? []) if (cls && !cls.gestalt) for (const g of optionFeats(chosenFeatures(plan, cls, cat), levels)) wantFeats.push({ cls: cls.uuid, ...g });
  const fid = (x) => `${x.cls}|${x.key}|${x.feat}`;
  const haveFeats = actor.items.filter((i) => flagsOf(i)?.optionFeat);
  const goneFeats = haveFeats.filter((i) => !wantFeats.some((w) => fid(w) === fid(flagsOf(i).optionFeat))).map((i) => i.id);
  if (goneFeats.length) await actor.deleteEmbeddedDocuments("Item", goneFeats);
  for (const w of wantFeats) {
    if (haveFeats.some((i) => fid(flagsOf(i).optionFeat) === fid(w))) continue;
    const feat = grantedFeat(cat, w.feat);
    const doc = feat ? await fromUuid(feat.uuid).catch(() => null) : null;
    if (!doc) continue;
    const fd = doc.toObject(); delete fd._id;
    if (doc.pack) setSource(fd, doc.uuid);
    foundry.utils.setProperty(fd, `flags.${MOD}.optionFeat`, w);
    add.push(fd);
  }
  if (add.length) await actor.createEmbeddedDocuments("Item", add);
}

/** The class item data of a variant class. */
export async function variantClassData(uuid, cat) {
  const e = cat.classes.get(uuid), p = parseVariant(uuid);
  if (!e || !p) throw new Error(t("Couldn't find {uuid}.", { uuid }));
  const doc = await fromUuid(p.base);
  if (!doc) throw new Error(t("Couldn't find {uuid}.", { uuid: p.base }));
  const data = doc.toObject();
  delete data._id;
  setSource(data, null);
  const v = e.variant, sys = data.system;
  const base = cat.classes.get(p.base);
  const names = new Set([doc.name, base?.en].filter(Boolean).map((n) => String(n).toLowerCase()));
  const all = await classAbilities();
  // The standard class's features less those lost, then the abilities gained
  const added = [], seen = new Set();
  const push = (uid, level) => { const k = `${uid}@${level}`; if (!seen.has(k)) { seen.add(k); added.push({ uid, level }); } };
  for (const a of all) for (const [cls, level] of a.classes) if (names.has(String(cls).toLowerCase()) && !loses(v.lose, a.name, Number(level))) push(a.uid, Number(level) || 0);
  for (const x of sys.addedAbilities ?? []) { const a = all.find((y) => y.uid === x.uid); if (!a || !loses(v.lose, a.name, Number(x.level))) push(x.uid, Number(x.level) || 0); }
  for (const [level, name] of v.addAbilities ?? []) { const a = all.find((y) => y.name.toLowerCase() === String(name).toLowerCase()); if (a) push(a.uid, Number(level) || 1); }
  const nonActive = (sys.nonActiveClassAbilities ?? []).map((n) => { const name = trimLost(v.lose, n?.[1], Number(n?.[0])); return name ? (name === n[1] ? n : [n[0], name, n[2]]) : null; }).filter(Boolean)
    .concat((v.gain ?? []).map(([level, name]) => [Number(level), String(name), `<p>${String(name)}</p>`]))
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  // Changes from a class level: 2 × min(1, floor(level / 2)) is 0 below 2nd level, 2 from it
  const tag = sys.customTag || createTag(doc.name);
  const changes = [...(sys.changes ?? []), ...(v.changes ?? []).map(([level, formula, target, sub]) => [
    Number(level) > 1 ? `(${formula}) * min(1, floor(@classes.${tag}.level / ${Number(level)}))` : String(formula), target, sub, "untyped"])];
  const skills = { ...(sys.classSkills ?? {}) };
  for (const k of Object.keys(skills)) skills[k] = !!e.classSkills[k];
  for (const k of Object.keys(e.classSkills)) skills[k] = true;
  data.name = e.name;
  Object.assign(sys, {
    hd: e.hd, bab: e.bab, skillsPerLevel: e.perLevel, classSkills: skills,
    customTag: tag, automaticFeatures: true, addedAbilities: added, nonActiveClassAbilities: nonActive, changes,
  });
  sys.savingThrows = Object.fromEntries(["fort", "ref", "will"].map((s) => [s, { ...(sys.savingThrows?.[s] ?? {}), value: e.saves[s] }]));
  if (e.casting && ["arcane", "divine"].includes(e.casting.type)) {
    sys.spellcastingType = e.casting.type;
    sys.spellsPerLevel = e.casting.perDay;
    if (e.casting.known?.length) sys.spellsKnownPerLevel = e.casting.known;
  }
  const link = doc.uuid ? `@UUID[${doc.uuid}]{${doc.name}}` : doc.name;
  foundry.utils.setProperty(sys, "description.value", `<p><strong>${t("Variant class")}</strong> (${t("Unearthed Arcana, in the SRD's variant rules")}): ${t("{variant}, built by Adventurers and Minions from {cls}.", { variant: e.name, cls: link })}</p>`
    + (v.gain?.length ? `<ul>${v.gain.map(([l, n]) => `<li>${t("Level {level}", { level: l })}: ${n}</li>`).join("")}</ul>` : "")
    + (v.lose?.length ? `<p>${t("Doesn't gain: {list}.", { list: v.lose.map((x) => String(x).replace(/@\d+$/, "")).join(", ") })}</p>` : "")
    + (sys.description?.value ?? ""));
  foundry.utils.setProperty(data, `flags.${MOD}.variant`, { uuid, base: p.base, key: p.key });
  return data;
}
