/**
 * A&M v2 — the window: a start page, then the steps (Basics, Abilities, Classes and levels, Skills, Feats, Review)
 * with a summary on the right. One plan is edited throughout; every change is checked and the summary updated.
 * Events are handled once on the window (data-act / data-bind), so redrawing a part never loses its listeners.
 */
import { STYLE } from "./style.js";
import { issueText, missingText, changeText, noteText, prestigeMissingText } from "./messages.js";
import { requirementsOf, missingFor, stateAt } from "../core/prestige.js";
import { featureOptionsFor, chosenFeatures, classSkillsFor, canArcaneDomain } from "../core/variants.js";
import { prestigeEditorHTML, prestigeActions } from "./prestige-editor.js";
import { profileEditorHTML, profileActions } from "./profile-editor.js";
import { loadCatalog, MOD } from "../foundry/catalog.js";
import { createActor, applyEdit, setProgress } from "../foundry/builder.js";
import { canCreate, canBuild } from "../foundry/relay.js";
import { readActor } from "../foundry/reader.js";
import { planChanges, placeFeats } from "../core/edit.js";
import { newPlan, newLevel, derive, check, prereqs, takenUpTo, baseName, xpPenalty } from "../core/plan.js";
import { gestaltKey, partsOf, isGestalt } from "../core/gestalt.js";
import { variantsOf, mergeProfiles, randomPlan, randomPlanAsync, reroll, rollSpells, rollGear, rollSkills, rollFeats, mergeSpells, profileOf } from "../core/random.js";
import { loadExtras, gearValue, bookRule, armoryChoices, armoryQuote } from "../foundry/extras.js";
import { castingKind, favoriteSpells, slots, knownCounts, listFor, powersKnownAt, powerMaxAt, powerPointsAt, isSrd, specKind, specFor, addSpecials, specialLevels, domainAllowed, prohibitedCount, SCHOOLS, SCHOOL_NAMES } from "../core/spells.js";
import { gearLabel, gearPrice, wealthFor, gearTable, kitGear, wantsKit, startingGold, rollStartingGold, gearWeight, gearIssues, carryingCapacity, tradeInValue, tradeInTotal } from "../core/gear.js";
import * as R from "../core/rules.js";

const A = () => globalThis.AxecleftTools;
const fmt = (s, d) => (d ? String(s).replace(/\{(\w+)\}/g, (m, k) => (d[k] ?? m)) : String(s));
const t = (s, d) => A()?.t?.(s, d) ?? fmt(s, d);
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const H = (s, d) => esc(t(s, d));
const opt = (value, label, sel) => `<option value="${esc(value)}"${String(sel ?? "") === String(value) ? " selected" : ""}>${esc(label)}</option>`;
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const MYSTERY = "icons/svg/mystery-man.svg";
const die = (n) => Math.floor(Math.random() * n) + 1;
const DRAFT = () => `axecleft-aam2.draft.${game.world?.id ?? "world"}`;
const store = {
  get() { try { return JSON.parse(localStorage.getItem(DRAFT()) ?? "null"); } catch (e) { return null; } },
  set(p) { try { if (p) localStorage.setItem(DRAFT(), JSON.stringify(p)); else localStorage.removeItem(DRAFT()); } catch (e) { /* private mode */ } },
};
// Edit: the plan being edited and the plan as it was read, until Apply
const EDIT_KEY = () => `axecleft-aam2.edit.${game.world?.id ?? "world"}`;
const editStore = {
  get() { try { return JSON.parse(localStorage.getItem(EDIT_KEY()) ?? "null"); } catch (e) { return null; } },
  set(v) { try { if (v) localStorage.setItem(EDIT_KEY(), JSON.stringify(v)); else localStorage.removeItem(EDIT_KEY()); } catch (e) { /* private mode */ } },
};
// The characters made or edited lately (this browser): [{ uuid, name, at }], newest first
const RECENT_KEY = () => `axecleft-aam2.recent.${game.world?.id ?? "world"}`;
const recent = {
  get() { try { return JSON.parse(localStorage.getItem(RECENT_KEY()) ?? "[]") ?? []; } catch (e) { return []; } },
  add(actor) {
    if (!actor?.uuid) return;
    try { localStorage.setItem(RECENT_KEY(), JSON.stringify([{ uuid: actor.uuid, name: actor.name, at: Date.now() }, ...recent.get().filter((r) => r.uuid !== actor.uuid)].slice(0, 8))); } catch (e) { /* private mode */ }
  },
};
/** Ownership for a new actor: the player chosen as its owner (GM: Owner on Review and Random), or none. */
const ownershipFor = (userId) => (userId && game.users?.get(userId) ? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0, [userId]: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3 } : null);
const ownerOpts = (sel) => opt("", t("(GM only)"), sel) + [...(game.users ?? [])].filter((u) => !u.isGM).map((u) => opt(u.id, u.name, sel)).join("");
const RANDOM_KEY = () => `axecleft-aam2.random.${game.world?.id ?? "world"}`;
function recallRandom() { try { return JSON.parse(localStorage.getItem(RANDOM_KEY()) ?? "{}") ?? {}; } catch (e) { return {}; } }
function remember(o) { try { localStorage.setItem(RANDOM_KEY(), JSON.stringify(o)); } catch (e) { /* private mode */ } }
const setting = (k, d) => { try { return game.settings.get(MOD, k) ?? d; } catch (e) { return d; } };

const STEPS = [
  ["basics", /*t*/"Basics", "fa-id-card"],
  ["abilities", /*t*/"Abilities", "fa-dice-d20"],
  ["classes", /*t*/"Classes and levels", "fa-layer-group"],
  ["skills", /*t*/"Skills", "fa-list-check"],
  ["feats", /*t*/"Feats", "fa-star"],
  ["spells", /*t*/"Spells", "fa-wand-sparkles"],
  ["equipment", /*t*/"Equipment", "fa-shield-halved"],
  ["review", /*t*/"Review", "fa-clipboard-check"],
];
const METHODS = [["pointbuy", /*t*/"Point buy"], ["elite", /*t*/"Elite array (15, 14, 13, 12, 10, 8)"], ["nonelite", /*t*/"Nonelite array (13, 12, 11, 10, 9, 8)"], ["roll", /*t*/"Roll"], ["typed", /*t*/"Type in the scores"]];
const HP_LABELS = { max: /*t*/"Maximum", average: /*t*/"Average (rounded up)", roll: /*t*/"Roll" };
const abilityLabel = (a) => (R.ABILITY_SHORT[a] ? t(R.ABILITY_SHORT[a]) : String(a ?? "").toUpperCase());
const alignLabel = (k) => game.i18n.localize(CONFIG.D35E?.alignments?.[k] ?? k);

export class AdventurersWindow extends (globalThis.AxecleftTools?.AppV2 ?? foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "axecleft-aam2",
    classes: ["axecleft-aam2"],
    window: { title: "Adventurers and Minions", icon: "fas fa-user-plus", resizable: true },
    position: { width: 1000, height: 740 },
  };
  get title() { return t("Adventurers and Minions"); }

  page = "start";
  /** The page shown, as the tours know it (Tour of this tab). */
  get tab() { return this.page; }
  mode = "build";      // "build" (Build and Random) or "edit"
  actor = null;        // Edit: the actor
  before = null;       // Edit: the plan as read from it
  editNotes = [];
  plan = null;
  cat = null;
  skillLevel = 1;
  qualifiedOnly = true;
  ropts = recallRandom();
  classSkillsOnly = false;

  /* ---------- Rendering ---------- */

  async _renderHTML() {
    if (!this.cat) this.cat = await loadCatalog();
    return `${STYLE}<form class="aam2" autocomplete="off" onsubmit="return false">
      <nav class="aam2-steps" data-part="nav"></nav>
      <div class="aam2-body"><div class="aam2-main" data-part="main"></div><aside class="aam2-side" data-part="side"></aside></div>
      <footer class="aam2-foot" data-part="foot"></footer></form>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    this.root = content.querySelector("form.aam2");
    this.root.addEventListener("click", (ev) => this.onClick(ev));
    this.root.addEventListener("change", (ev) => this.onChange(ev));
    this.root.addEventListener("input", (ev) => this.onInput(ev));
    // Edit: an actor dropped on the window
    this.root.addEventListener("dragover", (ev) => ev.preventDefault());
    this.root.addEventListener("drop", (ev) => this.onDrop(ev));
    this.paint();
  }

  /** Redraw every part from the plan (keeping the scroll position and the field being typed in). */
  paint() {
    const f = this.root;
    if (!f) return; // (on the first render the window isn't on the page yet; that's fine)
    const main = f.querySelector('[data-part="main"]');
    const scroll = main.scrollTop;
    const act = document.activeElement && f.contains(document.activeElement) ? (document.activeElement.name || document.activeElement.dataset?.bind) : null;
    const isStart = this.page === "start" || this.page === "random" || this.page === "edit" || this.page === "prestige" || this.page === "profiles" || !this.plan;
    f.querySelector('[data-part="side"]').style.display = isStart ? "none" : "";
    if (this.plan) { this.plan.spells ??= {}; this.plan.gear ??= { items: [], loot: true }; }
    if (!isStart) { this.d = derive(this.plan, this.cat); this.issues = [...check(this.plan, this.cat, this.d), ...this.gearIssues()]; this.save(); }
    f.querySelector('[data-part="nav"]').innerHTML = isStart ? `<span hidden class="active" data-tab-btn="${this.page}"></span>` : this.navHTML(); // start pages: the page for "Tour of this tab" (Foundry v11)
    main.innerHTML = this.page === "random" ? this.randomHTML() : this.page === "edit" ? this.editPickHTML() : this.page === "prestige" ? prestigeEditorHTML(this.cat, this.prestigeSel) : this.page === "profiles" ? profileEditorHTML(this.cat, this.profileState) : isStart ? this.startHTML() : this[`${this.page}HTML`]();
    f.querySelector('[data-part="side"]').innerHTML = isStart ? "" : this.sideHTML();
    f.querySelector('[data-part="foot"]').innerHTML = this.footHTML();
    main.scrollTop = scroll;
    if (act) { const el = f.querySelector(`[name="${CSS.escape(act)}"]`) ?? f.querySelector(`[data-bind="${CSS.escape(act)}"]`); if (el) { el.focus(); try { const n = el.value?.length ?? 0; el.setSelectionRange?.(n, n); } catch (e) { /* not text */ } } }
    try { A()?.enhanceDatalists?.(f); } catch (e) { /* older tools */ }
  }
  /** Only the summary and step bar (while typing). */
  paintSide() {
    if (!this.plan || !this.root) return;
    this.d = derive(this.plan, this.cat); this.issues = [...check(this.plan, this.cat, this.d), ...this.gearIssues()]; this.save();
    this.root.querySelector('[data-part="side"]').innerHTML = this.sideHTML();
    this.root.querySelector('[data-part="nav"]').innerHTML = this.navHTML();
  }

  /** Keep the work in this browser: the character being built, or the edit (with the plan as read). */
  save() {
    if (this._tourStash) return; // a tour's sample character is never kept (the character being built stays as it was)
    if (this.mode === "edit") editStore.set(this.plan ? { plan: this.plan, before: this.before, notes: this.editNotes } : null);
    else store.set(this.plan);
  }

  /* ---------- Tours: a sample character ---------- */

  /**
   * The tours of the steps point at parts that only show once a character has levels (the skill levels, the feat slots,
   * the spell lists). When the character being built has no levels, a tour shows a sample instead: a 4th-level human
   * ranger 3 / rogue 1, or a cleric 2 / wizard 2 for the Spells tour (domains and a specialist school). The character being built
   * (or the start page) comes back when the tour ends; the sample is never saved.
   */
  async tourSample(page) {
    if (this.mode === "edit" && this.plan && !this._tourStash) return; // an actor being edited shows itself
    if (!this._tourStash && this.plan?.levels?.length) return;         // the character being built has levels
    const kind = page === "spells" ? "caster" : "martial";
    if (this._tourStash && this._tourKind === kind) return;
    this.cat ??= await loadCatalog();
    const find = (map, name) => [...(map?.values?.() ?? [])].find((x) => baseName(x.en).toLowerCase() === name)?.uuid ?? "";
    const classes = kind === "caster"
      ? [{ cls: find(this.cat.classes, "cleric"), levels: 2 }, { cls: find(this.cat.classes, "wizard"), levels: 2 }]
      : [{ cls: find(this.cat.classes, "ranger"), levels: 3 }, { cls: find(this.cat.classes, "rogue"), levels: 1 }].filter((x) => x.cls);
    // A ranger 3 / rogue 1 shows the combat style, builds, class feature variants, the favored class line and a granted feat
    if (kind === "martial" && classes.length < 2) classes.splice(0, classes.length, { cls: find(this.cat.classes, "fighter"), levels: 4 });
    const data = await this.data();
    this._tourStash ??= { plan: this.plan, mode: this.mode, page: this.page, skillLevel: this.skillLevel, actor: this.actor, before: this.before };
    this._tourKind = kind;
    this.mode = "build";
    this.plan = randomPlan({ kind: "character", race: find(this.cat.races, "human"), classes, level: 4, method: "elite", hpMethod: "average" }, this.cat, data, Math.random);
    this.plan.name = t("Tour sample");
    this.plan._spellsFilled = this.plan._equipmentFilled = true;
    this.skillLevel = 1;
  }
  /** The tour is over: back to the character being built (or the start page). */
  endTourSample({ paint = true } = {}) {
    const s = this._tourStash;
    if (!s) return;
    this._tourStash = null; this._tourKind = null;
    Object.assign(this, { plan: s.plan, mode: s.mode, page: s.page, skillLevel: s.skillLevel, actor: s.actor, before: s.before });
    if (paint && this.root?.isConnected) this.paint();
  }

  go(page) {
    this.page = page;
    // The first visit to Spells or Equipment fills them in (Choose for me / Standard gear), as Random does
    if (this.plan && (page === "spells" || page === "equipment") && !this.plan[`_${page}Filled`]) {
      this.plan[`_${page}Filled`] = true;
      const empty = page === "spells" ? !Object.values(this.plan.spells ?? {}).some((l) => l?.length) : !(this.plan.gear?.items?.length);
      if (empty) this.data().then((data) => { if (page === "spells") rollSpells(this.plan, this.cat, data, Math.random); else rollGear(this.plan, this.cat, data, { kit: this.mode !== "edit" }); this.paint(); });
    }
    this.paint();
    this.root?.querySelector('[data-part="main"]')?.scrollTo?.(0, 0);
  }

  /* ---------- Events ---------- */

  onClick(ev) {
    const el = ev.target.closest("[data-act], [data-step]");
    if (!el || el.disabled) return;
    if (el.dataset.step) return this.go(el.dataset.step);
    const fn = this.acts[el.dataset.act];
    if (fn) { ev.preventDefault(); fn.call(this, el, ev); }
  }
  onChange(ev) {
    const el = ev.target;
    if (el.dataset.ropt) {
      // Keep the page as it is (redrawing would swallow a click on Generate made while this field was being left)
      this.ropts[el.dataset.ropt] = el.type === "checkbox" ? el.checked : el.value; remember(this.ropts);
      if (el.dataset.ropt === "cls1" || el.dataset.ropt === "cls2") this.paint(); // its builds
      return;
    }
    if (el.dataset.bind) { this.bind(el); return this.paint(); }
    const fn = el.dataset.on && this.onChanges[el.dataset.on];
    if (fn) { fn.call(this, el, ev); this.paint(); }
  }
  onInput(ev) {
    const el = ev.target;
    if (el.dataset.bind && el.dataset.live !== undefined) { this.bind(el); this.paintSide(); }
  }
  /** data-bind="path" (into the plan), data-type="number" | "bool". */
  bind(el) {
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.type === "number") v = Number(v) || 0;
    foundry.utils.setProperty(this.plan, el.dataset.bind, v);
  }

  acts = {
    build() { this.mode = "build"; this.plan = newPlan({ abilityMethod: setting("abilityMethod", "pointbuy"), budget: setting("pointBudget", 25), hpMethod: setting("hpMethod", "average") }); this.skillLevel = 1; this.go("basics"); },
    resume() { this.mode = "build"; this.plan = store.get(); if (this.plan) this.go(this.plan._page ?? "basics"); },
    randomPage() { if (this.mode === "edit") { this.mode = "build"; this.plan = null; } this.page = "random"; this.paint(); },
    // Edit
    editPage() { this.page = "edit"; this.paint(); },
    openSheet: async (el) => { try { (await fromUuid(el.dataset.uuid))?.sheet?.render(true); } catch (e) { /* gone */ } },
    prestigePage() { if (game.user?.isGM) { this.page = "prestige"; this.paint(); } },
    ...prestigeActions(this),
    profilesPage() { if (game.user?.isGM) { this.page = "profiles"; this.paint(); } },
    ...profileActions(this),
    editOpen: async (el) => {
      const uuid = el.dataset.uuid || this.root.querySelector('[name="edit.actor"]')?.value;
      if (!uuid) return ui.notifications.warn(t("Choose an actor to edit."));
      await this.openEdit(uuid);
    },
    resumeEdit: async () => {
      const saved = editStore.get(); if (!saved?.plan) return;
      const actor = await this.findActor(saved.plan._edit?.actorUuid ?? saved.plan._edit?.actorId);
      if (!actor) { editStore.set(null); this.paint(); return ui.notifications.warn(t("That actor isn't in the world any more.")); }
      this.mode = "edit"; this.actor = actor; this.plan = saved.plan; this.before = saved.before; this.editNotes = saved.notes ?? [];
      this.go(this.plan._page ?? "review");
    },
    dropEdit() { editStore.set(null); this.paint(); },
    fillMissing: async () => this.working(t("Filling in what's missing…"), async () => { await this.fillMissing(); this.paint(); }),
    apply: async (el) => this.apply(el),
    generate: async () => this.working(t("Loading races, classes, spells and items…"), async (set) => {
      this.mode = "build";
      const o = this.randomOptions();
      const data = await this.data();
      const plan = await randomPlanAsync(o, this.cat, data, Math.random, (part) => this.randomStep(set, part));
      set(t("Showing the character…"));
      await new Promise((r) => setTimeout(r, 0));
      this.plan = plan;
      this.plan._spellsFilled = this.plan._equipmentFilled = true;
      this.skillLevel = 1;
      if (plan._prestige?.none) ui.notifications.info(t("No prestige class's requirements were met at any level: the character has none."));
      this.go("review");
    }),
    generateMany: async (el) => {
      const o = this.randomOptions();
      const n = Math.max(1, Math.min(50, Number(this.ropts.count) || 1));
      const folder = this.ropts.folder || null;
      el.disabled = true;
      let made = 0, failed = 0;
      await this.working(t("Loading races, classes, spells and items…"), async (set) => {
        const data = await this.data();
        for (let i = 0; i < n; i++) {
          // "Character 3 of 10: Choosing feats…" (and the actor's own steps while it is made)
          const of = (text) => set(t("Character {i} of {n}: {step}", { i: i + 1, n, step: text }));
          try {
            const plan = await randomPlanAsync(o, this.cat, data, Math.random, (part) => this.randomStep(of, part));
            setProgress(of);
            recent.add(await createActor(plan, this.cat, { folder, ownership: game.user?.isGM ? ownershipFor(this.ropts.owner) : null }));
            made++;
          } catch (err) { failed++; console.error(`${MOD} | generate ${i + 1} of ${n}`, err); ui.notifications.error(t("Couldn't create the actor: {error}", { error: err.message })); }
          finally { setProgress(set); }
        }
      });
      ui.notifications.info(t("{n} characters created.", { n: made }) + (failed ? ` ${t("{n} failed (see the console, F12).", { n: failed })}` : ""));
      el.disabled = false;
    },
    reroll: async (el) => this.working(t("Rolling again…"), async (set) => {
      const part = el.dataset.part, data = await this.data();
      if (part === "all") {
        const plan = await randomPlanAsync(this.plan._random ?? {}, this.cat, data, Math.random, (p) => this.randomStep(set, p));
        this.plan = { ...plan, _spellsFilled: true, _equipmentFilled: true };
      } else reroll(this.plan, part, this.cat, data, Math.random);
      this.paint();
    }),
    // Spells
    fillSpells: async () => this.working(t("Choosing spells…"), async () => { const data = await this.data(); if (this.mode === "edit") mergeSpells(this.plan, this.cat, data, Math.random); else rollSpells(this.plan, this.cat, data, Math.random); this.paint(); }),
    clearSpells(el) { this.plan.spells[el.dataset.cls] = []; this.paint(); },
    removeSpell(el) { const l = this.plan.spells[el.dataset.cls] ?? []; l.splice(Number(el.dataset.i), 1); this.paint(); },
    addSpell(el) {
      const cls = el.dataset.cls, sl = Number(el.dataset.sl), input = this.root.querySelector(`[name="addsp.${cls}.${sl}"]`), name = input?.value?.trim();
      const c = this.cat.classes.get(cls), idx = this.cat.extrasData?.spellIndex ?? [];
      const s = listFor(idx, c, sl).find((x) => x.name.toLowerCase() === String(name).toLowerCase());
      if (!s) return ui.notifications.warn(t("No level {level} spell called {name} for {cls}.", { level: sl, name, cls: c?.name }));
      (this.plan.spells[cls] ??= []).push({ uuid: s.uuid, name: s.name, level: sl, prepared: ["known", "powers"].includes(castingKind(c)) ? 0 : 1 });
      this.paint();
    },
    // Equipment
    fillGear: async () => this.working(t("Choosing equipment…"), async () => { rollGear(this.plan, this.cat, await this.data()); this.paint(); }),
    rollStartGold() { const s = startingGold(this.plan, this.cat, this.cat.extrasData?.gear); if (s) this.plan.gear.startGold = rollStartingGold(s); },
    averageStartGold() { delete this.plan.gear.startGold; },
    clearGear() { this.plan.gear.items = []; this.paint(); },
    removeGear(el) { this.plan.gear.items.splice(Number(el.dataset.i), 1); this.paint(); },
    addGear: async (el) => {
      const f = this.root, val = (n) => f.querySelector(`[name="ag.${n}"]`)?.value ?? "";
      const kind = val("kind"), base = val("base").trim();
      const arms = kind === "weapon" || kind === "armor" || kind === "shield";
      const bonus = arms || kind === "ammo" ? Math.max(0, Math.min(5, Number(val("bonus")) || 0)) : 0;
      const material = arms || kind === "ammo" ? val("material").trim() : "";
      const abilities = arms || kind === "ammo" ? val("abilities").split(",").map((x) => x.trim()).filter(Boolean) : [];
      const masterwork = arms ? !!f.querySelector('[name="ag.mw"]')?.checked || bonus > 0 : false;
      const qty = Math.max(1, Math.round(Number(val("qty")) || (kind === "ammo" ? 20 : 1)));
      if (!base) return ui.notifications.warn(t("Type the item's name."));
      if (!this.gearRef({ base })) ui.notifications.warn(t("{name} isn't in your compendiums under that name; it will be skipped.", { name: base }));
      const g = { kind, base, masterwork, bonus, qty, ...(material ? { material } : {}), ...(abilities.length ? { abilities } : {}) };
      // Special materials and abilities: the Armory checks and prices them (an ability that can't go on that weapon is refused)
      if (material || abilities.length) {
        if (el) el.disabled = true;
        try { Object.assign(g, await armoryQuote(g, this.sizeOf())); }
        catch (err) { if (el) el.disabled = false; return ui.notifications.error(err.message); }
        for (const w of g.warnings ?? []) ui.notifications.warn(w);
        delete g.warnings;
      }
      this.plan.gear.items.push(g);
      this.paint();
    },
    reload: async () => { this.cat = await loadCatalog({ force: true }); ui.notifications.info(t("Races, classes and feats loaded again.")); this.paint(); },
    restart() { this.page = "start"; this.paint(); },
    leaveEdit() { this.mode = "build"; this.plan = null; this.actor = null; this.before = null; this.page = "start"; this.paint(); },
    back() { const i = STEPS.findIndex(([k]) => k === this.page); if (i > 0) this.go(STEPS[i - 1][0]); },
    next() { const i = STEPS.findIndex(([k]) => k === this.page); if (i < STEPS.length - 1) this.go(STEPS[i + 1][0]); },
    goto(el) { this.go(el.dataset.to); if (el.dataset.level) { this.skillLevel = Number(el.dataset.level); this.paint(); } },
    create: async (el) => this.create(el),
    // Images
    pickImg(el) {
      const FP = foundry.applications?.apps?.FilePicker?.implementation ?? (typeof FilePicker !== "undefined" ? FilePicker : globalThis.FilePicker);
      new FP({ type: "image", current: this.plan[el.dataset.field] || "", callback: (path) => { this.plan[el.dataset.field] = path; this.paint(); } }).render(true);
    },
    // Abilities
    pbStep(el) { const a = el.dataset.a; this.plan.abilities.base[a] = R.clampPoint((this.plan.abilities.base[a] ?? 8) + Number(el.dataset.d)); this.paint(); },
    budget(el) { this.plan.abilities.budget = Number(el.dataset.n); this.paint(); },
    rollScores() { const dice = this.plan.abilities.dice ?? "4d6"; this.plan.abilities.pool = R.ABILITIES.map(() => R.rollScore(dice, die)); this.plan.abilities.pick = {}; this.syncPool(); this.paint(); },
    placeByClass() { this.placeByClass(); this.paint(); },
    // Levels
    addLevels(el) {
      const f = this.root, n = Math.max(1, Math.min(40, Number(f.querySelector('[name="add.n"]').value) || 1));
      const a = f.querySelector('[name="add.cls"]').value, b = this.plan.gestalt ? f.querySelector('[name="add.cls2"]')?.value : "";
      if (!a) return ui.notifications.warn(t("Choose a class to add."));
      const cls = gestaltKey(a, b);
      for (let i = 0; i < n; i++) { const lv = newLevel(cls); this.plan.levels.push(lv); lv.hp = this.hpRoll(cls, this.plan.levels.length); }
      this.paint();
    },
    removeLevel(el) { this.plan.levels.splice(Number(el.dataset.i), 1); this.skillLevel = Math.min(this.skillLevel, Math.max(1, this.plan.levels.length)); this.paint(); },
    rollHp(el) { const i = Number(el.dataset.i), lv = this.plan.levels[i]; lv.hp = this.hpRoll(lv.cls, i + 1, "roll"); this.paint(); },
    allHp(el) { this.plan.levels.forEach((lv, i) => { lv.hp = this.hpRoll(lv.cls, i + 1, el.dataset.how); }); this.paint(); },
    // Skills
    skLevel(el) { this.skillLevel = Number(el.dataset.l); this.paint(); },
    skStep(el) {
      const lv = this.plan.levels[this.skillLevel - 1]; if (!lv) return;
      const k = el.dataset.k; lv.skills[k] = Math.max(0, (Number(lv.skills[k]) || 0) + Number(el.dataset.d));
      if (!lv.skills[k]) delete lv.skills[k];
      this.paint();
    },
    skCopy() {
      const L = this.skillLevel; if (L < 2) return;
      const prev = this.plan.levels[L - 2], lv = this.plan.levels[L - 1];
      lv.skills = {};
      let left = this.d.perLevel[L - 1].skillPoints.gain;
      // Same skills as the level before, one point each round while points last
      const keys = Object.keys(prev.skills).filter((k) => prev.skills[k] > 0);
      while (left > 0 && keys.length) {
        let spent = false;
        for (const k of keys) {
          if (left <= 0) break;
          const after = (this.d.perLevel[L - 2]?.ranks?.[k] ?? 0) + ((lv.skills[k] ?? 0) + 1) * (this.isClassSkill(lv.cls, k) ? 1 : 0.5);
          if (after > (this.anyClassSkillAt(L, k) ? R.maxRanks(L, true) : R.maxRanks(L, false))) continue;
          lv.skills[k] = (lv.skills[k] ?? 0) + 1; left--; spent = true;
        }
        if (!spent) break;
      }
      this.paint();
    },
    skClear() { const lv = this.plan.levels[this.skillLevel - 1]; if (lv) lv.skills = {}; this.paint(); },
    skMax() {
      // Spend what's left of this level on the skills already bought, up to their maximum
      const L = this.skillLevel, lv = this.plan.levels[L - 1]; if (!lv) return;
      let left = this.d.perLevel[L - 1].skillPoints.left;
      const keys = Object.keys(lv.skills).length ? Object.keys(lv.skills) : Object.keys(this.d.perLevel[L - 2]?.ranks ?? {});
      while (left > 0) {
        let spent = false;
        for (const k of keys) {
          if (left <= 0) break;
          const before = this.d.perLevel[L - 2]?.ranks?.[k] ?? 0;
          const after = before + ((lv.skills[k] ?? 0) + 1) * (this.isClassSkill(lv.cls, k) ? 1 : 0.5);
          if (after > (this.anyClassSkillAt(L, k) ? R.maxRanks(L, true) : R.maxRanks(L, false))) continue;
          lv.skills[k] = (lv.skills[k] ?? 0) + 1; left--; spent = true;
        }
        if (!spent) break;
      }
      this.paint();
    },
    addSub(el) {
      const parent = el.dataset.parent, input = this.root.querySelector(`[name="sub.${parent}"]`), name = input?.value?.trim();
      if (!name) return ui.notifications.warn(t("Type what it is (for example Weaponsmithing)."));
      let n = 1; while (this.plan.subSkills.some((s) => s.tag === `${parent}${n}`)) n++;
      this.plan.subSkills.push({ tag: `${parent}${n}`, parent, name });
      this.paint();
    },
    removeSub(el) {
      const tag = el.dataset.tag;
      this.plan.subSkills = this.plan.subSkills.filter((s) => s.tag !== tag);
      for (const lv of this.plan.levels) delete lv.skills[tag];
      this.paint();
    },
    // Feats
    openFeature: async (el) => { try { (await fromUuid(el.dataset.uuid))?.sheet?.render(true); } catch (e) { /* gone */ } },
    clearFeat(el) { const lv = this.plan.levels[Number(el.dataset.l) - 1]; lv.feats = lv.feats.filter((f) => f.slot !== el.dataset.slot); this.paint(); },
  };

  onChanges = {
    prestigeCls(el) { this.prestigeSel = el.value; },
    profileCls(el) { this.profileState = { cls: el.value }; },
    profileBuild(el) { this.profileState = { ...(this.profileState ?? {}), cls: this.profileState?.cls ?? this.root.querySelector('[data-on="profileCls"]')?.value, build: el.value }; },
    featureOpt(el) {
      const u = el.dataset.cls, k = el.dataset.key, opts = featureOptionsFor(this.cat.classes.get(u), this.cat);
      let list = (this.plan.featureOptions ??= {})[u] ?? [];
      list = list.filter((x) => x !== k);
      if (el.checked) { const ex = opts[k]?.exclusive; if (ex) list = list.filter((x) => opts[x]?.exclusive !== ex); list.push(k); }
      if (list.length) this.plan.featureOptions[u] = list; else delete this.plan.featureOptions[u];
    },
    planVariant(el) { (this.plan.variants ??= {})[el.dataset.cls] = el.value; if (!el.value) delete this.plan.variants[el.dataset.cls]; },
    method(el) {
      const ab = this.plan.abilities; ab.method = el.value;
      if (ab.method === "pointbuy") { for (const a of R.ABILITIES) ab.base[a] = R.clampPoint(ab.base[a]); }
      else if (ab.method === "elite" || ab.method === "nonelite") { ab.pool = R.ARRAYS[ab.method].slice(); ab.pick = {}; this.placeByClass(); }
      else if (ab.method === "roll") { ab.pool = null; ab.pick = {}; }
    },
    pbScore(el) { this.plan.abilities.base[el.dataset.a] = R.clampPoint(el.value); },
    typed(el) { this.plan.abilities.base[el.dataset.a] = Math.max(1, Math.min(99, Math.round(Number(el.value) || 10))); },
    pick(el) {
      const ab = this.plan.abilities; ab.pick ??= {};
      const a = el.dataset.a, v = el.value;
      // Taking a score another ability had: swap them
      const other = Object.keys(ab.pick).find((k) => k !== a && String(ab.pick[k]) === v && v !== "");
      if (other) ab.pick[other] = ab.pick[a] ?? "";
      ab.pick[a] = v;
      this.syncPool();
    },
    rolled(el) { const s = R.ABILITIES.map((_, i) => Number(this.root.querySelector(`[name="pool.${i}"]`)?.value) || 0); this.plan.abilities.pool = s; this.syncPool(); },
    increase(el) { const lv = this.plan.levels[Number(el.dataset.l) - 1]; if (lv) lv.increase = el.value || null; },
    race(el) {
      this.plan.race = el.value || null;
      // Drop bonus languages the new race can't take
      const ext = this.cat.races.get(this.plan.race)?.ext;
      if (ext && Array.isArray(ext.bonusLanguages)) this.plan.languages = this.plan.languages.filter((l) => ext.bonusLanguages.includes(l));
    },
    lang(el) { const set = new Set(this.plan.languages); if (el.checked) set.add(el.value); else set.delete(el.value); this.plan.languages = [...set]; },
    levelCls(el) {
      const lv = this.plan.levels[Number(el.dataset.i)];
      if (el.dataset.side != null) { const parts = partsOf(lv.cls); parts[Number(el.dataset.side)] = el.value || null; lv.cls = parts[0] ? gestaltKey(parts[0], parts[1]) : parts[1] || null; } // gestalt: one of the two classes
      else lv.cls = el.value || null;
      lv.hp = Math.min(lv.hp || 1, this.cat.classes.get(lv.cls)?.hd ?? lv.hp); },
    // Gestalt (two classes at every level): off keeps each level's first class
    gestalt(el) {
      this.plan.gestalt = el.checked;
      if (!el.checked) for (const lv of this.plan.levels) if (isGestalt(lv.cls)) lv.cls = partsOf(lv.cls)[0];
    },
    levelHp(el) { this.plan.levels[Number(el.dataset.i)].hp = Math.max(0, Math.round(Number(el.value) || 0)); },
    skPoints(el) {
      const lv = this.plan.levels[this.skillLevel - 1]; if (!lv) return;
      const n = Math.max(0, Math.round(Number(el.value) || 0)); if (n) lv.skills[el.dataset.k] = n; else delete lv.skills[el.dataset.k];
    },
    feat(el) {
      const L = Number(el.dataset.l), slot = el.dataset.slot, lv = this.plan.levels[L - 1];
      const name = el.value.trim();
      lv.feats = lv.feats.filter((f) => f.slot !== slot);
      if (!name) return;
      const pool = [...(this.cat.list.specials ?? []), ...this.cat.list.feats];
      const feat = pool.find((f) => f.label === name) ?? pool.find((f) => f.name.toLowerCase() === name.toLowerCase());
      if (!feat) return ui.notifications.warn(t("No feat called {name}.", { name }));
      lv.feats.push({ slot, uuid: feat.uuid, choice: null });
    },
    spPrepared(el) { const l = this.plan.spells[el.dataset.cls] ?? []; const s = l[Number(el.dataset.i)]; if (s) s.prepared = Math.max(0, Math.round(Number(el.value) || 0)); },
    // Domains and specialist schools (1.14.0.8)
    setDomain(el) {
      const sp = (this.plan.specs ??= {})[el.dataset.cls] ??= { domains: [] };
      const list = [...(sp.domains ?? [])];
      list[Number(el.dataset.i)] = el.value || null;
      sp.domains = list.filter(Boolean).filter((u, i, a) => a.indexOf(u) === i);
      this.refreshSpecs(el.dataset.cls);
    },
    setSchool(el) {
      const sp = (this.plan.specs ??= {})[el.dataset.cls] ??= {};
      sp.school = el.value || null;
      const key = this.cat.specs?.get(sp.school)?.key;
      sp.prohibited = sp.school && !this.cat.specs?.get(sp.school)?.arcane ? (sp.prohibited ?? []).filter((k) => k !== key) : [];
      this.refreshSpecs(el.dataset.cls);
    },
    prohibit(el) {
      const sp = (this.plan.specs ??= {})[el.dataset.cls] ??= {};
      const set = new Set(sp.prohibited ?? []);
      if (el.checked) set.add(el.value); else set.delete(el.value);
      sp.prohibited = [...set];
      this.refreshSpecs(el.dataset.cls);
    },
    setSpecial(el) {
      const l = this.plan.spells[el.dataset.cls] ?? [], s = l[Number(el.dataset.i)];
      if (!s) return;
      for (const x of l) if (x.level === s.level) x.special = false;
      s.special = true;
    },
    loot(el) { this.plan.gear.loot = el.checked; },
    actorItem(el) {
      // Edit: Keep / Unequip / Sell for one of the actor's items (name and trade-in kept for Review's list of changes)
      const ops = (this.plan.gear.actor ??= {}), id = el.dataset.id;
      const actor = this.actor?.id ? (game.actors?.get?.(this.actor.id) ?? this.actor) : this.actor, it = actor?.items?.get?.(id);
      if (el.value === "keep" || !it) delete ops[id];
      else ops[id] = { act: el.value === "sell" && this.canSell() ? "sell" : "unequip", name: it.name, gp: tradeInValue(it, this.tradeInPct()) };
    },
    gearQty(el) { const g = this.plan.gear.items[Number(el.dataset.i)]; if (g) g.qty = Math.max(1, Math.round(Number(el.value) || 1)); },
    kit(el) {
      // The adventuring kit on or off: its items are added or taken off the list
      const g = this.plan.gear;
      g.kit = el.checked;
      g.items = (g.items ?? []).filter((x) => !x.kit);
      if (el.checked && this.cat.extrasData) g.items.push(...kitGear(this.plan, this.cat, this.cat.extrasData.gear, this.d));
    },
    featChoice(el) {
      const L = Number(el.dataset.l), lv = this.plan.levels[L - 1], f = lv.feats.find((x) => x.slot === el.dataset.slot);
      if (!f) return;
      const label = el.selectedOptions?.[0]?.textContent ?? el.value;
      f.choice = el.value ? { value: el.value, label } : null;
    },
    // Skill Mastery: its skills, one select each (choice: { value: "hid,mos", label: "Hide, Move Silently" })
    featSkills(el) {
      const L = Number(el.dataset.l), lv = this.plan.levels[L - 1], f = lv.feats.find((x) => x.slot === el.dataset.slot);
      if (!f) return;
      const keys = String(f.choice?.value ?? "").split(",").filter(Boolean);
      keys[Number(el.dataset.k)] = el.value;
      const list = [...new Set(keys.filter(Boolean))];
      f.choice = list.length ? { value: list.join(","), label: list.map((k) => this.cat.skills.find((x) => x.key === k)?.label ?? k).join(", ") } : null;
    },
    qualified(el) { this.qualifiedOnly = el.checked; },
    classOnly(el) { this.classSkillsOnly = el.checked; },
  };

  /* ---------- Helpers ---------- */

  /** Profiles, names, and the spell list and item prices (loaded once). */
  async data() {
    const extras = await loadExtras(this.cat);
    this.cat.extrasData = extras;
    return { ...this.profileData(), extras, settings: { nonSrdSpells: Number(setting("nonSrdSpells", 1)) || 0 } };
  }
  /** The profiles (with the GM's own builds) and the builds the character's classes follow. */
  profileData() {
    return { ...this.cat.data, profiles: mergeProfiles(this.cat.data?.profiles, setting("profiles", {})), variants: this.plan?.variants ?? {} };
  }
  /** Spells and gear steps: load the spell list and prices the first time, then draw again. */
  /**
   * The working overlay (the look of Shared Data's "Working…" label): shown over the window while fn runs, with what is
   * being done and the seconds so far; clicks wait. fn(set) can change the text; building an actor reports its steps.
   */
  async working(label, fn) {
    const root = this.root;
    if (!root) return fn(() => {});
    this._busy = (this._busy ?? 0) + 1;
    let el = root.querySelector(":scope > .aam2-busy");
    if (!el) {
      el = document.createElement("div");
      el.className = "aam2-busy";
      el.innerHTML = `<div class="pill"><i class="fa-solid fa-rotate fa-spin"></i><span class="lbl"></span><span class="secs"></span></div>`;
      root.appendChild(el);
    }
    const lbl = el.querySelector(".lbl"), secs = el.querySelector(".secs"), started = Date.now();
    const set = (text) => { if (text && lbl) lbl.textContent = text; };
    set(label);
    secs.textContent = "";
    const tick = setInterval(() => { secs.textContent = t("{n} s", { n: Math.floor((Date.now() - started) / 1000) }); }, 1000);
    setProgress(set);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // drawn before the work starts
    try { return await fn(set); }
    finally {
      clearInterval(tick);
      this._busy -= 1;
      if (!this._busy) { setProgress(null); el.remove(); }
    }
  }
  /** Progress text for the parts of a random character. */
  async randomStep(set, part) {
    const text = { classes: /*t*/"Choosing race and classes…", abilities: /*t*/"Rolling ability scores and hit points…", skills: /*t*/"Choosing skills…", feats: /*t*/"Choosing feats…", spells: /*t*/"Choosing spells…", gear: /*t*/"Choosing equipment…" }[part];
    if (text) set(t(text));
    await new Promise((r) => setTimeout(r, 0)); // the browser draws it
  }

  /** Edit: whether this user may sell the actor's items for the new gear (a GM, or players when the world allows it). */
  canSell() { return !!game.user?.isGM || !!setting("playerTradeIn", false); }
  /** Edit: the trade-in % (world setting; SRD half). */
  tradeInPct() { const n = Number(setting("tradeInPct", 50)); return Number.isFinite(n) ? n : 50; }
  /**
   * Edit: the actor's own gear, each with Keep (the default), Unequip (into the pack, frees its place for new gear) or
   * Sell (leaves the actor; its trade-in value adds to the wealth the new levels bring). Sell for a GM, or for players
   * when the world allows it. The copy made before an edit keeps everything.
   */
  actorGearHTML() {
    const actor = this.actor?.id ? (game.actors?.get?.(this.actor.id) ?? this.actor) : this.actor;
    const ops = (this.plan.gear.actor ??= {});
    const items = [...(actor?.items ?? [])].filter((i) => ["weapon", "equipment", "consumable", "loot", "valuable"].includes(i.type));
    if (!items.length) return `<p class="hint">${H("Gear listed here is added to the actor.")}</p>`;
    const sell = this.canSell(), pct = this.tradeInPct();
    const worn = (i) => !!i.system?.equipped;
    const row = (i) => {
      const op = ops[i.id]?.act ?? "keep", gp = tradeInValue(i, pct), qty = Number(i.system?.quantity ?? 1) || 1;
      const choices = [["keep", /*t*/"Keep"], ...(worn(i) ? [["unequip", /*t*/"Unequip"]] : []), ...(sell ? [["sell", /*t*/"Sell"]] : [])];
      return `<tr class="${op === "keep" ? "" : "dim"}"><td>${esc(i.name)}${qty > 1 ? ` ×${qty}` : ""}${worn(i) ? ` <small class="muted">${H("equipped")}</small>` : ""}</td>
        <td class="n">${sell ? `${gp.toLocaleString()} gp` : ""}</td>
        <td class="n"><select data-on="actorItem" data-id="${i.id}">${choices.map(([k, l]) => opt(k, t(l), op)).join("")}</select></td></tr>`;
    };
    const on = items.filter(worn), rest = items.filter((i) => !worn(i));
    const head = `<tr><th>${H("Item")}</th><th class="n">${sell ? H("Trade-in ({pct}%)", { pct }) : ""}</th><th class="n"></th></tr>`;
    return `<fieldset><legend>${H("On the actor")}</legend>
      <p class="hint">${H(sell ? "Keep, unequip (into the pack, so new gear can take its place) or sell each item: sold items leave the actor and their trade-in value adds to the wealth the new levels bring. The copy made first keeps everything." : "Keep or unequip each item (into the pack, so new gear can take its place). Only the GM can sell items for new gear.")}</p>
      <table class="aam2-t">${head}${on.map(row).join("")}</table>
      ${rest.length ? `<details><summary>${H("Carried ({n})", { n: rest.length })}</summary><table class="aam2-t">${head}${rest.map(row).join("")}</table></details>` : ""}
      <p class="hint">${H("Gear listed below is added to the actor.")}</p></fieldset>`;
  }

  /** The character's size (D35E key) from its race, for Small gear and carrying capacity. */
  sizeOf() { return this.d?.race?.ext?.size ?? this.cat.races?.get?.(this.plan?.race)?.ext?.size ?? "med"; }
  /** The compendium item a gear entry is made from ({ price, weight, slot }), or null. */
  gearRef(g) { return this.cat.extrasData?.items?.get(String(g?.base ?? "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim()) ?? null; }
  /** Equipment warnings (load, worn slots): only once item weights and slots are loaded; never for an edit (the actor has more). */
  gearIssues() {
    if (!this.plan || !this.cat.extrasData || this.mode === "edit") return [];
    let out = [];
    try { out = gearIssues(this.plan, this.d, (g) => this.gearRef(g), this.sizeOf()); } catch (e) { out = []; }
    // A combat style (ranger) works only in light or no armor
    try {
      const styled = (this.d.parts ?? []).filter(({ cls, levels }) => cls && !cls.gestalt && levels >= 2 && chosenFeatures(this.plan, cls, this.cat).some((c) => c.grants?.length));
      const heavy = (this.plan.gear?.items ?? []).find((g) => g.kind === "armor" && /^(medium|heavy)armor$/i.test(String(this.gearRef(g)?.info?.equipmentSubtype ?? "")));
      if (styled.length && heavy) out.push({ step: "equipment", code: "styleArmor", data: { cls: styled[0].cls.name, armor: gearLabel(heavy) }, severity: "warn" });
    } catch (e) { /* no gear data */ }
    return out;
  }

  needExtras() {
    if (this.cat.extrasData) return false;
    if (!this._loadingExtras) this._loadingExtras = Promise.all([this.data(), armoryChoices().then((c) => { this.armory = c; }).catch(() => { this.armory = null; })]).then(() => { this._loadingExtras = null; this.paint(); });
    return true;
  }

  hpRoll(clsUuid, level, how = null) {
    const c = this.cat.classes.get(clsUuid); if (!c) return 0;
    const method = how ?? this.plan.hp?.method ?? "average";
    return R.hpFor(c.hd, { method, first: level === 1, maxFirst: how ? false : this.plan.hp?.maxFirst !== false, die });
  }
  /** Arrays and rolls: the scores picked from the pool become the base scores. */
  syncPool() {
    const ab = this.plan.abilities;
    for (const a of R.ABILITIES) { const i = ab.pick?.[a]; ab.base[a] = i !== undefined && i !== "" && ab.pool?.[i] != null ? ab.pool[i] : 0; }
  }
  /** The pool's highest scores on the first class's abilities, in its order. */
  placeByClass() {
    const ab = this.plan.abilities;
    const order = this.cat.classes.get(this.plan.levels[0]?.cls)?.ext?.abilities ?? ["str", "dex", "con", "int", "wis", "cha"];
    if (ab.method === "pointbuy" || ab.method === "typed") return;
    if (!ab.pool) return;
    const idx = ab.pool.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).map(([, i]) => i);
    ab.pick = {};
    order.forEach((a, n) => { ab.pick[a] = String(idx[n]); });
    this.syncPool();
  }
  isClassSkill(clsUuid, key) {
    const c = this.cat.classes.get(clsUuid); if (!c) return false;
    const sub = this.plan.subSkills.find((s) => s.tag === key);
    return !!classSkillsFor(this.plan, c, this.cat)?.[sub ? sub.parent : key];
  }
  anyClassSkillAt(level, key) { return this.d.perLevel[level - 1]?.anyClassSkill?.(key) ?? false; }
  /** Start page: the characters made or edited lately (still in the world), to edit again or open. */
  recentHTML() {
    const list = recent.get().map((r) => { let a = null; try { a = fromUuidSync(r.uuid); } catch (e) { /* gone */ } return a?.documentName === "Actor" && a.isOwner ? { ...r, a } : null; }).filter(Boolean);
    if (!list.length) return "";
    return `<h3>${H("Recent")}</h3><table class="aam2-t">${list.map(({ uuid, a }) => `<tr><td>${esc(a.name)} <span class="hint">${esc([...a.items].filter((i) => i.type === "class").map((i) => `${i.name} ${i.system?.levels ?? ""}`).join(" / "))}</span></td>
      <td class="n"><button type="button" data-act="editOpen" data-uuid="${esc(uuid)}"><i class="fas fa-user-pen"></i> ${H("Edit")}</button> <button type="button" data-act="openSheet" data-uuid="${esc(uuid)}"><i class="fas fa-id-card"></i> ${H("Sheet")}</button></td></tr>`).join("")}</table>`;
  }
  /** Classes page: the build each class follows (its feats, skills and gear when A&M chooses them), for classes with several. */
  buildsLine() {
    const pd = this.profileData();
    const rows = (this.d.classes ?? []).flatMap((c) => (c.cls?.gestalt ?? [c.cls])).filter(Boolean)
      .filter((c, i, a) => a.findIndex((x) => x.uuid === c.uuid) === i)
      .map((c) => ({ c, list: variantsOf(c, pd) })).filter((x) => x.list.length);
    if (!rows.length) return "";
    return `<div class="row" style="margin-top:4px"><b>${H("Builds")}</b>${rows.map(({ c, list }) => `<label>${esc(c.name)} <select data-on="planVariant" data-cls="${esc(c.uuid)}">${list.map((v) => opt(v.key, t(v.label), this.plan.variants?.[c.uuid] ?? "")).join("")}</select></label>`).join("")}
      <span class="hint" style="flex:1">${H("What A&M follows when it chooses for you: feats, skills, spells and gear.")}</span></div>`;
  }
  /** Classes page: the class feature variants each class can take (Unearthed Arcana: whirling frenzy, favored environment…). */
  featureOptionsLine() {
    const seen = new Set();
    const rows = (this.d.classes ?? []).flatMap((c) => (c.cls?.gestalt ? [] : [c.cls])).filter((c) => c && !seen.has(c.uuid) && seen.add(c.uuid))
      .map((c) => {
        // A specialist wizard's variants: only its own school's
        const spec = this.cat.specs?.get?.(this.plan.specs?.[c.uuid]?.school);
        const school = spec?.key ?? null;
        const all = Object.entries(featureOptionsFor(c, this.cat));
        // A domain wizard has none of them (no school)
        return { c, opts: all.filter(([, v]) => !v.school || v.school === school), needsSchool: !school && !spec?.arcane && all.some(([, v]) => v.school) };
      }).filter((x) => x.opts.length || x.needsSchool);
    if (!rows.length) return "";
    // What's taken: the ones chosen, and the combat style (always one: the build's when none is chosen)
    const mine = (c) => chosenFeatures(this.plan, c, this.cat).map((x) => x.key);
    const tip = (v) => esc([...(v.gain ?? []).map(([l, n]) => `${t("Level {level}", { level: l })}: ${n}`), ...(v.grants ?? []).map(([l, f, feat]) => `${t("Level {level}", { level: l })}: ${f} → ${feat}`)].join("\n"));
    const input = (c, k, v) => v.style
      ? `<input type="radio" name="fo.${esc(c.uuid)}.${esc(v.exclusive)}" data-on="featureOpt" data-cls="${esc(c.uuid)}" data-key="${esc(k)}" ${mine(c).includes(k) ? "checked" : ""}>`
      : `<input type="checkbox" data-on="featureOpt" data-cls="${esc(c.uuid)}" data-key="${esc(k)}" ${mine(c).includes(k) ? "checked" : ""}>`;
    return `<fieldset><legend>${H("Class feature variants")}</legend>${rows.map(({ c, opts, needsSchool }) => {
      const style = opts.filter(([, v]) => v.style), other = opts.filter(([, v]) => !v.style);
      return `${style.length ? `<div class="row"><b>${esc(c.name)}: ${H("combat style")}</b>${style.map(([k, v]) => `<label title="${tip(v)}">${input(c, k, v)} ${esc(t(k))}</label>`).join("")}</div>` : ""}
        ${other.length ? `<div class="row"><b>${esc(c.name)}</b>${other.map(([k, v]) => `<label title="${tip(v)}">${input(c, k, v)} ${esc(t(k))}</label>`).join("")}</div>` : ""}
        ${needsSchool ? `<p class="hint">${H("{cls}: choose a specialist school (Spells) for its specialist variants.", { cls: c.name })}</p>` : ""}`;
    }).join("")}
      ${rows.some(({ opts }) => opts.some(([, v]) => v.style)) ? `<p class="hint">${H("A ranger's combat style gives its feats at 2nd, 6th and 11th level (Rapid Shot, Manyshot, Improved Precise Shot; or Two-Weapon Fighting, Improved and Greater Two-Weapon Fighting) without their prerequisites, in light or no armor. On the actor: the style's features, each bringing its feat with it. Its build chooses it unless you do.")}</p>` : ""}
      <p class="hint">${H("Unearthed Arcana (SRD variant rules): a class feature swapped for another. What they give shows with the class features (point at one to read it); on the actor they're notes on the class, and the features they replace leave.")}</p></fieldset>`;
  }
  /** Review: each class's features, with the class level each comes at. */
  featuresReview() {
    const by = new Map();
    for (const x of this.d.perLevel) for (const f of x.features ?? []) { if (!by.has(f.cls)) by.set(f.cls, []); by.get(f.cls).push(f); }
    if (!by.size) return "";
    return `<h4>${H("Class features")}</h4>${[...by].map(([u, list]) => `<div><b>${esc(this.cat.classes.get(u)?.name ?? "?")}:</b> ${list.map((f) => `${esc(f.name)} <span class="muted">(${f.classLevel})</span>`).join(", ")}</div>`).join("")}
      <p class="hint">${H("D35E adds the class features to the actor itself.")}</p>`;
  }
  /** Classes page: the favored class and the multiclass XP penalty, once the character has two base classes. */
  xpLine() {
    const p = this.plan, d = this.d;
    if (p.gestalt || (d.classes ?? []).filter((c) => c.cls?.kind === "base").length < 2) return "";
    const x = xpPenalty(p, d);
    const fav = x.favored ? t("Favored class: {cls} (not counted).", { cls: x.favored.name }) : t("No favored class among these.");
    const pen = x.pct ? `<span class="warn"><i class="fas fa-triangle-exclamation"></i> ${H("Multiclass XP penalty: −{pct}%.", { pct: x.pct })}</span>` : `<span class="good"><i class="fas fa-check"></i> ${H("No multiclass XP penalty.")}</span>`;
    return `<div class="row hint">${esc(fav)} ${pen}</div>`;
  }
  slotName(slot, level) {
    if (slot === "general") return t("Feat");
    if (slot === "race") return t("{race} bonus feat", { race: this.d?.race?.name ?? t("Race") });
    const s = this.d?.perLevel?.[level - 1]?.slots?.find((x) => x.slot === slot);
    const c = s?.cls ? this.cat.classes.get(s.cls) : null;
    if (s?.special) return t(s.orFeat ? "{cls} special ability (or a feat)" : "{cls} special ability", { cls: c?.name ?? t("Class") });
    return t("{cls} bonus feat", { cls: c?.name ?? t("Class") });
  }
  /**
   * After a domain, school or prohibited school changes: a specialist's prohibited spells leave its list, domain spells
   * follow the domains, and the special slots are chosen again.
   */
  refreshSpecs(clsUuid) {
    const c = (this.d?.parts ?? this.d?.classes)?.find((x) => x.cls.uuid === clsUuid);
    const idx = this.cat.extrasData?.spellIndex;
    if (!c || !idx) return;
    const list = (this.plan.spells[clsUuid] ??= []);
    const spec = specFor(this.plan, this.cat, c.cls);
    if (spec.kind === "school") {
      const school = new Map(idx.map((x) => [x.uuid, x.school]));
      const banned = new Set(spec.prohibited);
      const before = list.length;
      // An arcane domain's spells (domain wizard) that aren't on the class's own list go with the domain
      const own = (x) => listFor(idx, c.cls, x.level).some((y) => y.uuid === x.uuid || y.name.toLowerCase() === x.name.toLowerCase());
      this.plan.spells[clsUuid] = list.filter((x) => !x.domain || own(x));
      for (const x of this.plan.spells[clsUuid]) delete x.domain;
      this.plan.spells[clsUuid] = this.plan.spells[clsUuid].filter((x) => !banned.has(school.get(x.uuid)));
      if (this.plan.spells[clsUuid].length < before) ui.notifications.info(t("{n} spells of the prohibited schools left {cls}'s spells.", { n: before - this.plan.spells[clsUuid].length, cls: c.cls.name }));
    } else if (spec.kind === "domains") {
      // Domain spells that aren't on the class's own list go with their domain
      const own = (x) => listFor(idx, c.cls, x.level).some((y) => y.uuid === x.uuid || y.name.toLowerCase() === x.name.toLowerCase());
      this.plan.spells[clsUuid] = list.filter((x) => !x.domain || own(x));
      for (const x of this.plan.spells[clsUuid]) delete x.domain;
    }
    const fav = favoriteSpells(this.cat.data?.profiles, c.cls);
    addSpecials(this.plan.spells[clsUuid], c.cls, c.levels, this.d.abilities[c.cls.casting?.ability || "int"], idx, spec, { favorites: fav });
  }
  /** Review: a class's domains or specialist school, in a line (empty when it has neither). */
  specLine(clsUuid) {
    const cls = this.cat.classes.get(clsUuid);
    const spec = cls ? specFor(this.plan, this.cat, cls) : {};
    if (spec.kind === "domains" && spec.domains.length) return `<div>${H("Domains: {list}", { list: spec.domains.map((x) => x.name).join(", ") })}</div>`;
    if (spec.kind === "school" && spec.arcane) return `<div>${H("Domain wizard: {domain}", { domain: spec.school.name })}</div>`;
    if (spec.kind === "school" && spec.school) return `<div>${H("Specialist: {school}; prohibited: {list}", { school: spec.school.name, list: spec.prohibited.map((k) => t(SCHOOL_NAMES[k])).join(", ") || "—" })}</div>`;
    return "";
  }
  issuesFor(step) { return (this.issues ?? []).filter((i) => i.step === step); }
  issueList(list) {
    if (!list.length) return "";
    return `<ul class="hint aam2-issues" style="margin:4px 0;padding-left:1.2em">${list.map((i) => `<li class="${i.severity === "error" ? "bad" : i.severity === "warn" ? "warn" : "muted"}">${esc(issueText(i, this.cat, (s, l) => this.slotName(s, l)))}</li>`).join("")}</ul>`;
  }

  /* ---------- Edit ---------- */

  async findActor(ref) {
    if (!ref) return null;
    const m = String(ref).match(/^Actor\.([^.]+)$/);
    if (m || !String(ref).includes(".")) { const a = game.actors?.get(m ? m[1] : ref); if (a) return a; }
    try { const doc = await fromUuid(ref); return doc?.documentName === "Actor" || doc?.items ? doc : null; } catch (e) { return null; }
  }
  /** Read an actor into a plan and open it (on Classes and levels). */
  async openEdit(ref) {
    const actor = typeof ref === "object" ? ref : await this.findActor(ref);
    if (!actor) return ui.notifications.warn(t("Couldn't find that actor."));
    if (!actor.isOwner) return ui.notifications.warn(t("You don't own {name}.", { name: actor.name }));
    if (!["character", "npc"].includes(actor.type)) return ui.notifications.warn(t("A&M edits characters and NPCs."));
    const data = await this.data();
    const { plan, notes } = readActor(actor, this.cat, data);
    this.mode = "edit"; this.actor = actor; this.plan = plan; this.before = foundry.utils.deepClone(plan); this.editNotes = notes;
    this.skillLevel = Math.max(1, plan.levels.length);
    this.go("classes");
  }
  onDrop(ev) {
    let data = null;
    try { data = JSON.parse(ev.dataTransfer?.getData("text/plain") || "null"); } catch (e) { return; }
    if (data?.type !== "Actor" || !data.uuid) return;
    ev.preventDefault();
    this.openEdit(data.uuid);
  }
  /**
   * Edit's Fill in what's missing: skills for the levels with points left (or too many), feats for empty slots and
   * feats whose prerequisites are no longer met (a feat without a slot moves to a free one, or goes), the ability
   * increases of new levels, and spells for the new caster levels. What you chose yourself stays.
   */
  async fillMissing() {
    const p = this.plan, cat = this.cat, data = await this.data();
    // Ability increases at new levels: the class's favourite
    let d = derive(p, cat);
    p.levels.forEach((lv, i) => { if (R.hasIncrease(i + 1) && !lv.increase) { const prof = profileOf(cat.classes.get(p.levels[0]?.cls ?? lv.cls), data); lv.increase = prof.increases?.[0] ?? prof.abilities?.[0] ?? "str"; } });
    // Skills
    d = derive(p, cat);
    const levels = new Set(d.perLevel.filter((x) => x.skillPoints.left !== 0).map((x) => x.level));
    if (levels.size) rollSkills(p, cat, data, Math.random, { only: levels });
    // Feats without a slot: to a free slot if one fits, else removed
    d = derive(p, cat);
    const orphans = [];
    p.levels.forEach((lv, i) => { const slots = d.perLevel[i]?.slots ?? []; lv.feats = (lv.feats ?? []).filter((f) => { if (!f.uuid || slots.some((s) => s.slot === f.slot)) return true; orphans.push(f); return false; }); });
    if (orphans.length) placeFeats(p, cat, orphans, { keep: true });
    // Empty slots and feats whose prerequisites aren't met
    d = derive(p, cat);
    const redo = new Set();
    for (const x of d.perLevel) for (const sl of x.slots) {
      const pick = p.levels[x.level - 1].feats.find((f) => f.slot === sl.slot);
      const feat = pick?.uuid ? cat.feats.get(pick.uuid) : null;
      if (!feat) { redo.add(`${x.level}|${sl.slot}`); continue; }
      if (!sl.ignorePrereqs && feat.req && !prereqs(feat, pick.choice, x, takenUpTo(d, x.level, sl.slot), d).ok) redo.add(`${x.level}|${sl.slot}`);
    }
    if (redo.size) rollFeats(p, cat, data, Math.random, { only: (L, slot) => redo.has(`${L}|${slot}`) });
    // Spells for new caster levels
    if (derive(p, cat).parts.some((c) => castingKind(c.cls))) mergeSpells(p, cat, data, Math.random);
  }
  async apply(btn) {
    const errors = this.issues.filter((i) => i.severity === "error");
    const changes = planChanges(this.before, this.plan, this.cat);
    if (!changes.length) return ui.notifications.info(t("Nothing has changed yet."));
    const DV = A()?.DialogV2 ?? foundry.applications.api.DialogV2;
    const ok = await DV.confirm({
      window: { title: t("Apply changes") },
      content: `<p>${H("Change {name}:", { name: this.actor?.name ?? "" })}</p><ul>${changes.map((c) => `<li>${esc(changeText(c, this.cat))}</li>`).join("")}</ul>${errors.length ? `<p class="bad">${H("{n} rules are broken:", { n: errors.length })}</p>${this.issueList(errors)}` : ""}<p>${H("Apply these changes?")}</p>`,
    });
    if (!ok) return;
    const backup = this.root.querySelector('[name="backup"]')?.checked ?? setting("backupBeforeEdit", true);
    btn.disabled = true;
    try {
      const actor = this.actor?.id ? (game.actors?.get?.(this.actor.id) ?? this.actor) : this.actor;
      const res = await this.working(t("Changing {name}…", { name: actor.name }), () => applyEdit(actor, this.plan, this.cat, this.before, { backup }));
      recent.add(actor);
      ui.notifications.info(t("{name} changed.", { name: actor.name }) + (res.backup ? ` ${t("A copy from before is in the folder A&M backups.")}` : ""));
      try { await game.settings.set(MOD, "backupBeforeEdit", backup); } catch (e) { /* players */ }
      if (this.root.querySelector('[name="openSheet"]')?.checked ?? true) actor.sheet?.render(true);
      editStore.set(null);
      // Read it again: the next changes start from what's on the actor now
      const again = readActor(actor, this.cat, await this.data());
      this.plan = again.plan; this.before = foundry.utils.deepClone(again.plan); this.editNotes = again.notes;
      this.paint();
    } catch (err) {
      console.error(`${MOD} | apply`, err);
      ui.notifications.error(t("Couldn't change the actor: {error}", { error: err.message }));
    } finally { btn.disabled = false; }
  }
  /** What A&M noticed reading the actor (on Classes and levels and Review). */
  editBanner() {
    if (this.mode !== "edit") return "";
    const list = this.editNotes ?? [];
    return `<fieldset class="aam2-edit"><legend><i class="fas fa-user-pen"></i> ${H("Editing {name}", { name: this.actor?.name ?? this.plan?.name ?? "" })}</legend>
      ${list.length ? `<ul class="hint" style="margin:2px 0;padding-left:1.2em">${list.map((n) => `<li>${esc(noteText(n, this.cat))}</li>`).join("")}</ul>` : `<p class="hint">${H("Read from the actor. Change anything on the steps; nothing changes on the actor until Apply changes (on Review).")}</p>`}
    </fieldset>`;
  }

  /* ---------- Parts ---------- */

  navHTML() {
    return STEPS.map(([k, label, icon]) => {
      const list = k === "review" ? [] : this.issuesFor(k);
      const dot = k === "review" ? "" : list.some((i) => i.severity === "error") ? "error" : list.some((i) => i.severity === "warn") ? "warn" : "ok";
      return `<button type="button" data-step="${k}" data-tab-btn="${k}" class="${this.page === k ? "active" : ""}"><i class="fas ${icon}"></i> ${H(label)}${dot ? `<span class="dot ${dot}"></span>` : ""}</button>`;
    }).join("");
  }

  footHTML() {
    if (this.page === "random") return `<button type="button" data-act="restart"><i class="fas fa-house"></i> ${H("Start page")}</button><span class="grow"></span>
      <button type="button" data-act="generateMany"><i class="fas fa-users"></i> ${H("Create several at once")}</button>
      <button type="button" data-act="generate" class="bright"><i class="fas fa-dice"></i> ${H("Generate")}</button>`;
    if (this.page === "prestige" || this.page === "profiles") return `<button type="button" data-act="restart"><i class="fas fa-house"></i> ${H("Start page")}</button><span class="grow"></span>`;
    if (this.page === "edit") return `<button type="button" data-act="restart"><i class="fas fa-house"></i> ${H("Start page")}</button><span class="grow"></span>
      <button type="button" data-act="editOpen" class="bright"><i class="fas fa-user-pen"></i> ${H("Edit this actor")}</button>`;
    if (this.page === "start" || !this.plan) return `<span class="grow"></span><button type="button" data-act="reload"><i class="fas fa-rotate"></i> ${H("Reload races, classes and feats")}</button>`;
    const i = STEPS.findIndex(([k]) => k === this.page);
    const edit = this.mode === "edit";
    return `<button type="button" data-act="${edit ? "leaveEdit" : "restart"}"><i class="fas fa-house"></i> ${H("Start page")}</button><span class="grow"></span>
      <button type="button" data-act="back" ${i <= 0 ? "disabled" : ""}><i class="fas fa-chevron-left"></i> ${H("Back")}</button>
      ${i < STEPS.length - 1 ? `<button type="button" data-act="next">${H("Next")} <i class="fas fa-chevron-right"></i></button>` : ""}
      ${edit ? `<button type="button" data-act="${this.page === "review" ? "apply" : "goto"}" data-to="review" class="bright"><i class="fas fa-user-pen"></i> ${H("Apply changes")}</button>`
        : `<button type="button" data-act="create" class="bright"><i class="fas fa-user-check"></i> ${H("Create actor")}</button>`}`;
  }

  startHTML() {
    const draft = store.get(), editing = editStore.get();
    const n = this.cat;
    return `<h2 style="margin-top:4px">${H("Adventurers and Minions")}</h2>
      <p class="hint">${H("Make complete D35E characters and NPCs. D35E works out BAB, saves, skills, AC, attacks and class features from your choices.")}</p>
      <div class="aam2-start">
        <button type="button" data-act="build"><i class="fas fa-user-plus"></i><b>${H("Build a character")}</b><small>${H("Choose everything, step by step")}</small></button>
        <button type="button" data-act="randomPage"><i class="fas fa-dice"></i><b>${H("Random character")}</b><small>${H("Race, sex, class and level optional; the rest is chosen for you")}</small></button>
        <button type="button" data-act="editPage"><i class="fas fa-user-pen"></i><b>${H("Edit an actor")}</b><small>${H("Add or change classes and levels, and redo the character")}</small></button>
      </div>
      ${canCreate() ? "" : `<p class="hint aam2-player"><i class="fas fa-circle-info"></i> ${canBuild() ? H("New characters are created for you by the GM's Foundry (a GM needs to be logged in) and belong to you. You can edit the actors you own.") : H("You can edit the actors you own. Making new actors needs Foundry's Create New Actors permission: ask your GM.")}</p>`}
      ${draft?.levels ? `<p><button type="button" data-act="resume"><i class="fas fa-clock-rotate-left"></i> ${H("Continue {name} (level {level})", { name: draft.name || t("the character you were building"), level: draft.levels.length })}</button></p>` : ""}
      ${editing?.plan ? `<p><button type="button" data-act="resumeEdit"><i class="fas fa-user-pen"></i> ${H("Continue editing {name}", { name: editing.plan.name || t("the actor") })}</button> <a data-act="dropEdit" title="${H("Forget these changes")}"><i class="fas fa-xmark"></i></a></p>` : ""}
      ${game.user?.isGM ? `<p><button type="button" data-act="prestigePage"><i class="fas fa-crown"></i> ${H("Prestige requirements")}</button> <button type="button" data-act="profilesPage"><i class="fas fa-sliders"></i> ${H("Build profiles")}</button> <span class="hint">${H("GM: what A&M checks before a prestige class, and the builds it follows for each class.")}</span></p>` : ""}
      ${this.recentHTML()}
      <p class="hint">${H("Found: {races} races, {classes} classes, {feats} feats.", { races: n.races.size, classes: n.classes.size, feats: n.feats.size })}</p>`;
  }

  /* Edit: choosing the actor */
  editPickHTML() {
    const mine = [...(game.actors ?? [])].filter((a) => a.isOwner && ["character", "npc"].includes(a.type)).sort((a, b) => a.name.localeCompare(b.name));
    const tokens = [...new Map((globalThis.canvas?.tokens?.controlled ?? []).map((tk) => tk.actor).filter((a) => a?.isOwner).map((a) => [a.uuid, a])).values()];
    const label = (a) => `${a.name} (${[...a.items].filter((i) => i.type === "class").map((i) => `${i.name} ${i.system?.levels ?? ""}`).join(" / ") || t("no class")})`;
    return `<h3>${H("Edit an actor")}</h3>
      <p class="hint">${H("A&M reads the actor's race, classes and levels, skills, feats and spells into the steps. Change anything, then Apply changes on Review: only what you changed is written, everything else on the actor (gear, effects, class features) stays. A copy of the actor is made first.")}</p>
      ${tokens.length ? `<fieldset><legend>${H("Selected tokens")}</legend><div class="row">${tokens.map((a) => `<button type="button" data-act="editOpen" data-uuid="${esc(a.uuid)}"><i class="fas fa-user-pen"></i> ${esc(label(a))}</button>`).join("")}</div></fieldset>` : ""}
      <div class="form-group"><label>${H("Actor")}</label><select name="edit.actor" style="flex:1">${opt("", "—")}${mine.map((a) => opt(a.uuid, label(a))).join("")}</select></div>
      <div class="aam2-drop"><i class="fas fa-hand-pointer"></i> ${H("Or drop an actor here from the Actors directory.")}</div>
      <p class="hint">${H("Actors A&M made reopen exactly as they were built. For others, A&M works out what it can (and says what it guessed); anything it doesn't know stays on the actor untouched.")}</p>`;
  }

  /* Basics */
  basicsHTML() {
    const p = this.plan, cat = this.cat, race = this.d.race, ext = race?.ext ?? {};
    const intMod = R.mod(this.d.perLevel[0]?.abilities?.int ?? (Number(p.abilities.base.int) + (race?.ability?.int ?? 0)));
    const auto = ext.languages ?? [];
    const bonusList = ext.bonusLanguages === "any" || !race ? cat.languages.map((l) => l.key).filter((k) => !auto.includes(k)) : (ext.bonusLanguages ?? []).filter((k) => !auto.includes(k));
    const langName = (k) => cat.languages.find((l) => l.key === k)?.label ?? k;
    const allowed = Math.max(0, intMod);
    const chosen = p.languages.filter((l) => bonusList.includes(l)).length;
    const raceOpts = opt("", "—") + cat.list.races.map((r) => opt(r.uuid, r.label, p.race)).join("");
    const adj = race ? Object.entries(race.ability).filter(([, v]) => v).map(([a, v]) => `${abilityLabel(a)} ${sign(v)}`).join(", ") : "";
    return `<h3>${H("Basics")}</h3>
      <div class="cols2"><div>
        <div class="form-group"><label>${H("Name")}</label><input type="text" data-bind="name" data-live value="${esc(p.name)}"></div>
        <div class="form-group"><label>${H("Character or NPC")}</label><select data-bind="kind">${opt("character", t("Player character (character sheet)"), p.kind)}${opt("npc", t("NPC (NPC sheet)"), p.kind)}</select></div>
        <div class="form-group"><label>${H("Race")}</label><select data-on="race">${raceOpts}</select></div>
        <div class="form-group"><label>${H("Sex")}</label><input type="text" data-bind="sex" value="${esc(p.sex)}" list="aam2-sex"><datalist id="aam2-sex"><option value="${H("Male")}"><option value="${H("Female")}"></datalist></div>
        <div class="form-group"><label>${H("Alignment")}</label><select data-bind="alignment">${R.ALIGNMENTS.map((a) => opt(a, alignLabel(a), p.alignment)).join("")}</select></div>
        <div class="form-group"><label>${H("Deity")}</label><input type="text" data-bind="deity" value="${esc(p.deity)}"></div>
        <div class="form-group"><label>${H("Age")}</label><input type="text" data-bind="age" value="${esc(p.age)}"></div>
        <div class="form-group"><label>${H("Height")}</label><input type="text" data-bind="height" value="${esc(p.height)}"></div>
        <div class="form-group"><label>${H("Weight")}</label><input type="text" data-bind="weight" value="${esc(p.weight)}"></div>
      </div><div>
        ${race ? `<fieldset><legend>${esc(race.name)}</legend>
          <div>${H("Abilities")}: <b>${esc(adj || t("no changes"))}</b></div>
          <div>${H("Size")}: <b>${esc(game.i18n.localize(CONFIG.D35E?.actorSizes?.[ext.size ?? "med"] ?? ext.size ?? "med"))}</b>${race.la ? ` · ${H("Level adjustment")} <b>+${race.la}</b>` : ""}</div>
          <div>${H("Favored class")}: <b>${esc(ext.favored === "any" ? t("any (highest)") : ext.favored ?? "—")}</b></div>
          ${ext.vision?.darkvision ? `<div>${H("Darkvision {n} ft.", { n: ext.vision.darkvision })}</div>` : ext.vision?.lowLight ? `<div>${H("Low-light vision")}</div>` : ""}
          ${ext.bonusFeat ? `<div>${H("A bonus feat at 1st level, and extra skill points")}</div>` : ""}
          ${race.ext && Object.keys(race.ext).length ? "" : `<p class="hint">${H("A&M has no details for this race (size, languages, favored class): check them on the sheet.")}</p>`}
        </fieldset>` : ""}
        <fieldset><legend>${H("Languages")}</legend>
          ${auto.length ? `<div>${H("Automatic")}: ${auto.map((k) => `<span class="chip">${esc(langName(k))}</span>`).join("")}</div>` : ""}
          <div class="hint">${H("Bonus languages (Int {mod}): {chosen} of {allowed}", { mod: sign(intMod), chosen, allowed })}</div>
          <div class="cols2" style="font-size:0.92em">${bonusList.map((k) => `<label><input type="checkbox" data-on="lang" value="${esc(k)}" ${p.languages.includes(k) ? "checked" : ""}> ${esc(langName(k))}</label>`).join("")}</div>
          <div class="form-group"><label>${H("Others")}</label><input type="text" data-bind="customLanguages" value="${esc(p.customLanguages)}" placeholder="${H("languages not in the list")}"></div>
        </fieldset>
        <fieldset><legend>${H("Images")}</legend>
          <div class="form-group"><label>${H("Portrait")}</label><input type="text" data-bind="img" value="${esc(p.img)}"><button type="button" data-act="pickImg" data-field="img"><i class="fas fa-file-image"></i></button></div>
          <div class="form-group"><label>${H("Token")}</label><input type="text" data-bind="tokenImg" value="${esc(p.tokenImg)}"><button type="button" data-act="pickImg" data-field="tokenImg"><i class="fas fa-file-image"></i></button></div>
        </fieldset>
      </div></div>
      ${this.issueList(this.issuesFor("basics"))}`;
  }

  /* Abilities */
  abilitiesHTML() {
    const p = this.plan, ab = p.abilities, race = this.d.race, m = ab.method;
    const incTotals = {}; p.levels.forEach((lv, i) => { if (lv.increase && R.hasIncrease(i + 1)) incTotals[lv.increase] = (incTotals[lv.increase] ?? 0) + 1; });
    const pool = ab.pool ?? [];
    const poolOpts = (a) => opt("", "—", ab.pick?.[a]) + pool.map((v, i) => opt(i, v, ab.pick?.[a])).join("");
    const baseCell = (a) => {
      if (m === "pointbuy") return `<button type="button" class="step-btn" data-act="pbStep" data-a="${a}" data-d="-1">−</button><input type="text" inputmode="numeric" data-on="pbScore" data-a="${a}" name="pb.${a}" value="${ab.base[a]}"><button type="button" class="step-btn" data-act="pbStep" data-a="${a}" data-d="1">+</button> <small class="muted">${H("{n} pt", { n: R.pointCost(ab.base[a]) ?? "?" })}</small>`;
      if (m === "typed") return `<input type="text" inputmode="numeric" data-on="typed" data-a="${a}" name="ty.${a}" value="${ab.base[a]}">`;
      return `<select data-on="pick" data-a="${a}">${poolOpts(a)}</select>`;
    };
    const rows = R.ABILITIES.map((a) => {
      const base = Number(ab.base[a]) || 0, rc = race?.ability?.[a] ?? 0, inc = incTotals[a] ?? 0, total = base + rc + inc;
      return `<tr><td><b>${esc(abilityLabel(a))}</b></td><td>${baseCell(a)}</td><td class="n">${rc ? sign(rc) : ""}</td><td class="n">${inc ? `+${inc}` : ""}</td><td class="n"><b>${base ? total : "—"}</b></td><td class="n">${base ? sign(R.mod(total)) : ""}</td></tr>`;
    }).join("");
    const spent = R.pointTotal(ab.base), budget = Number(ab.budget) || 0;
    const incLevels = p.levels.map((lv, i) => i + 1).filter((L) => R.hasIncrease(L));
    return `<h3>${H("Abilities")}</h3>
      <div class="form-group"><label>${H("Method")}</label><select data-on="method">${METHODS.map(([k, l]) => opt(k, t(l), m)).join("")}</select></div>
      ${m === "pointbuy" ? `<div class="form-group"><label>${H("Points")}</label><input type="number" data-bind="abilities.budget" data-type="number" value="${budget}" min="0" max="200">
        <span class="row">${R.POINT_BUDGETS.map((b) => `<button type="button" data-act="budget" data-n="${b}">${b}</button>`).join("")}</span>
        <span style="flex:1;text-align:right">${H("Spent")}: <b class="${spent > budget ? "bad" : ""}">${spent}</b> / ${budget}</span></div>` : ""}
      ${m === "roll" ? `<div class="form-group"><label>${H("Dice")}</label><select data-bind="abilities.dice">${opt("4d6", t("4d6, drop the lowest"), ab.dice)}${opt("3d6", t("3d6"), ab.dice)}</select>
        <button type="button" data-act="rollScores"><i class="fas fa-dice"></i> ${H("Roll")}</button></div>
        ${pool.length ? `<div class="form-group"><label>${H("Rolled")}</label><span class="row">${pool.map((v, i) => `<input type="text" inputmode="numeric" style="width:3em;text-align:center" data-on="rolled" name="pool.${i}" value="${v}">`).join("")}</span></div>` : ""}` : ""}
      ${(m === "elite" || m === "nonelite" || (m === "roll" && pool.length)) ? `<div class="row" style="margin:4px 0"><button type="button" data-act="placeByClass"><i class="fas fa-wand-magic-sparkles"></i> ${H("Place by class")}</button><span class="hint">${H("Puts the highest scores where the first class wants them; or choose a score for each ability (each one once).")}</span></div>` : ""}
      <table class="aam2-t" style="max-width:560px"><tr><th>${H("Ability")}</th><th>${H("Score")}</th><th class="n">${H("Race")}</th><th class="n">${H("Levels")}</th><th class="n">${H("Total")}</th><th class="n">${H("Mod")}</th></tr>${rows}</table>
      ${incLevels.length ? `<fieldset><legend>${H("Ability increases")}</legend><div class="row">${incLevels.map((L) => `<label>${H("Level {level}", { level: L })} <select data-on="increase" data-l="${L}">${opt("", "—", p.levels[L - 1].increase)}${R.ABILITIES.map((a) => opt(a, abilityLabel(a), p.levels[L - 1].increase)).join("")}</select></label>`).join("")}</div></fieldset>` : `<p class="hint">${H("Ability increases come at levels 4, 8, 12, 16 and 20; add levels first.")}</p>`}
      ${this.issueList(this.issuesFor("abilities"))}`;
  }

  /* Classes and levels */
  classesHTML() {
    const p = this.plan, cat = this.cat, d = this.d;
    if (d.perLevel.some((x) => (x.parts ?? []).some((q) => q.cls?.kind === "prestige"))) this.needExtras();
    const kinds = [["base", /*t*/"Base classes"], ["prestige", /*t*/"Prestige classes"], ["racial", /*t*/"Racial HD"], ["minion", /*t*/"Minion classes"]];
    // Prestige classes the character doesn't qualify for at that level: marked ✘ with what is missing (still pickable)
    const states = new Map();
    const prestigeMark = (c, level) => {
      if (c.kind !== "prestige") return null;
      if (!states.has(level)) states.set(level, stateAt(p, cat, d, level));
      const state = states.get(level);
      if (state.classLevels.has(c.uuid)) return null;
      const req = requirementsOf(c, cat.data?.prestige ?? {}, cat.prestigeCustom?.() ?? {});
      if (!req) return { unknown: true };
      const missing = missingFor(req, state, cat.prestigeOpts ?? {});
      return missing.length ? { missing } : null;
    };
    const clsOpt = (c, sel, level) => {
      const m = prestigeMark(c, level);
      if (!m) return opt(c.uuid, c.label, sel);
      const label = m.unknown ? `${c.label} (?)` : `✘ ${c.label}`;
      const title = m.unknown ? t("No requirements known for this class") : t("Needs {missing}", { missing: m.missing.map((x) => prestigeMissingText(x, cat)).join(", ") });
      return opt(c.uuid, label, sel).replace("<option ", `<option title="${esc(title)}" `);
    };
    const clsOpts = (sel, level = d.perLevel.length) => opt("", "—", sel) + [...kinds, ["variant", /*t*/"Variant classes (Unearthed Arcana)"]].map(([k, l]) => {
      const list = cat.list.classes.filter((c) => (k === "variant" ? !!c.variant : c.kind === k && !c.variant));
      return list.length ? `<optgroup label="${H(l)}">${list.map((c) => clsOpt(c, sel, level)).join("")}</optgroup>` : "";
    }).join("");
    const lastParts = partsOf(p.levels.at(-1)?.cls ?? "");
    const last = lastParts[0] ?? "";
    const rows = d.perLevel.map((x, i) => {
      const gains = [
        ...x.slots.map((s) => `<span class="chip" title="${H("Feat")}"><i class="fas fa-star"></i> ${esc(this.slotName(s.slot, x.level))}</span>`),
        x.increase ? `<span class="chip"><i class="fas fa-arrow-up"></i> ${H("Ability")}</span>` : "",
        ...(x.features ?? []).map((f) => `<span class="chip feature"${f.uuid ? ` data-act="openFeature" data-uuid="${esc(f.uuid)}"` : ""} title="${H("Class feature (D35E adds it)")}${f.uuid ? ` — ${H("click to read it")}` : ""}"><i class="fas fa-certificate"></i> ${esc(f.name)}</span>`),
      ].join("");
      const parts = partsOf(p.levels[i].cls);
      const clsCell = p.gestalt
        ? `<select data-on="levelCls" data-i="${i}" data-side="0">${clsOpts(parts[0] ?? "", i)}</select> // <select data-on="levelCls" data-i="${i}" data-side="1">${clsOpts(parts[1] ?? "", i)}</select>`
        : `<select data-on="levelCls" data-i="${i}">${clsOpts(p.levels[i].cls, i)}</select>`;
      const clsLevel = x.cls ? (x.cls.gestalt ? x.parts.map((q) => q.level).join(" / ") : x.classLevel) : "";
      return `<tr><td class="n">${x.level}</td><td class="${p.gestalt ? "gestalt" : ""}">${clsCell}</td>
        <td class="n">${clsLevel}</td><td class="n">${x.hd ? `d${x.hd}` : ""}</td>
        <td class="n"><input type="text" inputmode="numeric" data-on="levelHp" data-i="${i}" name="hp.${i}" value="${p.levels[i].hp}"> <button type="button" class="step-btn" data-act="rollHp" data-i="${i}" title="${H("Roll")}"><i class="fas fa-dice"></i></button></td>
        <td class="n">${sign(x.bab)}</td><td class="n">${sign(x.saves.fort)}/${sign(x.saves.ref)}/${sign(x.saves.will)}</td><td>${gains}</td>
        <td><button type="button" class="step-btn" data-act="removeLevel" data-i="${i}" title="${H("Remove this level")}"><i class="fas fa-xmark"></i></button></td></tr>`;
    }).join("");
    return `<h3>${H("Classes and levels")}</h3>${this.editBanner()}
      <div class="row" style="margin-bottom:4px"><label><input type="checkbox" data-on="gestalt" ${p.gestalt ? "checked" : ""}> <b>${H("Gestalt")}</b></label>
        <span class="hint" style="flex:1">${H("Two classes at every level (Unearthed Arcana, in the SRD's variant rules): the better hit die, BAB, saves and skill points of the two, and both classes' skills, features and spells. On the actor each pair is one class A&M builds from the two (\"Fighter // Wizard\").")}</span></div>
      <div class="row" style="margin-bottom:6px"><b>${H("Add")}</b><select name="add.cls" style="flex:1;min-width:12em">${clsOpts(last)}</select>
        ${p.gestalt ? `<span>//</span><select name="add.cls2" style="flex:1;min-width:12em">${clsOpts(lastParts[1] ?? "")}</select>` : ""}
        <span>×</span><input type="number" name="add.n" value="1" min="1" max="40" style="width:4em"><button type="button" data-act="addLevels"><i class="fas fa-plus"></i> ${H("Add levels")}</button></div>
      ${p.levels.length ? `<table class="aam2-t"><tr><th class="n">${H("Level")}</th><th>${H("Class")}</th><th class="n">${H("Class level")}</th><th class="n">${H("HD")}</th><th class="n">${H("HP rolled")}</th><th class="n">${H("BAB")}</th><th class="n">${H("Fort/Ref/Will")}</th><th>${H("Gains")}</th><th></th></tr>${rows}</table>
      <div class="row hint">${H("BAB and saves are the classes' own, before ability modifiers.")}</div>${this.xpLine()}${this.buildsLine()}${this.featureOptionsLine()}` : `<p class="hint">${H("Choose a class and how many levels, then Add levels. Add more classes the same way to multiclass.")}</p>`}
      <fieldset><legend>${H("Hit points")}</legend>
        <div class="form-group"><label>${H("New levels")}</label><select data-bind="hp.method">${R.HP_METHODS.map((k) => opt(k, t(HP_LABELS[k]), p.hp.method)).join("")}</select>
          <label style="flex:0 0 auto"><input type="checkbox" data-bind="hp.maxFirst" ${p.hp.maxFirst !== false ? "checked" : ""}> ${H("Maximum at 1st level")}</label></div>
        <div class="row">${H("All levels")}: <button type="button" data-act="allHp" data-how="max">${H("Maximum")}</button><button type="button" data-act="allHp" data-how="average">${H("Average")}</button><button type="button" data-act="allHp" data-how="roll"><i class="fas fa-dice"></i> ${H("Roll")}</button></div>
        <p class="hint">${H("Rolled hit points per level; D35E adds the Constitution modifier.")}</p>
      </fieldset>
      ${this.issueList(this.issuesFor("classes"))}`;
  }

  /* Skills */
  skillsHTML() {
    const p = this.plan, d = this.d, cat = this.cat;
    if (!p.levels.length) return `<h3>${H("Skills")}</h3><p class="hint">${H("Add levels first (Classes and levels).")}</p>`;
    const L = Math.max(1, Math.min(this.skillLevel, p.levels.length)); this.skillLevel = L;
    const x = d.perLevel[L - 1], prev = d.perLevel[L - 2], lv = p.levels[L - 1];
    const levelBtns = d.perLevel.map((q) => `<button type="button" data-act="skLevel" data-l="${q.level}" class="${q.level === L ? "active" : ""} ${q.skillPoints.left > 0 ? "left" : q.skillPoints.left < 0 ? "over" : ""}" title="${H("{n} points left", { n: q.skillPoints.left })}">${q.level}</button>`).join("");
    const rowsFor = [];
    for (const s of cat.skills) {
      const subs = s.arbitrary ? p.subSkills.filter((x2) => x2.parent === s.key) : [];
      if (s.arbitrary) {
        rowsFor.push({ key: null, s, label: s.label, header: true });
        for (const sub of subs) rowsFor.push({ key: sub.tag, s, label: `${s.label}: ${sub.name}`, sub });
      } else rowsFor.push({ key: s.key, s, label: s.label });
    }
    const rows = rowsFor.map((r) => {
      if (r.header) return `<tr><td colspan="7"><b>${esc(r.label)}</b> <input type="text" name="sub.${r.s.key}" placeholder="${H("add one, e.g. {ex}", { ex: r.s.key === "crf" ? t("Weaponsmithing") : r.s.key === "prf" ? t("Sing") : t("Sailor") })}" style="width:12em;height:1.7em"> <button type="button" class="step-btn" data-act="addSub" data-parent="${r.s.key}"><i class="fas fa-plus"></i></button></td></tr>`;
      const k = r.key, cs = this.isClassSkill(lv.cls, k), any = x.anyClassSkill(k);
      if (this.classSkillsOnly && !any && !(lv.skills[k] > 0)) return "";
      const before = prev?.ranks?.[k] ?? 0, pts = Number(lv.skills[k]) || 0, after = before + pts * (cs ? 1 : 0.5);
      const max = any ? x.maxClass : x.maxCross, over = after > max;
      const rk = (n) => (Number.isInteger(n) ? n : n.toFixed(1));
      return `<tr class="${!any ? "dim" : ""}"><td>${esc(r.label)}${r.sub ? ` <a data-act="removeSub" data-tag="${r.sub.tag}" title="${H("Remove")}"><i class="fas fa-xmark"></i></a>` : ""}${r.s.rt ? ` <small class="muted" title="${H("Trained only")}">*</small>` : ""}</td>
        <td class="n">${esc(abilityLabel(r.s.ability))}</td><td class="n">${cs ? `<i class="fas fa-check good"></i>` : any ? `<small>${H("other class")}</small>` : ""}</td>
        <td class="n">${rk(before)}</td>
        <td class="n"><button type="button" class="step-btn" data-act="skStep" data-k="${k}" data-d="-1">−</button><input type="text" inputmode="numeric" data-on="skPoints" data-k="${k}" name="sk.${k}" value="${pts || ""}"><button type="button" class="step-btn" data-act="skStep" data-k="${k}" data-d="1">+</button></td>
        <td class="n"><b class="${over ? "bad" : ""}">${rk(after)}</b></td><td class="n">${rk(max)}</td></tr>`;
    }).join("");
    const c = x.cls;
    return `<h3>${H("Skills")}</h3>
      <div class="aam2-levels">${levelBtns}</div>
      <div class="row"><b>${H("Level {level}", { level: L })}${c ? ` — ${esc(c.name)} ${x.classLevel}` : ""}</b>
        <span>${H("Points")}: <b>${x.skillPoints.spent}</b> / ${x.skillPoints.gain}</span>
        <span class="${x.skillPoints.left < 0 ? "bad" : x.skillPoints.left > 0 ? "warn" : "good"}">${H("{n} left", { n: x.skillPoints.left })}</span>
        <span class="grow" style="flex:1"></span>
        <label><input type="checkbox" data-on="classOnly" ${this.classSkillsOnly ? "checked" : ""}> ${H("Class skills only")}</label>
        ${L > 1 ? `<button type="button" data-act="skCopy" title="${H("Put points in the same skills as the level before")}"><i class="fas fa-copy"></i> ${H("Same as before")}</button>` : ""}
        <button type="button" data-act="skMax" title="${H("Spend what's left on the skills already chosen, up to their maximum")}"><i class="fas fa-angles-up"></i> ${H("Fill")}</button>
        <button type="button" data-act="skClear"><i class="fas fa-eraser"></i> ${H("Clear")}</button></div>
      <p class="hint">${H("Points this level: class skills cost 1 point a rank, cross-class skills 1 point for half a rank. Maximum ranks: level + 3 for class skills (of any of your classes), half that for the others.")}</p>
      <table class="aam2-t"><tr><th>${H("Skill")}</th><th class="n">${H("Ability")}</th><th class="n">${H("Class skill")}</th><th class="n">${H("Ranks before")}</th><th class="n">${H("Points this level")}</th><th class="n">${H("Ranks")}</th><th class="n">${H("Max")}</th></tr>${rows}</table>
      ${this.issueList(this.issuesFor("skills").filter((i) => i.level === L || i.level == null))}`;
  }

  /* Feats */
  featsHTML() {
    const p = this.plan, d = this.d, cat = this.cat;
    if (!p.levels.length) return `<h3>${H("Feats")}</h3><p class="hint">${H("Add levels first (Classes and levels).")}</p>`;
    const epicOk = d.level >= 21;
    const lists = [];
    const blocks = d.perLevel.filter((x) => x.slots.length).map((x) => {
      const lv = p.levels[x.level - 1];
      return x.slots.map((s) => {
        const pick = lv.feats.find((f) => f.slot === s.slot);
        const feat = pick?.uuid ? cat.feats.get(pick.uuid) : null;
        // The feats this slot offers
        let options = cat.list.feats.filter((f) => !f.epic || epicOk);
        let specialCount = 0;
        if (s.special) {
          // A class special ability (the rogue's), or a feat instead
          const from = new Set((s.from ?? []).map((n) => n.toLowerCase()));
          const abilities = (cat.list.specials ?? []).filter((f) => from.has(f.base.toLowerCase()));
          specialCount = abilities.length;
          options = [...abilities, ...(s.orFeat ? options : [])];
        } else if (s.from?.length || s.psionic) {
          const from = new Set((s.from ?? []).map((n) => n.toLowerCase()));
          options = options.filter((f) => from.has(f.base.toLowerCase()) || (s.psionic && f.psionic));
        }
        if (this.qualifiedOnly && !s.ignorePrereqs) {
          const taken = takenUpTo(d, x.level, s.slot);
          options = options.filter((f) => f.special || f.uuid === pick?.uuid || !f.req || f.req.choice || prereqs(f, null, x, taken, d).ok);
        }
        const listId = `aam2-f-${x.level}-${s.slot}`;
        // A special ability slot's list: the abilities, then (headed) the feats that can be taken instead
        const heading = (label) => `<option value="" data-heading label="${esc(label)}">${esc(label)}</option>`;
        const items = options.map((f) => `<option value="${esc(f.label)}">`);
        if (specialCount) { items.splice(specialCount, 0, heading(t("Or a feat instead"))); items.unshift(heading(t("Special abilities"))); }
        lists.push(`<datalist id="${listId}">${items.join("")}</datalist>`);
        let choice = "";
        if (feat?.choice?.kind === "custom") choice = `<select data-on="featChoice" data-l="${x.level}" data-slot="${s.slot}">${opt("", t("Choose…"), pick.choice?.value)}${feat.choice.options.map((o) => opt(o.value, o.label, pick.choice?.value)).join("")}</select>`;
        else if (feat?.choice?.kind === "skill") choice = `<select data-on="featChoice" data-l="${x.level}" data-slot="${s.slot}">${opt("", t("Choose a skill…"), pick.choice?.value)}${cat.skills.filter((sk) => !sk.arbitrary).map((sk) => opt(sk.key, sk.label, pick.choice?.value)).join("")}</select>`;
        else if (feat?.choice?.kind === "skills") {
          // Skill Mastery: 3 + the Intelligence modifier at that level (at least 1)
          const n = Math.max(1, 3 + Math.floor(((x.abilities?.int ?? 10) - 10) / 2));
          const keys = String(pick.choice?.value ?? "").split(",").filter(Boolean);
          const skillOpts = (sel) => opt("", t("Choose a skill…"), sel) + cat.skills.filter((sk) => !sk.arbitrary).map((sk) => opt(sk.key, sk.label, sel)).join("");
          choice = `<span class="row">${Array.from({ length: n }, (_, k) => `<select data-on="featSkills" data-l="${x.level}" data-slot="${s.slot}" data-k="${k}">${skillOpts(keys[k] ?? "")}</select>`).join("")}</span>`;
        }
        let why = "";
        if (feat?.special) why = `<span class="muted">${H("A class special ability: no prerequisites.")}${feat.choice?.kind === "skills" ? ` ${H("Choose its skills: 3 + your Intelligence modifier.")}` : ""}</span>`;
        else if (feat) {
          if (s.ignorePrereqs) why = `<span class="muted">${H("Prerequisites don't apply to this bonus feat.")}</span>`;
          else if (!feat.req) why = `<span class="muted">${H("Prerequisites not checked (A&M has no data for this feat).")}</span>`;
          else {
            const r = prereqs(feat, pick.choice, x, takenUpTo(d, x.level, s.slot), d);
            why = r.ok ? `<span class="good"><i class="fas fa-check"></i> ${H("Prerequisites met")}</span>` : `<span class="warn"><i class="fas fa-triangle-exclamation"></i> ${H("Needs {list}", { list: r.missing.map((m) => missingText(m, cat)).join(", ") })}</span>`;
            if (r.special) why += ` <span class="muted">(${H("also: {text}", { text: r.special })})</span>`;
          }
        }
        return `<div class="aam2-slot"><div class="what"><b>${H("Level {level}", { level: x.level })}</b><br>${esc(this.slotName(s.slot, x.level))}</div>
          <div class="pick"><input type="text" list="${listId}" data-on="feat" data-l="${x.level}" data-slot="${s.slot}" name="feat.${x.level}.${s.slot}" value="${esc(feat?.label ?? "")}" placeholder="${H("type or double-click to choose")}">${choice}
          ${feat ? `<button type="button" class="step-btn" data-act="clearFeat" data-l="${x.level}" data-slot="${s.slot}" title="${H("Remove")}"><i class="fas fa-xmark"></i></button>` : ""}</div>
          ${why ? `<div class="why">${why}</div>` : ""}</div>`;
      }).join("");
    }).join("");
    return `<h3>${H("Feats")}</h3>
      <div class="row"><label><input type="checkbox" data-on="qualified" ${this.qualifiedOnly ? "checked" : ""}> ${H("Only list feats whose prerequisites are met at that level")}</label></div>
      <p class="hint">${H("Feats at 1st level and every third level; bonus feats from the race and classes. Class features (as a fighter's or monk's own abilities) are added by D35E.")}</p>
      ${d.feats.some((f) => f.granted) ? `<p class="hint"><i class="fas fa-certificate"></i> ${H("Given by class features, without their prerequisites: {list}.", { list: d.feats.filter((f) => f.granted).map((f) => `${f.feat.name} (${t("level {level}", { level: f.level })}, ${f.granted.feature})`).join(", ") })}</p>` : ""}
      ${blocks}${lists.join("")}
      ${this.issueList(this.issuesFor("feats"))}`;
  }

  /* Spells */
  spellsHTML() {
    const p = this.plan, d = this.d, cat = this.cat;
    const casters = d.parts.filter((c) => castingKind(c.cls));
    if (!casters.length) return `<h3>${H("Spells")}</h3><p class="hint">${H("No spellcasting or psionic classes.")}</p>`;
    if (this.needExtras()) return `<h3>${H("Spells")}</h3><p class="hint">${H("Loading the spell lists…")}</p>`;
    const idx = cat.extrasData.spellIndex;
    const schoolOf = new Map(idx.map((x) => [x.uuid, x.school]));
    const blocks = casters.map(({ cls, levels }) => {
      const kind = castingKind(cls), list = p.spells?.[cls.uuid] ?? [];
      const spont = kind === "book" && !!cls.casting?.spontaneous; // a spontaneous wizard: casts any spell of its book
      const score = d.abilities[cls.casting?.ability || "int"];
      const spec = specFor(p, cat, cls);
      const specLevels = spec.kind && !spec.noSlot && (spec.kind === "domains" ? spec.domains.length : spec.school) ? specialLevels(cls, levels, score) : [];
      // Can this spell go in its level's special slot? (a domain spell; a spell of the specialist's school)
      const canSpecial = (x) => specLevels.includes(x.level) && (spec.kind === "domains" || spec.arcane ? !!x.domain : schoolOf.get(x.uuid) === spec.school?.key);
      const perDay = slots(cls, levels, score), known = kind === "known" ? knownCounts(cls, levels) : [];
      const powers = kind === "powers";
      const maxSl = powers ? Math.max(powerMaxAt(cls, levels), ...list.map((x) => x.level)) : Math.max(perDay.reduce((m, v, sl) => (v >= 0 ? sl : m), -1), known.reduce((m, v, sl) => (v > 0 ? sl : m), -1));
      const rows = [];
      for (let sl = powers ? 1 : 0; sl <= maxSl; sl++) {
        const here = list.map((s, i) => ({ ...s, i })).filter((s) => s.level === sl);
        const prepared = here.reduce((n, s) => n + (s.prepared || 0), 0);
        const head = powers ? H("{n} known", { n: here.length }) : kind === "known" ? H("{n} known of {max}; {day} a day", { n: here.length, max: known[sl] ?? 0, day: Math.max(0, perDay[sl] ?? 0) })
          : spont ? H("{n} in the spellbook; {day} a day, cast spontaneously", { n: here.length, day: Math.max(0, perDay[sl] ?? 0) })
          : kind === "book" ? H("{n} in the spellbook; {prep} of {day} prepared", { n: here.length, prep: prepared, day: Math.max(0, perDay[sl] ?? 0) })
          : H("{prep} of {day} prepared", { prep: prepared, day: Math.max(0, perDay[sl] ?? 0) });
        const slotNote = specLevels.includes(sl) ? ` · ${H(spec.kind === "domains" || spec.arcane ? "+1 domain slot" : "+1 specialty slot")}`
          : spont && spec.kind === "school" && spec.school && !spec.noSlot && sl >= 1 && (perDay[sl] ?? -1) >= 0 ? ` · ${H("+1 a day for {school} spells", { school: spec.school.label })}` : "";
        const listId = `aam2-sp-${cls.uuid.replace(/\W/g, "")}-${sl}`;
        rows.push(`<tr><td colspan="3"><b>${H("Level {level}", { level: sl })}</b> <span class="hint">${head}${slotNote}</span>
          <span style="float:right"><input type="text" list="${listId}" name="addsp.${cls.uuid}.${sl}" placeholder="${H(powers ? "add a power" : "add a spell")}" style="width:13em;height:1.7em">
          <button type="button" class="step-btn" data-act="addSpell" data-cls="${cls.uuid}" data-sl="${sl}"><i class="fas fa-plus"></i></button></span>
          <datalist id="${listId}">${listFor(idx, cls, sl).map((s) => `<option value="${esc(s.name)}">`).join("")}</datalist></td></tr>`);
        for (const s of here) rows.push(`<tr><td>${esc(s.name)}${isSrd(s) ? "" : ` <small class="hint">${H("non-SRD")}</small>`}${s.domain ? ` <small class="hint">${H("domain")}</small>` : ""}${canSpecial(s) ? ` <label class="hint" title="${H(spec.kind === "domains" || spec.arcane ? "Prepared in this level's domain slot" : "Prepared in this level's specialty slot")}"><input type="radio" name="spx.${cls.uuid}.${sl}" data-on="setSpecial" data-cls="${cls.uuid}" data-i="${s.i}" ${s.special ? "checked" : ""}> ${H("slot")}</label>` : ""}</td><td class="n">${kind === "known" || powers || spont ? "" : `${H("Prepared")} <input type="text" inputmode="numeric" data-on="spPrepared" data-cls="${cls.uuid}" data-i="${s.i}" name="spp.${cls.uuid}.${s.i}" value="${s.prepared || 0}">`}</td>
          <td class="n"><button type="button" class="step-btn" data-act="removeSpell" data-cls="${cls.uuid}" data-i="${s.i}" title="${H("Remove")}"><i class="fas fa-xmark"></i></button></td></tr>`);
      }
      const how = { book: /*t*/"Spellbook: every SRD 0-level spell, 3 + Int modifier 1st-level spells, 2 new spells a level, and spells found adventuring; prepared each day.", known: /*t*/"Spells known (cast spontaneously).", prepared: /*t*/"The whole class list (every SRD spell, and non-SRD spells by the module setting); some prepared each day.",
        powers: /*t*/"Powers known, manifested with power points (D35E keeps the points on the sheet)." }[kind];
      const howText = spont ? /*t*/"Spellbook, cast spontaneously: every SRD 0-level spell, 3 + Int modifier 1st-level spells, 2 new spells a level, and spells found adventuring; it casts any of them with its spells a day." : cls.casting?.aamSpontaneous && kind === "known" ? /*t*/"Spells known, cast spontaneously (spontaneous casting)." : how;
      const powerLine = powers ? `<p class="hint"><b>${H("{n} of {max} powers known, up to level {top}; about {pp} power points a day.", { n: list.length, max: powersKnownAt(cls, levels), top: powerMaxAt(cls, levels), pp: powerPointsAt(cls, levels, score) })}</b></p>` : "";
      const inBooks = kind !== "known" && bookRule()?.(cls);
      // Domains (cleric) or specialist school (wizard)
      let specHtml = "";
      const sp = p.specs?.[cls.uuid] ?? {};
      if (spec.kind === "domains") {
        const all = cat.list.domains ?? [];
        const sel = (i) => `<select data-on="setDomain" data-cls="${cls.uuid}" data-i="${i}">${opt("", "—", sp.domains?.[i] ?? "")}${all.map((x) => opt(x.uuid, domainAllowed(x, p.alignment) ? x.label : `${x.label} (${t("alignment")})`, sp.domains?.[i] ?? "")).join("")}</select>`;
        specHtml = all.length ? `<div class="form-group"><label>${H("Domains")}</label>${sel(0)} ${sel(1)}</div><p class="hint">${H("Two domains: their granted powers, and one domain spell slot at each spell level (SRD). The domains' feats and spells go on the actor.")}</p>`
          : `<p class="hint">${H("No domains found: D35E's Spell Schools and Domains compendium isn't available.")}</p>`;
      } else if (spec.kind === "school") {
        const schools = cat.list.schools ?? [];
        const key = spec.school?.key;
        // Domain wizard (Unearthed Arcana): an arcane domain instead of a school
        const arcane = canArcaneDomain(cls) ? cat.list.arcaneDomains ?? [] : [];
        const arcaneOpts = arcane.length ? `<optgroup label="${H("Domain wizard (Unearthed Arcana)")}">${arcane.map((x) => opt(x.uuid, x.label, sp.school ?? "")).join("")}</optgroup>` : "";
        specHtml = schools.length || arcane.length ? `<div class="form-group"><label>${H(arcane.length ? "Specialist school or arcane domain" : "Specialist school")}</label><select data-on="setSchool" data-cls="${cls.uuid}">${opt("", t("None (generalist)"), sp.school ?? "")}${schools.length && arcane.length ? `<optgroup label="${H("Specialist school")}">` : ""}${schools.map((x) => opt(x.uuid, x.label, sp.school ?? "")).join("")}${schools.length && arcane.length ? "</optgroup>" : ""}${arcaneOpts}</select></div>
          ${spec.arcane ? `<p class="hint">${H("A domain wizard has no prohibited schools. Its domain spells go in its spellbook as soon as it can cast them (they don't count against the spells it learns), it casts them at +1 caster level, and it prepares one more spell of each spell level, from its domain (Unearthed Arcana).")}${spont ? ` ${H("Cast spontaneously: one more spell a day of each spell level, for its domain spells only.")}` : ""}</p>`
          : spec.school ? `<div class="form-group"><label>${H(prohibitedCount(key) === 1 ? "Prohibited school (1)" : "Prohibited schools (2)")}</label><span class="row">${SCHOOLS.filter((k) => k !== key).map((k) => `<label><input type="checkbox" data-on="prohibit" data-cls="${cls.uuid}" value="${k}" ${spec.prohibited.includes(k) ? "checked" : ""}> ${H(SCHOOL_NAMES[k])}</label>`).join(" ")}</span></div>
          <p class="hint">${H(spont ? "A spontaneous specialist casts one more spell a day of each spell level, of its school only (the school feat on the sheet says so; D35E doesn't check it), and never learns or casts its prohibited schools' spells." : "A specialist prepares one more spell of its school at each spell level, and never learns or casts its prohibited schools' spells (SRD).")}</p>` : ""}`
          : `<p class="hint">${H("No schools found: D35E's Spell Schools and Domains compendium isn't available.")}</p>`;
      }
      return `<fieldset><legend>${esc(cls.name)} ${levels}</legend><p class="hint">${H(howText)}${inBooks ? ` ${H("Curios' spellbook rule is on: these spells are written in spellbook items (100 pages each), and the day's spells are prepared from them.")}` : ""}</p>
        ${powerLine}${specHtml}
        <div class="row"><button type="button" data-act="clearSpells" data-cls="${cls.uuid}"><i class="fas fa-eraser"></i> ${H("Clear")}</button></div>
        <table class="aam2-t">${rows.join("")}</table></fieldset>`;
    }).join("");
    return `<h3>${H("Spells")}</h3>
      ${this.issueList(this.issuesFor("spells"))}
      ${this.mode === "edit" ? `<div class="row"><button type="button" data-act="fillSpells"><i class="fas fa-wand-magic-sparkles"></i> ${H("Add spells for new levels")}</button><span class="hint">${H("Keeps the actor's spells and adds what new levels bring: spells known or in the spellbook, and prepared spells up to the day's slots.")}</span></div>`
        : `<div class="row"><button type="button" data-act="fillSpells"><i class="fas fa-wand-magic-sparkles"></i> ${H("Choose for me")}</button><span class="hint">${H("Fills every caster class by its profile's favourite spells, then at random.")}</span></div>`}
      ${blocks}`;
  }

  /* Equipment */
  equipmentHTML() {
    const p = this.plan, d = this.d, cat = this.cat;
    if (!p.levels.length) return `<h3>${H("Equipment")}</h3><p class="hint">${H("Add levels first (Classes and levels).")}</p>`;
    if (this.needExtras()) return `<h3>${H("Equipment")}</h3><p class="hint">${H("Loading item prices…")}</p>`;
    const ex = cat.extrasData, items = p.gear?.items ?? [];
    const edit = this.mode === "edit", fromLevel = this.before?.levels?.length ?? 0;
    const value = gearValue(items, ex), isNpc = p.kind === "npc";
    // A 1st-level PC: its class's SRD starting gold (average, or rolled here) instead of the wealth table
    const start = !edit && !isNpc && d.level === 1 ? startingGold(p, cat, ex.gear) : null;
    const tradeIn = edit ? tradeInTotal(p, this.canSell()) : 0;
    const wealth = edit ? Math.max(0, wealthFor(p.kind, d.level, ex.gear) - (fromLevel ? wealthFor(p.kind, fromLevel, ex.gear) : 0)) + tradeIn : wealthFor(p.kind, d.level, ex.gear, { start });
    const main = [...d.classes].sort((a, b) => b.levels - a.levels)[0]?.cls;
    const size = this.sizeOf();
    const key = (b) => String(b ?? "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim(); // as the item index keys names
    const rows = items.map((g, i) => {
      const price = gearPrice(g, ex.items.get(key(g.base))?.price ?? 0);
      const found = ex.items.has(key(g.base));
      const tag = g.kit ? ` <small class="muted">${H("kit")}</small>` : "", free = g.free ? ` <small class="muted">${H("(free)")}</small>` : "";
      const many = g.kind === "item" || g.kind === "ammo";
      const qty = many ? `<input type="number" min="1" step="1" data-on="gearQty" data-i="${i}" value="${g.qty || 1}" style="width:4.5em" title="${H("Quantity")}">` : "";
      const lb = gearWeight(g, this.gearRef(g), size);
      return `<tr class="${found ? "" : "dim"}"><td>${esc(many ? gearLabel({ ...g, qty: 1 }) : gearLabel(g))}${tag}${free}${found ? "" : ` <small class="warn">${H("(not in your compendiums)")}</small>`}</td><td class="n">${qty}</td><td class="n">${lb ? `${Math.round(lb * 10) / 10} lb` : ""}</td><td class="n">${price.toLocaleString()} gp</td>
        <td class="n"><button type="button" class="step-btn" data-act="removeGear" data-i="${i}" title="${H("Remove")}"><i class="fas fa-xmark"></i></button></td></tr>`;
    }).join("");
    const names = [...ex.items.values()].map((x) => x.name);
    // Carrying capacity (SRD): the gear's weight against the character's Strength and size
    const lbAll = Math.round(items.reduce((n, g) => n + gearWeight(g, this.gearRef(g), size), 0) * 10) / 10;
    const cap = carryingCapacity(d.abilities?.str ?? 10, size);
    const loadName = lbAll > cap.heavy ? t("too heavy to carry") : lbAll > cap.medium ? t("heavy load") : lbAll > cap.light ? t("medium load") : t("light load");
    const load = items.length && !edit ? `<p class="hint">${H("Load: {weight} lb, a {load} (Str {str}{size}: light up to {light} lb, medium {medium}, heavy {heavy}). Coins are not counted.", { weight: lbAll, load: loadName, str: d.abilities?.str ?? 10, size: size === "sm" ? `, ${t("Small")}` : "", light: cap.light, medium: cap.medium, heavy: cap.heavy })}</p>` : "";
    return `<h3>${H("Equipment")}</h3>
      ${edit ? this.actorGearHTML() : ""}
      <div class="row">${edit ? "" : `<button type="button" data-act="fillGear"><i class="fas fa-shield-halved"></i> ${H("Standard gear")}</button>`}
        <span class="hint">${main && gearTable(main, ex.gear) ? H("The DMG's NPC gear for a level {level} {cls}.", { level: d.level, cls: main.name }) : H("No gear table for this class.")}</span>
        <span style="flex:1"></span><button type="button" data-act="clearGear"><i class="fas fa-eraser"></i> ${H("Clear")}</button></div>
      ${edit ? "" : `<div class="row"><label title="${H("The class kits of Ultimate Equipment (Open Game Content), from D35E's own items: backpack, bedroll, rations, torches and the like, with the class's own tools (holy symbol, spell component pouch, thieves' tools, instrument; a wizard's spellbook, free).")}"><input type="checkbox" data-on="kit" ${wantsKit(p) ? "checked" : ""}> ${H("Adventuring kit")}</label>
        <span class="hint">${(() => { const k = kitGear(p, cat, ex.gear, d); return k.length ? H("{kit}: {n} items, {gp} gp", { kit: k[0].kit, n: k.length, gp: gearValue(k, ex).toLocaleString() }) : H("No kit for this class."); })()}</span></div>`}
      <table class="aam2-t"><tr><th>${H("Item")}</th><th class="n">${H("Qty")}</th><th class="n">${H("Weight")}</th><th class="n">${H("Value")}</th><th></th></tr>${rows || `<tr><td colspan="5" class="muted">${H("No gear yet.")}</td></tr>`}</table>
      ${load}
      ${this.issueList(this.issuesFor("equipment"))}
      <div class="row" style="margin:4px 0"><b>${H("Add")}</b>
        <select name="ag.kind">${[["weapon", /*t*/"Weapon"], ["armor", /*t*/"Armor"], ["shield", /*t*/"Shield"], ["ammo", /*t*/"Ammunition (20)"], ["item", /*t*/"Magic or other item"]].map(([k, l]) => opt(k, t(l))).join("")}</select>
        <input type="text" name="ag.base" list="aam2-items" placeholder="${H("name, e.g. Longsword or Ring of Protection +1")}" style="flex:1;min-width:14em">
        <datalist id="aam2-items">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
        <label>${H("Qty")} <input type="number" name="ag.qty" min="1" step="1" placeholder="1" style="width:3.5em" title="${H("How many (ammunition: 20 when blank)")}"></label>
        <label><input type="checkbox" name="ag.mw"> ${H("Masterwork")}</label>
        <label>${H("Bonus")} <input type="number" name="ag.bonus" min="0" max="5" value="0" style="width:3.5em"></label>
        <button type="button" data-act="addGear"><i class="fas fa-plus"></i></button></div>
      ${this.armory ? `<div class="row" style="margin:0 0 4px">
        <label>${H("Material")} <select name="ag.material">${opt("", t("—"))}${this.armory.materials.map((m) => opt(m, m)).join("")}</select></label>
        <label style="flex:1">${H("Special abilities")} <input type="text" name="ag.abilities" list="aam2-abilities" placeholder="${H("e.g. Flaming, Keen (commas between)")}" style="width:100%"></label>
        <datalist id="aam2-abilities">${[...new Set([...this.armory.weapon, ...this.armory.armor])].sort().map((n) => `<option value="${esc(n)}">`).join("")}</datalist></div>
        <p class="hint" style="margin:0 0 4px">${H("Arms, armor and ammunition of a special material or with special abilities are checked and priced by Axecleft's Armory (special abilities need a +1 bonus or more).")}</p>`
      : `<p class="hint" style="margin:0 0 4px">${H("Special materials and abilities need Axecleft's Armory.")}</p>`}
      <fieldset><legend>${H("Wealth")}</legend>
        ${start ? `<div class="row">${H("Starting gold of a 1st-level {cls}: {formula} gp (average {average} gp)", { cls: cat.classes.get(p.levels[0].cls)?.name ?? "", formula: start.formula, average: start.average.toLocaleString() })}
          <button type="button" data-act="rollStartGold" title="${H("Roll the starting gold")}"><i class="fas fa-dice"></i> ${start.rolled ? H("Rolled {gp} gp: roll again", { gp: start.gp.toLocaleString() }) : H("Roll")}</button>
          ${start.rolled ? `<button type="button" data-act="averageStartGold" title="${H("Use the average")}"><i class="fas fa-rotate-left"></i></button>` : ""}</div>` : ""}
        <div>${edit ? (tradeIn ? H(isNpc ? "NPC gear value gained from level {from} to {level}, plus {gp} gp traded in" : "Character wealth gained from level {from} to {level}, plus {gp} gp traded in", { from: fromLevel, level: d.level, gp: tradeIn.toLocaleString() }) : H(isNpc ? "NPC gear value gained from level {from} to {level}" : "Character wealth gained from level {from} to {level}", { from: fromLevel, level: d.level })) : H(isNpc ? "NPC gear value at level {level}" : start ? "Starting gold" : "Character wealth at level {level}", { level: d.level })}: <b>${wealth.toLocaleString()} gp</b> · ${H("Gear")}: <b>${value.toLocaleString()} gp</b> · ${H("Left")}: <b class="${wealth - value < 0 ? "bad" : ""}">${(wealth - value).toLocaleString()} gp</b></div>
        <label><input type="checkbox" data-on="loot" ${p.gear?.loot !== false ? "checked" : ""}> ${H("Roll treasure for what's left (gems, art and magic items from the SRD Treasure table at the character's level, up to that value; no coins; the rest as platinum)")}</label>
        ${edit ? `<p class="hint">${H("Treasure arms are only added where the actor has nothing equipped (an edit never takes items away).")}</p>` : ""}
        <p class="hint">${H("Masterwork and magic arms and armor are made by Axecleft's Armory when it's active; treasure needs the Treasure Generator (Armory, Curios or Gemstones).")}</p>
      </fieldset>`;
  }

  /** Random page: the build of a chosen class (Random, or one of them), when the class has several. */
  buildPick(clsUuid, key) {
    const list = variantsOf(this.cat.classes.get(clsUuid), this.profileData());
    if (!list.length) return "";
    const sel = this.ropts[key] ?? "random";
    return `<div class="form-group"><label>${H("Build")}</label><select data-ropt="${key}">${opt("random", t("Random"), sel)}${list.map((v) => opt(v.key, t(v.label), sel)).join("")}</select></div>`;
  }
  /* Random */
  randomOptions() {
    for (const el of this.root?.querySelectorAll?.("[data-ropt]") ?? []) this.ropts[el.dataset.ropt] = el.type === "checkbox" ? el.checked : el.value;
    remember(this.ropts);
    const r = this.ropts;
    // A row with levels but a Random class gets a random class of that many levels
    // "" on the first class and "random" on the second: a random class (a second class only when one is asked for)
    const second = !!(r.cls2 || Number(r.lvl2));
    const row1 = { cls: r.cls1 || "", levels: Number(r.lvl1) || 0 }, row2 = { cls: r.cls2 === "random" ? "" : r.cls2 || "", levels: Number(r.lvl2) || 0 };
    const gestalt = r.gestalt === true || r.gestalt === "true";
    const classes = gestalt ? [row1, row2] : [...(row1.cls || row1.levels || second ? [row1] : []), ...(second ? [row2] : [])];
    const variants = {};
    if (row1.cls && r.var1) variants[row1.cls] = r.var1;
    if (row2.cls && r.var2) variants[row2.cls] = r.var2;
    return { kind: r.kind || "character", race: r.race || "", sex: r.sex || "", alignment: r.alignment || "", classes, level: Number(r.level) || 0, gestalt, variants, prestige: gestalt ? "" : r.prestige || "",
      method: r.method || setting("abilityMethod", "elite"), budget: setting("pointBudget", 25), hpMethod: r.hp || setting("hpMethod", "average"), maxFirst: true };
  }
  randomHTML() {
    const r = this.ropts, cat = this.cat;
    const any = (label) => opt("", label);
    const kinds = [["base", /*t*/"Base classes"], ["prestige", /*t*/"Prestige classes"], ["racial", /*t*/"Racial HD"]];
    const clsOpts = (sel, blank) => any(blank) + [...kinds, ["variant", /*t*/"Variant classes (Unearthed Arcana)"]].map(([k, l]) => { const list = cat.list.classes.filter((c) => (k === "variant" ? !!c.variant : c.kind === k && !c.variant)); return list.length ? `<optgroup label="${H(l)}">${list.map((c) => opt(c.uuid, c.label, sel)).join("")}</optgroup>` : ""; }).join("");
    const folders = [...(game.folders ?? [])].filter((f) => f.type === "Actor");
    return `<h3>${H("Random character")}</h3>
      <p class="hint">${H("Leave anything on Random and it's chosen for you. Each class follows its profile (modelled on the DMG's sample NPCs): ability order, skills, feats and likely alignments.")}</p>
      <div class="cols2"><div>
        <div class="form-group"><label>${H("Character or NPC")}</label><select data-ropt="kind">${opt("character", t("Player character (character sheet)"), r.kind)}${opt("npc", t("NPC (NPC sheet)"), r.kind)}</select></div>
        <div class="form-group"><label>${H("Race")}</label><select data-ropt="race">${any(t("Random (common races)"))}${cat.list.races.map((x) => opt(x.uuid, x.label, r.race)).join("")}</select></div>
        <div class="form-group"><label>${H("Sex")}</label><select data-ropt="sex">${any(t("Random"))}${opt("Male", t("Male"), r.sex)}${opt("Female", t("Female"), r.sex)}</select></div>
        <div class="form-group"><label>${H("Alignment")}</label><select data-ropt="alignment">${any(t("Random (fits the class)"))}${R.ALIGNMENTS.map((a) => opt(a, alignLabel(a), r.alignment)).join("")}</select></div>
      </div><div>
        <div class="form-group"><label>${H("Class")}</label><select data-ropt="cls1">${clsOpts(r.cls1, t("Random"))}</select><input type="number" data-ropt="lvl1" min="0" max="40" value="${esc(r.lvl1 ?? "")}" placeholder="${H("Levels")}"></div>
        ${this.buildPick(r.cls1, "var1")}
        <div class="form-group"><label>${H("Second class")}</label><select data-ropt="cls2">${clsOpts(r.cls2, t("None")).replace("</option>", `</option>${opt("random", t("Random"), r.cls2)}`)}</select><input type="number" data-ropt="lvl2" min="0" max="40" value="${esc(r.lvl2 ?? "")}" placeholder="${H("Levels")}"></div>
        ${r.cls2 && r.cls2 !== "random" ? this.buildPick(r.cls2, "var2") : ""}
        <div class="form-group"><label>${H("Gestalt")}</label><label style="flex:0 0 auto"><input type="checkbox" data-ropt="gestalt" ${r.gestalt === true || r.gestalt === "true" ? "checked" : ""}></label><span class="hint" style="flex:1">${H("Two classes at every level: the class and second class above (random when not chosen), each at the total level.")}</span></div>
        <div class="form-group"><label>${H("Total level")}</label><input type="number" data-ropt="level" min="0" max="40" value="${esc(r.level ?? "")}" placeholder="${H("random")}"><span class="hint" style="flex:1">${H("blank: 1 to 5 (or the class levels given)")}</span></div>
        <div class="form-group"><label>${H("Prestige class")}</label><select data-ropt="prestige">${opt("", t("None"), r.prestige)}${opt("random", t("Random, once the character qualifies"), r.prestige)}${cat.list.classes.filter((c) => c.kind === "prestige" && !c.variant).map((c) => opt(c.uuid, c.label, r.prestige)).join("")}</select></div>
        <p class="hint">${H("A prestige class from the first level the character meets its requirements (from 6th for a random one), and the levels after it in that class. Its choices up to then stay; not for gestalt characters.")}</p>
        <div class="form-group"><label>${H("Ability scores")}</label><select data-ropt="method">${[["elite", /*t*/"Elite array (15, 14, 13, 12, 10, 8)"], ["nonelite", /*t*/"Nonelite array (13, 12, 11, 10, 9, 8)"], ["roll", /*t*/"Roll 4d6, drop the lowest"], ["pointbuy", /*t*/"Point buy"]].map(([k, l]) => opt(k, t(l), r.method || setting("abilityMethod", "elite"))).join("")}</select></div>
        <div class="form-group"><label>${H("Hit points")}</label><select data-ropt="hp">${R.HP_METHODS.map((k) => opt(k, t(HP_LABELS[k]), r.hp || setting("hpMethod", "average"))).join("")}</select></div>
      </div></div>
      <fieldset><legend>${H("Several at once")}</legend>
        <div class="form-group"><label>${H("How many")}</label><input type="number" data-ropt="count" min="1" max="50" value="${esc(r.count ?? 1)}"><span class="hint" style="flex:1">${H("The button at the bottom makes that many straight into the folder, without Review.")}</span></div>
        ${game.user?.isGM ? `<div class="form-group"><label>${H("Owner")}</label><select data-ropt="owner">${ownerOpts(r.owner ?? "")}</select></div>` : ""}
        <div class="form-group"><label>${H("Folder")}</label><select data-ropt="folder">${opt("", t("(none)"), r.folder)}${folders.map((f) => opt(f.id, f.name, r.folder)).join("")}</select></div>
      </fieldset>
      <p class="hint">${H("Generate makes one and opens it on Review, where any part can be rolled again or changed on the steps before the actor is created.")}</p>`;
  }

  /* Review */
  reviewHTML() {
    const p = this.plan, d = this.d, cat = this.cat;
    const byStep = STEPS.filter(([k]) => k !== "review").map(([k, l]) => [k, l, this.issuesFor(k)]).filter(([, , list]) => list.length);
    const skills = Object.entries(d.ranks).filter(([, r]) => r > 0).map(([k, r]) => {
      const sub = p.subSkills.find((s) => s.tag === k), sk = cat.skills.find((s) => s.key === (sub ? sub.parent : k));
      return `${esc(sub ? `${sk?.label ?? sub.parent}: ${sub.name}` : sk?.label ?? k)} ${r}`;
    });
    const feats = d.feats.map((f) => esc(f.choice?.label ? `${f.feat.name.replace(/\s*\([^)]*\)\s*$/, "")} (${f.choice.label})` : f.feat.name));
    const folders = [...(game.folders ?? [])].filter((f) => f.type === "Actor");
    const rr = p._random ? `<div class="row" style="margin:2px 0 8px"><b>${H("Roll again")}:</b>
      ${[["name", /*t*/"Name", "fa-signature"], ["abilities", /*t*/"Abilities", "fa-dice-d20"], ["hp", /*t*/"Hit points", "fa-heart"], ["skills", /*t*/"Skills", "fa-list-check"], ["feats", /*t*/"Feats", "fa-star"], ["spells", /*t*/"Spells", "fa-wand-sparkles"], ["gear", /*t*/"Equipment", "fa-shield-halved"], ["all", /*t*/"Everything", "fa-dice"]]
        .map(([k, l, i]) => `<button type="button" data-act="reroll" data-part="${k}"><i class="fas ${i}"></i> ${H(l)}</button>`).join("")}
      <button type="button" data-act="randomPage"><i class="fas fa-sliders"></i> ${H("Random settings")}</button></div>
      <p class="hint">${H("Rolling the abilities again redoes skills and feats too. Change anything on the steps before creating.")}</p>` : "";
    const edit = this.mode === "edit";
    const changes = edit ? planChanges(this.before, p, cat) : [];
    const fixable = edit && (this.issues ?? []).some((i) => ["unspent", "overspent", "emptySlot", "prereq", "noSlot", "increase"].includes(i.code));
    return `<div class="aam2-review"><h3>${H("Review")}</h3>${rr}${this.editBanner()}
      <h4>${H("Character")}</h4>
      <div>${esc(p.name || t("(no name)"))} — ${esc(d.race?.name ?? t("no race"))}, ${esc(d.classes.map((c) => `${c.cls.name} ${c.levels}${p.variants?.[c.cls.uuid] ? ` (${t(p.variants[c.cls.uuid])})` : ""}`).join(" / ") || t("no class"))}, ${esc(alignLabel(p.alignment))}</div>
      <div>${R.ABILITIES.map((a) => `${esc(abilityLabel(a))} <b>${d.abilities[a]}</b> (${sign(d.mods[a])})`).join(" · ")}</div>
      <div>${H("HP")} <b>${d.hp}</b> · ${H("BAB")} <b>${sign(d.bab)}</b> · ${H("Fort")} <b>${sign(d.saves.fort + d.mods.con)}</b> ${H("Ref")} <b>${sign(d.saves.ref + d.mods.dex)}</b> ${H("Will")} <b>${sign(d.saves.will + d.mods.wis)}</b></div>
      <h4>${H("Skills (ranks)")}</h4><div>${skills.join(", ") || "—"}</div>
      <h4>${H("Feats")}</h4><div>${feats.join(", ") || "—"}</div>
      ${this.featuresReview()}
      ${Object.entries(p.spells ?? {}).filter(([, l]) => l?.length).map(([u, l]) => `<h4>${H("Spells: {cls}", { cls: cat.classes.get(u)?.name ?? "?" })}</h4>${this.specLine(u)}<div>${[...new Set(l.map((s) => s.level))].sort((a, b) => a - b).map((sl) => `<b>${sl}:</b> ${l.filter((s) => s.level === sl).map((s) => esc(s.name) + (s.prepared > 1 ? ` ×${s.prepared}` : "") + (s.special ? ` (${t("slot")})` : "")).join(", ")}`).join(" · ")}</div>`).join("")}
      <h4>${H("Equipment")}</h4><div>${(p.gear?.items ?? []).map((g) => esc(gearLabel(g))).join(", ") || "—"}${p.gear?.loot !== false ? ` <span class="muted">${H("+ treasure for the rest of the wealth")}</span>` : ""}</div>
      <h4 class="aam2-check">${H("To check")}</h4>
      ${fixable ? `<div class="row"><button type="button" data-act="fillMissing"><i class="fas fa-wand-magic-sparkles"></i> ${H("Fill in what's missing")}</button><span class="hint">${H("Skills of the levels with points left, empty feat slots and feats whose prerequisites aren't met any more, ability increases and spells of new levels, by the class profiles. What you chose stays.")}</span></div>` : ""}
      ${byStep.length ? byStep.map(([k, l, list]) => `<div><a data-act="goto" data-to="${k}"><b>${H(l)}</b></a>${this.issueList(list)}</div>`).join("") : `<p class="good"><i class="fas fa-check"></i> ${H("Everything follows the rules.")}</p>`}
      ${edit ? `<h4>${H("Changes")}</h4>
      ${changes.length ? `<ul style="margin:2px 0;padding-left:1.2em">${changes.map((c) => `<li>${esc(changeText(c, cat))}</li>`).join("")}</ul>` : `<p class="hint">${H("Nothing has changed yet.")}</p>`}
      <div class="form-group"><label></label><label style="flex:1"><input type="checkbox" name="backup" ${setting("backupBeforeEdit", true) ? "checked" : ""}> ${H("Make a copy of the actor first (in the folder A&M backups)")}</label></div>
      <div class="form-group"><label></label><label style="flex:1"><input type="checkbox" name="openSheet" checked> ${H("Open the sheet when it's done")}</label></div>
      <p class="hint">${H("Apply changes writes only what changed: classes and levels (as D35E's level records), ability scores, skill ranks, the feats and spells added or removed. Gear, effects, class features and anything A&M didn't read stay on the actor.")}</p>
    </div>` : `<h4>${H("Create")}</h4>
      <div class="form-group"><label>${H("Folder")}</label><select name="folder">${opt("", t("(none)"), setting("folder", ""))}${folders.map((f) => opt(f.id, f.name, setting("folder", ""))).join("")}</select></div>
      ${game.user?.isGM && canCreate() ? `<div class="form-group"><label>${H("Owner")}</label><select name="owner">${ownerOpts("")}</select><span class="hint" style="flex:1">${H("A player who owns the new actor (the GM always does).")}</span></div>` : ""}
      <div class="form-group"><label></label><label style="flex:1"><input type="checkbox" name="openSheet" checked> ${H("Open the sheet when it's made")}</label></div>
      <p class="hint">${H("The actor is made with D35E's level-up progression on, so its level records (class, HP and skills per level) show on the sheet.")}</p>
    </div>`}`;
  }

  /* Summary */
  sideHTML() {
    const p = this.plan, d = this.d;
    const errors = this.issues.filter((i) => i.severity === "error").length, warns = this.issues.filter((i) => i.severity === "warn").length;
    const left = d.perLevel.reduce((n, x) => n + Math.max(0, x.skillPoints.left), 0);
    const open = d.perLevel.reduce((n, x) => n + x.slots.filter((s) => !p.levels[x.level - 1].feats.some((f) => f.slot === s.slot && f.uuid)).length, 0);
    return `<img class="portrait" src="${esc(p.img || MYSTERY)}" onerror="this.onerror=null;this.src='${MYSTERY}'" alt="">
      <h3>${esc(p.name || t("(no name)"))}</h3>
      <div class="sub">${esc(d.race?.name ?? t("no race"))}<br>${esc(d.classes.map((c) => `${c.cls.name} ${c.levels}`).join(" / ") || t("no class"))}</div>
      <table>
        <tr><td>${H("Level")}</td><td class="n">${d.level}${d.ecl !== d.level ? ` (${H("ECL")} ${d.ecl})` : ""}</td></tr>
        <tr><td>${H("HP")}</td><td class="n">${d.hp}</td></tr>
        <tr><td>${H("BAB")}</td><td class="n">${sign(d.bab)}</td></tr>
        <tr><td>${H("Fort / Ref / Will")}</td><td class="n">${sign(d.saves.fort + d.mods.con)} / ${sign(d.saves.ref + d.mods.dex)} / ${sign(d.saves.will + d.mods.wis)}</td></tr>
      </table>
      <div class="abil">${R.ABILITIES.map((a) => `<div><small>${esc(abilityLabel(a))}</small>${d.abilities[a]} <small>${sign(d.mods[a])}</small></div>`).join("")}</div>
      <table>
        <tr><td>${H("Skill points left")}</td><td class="n ${left ? "warn" : ""}">${left}</td></tr>
        <tr><td>${H("Feats to choose")}</td><td class="n ${open ? "warn" : ""}">${open}</td></tr>
      </table>
      <div class="issues">${errors ? `<div class="bad">${H("{n} rules broken", { n: errors })}</div>` : ""}${warns ? `<div class="warn">${H("{n} things to check", { n: warns })}</div>` : ""}
        ${errors || warns ? `<a data-step="review">${H("See them on Review")}</a>` : `<div class="good"><i class="fas fa-check"></i> ${H("All good")}</div>`}</div>`;
  }

  /* ---------- Creating ---------- */

  async create(btn) {
    const errors = this.issues.filter((i) => i.severity === "error");
    if (errors.length) {
      const ok = await (A()?.DialogV2 ?? foundry.applications.api.DialogV2).confirm({
        window: { title: t("Create actor") },
        content: `<p>${H("{n} rules are broken:", { n: errors.length })}</p>${this.issueList(errors)}<p>${H("Create the actor anyway?")}</p>`,
      });
      if (!ok) return;
    }
    const folder = this.root.querySelector('[name="folder"]')?.value ?? setting("folder", "") ?? "";
    const openSheet = this.root.querySelector('[name="openSheet"]')?.checked ?? true;
    btn.disabled = true;
    try {
      const actor = await this.working(t("Creating {name}…", { name: this.plan.name || t("the character") }), async (set) => {
        // Spells and gear never looked at: filled as their steps would (Choose for me, Standard gear)
        if (!this.plan._spellsFilled || !this.plan._equipmentFilled) {
          const data = await this.data();
          if (!this.plan._spellsFilled && !Object.values(this.plan.spells ?? {}).some((l) => l?.length)) { set(t("Choosing spells…")); await new Promise((r) => setTimeout(r, 0)); rollSpells(this.plan, this.cat, data, Math.random); }
          if (!this.plan._equipmentFilled && !this.plan.gear?.items?.length) { set(t("Choosing equipment…")); await new Promise((r) => setTimeout(r, 0)); rollGear(this.plan, this.cat, data); }
        }
        const owner = game.user?.isGM ? this.root.querySelector('[name="owner"]')?.value ?? "" : "";
        return createActor(this.plan, this.cat, { folder: folder || null, ownership: ownershipFor(owner) });
      });
      recent.add(actor);
      ui.notifications.info(t("{name} created.", { name: actor.name }));
      try { await game.settings.set(MOD, "folder", folder); } catch (e) { /* players */ }
      if (openSheet) actor.sheet?.render(true);
      if (!this._tourStash) store.set(null); // a tour's sample made into an actor leaves the character being built alone
    } catch (err) {
      console.error(`${MOD} | create`, err);
      ui.notifications.error(t("Couldn't create the actor: {error}", { error: err.message }));
    } finally { btn.disabled = false; }
  }

  _onClose(options) { super._onClose?.(options); this.endTourSample({ paint: false }); if (this.plan) this.plan._page = this.page; this.save(); }
}
