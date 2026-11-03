/**
 * A&M — the GM's Build profiles page (start page): the builds Random and "choose for me" follow for each class. A class
 * has its own build and may have others (Archer, Two-handed…) shipped in data/profiles.json; a GM can change any of
 * them, add new ones, or hide a shipped one. The GM's are kept in the world (setting "profiles":
 * { Class: { label, own, variants: { name: profile | null } } }) and replace the shipped ones of the same name.
 */
import { MOD } from "../foundry/catalog.js";
import { baseName } from "../core/plan.js";
import { profileOf, mergeProfiles } from "../core/random.js";
import { profileToForm, formToProfile } from "../core/profiles.js";
import * as R from "../core/rules.js";

const A = () => globalThis.AxecleftTools;
const fmt = (s, d) => (d ? String(s).replace(/\{(\w+)\}/g, (m, k) => (d[k] ?? m)) : String(s));
const t = (s, d) => A()?.t?.(s, d) ?? fmt(s, d);
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const H = (s, d) => esc(t(s, d));
const opt = (value, label, sel) => `<option value="${esc(value)}"${String(sel ?? "") === String(value) ? " selected" : ""}>${esc(label)}</option>`;
const alignLabel = (k) => game.i18n.localize(CONFIG.D35E?.alignments?.[k] ?? k);
const abilityLabel = (a) => (R.ABILITY_SHORT?.[a] ? t(R.ABILITY_SHORT[a]) : String(a).toUpperCase());
const lower = (s) => String(s ?? "").toLowerCase().trim();
const OWN = "__own__"; // the class's own build, in the build select
const NEW = "__new__";

export function getProfiles() { try { return foundry.utils.deepClone(game.settings.get(MOD, "profiles") ?? {}); } catch (e) { return {}; } }
async function setProfiles(v) { await game.settings.set(MOD, "profiles", v); }

/** The base classes to choose from (one per English name). */
function classChoices(cat) {
  const seen = new Set();
  return cat.list.classes.filter((c) => c.kind === "base" && !c.gestalt && !c.variant).filter((c) => { const k = lower(baseName(c.en)); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The page. state: { cls (English name), build (OWN | NEW | name) }. */
export function profileEditorHTML(cat, state = {}) {
  const head = `<h2 style="margin-top:4px">${H("Build profiles")}</h2>
    <p class="hint">${H("The builds A&M follows when it chooses for a class: Random characters, and the feats, skills, spells and gear it fills in. A class has its own build and can have others (an archer fighter, a two-handed fighter…): Random picks one, or the one asked for. Yours are kept in this world and replace A&M's builds of the same name.")}</p>`;
  const classes = classChoices(cat);
  if (!classes.length) return `${head}<p class="hint">${H("No classes found.")}</p>`;
  const cur = classes.find((c) => lower(baseName(c.en)) === lower(state.cls)) ?? classes[0];
  const en = baseName(cur.en);
  const custom = getProfiles();
  const mine = custom[Object.keys(custom).find((k) => lower(k) === lower(en)) ?? en] ?? {};
  const shipped = profileOf(cur, { profiles: cat.data?.profiles, variants: {} });
  const merged = profileOf(cur, { profiles: mergeProfiles(cat.data?.profiles, custom), variants: {} });
  const names = [...new Set([...Object.keys(shipped.variants ?? {}), ...Object.keys(mine.variants ?? {})])];
  const build = state.build === NEW || names.includes(state.build) ? state.build : OWN;
  const status = (n) => (mine.variants?.[n] === null ? t("hidden") : mine.variants?.[n] ? (shipped.variants?.[n] ? t("yours") : t("new, yours")) : t("A&M's"));
  const ownLabel = merged.label || t("Standard");
  const buildOpts = opt(OWN, `${t(ownLabel)} — ${t("the class's own")}${mine.own || mine.label ? ` (${t("yours")})` : ""}`, build)
    + names.map((n) => opt(n, `${t(n)} — ${status(n)}`, build)).join("") + opt(NEW, t("New build…"), build);
  // The profile being edited
  const prof = build === OWN ? merged : build === NEW ? {} : (mine.variants?.[build] ?? shipped.variants?.[build] ?? {});
  const full = build === OWN ? merged : { ...merged, ...prof };
  const f = profileToForm(full, cat.skills);
  const hidden = build !== OWN && build !== NEW && mine.variants?.[build] === null;
  const abSel = (name, sel, blank) => `<select name="pf.${name}">${blank ? opt("", "—", sel) : ""}${R.ABILITIES.map((a) => opt(a, abilityLabel(a), sel)).join("")}</select>`;
  const area = (name, v, ph, rows = 4) => `<textarea name="pf.${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
  const check = (name, v, label) => `<label><input type="checkbox" name="pf.${name}" ${v ? "checked" : ""}> ${H(label)}</label>`;
  const caster = !!cur.casting;
  return `${head}
    <div class="row" style="margin:6px 0"><b>${H("Class")}</b><select data-on="profileCls" style="flex:1;min-width:12em">${classes.map((c) => opt(baseName(c.en), c.label, en)).join("")}</select>
      <b>${H("Build")}</b><select data-on="profileBuild" style="flex:1;min-width:14em">${buildOpts}</select></div>
    ${hidden ? `<p class="hint"><i class="fas fa-eye-slash"></i> ${H("This build is hidden: Random doesn't use it and it isn't offered.")}</p>` : ""}
    <div class="aam2-prq">
      <fieldset><legend>${H("Build")}</legend>
        <div class="form-group"><label>${H("Name")}</label><input type="text" name="pf.name" value="${esc(build === OWN ? ownLabel : build === NEW ? "" : build)}" placeholder="${H("Archer")}"></div>
        ${build === OWN ? `<p class="hint">${H("The class's own build: the one used when no other is chosen. The other builds start from it and change what they give.")}</p>` : `<p class="hint">${H("Fields left empty come from the class's own build.")}</p>`}
        <div class="form-group"><label>${H("Ability order")}</label><span class="row">${f.abilities.map((a, i) => abSel(`ab.${i}`, a)).join("")}</span></div>
        <div class="form-group"><label>${H("Increases")}</label><span class="row">${[0, 1, 2, 3, 4].map((i) => abSel(`inc.${i}`, f.increases[i] ?? "", true)).join("")}</span></div>
        <p class="hint">${H("The highest score goes first; the increases at 4th, 8th, 12th, 16th and 20th level.")}</p>
        <div class="form-group"><label>${H("Alignments")}</label><span class="row">${R.ALIGNMENTS.map((a) => `<label><input type="checkbox" name="pf.al.${a}" ${f.alignments.includes(a) ? "checked" : ""}> ${esc(alignLabel(a))}</label>`).join("")}</span></div>
      </fieldset>
      <fieldset><legend>${H("Skills and feats")}</legend>
        <div class="form-group"><label>${H("Skills")}</label>${area("skills", f.skills, "Hide\nMove Silently")}</div>
        <p class="hint">${H("In the order points go into them, one a line.")}</p>
        <div class="form-group"><label>${H("Feats")}</label>${area("feats", f.feats, "Point Blank Shot\nWeapon Focus (Longbow)", 6)}</div>
        <p class="hint">${H("In the order they're taken when their prerequisites allow; a choice in brackets.")}</p>
      </fieldset>
      <fieldset><legend>${H("Gear")}</legend>
        <div class="form-group"><label>${H("Melee weapon")}</label><input type="text" name="pf.melee" value="${esc(f.melee)}" placeholder="${H("the class's")}"></div>
        <div class="form-group"><label>${H("Ranged weapon")}</label><input type="text" name="pf.ranged" value="${esc(f.ranged)}" placeholder="${H("the class's")}"></div>
        <div class="form-group"><label></label><span class="row">${check("swap", f.swap, /*t*/"The ranged weapon gets the better enhancement")}${check("noShield", f.noShield, /*t*/"No shield")}${check("offhand", f.offhand, /*t*/"A second melee weapon")}</span></div>
        <p class="hint">${H("A Weapon Focus in the feats also picks the weapon.")}</p>
      </fieldset>
      ${caster || f.domains || f.schools ? `<fieldset><legend>${H("Spells")}</legend>
        <div class="form-group"><label>${H("Favourite spells")}</label>${area("spells", f.spells, "Magic Missile\nFireball", 6)}</div>
        <p class="hint">${H("Taken first, in this order; one a line.")}</p>
        ${f.domains || /cleric/i.test(en) ? `<div class="form-group"><label>${H("Domains")}</label><input type="text" name="pf.domains" value="${esc(f.domains)}" placeholder="Healing, Protection"></div>` : ""}
        ${f.schools || /wizard/i.test(en) ? `<div class="form-group"><label>${H("Specialist chance (%)")}</label><input type="number" min="0" max="100" name="pf.specialist" value="${esc(f.specialist)}" style="width:5em"></div>
        <div class="form-group"><label>${H("Schools")}</label><input type="text" name="pf.schools" value="${esc(f.schools)}" placeholder="evo, con"></div>
        <div class="form-group"><label>${H("Given up first")}</label><input type="text" name="pf.prohibit" value="${esc(f.prohibit)}" placeholder="enc, nec"></div>` : ""}
      </fieldset>` : ""}
    </div>
    <div class="row" style="margin-top:6px">
      <button type="button" data-act="profileSave" data-cls="${esc(en)}" data-build="${esc(build)}"><i class="fas fa-floppy-disk"></i> ${H("Save")}</button>
      ${build !== OWN && build !== NEW && shipped.variants?.[build] && !hidden ? `<button type="button" data-act="profileHide" data-cls="${esc(en)}" data-build="${esc(build)}"><i class="fas fa-eye-slash"></i> ${H("Hide")}</button>` : ""}
      ${(build === OWN && (mine.own || mine.label)) || (build !== OWN && build !== NEW && mine.variants?.[build] !== undefined) ? `<button type="button" data-act="profileForget" data-cls="${esc(en)}" data-build="${esc(build)}"><i class="fas fa-eraser"></i> ${H(shipped.variants?.[build] || build === OWN ? /*t*/"Back to A&M's" : /*t*/"Delete")}</button>` : ""}
    </div>
    <div class="row" style="margin-top:10px"><span class="hint" style="flex:1">${H("Export your builds to keep them, or to use them in another world.")}</span>
      <button type="button" data-act="profileExport"><i class="fas fa-file-export"></i> ${H("Export")}</button>
      <button type="button" data-act="profileImport"><i class="fas fa-file-import"></i> ${H("Import")}</button></div>`;
}

function readForm(root) {
  const v = (n) => root.querySelector(`[name="pf.${n}"]`);
  const val = (n) => v(n)?.value ?? "";
  const on = (n) => !!v(n)?.checked;
  return {
    name: val("name").trim(),
    abilities: [0, 1, 2, 3, 4, 5].map((i) => val(`ab.${i}`)), increases: [0, 1, 2, 3, 4].map((i) => val(`inc.${i}`)),
    alignments: R.ALIGNMENTS.filter((a) => on(`al.${a}`)),
    skills: val("skills"), feats: val("feats"), spells: val("spells"),
    melee: val("melee"), ranged: val("ranged"), swap: on("swap"), noShield: on("noShield"), offhand: on("offhand"),
    domains: val("domains"), schools: val("schools"), prohibit: val("prohibit"), specialist: val("specialist"),
  };
}

/** The page's buttons and selects (app.acts / app.onChanges). */
export function profileActions(app) {
  const entry = (custom, en) => { const k = Object.keys(custom).find((x) => lower(x) === lower(en)) ?? en; custom[k] ??= {}; return custom[k]; };
  const done = (msg) => { ui.notifications.info(msg); app.paint(); };
  const cur = (en) => app.cat.list.classes.find((c) => lower(baseName(c.en)) === lower(en));
  return {
    profileSave: async (el) => {
      const en = el.dataset.cls, build = el.dataset.build, custom = getProfiles(), mine = entry(custom, en);
      const f = readForm(app.root);
      const cls = cur(en);
      const merged = profileOf(cls, { profiles: mergeProfiles(app.cat.data?.profiles, custom), variants: {} });
      if (build === OWN) {
        mine.own = formToProfile(f, merged, app.cat.skills);
        if (f.name && f.name !== (merged.label || "Standard")) mine.label = f.name;
        await setProfiles(custom);
        app.profileState = { cls: en, build: OWN };
        return done(t("{cls}: its own build saved.", { cls: cls?.name ?? en }));
      }
      const name = f.name || (build !== NEW ? build : "");
      if (!name) return ui.notifications.warn(t("Give the build a name."));
      // Only what differs from the class's own build is kept (the rest follows it)
      const prof = formToProfile(f, build === NEW ? {} : (mine.variants?.[build] ?? merged.variants?.[build] ?? {}), app.cat.skills);
      const own = formToProfile(profileToForm(merged, app.cat.skills), {}, app.cat.skills);
      for (const k of Object.keys(prof)) if (JSON.stringify(prof[k]) === JSON.stringify(own[k])) delete prof[k];
      mine.variants ??= {};
      // Renamed: a build of A&M's is hidden under its old name, one of yours goes
      const shipped = profileOf(cls, { profiles: app.cat.data?.profiles, variants: {} });
      if (build !== NEW && build !== name) { if (shipped.variants?.[build]) mine.variants[build] = null; else delete mine.variants[build]; }
      mine.variants[name] = prof;
      await setProfiles(custom);
      app.profileState = { cls: en, build: name };
      done(t("{cls}: build {name} saved.", { cls: cls?.name ?? en, name }));
    },
    profileHide: async (el) => {
      const custom = getProfiles(), mine = entry(custom, el.dataset.cls);
      (mine.variants ??= {})[el.dataset.build] = null;
      await setProfiles(custom);
      done(t("Build {name} hidden.", { name: el.dataset.build }));
    },
    profileForget: async (el) => {
      const custom = getProfiles(), mine = entry(custom, el.dataset.cls);
      if (el.dataset.build === OWN) { delete mine.own; delete mine.label; } else delete mine.variants?.[el.dataset.build];
      await setProfiles(custom);
      done(t("Back to A&M's build."));
    },
    profileExport: () => (foundry.utils.saveDataToFile ?? globalThis.saveDataToFile)(JSON.stringify({ module: MOD, profiles: getProfiles() }, null, 1), "application/json", "aam-build-profiles.json"),
    profileImport: () => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = ".json,application/json";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const json = JSON.parse(await file.text());
          const data = json?.profiles ?? json;
          if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("not profiles");
          const custom = getProfiles();
          let n = 0;
          for (const [en, c] of Object.entries(data)) {
            if (en.startsWith("_") || !c || typeof c !== "object") continue;
            const mine = entry(custom, en);
            if (c.label) mine.label = c.label;
            if (c.own) mine.own = c.own;
            for (const [name, v] of Object.entries(c.variants ?? {})) { (mine.variants ??= {})[name] = v; n++; }
          }
          await setProfiles(custom);
          done(t("Builds imported: {n}.", { n }));
        } catch (e) { ui.notifications.error(t("That file doesn't hold build profiles.")); }
      });
      input.click();
    },
  };
}
export const PROFILE_OWN = OWN, PROFILE_NEW = NEW;
