/**
 * A&M — the GM's Prestige requirements page (start page): the requirements A&M checks for each prestige class, from
 * the SRD (data/prestige.json) or the GM's own (world setting "prestigeReqs", which replaces the SRD's). A custom
 * prestige class gets its requirements here; "No requirements" stops the checks for a class.
 */
import { MOD } from "../foundry/catalog.js";
import { baseName } from "../core/plan.js";
import { requirementsOf, toForm, fromForm, FORM_KEYS } from "../core/prestige.js";
import { prestigeMissingText } from "./messages.js";
import * as R from "../core/rules.js";

const A = () => globalThis.AxecleftTools;
const fmt = (s, d) => (d ? String(s).replace(/\{(\w+)\}/g, (m, k) => (d[k] ?? m)) : String(s));
const t = (s, d) => A()?.t?.(s, d) ?? fmt(s, d);
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const H = (s, d) => esc(t(s, d));
const opt = (value, label, sel) => `<option value="${esc(value)}"${String(sel ?? "") === String(value) ? " selected" : ""}>${esc(label)}</option>`;
const alignLabel = (k) => game.i18n.localize(CONFIG.D35E?.alignments?.[k] ?? k);
const lower = (s) => String(s ?? "").toLowerCase().trim();

const SOURCE = { srd: /*t*/"SRD", custom: /*t*/"Your own", none: /*t*/"No requirements (yours)", unknown: /*t*/"None known" };

export function getCustom() { try { return foundry.utils.deepClone(game.settings.get(MOD, "prestigeReqs") ?? {}); } catch (e) { return {}; } }
async function setCustom(v) { await game.settings.set(MOD, "prestigeReqs", v); }

/** The classes to choose from: the prestige classes found, and any class the GM gave requirements that isn't found. */
export function prestigeChoices(cat) {
  const custom = getCustom(), srd = cat.data?.prestige ?? {};
  const out = new Map();
  for (const c of cat.list.classes) if (c.kind === "prestige") {
    const en = baseName(c.en ?? c.name);
    if (!out.has(lower(en))) out.set(lower(en), { en, label: c.label, cls: c });
  }
  for (const en of Object.keys(custom)) if (!out.has(lower(en))) out.set(lower(en), { en, label: `${en} (${t("not found")})`, cls: { en, name: en } });
  return [...out.values()].map((x) => {
    const req = requirementsOf(x.cls, srd, custom);
    return { ...x, req, source: req?._source ?? "unknown" };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

/** The page. sel: the English name of the class being edited. */
export function prestigeEditorHTML(cat, sel) {
  const choices = prestigeChoices(cat);
  const cur = choices.find((c) => lower(c.en) === lower(sel)) ?? choices[0];
  const head = `<h2 style="margin-top:4px">${H("Prestige requirements")}</h2>
    <p class="hint">${H("What A&M checks before the first level of each prestige class. The SRD's come with A&M; yours replace them in this world. A character who doesn't qualify is shown the missing requirements as a rule broken, and the class is marked ✘ in the class lists (it can still be chosen).")}</p>`;
  if (!cur) return `${head}<p class="hint">${H("No prestige classes found.")}</p>${ioRow()}`;
  const f = toForm(cur.req && cur.req._source !== "none" ? cur.req : {});
  const srdHas = !!requirementsOf(cur.cls, cat.data?.prestige ?? {}, {});
  const skillOpts = (s) => opt("", "—", s) + cat.skills.map((k) => opt(k.key, k.label, s)).join("");
  const subOpts = (s) => opt("", "—", s) + cat.skills.filter((k) => k.arbitrary).map((k) => opt(k.key, k.label, s)).join("");
  const skillRows = [...f.skills, { key: "", min: "" }, { key: "", min: "" }].map((s, i) =>
    `<div class="row"><select name="pr.skill.${i}">${skillOpts(s.key)}</select><input type="number" min="0" max="40" name="pr.skillMin.${i}" value="${esc(s.min)}" style="width:4em"> ${H("ranks")}</div>`).join("");
  const subRows = [...f.subSkills, { parent: "", name: "", min: "" }].map((s, i) =>
    `<div class="row"><select name="pr.sub.${i}">${subOpts(s.parent)}</select><input type="text" name="pr.subName.${i}" value="${esc(s.name)}" placeholder="${H("dance")}" style="width:9em"><input type="number" min="0" max="40" name="pr.subMin.${i}" value="${esc(s.min)}" style="width:4em"> ${H("ranks")}</div>`).join("");
  const num = (name, v, max = 40) => `<input type="number" min="0" max="${max}" name="pr.${name}" value="${v || ""}" style="width:4em">`;
  const check = (name, v, label) => `<label><input type="checkbox" name="pr.${name}" ${v ? "checked" : ""}> ${H(label)}</label>`;
  const area = (name, v, ph) => `<textarea name="pr.${name}" rows="3" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
  // Fields the form doesn't show (any two Knowledge skills, metamagic feats, schools of spells…): kept, shown in words
  const extra = Object.keys(cur.req ?? {}).filter((k) => !FORM_KEYS.includes(k) && !k.startsWith("_"));
  const extraText = extra.length ? extraWords(cur.req, cat) : "";
  return `${head}
    <div class="row" style="margin:6px 0"><b>${H("Class")}</b><select data-on="prestigeCls" style="flex:1;min-width:14em">${choices.map((c) => opt(c.en, `${c.label} — ${t(SOURCE[c.source])}`, cur.en)).join("")}</select></div>
    <p class="hint">${H("Using: {source}.", { source: t(SOURCE[cur.source]) })}${cur.source === "none" ? ` ${H("A&M checks nothing for this class; Save to give it requirements.")}` : ""}${cur.source === "unknown" ? ` ${H("Fill in the requirements and Save, or choose No requirements.")}` : ""}</p>
    <div class="aam2-prq">
      <fieldset><legend>${H("Race and alignment")}</legend>
        <div class="form-group"><label>${H("Races")}</label><input type="text" name="pr.race" value="${esc(f.race)}" placeholder="${H("Elf, Half-Elf (empty: any)")}"></div>
        <div class="form-group"><label>${H("Alignments")}</label><span class="row">${R.ALIGNMENTS.map((a) => `<label><input type="checkbox" name="pr.align.${a}" ${f.align.includes(a) ? "checked" : ""}> ${esc(alignLabel(a))}</label>`).join("")}</span></div>
        <p class="hint">${H("No alignment ticked (or all): any.")}</p>
        <div class="form-group"><label>${H("Languages")}</label><input type="text" name="pr.languages" value="${esc(f.languages)}" placeholder="${H("Draconic")}"></div>
      </fieldset>
      <fieldset><legend>${H("Combat")}</legend>
        <div class="form-group"><label>${H("Base attack bonus")}</label>${num("bab", f.bab)}</div>
        <div class="form-group"><label>${H("Sneak attack")}</label>${num("sneak", f.sneak, 20)} d6</div>
        <div class="form-group"><label></label><span class="row">${check("martial", f.martial, /*t*/"Proficient with all martial weapons")}${check("stillMind", f.stillMind, /*t*/"Still mind class feature")}</span></div>
      </fieldset>
      <fieldset><legend>${H("Skills")}</legend>${skillRows}
        <p class="hint">${H("A skill with a specialty (Perform (dance), Craft (alchemy)):")}</p>${subRows}</fieldset>
      <fieldset><legend>${H("Feats")}</legend>
        <div class="form-group"><label>${H("All of these")}</label>${area("feats", f.feats, "Dodge\nWeapon Focus (longbow)")}</div>
        <div class="form-group"><label>${H("One of these")}</label>${area("anyFeats", f.anyFeats, "Weapon Focus (longbow)\nWeapon Focus (shortbow)")}</div>
        <p class="hint">${H("One feat a line; a choice in brackets.")}</p>
      </fieldset>
      <fieldset><legend>${H("Spells")}</legend>
        <div class="form-group"><label>${H("Arcane spells of level")}</label>${num("arcane", f.arcane, 9)}</div>
        <div class="form-group"><label>${H("Divine spells of level")}</label>${num("divine", f.divine, 9)}</div>
        <div class="form-group"><label>${H("Any spells of level")}</label>${num("any", f.any, 9)}</div>
        <div class="form-group"><label></label>${check("spontaneousArcane", f.spontaneousArcane, /*t*/"Casts arcane spells without preparation")}</div>
        <div class="form-group"><label>${H("Able to cast")}</label>${area("knowsSpells", f.knowsSpells, "Mage Hand")}</div>
      </fieldset>
      <fieldset><legend>${H("Psionics")}</legend>
        <div class="form-group"><label>${H("Manifest powers of level")}</label>${num("manifest", f.manifest, 9)}</div>
        <div class="form-group"><label>${H("Manifester level")}</label>${num("ml", f.ml)}</div>
        <div class="form-group"><label></label>${check("pp", f.pp, /*t*/"Has a power point reserve")}</div>
        <div class="form-group"><label>${H("Able to manifest")}</label>${area("knowsPowers", f.knowsPowers, "Mindlink")}</div>
      </fieldset>
      <fieldset><legend>${H("Special")}</legend>
        <div class="form-group"><label>${H("Not checked")}</label>${area("special", f.special, t("Must have killed someone to join the guild."))}</div>
        <p class="hint">${H("Shown to the builder as a reminder.")}</p>
        ${extraText ? `<p class="hint"><b>${H("Also, kept as it is")}:</b> ${esc(extraText)}</p>` : ""}
      </fieldset>
    </div>
    <div class="row" style="margin-top:6px">
      <button type="button" data-act="prestigeSave" data-en="${esc(cur.en)}"><i class="fas fa-floppy-disk"></i> ${H("Save")}</button>
      ${srdHas && cur.source !== "srd" ? `<button type="button" data-act="prestigeSrd" data-en="${esc(cur.en)}"><i class="fas fa-book"></i> ${H("Use the SRD's")}</button>` : ""}
      ${cur.source !== "none" ? `<button type="button" data-act="prestigeNone" data-en="${esc(cur.en)}"><i class="fas fa-ban"></i> ${H("No requirements")}</button>` : ""}
      ${cur.source === "custom" || cur.source === "none" ? `<button type="button" data-act="prestigeForget" data-en="${esc(cur.en)}"><i class="fas fa-eraser"></i> ${H("Forget yours")}</button>` : ""}
    </div>
    ${ioRow()}`;
}

function ioRow() {
  return `<div class="row" style="margin-top:10px"><span class="hint" style="flex:1">${H("Export your requirements to keep them, or to use them in another world.")}</span>
    <button type="button" data-act="prestigeExport"><i class="fas fa-file-export"></i> ${H("Export")}</button>
    <button type="button" data-act="prestigeImport"><i class="fas fa-file-import"></i> ${H("Import")}</button></div>`;
}

/** The fields the form doesn't show, in words (the "missing" texts, as if all were missing). */
function extraWords(req, cat) {
  const out = [];
  if (req.skillsAny) out.push({ key: "skillsAny", count: req.skillsAny.count, min: req.skillsAny.min, keys: req.skillsAny.keys ?? [] });
  if (req.featsFrom) out.push({ key: "featsFrom", count: req.featsFrom.count ?? 1, metamagic: !!req.featsFrom.metamagic, itemCreation: !!req.featsFrom.itemCreation, list: req.featsFrom.list ?? [] });
  if (req.featCount) out.push({ key: "featCount", ...req.featCount });
  if (req.spellSchools) out.push({ key: "spellSchools", ...req.spellSchools });
  if (req.schoolSpells) out.push({ key: "schoolSpells", highLevel: 0, ...req.schoolSpells });
  return out.map((m) => prestigeMissingText(m, cat)).join("; ");
}

/** The form's values (for fromForm). */
function readForm(root) {
  const v = (n) => root.querySelector(`[name="pr.${n}"]`);
  const val = (n) => v(n)?.value ?? "";
  const on = (n) => !!v(n)?.checked;
  const rows = (prefix, fn) => { const out = []; for (let i = 0; v(`${prefix}.${i}`); i++) out.push(fn(i)); return out; };
  return {
    race: val("race"), align: R.ALIGNMENTS.filter((a) => on(`align.${a}`)), languages: val("languages"),
    bab: val("bab"), sneak: val("sneak"), martial: on("martial"), stillMind: on("stillMind"),
    skills: rows("skill", (i) => ({ key: val(`skill.${i}`), min: val(`skillMin.${i}`) })),
    subSkills: rows("sub", (i) => ({ parent: val(`sub.${i}`), name: val(`subName.${i}`), min: val(`subMin.${i}`) })),
    feats: val("feats"), anyFeats: val("anyFeats"),
    arcane: val("arcane"), divine: val("divine"), any: val("any"), spontaneousArcane: on("spontaneousArcane"), knowsSpells: val("knowsSpells"),
    manifest: val("manifest"), ml: val("ml"), pp: on("pp"), knowsPowers: val("knowsPowers"),
    special: val("special"),
  };
}

/** The page's buttons (app.actions): each changes the world setting, then the page is drawn again. */
export function prestigeActions(app) {
  const key = (custom, en) => Object.keys(custom).find((k) => lower(k) === lower(en)) ?? en;
  const done = (msg) => { ui.notifications.info(msg); app.paint(); };
  return {
    prestigeSave: async (el) => {
      const en = el.dataset.en, custom = getCustom();
      const cur = prestigeChoices(app.cat).find((c) => lower(c.en) === lower(en));
      const req = fromForm(readForm(app.root), cur?.req ?? {});
      delete custom[key(custom, en)];
      custom[en] = req;
      await setCustom(custom);
      done(t("Requirements saved for {cls}.", { cls: en }));
    },
    prestigeSrd: async (el) => prestigeActions(app).prestigeForget(el),
    prestigeForget: async (el) => {
      const custom = getCustom();
      delete custom[key(custom, el.dataset.en)];
      await setCustom(custom);
      done(t("{cls} uses the SRD's requirements again.", { cls: el.dataset.en }));
    },
    prestigeNone: async (el) => {
      const custom = getCustom();
      delete custom[key(custom, el.dataset.en)];
      custom[el.dataset.en] = null;
      await setCustom(custom);
      done(t("{cls}: no requirements.", { cls: el.dataset.en }));
    },
    prestigeExport: () => {
      const data = JSON.stringify({ module: MOD, prestigeReqs: getCustom() }, null, 1);
      (foundry.utils.saveDataToFile ?? globalThis.saveDataToFile)(data, "application/json", "aam-prestige-requirements.json");
    },
    prestigeImport: () => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = ".json,application/json";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const json = JSON.parse(await file.text());
          const reqs = json?.prestigeReqs ?? json?.classes ?? json;
          if (!reqs || typeof reqs !== "object" || Array.isArray(reqs)) throw new Error("not requirements");
          const custom = getCustom();
          let n = 0;
          for (const [en, req] of Object.entries(reqs)) {
            if (en.startsWith("_")) continue;
            if (req !== null && (typeof req !== "object" || Array.isArray(req))) continue;
            delete custom[key(custom, en)];
            custom[en] = req;
            n++;
          }
          await setCustom(custom);
          done(t("Requirements imported for {n} classes.", { n }));
        } catch (e) {
          ui.notifications.error(t("That file doesn't hold prestige requirements."));
        }
      });
      input.click();
    },
  };
}
