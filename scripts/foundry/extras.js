/**
 * A&M v2 — spells and gear on the Foundry side: the spell list, item prices, and putting spells, standard gear and
 * treasure on an actor. Loaded the first time a caster or gear is needed.
 */
import { spellEntry } from "../core/catalog-data.js";
import { castingKind, listName, specFor } from "../core/spells.js";
import { gearPrice, gearLabel, wealthFor, startingGold, tradeInValue } from "../core/gear.js";
import { nameKey, proficiencies, slotOf, canUse, ammoFits, effectiveBonus, compareArms, focusWeapons, isPsionicCharacter, intelligentOk, alignedOk } from "../core/arms.js";
import { MOD, setSource } from "./catalog.js";
import { gestaltCasters } from "./gestalt.js";

const A = () => globalThis.AxecleftTools;
const t = (s, d) => A()?.t?.(s, d) ?? s;
const norm = (s) => String(s ?? "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

async function json(file) {
  try { return await foundry.utils.fetchJsonWithTimeout(`modules/${MOD}/data/${file}`); } catch (e) { return {}; }
}

/** Spells (from every Item compendium with spells) and arms, armor and magic item prices (D35E's compendiums first). */
export async function loadExtras(cat) {
  if (cat.extras) return cat.extras;
  cat.extras = (async () => {
    const gear = await json("gear.json");
    const spells = [], items = new Map();
    for (const p of game.packs) {
      if (p.documentName !== "Item" || p.visible === false) continue;
      let index;
      try { index = await p.getIndex({ fields: ["type", "system.learnedAt", "system.school", "system.price", "system.enh", "system.armor.enh", "system.weaponType", "system.weaponSubtype", "system.equipmentType", "system.equipmentSubtype", "system.subType", "system.weight", "system.slot"] }); } catch (e) { continue; }
      for (const e of index) {
        if (e.type === "spell") { if (e.system?.learnedAt?.class?.length || e.system?.learnedAt?.domain?.length) spells.push(spellEntry(e, { uuid: e.uuid ?? `Compendium.${p.collection}.Item.${e._id}` })); continue; }
        if (!["weapon", "equipment", "loot", "consumable"].includes(e.type)) continue;
        const en = (() => { try { return A()?.enName?.(e, { pack: p }) || e.name; } catch (err) { return e.name; } })();
        const key = norm(en);
        // D35E's own items first; mundane arms only (a magic base would double its bonus)
        if (items.has(key) && !String(p.collection).startsWith("D35E.")) continue;
        if (Number(e.system?.enh) > 0 || Number(e.system?.armor?.enh) > 0) if (!/^(amulet|ring|cloak|bracers|periapt|headband|gloves|belt|gauntlets)/i.test(en)) continue;
        if (!items.has(key) || String(p.collection).startsWith("D35E.")) items.set(key, { uuid: e.uuid ?? `Compendium.${p.collection}.Item.${e._id}`, price: Number(e.system?.price) || 0, name: e.name, weight: Number(e.system?.weight?.value ?? e.system?.weight) || 0, slot: e.system?.slot || null, en, info: armsInfo(e, en) });
      }
    }
    // The same spell in several compendiums: keep one (D35E's)
    const seen = new Map();
    for (const s of spells) { const k = norm(s.name); if (!seen.has(k) || s.uuid.startsWith("Compendium.D35E.")) seen.set(k, s); }
    // Mundane arms by name key, for finding the base item of treasure arms ("+2 Flaming Longsword" → Longsword)
    const bases = [...items.values()].filter((x) => x.info && slotOf(x.info).slot && !(Number(x.info.enh) > 0)).map((x) => ({ ...x, key: nameKey(x.en), words: nameKey(x.en).split(" ") }));
    return { gear, spellIndex: [...seen.values()], items, bases };
  })();
  return cat.extras;
}

/** The arms facts of an item (index entry or data) for arms.js; null if not arms or ammunition. */
function armsInfo(e, en) {
  const sys = e.system ?? {};
  const ammo = (e.type === "loot" && sys.subType === "ammo") || (e.type !== "weapon" && /\b(arrows?|bolts?|bullets?)\b/i.test(en ?? e.name ?? ""));
  if (e.type !== "weapon" && e.type !== "equipment" && !ammo) return null;
  if (e.type === "equipment" && !["armor", "shield"].includes(sys.equipmentType)) return null;
  return { type: e.type, weaponType: sys.weaponType, weaponSubtype: sys.weaponSubtype, equipmentType: sys.equipmentType, equipmentSubtype: sys.equipmentSubtype, ammo, enh: e.type === "weapon" ? sys.enh : sys.armor?.enh };
}

/** The English name of an item's data (the Axecleft English flag, Babele's original name, or its name). */
function englishOf(data) {
  try { return A()?.enName?.(data) || data.flags?.world?.axecleftEn || data.name; } catch (e) { return data.flags?.world?.axecleftEn || data.name; }
}

/** The mundane base of treasure arms: the longest base item name whose words are all in the item's English name, same kind. */
function baseOfArms(en, info, extras) {
  const words = new Set(nameKey(en).split(" "));
  const kind = slotOf(info).slot;
  let best = null;
  for (const b of extras.bases ?? []) {
    const bk = slotOf(b.info).slot;
    if (kind === "ammo" ? bk !== "ammo" : (bk === "ammo" || (kind === "armor" || kind === "shield" ? bk !== kind : bk !== "melee" && bk !== "ranged"))) continue;
    if (b.words.every((w) => words.has(w)) && (!best || b.words.length > best.words.length)) best = b;
  }
  return best;
}

/** The value of standard gear (gp), from compendium prices. */
export function gearValue(list, extras) {
  return (list ?? []).reduce((n, g) => n + gearPrice(g, extras?.items?.get(norm(g.base))?.price ?? 0), 0);
}

/* ---------- Spells on the actor ---------- */

export const createTag = (str) => String(str || "tag").replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/).map((s, i) => (i ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s.toLowerCase())).join("");
const BOOKS = ["primary", "secondary", "tertiary"];

/** Documents by uuid, a compendium at a time (a whole spell list is hundreds of spells). */
async function loadDocs(uuids) {
  const out = new Map(), byPack = new Map();
  for (const u of uuids) {
    const m = String(u).match(/^Compendium\.(.+)\.Item\.([^.]+)$/);
    if (m && game.packs.get(m[1])) { if (!byPack.has(m[1])) byPack.set(m[1], []); byPack.get(m[1]).push(m[2]); }
    else out.set(u, null);
  }
  for (const [coll, ids] of byPack) {
    try { for (const doc of await game.packs.get(coll).getDocuments({ _id__in: ids })) out.set(doc.uuid, doc); }
    catch (err) { for (const id of ids) out.set(`Compendium.${coll}.Item.${id}`, null); }
  }
  for (const u of uuids) if (!out.get(u)) out.set(u, await fromUuid(u).catch(() => null));
  return out;
}

/**
 * Curios' spellbook rule: when it's on, the classes it lists (Wizard by default) can only prepare spells from spellbook items
 * they carry. → (cls) => true for a class whose spells go in spellbook items, or null when the rule is off.
 */
export function bookRule() {
  const mod = game.modules.get("axeclefts-curios");
  const api = mod?.active ? mod.api : null;
  if (!api?.spellbook || !api.setting?.("bookRestriction")) return null;
  const want = String(api.setting("bookClasses") ?? "Wizard").split(",").map((x) => norm(x)).filter(Boolean);
  return (cls) => { const n = norm(listName(cls)); return !!n && want.some((w) => n.includes(w) || w.includes(n)); };
}
const PAGES = 100;
const pagesFor = (level) => Math.max(1, Number(level) || 0);

/**
 * Spellbooks for the caster classes (in order: primary, secondary, tertiary) and their spells. With Curios' spellbook rule
 * on, a listed class's spells are written in spellbook items (100 pages each) instead of loose on the actor: the books
 * are added first, Curios puts their spells in the class's spellbook, then the day's spells are prepared from them.
 */
export async function applySpells(actor, plan, cat, d, { edit = false, classIds = null } = {}) {
  const all = (uuid) => plan.spells?.[uuid] ?? foundry.utils.getProperty(plan.spells ?? {}, uuid) ?? [];
  // Edit: only the spells that aren't on the actor yet (the others keep their items)
  const listOf = (uuid) => all(uuid).filter((s) => !edit || !s.itemId);
  const casters = (d.parts ?? d.classes).filter((c) => castingKind(c.cls) && all(c.cls.uuid).length);
  // Domains and specialist schools first (1.14.0.8): their feats tell D35E's sheet which spells are domain or school spells
  try { await applySpecs(actor, plan, cat, d, { edit }); } catch (err) { console.error(`${MOD} | domains and schools`, err); ui.notifications.warn(t("Domains and schools couldn't all be added: {error}", { error: err.message })); }
  if (!casters.length) return 0;
  const inBooks = bookRule();
  const { bonus } = gestaltCasters(plan, cat);
  const update = {}, items = [], quiet = [], books = [];
  const psiBooks = []; // [{ key, cls, levels }] // books: [{ cls, entries: [{ data, name, shown, level, prepared }] }]
  const sb = actor.system?.attributes?.spells?.spellbooks ?? {};
  const tagOf = (it) => createTag(it?.system?.customTag || it?.name);
  const classTags = new Set(actor.items.filter((x) => x.type === "class").map(tagOf));
  const used = new Set();
  const specialTodo = []; // [{ key: spellbook, cls, wanted: [plan spells with special] }]
  for (const [i, { cls }] of casters.entries()) {
    const item = (classIds?.get?.(cls.uuid) ? actor.items.get(classIds.get(cls.uuid)) : null) ?? actor.items.find((x) => x.type === "class" && x.name === cls.name);
    const tag = createTag(item?.system?.customTag || item?.name || cls.name);
    // Edit: the class's own spellbook if it has one, else a spellbook no class uses
    const key = edit ? (BOOKS.find((k) => !used.has(k) && sb[k]?.class === tag) ?? BOOKS.find((k) => !used.has(k) && !classTags.has(sb[k]?.class))) : BOOKS[i];
    if (!key) break;
    used.add(key);
    if (!edit || sb[key]?.class !== tag) {
      update[`system.attributes.spells.spellbooks.${key}.class`] = tag;
      update[`system.attributes.spells.spellbooks.${key}.name`] = cls.name;
      update[`system.attributes.spells.spellbooks.${key}.autoSetup`] = true;
    }
    // Gestalt: the class's levels inside gestalt classes are bonus caster levels on its spellbook
    if (bonus.has(cls.uuid)) update[`system.attributes.spells.spellbooks.${key}.bonusPrestigeCl`] = bonus.get(cls.uuid);
    // A spontaneous specialist wizard: one more spell a day of each spell level, for its school's spells (its school feat
    // says so; D35E doesn't check it), instead of the school slot
    if (cls.casting?.spontaneous && cls.casting.book) {
      const sp = specFor(plan, cat, cls);
      for (let a = 1; a <= 9; a++) update[`system.attributes.spells.spellbooks.${key}.spells.spell${a}.bonus`] = sp.kind === "school" && sp.school && !sp.noSlot ? 1 : 0;
    }
    const kind = castingKind(cls);
    // Psionics: a spellbook only shows (and spends) the power points its "daily power points" formula gives (below)
    if (kind === "powers") psiBooks.push({ key, cls, levels: (d.parts ?? d.classes).find((x) => x.cls?.uuid === cls.uuid)?.levels ?? 0 });
    specialTodo.push({ key, cls, wanted: all(cls.uuid).filter((s) => s.special) });
    // A spontaneous wizard (spontaneous casting) casts any spell of its book: its spells go in the book and on the sheet, not prepared
    const spontBook = kind === "book" && !!cls.casting?.spontaneous;
    const spont = kind === "known" || kind === "powers" || spontBook; // spells known and psionic powers aren't prepared
    const book = (!spont || spontBook) && inBooks?.(cls) ? { cls: listName(cls) || cls.name, entries: [] } : null;
    if (book) books.push(book);
    // A domain wizard casts its domain spells at +1 caster level (Unearthed Arcana): D35E's caster level offset on the spell
    const arcaneDomain = specFor(plan, cat, cls).arcane;
    const docs = await loadDocs(listOf(cls.uuid).map((s) => s.uuid));
    for (const s of listOf(cls.uuid)) {
      const doc = docs.get(s.uuid);
      if (!doc) continue;
      const data = doc.toObject(); delete data._id;
      if (doc.pack) setSource(data, doc.uuid);
      foundry.utils.setProperty(data, "system.spellbook", key);
      foundry.utils.setProperty(data, "system.level", s.level);
      if (arcaneDomain && s.domain) foundry.utils.setProperty(data, "system.clOffset", (Number(data.system?.clOffset) || 0) + 1);
      foundry.utils.setProperty(data, "system.preparation.mode", spont ? "spontaneous" : "prepared");
      if (book) {
        foundry.utils.setProperty(data, "system.preparation.preparedAmount", 0);
        foundry.utils.setProperty(data, "system.preparation.maxAmount", 0);
        book.entries.push({ data: spontBook ? foundry.utils.deepClone(data) : data, name: englishOf(doc), shown: doc.name, level: s.level, prepared: kind === "known" || spontBook ? 0 : s.prepared || 0 });
        if (!spontBook) continue;
      }
      foundry.utils.setProperty(data, "system.preparation.preparedAmount", spont ? 0 : s.prepared || 0);
      foundry.utils.setProperty(data, "system.preparation.maxAmount", spont ? 0 : s.prepared || 0);
      // D35E checks a new spell against its spellbook class's list and warns when it isn't on it (domain spells,
      // spells from other compendiums): those go on with the level and spellbook A&M already set, quietly
      const listed = (data.system?.learnedAt?.class ?? []).some((x) => norm(x?.[0]) === norm(item?.name ?? cls.name));
      if (listed) items.push(data);
      else { let auto = true; try { auto = !game.settings.get("D35E", "noAutoSpellpointsCost"); } catch (e) { /* not registered */ } if (auto && !(Number(data.system?.powerPointsCost) > 0)) foundry.utils.setProperty(data, "system.powerPointsCost", Math.max(s.level * 2 - 1, 0)); quiet.push(data); }
    }
  }
  // The classes' spellbooks first (Curios files a book's spells by its class)
  if (Object.keys(update).length) await actor.update(update);
  if (items.length) await actor.createEmbeddedDocuments("Item", items);
  if (quiet.length) await actor.createEmbeddedDocuments("Item", quiet, { ignoreSpellbookAndLevel: true });
  // Full power points to start with (as after a rest)
  if (psiBooks.length) {
    // D35E adds every class's power points (and feats' bonus points) up on the actor. One psionic class: its spellbook takes
    // that whole pool. Several: each spellbook after the first takes its own class's points (table + key ability bonus) and
    // the first takes the rest of the pool, so each class can manifest and the total is the pool. A formula the GM wrote
    // (not one of these) is left alone.
    const own = ({ cls, levels }) => `${Number(cls.casting?.points?.[Math.min(levels, (cls.casting?.points?.length ?? 1) - 1)]) || 0} + max(0, floor(0.5 * ${levels} * @abilities.${cls.casting?.ability || "int"}.mod))`;
    const ours = (f) => !f || /powerPointsTotal|^\d+ \+ max\(0, floor\(0\.5 \* \d+ \* @abilities\.\w+\.mod\)\)$/.test(String(f).trim());
    const formulas = psiBooks.map((b, i) => (i ? own(b) : ["@attributes.powerPointsTotal", ...psiBooks.slice(1).map((x) => `(${own(x)})`)].join(" - ")));
    const fu = {};
    psiBooks.forEach((b, i) => { if (ours(sb[b.key]?.dailyPowerPointsFormula)) fu[`system.attributes.spells.spellbooks.${b.key}.dailyPowerPointsFormula`] = formulas[i]; });
    if (Object.keys(fu).length) await actor.update(fu);
    // Full power points to start with (as after a rest)
    if (!edit) {
      const books = actor.system?.attributes?.spells?.spellbooks ?? {}, full = {};
      for (const b of psiBooks) { const tot = Number(books[b.key]?.powerPointsTotal) || 0; if (tot > 0) full[`system.attributes.spells.spellbooks.${b.key}.powerPoints`] = tot; }
      if (Object.keys(full).length) await actor.update(full);
    }
  }
  let n = items.length + quiet.length;
  for (const b of books) n += await writeBooks(actor, b);
  try { await applySpecialSlots(actor, specialTodo); } catch (err) { console.error(`${MOD} | special slots`, err); }
  return n;
}

/**
 * A cleric's domain feats and a specialist's school feat (D35E's Spell Schools and Domains), on the actor, with the
 * prohibited schools in the school feat's "forbidden" names (D35E marks those spells banned). Edit: domains or a
 * school no longer chosen leave; the ones still chosen stay as they are.
 */
async function applySpecs(actor, plan, cat, d, { edit = false } = {}) {
  const want = []; // [{ entry, forbidden }]
  for (const { cls } of d.parts ?? d.classes) {
    const spec = specFor(plan, cat, cls);
    if (spec.kind === "domains") for (const x of spec.domains) want.push({ entry: x });
    else if (spec.kind === "school" && spec.school) want.push({ entry: spec.school, forbidden: spec.prohibited.join(","), spontaneous: !!(cls.casting?.spontaneous && cls.casting.book) });
  }
  const have = actor.items.filter((x) => x.type === "feat" && x.system?.featType === "spellSpecialization");
  const keyOf = (it) => `${!!it.system?.spellSpecialization?.isDomain}|${String(it.system?.spellSpecializationName ?? "").split(",")[0].trim().toLowerCase()}`;
  const wantKey = (w) => `${w.entry.isDomain}|${w.entry.key}`;
  const gone = [], update = [], add = [];
  if (edit) for (const it of have) if (!want.some((w) => wantKey(w) === keyOf(it))) gone.push(it.id);
  for (const w of want) {
    const it = have.find((x) => keyOf(x) === wantKey(w));
    if (it) { if (w.forbidden != null && String(it.system?.spellSpecializationForbiddenNames ?? "") !== w.forbidden) update.push({ _id: it.id, "system.spellSpecializationForbiddenNames": w.forbidden }); continue; }
    const doc = w.entry.arcane ? null : await fromUuid(w.entry.uuid).catch(() => null);
    if (!doc && !w.entry.arcane) continue;
    const data = doc ? doc.toObject() : await arcaneDomainItem(w.entry, cat);
    delete data._id;
    if (doc.pack) setSource(data, doc.uuid);
    if (w.forbidden != null) foundry.utils.setProperty(data, "system.spellSpecializationForbiddenNames", w.forbidden);
    if (w.spontaneous && w.entry.arcane) foundry.utils.setProperty(data, "system.description.value", `<p><strong>${t("Spontaneous domain wizard")}:</strong> ${t("one more spell a day of each spell level the wizard casts, for its domain spells only (instead of the domain slot). D35E doesn't check it: keep that extra spell for the domain spells.")}</p>${data.system?.description?.value ?? ""}`);
    else if (w.spontaneous) foundry.utils.setProperty(data, "system.description.value", `<p><strong>${t("Spontaneous specialist")}:</strong> ${t("one more spell a day of each spell level the wizard casts, for spells of this school only (instead of the school slot). D35E doesn't check the school: keep that extra spell for this school's spells.")}</p>${data.system?.description?.value ?? ""}`);
    add.push(data);
  }
  if (gone.length) await actor.deleteEmbeddedDocuments("Item", gone);
  if (update.length) await actor.updateEmbeddedDocuments("Item", update);
  if (add.length) await actor.createEmbeddedDocuments("Item", add);
}

/**
 * A domain wizard's arcane domain (Unearthed Arcana) as a D35E domain feat (Spell Schools and Domains): its spells listed
 * (by D35E's spells), so D35E lets them go in the special slot. flags.axeclefts-adventurers-minions.arcaneDomain: its key.
 */
export async function arcaneDomainItem(entry, cat) {
  let idx = cat.extrasData?.spellIndex ?? [];
  if (!idx.length) { try { const p = game.packs.get("D35E.spells"); idx = [...(await p.getIndex())].map((x) => ({ name: x.name, uuid: `Compendium.D35E.spells.Item.${x._id}`, img: x.img })); } catch (e) { idx = []; } }
  const spells = {};
  for (const x of entry.spells ?? []) {
    const e = idx.find((s) => norm(s.name) === norm(x.name));
    const m = String(e?.uuid ?? "").match(/^Compendium\.(.+)\.Item\.([^.]+)$/);
    let k = `level${x.level}`; for (let i = 2; spells[k]; i++) k = `level${x.level}_${i}`;
    spells[k] = { id: m?.[2] ?? "", pack: m?.[1] ?? "", img: e?.img ?? "", level: x.level, name: e?.name ?? x.name };
  }
  const rows = (entry.spells ?? []).map((x) => `<li>${x.level}: ${x.name}${x.note ? ` (${t(x.note)})` : ""}</li>`).join("");
  const desc = `<p><strong>${t("Domain wizard")}</strong> (${t("Unearthed Arcana, in the SRD's variant rules")}): ${t("no prohibited schools; the domain spells go in the spellbook as soon as the wizard can cast them, are cast at +1 caster level, and one more spell of each spell level is prepared from the domain (its special slot). Domain spells not on the wizard list count as wizard spells.")}</p><ul>${rows}</ul>`;
  return { name: entry.name, type: "feat", img: "systems/D35E/icons/spells/domain/magic.png",
    system: { featType: "spellSpecialization", spellSpecializationName: entry.key, spellSpecializationForbiddenNames: "", spellSpecialization: { isDomain: true, spells }, description: { value: desc }, source: "Unearthed Arcana" },
    flags: { [MOD]: { arcaneDomain: entry.en } } };
}

/**
 * The special slots (D35E: a copy of the spell marked "special prepared", its id in the spellbook's specialSlots.levelN):
 * a cleric's domain slot, a specialist's school slot. A slot that already holds the chosen spell stays.
 */
async function applySpecialSlots(actor, todo) {
  for (const { key, wanted } of todo) {
    if (!wanted.length) continue;
    const slotsNow = actor.system?.attributes?.spells?.spellbooks?.[key]?.specialSlots ?? {};
    const update = {}, gone = [];
    for (const w of wanted) {
      const slotKey = `level${w.level}`;
      const current = slotsNow[slotKey] ? actor.items.get(slotsNow[slotKey]) : null;
      if (current && norm(current.name) === norm(w.name)) continue;
      const src = actor.items.find((x) => x.type === "spell" && !x.system?.specialPrepared && x.system?.spellbook === key && Number(x.system?.level) === w.level && norm(x.name) === norm(w.name))
        ?? actor.items.find((x) => x.type === "spell" && !x.system?.specialPrepared && x.system?.spellbook === key && norm(x.name) === norm(w.name));
      if (!src) continue;
      if (current) gone.push(current.id);
      const data = src.toObject(); delete data._id;
      foundry.utils.setProperty(data, "system.specialPrepared", true);
      foundry.utils.setProperty(data, "system.level", w.level);
      foundry.utils.setProperty(data, "system.preparation.preparedAmount", 1);
      foundry.utils.setProperty(data, "system.preparation.maxAmount", 1);
      delete data.flags?.["axeclefts-curios"]; // a copy for the slot, not one of a spellbook item's pages
      const [made] = await actor.createEmbeddedDocuments("Item", [data], { ignoreSpellbookAndLevel: true });
      if (made) update[`system.attributes.spells.spellbooks.${key}.specialSlots.${slotKey}`] = made.id;
    }
    if (gone.length) await actor.deleteEmbeddedDocuments("Item", gone);
    if (Object.keys(update).length) await actor.update(update);
  }
}

/** One class's spells in spellbook items (by level, 100 pages a book), then its prepared spells set on what Curios made. */
async function writeBooks(actor, { cls, entries }) {
  if (!entries.length) return 0;
  const api = game.modules.get("axeclefts-curios").api;
  const sorted = [...entries].sort((a, b) => a.level - b.level || String(a.shown).localeCompare(String(b.shown)));
  const chunks = [[]];
  let pages = 0;
  for (const e of sorted) {
    if (pages + pagesFor(e.level) > PAGES && chunks.at(-1).length) { chunks.push([]); pages = 0; }
    chunks.at(-1).push(e); pages += pagesFor(e.level);
  }
  const data = chunks.map((c) => api.spellbook(c.map((e) => ({ data: e.data, name: e.name, shown: e.shown, level: e.level })), { cls }));
  const made = await actor.createEmbeddedDocuments("Item", data);
  // Curios adds each book's spells when the book arrives (its own hook): wait for them
  const want = new Map(); // "<book id>/<entry key>" → prepared
  made.forEach((m, bi) => chunks[bi].forEach((e, i) => want.set(`${m.id}/s${i + 1}`, e.prepared)));
  const children = () => actor.items.filter((x) => { const c = x.flags?.["axeclefts-curios"]?.child; return c?.kind === "book" && want.has(`${c.master}/${c.key}`); });
  for (let tries = 0; tries < 75 && children().length < want.size; tries++) await new Promise((r) => setTimeout(r, 200));
  const kids = children();
  if (kids.length < want.size) ui.notifications.warn(t("Only {n} of {total} spells reached {actor}'s spellbooks so far; the rest may still be on their way.", { n: kids.length, total: want.size, actor: actor.name }));
  const prep = kids.map((k) => { const c = k.flags["axeclefts-curios"].child; const p = want.get(`${c.master}/${c.key}`) || 0; return p ? { _id: k.id, "system.preparation.preparedAmount": p, "system.preparation.maxAmount": p } : null; }).filter(Boolean);
  if (prep.length) await actor.updateEmbeddedDocuments("Item", prep);
  return kids.length;
}

/* ---------- Gear on the actor ---------- */

/** The Armory's build spec for a gear entry (special material, special abilities, Small size, quantity of ammunition). */
function armorySpec(g, size) {
  const arms = g.kind === "weapon" || g.kind === "armor" || g.kind === "shield";
  return { base: { name: g.base }, masterwork: !!(g.masterwork || g.bonus || g.material || g.abilities?.length), bonus: g.bonus || 0,
    ...(g.material ? { material: g.material } : {}), ...(g.abilities?.length ? { abilities: g.abilities.map((name) => ({ name })) } : {}),
    ...(g.kind === "ammo" ? { quantity: g.qty || 1 } : {}), size: arms && size === "sm" ? "sm" : undefined, identified: true };
}
/** The Armory, when it's active and loaded (else null). */
export async function armoryApi() {
  const api = game.modules.get("axeclefts-armory")?.active ? game.modules.get("axeclefts-armory")?.api : null;
  if (!api?.builder) { try { await api?.loaded; } catch (e) { return null; } }
  return api?.builder ? api : null;
}
/** The special materials and abilities the Armory knows, for the Add row: { materials: [name], weapon: [name], armor: [name] } (or null). */
export async function armoryChoices() {
  const api = await armoryApi();
  if (!api) return null;
  const abil = api.builder.data?.abilities ?? {};
  return { materials: [...api.builder.materials.values()].map((m) => m.name), weapon: Object.keys(abil.weapon ?? {}), armor: Object.keys(abil.armor ?? {}) };
}
/**
 * Build a gear entry with the Armory to check it and price it (special materials and abilities need the Armory):
 * → { priceEach, weightEach, label, warnings }. Throws the Armory's reason when it can't be made (an ability that can't go
 * on that weapon, a material that can't be used for it).
 */
export async function armoryQuote(g, size) {
  const api = await armoryApi();
  if (!api) throw new Error(t("Special materials and abilities need Axecleft's Armory."));
  const res = await api.builder.build(armorySpec(g, size));
  const qty = g.kind === "ammo" ? g.qty || 1 : 1;
  const w = Number(res.data?.system?.weight?.value ?? res.data?.system?.weight) || 0;
  return { priceEach: Math.round(((Number(res.price) || 0) / qty) * 100) / 100, weightEach: w, label: res.name ?? null, warnings: res.warnings ?? [] };
}

/**
 * One gear entry as item data: the Armory makes masterwork and magic arms (and a Small character's plain ones) when it's
 * active; otherwise the compendium item, adjusted. Arms and armour for a Small character are Small (SRD: the same price,
 * half the weight; D35E scales a Small weapon's damage). Kit items are carried, not equipped.
 */
async function gearItem(g, extras, size) {
  const armory = game.modules.get("axeclefts-armory")?.active ? game.modules.get("axeclefts-armory")?.api : null;
  const arms = g.kind === "weapon" || g.kind === "armor" || g.kind === "shield";
  const small = size === "sm" && arms;
  const special = !!(g.material || g.abilities?.length);
  if ((arms || g.kind === "ammo") && armory?.builder && (g.masterwork || g.bonus || small || special)) {
    try {
      await armory.loaded;
      const res = await armory.builder.build(armorySpec(g, size));
      if (res?.data) return { data: res.data, price: res.price ?? res.data.system?.price ?? 0 };
    } catch (err) { console.warn(`${MOD} | Armory couldn't make ${gearLabel(g)}`, err); }
  }
  const ref = extras.items.get(norm(g.base));
  const doc = ref ? await fromUuid(ref.uuid).catch(() => null) : null;
  if (!doc) return null;
  const data = doc.toObject(); delete data._id;
  if (doc.pack) setSource(data, doc.uuid);
  if (g.kind !== "item" && g.kind !== "ammo" && (g.masterwork || g.bonus)) {
    foundry.utils.setProperty(data, "system.masterwork", true);
    if (g.bonus) { if (g.kind === "weapon") foundry.utils.setProperty(data, "system.enh", g.bonus); else foundry.utils.setProperty(data, "system.armor.enh", g.bonus); }
    data.name = gearLabel({ ...g, base: doc.name });
    foundry.utils.setProperty(data, "system.price", gearPrice(g, ref.price));
  }
  if (small) {
    // SRD (Armor for Unusual Creatures; weapon sizes): a Small item costs the same and weighs half
    const w = Number(data.system?.weight?.value ?? data.system?.weight) || 0;
    if (typeof data.system?.weight === "object" && data.system.weight) data.system.weight.value = Math.round(w * 50) / 100;
    else foundry.utils.setProperty(data, "system.weight", Math.round(w * 50) / 100);
    if (g.kind === "weapon") foundry.utils.setProperty(data, "system.weaponData.size", "sm");
    data.name = `${data.name} (${t("Small")})`;
  }
  if (g.qty > 1) foundry.utils.setProperty(data, "system.quantity", g.qty);
  if (g.kind !== "ammo" && !g.kit) foundry.utils.setProperty(data, "system.equipped", true);
  foundry.utils.setProperty(data, "system.carried", true);
  return { data, price: gearPrice(g, ref.price) };
}

/**
 * The plan's gear on the actor, then (when plan.gear.loot) treasure for what's left of the character's wealth:
 * gems, art and magic items rolled on the SRD Treasure table at the character's level (no coins), each kept while it fits.
 * Treasure arms are kept only when the character can use them and they beat what it has (one armor, one shield, one
 * melee and one ranged weapon; the one they replace goes back into the wealth), and nothing whose alignment clashes with
 * the character's (intelligent items; holy, unholy, axiomatic and anarchic arms). Psionic items only for psionic classes.
 * What's left is platinum. → { value, wealth, loot, gold, notes, replaced, skipped }
 */
export async function applyGear(actor, plan, cat, d, { edit = false, fromLevel = 0 } = {}) {
  const extras = await loadExtras(cat);
  const list = plan.gear?.items ?? [];
  const prof = proficiencies(d, extras.gear);
  const focus = focusWeapons(d);
  const psionic = isPsionicCharacter(d);
  // The places arms fill: { data, price, eff, powers, focus, twoHanded, base, loot }
  const place = { armor: null, shield: null, melee: null, ranged: null };
  const other = []; // standard gear that isn't in a place (wondrous items, ammunition, a second weapon)
  let value = 0;
  // Edit: the actor's own items marked Unequip go into the pack; those marked Sell leave it, their trade-in value adding to
  // the wealth (only a GM sells, or players when the world allows it). The backup copy made first still has them.
  let tradeIn = 0;
  if (edit) {
    const ops = plan.gear?.actor ?? {};
    let pct = 50, playersSell = false;
    try { pct = Number(game.settings.get(MOD, "tradeInPct")); playersSell = !!game.settings.get(MOD, "playerTradeIn"); } catch (e) { /* defaults */ }
    const canSell = !!game.user?.isGM || playersSell;
    const unequip = [], sell = [];
    for (const [id, op] of Object.entries(ops)) {
      const it = actor.items.get(id);
      if (!it || !op?.act) continue;
      if (op.act === "sell" && canSell) { tradeIn += tradeInValue(it, pct); sell.push(id); }
      else if (op.act === "unequip" || op.act === "sell") unequip.push({ _id: id, "system.equipped": false, "system.carried": true });
    }
    if (unequip.length) await actor.updateEmbeddedDocuments("Item", unequip);
    if (sell.length) await actor.deleteEmbeddedDocuments("Item", sell);
  }
  // Edit: the arms the actor still has equipped fill their places (Keep)
  if (edit) for (const it of actor.items) {
    if (!it.system?.equipped || !["weapon", "equipment"].includes(it.type)) continue;
    const info = armsInfo(it, englishOf(it));
    const sl = info ? slotOf(info).slot : null;
    if (sl && sl !== "ammo" && !place[sl]) place[sl] = { existing: true, price: Number(it.system?.price) || 0, eff: Number(info.enh) || 0, twoHanded: info.weaponSubtype === "2h", base: englishOf(it) };
  }
  for (const g of list) {
    const it = await gearItem(g, extras, actor.system?.traits?.size);
    if (!it) continue;
    value += Number(it.price) || 0;
    const ref = extras.items.get(norm(g.base));
    const info = ref?.info ?? null;
    const sl = g.kind === "armor" ? "armor" : g.kind === "shield" ? "shield" : g.kind === "weapon" ? (g.role === "ranged" || info?.weaponSubtype === "ranged" ? "ranged" : "melee") : null;
    if (sl && !place[sl]) place[sl] = { data: it.data, price: Number(it.price) || 0, eff: g.bonus || 0, powers: false, focus: focus.has(nameKey(g.base)), twoHanded: info?.weaponSubtype === "2h", base: g.base, loot: false };
    else other.push(it.data);
  }
  // Edit: the wealth the new levels bring (from the level the actor had)
  const wealth = edit ? Math.max(0, wealthFor(plan.kind, d.level, extras.gear) - (fromLevel ? wealthFor(plan.kind, fromLevel, extras.gear) : 0)) + tradeIn
    : wealthFor(plan.kind, d.level, extras.gear, { start: startingGold(plan, cat, extras.gear) }); // a 1st-level PC: its class's starting gold
  let left = Math.max(0, wealth - value), loot = 0;
  const notes = [], keep = [];
  let replaced = 0, skipped = 0;
  const T = globalThis.AxecleftTreasure;
  if (plan.gear?.loot !== false && left > 0 && T?.rollTreasure) {
    for (let i = 0; i < 40 && left > Math.max(5, wealth * 0.02); i++) {
      let r;
      try { r = await T.rollTreasure(Math.min(20, Math.max(1, d.level)), { coins: false, goods: true, items: true }, { actor, form: null }); } catch (err) { console.warn(`${MOD} | treasure`, err); break; }
      for (const e of r.entries ?? []) {
        if (e.coins) continue; // no coins: they weigh a lot
        if (!e.data || e.placeholder) continue;
        if (!psionic) { try { if (T.isPsionicItem?.(e.data)) { skipped++; continue; } } catch (err) { /* not marked */ } }
        const v = (Number(e.data.system?.price) || 0) * (Number(e.data.system?.quantity) || 1);
        if (v <= 0) continue;
        const en = englishOf(e.data);
        // Alignment: an intelligent item of a clashing alignment, or holy, unholy, axiomatic or anarchic arms against it
        const intel = e.data.system?.intelligent;
        if (intel?.enabled && intel.alignment && !intelligentOk(intel.alignment, plan.alignment)) { skipped++; continue; }
        const info = armsInfo(e.data, en);
        const abilityNames = (e.data.flags?.["axeclefts-armory"]?.spec?.abilities ?? []).map((a) => a?.name ?? a).join(" ");
        if (info && !alignedOk(`${en} ${abilityNames}`, plan.alignment)) { skipped++; continue; }
        const kind = info ? slotOf(info) : { slot: null };
        if (kind.slot === "ammo") {
          const base = baseOfArms(en, info, extras)?.en ?? en;
          if (!ammoFits(base, place.ranged?.base) || v > left) { skipped++; continue; }
          keep.push(e.data); left -= v; loot += v; continue;
        }
        if (!kind.slot) { if (v > left) continue; keep.push(e.data); left -= v; loot += v; continue; }
        // Arms: usable, fits with the rest (no shield with a two-handed weapon), better than what's there
        const baseRef = baseOfArms(en, info, extras);
        const s = { ...kind, base: baseRef?.en ?? "" };
        if (!canUse(s, prof)) { skipped++; continue; }
        if (kind.slot === "shield" && place.melee?.twoHanded) { skipped++; continue; }
        if (kind.slot === "melee" && kind.twoHanded && place.shield) { skipped++; continue; }
        const enh = Number(info.enh) || 0;
        const eff = effectiveBonus({ slot: kind.slot, enh, price: Number(e.data.system?.price) || 0, mundane: baseRef?.price ?? 0, masterwork: true });
        const abilities = e.data.flags?.["axeclefts-armory"]?.spec?.abilities?.length ?? 0;
        const cand = { data: e.data, price: v, eff, powers: abilities > 0 || eff > enh, focus: !!s.base && focus.has(nameKey(s.base)), twoHanded: kind.twoHanded, base: s.base, loot: true };
        const cur = place[kind.slot];
        if (cur?.existing) { skipped++; continue; }
        if (cur && compareArms(cand, cur) <= 0) { skipped++; continue; }
        const refund = cur ? cur.price : 0;
        if (v > left + refund) continue;
        if (cur) {
          replaced++;
          if (cur.loot) loot -= cur.price; else value -= cur.price;
        }
        left += refund - v; loot += v;
        place[kind.slot] = cand;
      }
    }
  } else if (plan.gear?.loot !== false && left > 0) notes.push(t("The Treasure Generator isn't active (it comes with Armory, Curios or Gemstones): the rest of the wealth is platinum."));
  // Everything on the actor: arms in their places equipped, the rest carried
  const data = [];
  for (const k of ["armor", "shield", "melee", "ranged"]) {
    const p = place[k]; if (!p || p.existing) continue;
    let x = p.data;
    if (p.loot) { try { x = T?.rollCreationChanges ? await T.rollCreationChanges(foundry.utils.deepClone(x)) : x; } catch (err) { /* as rolled */ } }
    foundry.utils.setProperty(x, "system.equipped", true); foundry.utils.setProperty(x, "system.carried", true);
    foundry.utils.setProperty(x, `flags.${MOD}.equip`, true); // D35E may unequip new arms as they arrive: equipped again below
    data.push(x);
  }
  data.push(...other);
  for (const k of keep) { try { data.push(T?.rollCreationChanges ? await T.rollCreationChanges(foundry.utils.deepClone(k)) : k); } catch (e) { data.push(k); } }
  if (data.length) {
    for (const x of data) if (x?.system?.equipped) foundry.utils.setProperty(x, `flags.${MOD}.equip`, true); // worn items too (rings, cloaks…)
    const made = await actor.createEmbeddedDocuments("Item", data);
    // D35E treats new arms and worn items as transferred and doesn't equip them: equip the ones A&M placed
    const equip = (made ?? []).filter((it) => it?.flags?.[MOD]?.equip);
    if (equip.length) await actor.updateEmbeddedDocuments("Item", equip.map((it) => ({ _id: it.id, "system.equipped": true, "system.carried": true, [`flags.${MOD}.-=equip`]: null })));
  }
  // What's left as coins: platinum, and gold for the remainder under 10 gp (50 coins to the pound)
  const gold = Math.floor(left);
  if (plan.gear?.loot !== false && gold > 0) {
    const cur = actor.system?.currency ?? {}, pp = Math.floor(gold / 10), gp = gold % 10;
    await actor.update({ "system.currency.pp": (Number(cur.pp) || 0) + pp, "system.currency.gp": (Number(cur.gp) || 0) + gp });
  }
  return { value, wealth, loot, gold, notes, replaced, skipped };
}
