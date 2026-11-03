/**
 * A&M v2 — Edit, with no Foundry code: putting an existing actor's feats and skills into a plan, and the list of what
 * an edit changes.
 *
 * The plan of an edited actor carries where its parts came from (plan._edit):
 *   { actorId, classes: { <class uuid>: <item id> }, race: <item id> | null, feats: [<item id>…], spells: [<item id>…],
 *     kept: [{ id, name, type, why }], levelsFrom: "records" | "classes" | "plan", notes: [codes] }
 * and each feat or spell read from the actor keeps its item id (itemId), so Apply changes only what changed.
 */
import { classSkillsFor } from "./variants.js";
import * as R from "./rules.js";
import { derive, prereqs, takenUpTo, baseName } from "./plan.js";

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/**
 * Skill ranks spread over the levels, as a person would have bought them: level by level, each skill raised as far as
 * that level's points and maximum ranks allow, the skills with the most ranks first.
 * totals: { key: ranks } → what couldn't be placed: { key: ranks }.
 */
export function spreadSkills(plan, cat, totals) {
  const want = Object.fromEntries(Object.entries(totals).filter(([, r]) => Number(r) > 0).map(([k, r]) => [k, Number(r)]));
  plan.levels.forEach((lv) => { lv.skills = {}; });
  const keys = Object.keys(want).sort((a, b) => want[b] - want[a]);
  for (let L = 1; L <= plan.levels.length; L++) {
    const lv = plan.levels[L - 1];
    const d = derive(plan, cat), p = d.perLevel[L - 1];
    if (!p?.cls) continue;
    const cs = (k) => { const sub = plan.subSkills.find((s) => s.tag === k); return !!classSkillsFor(plan, p.cls, cat)?.[sub ? sub.parent : k]; };
    let left = p.skillPoints.gain;
    const before = (k) => d.perLevel[L - 2]?.ranks?.[k] ?? 0;
    const max = (k) => (p.anyClassSkill(k) ? p.maxClass : p.maxCross);
    // Round by round, one point to each skill still short, so they rise together as the levels go: first the skills
    // this class has as class skills, then (cross-class) only skills none of the character's classes has
    const ever = (k) => { const sub = plan.subSkills.find((s) => s.tag === k); return plan.levels.some((l) => !!classSkillsFor(plan, cat.classes.get(l.cls), cat)?.[sub ? sub.parent : k]); };
    for (const pass of [(k) => cs(k), (k) => !cs(k) && !ever(k)]) {
    let spent = true;
    while (left > 0 && spent) {
      spent = false;
      for (const k of keys) {
        if (left <= 0) break;
        if (!pass(k)) continue;
        const step = cs(k) ? 1 : 0.5;
        const now = before(k) + (lv.skills[k] ?? 0) * step;
        if (now + step > want[k] + 1e-9 || now + step > max(k) + 1e-9) continue;
        lv.skills[k] = (lv.skills[k] ?? 0) + 1; left--; spent = true;
      }
    }
    }
  }
  const d = derive(plan, cat);
  const short = {};
  for (const [k, r] of Object.entries(want)) { const got = d.ranks[k] ?? 0; if (got < r) short[k] = r - got; }
  return short;
}

/**
 * The actor's feats put in the plan's slots: class bonus feats in their class's slots (from its list), the rest in the
 * race and general slots, earliest level first, where their prerequisites are met if possible.
 * feats: [{ uuid, choice, itemId }] → those left over (no slot for them). keep: fill only the empty slots.
 */
export function placeFeats(plan, cat, feats, { keep = false } = {}) {
  if (!keep) plan.levels.forEach((lv) => { lv.feats = []; });
  const left = [...feats];
  const d0 = derive(plan, cat);
  const slots = [];
  for (const p of d0.perLevel) for (const s of p.slots) slots.push({ ...s, level: p.level });
  const put = (s, f) => { plan.levels[s.level - 1].feats.push({ slot: s.slot, uuid: f.uuid, choice: f.choice ?? null, itemId: f.itemId ?? null }); left.splice(left.indexOf(f), 1); };
  const fits = (s, f) => {
    const feat = cat.feats.get(f.uuid); if (!feat) return false;
    // A class special ability only in its own slot; that slot takes a feat instead when it allows it
    if (feat.special) return !!s.special && (s.from ?? []).some((n) => same(n, feat.base));
    if (s.special) return !!s.orFeat;
    if (s.from?.length || s.psionic) return s.from?.some((n) => same(n, feat.base)) || (s.psionic && feat.psionic);
    return true;
  };
  const okAt = (s, f) => {
    if (s.ignorePrereqs) return true;
    const d = derive(plan, cat);
    return prereqs(cat.feats.get(f.uuid), f.choice, d.perLevel[s.level - 1], takenUpTo(d, s.level, s.slot), d).ok;
  };
  // Class slots first (their lists are the narrowest), then the others; in each, a feat whose prerequisites hold there
  // Special ability slots (the rogue's) take abilities first, and a feat instead only once the other slots are full
  const special = slots.filter((s) => s.special);
  const order = [...slots.filter((s) => s.slot.startsWith("class") && !s.special), ...special.map((s) => ({ ...s, abilitiesOnly: true })), ...slots.filter((s) => !s.slot.startsWith("class")), ...special];
  for (const pass of [true, false]) {
    for (const s of order) {
      if (plan.levels[s.level - 1].feats.some((x) => x.slot === s.slot)) continue;
      // A special ability slot takes its abilities before a feat instead
      const pool = s.abilitiesOnly ? left.filter((x) => cat.feats.get(x.uuid)?.special) : s.special ? [...left.filter((x) => cat.feats.get(x.uuid)?.special), ...left.filter((x) => !cat.feats.get(x.uuid)?.special)] : left;
      const f = pool.find((x) => fits(s, x) && (!pass || okAt(s, x)));
      if (f) put(s, f);
    }
  }
  return left;
}

/**
 * Where the ability increases went, when the actor doesn't say: the class profile's choices (its first ability,
 * as Random does). The scores add up to the actor's either way: each increase is taken off the base score.
 */
export function guessIncreases(plan, increases = ["str"]) {
  const list = increases?.length ? increases : ["str"];
  const base = plan.abilities.base;
  let k = 0;
  plan.levels.forEach((lv, i) => {
    if (!R.hasIncrease(i + 1)) { lv.increase = null; return; }
    const a = list[Math.min(k++, list.length - 1)];
    lv.increase = a;
    base[a] = (Number(base[a]) || 0) - 1;
  });
}

/* -------------------------------------------- */
/*  What an edit changes                        */
/* -------------------------------------------- */

const classLine = (d) => d.classes.map((c) => `${c.cls?.name ?? "?"} ${c.levels}`).join(" / ");

/**
 * The changes from one plan to another, for Review: [{ code, data }] (texts are built by the window, translated).
 */
export function planChanges(before, after, cat) {
  const out = [];
  const add = (code, data = {}) => out.push({ code, data });
  const b = derive(before, cat), a = derive(after, cat);
  for (const k of ["name", "alignment", "sex", "deity", "age", "height", "weight"]) if (String(before[k] ?? "") !== String(after[k] ?? "")) add("field", { field: k, from: before[k] ?? "", to: after[k] ?? "" });
  if (before.race !== after.race) add("race", { from: b.race?.name ?? "—", to: a.race?.name ?? "—" });
  if (b.level !== a.level || classLine(b) !== classLine(a)) add("classes", { from: classLine(b) || "—", to: classLine(a) || "—", levels: a.level - b.level });
  // Level by level: a different class, or different hit points
  const n = Math.min(before.levels.length, after.levels.length);
  for (let i = 0; i < n; i++) {
    if (before.levels[i].cls !== after.levels[i].cls) add("levelClass", { level: i + 1, from: cat.classes.get(before.levels[i].cls)?.name ?? "?", to: cat.classes.get(after.levels[i].cls)?.name ?? "?" });
    else if (Number(before.levels[i].hp) !== Number(after.levels[i].hp)) add("levelHp", { level: i + 1, from: before.levels[i].hp, to: after.levels[i].hp });
  }
  for (const ab of R.ABILITIES) if (b.abilities[ab] !== a.abilities[ab]) add("ability", { ability: ab, from: b.abilities[ab], to: a.abilities[ab] });
  if (b.hp !== a.hp) add("hp", { from: b.hp, to: a.hp });
  // Skills (ranks)
  const keys = new Set([...Object.keys(b.ranks), ...Object.keys(a.ranks)]);
  const skills = [];
  for (const k of keys) { const x = b.ranks[k] ?? 0, y = a.ranks[k] ?? 0; if (x !== y) skills.push({ key: k, from: x, to: y }); }
  if (skills.length) add("skills", { list: skills });
  // Feats
  const fk = (f) => `${f.feat.uuid}|${f.choice?.value ?? ""}`;
  const fb = new Map(b.feats.map((f) => [fk(f), f])), fa = new Map(a.feats.map((f) => [fk(f), f]));
  const featName = (f) => (f.choice?.label ? `${baseName(f.feat.name)} (${f.choice.label})` : f.feat.name);
  const gained = [...fa.keys()].filter((k) => !fb.has(k)).map((k) => featName(fa.get(k)));
  const lost = [...fb.keys()].filter((k) => !fa.has(k)).map((k) => featName(fb.get(k)));
  if (gained.length) add("featsAdded", { list: gained });
  if (lost.length) add("featsRemoved", { list: lost });
  // Spells
  const sk = (s) => `${s.uuid}|${s.level}`;
  for (const cls of new Set([...Object.keys(before.spells ?? {}), ...Object.keys(after.spells ?? {})])) {
    const x = new Map((before.spells?.[cls] ?? []).map((s) => [sk(s), s])), y = new Map((after.spells?.[cls] ?? []).map((s) => [sk(s), s]));
    const plus = [...y.keys()].filter((k) => !x.has(k)).length, minus = [...x.keys()].filter((k) => !y.has(k)).length;
    const prep = [...y.keys()].filter((k) => x.has(k) && Number(x.get(k).prepared || 0) !== Number(y.get(k).prepared || 0)).length;
    if (plus || minus || prep) add("spells", { cls: cat.classes.get(cls)?.name ?? "?", plus, minus, prep });
  }
  // Domains and specialist schools
  for (const cls of new Set([...Object.keys(before.specs ?? {}), ...Object.keys(after.specs ?? {})])) {
    const x = before.specs?.[cls] ?? {}, y = after.specs?.[cls] ?? {};
    const name = (u) => cat.specs?.get(u)?.name ?? "?";
    const dx = (x.domains ?? []).map(name).sort().join(", "), dy = (y.domains ?? []).map(name).sort().join(", ");
    if (dx !== dy) add("domains", { cls: cat.classes.get(cls)?.name ?? "?", from: dx || "—", to: dy || "—" });
    const sx = `${x.school ? name(x.school) : ""}|${[...(x.prohibited ?? [])].sort()}`, sy = `${y.school ? name(y.school) : ""}|${[...(y.prohibited ?? [])].sort()}`;
    if (sx !== sy) add("school", { cls: cat.classes.get(cls)?.name ?? "?", from: x.school ? name(x.school) : "—", to: y.school ? name(y.school) : "—", prohibited: (y.prohibited ?? []).join(", ") });
  }
  // Gear: what's added, and what the actor's own items do (unequip, sell for the new gear)
  const items = after.gear?.items ?? [];
  if (items.length) add("gear", { n: items.length });
  const ops = Object.values(after.gear?.actor ?? {});
  const unequip = ops.filter((o) => o?.act === "unequip").map((o) => o.name), sell = ops.filter((o) => o?.act === "sell");
  if (unequip.length) add("gearUnequip", { list: unequip.join(", ") });
  if (sell.length) add("gearSell", { list: sell.map((o) => o.name).join(", "), gp: Math.round(sell.reduce((n, o) => n + (Number(o.gp) || 0), 0) * 100) / 100 });
  if (after.gear?.loot && a.level > b.level) add("loot", { from: b.level, to: a.level });
  return out;
}
