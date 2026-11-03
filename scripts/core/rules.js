/**
 * A&M v2 — SRD rules, with no Foundry code (testable on their own).
 * Formulas match D35E 3.1's own (CONFIG.D35E.classBABFormulas / classSavingThrowFormulas), so the summary agrees
 * with the sheet D35E will show.
 */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
export const ABILITY_SHORT = { str: /*t*/"STR", dex: /*t*/"DEX", con: /*t*/"CON", int: /*t*/"INT", wis: /*t*/"WIS", cha: /*t*/"CHA" };
export const ALIGNMENTS = ["lg", "ng", "cg", "ln", "tn", "cn", "le", "ne", "ce"];
export const SIZES = ["fine", "dim", "tiny", "sm", "med", "lg", "huge", "grg", "col"];

export const mod = (score) => Math.floor(((Number(score) || 0) - 10) / 2);

/* ---------- Ability scores ---------- */
export const ARRAYS = {
  elite: [15, 14, 13, 12, 10, 8],
  nonelite: [13, 12, 11, 10, 9, 8],
};
export const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16 };
export const POINT_BUDGETS = [15, 22, 25, 28, 32];
export const pointCost = (s) => POINT_COST[s] ?? null;
export const pointTotal = (scores) => ABILITIES.reduce((n, a) => n + (pointCost(scores[a]) ?? 0), 0);
export const clampPoint = (n) => Math.max(8, Math.min(18, Math.round(Number(n) || 8)));

/** 4d6 drop the lowest (or 3d6), with a dice function (sides) → 1..sides. */
export function rollScore(method, die) {
  if (method === "3d6") return die(6) + die(6) + die(6);
  const d = [die(6), die(6), die(6), die(6)].sort((a, b) => a - b);
  return d[1] + d[2] + d[3];
}

/** Ability increases come at character levels 4, 8, 12 … */
export const hasIncrease = (level) => level > 0 && level % 4 === 0;
/** General feats at character level 1 and every third level. */
export const hasFeat = (level) => level === 1 || (level > 0 && level % 3 === 0);

/* ---------- Class progressions (D35E's formulas) ---------- */
export function babFor(type, levels) {
  if (!levels) return 0;
  if (type === "high") return levels;
  if (type === "med") return Math.floor(levels * 0.75);
  return Math.floor(levels * 0.5);
}
export function saveFor(type, levels, kind = "base") {
  if (!levels || kind === "template") return 0;
  if (type === "high") return 2 + Math.floor(levels / 2);
  if (type === "med") return 1 + Math.floor(levels / 2.5);
  return Math.floor(levels / 3);
}

/** Skill points for one level: (class points + Int modifier, at least 1), ×4 at 1st level, plus the race's extra. */
export function skillPointsFor({ perLevel, intMod, first, raceFirst = 0, raceLevel = 0 }) {
  const base = Math.max(1, (Number(perLevel) || 0) + intMod);
  return first ? base * 4 + raceFirst : base + raceLevel;
}
/** Maximum ranks at a character level. */
export const maxRanks = (level, classSkill) => (classSkill ? level + 3 : (level + 3) / 2);

/* ---------- Hit points ---------- */
export const HP_METHODS = ["max", "average", "roll"];
/** HP rolled for one level: the hit die at the first level (if maxFirst), else by method. */
export function hpFor(hd, { method = "average", first = false, maxFirst = true, die } = {}) {
  hd = Number(hd) || 8;
  if (first && maxFirst) return hd;
  if (method === "max") return hd;
  if (method === "roll" && die) return die(hd);
  return Math.floor(hd / 2) + 1; // average, rounded up (d8 → 5)
}

/* ---------- Experience ---------- */
/** XP at the start of a character level (D35E's medium rate table: level n needs n(n-1)/2 × 1000). */
export const xpFor = (level) => (Math.max(1, level) - 1) * Math.max(1, level) / 2 * 1000;

/* ---------- Alignment limits (SRD) ---------- */
export const ALIGNMENT_LIMITS = {
  Barbarian: { not: ["lg", "ln", "le"] },
  Bard: { not: ["lg", "ln", "le"] },
  Druid: { only: ["ng", "ln", "tn", "cn", "ne"] },
  Monk: { only: ["lg", "ln", "le"] },
  Paladin: { only: ["lg"] },
  Assassin: { only: ["le", "ne", "ce"] },
  Blackguard: { only: ["le", "ne", "ce"] },
};
export function alignmentOk(className, alignment) {
  const lim = ALIGNMENT_LIMITS[className];
  if (!lim || !alignment) return true;
  if (lim.only) return lim.only.includes(alignment);
  if (lim.not) return !lim.not.includes(alignment);
  return true;
}
