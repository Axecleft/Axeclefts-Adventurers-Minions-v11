/**
 * Axecleft's Adventurers and Minions v2 — complete D35E characters and NPCs.
 *
 * Build (step by step), Random and Edit share one engine: a character plan (scripts/core)
 * that is checked against the SRD rules and written to the actor the way D35E's own level-up window records levels,
 * so D35E works out the rest.
 *
 * API: game.modules.get("axeclefts-adventurers-minions").api = { open, loadCatalog, derive, check, createActor, newPlan }
 */
import { AdventurersWindow } from "./ui/app.js";
import { registerTours } from "./ui/tours.js";
import { loadCatalog, MOD, LEGACY_MOD } from "./foundry/catalog.js";
import { createActor } from "./foundry/builder.js";
import { registerXpHooks } from "./foundry/xp.js";
import { initRelay, canBuild } from "./foundry/relay.js";
import { newPlan, derive, check } from "./core/plan.js";

const A = () => globalThis.AxecleftTools;
const t = (s, d) => A()?.t?.(s, d) ?? s;

A()?.registerLanguageModule?.(MOD);

let win = null;
function open() {
  if (!win) win = new AdventurersWindow();
  if (win.rendered) { win.bringToFront?.(); return win; }
  win.render(true);
  return win;
}
/** Open the window on an actor, to edit it. */
async function edit(actor) {
  const w = open();
  for (let i = 0; i < 50 && !w.root; i++) await new Promise((r) => setTimeout(r, 100));
  return w.openEdit(actor);
}
const editable = (actor) => !!actor && actor.isOwner && ["character", "npc"].includes(actor.type) && game.system?.id === "D35E";

Hooks.once("init", () => {
  try { registerTours(open); } catch (err) { console.warn(`${MOD} | tours`, err); }
  game.settings.register(MOD, "abilityMethod", {
    name: /*t*/"Ability scores", hint: /*t*/"How new characters start their ability scores (each one can be changed).",
    scope: "world", config: true, type: String, default: "pointbuy",
    choices: { pointbuy: /*t*/"Point buy", elite: /*t*/"Elite array", nonelite: /*t*/"Nonelite array", roll: /*t*/"Roll", typed: /*t*/"Type in the scores" },
  });
  game.settings.register(MOD, "pointBudget", {
    name: /*t*/"Point-buy points", hint: /*t*/"Points for the point buy (25 standard, 28 tougher, 32 high-powered).",
    scope: "world", config: true, type: Number, default: 25,
  });
  game.settings.register(MOD, "hpMethod", {
    name: /*t*/"Hit points per level", hint: /*t*/"Hit points for each level after the first (the first is the maximum unless unticked in the window).",
    scope: "world", config: true, type: String, default: "average",
    choices: { average: /*t*/"Average (rounded up)", max: /*t*/"Maximum", roll: /*t*/"Roll" },
  });
  game.settings.register(MOD, "nonSrdSpells", {
    name: /*t*/"Non-SRD spells per caster level", hint: /*t*/"Clerics, druids, paladins, rangers and adepts get every SRD spell they can cast, plus this many spells from other compendiums for each caster level, at each spell level they can cast. Above 0, spellbooks and spells known also get the odd non-SRD spell. 0: SRD spells only.",
    scope: "world", config: true, type: Number, default: 1,
  });
  game.settings.register(MOD, "backupBeforeEdit", {
    name: /*t*/"Copy before an edit", hint: /*t*/"Edit an actor makes a copy of it first, in the folder A&M backups (it can be turned off on Review for one edit).",
    scope: "world", config: true, type: Boolean, default: true,
  });
  game.settings.register(MOD, "playerBuild", {
    name: /*t*/"Players build through the GM", hint: /*t*/"Players can open A&M and edit the actors they own. To make a new actor without Foundry's Create New Actors permission (players don't have it by default), A&M asks a GM who is logged in to create it, owned by that player. Untick to let only users with that permission make actors.",
    scope: "world", config: true, type: Boolean, default: true,
  });
  game.settings.register(MOD, "tradeInPct", {
    name: /*t*/"Trade-in value", hint: /*t*/"Edit an actor: what an item sold for the new levels' gear is worth, as a % of its value (SRD: half, 50). Gems, art and trade goods count at full value.",
    scope: "world", config: true, type: Number, default: 50, range: { min: 0, max: 100, step: 5 },
  });
  game.settings.register(MOD, "playerTradeIn", {
    name: /*t*/"Players can trade in gear", hint: /*t*/"Edit an actor: players can sell the actor's items for the new levels' gear (Sell). Off: players can keep or unequip items; only a GM sells them.",
    scope: "world", config: true, type: Boolean, default: false,
  });
  game.settings.register(MOD, "spontaneousCasting", {
    name: /*t*/"Spontaneous casting", hint: /*t*/"Every caster casts spontaneously: clerics and druids know spells by Unearthed Arcana's spontaneous divine casters (with their domain spells or summon nature's ally, and one more spell a day of each level), paladins and rangers know two more spells than they cast a day, and wizards cast any spell in their spellbook. Off: the standard classes as the SRD has them, and the Spontaneous variant classes to choose. Reload races, classes and feats (start page) after a change.",
    scope: "world", config: true, type: Boolean, default: false,
  });
  game.settings.register(MOD, "classVariants", {
    name: /*t*/"Variant classes", hint: /*t*/"Offer the variant classes of Unearthed Arcana (in the SRD's variant rules) with the standard ones: the totem barbarians, bardic sage, divine and savage bards, cloistered cleric, druidic avenger, thug, monk fighting styles, paladins of freedom, slaughter and tyranny, planar and urban rangers, wilderness rogue and battle sorcerer. A&M builds their class items from the standard classes. Reload races, classes and feats (start page) after a change.",
    scope: "world", config: true, type: Boolean, default: true,
  });
  game.settings.register(MOD, "xpPenalty", {
    name: /*t*/"Multiclass XP penalty", hint: /*t*/"A character A&M makes or edits whose classes give a multiclass XP penalty (SRD: −20% for each class more than one level below the highest; the favored class doesn't count) gets a Multiclass XP Penalty trait, and the XP it gains is reduced by that much. Untick to make no trait and leave XP as it is given.",
    scope: "world", config: true, type: Boolean, default: true,
  });
  registerXpHooks();
  game.settings.register(MOD, "folder", { scope: "client", config: false, type: String, default: "" });
  game.settings.register(MOD, "packs", { scope: "world", config: false, type: Array, default: [] });
  // The GM's own prestige class requirements ({ "English class name": requirements | null }), from Prestige requirements on the start page
  // The GM's own build profiles ({ Class: { label, own, variants: { name: profile | null } } }), from Build profiles on the start page
  game.settings.register(MOD, "profiles", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MOD, "prestigeReqs", { scope: "world", config: false, type: Object, default: {} });
});

// The Axecleft's Tools menu (players too: they edit actors they own, and build new ones themselves or through the GM)
A()?.register?.({
  module: MOD, name: "builder", title: /*t*/"Adventurers and Minions", hint: /*t*/"Build complete characters and NPCs",
  icon: "fas fa-user-plus", gmOnly: false, onClick: () => open(),
});

// A button in the Actors directory
Hooks.on("renderActorDirectory", (app, html) => {
  if (!canBuild()) return;
  const root = html instanceof HTMLElement ? html : html?.[0] ?? app.element;
  if (!root || root.querySelector(".aam2-open")) return;
  const target = root.querySelector(".header-actions") ?? root.querySelector(".directory-header");
  if (!target) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "aam2-open";
  btn.innerHTML = `<i class="fas fa-user-plus"></i> ${t("Build a character")}`;
  btn.addEventListener("click", (ev) => { ev.preventDefault(); open(); });
  target.append(btn);
});

// A button in the token controls (scene controls, Tokens): opens A&M; with one token of an actor you own selected, Edit opens on it
Hooks.on("getSceneControlButtons", (controls) => {
  if (!canBuild()) return;
  const onClick = () => {
    const own = [...new Set((globalThis.canvas?.tokens?.controlled ?? []).map((tk) => tk.actor).filter((a) => editable(a)))];
    if (own.length === 1) edit(own[0]); else open();
  };
  const tool = { name: "aam2", title: t("Adventurers and Minions"), icon: "fas fa-user-plus", button: true, visible: true, order: 50, onChange: () => onClick(), onClick };
  if (Array.isArray(controls)) { const tok = controls.find((c) => c.name === "token"); if (tok && !tok.tools.some((x) => x.name === "aam2")) tok.tools.push(tool); }
  else { const tok = controls?.tokens ?? controls?.token; if (tok?.tools && !tok.tools.aam2) tok.tools.aam2 = tool; }
});

// Edit: "Edit with Adventurers and Minions" in the Actors directory's right-click menu…
const contextEntry = (idOf) => ({
  name: t("Edit with Adventurers and Minions"), icon: '<i class="fas fa-user-pen"></i>',
  condition: (li) => editable(game.actors?.get(idOf(li))),
  callback: (li) => edit(game.actors.get(idOf(li))),
});
const entryId = (li) => (li?.dataset ?? li?.[0]?.dataset)?.entryId ?? (li?.dataset ?? li?.[0]?.dataset)?.documentId;
Hooks.on("getActorContextOptions", (app, options) => { if (Array.isArray(options)) options.push(contextEntry(entryId)); });
Hooks.on("getActorDirectoryEntryContext", (html, options) => { if (Array.isArray(options)) options.push(contextEntry(entryId)); });
// …and in an actor sheet's ⋮ menu
Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  const actor = app?.document ?? app?.actor;
  if (actor?.documentName !== "Actor" || !editable(actor) || !Array.isArray(controls) || controls.some((c) => c.action === "aam2Edit")) return;
  controls.push({ icon: "fas fa-user-pen", label: t("Edit with Adventurers and Minions"), action: "aam2Edit", onClick: () => edit(actor) });
});
Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  const actor = app?.actor ?? app?.document;
  if (!editable(actor) || !Array.isArray(buttons) || buttons.some((b) => b.class === "aam2-edit")) return;
  buttons.unshift({ label: t("A&M"), class: "aam2-edit", icon: "fas fa-user-pen", onclick: () => edit(actor) });
});

Hooks.once("ready", () => {
  try { initRelay(); } catch (err) { console.warn(`${MOD} | players building through the GM`, err); }
  const mod = game.modules.get(MOD);
  if (mod) mod.api = { open, edit, loadCatalog, derive, check, createActor, newPlan };
  migrateSettings();
});

/**
 * 1.14.2.0: A&M took over the id of the first Adventurers and Minions. A world's settings saved under the v2 id
 * (axeclefts-aam2) are copied once to the new id, unless the world already has its own value (GM only).
 */
async function migrateSettings() {
  if (!game.user?.isGM) return;
  try {
    const world = game.settings.storage?.get?.("world");
    const rows = world?.contents ?? [...(world?.values?.() ?? [])];
    const has = new Set(rows.map((r) => r.key));
    for (const r of rows) {
      if (!String(r.key).startsWith(`${LEGACY_MOD}.`)) continue;
      const k = String(r.key).slice(LEGACY_MOD.length + 1);
      if (!game.settings.settings.has(`${MOD}.${k}`) || has.has(`${MOD}.${k}`)) continue;
      let v = r.value;
      if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { /* as stored */ } }
      await game.settings.set(MOD, k, v);
    }
  } catch (err) { console.warn(`${MOD} | settings from ${LEGACY_MOD}`, err); }
}

export { open, edit };
