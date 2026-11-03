/**
 * A&M — variant classes (Unearthed Arcana, in the SRD's variant rules): the totem barbarian, bardic sage, cloistered
 * cleric, thug, monk fighting styles, paladins of freedom, slaughter and tyranny… (data/variants.json). No Foundry code.
 *
 * A variant is a class of its own in the catalog, made from its standard class: uuid "variant:<class uuid>#<name>", the
 * standard class's English name (its spell list, profile, gear and prerequisites follow it), and the changes the variant
 * makes (hit die, base attack, saves, class skills, skill points, alignments, the features it loses and gains, bonus
 * feats, spellcasting). On the actor it's a class item made from the standard class with those changes (foundry/variants.js).
 */
export const VARIANT = "variant:";
export const isVariant = (uuid) => String(uuid ?? "").startsWith(VARIANT);
export const variantUuid = (base, key) => `${VARIANT}${base}#${key}`;
export function parseVariant(uuid) {
  if (!isVariant(uuid)) return null;
  const s = String(uuid).slice(VARIANT.length), i = s.lastIndexOf("#");
  return i < 0 ? null : { base: s.slice(0, i), key: s.slice(i + 1) };
}

const lower = (s) => String(s ?? "").toLowerCase().trim();

/** Does a variant's lose list take away a feature (by name, at a class level)? "Trap Sense" also takes "Trap Sense +2". */
export function loses(lose, name, level) {
  const n = lower(name);
  return (lose ?? []).some((entry) => {
    const [want, at] = String(entry).split("@");
    if (at && Number(at) !== Number(level)) return false;
    const w = lower(want);
    return n === w || n.startsWith(`${w} `) || n.startsWith(`${w}(`);
  });
}

/** A note with what the variant loses taken out ("Rage 4/day, trap sense +4" → "Rage 4/day"); null when nothing is left. */
export function trimLost(lose, name, level) {
  const parts = String(name ?? "").split(/,\s*/).filter((x) => !loses(lose, x, level));
  if (!parts.length) return null;
  const s = parts.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A spell table with a number added to each spell level ([class level, sl0, sl1…], -1 for none). min: the floor (known: 1). */
function shift(rows, delta, min, onlyPositive) {
  if (!delta || !Array.isArray(rows)) return rows;
  return rows.map((r) => (Array.isArray(r) ? r.map((x, i) => {
    if (i === 0) return x;
    const n = Number(x);
    if (!Number.isFinite(n) || n < 0 || (onlyPositive && n === 0)) return x;
    return Math.max(min, n + delta);
  }) : r));
}

/**
 * A spontaneous caster's casting (variant data's spontaneous, or the world setting Spontaneous casting):
 *   known "table": spells known by the Unearthed Arcana table (spontaneous divine casters), "slotsPlus2": two more known
 *   than its spells a day at each level (A&M's rule for paladins and rangers), "book": any spell of its spellbook;
 *   perDay: added to each spell level it casts (cleric, druid: +1); auto: "domains" (a cleric knows its domain spells,
 *   no domain slot) or "summon" (a druid knows summon nature's ally of each level).
 */
export function spontaneousCasting(casting, spec, table = []) {
  if (!casting || !spec || !["arcane", "divine"].includes(casting.type)) return casting;
  const perDay = shift(casting.perDay, spec.perDay ?? 0, 0, false);
  let known = casting.known;
  if (spec.known === "table") known = table;
  else if (spec.known === "slotsPlus2") known = (casting.perDay ?? []).map((r) => (Array.isArray(r) ? r.map((x, i) => (i === 0 ? x : Number(x) >= 0 ? Number(x) + 2 : -1)) : r));
  else if (spec.known === "book") known = [];
  return { ...casting, perDay, known, spontaneous: true, allKnown: false, auto: spec.auto ?? null, aamSpontaneous: spec.known ?? true };
}

/** The class skills: the standard class's, less those removed, with those added. */
function skillsOf(base, v) {
  const out = { ...(base ?? {}) };
  for (const k of v.skillsRemove ?? []) delete out[k];
  for (const k of v.skillsAdd ?? []) out[k] = true;
  return out;
}

/** The bonus feat slots: the standard class's (or none, replaceBonusFeats), less the levels dropped, with the variant's. */
function bonusFeatsOf(base, v) {
  let list = v.replaceBonusFeats ? [] : (base ?? []).map((b) => ({ ...b, levels: (b.levels ?? []).filter((l) => !(v.dropBonusFeatLevels ?? []).includes(l)) })).filter((b) => b.levels.length);
  if (v.specialsAdd?.length) list = list.map((b) => (b.special ? { ...b, from: [...new Set([...(b.from ?? []), ...v.specialsAdd])] } : b));
  return [...list, ...(v.bonusFeats ?? [])];
}

/**
 * The catalog entry of a variant class, from its standard class's entry. label: the name shown ("Bear Totem", in the
 * game's language); the entry is named "Barbarian (Bear Totem)".
 */
export function variantEntry(base, key, v, label = key, table = []) {
  let casting = base.casting ? {
    ...base.casting,
    ...(v.casting?.type ? { type: v.casting.type } : {}),
    perDay: shift(base.casting.perDay, v.spellsPerDay, 0, false),
    known: shift(base.casting.known, v.spellsKnown, 1, true),
  } : null;
  if (v.spontaneous) casting = spontaneousCasting(casting, v.spontaneous, table);
  const notes = (base.notes ?? []).map((n) => ({ ...n, name: trimLost(v.lose, n.name, n.level) })).filter((n) => n.name).concat((v.gain ?? []).map(([level, name]) => ({ level: Number(level), name: String(name), variant: true })))
    .sort((a, b) => a.level - b.level);
  return {
    ...base,
    uuid: variantUuid(base.uuid, key),
    name: `${base.name} (${label})`,
    label: `${base.label ?? base.name} (${label})`,
    hd: v.hd ?? base.hd, bab: v.bab ?? base.bab,
    saves: { ...base.saves, ...(v.saves ?? {}) },
    perLevel: v.skillsPerLevel ?? base.perLevel,
    classSkills: skillsOf(base.classSkills, v),
    casting,
    notes,
    alignments: v.alignments ?? null,
    ext: { ...(base.ext ?? {}), bonusFeats: bonusFeatsOf(base.ext?.bonusFeats, v) },
    variant: { base: base.uuid, key, label, lose: v.lose ?? [], spells: v.spells ?? null, changes: v.changes ?? [], addAbilities: v.addAbilities ?? [], gain: v.gain ?? [] },
  };
}

/** Every variant of the catalog's standard classes, from data/variants.json's "variants" ({ Class: { name: variant } }). */
export function variantEntries(classes, data, { label = (k) => k, baseName = (s) => s, table = [], skip = () => false } = {}) {
  const out = [];
  const byEn = new Map();
  for (const c of classes) if (c.kind === "base" && !c.variant && !c.gestalt) { const k = lower(baseName(c.en)); if (!byEn.has(k) || String(c.uuid).startsWith("Compendium.D35E.")) byEn.set(k, c); }
  for (const [en, list] of Object.entries(data ?? {})) {
    const base = byEn.get(lower(en));
    if (!base) continue;
    for (const [key, v] of Object.entries(list ?? {})) if (v && !skip(key, v)) out.push(variantEntry(base, key, v, label(key), table));
  }
  return out;
}

/**
 * Class feature variants (Unearthed Arcana: whirling frenzy, favored environment, turning by level check…) a class can
 * take: { name: { lose, gain, exclusive } } from cat.featureOptions (data/variants.json "features"), by the class's
 * standard English name (a totem barbarian can take whirling frenzy too).
 */
export function featureOptionsFor(cls, cat) {
  if (!cls || cls.gestalt) return {};
  const en = lower(String(cls.en ?? cls.name).replace(/\s*\([^)]*\)\s*$/, ""));
  const all = cat?.featureOptions ?? {};
  const key = Object.keys(all).find((k) => lower(k) === en);
  return key ? all[key] ?? {} : {};
}
/**
 * The class feature variants a plan's class takes: [{ key, lose, gain, grants }] (plan.featureOptions: { class uuid: [names] }).
 * A combat style (style: true) is always taken: the one chosen, else the class's build's (profiles' combatStyle), else the default.
 */
export function chosenFeatures(plan, cls, cat) {
  const opts = featureOptionsFor(cls, cat);
  // A specialist wizard variant only for a specialist of its school
  const school = cat?.specs?.get?.(plan?.specs?.[cls?.uuid]?.school)?.key ?? null;
  const keys = (plan?.featureOptions?.[cls?.uuid] ?? []).filter((k) => opts[k] && (!opts[k].school || opts[k].school === school));
  for (const group of new Set(Object.values(opts).filter((o) => o.style && o.exclusive).map((o) => o.exclusive))) {
    if (keys.some((k) => opts[k].exclusive === group)) continue;
    const en = String(cls?.en ?? "").replace(/\s*\([^)]*\)\s*$/, "");
    const prof = Object.entries(cat?.data?.profiles?.classes ?? {}).find(([k]) => lower(k) === lower(en))?.[1];
    const build = plan?.variants?.[cls?.uuid];
    const want = (build && prof?.variants?.[build]?.combatStyle) || prof?.combatStyle;
    const pick = Object.keys(opts).find((k) => opts[k].exclusive === group && k === want) ?? Object.keys(opts).find((k) => opts[k].exclusive === group && opts[k].default);
    if (pick) keys.push(pick);
  }
  return keys.map((k) => ({ key: k, ...opts[k] }));
}
/** The class's class skills with those its class feature variants add (an enchanter's social proficiency). */
export function classSkillsFor(plan, cls, cat) {
  const add = chosenFeatures(plan, cls, cat).flatMap((c) => c.skillsAdd ?? []);
  if (!add.length) return cls?.classSkills ?? {};
  return { ...(cls?.classSkills ?? {}), ...Object.fromEntries(add.map((k) => [k, true])) };
}
/** Feats class feature variants give without a slot (a conjurer's Augment Summoning), up to a class level: [{ level, feat, key }]. */
export function optionFeats(chosen, classLevel) {
  return chosen.flatMap((c) => (c.feats ?? []).filter(([l]) => Number(l) <= classLevel).map(([level, feat]) => ({ level: Number(level), feat, key: c.key })));
}
const METAMAGIC = ["empower spell", "enlarge spell", "extend spell", "heighten spell", "maximize spell", "quicken spell", "silent spell", "still spell", "widen spell"];
/** A class's bonus feat slots as its class feature variants change them (no wizard bonus feats; a diviner's list). */
export function bonusFeatsFor(bonus, chosen) {
  if (chosen.some((c) => c.dropBonusFeats)) return (bonus ?? []).filter((b) => b.special);
  const ch = chosen.find((c) => c.bonusFeatsFrom)?.bonusFeatsFrom;
  if (!ch) return bonus ?? [];
  return (bonus ?? []).map((b) => (b.special ? b : { ...b, from: [...new Set([...(b.from ?? []).filter((n) => !(ch.removeMetamagic && METAMAGIC.includes(lower(n)))), ...(ch.add ?? [])])] }));
}

/** The feats a combat style grants a class up to a class level: [{ level (class level), feature, feat (name), key }]. */
export function styleGrants(chosen, classLevel) {
  return chosen.flatMap((c) => (c.grants ?? []).filter(([l]) => Number(l) <= classLevel).map(([level, feature, feat]) => ({ level: Number(level), feature, feat, key: c.key })));
}

/**
 * Domain wizard (Unearthed Arcana): the arcane domains (data/variants.json "arcaneDomains": { Fire: [[spell level, spell,
 * note?]] }) as spec entries a wizard chooses instead of a specialist school (plan.specs[wizard].school = the entry's uuid).
 * isDomain (on the actor it's a domain feat, so D35E lets its spells go in the special slot), arcane: true.
 */
export const ARCANE = "arcane-domain:";
export const isArcaneDomain = (spec) => !!spec?.arcane;
export function arcaneDomainEntries(data, label = (k) => k) {
  return Object.entries(data ?? {}).map(([en, rows]) => ({
    uuid: `${ARCANE}${en}`, name: label(en), label: label(en), en, source: "Unearthed Arcana", isDomain: true, arcane: true,
    key: `arcane-${lower(en)}`,
    spells: (rows ?? []).map(([level, name, note]) => ({ level: Number(level), name: String(name), uuid: null, ...(note ? { note: String(note) } : {}) })),
  }));
}
/** Can a class be a domain wizard? (the wizard and its variants) */
export const canArcaneDomain = (cls) => !!cls && !cls.gestalt && lower(String(cls.en ?? cls.name).replace(/\s*\([^)]*\)\s*$/, "")) === "wizard";
/** Is a spell (by name) one of a domain wizard's domain spells? */
export const inArcaneDomain = (spec, name) => !!spec?.spells?.some((x) => lower(x.name) === lower(name));

/** The variant's spell list at a spell level, from the standard class's (list): its own list, less spells removed, with spells added. */
export function variantSpells(list, index, cls, sl) {
  const vs = cls?.variant?.spells;
  if (!vs) return list;
  const byName = (names) => { const want = new Set((names ?? []).map(lower)); return want.size ? index.filter((s) => want.has(lower(s.name))) : []; };
  let out = vs.replace ? byName(vs.replace[String(sl)]) : list;
  if (vs.remove?.length) { const rm = new Set(vs.remove.map(lower)); out = out.filter((s) => !rm.has(lower(s.name))); }
  const extra = byName(vs.add?.[String(sl)]).filter((s) => !out.some((o) => o.uuid === s.uuid));
  return extra.length ? [...out, ...extra] : out;
}
