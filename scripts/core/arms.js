/**
 * A&M v2 — which arms a character can use, and which of two arms is better. No Foundry code.
 *
 * Used for treasure: an armor, shield or weapon rolled for a character is kept only when the character is proficient
 * with it (classes, race and feats; druids no metal), and only when it beats what fills that place (one armor, one
 * shield, one melee and one ranged weapon). Better: higher effective bonus (enhancement plus special abilities), then
 * special abilities over none, then price. The weapon the character has Weapon Focus in counts +1.
 */
import { baseName } from "./plan.js";

/** Name matching that ignores word order, punctuation and "(+2)": "Crossbow, light" = "Light Crossbow". */
export const nameKey = (s) => String(s ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).sort().join(" ");

const METAL_FREE = new Set(["padded armor", "padded", "leather armor", "leather", "hide armor", "hide", "light wooden shield", "heavy wooden shield", "tower shield"].map(nameKey));

function lookup(table, en) {
  if (!table || !en) return null;
  return table[en] ?? table[baseName(en)] ?? table[String(en).replace(/\s*\([^)]*\)\s*$/, "").trim()] ?? null;
}

/**
 * A character's proficiencies → { weapons: Set (categories and name keys), familiar: Set, armor: Set, shields: Set, noMetal }.
 * d: derive() output (classes, feats, race); data: gear.json.
 */
export function proficiencies(d, data) {
  const P = data?.proficiency ?? {};
  const out = { weapons: new Set(), familiar: new Set(), armor: new Set(), shields: new Set(), noMetal: false };
  const add = (set, list) => { for (const x of list ?? []) set.add(/^(simple|martial|exotic|light|medium|heavy|tower)$/i.test(x) ? x.toLowerCase() : nameKey(x)); };
  for (const { cls } of d?.classes ?? []) {
    const p = lookup(P.classes, cls?.en);
    if (!p) continue;
    add(out.weapons, p.weapons); add(out.armor, p.armor); add(out.shields, p.shields);
    if (p.noMetal) out.noMetal = true;
  }
  const raceEn = d?.race?.en ?? "";
  const r = P.races?.[raceEn] ?? P.races?.[raceEn.split(",")[0].trim()] ?? P.races?.[raceEn.split(",")[1]?.trim() ?? ""] ?? null;
  if (r) { add(out.weapons, r.weapons); add(out.familiar, r.familiar); }
  for (const f of d?.feats ?? []) {
    const b = String(f.feat?.base ?? f.feat?.en ?? f.feat?.name ?? "").toLowerCase();
    const choice = f.choice?.value ?? f.choice?.label ?? "";
    if (/^simple weapon proficiency/.test(b)) out.weapons.add("simple");
    else if (/^(martial|exotic) weapon proficiency/.test(b) && choice) out.weapons.add(nameKey(choice));
    else if (/^armor proficiency/.test(b)) { const m = b.match(/light|medium|heavy/) ?? String(f.feat?.name ?? "").toLowerCase().match(/light|medium|heavy/); if (m) out.armor.add(m[0]); }
    else if (/^tower shield proficiency/.test(b)) out.shields.add("tower");
    else if (/^shield proficiency/.test(b)) { out.shields.add("light"); out.shields.add("heavy"); }
  }
  return out;
}

/**
 * What an item is for the character: { slot: "armor" | "shield" | "melee" | "ranged" | "ammo" | null, category, twoHanded, base }.
 * info: { type, weaponType, weaponSubtype, equipmentType, equipmentSubtype, base (English base item name, if known), ammo }.
 */
export function slotOf(info) {
  if (info.ammo) return { slot: "ammo", base: info.base };
  if (info.type === "weapon") {
    const ranged = info.weaponSubtype === "ranged";
    return { slot: ranged ? "ranged" : "melee", category: info.weaponType || "simple", twoHanded: info.weaponSubtype === "2h", base: info.base };
  }
  if (info.type === "equipment" && info.equipmentType === "armor") return { slot: "armor", category: String(info.equipmentSubtype ?? "").replace(/Armor$/, "") || "light", base: info.base };
  if (info.type === "equipment" && info.equipmentType === "shield") {
    const s = String(info.equipmentSubtype ?? "");
    return { slot: "shield", category: s === "towerShield" ? "tower" : s === "heavyShield" ? "heavy" : "light", base: info.base };
  }
  return { slot: null };
}

/** Can the character use it? (proficient; a druid's armor and shield not metal) */
export function canUse(s, prof) {
  const key = nameKey(s.base);
  if (s.slot === "melee" || s.slot === "ranged") {
    if (key && prof.weapons.has(key)) return true;
    if (s.category === "exotic") return !!key && prof.familiar.has(key) && prof.weapons.has("martial");
    return prof.weapons.has(s.category);
  }
  if (s.slot === "armor" || s.slot === "shield") {
    if (prof.noMetal && !(key && METAL_FREE.has(key))) return false;
    const set = s.slot === "armor" ? prof.armor : prof.shields;
    return (key && set.has(key)) || set.has(s.category);
  }
  return true;
}

/** Ammunition fits a ranged weapon: arrows for bows, bolts for crossbows, bullets for slings. */
export function ammoFits(ammoBase, rangedBase) {
  const a = String(ammoBase ?? "").toLowerCase(), r = String(rangedBase ?? "").toLowerCase();
  if (!r) return false;
  if (/bolt/.test(a)) return /crossbow/.test(r);
  if (/arrow/.test(a)) return /bow/.test(r) && !/crossbow/.test(r);
  if (/bullet/.test(a)) return /sling/.test(r);
  return false;
}

/** The effective bonus of magic arms from its price: (price − mundane price) = bonus² × 2,000 (weapons) or × 1,000. */
export function effectiveBonus({ slot, enh = 0, price = 0, mundane = 0, masterwork = true }) {
  const weapon = slot === "melee" || slot === "ranged";
  const magic = Math.max(0, (Number(price) || 0) - (Number(mundane) || 0) - (masterwork ? (weapon ? 300 : 150) : 0));
  const byPrice = Math.floor(Math.sqrt(magic / (weapon ? 2000 : 1000)) + 1e-9);
  return Math.max(Number(enh) || 0, Math.min(10, byPrice));
}

/** Compare two arms for one place: > 0 when a is better. Each: { eff, powers, price, focus }. */
export function compareArms(a, b) {
  const ea = (a.eff || 0) + (a.focus ? 1 : 0), eb = (b.eff || 0) + (b.focus ? 1 : 0);
  if (ea !== eb) return ea - eb;
  if (!!a.powers !== !!b.powers) return a.powers ? 1 : -1;
  return (a.price || 0) - (b.price || 0);
}

/** The weapons the character has Weapon Focus in (name keys). */
export function focusWeapons(d) {
  return new Set((d?.feats ?? []).filter((f) => /^weapon focus$/i.test(f.feat?.base ?? "") && f.choice?.value).map((f) => nameKey(f.choice.value)));
}

/** Psionic classes (psionic loot only for them). */
export const isPsionicCharacter = (d) => (d?.classes ?? []).some(({ cls }) => cls?.casting?.type === "psionic" || /^(psion|psychic warrior|wilder|soulknife)\b/i.test(cls?.en ?? ""));

/* ---------- Alignment ---------- */

/** "lg" → ["l", "g"]; "tn", "nn", "n" → ["n", "n"]. */
const axes = (a) => {
  const s = String(a ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!s || s === "tn" || s === "nn" || s === "n" || s === "neutral") return ["n", "n"];
  const full = { lawfulgood: "lg", neutralgood: "ng", chaoticgood: "cg", lawfulneutral: "ln", chaoticneutral: "cn", lawfulevil: "le", neutralevil: "ne", chaoticevil: "ce" }[s] ?? s;
  return [full[0] ?? "n", full[1] ?? "n"];
};

/**
 * Can a character of this alignment carry an intelligent item of that one? SRD: the same alignment, or (for the
 * table's asterisked alignments, those neutral on one axis: chaotic neutral, neutral evil, lawful neutral, neutral good)
 * any character sharing its other part. A true neutral item takes a true neutral character.
 */
export function intelligentOk(itemAlign, charAlign) {
  if (!itemAlign) return true;
  const [il, ig] = axes(itemAlign), [cl, cg] = axes(charAlign);
  if (il === cl && ig === cg) return true;
  if (il === "n" && ig !== "n") return ig === cg;
  if (ig === "n" && il !== "n") return il === cl;
  return false;
}

/**
 * Aligned special abilities (SRD): holy gives an evil wielder a negative level, unholy a good one, axiomatic a chaotic
 * one, anarchic a lawful one. → false when the character's alignment clashes with one of the item's.
 */
export function alignedOk(text, charAlign) {
  const s = String(text ?? "").toLowerCase();
  const [l, g] = axes(charAlign);
  if (/\bunholy\b/.test(s) && g === "g") return false;
  if (/(^|[^n])\bholy\b/.test(s.replace(/\bunholy\b/g, "")) && g === "e") return false;
  if (/\baxiomatic\b/.test(s) && l === "c") return false;
  if (/\banarchic\b/.test(s) && l === "l") return false;
  return true;
}
