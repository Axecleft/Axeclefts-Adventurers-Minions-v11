/**
 * A&M v2 — Edit: reading an existing actor back into a plan.
 *
 * An actor A&M made reopens with its plan (flags.axeclefts-adventurers-minions.plan), as long as its classes still match it. Any
 * other actor is read from what it has: its race and class items, D35E's level records when it uses level-up
 * progression (otherwise its class items' levels, with the skill ranks spread over the levels), its feats and spells.
 * Anything A&M can't place (a feat it has no slot for, an item it doesn't know) is listed and left on the actor.
 */
import { newPlan, newLevel, derive, baseName } from "../core/plan.js";
import { spreadSkills, placeFeats, guessIncreases } from "../core/edit.js";
import { profileOf } from "../core/random.js";
import { pickable } from "../core/catalog-data.js";
import * as R from "../core/rules.js";
import { MOD, flagsOf, sourceOf } from "./catalog.js";
import { planFromFlags, baseAbilities } from "./builder.js";
import { createTag } from "./extras.js";
import { specKind } from "../core/spells.js";
import { ensureGestalt, isGestalt } from "../core/gestalt.js";

const A = () => globalThis.AxecleftTools;
const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const english = (doc) => { try { return A()?.enName?.(doc) || doc.flags?.world?.axecleftEn || doc.name; } catch (e) { return doc.flags?.world?.axecleftEn || doc.name; } };

/** The catalog entry an item on the actor came from: by its compendium source, else by its English name (D35E's first). */
function match(map, doc) {
  const src = sourceOf(doc);
  if (src && map.has(src)) return map.get(src);
  // "Weapon Focus (Longsword)" is Weapon Focus with its choice
  const bare = (x) => String(x ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  const en = baseName(english(doc)), name = baseName(doc.name);
  let found = [...map.values()].filter((e) => same(baseName(e.en), en) || same(baseName(e.name), name));
  if (!found.length) found = [...map.values()].filter((e) => same(baseName(e.en), bare(en)) || same(baseName(e.name), bare(name)));
  return found.find((e) => String(e.uuid).startsWith("Compendium.D35E.")) ?? found[0] ?? null;
}

/** A feat item's choice (Weapon Focus's weapon, Skill Focus's skill), as the plan keeps it. */
/** An item A&M added as a feat (its feats carry their choice in A&M's flag, even when there's none). */
const aamAdded = (doc) => { const f = flagsOf(doc); return !!f && Object.prototype.hasOwnProperty.call(f, "choice"); };

function featChoice(entry, doc) {
  const flag = flagsOf(doc)?.choice;
  if (flag?.value) return flag;
  if (entry?.choice?.kind === "custom") {
    const v = doc.system?.customAttributes?.[entry.choice.attr]?.value;
    if (v && v !== "no") return { value: v, label: entry.choice.options.find((o) => same(o.value, v))?.label ?? v };
  }
  if (entry?.choice?.kind === "skill") {
    const c = (doc.system?.changes ?? [])[entry.choice.change];
    const v = Array.isArray(c) ? c[2] : c?.subTarget;
    if (v) return { value: v, label: v };
  }
  // "Weapon Focus (Longsword)": the option named in brackets
  const m = String(doc.name).match(/\(([^)]+)\)\s*$/);
  if (m && entry?.choice?.kind === "custom") {
    const o = entry.choice.options.find((x) => same(x.label, m[1]) || same(x.value, m[1]));
    if (o) return { value: o.value, label: o.label };
  }
  return null;
}

/**
 * The plan for an actor. → { plan, notes: [{ code, data }] }
 * plan._edit holds where each part came from (see core/edit.js), so Apply changes only what you changed.
 */
export function readActor(actor, cat, data = {}) {
  const sys = actor.system ?? {};
  const notes = [];
  const note = (code, d = {}) => notes.push({ code, data: d });
  const kept = [];
  const plan = newPlan({ kind: actor.type === "npc" ? "npc" : "character", abilityMethod: "typed" });
  const det = sys.details ?? {};
  Object.assign(plan, {
    name: actor.name ?? "", sex: det.gender ?? "", alignment: det.alignment || "tn", deity: det.deity ?? "", age: String(det.age ?? ""), height: String(det.height ?? ""), weight: String(det.weight ?? ""),
    img: actor.img ?? "", tokenImg: actor.prototypeToken?.texture?.src ?? "",
  });
  // Race
  const raceItem = actor.items.find((i) => i.type === "race");
  const race = raceItem ? match(cat.races, raceItem) : null;
  plan.race = race?.uuid ?? null;
  if (raceItem && !race) { note("unknownRace", { name: raceItem.name }); kept.push({ id: raceItem.id, name: raceItem.name, type: "race", why: "unknown" }); }
  // Languages: the race's own are automatic
  const auto = new Set(race?.ext?.languages ?? []);
  plan.languages = (sys.traits?.languages?.value ?? []).filter((l) => !auto.has(l));
  plan.customLanguages = String(sys.traits?.languages?.custom ?? "");

  // Classes on the actor → catalog classes
  const classes = new Map(); // class uuid → item id
  const itemCls = new Map(); // item id → class uuid
  ensureGestalt(cat.classes);
  for (const it of actor.items.filter((i) => i.type === "class")) {
    // Gestalt classes A&M built (by the two classes they name), and the casting classes it put on at level 0
    const g = flagsOf(it)?.gestalt, gc = flagsOf(it)?.gestaltCaster;
    if (g?.key && cat.classes.get(g.key)) { classes.set(g.key, it.id); itemCls.set(it.id, g.key); continue; }
    // Variant classes A&M built ("Barbarian (Bear Totem)")
    const vr = flagsOf(it)?.variant;
    if (vr?.uuid && cat.classes.get(vr.uuid)) { classes.set(vr.uuid, it.id); itemCls.set(it.id, vr.uuid); continue; }
    if (vr) { note("unknownClass", { name: it.name }); kept.push({ id: it.id, name: it.name, type: "class", why: "unknown" }); continue; }
    if (gc?.uuid && cat.classes.get(gc.uuid)) { classes.set(gc.uuid, it.id); itemCls.set(it.id, gc.uuid); continue; }
    if (g) { note("unknownClass", { name: it.name }); kept.push({ id: it.id, name: it.name, type: "class", why: "unknown" }); continue; }
    const e = match(cat.classes, it);
    if (!e) { if (String(it.system?.classType ?? "").toLowerCase() !== "template") { note("unknownClass", { name: it.name }); kept.push({ id: it.id, name: it.name, type: "class", why: "unknown" }); } continue; }
    classes.set(e.uuid, it.id); itemCls.set(it.id, e.uuid);
  }
  // Class feature variants A&M put on the class items (whirling frenzy…)
  for (const [u, id] of classes) { const fo = flagsOf(actor.items.get(id))?.features; if (Array.isArray(fo) && fo.length) (plan.featureOptions ??= {})[u] = [...fo]; }
  const counts = new Map([...classes].map(([u, id]) => [u, Number(actor.items.get(id)?.system?.levels) || 0]));
  const total = [...counts.values()].reduce((n, x) => n + x, 0);

  // Levels: A&M's own plan when it still matches, else D35E's level records, else the class items
  const flag = planFromFlags(flagsOf(actor)?.plan);
  const flagMatches = flag?.levels?.length === total && [...counts].every(([u, n]) => flag.levels.filter((l) => l.cls === u).length === n);
  const records = Array.isArray(det.levelUpData) ? det.levelUpData : [];
  const recordsMatch = det.levelUpProgression && records.length === total && records.every((r) => itemCls.has(r.classId));
  let from;
  if (flagMatches) {
    from = "plan";
    plan.levels = flag.levels.map((l) => ({ ...newLevel(l.cls), hp: l.hp, skills: { ...(l.skills ?? {}) }, increase: l.increase ?? null }));
    plan.subSkills = foundry.utils.deepClone(flag.subSkills ?? []);
    plan.hp = { ...plan.hp, ...(flag.hp ?? {}) };
    plan.abilities = foundry.utils.deepClone(flag.abilities ?? plan.abilities);
  } else if (recordsMatch) {
    from = "records";
    const sorted = [...records].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    const subs = new Map(); // sub-skill tag → parent
    plan.levels = sorted.map((r) => {
      const lv = newLevel(itemCls.get(r.classId));
      lv.hp = Number(r.hp) || 0;
      for (const [k, v] of Object.entries(r.skills ?? {})) {
        if (Number(v?.points) > 0) lv.skills[k] = Number(v.points);
        for (const [tag, sv] of Object.entries(v?.subskills ?? {})) { subs.set(tag, k); if (Number(sv?.points) > 0) lv.skills[tag] = Number(sv.points); }
      }
      return lv;
    });
    for (const [tag, parent] of subs) plan.subSkills.push({ tag, parent, name: sys.skills?.[parent]?.subSkills?.[tag]?.name ?? tag });
  } else {
    from = "classes";
    // Base classes first (the most levels first), then prestige classes; hit points split over the levels
    const kindRank = { racial: 0, base: 1, minion: 2, prestige: 3 };
    let order = [...counts].filter(([, n]) => n > 0).sort((a, b) => (kindRank[cat.classes.get(a[0])?.kind] ?? 1) - (kindRank[cat.classes.get(b[0])?.kind] ?? 1) || b[1] - a[1]);
    order = bestOrder(order, plan, cat, skillTotals(sys), Object.fromEntries(R.ABILITIES.map((a) => [a, Number(sys.abilities?.[a]?.value) || 10])));
    for (const [u, n] of order) {
      const c = cat.classes.get(u), item = actor.items.get(classes.get(u));
      let hpLeft = Number(item?.system?.hp) || 0;
      for (let i = 0; i < n; i++) {
        const lv = newLevel(u);
        const first = plan.levels.length === 0;
        // The character's first level has the hit die's maximum; the rest is shared out
        const share = first ? Math.min(c.hd, hpLeft) : Math.round(hpLeft / (n - i));
        lv.hp = Math.max(1, Math.min(c.hd, share)); hpLeft -= lv.hp;
        plan.levels.push(lv);
      }
    }
    if (total) note("levelsFromClasses");
  }
  if (!from || !plan.levels.length) note("noLevels");
  plan.gestalt = !!flag?.gestalt || plan.levels.some((l) => isGestalt(l.cls));

  // Abilities: the actor's scores (A&M's plan keeps where the increases went; otherwise they are guessed)
  const actorBase = Object.fromEntries(R.ABILITIES.map((a) => [a, Number(sys.abilities?.[a]?.value) || 10]));
  if (from === "plan") {
    const was = baseAbilities(plan);
    if (R.ABILITIES.some((a) => Number(was[a]) !== actorBase[a])) {
      plan.abilities.method = "typed";
      plan.abilities.base = { ...actorBase };
      plan.levels.forEach((lv, i) => { if (lv.increase && R.hasIncrease(i + 1)) plan.abilities.base[lv.increase] -= 1; });
      note("abilitiesChanged");
    }
  } else {
    plan.abilities = { method: "typed", base: { ...actorBase }, budget: 25, dice: "4d6" };
    const prof = profileOf(cat.classes.get(plan.levels[0]?.cls), data);
    guessIncreases(plan, prof?.increases?.length ? prof.increases : [prof?.abilities?.[0] ?? "str"]);
    if (plan.levels.some((lv, i) => R.hasIncrease(i + 1))) note("increasesGuessed");
  }

  // Skills of actors without level records: their ranks spread over the levels
  if (from === "classes") {
    const totals = skillTotals(sys);
    for (const [k, s] of Object.entries(sys.skills ?? {})) for (const [tag, ss] of Object.entries(s?.subSkills ?? {})) plan.subSkills.push({ tag, parent: k, name: ss?.name ?? tag });
    const short = spreadSkills(plan, cat, totals);
    if (Object.keys(short).length) note("skillsShort", { list: Object.entries(short).map(([k, r]) => ({ key: k, ranks: r })) });
  }

  // Feats: the actor's general feats (class and racial abilities stay as D35E made them)
  // and the class special abilities A&M added (the rogue's: its flag says so; the ones D35E adds itself stay)
  // (not the feats another item brought with it: a combat style's Rapid Shot, D35E's linked items)
  const featItems = actor.items.filter((i) => !i.system?.linkSourceId && !flagsOf(i)?.styleFeat && !flagsOf(i)?.optionFeat && (pickable(i) || (i.type === "feat" && i.system?.featType === "classFeat" && aamAdded(i) && !flagsOf(i)?.combatStyle)));
  const feats = [];
  for (const it of featItems) {
    const e = match(cat.feats, it);
    if (!e) { kept.push({ id: it.id, name: it.name, type: "feat", why: "unknown" }); continue; }
    feats.push({ uuid: e.uuid, choice: featChoice(e, it), itemId: it.id });
  }
  let left = feats;
  if (from === "plan") {
    // The plan's slots, where the actor still has that feat
    plan.levels.forEach((lv, i) => {
      for (const f of flag.levels[i]?.feats ?? []) {
        const k = left.findIndex((x) => x.uuid === f.uuid && String(x.choice?.value ?? "") === String(f.choice?.value ?? ""));
        if (k < 0) continue;
        lv.feats.push({ slot: f.slot, uuid: f.uuid, choice: left[k].choice, itemId: left[k].itemId });
        left = left.filter((_, j) => j !== k);
      }
    });
    if (left.length) left = placeFeats(plan, cat, left, { keep: true });
  } else left = placeFeats(plan, cat, left);
  for (const f of left) { const it = actor.items.get(f.itemId); kept.push({ id: f.itemId, name: it?.name ?? "?", type: "feat", why: "noSlot" }); }

  // Spells: the actor's spells, by the class of their spellbook (spells inside Curios' spellbook items stay with the book)
  const books = sys.attributes?.spells?.spellbooks ?? {};
  const bookCls = {};
  for (const [key, b] of Object.entries(books)) {
    for (const [u, id] of classes) {
      const it = actor.items.get(id);
      if (b?.class && (b.class === createTag(it?.system?.customTag || it?.name) || same(b.class, it?.name) || same(b.name, it?.name))) bookCls[key] = u;
    }
  }
  plan.spells = {};
  let inBooks = 0;
  const specialCopies = []; // [{ book, level, name }] D35E's special slot copies (domain or specialty slot)
  for (const it of actor.items.filter((i) => i.type === "spell")) {
    if (it.system?.specialPrepared) { specialCopies.push({ book: it.system?.spellbook ?? "primary", level: Number(it.system?.level) || 0, name: it.name }); continue; }
    if (it.flags?.["axeclefts-curios"]?.child) { inBooks++; continue; }
    const u = bookCls[it.system?.spellbook ?? "primary"];
    if (!u) { kept.push({ id: it.id, name: it.name, type: "spell", why: "noClass" }); continue; }
    (plan.spells[u] ??= []).push({ uuid: sourceOf(it) ?? it.uuid, name: it.name, level: Number(it.system?.level) || 0, prepared: Number(it.system?.preparation?.preparedAmount) || 0, itemId: it.id });
  }
  if (inBooks) note("spellsInBooks", { n: inBooks });
  // Domains and specialist school (1.14.0.8): D35E's Spell Schools and Domains feats on the actor, and the special slots
  plan.specs = {};
  const specItems = actor.items.filter((i) => i.type === "feat" && i.system?.featType === "spellSpecialization");
  const specOfItem = (it) => {
    const key = String(it.system?.spellSpecializationName ?? "").split(",")[0].trim().toLowerCase(), dom = !!it.system?.spellSpecialization?.isDomain;
    return [...(cat.specs?.values() ?? [])].find((e) => e.isDomain === dom && e.key === key) ?? null;
  };
  for (const u of classes.keys()) {
    const cls = cat.classes.get(u), kind = specKind(cls);
    if (kind === "domains") {
      const doms = specItems.map(specOfItem).filter((e) => e?.isDomain && !e.arcane);
      plan.specs[u] = { domains: [...new Set(doms.map((e) => e.uuid))].slice(0, 2) };
      const names = new Set(doms.flatMap((e) => e.spells.map((x) => x.name.toLowerCase())));
      for (const x of plan.spells[u] ?? []) if (names.has(x.name.toLowerCase())) x.domain = true;
    } else if (kind === "school") {
      // A specialist's school feat, or a domain wizard's arcane domain (A&M's domain feat)
      const it = specItems.find((i) => !i.system?.spellSpecialization?.isDomain) ?? specItems.find((i) => specOfItem(i)?.arcane);
      const e = it ? specOfItem(it) : null;
      plan.specs[u] = { school: e?.uuid ?? null, prohibited: e && !e.arcane ? String(it.system?.spellSpecializationForbiddenNames ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) : [] };
      if (e?.arcane) { const names = new Set(e.spells.map((x) => x.name.toLowerCase())); for (const x of plan.spells[u] ?? []) if (names.has(x.name.toLowerCase())) x.domain = true; }
    }
  }
  for (const c of specialCopies) {
    const u = bookCls[c.book];
    const x = (plan.spells[u] ?? []).find((y) => y.level === c.level && same(y.name, c.name)) ?? (plan.spells[u] ?? []).find((y) => same(y.name, c.name));
    if (x) x.special = true;
  }
  plan._spellsFilled = true; plan._equipmentFilled = true;
  // Gear: what the actor carries stays; an edit only adds
  plan.gear = { items: [], loot: false };
  if (kept.length) note("kept", { list: kept.map((k) => k.name) });
  plan._edit = { actorId: actor.id, actorUuid: actor.uuid, classes: Object.fromEntries(classes), race: raceItem?.id ?? null, kept, from, level: plan.levels.length };
  return { plan, notes };
}

/** An actor's skill ranks: { key: ranks } (sub-skills by their tag). */
function skillTotals(sys) {
  const totals = {};
  for (const [k, s] of Object.entries(sys.skills ?? {})) {
    const r = Number(s?.rank ?? s?.points) || 0;
    if (r > 0) totals[k] = r;
    for (const [tag, ss] of Object.entries(s?.subSkills ?? {})) { const sr = Number(ss?.rank ?? ss?.points) || 0; if (sr > 0) totals[tag] = sr; }
  }
  return totals;
}

/**
 * The order of an actor's classes (without level records, it isn't known): the one whose levels best hold its skill
 * ranks (class skills bought in that class's levels), trying every order of up to four classes; ties keep the first.
 */
function bestOrder(order, plan, cat, totals, scores) {
  if (order.length < 2 || order.length > 4 || !Object.keys(totals).length) return order;
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r])));
  let best = order, bestShort = Infinity;
  for (const o of perms(order)) {
    const trial = { ...plan, abilities: { ...plan.abilities, base: { ...scores } }, subSkills: [], levels: [] };
    for (const [u, n] of o) for (let i = 0; i < n; i++) trial.levels.push(newLevel(u));
    const short = spreadSkills(trial, cat, totals);
    const n = Object.values(short).reduce((x, y) => x + y, 0);
    if (n < bestShort - 1e-9) { best = o; bestShort = n; }
  }
  return best;
}
