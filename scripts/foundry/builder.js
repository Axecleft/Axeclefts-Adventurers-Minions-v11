/**
 * A&M v2 — writing a plan to a D35E actor.
 *
 * The actor uses D35E's level-up progression: one record per character level (class, HP rolled, skill points spent).
 * From those records D35E sets class levels, class HP and skill ranks; BAB, saves, AC, attacks and class features
 * (from its Class Abilities compendium) follow. The module writes choices only.
 */
import { syncXpTrait } from "./xp.js";
import { derive } from "../core/plan.js";
import * as R from "../core/rules.js";
import { MOD, flagsOf, sourceOf, setSource } from "./catalog.js";
import { applySpells, applyGear } from "./extras.js";
import { gestaltClassData, casterCopyData, gestaltCasters, psionicComponentData } from "./gestalt.js";
import { variantClassData, applySpontaneous, applyFeatureOptions, syncCombatStyles } from "./variants.js";
import { featureOptionsFor } from "../core/variants.js";
import { isVariant } from "../core/variants.js";
import { makeActor, backupFolder, canCreate } from "./relay.js";

const A = () => globalThis.AxecleftTools;
const t = (s, d) => A()?.t?.(s, d) ?? s;

/**
 * Progress while an actor is built or changed: the window's working overlay listens (setProgress(fn), fn(text)).
 * Each step gives the browser a moment to draw it.
 */
let onStep = null;
export const setProgress = (fn) => { onStep = fn ?? null; };
async function step(text) {
  if (!onStep) return;
  try { onStep(text); } catch (e) { /* the window closed */ }
  await new Promise((r) => setTimeout(r, 0));
}

/** Base ability scores as D35E stores them: the plan's scores plus the level 4/8/12… increases (the race item adds its own). */
export function baseAbilities(plan) {
  const out = { ...plan.abilities.base };
  plan.levels.forEach((lv, i) => { if (lv.increase && R.hasIncrease(i + 1)) out[lv.increase] = (Number(out[lv.increase]) || 0) + 1; });
  return out;
}

/** The name a feat gets for its choice ("Weapon Focus (Longsword)"). */
function choiceName(feat, choice) {
  if (!choice?.value) return feat.name;
  const label = choice.label ?? choice.value;
  return `${feat.name.replace(/\s*\([^)]*\)\s*$/, "")} (${label})`;
}

/** A feat item's data with its choice applied. */
async function featData(entry, choice) {
  const doc = await fromUuid(entry.uuid);
  if (!doc) throw new Error(t("Couldn't find the feat {name}.", { name: entry.name }));
  const data = doc.toObject();
  delete data._id;
  if (doc.pack) setSource(data, doc.uuid);
  if (choice?.value && entry.choice?.kind === "custom") {
    foundry.utils.setProperty(data, `system.customAttributes.${entry.choice.attr}.value`, choice.value);
    data.name = choiceName(entry, choice);
  } else if (choice?.value && entry.choice?.kind === "skill") {
    const ch = foundry.utils.deepClone(data.system.changes ?? []);
    const c = ch[entry.choice.change];
    if (Array.isArray(c)) c[2] = choice.value; else if (c) c.subTarget = choice.value;
    data.system.changes = ch;
    data.name = choiceName(entry, choice);
  } else if (choice?.value && entry.choice?.kind === "skills") {
    data.name = choiceName(entry, choice); // Skill Mastery (Hide, Move Silently, Tumble)
  }
  foundry.utils.setProperty(data, `flags.${MOD}.choice`, choice ?? null);
  return data;
}

async function itemData(uuid, patch = {}) {
  const doc = await fromUuid(uuid);
  if (!doc) throw new Error(t("Couldn't find {uuid}.", { uuid }));
  const data = doc.toObject();
  delete data._id;
  if (doc.pack) setSource(data, doc.uuid);
  for (const [k, v] of Object.entries(patch)) foundry.utils.setProperty(data, k, v);
  return data;
}

/** A class item's data: a compendium class, or a gestalt class A&M builds from two (core/gestalt.js). */
async function classData(cls, plan, cat, patch) {
  if (isVariant(cls.uuid)) {
    const data = await applyFeatureOptions(applySpontaneous(await variantClassData(cls.uuid, cat), cls), cls, plan, cat);
    for (const [k, v] of Object.entries(patch)) foundry.utils.setProperty(data, k, v);
    return data;
  }
  if (!cls.gestalt) return applyFeatureOptions(applySpontaneous(await itemData(cls.uuid, patch), cls), cls, plan, cat);
  const data = await gestaltClassData(cls.uuid, plan, cat);
  for (const [k, v] of Object.entries(patch)) foundry.utils.setProperty(data, k, v);
  return data;
}

/** Gestalt psionic components: one per psionic class in gestalt classes (kept up to date, added, or removed). */
async function applyPsionicComponents(actor, plan, cat, bonus) {
  const want = [...bonus].filter(([u]) => cat.classes.get(u)?.casting?.type === "psionic");
  const have = actor.items.filter((i) => flagsOf(i)?.gestaltPsionic);
  const add = [], update = [], gone = [];
  for (const [u, n] of want) {
    const it = have.find((i) => flagsOf(i).gestaltPsionic.uuid === u);
    const data = await psionicComponentData(u, n, cat);
    if (!it) add.push(data);
    else if (flagsOf(it).gestaltPsionic.levels !== n) update.push({ _id: it.id, name: data.name, "system.changes": data.system.changes, "system.description.value": data.system.description.value, [`flags.${MOD}.gestaltPsionic`]: flagsOf(data).gestaltPsionic });
  }
  for (const it of have) if (!want.some(([u]) => u === flagsOf(it).gestaltPsionic.uuid)) gone.push(it.id);
  if (gone.length) await actor.deleteEmbeddedDocuments("Item", gone);
  if (update.length) await actor.updateEmbeddedDocuments("Item", update);
  if (add.length) await actor.createEmbeddedDocuments("Item", add);
}

/** D35E's level records for a plan, once the class items exist (classIds: plan class uuid → item id on the actor). */
export function levelRecords(plan, cat, classIds, items) {
  return plan.levels.map((lv, i) => {
    const level = i + 1;
    const c = cat.classes.get(lv.cls);
    const id = classIds.get(lv.cls) ?? null;
    const item = id ? items.get(id) : null;
    const skills = {};
    for (const [key, pts] of Object.entries(lv.skills ?? {})) {
      const points = Number(pts) || 0; if (!points) continue;
      const sub = plan.subSkills.find((s) => s.tag === key);
      if (sub) {
        skills[sub.parent] ??= { points: 0, cls: !!c?.classSkills?.[sub.parent], subskills: {} };
        skills[sub.parent].subskills ??= {};
        skills[sub.parent].subskills[key] = { points, cls: !!c?.classSkills?.[sub.parent] };
      } else {
        skills[key] = { ...(skills[key] ?? {}), points, cls: !!c?.classSkills?.[key] };
      }
    }
    return {
      level, id: `_aam${level}${foundry.utils.randomID(6)}`, classId: id, class: item?.name ?? c?.name ?? null, classImage: item?.img ?? null,
      skills, hp: Number(lv.hp) || 0, hasFeat: R.hasFeat(level), hasAbility: R.hasIncrease(level),
    };
  });
}

/** system.skills.<key>.points (and sub-skills) from level records: a class-skill point is a rank, a cross-class point half. */
export function skillPoints(records) {
  const out = {}, sub = {};
  for (const r of records) for (const [k, v] of Object.entries(r.skills ?? {})) {
    if (v.points) out[k] = (out[k] ?? 0) + v.points * (v.cls ? 1 : 0.5);
    for (const [sk, sv] of Object.entries(v.subskills ?? {})) sub[`${k}.subSkills.${sk}`] = (sub[`${k}.subSkills.${sk}`] ?? 0) + (sv.points || 0) * (sv.cls ? 1 : 0.5);
  }
  const update = {};
  for (const [k, v] of Object.entries(out)) update[`system.skills.${k}.points`] = Math.floor(v);
  for (const [k, v] of Object.entries(sub)) update[`system.skills.${k}.points`] = Math.floor(v);
  return update;
}

/**
 * The plan as it's kept in the actor's flags. Foundry reads dots in keys as paths, so the spells (keyed by class uuid,
 * which has dots) are kept as a list; planFromFlags turns them back.
 */
export function flagPlan(plan) {
  const p = foundry.utils.deepClone(plan);
  p.spells = Object.entries(plan.spells ?? {}).filter(([, l]) => l?.length).map(([cls, list]) => ({ cls, list }));
  p.specs = Object.entries(plan.specs ?? {}).map(([cls, spec]) => ({ cls, ...spec })); // domains and schools, keyed by class uuid too
  p.variants = Object.entries(plan.variants ?? {}).map(([cls, build]) => ({ cls, build })); // builds, keyed by class uuid too
  p.featureOptions = Object.entries(plan.featureOptions ?? {}).map(([cls, list]) => ({ cls, list })); // class feature variants
  return p;
}
export function planFromFlags(p) {
  if (!p) return p;
  const plan = foundry.utils.deepClone(p);
  if (Array.isArray(plan.spells)) plan.spells = Object.fromEntries(plan.spells.map((e) => [e.cls, e.list ?? []]));
  if (Array.isArray(plan.specs)) plan.specs = Object.fromEntries(plan.specs.map(({ cls, ...spec }) => [cls, spec]));
  if (Array.isArray(plan.variants)) plan.variants = Object.fromEntries(plan.variants.map(({ cls, build }) => [cls, build]));
  if (Array.isArray(plan.featureOptions)) plan.featureOptions = Object.fromEntries(plan.featureOptions.map(({ cls, list }) => [cls, list ?? []]));
  return plan;
}

/**
 * Create a new actor from a plan. options: { folder, kind } → the actor.
 */
export async function createActor(plan, cat, { folder = null, ownership = null } = {}) {
  const d = derive(plan, cat);
  if (!d.level) throw new Error(t("Give the character at least one level."));
  const race = d.race;
  const ext = race?.ext ?? {};
  const base = baseAbilities(plan);
  const system = {
    abilities: Object.fromEntries(R.ABILITIES.map((a) => [a, { value: Number(base[a]) || 10 }])),
    details: {
      alignment: plan.alignment || "tn", levelUpProgression: true, level: { available: d.level },
      gender: plan.sex ?? "", deity: plan.deity ?? "", age: plan.age ?? "", height: plan.height ?? "", weight: plan.weight ?? "",
    },
    traits: { size: ext.size ?? "med", languages: { value: [...new Set([...(ext.languages ?? []), ...(plan.languages ?? [])])], custom: [plan.customLanguages, ...(ext.customLanguages ?? [])].filter(Boolean).join("; ") } },
    attributes: { senses: { darkvision: ext.vision?.darkvision ?? 0, lowLight: !!ext.vision?.lowLight } },
  };
  // Craft, Perform and Profession: the named sub-skills
  for (const s of plan.subSkills ?? []) {
    const sk = cat.skills.find((x) => x.key === s.parent);
    foundry.utils.setProperty(system, `skills.${s.parent}.subSkills.${s.tag}`, { name: s.name, ability: sk?.ability ?? "int", rank: 0, notes: "", mod: 0, rt: !!sk?.rt, cs: false, acp: false, points: 0 });
  }
  const kind = plan.kind === "npc" ? "npc" : "character";
  const data = {
    name: plan.name?.trim() || t("New character"), type: kind, folder,
    img: plan.img || undefined, system,
    prototypeToken: { name: plan.name?.trim() || undefined, actorLink: kind === "character", texture: plan.tokenImg ? { src: plan.tokenImg } : undefined },
    flags: { [MOD]: { plan: flagPlan(plan), version: 2 } },
  };
  if (ownership) data.ownership = ownership;
  if (kind === "character") {
    try { data.system.details.xp = { value: Actor.implementation.prototype.getLevelExp?.call({}, d.level - 1) ?? R.xpFor(d.level) }; }
    catch (e) { data.system.details.xp = { value: R.xpFor(d.level) }; }
  }
  await step(t("Creating the actor…"));
  const actor = await makeActor(data); // a player without the Create New Actors permission: made by the GM (relay.js)
  try {
    await applyToActor(actor, plan, cat, d);
  } catch (err) {
    console.error(`${MOD} | building ${actor.name}`, err);
    ui.notifications.error(t("{name} was created, but not every part could be added: {error}", { name: actor.name, error: err.message }));
  }
  return actor;
}

/** Race, classes, level records, feats and HP on an actor that has none of them yet. */
export async function applyToActor(actor, plan, cat, d = derive(plan, cat)) {
  // Race
  await step(t("Race…"));
  if (d.race) await actor.createEmbeddedDocuments("Item", [await itemData(d.race.uuid)]);
  await step(t("Classes and levels…"));
  // Classes: one item per class, with its levels and HP (the level records below keep them in step)
  const order = d.classes.map((c) => c.cls).filter(Boolean);
  const classItems = [];
  for (const c of order) {
    const lv = plan.levels.filter((l) => l.cls === c.uuid);
    classItems.push(await classData(c, plan, cat, { "system.levels": lv.length, "system.hp": lv.reduce((n, l) => n + (Number(l.hp) || 0), 0) }));
  }
  // Gestalt: each casting class without a class item of its own goes on at level 0, for its spell table
  const { needsCopy, bonus } = gestaltCasters(plan, cat);
  for (const u of needsCopy) classItems.push(await casterCopyData(u));
  const created = classItems.length ? await actor.createEmbeddedDocuments("Item", classItems) : [];
  // Which item is which class: gestalt classes and level-0 casting classes by A&M's flags (the order Foundry returns
  // new items in isn't always the order asked), the others in order
  const flagged = (u) => created.find((it) => flagsOf(it)?.gestalt?.key === u || flagsOf(it)?.gestaltCaster?.uuid === u) ?? created.find((it) => !flagsOf(it)?.gestaltCaster && sourceOf(it) === u);
  const classIds = new Map([...order.map((c) => c.uuid), ...needsCopy].map((u, i) => [u, (flagged(u) ?? created[i])?.id]));
  await applyPsionicComponents(actor, plan, cat, bonus);
  // Level records: D35E works out class levels, class HP and skill ranks from them
  const records = levelRecords(plan, cat, classIds, actor.items);
  // Skill points as D35E's own level-up window writes them (it only works them out itself when the number of levels changes)
  await actor.update({ "system.details.levelUpProgression": true, "system.details.level.available": d.level, "system.details.levelUpData": records, ...skillPoints(records) });
  await step(t("Feats…"));
  // Feats (with their choices)
  const feats = [];
  for (const lv of plan.levels) for (const f of lv.feats ?? []) {
    const entry = f.uuid ? cat.feats.get(f.uuid) : null;
    if (entry) feats.push(await featData(entry, f.choice));
  }
  if (feats.length) await actor.createEmbeddedDocuments("Item", feats);
  // A ranger's combat style: its features, linking the feats they give
  try { await syncCombatStyles(actor, plan, cat, d); } catch (err) { console.error(`${MOD} | combat style`, err); }
  // Spells and gear (each on its own, so one failing doesn't stop the rest)
  await step(t("Spells…"));
  try { await applySpells(actor, plan, cat, d, { classIds }); } catch (err) { console.error(`${MOD} | spells`, err); ui.notifications.warn(t("Spells couldn't all be added: {error}", { error: err.message })); }
  await step(t("Equipment and treasure…"));
  try { actor._aamGear = await applyGear(actor, plan, cat, d); } catch (err) { console.error(`${MOD} | gear`, err); ui.notifications.warn(t("Gear couldn't all be added: {error}", { error: err.message })); }
  // Full hit points
  const max = actor.system?.attributes?.hp?.max;
  if (Number.isFinite(max) && max > 0) await actor.update({ "system.attributes.hp.value": max });
  // The multiclass XP penalty, as a trait that reduces the XP the character gains
  await syncXpTrait(actor, { favored: d.race ? d.race.ext?.favored ?? null : undefined });
  return actor;
}

/* -------------------------------------------- */
/*  Edit                                        */
/* -------------------------------------------- */

/** A copy of the actor, before an edit, in the folder "A&M backups" (made when missing). */
export async function backupActor(actor) {
  const folder = canCreate() ? await backupFolder() : null; // through the GM, the GM's side puts it in the folder
  const data = actor.toObject();
  delete data._id;
  data.name = t("{name} (before A&M edit)", { name: actor.name });
  data.folder = folder?.id ?? null;
  if (data.prototypeToken) data.prototypeToken.actorLink = false;
  return makeActor(data, { backup: true });
}

/** The same feat (and choice) as a feat entry of the plan read from the actor? */
const sameFeat = (a, b) => a && b && a.uuid === b.uuid && String(a.choice?.value ?? "") === String(b.choice?.value ?? "");

/**
 * Apply an edited plan to the actor it was read from (plan._edit, from readActor). before: the plan as read.
 * Only what changed is written; the actor's other items (gear, effects, class features, items A&M doesn't know) stay.
 * options: { backup: true } → { actor, backup }
 */
export async function applyEdit(actor, plan, cat, before, { backup = true } = {}) {
  const ed = plan._edit ?? {};
  const d = derive(plan, cat);
  if (!d.level) throw new Error(t("Give the character at least one level."));
  let copy = null;
  if (backup) {
    await step(t("Copying the actor first…"));
    try { copy = await backupActor(actor); }
    catch (err) { throw new Error(t("the copy couldn't be made ({error}); untick the copy on Review to go ahead without one", { error: err.message })); }
  }
  const hpWasFull = Number(actor.system?.attributes?.hp?.value) >= Number(actor.system?.attributes?.hp?.max);
  const gone = [];
  // Race
  if (plan.race !== before.race) {
    if (ed.race && actor.items.get(ed.race)) gone.push(ed.race);
    if (d.race) await actor.createEmbeddedDocuments("Item", [await itemData(d.race.uuid)]);
  }
  await step(t("Classes and levels…"));
  // Classes: the ones still taken updated, new ones created, the ones no longer taken removed
  const classIds = new Map(Object.entries(ed.classes ?? {}).filter(([, id]) => actor.items.get(id)));
  const updates = [], create = [], order = [];
  for (const { cls } of d.classes) {
    if (!cls) continue;
    const lv = plan.levels.filter((l) => l.cls === cls.uuid);
    const patch = { "system.levels": lv.length, "system.hp": lv.reduce((n, l) => n + (Number(l.hp) || 0), 0) };
    if (classIds.has(cls.uuid)) {
      // A gestalt class is built again (its features and bonus caster levels follow its levels)
      if (cls.gestalt) { const g = await classData(cls, plan, cat, patch); updates.push({ _id: classIds.get(cls.uuid), name: g.name, system: g.system, [`flags.${MOD}.gestalt`]: flagsOf(g).gestalt }); }
      // (a spontaneous caster since the world setting changed: its casting follows)
      // (class feature variants: the item's features and notes follow the ones chosen)
      else if (Object.keys(featureOptionsFor(cls, cat)).length) {
        const g = await classData(cls, plan, cat, patch);
        updates.push({ _id: classIds.get(cls.uuid), ...patch, "system.addedAbilities": g.system.addedAbilities ?? [], "system.disabledAbilities": g.system.disabledAbilities ?? [],
          "system.nonActiveClassAbilities": g.system.nonActiveClassAbilities ?? [], [`flags.${MOD}.features`]: flagsOf(g)?.features ?? [],
          "system.classSkills": g.system.classSkills ?? {}, ...(typeof g.system.hasSpecialSlot === "boolean" && !cls.casting?.aamSpontaneous ? { "system.hasSpecialSlot": g.system.hasSpecialSlot } : {}),
          ...(cls.casting?.aamSpontaneous ? Object.fromEntries(Object.entries(applySpontaneous({ system: {} }, cls).system).map(([k, v]) => [`system.${k}`, v])) : {}) });
      }
      else updates.push({ _id: classIds.get(cls.uuid), ...patch, ...(cls.casting?.aamSpontaneous ? Object.fromEntries(Object.entries(applySpontaneous({ system: {} }, cls).system).map(([k, v]) => [`system.${k}`, v])) : {}) });
    }
    else { create.push(await classData(cls, plan, cat, patch)); order.push(cls.uuid); }
  }
  // Gestalt casting classes at level 0 (kept, added or removed with the plan)
  const { needsCopy, bonus } = gestaltCasters(plan, cat);
  for (const u of needsCopy) if (!classIds.has(u)) { create.push(await casterCopyData(u)); order.push(u); }
    // (a copy already there: its casting follows spontaneous casting)
    else if (cat.classes.get(u)?.casting?.aamSpontaneous) updates.push({ _id: classIds.get(u), ...Object.fromEntries(Object.entries(applySpontaneous({ system: {} }, cat.classes.get(u)).system).map(([k, v]) => [`system.${k}`, v])) });
  for (const [u, id] of classIds) if (!d.classes.some((c) => c.cls?.uuid === u) && !needsCopy.includes(u)) { gone.push(id); classIds.delete(u); }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  if (create.length) { const made = await actor.createEmbeddedDocuments("Item", create); order.forEach((u, i) => classIds.set(u, (made.find((it) => flagsOf(it)?.gestalt?.key === u || flagsOf(it)?.gestaltCaster?.uuid === u) ?? made[i])?.id)); }
  await applyPsionicComponents(actor, plan, cat, bonus);
  // Abilities, details, level records and skill ranks
  const base = baseAbilities(plan);
  const records = levelRecords(plan, cat, classIds, actor.items);
  const skills = skillPoints(records);
  // Skills that lose all their ranks go to 0 (everything A&M read is in the plan)
  for (const [k, sk] of Object.entries(actor.system?.skills ?? {})) {
    if ((Number(sk?.points) || Number(sk?.rank)) && !(`system.skills.${k}.points` in skills)) skills[`system.skills.${k}.points`] = 0;
    for (const [tag, ss] of Object.entries(sk?.subSkills ?? {})) if ((Number(ss?.points) || Number(ss?.rank)) && !(`system.skills.${k}.subSkills.${tag}.points` in skills)) skills[`system.skills.${k}.subSkills.${tag}.points`] = 0;
  }
  const update = {
    name: plan.name?.trim() || actor.name,
    "system.details.alignment": plan.alignment || "tn", "system.details.gender": plan.sex ?? "", "system.details.deity": plan.deity ?? "",
    "system.details.age": plan.age ?? "", "system.details.height": plan.height ?? "", "system.details.weight": plan.weight ?? "",
    "system.details.levelUpProgression": true, "system.details.level.available": d.level, "system.details.levelUpData": records,
    "system.traits.languages.value": [...new Set([...(d.race?.ext?.languages ?? []), ...(plan.languages ?? [])])],
    "system.traits.languages.custom": plan.customLanguages ?? "",
    ...Object.fromEntries(R.ABILITIES.map((a) => [`system.abilities.${a}.value`, Number(base[a]) || 10])),
    ...skills,
    [`flags.${MOD}.plan`]: flagPlan(stripEdit(plan)), [`flags.${MOD}.version`]: 2,
  };
  if (plan.img && plan.img !== actor.img) update.img = plan.img;
  if (plan.tokenImg) update["prototypeToken.texture.src"] = plan.tokenImg;
  if (plan.race !== before.race && d.race?.ext?.size) update["system.traits.size"] = d.race.ext.size;
  // Craft, Perform and Profession named in the plan but not on the actor yet
  for (const s of plan.subSkills ?? []) {
    if (actor.system?.skills?.[s.parent]?.subSkills?.[s.tag]) continue;
    if (!plan.levels.some((lv) => Number(lv.skills?.[s.tag]) > 0)) continue;
    const sk = cat.skills.find((x) => x.key === s.parent);
    const pk = `system.skills.${s.parent}.subSkills.${s.tag}.points`;
    update[`system.skills.${s.parent}.subSkills.${s.tag}`] = { name: s.name, ability: sk?.ability ?? "int", rank: 0, notes: "", mod: 0, rt: !!sk?.rt, cs: false, acp: false, points: update[pk] ?? 0 };
    delete update[pk];
  }
  // Experience: at least the start of the new level, and below the next (characters)
  if (actor.type === "character") {
    const xp = Number(actor.system?.details?.xp?.value) || 0;
    if (xp < R.xpFor(d.level) || xp >= R.xpFor(d.level + 1)) update["system.details.xp.value"] = R.xpFor(d.level);
  }
  await actor.update(update);
  await step(t("Feats…"));
  // Feats: those kept stay, the removed ones go, the new ones are added
  const was = new Map();
  for (const lv of before.levels ?? []) for (const f of lv.feats ?? []) if (f.itemId) was.set(f.itemId, f);
  const keep = new Set(), add = [];
  for (const lv of plan.levels) for (const f of lv.feats ?? []) {
    if (!f.uuid) continue;
    if (f.itemId && sameFeat(f, was.get(f.itemId))) { keep.add(f.itemId); continue; }
    const entry = cat.feats.get(f.uuid);
    if (entry) add.push(await featData(entry, f.choice));
  }
  for (const id of was.keys()) if (!keep.has(id) && actor.items.get(id)) gone.push(id);
  // Spells: removed ones go, prepared counts change in place, new ones are added (below)
  const spellWas = new Map(), spellNow = new Map();
  for (const l of Object.values(before.spells ?? {})) for (const s of l ?? []) if (s.itemId) spellWas.set(s.itemId, s);
  for (const l of Object.values(plan.spells ?? {})) for (const s of l ?? []) if (s.itemId) spellNow.set(s.itemId, s);
  const prep = [];
  for (const [id, s] of spellWas) {
    if (!actor.items.get(id)) continue;
    const now = spellNow.get(id);
    if (!now) gone.push(id);
    else if (Number(now.prepared || 0) !== Number(s.prepared || 0)) prep.push({ _id: id, "system.preparation.preparedAmount": now.prepared || 0, "system.preparation.maxAmount": now.prepared || 0 });
  }
  if (gone.length) await actor.deleteEmbeddedDocuments("Item", [...new Set(gone)]);
  if (add.length) await actor.createEmbeddedDocuments("Item", add);
  if (prep.length) await actor.updateEmbeddedDocuments("Item", prep);
  try { await syncCombatStyles(actor, plan, cat, d); } catch (err) { console.error(`${MOD} | combat style`, err); }
  await step(t("Spells…"));
  try { await applySpells(actor, plan, cat, d, { edit: true, classIds }); } catch (err) { console.error(`${MOD} | spells`, err); ui.notifications.warn(t("Spells couldn't all be added: {error}", { error: err.message })); }
  if (plan.gear?.items?.length || plan.gear?.loot || Object.keys(plan.gear?.actor ?? {}).length) {
    await step(t("Equipment and treasure…"));
    try { actor._aamGear = await applyGear(actor, plan, cat, d, { edit: true, fromLevel: before.levels?.length ?? 0 }); } catch (err) { console.error(`${MOD} | gear`, err); ui.notifications.warn(t("Gear couldn't all be added: {error}", { error: err.message })); }
  }
  // Hit points full again if they were
  const max = actor.system?.attributes?.hp?.max;
  if (hpWasFull && Number.isFinite(max) && max > 0) await actor.update({ "system.attributes.hp.value": max });
  await syncXpTrait(actor, { favored: d.race ? d.race.ext?.favored ?? null : undefined });
  return { actor, backup: copy };
}

/** The plan without what only an edit needs (item ids, where it came from). */
function stripEdit(plan) {
  const p = foundry.utils.deepClone(plan);
  delete p._edit;
  for (const lv of p.levels ?? []) for (const f of lv.feats ?? []) delete f.itemId;
  for (const l of Object.values(p.spells ?? {})) for (const s of l ?? []) delete s.itemId;
  p.gear = { items: [], loot: false };
  return p;
}
