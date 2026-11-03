/**
 * A&M — the multiclass XP penalty on the actor (SRD: −20% XP for each class more than one level below the highest;
 * the favored class, prestige classes and racial hit dice don't count).
 *
 * An actor with a penalty carries a trait, "Multiclass XP Penalty (−20%)" (a D35E feat item of type Trait, made by A&M,
 * flags.axeclefts-adventurers-minions.xpTrait), and XP it gains is reduced by that much: any update that raises the
 * actor's XP (the sheet, a GM's award, a macro) gives the reduced amount, with a note saying so. The trait follows the
 * classes: when an actor A&M made gains, changes or loses a class (A&M's Edit, D35E's level-up) the trait's
 * percentage is worked out again, and the trait leaves when the penalty does. World setting "Multiclass XP penalty"
 * turns all of this off. An update made with { aamNoXpPenalty: true } is left as it is.
 */
import { MOD, flagsOf } from "./catalog.js";
import { xpPenaltyOf } from "../core/plan.js";

const A = () => globalThis.AxecleftTools;
const fmt = (s, d) => (d ? String(s).replace(/\{(\w+)\}/g, (m, k) => (d[k] ?? m)) : String(s));
const t = (s, d) => A()?.t?.(s, d) ?? fmt(s, d);
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const english = (doc) => { try { return A()?.enName?.(doc) || doc.name; } catch (e) { return doc.name; } };
const enabled = () => { try { return game.settings.get(MOD, "xpPenalty") !== false; } catch (e) { return true; } };

/** The actor's penalty trait (A&M's), or null. */
export const xpTraitOf = (actor) => actor?.items?.find((i) => i.type === "feat" && flagsOf(i)?.xpTrait) ?? null;

let races = null;
async function racesData() {
  if (races) return races;
  try { races = await foundry.utils.fetchJsonWithTimeout(`modules/${MOD}/data/races.json`); } catch (e) { races = {}; }
  return races;
}

/** The race's favored class: the trait's (kept when A&M made it), else A&M's race data, by the race item's English name. */
async function favoredOf(actor, given) {
  if (given !== undefined) return given;
  const kept = flagsOf(xpTraitOf(actor))?.favored;
  if (kept !== undefined) return kept;
  const race = actor.items.find((i) => i.type === "race");
  if (!race) return null;
  const data = await racesData();
  const en = english(race);
  const key = Object.keys(data).find((k) => k.toLowerCase() === en.toLowerCase()) ?? Object.keys(data).find((k) => k.toLowerCase() === race.name.toLowerCase());
  return key ? data[key]?.favored ?? null : null;
}

/** The penalty of the actor's classes as they are now. */
export async function actorPenalty(actor, favored) {
  const cls = actor.items.filter((i) => i.type === "class");
  if (cls.some((i) => flagsOf(i)?.gestalt)) return { pct: 0, behind: [], top: null, favored: null };
  const list = cls.map((i) => ({ en: english(i), name: i.name, kind: i.system?.classType ?? "base", levels: Number(i.system?.levels) || 0 }));
  return xpPenaltyOf(list, await favoredOf(actor, favored));
}

function traitText(r) {
  const behind = r.behind.map((c) => c.name).join(", ");
  return `<p>${esc(t("Multiclass XP penalty (SRD): −20% XP for each class more than one level below the highest-level class. The favored class, prestige classes and racial hit dice don't count."))}</p>`
    + `<p>${esc(t("Now: −{pct}% ({classes} more than one level below {top}).", { pct: r.pct, classes: behind, top: r.top?.name ?? "" }))}`
    + `${r.favored ? ` ${esc(t("Favored class: {cls}.", { cls: r.favored.name }))}` : ""}</p>`
    + `<p>${esc(t("Adventurers and Minions reduces the XP this character gains by that much, and keeps this trait up to date when the classes change. To stop it, turn off the world setting Multiclass XP penalty."))}</p>`;
}

const locks = new Map();
/**
 * The trait as the actor's classes say: made, changed or removed. favored: the race's favored class, when the caller
 * knows it (A&M's builder); otherwise the trait's or A&M's race data.
 */
export function syncXpTrait(actor, { favored } = {}) {
  if (!actor) return Promise.resolve();
  const prev = locks.get(actor.id) ?? Promise.resolve();
  const next = prev.then(() => doSync(actor, favored)).catch((e) => console.warn(`${MOD} | XP penalty trait`, e));
  locks.set(actor.id, next);
  return next;
}
async function doSync(actor, favored) {
  if (!enabled() || !actor.isOwner) return;
  const r = await actorPenalty(actor, favored);
  const fav = favored !== undefined ? favored : await favoredOf(actor);
  const trait = xpTraitOf(actor);
  if (!r.pct) { if (trait) await trait.delete(); return; }
  const name = t("Multiclass XP Penalty (−{pct}%)", { pct: r.pct });
  const flags = { [MOD]: { xpTrait: true, pct: r.pct, favored: fav ?? null } };
  const system = { featType: "trait", description: { value: traitText(r) } };
  if (trait) {
    if (trait.name !== name || flagsOf(trait)?.pct !== r.pct) await trait.update({ name, system, flags });
    return;
  }
  await actor.createEmbeddedDocuments("Item", [{ name, type: "feat", img: "icons/svg/downgrade.svg", system, flags }]);
}

/** The hooks: XP gains reduced, and the trait kept up with the classes of the actors A&M made. */
export function registerXpHooks() {
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if (options?.aamNoXpPenalty || !enabled()) return;
    const flat = Object.prototype.hasOwnProperty.call(changes, "system.details.xp.value");
    const v = flat ? changes["system.details.xp.value"] : foundry.utils.getProperty(changes, "system.details.xp.value");
    if (v === undefined || v === null || v === "") return;
    const pct = Number(flagsOf(xpTraitOf(actor))?.pct) || 0;
    if (!pct) return;
    const old = Number(actor.system?.details?.xp?.value) || 0, now = Number(v);
    if (!Number.isFinite(now) || now <= old) return;
    const gain = now - old, got = Math.floor((gain * (100 - pct)) / 100);
    if (flat) changes["system.details.xp.value"] = old + got;
    else foundry.utils.setProperty(changes, "system.details.xp.value", old + got);
    ui.notifications.info(t("{name}: +{gain} XP becomes +{got} (multiclass XP penalty −{pct}%).", { name: actor.name, gain, got, pct }));
  });
  // Classes changed on an actor A&M made (or one with the trait): the trait follows, a moment later (several items at once)
  const timers = new Map();
  const changed = (item, userId) => {
    const actor = item?.parent;
    if (item?.type !== "class" || !actor || actor.documentName !== "Actor" || userId !== game.user?.id) return;
    if (!flagsOf(actor)?.plan && !xpTraitOf(actor)) return;
    clearTimeout(timers.get(actor.id));
    timers.set(actor.id, setTimeout(() => { timers.delete(actor.id); syncXpTrait(actor); }, 400));
  };
  Hooks.on("createItem", (item, options, userId) => changed(item, userId));
  Hooks.on("updateItem", (item, change, options, userId) => { if (foundry.utils.hasProperty(change, "system.levels") || foundry.utils.hasProperty(change, "system.classType")) changed(item, userId); });
  Hooks.on("deleteItem", (item, options, userId) => changed(item, userId));
}
