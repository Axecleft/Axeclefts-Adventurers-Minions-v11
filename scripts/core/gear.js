/**
 * A&M v2 — standard gear (the DMG's NPC gear by class and level, data/gear.json) and wealth, with no Foundry code.
 *
 * A gear entry: { kind: "armor" | "shield" | "weapon" | "ammo" | "item", base, masterwork, bonus, qty, role: "melee" | "ranged" | null }
 * (base: the D35E item's English name; for "item", the magic item's name).
 */
import * as R from "./rules.js";
import { baseName } from "./plan.js";

const ARMOR = { "scale mail": "Scale Mail", breastplate: "Breastplate", "studded leather": "Studded Leather Armor", "hide armor": "Hide Armor",
  "splint mail": "Splint Mail", "half-plate": "Half-Plate", "full plate": "Full Plate", "chain shirt": "Chain Shirt", "leather armor": "Leather Armor", chainmail: "Chainmail" };
const SHIELD = { "heavy steel shield": "Heavy Steel Shield", "heavy wooden shield": "Heavy Wooden Shield", buckler: "Buckler", "light steel shield": "Light Steel Shield" };
const WONDROUS = {
  amulet: (n) => `Amulet of Natural Armor +${n}`, ring: (n) => `Ring of Protection +${n}`, bracers: (n) => `Bracers of Armor +${n}`,
  periapt: (n) => `Periapt of Wisdom +${n}`, headband: (n) => `Headband of Intellect +${n}`, gloves: (n) => `Gloves of Dexterity +${n}`,
  belt: (n) => `Belt of Giant Strength +${n}`, gauntlets: () => "Gauntlets of Ogre Power",
};
const AMMO = [[/crossbow/i, "Crossbow Bolt"], [/bow/i, "Arrow"], [/sling/i, "Sling Bullet"]];

const BAB_RANK = { low: 0, med: 1, high: 2 };
const WEAR = /^(amulet|ring|cloak|bracers|periapt|headband|gloves|belt|gauntlets)\b/;
/**
 * A gestalt class's gear table: arms and armour from the class with the better base attack bonus (the first on a tie),
 * plus the other class's worn magic items for the body slots the first leaves empty (a fighter // wizard's headband;
 * no bracers of armor over armour).
 */
function gestaltTable(cls, data) {
  const [a, b] = [...cls.gestalt].sort((x, y) => (BAB_RANK[y.bab] ?? 0) - (BAB_RANK[x.bab] ?? 0));
  const ta = gearTable(a, data), tb = gearTable(b, data);
  if (!ta || !tb) return ta ?? tb ?? null;
  const slot = (tok) => String(tok).trim().toLowerCase().match(WEAR)?.[1] ?? null;
  const levels = Array.from({ length: Math.max(ta.levels?.length ?? 0, tb.levels?.length ?? 0) }, (_, i) => {
    const ra = ta.levels?.[i] ?? [], rb = tb.levels?.[i] ?? [];
    const used = new Set(ra.map(slot).filter(Boolean));
    if (ra.some((tok) => parseToken(tok, ta)?.kind === "armor")) used.add("bracers"); // bracers of armor don't stack with armour
    return [...ra, ...rb.filter((tok) => { const k = slot(tok); return k && !used.has(k) && used.add(k); })];
  });
  return { ...tb, ...ta, melee: ta.melee ?? tb.melee, ranged: ta.ranged ?? tb.ranged, cloak: ta.cloak ?? tb.cloak, levels };
}

/** The gear table of a class (following "like" to another class's table; a gestalt class combines its two). */
export function gearTable(cls, data) {
  if (cls?.gestalt) return gestaltTable(cls, data);
  const all = data?.classes ?? {};
  let g = all[baseName(cls?.en)] ?? all[cls?.en];
  if (!g) return null;
  if (!g.levels && g.like && all[g.like]?.levels) g = { ...all[g.like], ...g, levels: all[g.like].levels };
  return g;
}

/** One gear-table entry ("+1 full plate", "mwk melee", "ring +2") → a gear entry, or null. */
export function parseToken(tok, table, abilities = {}) {
  const s = String(tok).trim().toLowerCase();
  let m = s.match(/^(mundane|mwk|\+(\d)) (melee|ranged)$/);
  if (m) {
    const role = m[3], bonus = Number(m[2] ?? 0), masterwork = m[1] === "mwk" || bonus > 0;
    let base = table?.[role] ?? (role === "melee" ? "Club" : "Sling");
    if (/^Composite Longbow$/i.test(base)) { const str = R.mod(abilities.str ?? 10); base = str >= 1 ? `Composite Longbow (+${Math.min(4, str)})` : "Longbow"; }
    return { kind: "weapon", base, masterwork, bonus, qty: 1, role };
  }
  m = s.match(/^(mwk |\+(\d) )?(.+)$/);
  if (m) {
    const bonus = Number(m[2] ?? 0), masterwork = !!m[1];
    if (ARMOR[m[3]]) return { kind: "armor", base: ARMOR[m[3]], masterwork, bonus, qty: 1 };
    if (SHIELD[m[3]]) return { kind: "shield", base: SHIELD[m[3]], masterwork, bonus, qty: 1 };
  }
  m = s.match(/^(amulet|ring|cloak|bracers|periapt|headband|gloves|belt|gauntlets)(?: of [a-z ]+)? \+(\d+)$/);
  if (m) {
    const n = Number(m[2]);
    if (m[1] === "cloak") return { kind: "item", base: table?.cloak === "Charisma" ? `Cloak of Charisma +${n}` : `Cloak of Resistance +${n}`, qty: 1 };
    return { kind: "item", base: WONDROUS[m[1]](n), qty: 1 };
  }
  return null; // ioun stones and anything else not in D35E: its value becomes treasure
}

/** The standard gear for a character: its main class's table at its character level. */
export function standardGear(plan, cat, data, d, mods = null) {
  const main = [...(d.classes ?? [])].sort((a, b) => b.levels - a.levels)[0]?.cls;
  const table = gearTable(main, data);
  if (!table) return [];
  let row = table.levels?.[Math.min(20, Math.max(1, d.level)) - 1] ?? [];
  // A build's gear (mods): its weapons, the ranged weapon with the melee one's enhancement (swap), no shield
  if (mods?.swap) row = row.map((tok) => String(tok).replace(/\b(melee|ranged)$/i, (m) => (m.toLowerCase() === "melee" ? "ranged" : "melee")));
  if (mods?.noShield) row = row.filter((tok) => !/shield|buckler/i.test(String(tok)));
  // The weapons the character has Weapon Focus in replace the class's own (a dwarf fighter's waraxe)
  const focus = (d.feats ?? []).filter((f) => /^weapon focus$/i.test(f.feat?.base ?? "") && f.choice?.value).map((f) => String(f.choice.value));
  const RANGED = /bow|crossbow|sling|dart|javelin|shuriken/i;
  const own = { ...table, ...(mods?.melee ? { melee: mods.melee } : {}), ...(mods?.ranged ? { ranged: mods.ranged } : {}) };
  const m = focus.find((w) => !RANGED.test(w) && !/unarmed|ray|grapple/i.test(w)), r = focus.find((w) => RANGED.test(w));
  if (m) own.melee = m;
  if (r) own.ranged = /^longbow$/i.test(r) && /composite/i.test(table.ranged ?? "") ? table.ranged : r;
  const out = row.map((tok) => parseToken(tok, own, d.abilities)).filter(Boolean);
  // Two weapons: a second melee weapon like the first
  if (mods?.offhand) { const m1 = out.find((g) => g.role === "melee"); if (m1) out.splice(out.indexOf(m1) + 1, 0, { ...m1, offhand: true }); }
  const ranged = out.find((g) => g.role === "ranged");
  if (ranged) { const a = AMMO.find(([re]) => re.test(ranged.base)); if (a) out.push({ kind: "ammo", base: a[1], masterwork: false, bonus: 0, qty: 20 }); }
  return out;
}

/**
 * The gp a character has by the DMG: NPC gear value, or a PC's wealth by level. A 1st-level PC has its class's SRD starting
 * gold instead (opts.start: from startingGold(), the rolled amount or the average).
 */
export function wealthFor(kind, level, data, opts = {}) {
  const L = Math.min(20, Math.max(1, level)) - 1;
  if (kind !== "npc" && L === 0 && opts.start) return opts.start.gp;
  return (kind === "npc" ? data?.npcGearValue : data?.pcWealth)?.[L] ?? 0;
}

/* ---------- Starting gold (1st-level PCs) ---------- */

const startRow = (cls, data) => {
  const all = data?.startingGold ?? {};
  const en = baseName(cls?.en);
  return all[en] ?? all[en.replace(/\s*\(.*\)$/, "")] ?? null; // "Psion (Seer)" → Psion
};
/**
 * A 1st-level PC's SRD starting gold: the class of its 1st level ("4d4 × 10"; a gestalt level, the better of its two
 * classes; a class not listed, 4d4 × 10). { dice, mult, formula, average, gp, rolled }, gp being the rolled amount when
 * the plan has one (plan.gear.startGold), else the average.
 */
export function startingGold(plan, cat, data) {
  const first = plan?.levels?.[0]?.cls;
  const cls = first ? cat?.classes?.get?.(first) : null;
  if (!cls) return null;
  const rows = (cls.gestalt ?? [cls]).map((c) => startRow(c, data) ?? [4, 10]);
  const [dice, mult] = rows.sort((a, b) => b[0] * b[1] - a[0] * a[1])[0];
  const average = dice * 2.5 * mult;
  const rolled = Number(plan.gear?.startGold);
  return { dice, mult, formula: mult > 1 ? `${dice}d4 × ${mult}` : `${dice}d4`, average, gp: Number.isFinite(rolled) && rolled > 0 ? rolled : average, rolled: Number.isFinite(rolled) && rolled > 0 };
}
/** Roll a starting gold formula: [dice, mult] → gp. */
export const rollStartingGold = ({ dice, mult }, rng = Math.random) => {
  let n = 0;
  for (let i = 0; i < dice; i++) n += 1 + Math.floor(rng() * 4);
  return n * mult;
};

/* ---------- Adventuring kits ---------- */

/** The kit of a class by name (data.classKits), or null. */
const kitOf = (cls, data) => {
  const en = baseName(cls?.en);
  const name = data?.classKits?.[en] ?? data?.classKits?.[en.replace(/\s*\(.*\)$/, "")];
  return name ? { name, items: data.kits?.[name] ?? [] } : null;
};
const kitEntry = ([base, qty = 1, free = null], kitName) => ({ kind: "item", base, masterwork: false, bonus: 0, qty: Math.max(1, Number(qty) || 1), kit: kitName, ...(free === "free" ? { free: true } : {}) });

/**
 * The adventuring kit for a character (Ultimate Equipment's class kits, data/gear.json): the kit of its main class (most
 * levels; a gestalt pairing, the class with the better base attack bonus), plus the items the other classes need (a
 * fighter/wizard's spellbook and component pouch). Each item once.
 */
export function kitGear(plan, cat, data, d) {
  const ranked = [...(d?.classes ?? [])].sort((a, b) => b.levels - a.levels).flatMap((r) => (r.cls?.gestalt ? [...r.cls.gestalt].sort((x, y) => (BAB_RANK[y.bab] ?? 0) - (BAB_RANK[x.bab] ?? 0)) : [r.cls])).filter(Boolean);
  const main = ranked.map((c) => kitOf(c, data)).find(Boolean);
  if (!main) return [];
  const out = new Map();
  for (const row of main.items) out.set(String(row[0]).toLowerCase(), kitEntry(row, main.name));
  for (const c of ranked) for (const row of data?.kitExtras?.[baseName(c.en)] ?? []) {
    const k = String(row[0]).toLowerCase();
    if (!out.has(k)) out.set(k, kitEntry(row, main.name));
  }
  return [...out.values()];
}
/** Whether a plan gets an adventuring kit: as ticked on Equipment, else PCs yes and NPCs no. */
export const wantsKit = (plan) => (typeof plan?.gear?.kit === "boolean" ? plan.gear.kit : plan?.kind !== "npc");

/** SRD price of a gear entry from its base price: masterwork +300 gp (weapon) or +150 gp (armor, shield); bonus² × 2,000 or × 1,000. */
export function gearPrice(g, basePrice) {
  const base = Number(basePrice) || 0;
  if (g.free) return 0; // a wizard's first spellbook
  if (Number.isFinite(g.priceEach)) return g.priceEach * (g.qty || 1); // priced by the Armory (special materials and abilities)
  if (g.kind === "item") return base * (g.qty || 1);
  if (g.kind === "ammo") return base * (g.qty || 1);
  const weapon = g.kind === "weapon";
  const mw = g.masterwork || g.bonus > 0 ? (weapon ? 300 : 150) : 0;
  return base + mw + (g.bonus ? g.bonus * g.bonus * (weapon ? 2000 : 1000) : 0);
}

/** How a gear entry reads ("+1 Full Plate", "Masterwork Greataxe", "Arrow ×20"). */
export function gearLabel(g) {
  if (g.label) return g.qty > 1 ? `${g.label} ×${g.qty}` : g.label; // named by the Armory
  const name = g.base;
  if (g.kind === "item") return g.qty > 1 ? `${name} ×${g.qty}` : name;
  if (g.kind === "ammo") return g.qty > 1 ? `${name} ×${g.qty}` : name;
  return g.bonus ? `+${g.bonus} ${name}` : g.masterwork ? `Masterwork ${name}` : name;
}

/* ---------- Weight, load and worn slots ---------- */

/** SRD heavy load (lb) by Strength 1–29; above 29, ×4 for every 10 points. Light is a third of it, medium two thirds. */
const HEAVY = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 230, 260, 300, 350, 400, 460, 520, 600, 700, 800, 920, 1040, 1200, 1400];
/** SRD carrying capacity size multipliers (bipeds). D35E size keys. */
const SIZE_LOAD = { fine: 1 / 8, dim: 1 / 4, tiny: 1 / 2, sm: 3 / 4, med: 1, lg: 2, huge: 4, grg: 8, col: 16 };
/** { light, medium, heavy } in lb for a Strength score and a size (SRD Carrying Capacity). */
export function carryingCapacity(str, size = "med") {
  let s = Math.max(0, Math.floor(Number(str) || 0)), mult = 1;
  while (s > 29) { s -= 10; mult *= 4; }
  const heavy = HEAVY[s] * mult * (SIZE_LOAD[size] ?? 1);
  return { light: Math.floor(heavy / 3), medium: Math.floor((heavy * 2) / 3), heavy };
}

/**
 * The weight of a gear entry in lb: the Armory's weight when it priced it, else the compendium item's (ref.weight) × the
 * quantity; arms and armour for a Small character weigh half (SRD).
 */
export function gearWeight(g, ref, size = "med") {
  const arms = g.kind === "weapon" || g.kind === "armor" || g.kind === "shield";
  if (Number.isFinite(g.weightEach)) return g.weightEach * (g.qty || 1);
  const each = Number(ref?.weight) || 0;
  return each * (g.qty || 1) * (arms && size === "sm" ? 0.5 : 1);
}

/** D35E's worn slots and how many items each takes (D35E.defaultSlotCapacities). */
const SLOT_CAP = { armor: 1, shield: 1, head: 1, eyes: 1, shoulders: 1, neck: 1, chest: 1, body: 1, belt: 1, wrists: 1, hands: 1, ring: 2, feet: 1 };

/**
 * Equipment warnings for the plan's gear: the load it puts the character in (SRD Carrying Capacity: a medium or heavy
 * load slows it and limits its Dex bonus; more than a heavy load can't be carried) and worn slots with too many items
 * (two amulets, three rings, two suits of armor). refOf(g) → the compendium item's { weight, slot }.
 * → [{ step: "equipment", code, data, severity }] (the window's issue list).
 */
export function gearIssues(plan, d, refOf, size = "med") {
  const items = plan?.gear?.items ?? [];
  if (!items.length) return [];
  const out = [];
  const add = (code, data, severity = "warn") => out.push({ step: "equipment", code, data, severity, level: null });
  const lb = Math.round(items.reduce((n, g) => n + gearWeight(g, refOf(g), size), 0) * 10) / 10;
  const cap = carryingCapacity(d?.abilities?.str ?? 10, size);
  if (lb > cap.heavy) add("overload", { weight: lb, max: cap.heavy }, "error");
  else if (lb > cap.medium) add("heavyLoad", { weight: lb, max: cap.medium });
  else if (lb > cap.light) add("mediumLoad", { weight: lb, max: cap.light });
  const worn = {};
  for (const g of items) {
    if (g.kit) continue; // kit items are carried, not worn
    const slot = g.kind === "armor" ? "armor" : g.kind === "shield" ? "shield" : g.kind === "item" ? refOf(g)?.slot : null;
    if (!slot || !SLOT_CAP[slot]) continue;
    (worn[slot] ??= []).push(g);
  }
  for (const [slot, list] of Object.entries(worn)) {
    const n = list.reduce((x, g) => x + (g.qty || 1), 0);
    if (n > SLOT_CAP[slot]) add("slotFull", { slot, n, max: SLOT_CAP[slot], items: list.map((g) => gearLabel(g)).join(", ") });
  }
  return out;
}

/* ---------- Trade-in (Edit) ---------- */

/** Gems, art objects and trade goods sell at full value (SRD); other items at the trade-in %. */
const isGoods = (it) => it?.type === "valuable" || (it?.type === "loot" && ["gem", "tradeGoods", "artwork", "art"].includes(it?.system?.subType));
/** What an actor's item fetches traded in: price × quantity × the trade-in % (goods at full value), in gp. */
export function tradeInValue(it, pct = 50) {
  const each = Number(it?.system?.price) || 0, qty = Math.max(1, Number(it?.system?.quantity ?? 1) || 1);
  return Math.round(each * qty * (isGoods(it) ? 1 : Math.max(0, Number(pct) || 0) / 100) * 100) / 100;
}
/** The gp the plan's Sell choices bring (Edit), counted only when selling is allowed. */
export const tradeInTotal = (plan, allowed = true) => (allowed ? Object.values(plan?.gear?.actor ?? {}).filter((o) => o?.act === "sell").reduce((n, o) => n + (Number(o.gp) || 0), 0) : 0);

