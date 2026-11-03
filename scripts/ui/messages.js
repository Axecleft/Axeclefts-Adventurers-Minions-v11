/** A&M v2 — the words for the rule checks (translated). */
import * as R from "../core/rules.js";
import { SCHOOL_NAMES } from "../core/spells.js";

const A = () => globalThis.AxecleftTools;
const t = (s, d) => A()?.t?.(s, d) ?? (d ? String(s).replace(/\{(\w+)\}/g, (m, k) => (d[k] ?? m)) : String(s));

/** A D35E worn slot's name (its own translation), e.g. "Neck". */
const slotLabel = (slot) => {
  const slots = globalThis.CONFIG?.D35E?.equipmentSlots ?? {};
  const key = slots.misc?.[slot] ?? slots[slot]?.[slot];
  return key ? (globalThis.game?.i18n?.localize?.(key) ?? slot) : slot;
};

const CAN = { turnUndead: /*t*/"able to turn undead", wildShape: /*t*/"wild shape", arcane: /*t*/"arcane spellcasting", divine: /*t*/"divine spellcasting", spells: /*t*/"spellcasting" };

/** One missing prerequisite, in words. */
export function missingText(m, cat) {
  const skill = (k) => cat.skills.find((s) => s.key === k)?.label ?? k;
  switch (m.key) {
    case "ab": return t("{ability} {min}", { ability: t(R.ABILITY_SHORT[m.ability]), min: m.min });
    case "bab": return t("base attack +{min}", { min: m.min });
    case "char": return t("character level {min}", { min: m.min });
    case "cl": return t("caster level {min}", { min: m.min });
    case "skill": return t("{skill} {min} ranks", { skill: skill(m.skill), min: m.min });
    case "cls": return t("{cls} level {min}", { cls: m.cls, min: m.min });
    case "can": return t(CAN[m.can] ?? m.can);
    case "feat": return m.choice ? `${m.feat} (${m.choice})` : m.feat;
    case "anyFeat": return t("one of {list}", { list: m.feats.join(", ") });
    default: return m.key;
  }
}

const ALIGN_WORDS = { "any evil": /*t*/"any evil", "any good": /*t*/"any good", "any lawful": /*t*/"any lawful", "any chaotic": /*t*/"any chaotic",
  "any nonlawful": /*t*/"any nonlawful", "any nonchaotic": /*t*/"any nonchaotic", "any nongood": /*t*/"any nongood", "any nonevil": /*t*/"any nonevil" };
const SCHOOL_WORDS = { abj: /*t*/"abjuration", con: /*t*/"conjuration", div: /*t*/"divination", enc: /*t*/"enchantment", evo: /*t*/"evocation", ill: /*t*/"illusion", nec: /*t*/"necromancy", trs: /*t*/"transmutation", uni: /*t*/"universal" };
/** One prestige requirement the character doesn't meet, in words. */
export function prestigeMissingText(m, cat) {
  const skill = (k) => cat.skills.find((s) => s.key === k)?.label ?? k;
  switch (m.key) {
    case "race": return t("race: {list}", { list: m.list.join(t(" or ")) });
    case "align": return t("alignment: {align}", { align: ALIGN_WORDS[m.align] ? t(ALIGN_WORDS[m.align]) : m.align });
    case "bab": return t("base attack +{min}", { min: m.min });
    case "skill": return t("{skill} {min} ranks", { skill: skill(m.skill), min: m.min });
    case "subSkill": return t("{skill} ({name}) {min} ranks", { skill: skill(m.skill), name: m.name, min: m.min });
    case "skillsAny": return t("any {count} of {list} at {min} ranks", { count: m.count, min: m.min, list: m.keys.map(skill).join(", ") });
    case "feat": return m.feat;
    case "anyFeat": return t("one of {list}", { list: m.list.join(", ") });
    case "featsFrom": return t(m.metamagic && m.itemCreation ? "{count} metamagic or item creation feats" : m.metamagic ? "{count} metamagic feat(s)" : m.itemCreation ? "{count} item creation feats" : "{count} of {list}", { count: m.count, list: (m.list ?? []).join(", ") });
    case "featCount": return t("{feat} in {count} different choices", { feat: m.feat, count: m.count });
    case "spells": return t(m.kind === "arcane" ? "able to cast level {level} arcane spells" : m.kind === "divine" ? "able to cast level {level} divine spells" : "able to cast level {level} spells", { level: m.level });
    case "spontaneousArcane": return t("able to cast arcane spells without preparation");
    case "knows": return t("able to cast {name}", { name: m.name });
    case "spellSchools": return t("spells of level {level} or higher from {count} schools", m);
    case "schoolSpells": return t(m.highLevel ? "{count} {school} spells, one of level {highLevel} or higher" : "{count} {school} spells", { ...m, school: SCHOOL_WORDS[m.school] ? t(SCHOOL_WORDS[m.school]) : m.school });
    case "manifest": return t("able to manifest level {level} powers", m);
    case "ml": return t("manifester level {level}", m);
    case "pp": return t("a power point reserve");
    case "sneak": return t("sneak attack +{dice}d6", m);
    case "can": return m.can === "stillMind" ? t("the still mind class feature") : m.can;
    case "martial": return t("proficient with all martial weapons");
    case "language": return t("speaks {name}", m);
    default: return m.key;
  }
}

/** A rule-check result, in words. */
export function issueText(i, cat, slotName) {
  const d = i.data ?? {};
  const skill = (k) => cat.skills.find((s) => s.key === k)?.label ?? k;
  switch (i.code) {
    case "noName": return t("No name yet.");
    case "noRace": return t("Choose a race.");
    case "overBudget": return t("{n} points over the point-buy budget.", d);
    case "underBudget": return t("{n} point-buy points not spent.", d);
    case "noLevels": return t("Add at least one level.");
    case "noClass": return t("Level {level} has no class.", d);
    case "alignment": return t("{cls} doesn't allow this alignment.", d);
    case "maxLevel": return t("{cls} only goes to level {max}.", d);
    case "gestaltOne": return t("Level {level}: a gestalt character takes two classes at every level.", d);
    case "gestaltSame": return t("Level {level}: {cls} on both sides (a gestalt level takes two different classes).", d);
    case "hp": return t("Level {level}: hit points should be from 1 to {hd}.", d);
    case "increase": return t("Level {level}: choose the ability that goes up.", d);
    case "unspent": return t("Level {level}: {n} skill points left.", d);
    case "overspent": return t("Level {level}: {n} skill points too many.", d);
    case "maxRanks": return t("Level {level}: {skill} is over its maximum of {max} ranks.", { ...d, skill: skill(d.skill) });
    case "emptySlot": return t("Level {level}: choose a feat ({slot}).", { ...d, slot: slotName?.(d.slot, d.level) ?? d.slot });
    case "xpPenalty": return t(d.favored ? "Multiclass XP penalty −{pct}%: {classes} more than one level below {top} (favored class, not counted: {favored})." : "Multiclass XP penalty −{pct}%: {classes} more than one level below {top}.", { ...d, classes: d.classes.join(", ") });
    case "noChoice": return t("Level {level}: {feat} needs its choice.", d);
    case "styleArmor": return t("{cls}'s combat style works only in light or no armor: {armor} is medium or heavy.", d);
    case "notHere": return t("Level {level}: {feat} is a class special ability; it can only be taken in that class's special ability slot.", d);
    case "specialTwice": return t("Level {level}: {feat} is taken already (each special ability once, except Skill Mastery).", d);
    case "prereq": return t("Level {level}: {feat} needs {missing}.", { ...d, missing: d.missing.map((m) => missingText(m, cat)).join(", ") });
    case "twice": return t("{feat} is taken twice.", d);
    case "noSlot": return t("Level {level}: {feat} has no feat slot any more (the level's class changed); Fill in what's missing moves it to a free slot or removes it.", d);
    case "domainsCount": return t("{cls}: choose two domains.", d);
    case "domainAlignment": return t("{cls}: the {domain} needs a cleric of that alignment (SRD).", d);
    case "prohibitedOwn": return t("{cls}: a specialist can't prohibit its own school ({school}).", d);
    case "prohibitedCount": return d.n === 1 ? t("{cls}: a diviner gives up one other school.", d) : t("{cls}: a specialist gives up two other schools.", d);
    case "noDomainSlot": return t("{cls}: no spell in the level {level} domain slot.", d);
    case "noSchoolSlot": return t("{cls}: no spell in the level {level} specialty slot.", d);
    case "powersMany": return t("{cls}: {n} powers known, but the class knows {max} at this level.", d);
    case "powersFew": return t("{cls}: {n} more powers to choose.", d);
    case "mediumLoad": return t("The gear weighs {weight} lb: a medium load (more than {max} lb). Speed drops and the Dex bonus to AC is limited (+3).", d);
    case "heavyLoad": return t("The gear weighs {weight} lb: a heavy load (more than {max} lb). Speed drops and the Dex bonus to AC is limited (+1).", d);
    case "overload": return t("The gear weighs {weight} lb: more than the character can carry ({max} lb).", d);
    case "slotFull": return t("{n} items for the {slot} slot (it takes {max}): {items}.", { ...d, slot: slotLabel(d.slot) });
    case "prestige": return t("Level {level}: {cls} needs {missing}.", { ...d, missing: d.missing.map((m) => prestigeMissingText(m, cat)).join(", ") });
    case "prestigeSpecial": return t("{cls}: {special} (A&M can't check this.)", d);
    case "prestigeUnknown": return t("{cls}: A&M has no requirements for this prestige class (a GM can add them: Prestige requirements, on the start page).", d);
    case "powerLevel": return t("{cls}: {power} is a level {level} power; the class learns powers up to level {max} now.", d);
    default: return i.code;
  }
}

export const STEP_OF = { basics: "basics", abilities: "abilities", classes: "classes", skills: "skills", feats: "feats", spells: "spells" };

const FIELD = { name: /*t*/"Name", alignment: /*t*/"Alignment", sex: /*t*/"Sex", deity: /*t*/"Deity", age: /*t*/"Age", height: /*t*/"Height", weight: /*t*/"Weight" };

/** One change an edit makes (core/edit.js planChanges), in words. */
export function changeText(c, cat) {
  const d = c.data ?? {};
  const skill = (k) => cat.skills.find((s) => s.key === k)?.label ?? k;
  const rk = (n) => (Number.isInteger(n) ? n : Number(n).toFixed(1));
  switch (c.code) {
    case "field": return t("{field}: {from} → {to}", { field: t(FIELD[d.field] ?? d.field), from: d.from || "—", to: d.to || "—" });
    case "race": return t("Race: {from} → {to}", d);
    case "classes": return d.levels > 0 ? t("Classes: {from} → {to} ({n} new levels)", { ...d, n: d.levels }) : d.levels < 0 ? t("Classes: {from} → {to} ({n} levels removed)", { ...d, n: -d.levels }) : t("Classes: {from} → {to}", d);
    case "levelClass": return t("Level {level}: {from} → {to}", d);
    case "levelHp": return t("Level {level}: hit points rolled {from} → {to}", d);
    case "ability": return t("{ability} {from} → {to}", { ...d, ability: t(R.ABILITY_SHORT[d.ability]) });
    case "hp": return t("Hit points {from} → {to}", d);
    case "skills": return t("Skill ranks: {list}", { list: d.list.map((x) => `${skill(x.key)} ${rk(x.from)} → ${rk(x.to)}`).join(", ") });
    case "featsAdded": return t("Feats added: {list}", { list: d.list.join(", ") });
    case "featsRemoved": return t("Feats removed: {list}", { list: d.list.join(", ") });
    case "spells": return t("{cls} spells: {plus} added, {minus} removed, {prep} prepared differently", d);
    case "domains": return t("{cls} domains: {from} → {to}", d);
    case "school": return t("{cls} specialist school: {from} → {to} (prohibited: {prohibited})", { ...d, prohibited: String(d.prohibited || "").split(", ").filter(Boolean).map((k) => t(SCHOOL_NAMES[k] ?? k)).join(", ") || "—" });
    case "gear": return t("{n} items of gear added", d);
    case "gearUnequip": return t("Unequipped (kept in the pack): {list}", d);
    case "gearSell": return t("Sold for the new gear ({gp} gp): {list}", d);
    case "loot": return t("Treasure for the wealth from level {from} to level {to}", d);
    default: return c.code;
  }
}

/** What A&M noticed reading an actor (foundry/reader.js), in words. */
export function noteText(n, cat) {
  const d = n.data ?? {};
  const skill = (k) => cat.skills.find((s) => s.key === k)?.label ?? k;
  switch (n.code) {
    case "unknownRace": return t("A&M doesn't know the race {name} (it isn't in your compendiums): it stays on the actor, and nothing from it is counted.", d);
    case "unknownClass": return t("A&M doesn't know the class {name}: it stays on the actor as it is, and its levels aren't in the plan.", d);
    case "levelsFromClasses": return t("This actor doesn't use D35E's level-up progression, so the order of its levels, the hit points of each level and where its skill ranks were bought are A&M's best guess. Check Classes and levels and Skills.");
    case "noLevels": return t("No class levels found: add levels on Classes and levels.");
    case "abilitiesChanged": return t("The ability scores were changed on the sheet since A&M made the actor: the sheet's scores are used.");
    case "increasesGuessed": return t("A&M guessed which abilities the level 4, 8, 12… increases went to (on Abilities); the scores add up to the sheet's either way.");
    case "skillsShort": return t("Some ranks didn't fit the levels' skill points and maximums: {list}.", { list: d.list.map((x) => `${skill(x.key)} ${x.ranks}`).join(", ") });
    case "spellsInBooks": return t("{n} spells are in Curios' spellbook items: they stay with the books.", d);
    case "kept": return t("Left on the actor as they are: {list}.", { list: d.list.join(", ") });
    default: return n.code;
  }
}
