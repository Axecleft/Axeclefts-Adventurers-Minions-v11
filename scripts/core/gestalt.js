/**
 * A&M v2 — gestalt characters (Unearthed Arcana variant, in the 3.5 SRD's variant rules), with no Foundry code.
 *
 * A gestalt character takes two classes at every level. On the actor each pairing is ONE class item, made by A&M
 * from the two classes ("Fighter // Wizard"): the better hit die, base attack bonus, saves and skill points of the two,
 * both class skill lists and both classes' features (each at its own class level). Spellcasting stays with the
 * casting class itself: a copy at level 0 carries its spell table, and the gestalt class grants a Bonus Arcane or
 * Divine Spellcaster Level at each level, which A&M spends on that class's spellbook.
 *
 * In the plan, a gestalt level's class is a key naming both classes: "gestalt:<uuid A>|<uuid B>". The catalog's class
 * map answers such keys with the merged class (ensureGestalt), so the rest of the code treats it as any other class.
 */
export const GESTALT = "gestalt:";
export const isGestalt = (key) => typeof key === "string" && key.startsWith(GESTALT);
export const gestaltKey = (a, b) => (a && b ? `${GESTALT}${a}|${b}` : a || b || null);
/** The two class uuids of a gestalt key ([key] for any other class, [] for none). */
export const partsOf = (key) => (isGestalt(key) ? key.slice(GESTALT.length).split("|") : key ? [key] : []);

const RANK = { low: 0, med: 1, high: 2 };
const better = (a, b) => ((RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a);

/** The merged class entry for two catalog class entries. */
export function mergeClasses(A, B) {
  const key = gestaltKey(A.uuid, B.uuid);
  return {
    uuid: key, name: `${A.name} // ${B.name}`, en: `${A.en} // ${B.en}`, source: A.source, label: `${A.label ?? A.name} // ${B.label ?? B.name}`,
    kind: A.kind === "prestige" || B.kind === "prestige" ? "prestige" : "base",
    hd: Math.max(Number(A.hd) || 0, Number(B.hd) || 0),
    bab: better(A.bab, B.bab),
    saves: Object.fromEntries(["fort", "ref", "will"].map((s) => [s, better(A.saves?.[s], B.saves?.[s])])),
    perLevel: Math.max(Number(A.perLevel) || 0, Number(B.perLevel) || 0),
    classSkills: { ...(A.classSkills ?? {}), ...(B.classSkills ?? {}) },
    casting: null,
    maxLevel: Math.max(Number(A.maxLevel) || 20, Number(B.maxLevel) || 20),
    ext: { ...(B.ext ?? {}), ...(A.ext ?? {}), bonusFeats: [] }, // bonus feats come from the two classes, by their own levels (derive)
    gestalt: [A, B],
  };
}

const PATCHED = Symbol("aam2-gestalt");
/** Let a catalog class map answer gestalt keys (once per map; the merged entries are kept). */
export function ensureGestalt(classes) {
  if (!classes || classes[PATCHED]) return classes;
  const get = classes.get.bind(classes), has = classes.has.bind(classes);
  const merged = new Map();
  classes.get = (k) => {
    const v = get(k);
    if (v || !isGestalt(k)) return v;
    if (merged.has(k)) return merged.get(k);
    const [a, b] = partsOf(k).map((u) => get(u));
    const m = a && b ? mergeClasses(a, b) : null;
    if (m) merged.set(k, m);
    return m ?? undefined;
  };
  classes.has = (k) => has(k) || !!classes.get(k);
  classes[PATCHED] = true;
  return classes;
}

/** The classes a level's class stands for: [A, B] for a gestalt class, [it] for any other, [] for none. */
export const partsOfClass = (c) => (c ? c.gestalt ?? [c] : []);

/**
 * Where each class's levels fall inside the gestalt class items: for each level of the plan, { item: class key,
 * itemLevel, parts: [{ uuid, level }] } (part level = that class's own level so far, all items counted).
 */
export function levelMap(levels) {
  const item = new Map(), part = new Map();
  return (levels ?? []).map((lv) => {
    const k = lv.cls ?? null;
    if (k) item.set(k, (item.get(k) ?? 0) + 1);
    const parts = partsOf(k).map((u) => { part.set(u, (part.get(u) ?? 0) + 1); return { uuid: u, level: part.get(u) }; });
    return { item: k, itemLevel: k ? item.get(k) : 0, parts };
  });
}
