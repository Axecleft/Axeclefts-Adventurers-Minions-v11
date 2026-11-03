/**
 * Axecleft's Tools — shared menu for Axecleft's modules.
 *
 * Copy this same file into every Axecleft module and load it BEFORE the
 * module's own scripts (list it first under "esmodules" in module.json).
 *
 * Whichever module loads first creates the menu; every other active module
 * adds its own tools to it. The menu is its own "Axecleft's Tools" group on
 * the left toolbar (next to Game Master Tools); each tool is a button in it.
 *
 * Registering a tool (from any module, at load time or in an "init" hook):
 *
 *   globalThis.AxecleftTools.register({
 *     module: "traps-and-poisons",            // your module id
 *     name:   "random-trap",                  // unique within your module
 *     title:  "Random Trap Generator",        // menu label
 *     icon:   "fas fa-dice-d20",              // Font Awesome icon, or...
 *     img:    "icons/svg/trap.svg",           // ...an image (SVG works best); used instead of icon
 *     hint:   "Roll a random trap by CR",     // optional tooltip
 *     gmOnly: true,                           // optional, default true
 *     onClick: () => { ... }                  // what the tool does
 *   });
 *
 * Foundry v11 to v14 (version 9): AxecleftTools.DialogV2 (wait / confirm), AxecleftTools.AppV2 (a window class) and
 * AxecleftTools.onChatRender(fn) work the same on every Foundry version: on v13+ they are Foundry's own DialogV2,
 * ApplicationV2 and renderChatMessageHTML; on v11/v12 small stand-ins built on the classic Dialog and Application.
 *   AxecleftTools.DialogV2.wait({ window: { title }, content, buttons: [{ action, label, icon, default, callback(event, button) }],
 *     render(event, dialog), rejectClose })  → the button's callback result (button.form is the dialog's form), or its action.
 *   class MyWindow extends AxecleftTools.AppV2 { static DEFAULT_OPTIONS = { id, classes, window: { title, icon, resizable },
 *     position: { width, height } }; async _renderHTML() { return html; } _replaceHTML(html, content) { … } _onRender() { … } }
 *   this.element is the window's HTML element on every version.
 *
 * Searchable lists (version 7): AxecleftTools.enhanceDatalists(root) turns every <input list="…"> inside root
 * into a list that scrolls and stays on screen (the browser's own <datalist> popup doesn't scroll in Foundry).
 *
 * English names (version 8), for worlds in other languages (Babele-translated compendiums, items named in French…):
 *   AxecleftTools.enName(docOrIndexEntry, { pack })  → the item's English name. In order: our own flag (flags.world.axecleftEn),
 *     Babele's original name (flags.babele.originalName), an "en:Bastard Sword" tag, the English key in the Babele
 *     translation of its compendium, else its own name.
 *   await AxecleftTools.enIndex(pack, { fields })     → the compendium index as copies whose name is English
 *     (display: the name as shown), so name matching works in any language.
 *   AxecleftTools.classEn("Magicien")                  → "Wizard" (class names in translated spell lists).
 *   AxecleftTools.registerEnglishNames(module, names)  → names offered when a user gives an item its English name.
 * In a world not in English, naming or renaming an item asks for its English name (optional; Skip / Don't ask again),
 * and item sheets get an "English name" header button.
 *
 * Languages (version 8.2): AxecleftTools.t("English text {name}", { name }) → the text in the world's language, else the English.
 *   Each Axecleft module ships lang/languages.json (["fr", "es", "pt-BR", "pt-PT"]) and lang/<code>.json files of
 *   "English text": "translation" pairs; the files of every active Axecleft module are merged. Brazilian Portuguese falls
 *   back to European Portuguese (and the other way), then English. Text not translated yet stays in English.
 *   Settings registered by Axecleft modules get their names and hints translated once the files are loaded.
 *   Hook "axecleftLanguageLoaded" (lang) fires when they are.
 *
 * Grammar (version 8.3): names and phrases built from parts.
 *   AxecleftTools.compose("{kind} of {metamagic} {spell}[ ({level})]", { kind, metamagic: ["Empowered"], spell, level })
 *     → the pattern in the world's language (patterns are translated in lang/<code>.json like any text), with the
 *     language's rules from lang/<code>.grammar.json: list words, articles, agreement, elision, contractions, capitals.
 *   AxecleftTools.compose(pattern, slots, { lang: "en" }) → always English (the English name kept in flags.world.axecleftEn).
 *   { phrase: true }: a phrase inside a sentence (no capital letter added).
 *   Pattern syntax:  {slot}  a part (a list is joined with spaces);  {slot:and} / {slot:or}  a list as "A, B and C";
 *     {slot:a} / {slot:the}  with an article;  {slot:lower}  in lower case;  {slot:head}  the word the others agree with;
 *     [ … ]  an optional piece, left out when a part inside it is empty.
 *   A part is text, or a word { text, g: "m" | "f" | "n", pl: true, forms: { m, f, mp, fp }, role: "slot", as: "other text" }
 *   (the grammar file's "words" add these to plain text by the text: gender, agreeing forms, the part it moves to).
 *   {~sculpté/sculptée/sculptés/sculptées} in a pattern: a word that agrees with the head (masculine/feminine/plurals).
 *
 * Word files (version 8.4): lang/<code>.words.json, "English word": "translation", with a short notation:
 *   "Épée longue (f)" text and gender · "(f)" gender only (keeps Babele's name) · "acéré/acérée/acérés/acérées" agreeing forms ·
 *   "de feu (of)" the part of a name it moves to · markers can be combined: "(f, pl)". An object { text, g, pl, forms, role } works too.
 *   AxecleftTools.word("Flaming", { text: "Feu" }) → the word for compose(): the word file's, else the language file's, else the text given.
 *
 * If two modules ship different versions of this file, the newest one wins.
 */
const AXECLEFT_TOOLS_VERSION = 9.72; // 9.72: searchable lists take headings (<option data-heading label="Feats">) that divide the list; 9.71: the tours on Foundry v11 too (a Tour button in each window's title bar); 9.7: tours of each tab (Foundry v13+), in Tour Management and each window's ⋮ menu; 9.6: the Tool Suite settings button shows in each module's own settings (they all landed in one); 9.5: dice formulas with a function as the number of dice ("min(@cl,10)d6", D35E's Lightning Bolt) work on Foundry v14; 9.4: Join the Discord and Support on Patreon leave the Tools menu and the module settings for a welcome window at startup (turned off in the Tool Suite settings); 9.3: Support on Patreon and Join the Discord (buttons in each module's settings and in the menu); 9.2: the User Guide opens the wiki in Foundry's language (French, Spanish, Portuguese); 9.1: the User Guide button

(() => {
  const LAYER = "axecleftTools";
  const existing = globalThis.AxecleftTools;
  if (existing && existing.version >= AXECLEFT_TOOLS_VERSION) return;

  const tools = existing?.tools ?? new Map();

  /* ---------- Languages (version 8.2) ---------- */
  const AXECLEFT_MODULES = ["axeclefts-armory", "axeclefts-curios", "axecleft-gemstones", "traps-and-poisons"];
  const i18n = existing?.i18n ?? { dict: {}, lang: "en", loaded: null, modules: new Set(AXECLEFT_MODULES) };
  i18n.grammar ??= null;
  i18n.words ??= {};
  const fmt = (s, data) => (data ? String(s).replace(/\{(\w+)\}/g, (m, k) => (data[k] ?? m)) : String(s));
  /** The text in the world's language (else the English), with {placeholders} filled from data. */
  const t = (text, data) => fmt(i18n.dict[text] || text, data);
  const langChain = (lang) => {
    const l = String(lang ?? "en");
    if (/^en\b/i.test(l)) return [];
    const out = [l];
    const base = l.split("-")[0];
    if (base === "pt") out.push(l === "pt-BR" ? "pt-PT" : "pt-BR");
    else if (base !== l) out.push(base);
    return out;
  };
  /* ---------- Grammar (version 8.3) ---------- */
  /** English rules; a language's lang/<code>.grammar.json overrides any of them. */
  const GRAMMAR_EN = {
    and: "and", or: "or", comma: ", ",
    articles: { a: { m: "a", f: "a", n: "a", mp: "", fp: "", np: "" }, the: { m: "the", f: "the", n: "the", mp: "the", fp: "the", np: "the" } },
    anRule: true,            // English a/an by the next word's sound
    defaultGender: "n",
    elision: null,           // { words: ["de", "le", "la"], before: "aeiouyh…", except: ["hache", …] }
    contractions: {},        // { "de le": "du", "de les": "des" }
    capitalize: "none",      // "first": a capital first letter; "none": as written
    words: {},               // "épée longue": { g: "f" } (word files, phase 5)
  };
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const deepMerge = (a, b) => { const out = { ...a }; for (const [k, v] of Object.entries(b ?? {})) { if (k.startsWith("__")) continue; out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v; } return out; };
  function mergeGrammar(files) {
    let g = { ...GRAMMAR_EN, anRule: false, capitalize: "first", defaultGender: "m", words: {} };
    for (const f of files) g = deepMerge(g, f);
    g.words = Object.fromEntries(Object.entries(g.words ?? {}).map(([k, v]) => [normWord(k), v]));
    return g;
  }
  const normWord = (s) => String(s ?? "").toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  const emptyPart = (v) => v === null || v === undefined || v === false || v === "" || (Array.isArray(v) && !v.some((x) => !emptyPart(x))) || (isObj(v) && emptyPart(v.text));
  /** A part as a word: text plus what the grammar file knows about it (gender, forms). */
  const asWord = (v, G) => {
    const own = isObj(v) ? v : { text: String(v ?? "") };
    const info = G.words[normWord(own.text)] ?? {};
    // A grammar file's entry can also change the text ("as": "de feu" for Babele's "Feu")
    return { ...info, ...own, text: String(own.as ?? info.as ?? own.text ?? "") };
  };
  /** A word file's value: "Épée longue (f)", "(f)", "acéré/acérée/acérés/acérées", "de feu (of)", or { text, g, pl, forms, role }. */
  const MARKS = { m: ["g", "m"], f: ["g", "f"], n: ["g", "n"], pl: ["pl", true] };
  function parseWord(v) {
    if (isObj(v)) return { ...v, text: v.text ?? "" };
    let s = String(v ?? "").trim();
    const out = {};
    const m = s.match(/\s*\(([^()]*)\)\s*$/);
    if (m) {
      const toks = m[1].split(/[\s,]+/).filter(Boolean);
      // Markers only when every word in the brackets is one (gender, pl, or the part of a name: of, adj…)
      if (toks.length && toks.every((x) => MARKS[x] || /^(of|adj|pre|post|role:\w+)$/.test(x))) {
        for (const x of toks) { if (MARKS[x]) out[MARKS[x][0]] = MARKS[x][1]; else out.role = x.replace(/^role:/, ""); }
        s = s.slice(0, m.index).trim();
      }
    }
    if (s.includes("/")) {
      const f = s.split("/").map((x) => x.trim());
      out.forms = { m: f[0], f: f[1] ?? f[0], mp: f[2] ?? f[0], fp: f[3] ?? f[2] ?? f[1] ?? f[0] };
      s = out.g === "f" ? out.forms.f : f[0];
    }
    out.text = s;
    return out;
  }
  /**
   * The word for an English word ("Flaming", "Longsword"), for compose(): in English the English word; otherwise the word file's
   * entry (its text, else the text given or the language file's translation; gender, forms, role), else the text given, else the English.
   */
  function word(en, { text = null, ...extra } = {}) {
    const english = !i18n.grammar && !Object.keys(i18n.dict).length && !Object.keys(i18n.words ?? {}).length || i18n.lang === "en";
    if (english) return { ...extra, text: String(en ?? text ?? ""), en };
    const w = i18n.words?.[normWord(en)] ?? {};
    return { ...extra, ...w, text: w.text || text || i18n.dict[en] || String(en ?? ""), en };
  }
  const genderKey = (w, G) => `${w?.g ?? G.defaultGender}${w?.pl ? "p" : ""}`;
  /** Parse a pattern into [text | { slot, mods } | { group: [...] }]. */
  function parsePattern(p) {
    const out = [], stack = [out];
    let i = 0, buf = "";
    const flush = () => { if (buf) { stack.at(-1).push(buf); buf = ""; } };
    while (i < p.length) {
      const ch = p[i];
      if (ch === "{") {
        const j = p.indexOf("}", i);
        if (j < 0) { buf += p.slice(i); break; }
        flush();
        const inner = p.slice(i + 1, j);
        if (inner.startsWith("~")) stack.at(-1).push({ agree: inner.slice(1).split("/").map((s) => s.trim()) });
        else { const [slot, ...mods] = inner.split(":").map((s) => s.trim()); stack.at(-1).push({ slot, mods }); }
        i = j + 1; continue;
      }
      if (ch === "[") { flush(); const g = []; stack.at(-1).push({ group: g }); stack.push(g); i++; continue; }
      if (ch === "]" && stack.length > 1) { flush(); stack.pop(); i++; continue; }
      buf += ch; i++;
    }
    flush();
    return out;
  }
  const slotsIn = (nodes) => slotNodes(nodes).map((n) => n.slot);
  const anFor = (text) => (/^[aeiou]/i.test(text) && !/^(uni|eu|one)/i.test(text) ? "an" : "a");
  /**
   * A name or phrase from a pattern and its parts, in the world's language (or { lang: "en" }).
   * slots: { name: text | word | [text | word] }. Returns the text.
   */
  function compose(pattern, slots = {}, { lang = null, phrase = false } = {}) {
    const english = lang === "en" || (!lang && (!i18n.grammar && !Object.keys(i18n.dict).length || i18n.lang === "en"));
    const G = english ? GRAMMAR_EN : (i18n.grammar ?? { ...GRAMMAR_EN, anRule: false, defaultGender: "m" });
    const pat = english ? String(pattern) : (i18n.dict[pattern] || String(pattern));
    const nodes = parsePattern(pat);
    // Parts as lists of words; a word with a role moves to that part (a French ability that goes after "de", say)
    const parts = {};
    for (const [k, v] of Object.entries(slots ?? {})) parts[k] = (Array.isArray(v) ? v : [v]).filter((x) => !emptyPart(x)).map((x) => asWord(x, G));
    if (!english) {
      const used = new Set(slotsIn(nodes));
      for (const k of Object.keys(parts)) {
        const stay = [];
        for (const w of parts[k]) { if (w.role && w.role !== k && used.has(w.role)) (parts[w.role] ??= []).push(w); else stay.push(w); }
        parts[k] = stay;
      }
    }
    const order = slotNodes(nodes);
    const headSlot = order.find((n) => n.mods.includes("head"))?.slot ?? order.find((n) => parts[n.slot]?.[0]?.g)?.slot ?? null;
    const head = headSlot ? parts[headSlot]?.[0] ?? null : null;
    const formOf = (w) => {
      if (english || !w.forms || !head || w === head) return w.text;
      const k = genderKey(head, G);
      return w.forms[k] ?? w.forms[k[0]] ?? w.text;
    };
    const join = (list, how) => {
      if (list.length <= 1 || !how) return list.join(" ");
      const word = how === "or" ? G.or : G.and;
      return `${list.slice(0, -1).join(G.comma)} ${word} ${list.at(-1)}`;
    };
    const renderSlot = ({ slot, mods }) => {
      const words = parts[slot] ?? [];
      if (!words.length) return "";
      let texts = words.map(formOf);
      if (mods.includes("lower")) texts = texts.map((s) => s.toLowerCase());
      let s = join(texts, mods.includes("and") ? "and" : mods.includes("or") ? "or" : null);
      for (const art of ["a", "the"]) {
        if (!mods.includes(art)) continue;
        const w = words[0];
        const a = english && art === "a" && G.anRule ? anFor(s) : (G.articles?.[art]?.[genderKey(w, G)] ?? G.articles?.[art]?.[w.g ?? G.defaultGender] ?? "");
        if (a) s = `${a} ${s}`;
      }
      return s;
    };
    const agreeOf = (forms) => {
      if (english || !head) return forms[0] ?? "";
      const k = genderKey(head, G);
      return forms[{ m: 0, f: 1, mp: 2, fp: 3, n: 0, np: 2 }[k] ?? 0] ?? forms[k.endsWith("p") ? 2 : k === "f" ? 1 : 0] ?? forms[0];
    };
    const render = (list) => list.map((n) => {
      if (typeof n === "string") return n;
      if (n.agree) return agreeOf(n.agree);
      if (n.group) return slotsIn(n.group).every((k) => parts[k]?.length) ? render(n.group) : "";
      return renderSlot(n);
    }).join("");
    let out = render(nodes).replace(/\s{2,}/g, " ").replace(/\s+([,.;:)])/g, "$1").replace(/\(\s+/g, "(").trim();
    if (!english) out = applyRules(out, phrase ? { ...G, capitalize: "none" } : G);
    return out;
  }
  /** The slot nodes in pattern order (the head, when not marked with :head, is the first part with a known gender). */
  const slotNodes = (nodes) => nodes.flatMap((n) => (typeof n === "string" || n.agree ? [] : n.group ? slotNodes(n.group) : [n]));
  /** Contractions ("de le" → "du") and elision ("de épée" → "d'épée"), then capitals. */
  function applyRules(s, G) {
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [from, to] of Object.entries(G.contractions ?? {})) {
      s = s.replace(new RegExp(`(^|[\\s('’])${esc(from)}(?=[\\s,.)]|$)`, "giu"), (m, pre) => `${pre}${to}`);
    }
    const el = G.elision;
    if (el?.words?.length) {
      const before = el.before ?? "aeiouyàâäéèêëîïôöùûüœæh";
      const except = new Set((el.except ?? []).map(normWord));
      const re = new RegExp(`(^|[\\s('’])(${el.words.map(esc).join("|")}) (?=([${esc(before)}${esc(before.toUpperCase())}]))`, "giu");
      s = s.replace(re, (m, pre, w, c, off, all) => {
        const next = normWord(all.slice(off + m.length).split(/[\s,.;:)]/)[0]);
        if ([...except].some((x) => next === x || next.startsWith(`${x} `) || next === x.split(" ")[0])) return m;
        return `${pre}${w.slice(0, -1)}${el.mark ?? "'"}`;
      });
    }
    if (G.capitalize === "first") s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  }

  async function loadLanguage(lang = globalThis.game?.i18n?.lang) {
    const chain = langChain(lang);
    const dict = {}, grammarFiles = [], words = {};
    for (const id of i18n.modules) {
      const mod = globalThis.game?.modules?.get(id);
      if (!mod?.active) continue;
      let have = [];
      try { have = chain.length ? await foundry.utils.fetchJsonWithTimeout(`modules/${id}/lang/languages.json`) : []; } catch (e) { continue; } // no translations shipped
      // The fallback first, so the exact language wins
      for (const code of [...chain].reverse()) {
        if (!have.includes(code)) continue;
        try {
          const file = await foundry.utils.fetchJsonWithTimeout(`modules/${id}/lang/${code}.json`);
          for (const [en, tr] of Object.entries(file ?? {})) if (tr && typeof tr === "string" && !en.startsWith("__")) dict[en] = tr;
        } catch (e) { console.warn(`AxecleftTools | could not read modules/${id}/lang/${code}.json`, e); }
        // The language's grammar rules (optional file; the modules ship the same one) and its words (each module its own)
        try { grammarFiles.push(await foundry.utils.fetchJsonWithTimeout(`modules/${id}/lang/${code}.grammar.json`)); } catch (e) { /* none */ }
        try {
          const file = await foundry.utils.fetchJsonWithTimeout(`modules/${id}/lang/${code}.words.json`);
          for (const [en, v] of Object.entries(file ?? {})) { if (en.startsWith("__") || v === "" || v === null) continue; const w = parseWord(v); if (w) words[normWord(en)] = w; }
        } catch (e) { /* none */ }
      }
    }
    i18n.dict = dict;
    i18n.grammar = grammarFiles.length ? mergeGrammar(grammarFiles) : null;
    i18n.words = words;
    i18n.lang = chain[0] ?? "en";
    // Setting names and hints of Axecleft modules (registered in English)
    try {
      for (const s of game.settings.settings.values()) {
        if (!i18n.modules.has(s.namespace) && s.namespace !== "world") continue;
        s._axEn ??= { name: s.name, hint: s.hint, choices: s.choices ? { ...s.choices } : null };
        if (s._axEn.name) s.name = t(s._axEn.name);
        if (s._axEn.hint) s.hint = t(s._axEn.hint);
        if (s._axEn.choices) s.choices = Object.fromEntries(Object.entries(s._axEn.choices).map(([k, v]) => [k, typeof v === "string" ? t(v) : v]));
      }
      for (const m of game.settings.menus?.values?.() ?? []) {
        if (!i18n.modules.has(m.namespace)) continue;
        m._axEn ??= { name: m.name, label: m.label, hint: m.hint };
        for (const k of ["name", "label", "hint"]) if (m._axEn[k]) m[k] = t(m._axEn[k]);
      }
    } catch (e) { /* settings not ready */ }
    if (Object.keys(dict).length) console.log(`AxecleftTools | ${Object.keys(dict).length} translated texts loaded (${i18n.lang})`);
    Hooks.callAll("axecleftLanguageLoaded", i18n.lang);
    return dict;
  }
  if (!existing || (existing.version ?? 0) < 8.2) {
    // Settings are registered during init; load after them, before anything is shown
    Hooks.once("setup", () => { i18n.loaded = globalThis.AxecleftTools.loadLanguage(); });
  }

  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* Searchable lists (version 7; the same code as the Treasure Generator's, for modules that don't ship it) */
  const COMBO_CSS = `.axecleft-combo { position: fixed; z-index: 100000; overflow-y: auto; min-width: 160px; background: var(--color-bg-option, #1f2029); color: var(--color-text-primary, #e8e6e3);
      border: 1px solid var(--color-border-highlight, #ff6400); border-radius: 4px; box-shadow: 0 4px 14px rgba(0,0,0,0.55); font-size: var(--font-size-13, 13px); padding: 2px 0; }
    .axecleft-combo div { padding: 3px 8px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .axecleft-combo div.active, .axecleft-combo div:hover { background: var(--color-warm-2, #a33b24); color: #fff; }
    .axecleft-combo div.none { opacity: 0.7; cursor: default; font-style: italic; } .axecleft-combo div.none:hover { background: none; color: inherit; }
    .axecleft-combo div.head { cursor: default; font-weight: bold; opacity: 0.85; border-top: 1px solid currentColor; margin-top: 3px; padding-top: 3px; } .axecleft-combo div.head:first-child { border-top: none; margin-top: 0; } .axecleft-combo div.head:hover { background: none; color: inherit; }
    .axecleft-combo mark { background: none; color: inherit; font-weight: bold; text-decoration: underline; }`;
  let comboEl = null, comboFor = null, comboActive = -1;
  function comboBox() {
    if (comboEl?.isConnected) return comboEl;
    if (!document.getElementById("axecleft-combo-css")) {
      const st = document.createElement("style"); st.id = "axecleft-combo-css"; st.textContent = COMBO_CSS; document.head.append(st);
    }
    comboEl = document.createElement("div");
    comboEl.className = "axecleft-combo";
    comboEl.style.display = "none";
    comboEl.addEventListener("mousedown", (ev) => ev.preventDefault()); // keep focus in the text box
    document.body.append(comboEl);
    // Close when anything else scrolls (the box would drift away from its text box) or the window resizes
    document.addEventListener("scroll", (ev) => { if (comboFor && ev.target !== comboEl && !comboEl.contains(ev.target)) comboClose(); }, true);
    window.addEventListener("resize", () => comboClose());
    return comboEl;
  }
  function comboClose() { if (comboEl) comboEl.style.display = "none"; comboFor = null; comboActive = -1; }
  function comboItems() { return comboEl ? [...comboEl.querySelectorAll("div[data-v]")] : []; }
  function comboMark(i) {
    const items = comboItems();
    items.forEach((x, n) => x.classList.toggle("active", n === i));
    comboActive = i;
    items[i]?.scrollIntoView({ block: "nearest" });
  }
  function comboPick(input, value) {
    input.value = value;
    comboClose();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function comboOpen(input, filter) {
    const box = comboBox();
    const all = input._axcOptions?.() ?? [];
    const q = filter ? String(input.value ?? "").trim().toLowerCase() : "";
    const hits = q ? all.filter((v) => v.toLowerCase().includes(q)) : all;
    const LIMIT = 400;
    const shown = hits.slice(0, LIMIT);
    const hi = (v) => {
      if (!q) return esc(v);
      const i = v.toLowerCase().indexOf(q);
      return `${esc(v.slice(0, i))}<mark>${esc(v.slice(i, i + q.length))}</mark>${esc(v.slice(i + q.length))}`;
    };
    // Headings (an <option data-heading label="…">) go before the next shown entry of their part of the list
    const shownSet = new Set(shown);
    const headFor = new Map();
    let pending = null;
    for (const row of input._axcRows?.() ?? []) {
      if (row.head) { pending = row.head; continue; }
      if (pending && shownSet.has(row.v) && !headFor.has(row.v)) { headFor.set(row.v, pending); pending = null; }
    }
    box.innerHTML = shown.map((v) => `${headFor.has(v) ? `<div class="head">${esc(headFor.get(v))}</div>` : ""}<div data-v="${esc(v)}" title="${esc(v)}">${hi(v)}</div>`).join("")
      + (hits.length > LIMIT ? `<div class="none">${esc(t("{n} more — type to narrow the list", { n: hits.length - LIMIT }))}</div>` : "")
      + (!hits.length ? `<div class="none">${esc(all.length ? t("No match") : t("Nothing to choose from"))}</div>` : "");
    box.querySelectorAll("div[data-v]").forEach((el) => el.addEventListener("click", () => comboPick(input, el.dataset.v)));
    // Below the text box, or above it when there's more room there; never past the screen's edge
    const r = input.getBoundingClientRect(), gap = 6, MAX = 320;
    const below = window.innerHeight - r.bottom - gap, above = r.top - gap;
    const down = below >= Math.min(MAX, 180) || below >= above;
    box.style.display = "block";
    box.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - Math.max(r.width, 160) - 4))}px`;
    box.style.width = `${Math.max(r.width, 160)}px`;
    box.style.maxHeight = `${Math.max(80, Math.min(MAX, down ? below : above))}px`;
    if (down) { box.style.top = `${r.bottom + 2}px`; box.style.bottom = ""; }
    else { box.style.top = ""; box.style.bottom = `${window.innerHeight - r.top + 2}px`; }
    box.scrollTop = 0;
    comboFor = input;
    comboActive = -1;
    const exact = shown.findIndex((v) => v === input.value);
    if (exact >= 0) comboMark(exact);
  }
  /** Turn every <input list="…"> inside root into a scrolling searchable list. */
  function enhanceDatalists(root) {
    if (!root?.querySelectorAll) return;
    for (const input of root.querySelectorAll("input[list]")) {
      if (input._axcOptions) continue;
      const id = input.getAttribute("list");
      const find = () => root.querySelector?.(`datalist#${CSS.escape(id)}`) ?? document.getElementById(id);
      input._axcOptions = () => [...(find()?.options ?? [])].map((o) => o.value).filter(Boolean);
      input._axcRows = () => [...(find()?.options ?? [])].map((o) => (o.hasAttribute("data-heading") ? { head: o.label || o.textContent } : { v: o.value })).filter((r) => r.head || r.v);
      input.dataset.list = id;
      input.removeAttribute("list");
      input.setAttribute("autocomplete", "off");
      input.addEventListener("dblclick", () => comboOpen(input, false));
      input.addEventListener("click", () => { if (comboFor !== input && !input.value) comboOpen(input, false); });
      input.addEventListener("input", (ev) => { if (ev.isTrusted) comboOpen(input, true); }); // typing filters; our own picks don't reopen it
      input.addEventListener("blur", () => setTimeout(() => { if (comboFor === input) comboClose(); }, 120));
      input.addEventListener("keydown", (ev) => {
        const open = comboFor === input && comboEl?.style.display !== "none";
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          if (!open) { comboOpen(input, false); return; }
          const n = comboItems().length;
          if (n) comboMark(ev.key === "ArrowDown" ? (comboActive + 1) % n : (comboActive - 1 + n) % n);
        } else if (ev.key === "Enter" && open && comboActive >= 0) {
          ev.preventDefault();
          comboPick(input, comboItems()[comboActive].dataset.v);
        } else if (ev.key === "Escape" && open) { ev.preventDefault(); ev.stopPropagation(); comboClose(); }
        else if (ev.key === "Tab") comboClose();
      });
    }
  }

  /* ---------- English names (version 8) ---------- */
  const enNorm = (s) => String(s ?? "").toLowerCase().normalize("NFC").replace(/[’']/g, "'").replace(/[^\p{L}\p{N}']+/gu, " ").trim();
  const babeleMaps = new Map(); // pack id -> Map(normalized translated name -> English name)
  const englishNames = existing?.englishNames ?? new Map(); // module -> [names]
  function babeleEntries(packId) {
    const b = globalThis.game?.babele;
    if (!b || !packId) return null;
    try {
      // Babele 2.6+ (game.babele.translatedCompendiumFor / mappedCompendiumFor); older Babele: game.babele.packs
      const tc = b.translatedCompendiumFor?.(packId) ?? b.mappedCompendiumFor?.(packId) ?? b.packs?.get?.(packId);
      const tr = tc?.translations;
      if (tr && Object.keys(tr).length) return tr;
      const t = (Array.isArray(b.translations) ? b.translations : []).find((x) => x.collection === packId);
      return t?.entries ?? null;
    } catch (e) { return null; }
  }
  function babeleMap(packId) {
    if (!packId) return null;
    if (babeleMaps.has(packId)) return babeleMaps.get(packId);
    const entries = babeleEntries(packId);
    const map = new Map();
    if (entries) {
      const list = Array.isArray(entries) ? entries.map((e) => [e.id ?? e.name, e]) : Object.entries(entries);
      for (const [key, v] of list) if (key && v?.name) map.set(enNorm(v.name), key);
    }
    if (globalThis.game?.babele) babeleMaps.set(packId, map);
    return map;
  }
  const packOf = (x, pack) => pack ?? x?.pack ?? x?.compendium?.collection
    ?? String(x?._stats?.compendiumSource ?? x?.flags?.core?.sourceId ?? x?.uuid ?? "").match(/^Compendium\.([^.]+\.[^.]+)\./)?.[1] ?? null;
  const tagEn = (x) => {
    for (const t of Array.isArray(x?.system?.tags) ? x.system.tags : []) {
      const txt = String(Array.isArray(t) ? t[0] : t ?? "").trim();
      if (/^en\s*:/i.test(txt)) return txt.replace(/^en\s*:\s*/i, "").trim() || null;
    }
    return null;
  };
  /** The English name of an item, an index entry or item data (see the header). */
  function enName(x, { pack = null } = {}) {
    if (!x) return "";
    const f = x.flags ?? {};
    const own = f.world?.axecleftEn ?? f.axecleft?.en ?? foundry.utils?.getProperty?.(x, "flags.world.axecleftEn");
    if (own) return own;
    const orig = f.babele?.originalName ?? x.originalName ?? foundry.utils?.getProperty?.(x, "flags.babele.originalName");
    if (orig) return orig;
    const tag = tagEn(x);
    if (tag) return tag;
    const hit = babeleMap(packOf(x, pack))?.get(enNorm(x.name));
    return hit ?? x.name ?? "";
  }
  const INDEX_EXTRA = ["flags.babele.originalName", "flags.world.axecleftEn", "system.tags"];
  /** A compendium's index with English names: [{ ...entry, name: English, display: shown name }]. */
  async function enIndex(pack, { fields = [] } = {}) {
    const index = await pack.getIndex({ fields: [...new Set([...fields, ...INDEX_EXTRA])] });
    return [...index].map((e) => { const en = enName(e, { pack: pack.collection }); return en === e.name ? { ...e, display: e.name } : { ...e, name: en, display: e.name }; });
  }
  let classMap = null;
  /** A class name in English ("Magicien" -> "Wizard"), from the Babele translations of the classes compendiums. */
  function classEn(name) {
    if (!globalThis.game?.babele) return name;
    if (!classMap) {
      classMap = new Map();
      for (const pack of game.packs ?? []) {
        if (pack.documentName !== "Item" || !/class/i.test(pack.collection) || /abilit|feature/i.test(pack.collection)) continue;
        for (const [k, v] of babeleMap(pack.collection) ?? []) classMap.set(k, v);
      }
    }
    return classMap.get(enNorm(name)) ?? name;
  }
  for (const h of ["babele.ready", "babele.reinitialized", "babele.dataLoaded"]) Hooks.on(h, () => { babeleMaps.clear(); classMap = null; });

  /* English name prompt: worlds not in English */
  const ASK_KEY = "axecleft-tools.askEnglish";
  const ASK_TYPES = new Set(["weapon", "equipment", "consumable", "loot", "spell", "feat", "enhancement", "material", "container"]);
  const askOff = () => { try { return localStorage.getItem(ASK_KEY) === "off"; } catch (e) { return false; } };
  const nonEnglish = () => !/^en\b/i.test(globalThis.game?.i18n?.lang ?? "en");
  const hasEnglish = (item) => !!(item.flags?.world?.axecleftEn || item.flags?.babele?.originalName || tagEn(item));
  function knownEnglish() {
    const out = new Set();
    for (const list of englishNames.values()) for (const n of list) out.add(n);
    try { for (const pack of game.packs ?? []) if (pack.documentName === "Item") for (const v of babeleMap(pack.collection)?.values() ?? []) out.add(v); } catch (e) { /* none */ }
    return [...out].sort((a, b) => a.localeCompare(b));
  }
  async function askEnglishName(item, { force = false } = {}) {
    if (!force && (askOff() || hasEnglish(item))) return;
    const DV = DialogShim;
    const current = item.flags?.world?.axecleftEn ?? "";
    const listId = `axecleft-en-${item.id}`;
    const content = `<p>${t("What is <strong>{name}</strong> called in English? Axecleft's modules (treasure, merchants, crafting) recognize items by their English name. Optional.", { name: esc(item.name) })}</p>
      <div class="form-group"><label>${esc(t("English name"))}</label><input type="text" name="en" list="${listId}" value="${esc(current)}" autofocus><datalist id="${listId}">${knownEnglish().map((n) => `<option value="${esc(n)}">`).join("")}</datalist></div>`;
    let res = null;
    if (DV) {
      const buttons = [{ action: "save", label: t("Save"), icon: "fas fa-check", default: true, callback: (ev, btn) => ({ action: "save", en: btn.form.elements.en?.value }) },
        { action: "skip", label: t("Skip"), icon: "fas fa-forward" }];
      if (!force) buttons.push({ action: "never", label: t("Don't ask again"), icon: "fas fa-ban" });
      const p = DV.wait({ window: { title: t("English name") }, content, buttons, rejectClose: false, render: (ev, dlg) => { try { api.enhanceDatalists(dlg.element ?? dlg); } catch (e) { /* plain list */ } } });
      res = await p;
    } else {
      // Foundry v11: the classic Dialog
      res = await new Promise((resolve) => new Dialog({ title: t("English name"), content: `<form>${content}</form>`,
        buttons: { save: { label: t("Save"), callback: (html) => resolve({ action: "save", en: html.find('[name="en"]').val() }) }, skip: { label: t("Skip"), callback: () => resolve(null) },
          ...(force ? {} : { never: { label: t("Don't ask again"), callback: () => resolve("never") } }) }, default: "save", close: () => resolve(null) }).render(true));
    }
    if (res === "never" || res?.action === "never") { try { localStorage.setItem(ASK_KEY, "off"); } catch (e) { /* private mode */ } ui.notifications.info(t("Axecleft: you won't be asked for English names again (the item sheet's English name button still works).")); return; }
    if (res?.action !== "save") return;
    const en = String(res.en ?? "").trim();
    await item.update(en ? { "flags.world.axecleftEn": en } : { "flags.world.-=axecleftEn": null }, { axecleftEnglish: true });
  }
  if (!existing || (existing.version ?? 0) < 8) {
    // A person creating an item (Foundry's Create Item dialog opens its sheet), not a module or an import
    Hooks.on("createItem", (item, options, userId) => {
      const T = globalThis.AxecleftTools;
      if (userId !== game.user?.id || !nonEnglish() || !ASK_TYPES.has(item.type) || options?.renderSheet !== true) return;
      if (options?.axecleftEnglish || options?.curiosInternal || item._stats?.compendiumSource || item.flags?.core?.sourceId) return;
      if (!item.name || /^(new|nouvel|nouveau|nueva?o?|novo|nova)\b/i.test(item.name)) return; // default name: asked when it's renamed
      T.askEnglishName(item);
    });
    // A person renaming an item (modules rename with their own options, which are skipped)
    Hooks.on("updateItem", (item, changes, options, userId) => {
      const T = globalThis.AxecleftTools;
      if (userId !== game.user?.id || !nonEnglish() || changes?.name === undefined || options?.axecleftEnglish || options?.curiosInternal || options?.axecleft || !ASK_TYPES.has(item.type)) return;
      if (item._stats?.compendiumSource || item.flags?.core?.sourceId) return;
      T.askEnglishName(item);
    });
    const headerButton = (sheet, buttons) => {
      const item = sheet.document ?? sheet.item ?? sheet.object;
      if (!nonEnglish() || !item || item.documentName !== "Item" || !item.isOwner) return;
      buttons.unshift({ label: t("English name"), class: "axecleft-en", icon: "fas fa-language", onclick: () => globalThis.AxecleftTools.askEnglishName(item, { force: true }) });
    };
    Hooks.on("getItemSheetHeaderButtons", headerButton);
    // Foundry v13+ ApplicationV2 sheets
    Hooks.on("getHeaderControlsItemSheet", (sheet, controls) => {
      const item = sheet.document;
      if (!nonEnglish() || !item?.isOwner) return;
      controls.unshift({ label: t("English name"), icon: "fas fa-language", action: "axecleftEnglish", onClick: () => globalThis.AxecleftTools.askEnglishName(item, { force: true }) });
    });
  }


  /* ---------- Foundry v11 to v14 (version 9) ---------- */
  const V13 = !!globalThis.foundry?.applications?.api?.DialogV2;
  const escH = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  /** DialogV2.wait / confirm on every version (v11/v12: the classic Dialog). */
  const DialogShim = {
    wait(cfg = {}) {
      if (V13) return foundry.applications.api.DialogV2.wait(cfg);
      return new Promise((resolve) => {
        let done = false, dlg = null, pending = false;
        const finish = (v) => { if (!done) { done = true; resolve(v); } };
        const buttons = {};
        let def = null;
        for (const b of cfg.buttons ?? [{ action: "ok", label: "OK", default: true }]) {
          if (b.default) def = b.action;
          buttons[b.action] = {
            icon: b.icon ? `<i class="${b.icon}"></i>` : "",
            label: b.label ?? b.action,
            callback: (html) => {
              const root = html?.[0] ?? html;
              const form = root?.querySelector?.("form") ?? root;
              const button = { form, dataset: { action: b.action }, action: b.action };
              let v = b.action;
              try { if (b.callback) { const out = b.callback(new Event("click"), button, dlg); v = out === undefined ? b.action : out; } }
              catch (err) { console.error("AxecleftTools | dialog button", err); }
              // Resolve now: the classic Dialog closes right after this callback, and its close must not win with null
              if (v && typeof v.then === "function") { pending = true; v.then(finish, () => finish(null)); }
              else finish(v);
            },
          };
        }
        const title = cfg.window?.title ?? cfg.title ?? "";
        const DialogClass = typeof Dialog !== "undefined" ? Dialog : globalThis.Dialog;
        dlg = new DialogClass({ title, content: `<form class="axecleft-dialog" autocomplete="off" onsubmit="event.preventDefault();">${cfg.content ?? ""}</form>`, buttons, default: def ?? Object.keys(buttons)[0],
          render: (html) => {
            const root = html?.[0] ?? html;
            const app = root?.closest?.(".app") ?? root;
            try { cfg.render?.(new Event("render"), { element: app, form: root?.querySelector?.("form") }); } catch (err) { console.error("AxecleftTools | dialog render", err); }
          },
          close: () => { if (!pending) finish(null); } },
        { classes: ["dialog", ...(cfg.classes ?? [])], width: cfg.position?.width ?? 400, ...(cfg.position?.height ? { height: cfg.position.height } : {}) });
        dlg.render(true);
      });
    },
    async confirm(cfg = {}) {
      if (V13) return foundry.applications.api.DialogV2.confirm(cfg);
      const res = await DialogShim.wait({ ...cfg, buttons: [
        { action: "yes", label: cfg.yes?.label ?? globalThis.game?.i18n?.localize?.("Yes") ?? "Yes", icon: cfg.yes?.icon ?? "fas fa-check", default: cfg.yes?.default ?? true, callback: () => true },
        { action: "no", label: cfg.no?.label ?? globalThis.game?.i18n?.localize?.("No") ?? "No", icon: cfg.no?.icon ?? "fas fa-xmark", default: !!cfg.no?.default, callback: () => false }] });
      return res === true;
    },
    async prompt(cfg = {}) {
      if (V13) return foundry.applications.api.DialogV2.prompt(cfg);
      const ok = cfg.ok ?? {};
      return DialogShim.wait({ ...cfg, buttons: [{ action: ok.action ?? "ok", label: ok.label ?? "OK", icon: ok.icon ?? "fas fa-check", default: true, callback: ok.callback }] });
    },
  };
  /**
   * A window class: Foundry's ApplicationV2 on v13+; on v11/v12 a stand-in with the part our windows use
   * (DEFAULT_OPTIONS, title, _renderHTML → _replaceHTML(html, content) → _onRender, render, close, setPosition, element, rendered).
   */
  let AppV2Base;
  if (V13) AppV2Base = foundry.applications.api.ApplicationV2;
  else {
    // Foundry v11's core classes are global names but not properties of globalThis
    const Classic = typeof Application !== "undefined" ? Application : globalThis.Application;
    AppV2Base = class AxecleftAppV2 {
      static DEFAULT_OPTIONS = {};
      constructor(options = {}) {
        const D = this.constructor.DEFAULT_OPTIONS ?? {};
        this.options = foundry.utils.mergeObject(foundry.utils.deepClone(D), options, { inplace: false });
        const owner = this, o = this.options;
        const Inner = class extends Classic {
          static get defaultOptions() {
            return foundry.utils.mergeObject(super.defaultOptions, { id: o.id ?? `axecleft-app-${foundry.utils.randomID()}`, classes: ["axecleft-v11", ...(o.classes ?? [])],
              title: o.window?.title ?? "", resizable: o.window?.resizable ?? false, width: o.position?.width ?? 480, height: o.position?.height ?? "auto", popOut: true, template: null });
          }
          get title() { return owner.title ?? super.title; }
          async _renderInner() {
            const content = document.createElement("div");
            content.className = "axecleft-v11-body";
            const html = await owner._renderHTML?.({}, {});
            if (owner._replaceHTML) await owner._replaceHTML(html, content, {}); else content.innerHTML = html ?? "";
            return $(content);
          }
          async _render(force, options) {
            await super._render(force, options);
            if (this._element) { try { owner._onRender?.({}, options ?? {}); } catch (err) { console.error("AxecleftTools | window render", err); } }
          }
          async close(options) { const out = await super.close(options); try { owner._onClose?.(options); } catch (e) { /* closing */ } return out; }
        };
        this._app = new Inner();
      }
      get title() { return this.options.window?.title ?? ""; }
      get id() { return this._app.id; }
      /** The window's HTML element (not a jQuery object), as in ApplicationV2. */
      get element() { return this._app.element?.[0] ?? null; }
      get rendered() { return this._app.rendered; }
      get position() { return this._app.position; }
      render(force = false, options = {}) {
        if (force && typeof force === "object") { options = force; force = !!force.force; }
        this._app.render(force, options);
        return this;
      }
      close(options) { return this._app.close(options); }
      setPosition(pos = {}) {
        const p = { ...pos };
        if (p.height === "auto") { p.height = "auto"; }
        try { return this._app.setPosition(p); } catch (e) { return null; }
      }
      bringToTop() { return this._app.bringToTop?.(); }
      bringToFront() { return this._app.bringToTop?.(); }
      minimize() { return this._app.minimize?.(); }
      maximize() { return this._app.maximize?.(); }
    };
  }
  /**
   * D35E 2.x (Foundry v11) has no "D35E.ItemUse.preUseItem" hook, which our custom item uses rely on (trap kits,
   * cognizance crystals, psicrowns, Ioun pearls). There, Item#use is wrapped to call that hook first, the same way:
   * Hooks.call("D35E.ItemUse.preUseItem", item, actor, hookValues); hookValues.customUse = true skips D35E's own use.
   */
  Hooks.once("setup", () => {
    try {
      const sys = globalThis.game?.system;
      if (sys?.id !== "D35E" || !foundry.utils.isNewerVersion("3.0.0", sys.version ?? "0")) return;
      // D35E 2.x builds each item from a per-type class (CONFIG.Item.documentClasses); wrap use() where it is defined
      const classes = [CONFIG.Item?.documentClass, ...Object.values(CONFIG.Item?.documentClasses ?? {})].filter(Boolean);
      const owners = new Set();
      for (const cls of classes) {
        let p = cls.prototype;
        while (p && !Object.prototype.hasOwnProperty.call(p, "use")) p = Object.getPrototypeOf(p);
        if (p && typeof p.use === "function") owners.add(p);
      }
      if (!owners.size) return;
      for (const proto of owners) {
        if (proto.use._axecleftPreUse) continue;
        const original = proto.use;
        const wrapped = async function (options = {}, tempActor = null, ...rest) {
          const hookValues = { customUse: false };
          try { Hooks.call("D35E.ItemUse.preUseItem", this, tempActor ?? this.actor, hookValues); }
          catch (err) { console.error("AxecleftTools | preUseItem", err); }
          if (hookValues.customUse) return null;
          return original.call(this, options, tempActor, ...rest);
        };
        wrapped._axecleftPreUse = true;
        proto.use = wrapped;
      }
      console.log("AxecleftTools | D35E 2.x: custom item uses enabled (trap kits, crystals, psicrowns, pearls).");
    } catch (err) { console.warn("AxecleftTools | could not add the item-use hook", err); }
  });
  /** Chat-card buttons: fn(message, htmlElement) after a chat message renders, on every version. */
  function onChatRender(fn) {
    // renderChatMessageHTML (an HTML element) from Foundry 13; renderChatMessage (jQuery) before
    const v = String(globalThis.game?.version ?? globalThis.game?.release?.version ?? "");
    const modern = v ? Number(v.split(".")[0]) >= 13 : !!globalThis.foundry?.applications?.ux;
    Hooks.on(modern ? "renderChatMessageHTML" : "renderChatMessage", (m, h) => fn(m, h?.[0] ?? h));
  }
  /** v11-only look: dialogs and windows use the v13 class names our styles expect. */
  if (!V13 && globalThis.document && !document.getElementById("axecleft-v11-css")) {
    const st = document.createElement("style");
    st.id = "axecleft-v11-css";
    st.textContent = `.axecleft-v11 .window-content { overflow-y: auto; }
      .axecleft-v11-body { display: flex; flex-direction: column; min-height: 0; }
      .axecleft-dialog .form-group { display: flex; align-items: center; gap: 4px; margin: 4px 0; }
      .axecleft-tools-menu .dialog-buttons { flex-direction: column; gap: 4px; }
      .axecleft-tools-menu .dialog-buttons button { justify-content: flex-start; width: 100%; text-align: left; }`;
    document.head.append(st);
  }

  const api = {
    version: AXECLEFT_TOOLS_VERSION,
    tools,
    /** Foundry v11 to v14 (version 9): DialogV2 (wait / confirm / prompt), a window class, chat-card rendering. */
    DialogV2: DialogShim, AppV2: AppV2Base, onChatRender, isV11: !V13,
    /** Does the game system support intelligent items? (D35E 3.1.0 or later; Foundry v11's D35E 2.4.3 doesn't.) */
    intelligentItems() {
      const sys = globalThis.game?.system;
      if (!sys || sys.id !== "D35E") return false;
      return !foundry.utils.isNewerVersion("3.1.0", sys.version ?? "0");
    },
    enhanceDatalists,
    englishNames, enName, enIndex, classEn, enNorm, askEnglishName,
    i18n, t, fmt, loadLanguage, langChain, compose, word, parseWord, GRAMMAR_EN,
    /** Add a module whose lang/ files are read (Axecleft's own modules are known already). */
    registerLanguageModule(id) { if (id) i18n.modules.add(id); },
    registerEnglishNames(module, names) { englishNames.set(module, [...new Set((names ?? []).filter(Boolean))]); },

    /** Add (or replace) a tool in the shared menu. */
    register(tool) {
      if (!tool?.module || !tool?.name || typeof tool.onClick !== "function") {
        console.error("AxecleftTools | register() needs module, name and onClick", tool);
        return;
      }
      const entry = { gmOnly: true, icon: "fas fa-wrench", ...tool };
      if (tool.img) entry.icon = api.imageIcon(tool.img);
      tools.set(`${tool.module}.${tool.name}`, entry);
    },

    /**
     * Turn an image path into an icon class. The image is drawn as a mask in the
     * button's text colour, so it follows the toolbar's normal/active colours.
     */
    imageIcon(img) {
      const cls = "axecleft-img-" + [...img].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
      if (!document.getElementById(cls)) {
        const url = img.startsWith("/") || /^https?:/.test(img) ? img : `/${img}`;
        const style = document.createElement("style");
        style.id = cls;
        style.textContent = `.${cls}::before { content: ""; display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em;
          background-color: currentColor; -webkit-mask: url("${url}") center / contain no-repeat; mask: url("${url}") center / contain no-repeat; }`;
        document.head.append(style);
      }
      return `fa-fw ${cls}`;
    },

    /** Remove a tool. */
    unregister(module, name) { tools.delete(`${module}.${name}`); },

    /** Tools the current user may use. */
    available() {
      return [...tools.values()].filter((t) =>
        (!t.gmOnly || game.user?.isGM) && (game.modules.get(t.module)?.active ?? true));
    },

    /** Open the menu of tools. */
    async openMenu() {
      const list = api.available();
      if (!list.length) return ui.notifications.info(t("No Axecleft tools are available."));
      const moduleTitle = (id) => game.modules.get(id)?.title ?? id;
      list.sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0) || moduleTitle(a.module).localeCompare(moduleTitle(b.module)) || a.title.localeCompare(b.title));
      const DialogV2 = DialogShim;
      const choice = await DialogV2.wait({
        window: { title: t("Axecleft's Tools"), icon: "fas fa-toolbox" },
        classes: ["axecleft-tools-menu"],
        position: { width: 340 },
        content: `<style>
            .axecleft-tools-menu .form-footer { flex-direction: column; gap: 4px; }
            .axecleft-tools-menu .form-footer button { justify-content: flex-start; width: 100%; }
          </style>
          <p>${esc(t("Choose a tool:"))}</p>`,
        rejectClose: false,
        buttons: list.map((t) => ({
          action: `${t.module}.${t.name}`,
          icon: t.icon,
          label: t.moduleTitle === "" ? api.t(t.title) : `${api.t(t.title)} — ${t.moduleTitle ? api.t(t.moduleTitle) : moduleTitle(t.module)}`,
        })),
      });
      const tool = choice && tools.get(choice);
      if (tool) {
        try { await tool.onClick(); }
        catch (err) { console.error(`AxecleftTools | ${choice} failed`, err); ui.notifications.error(api.t("{tool} failed: {error}", { tool: api.t(tool.title), error: err.message })); }
      }
    },

    /** Add the "Axecleft's Tools" group to the scene controls (called from the hook). */
    addControls(controls) {
      const list = api.available();
      if (!list.length) return;
      const moduleTitle = (id) => game.modules.get(id)?.title ?? id;
      list.sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0) || moduleTitle(a.module).localeCompare(moduleTitle(b.module)) || a.title.localeCompare(b.title));
      const group = { name: "axecleft", title: t("Axecleft's Tools"), icon: "fas fa-toolbox", layer: "tokens", activeTool: "select", visible: true };
      // Foundry needs a selectable "select" tool in every group; it just keeps token selection active.
      const select = { name: "select", title: t("Select Tokens"), icon: "fas fa-expand", button: false };
      const run = (t) => async () => {
        try { await t.onClick(); }
        catch (err) { console.error(`AxecleftTools | ${t.module}.${t.name} failed`, err); ui.notifications.error(api.t("{tool} failed: {error}", { tool: api.t(t.title), error: err.message })); }
      };
      const buttons = list.map((t) => ({ name: `${t.module}--${t.name}`, title: t.hint ? `${api.t(t.title)}: ${api.t(t.hint)}` : api.t(t.title), icon: t.icon, button: true, visible: true, run: run(t) }));

      if (Array.isArray(controls)) {
        // Foundry v11/v12: array of groups, array of tools. The group needs its own
        // canvas layer: on a shared layer (like tokens) Foundry switches back to the
        // group that owns that layer and our buttons never show.
        if (controls.some((c) => c.name === group.name)) return;
        const layer = CONFIG.Canvas?.layers?.[LAYER] ? LAYER : "tokens";
        controls.push({ ...group, layer,
          tools: [{ ...select, title: api.t("Axecleft's Tools") }, ...buttons.map(({ run, ...b }) => ({ ...b, onClick: run }))] });
        return;
      }
      // Foundry v13+: object of groups, object of tools
      const order = Math.max(0, ...Object.values(controls).map((c) => c.order ?? 0)) + 1;
      const tools = { select: { ...select, order: 1, onChange: () => {} } };
      buttons.forEach(({ run, ...b }, i) => { tools[b.name] = { ...b, order: i + 2, onChange: run }; });
      controls[group.name] = { ...group, order, tools };
    },
  };

  globalThis.AxecleftTools = api;

  // The Tool Suite's user guide (9.1): the last button of the menu, for GMs and players.
  // 9.2: it opens the wiki in Foundry's language when the wiki has that translation, else in English.
  const GUIDE_WIKI = "https://github.com/Axecleft/Axecleft-s-Tools-Suite/wiki/";
  const guidePage = () => {
    const lang = String(game?.i18n?.lang ?? "en").toLowerCase();
    if (lang === "pt-br") return "pt-BR-Início";
    if (lang === "pt" || lang.startsWith("pt-")) return "pt-PT-Início";
    if (lang === "fr" || lang.startsWith("fr-")) return "fr-Accueil";
    if (lang === "es" || lang.startsWith("es-")) return "es-Inicio";
    return "Home";
  };
  api.guideUrl = () => GUIDE_WIKI + encodeURIComponent(guidePage());
  api.register({
    module: "axecleft-tools", name: "user-guide", title: /*t*/"User Guide", hint: /*t*/"The Tool Suite's user guide (wiki), in your web browser",
    icon: "fas fa-book", gmOnly: false, last: true, moduleTitle: "",
    onClick: () => { window.open(api.guideUrl(), "_blank", "noopener"); },
  });

  // Support on Patreon and Join the Discord (9.3). 9.4: no longer buttons in the Axecleft's Tools menu (it was getting
  // crowded) or the module settings, but links in the welcome window (below); an older copy's menu entries are taken out.
  const PATREON_URL = "https://www.patreon.com/Axecleft";
  api.patreonUrl = PATREON_URL;
  api.openPatreon = () => { window.open(PATREON_URL, "_blank", "noopener"); };
  const DISCORD_URL = "https://discord.gg/FRhPPwDWta";
  api.discordUrl = DISCORD_URL;
  api.openDiscord = () => { window.open(DISCORD_URL, "_blank", "noopener"); };
  api.unregister("axecleft-tools", "patreon");
  api.unregister("axecleft-tools", "discord");
  /*
   * 9.4: the Tool Suite's welcome window and settings (Join the Discord, Support on Patreon, User Guide).
   * The welcome window opens when Foundry starts, unless the GM turns it off for the world or a user turns it off for
   * themselves (never on a VooDoo phone). Each active Axecleft module's settings get one "Axecleft's Tool Suite" button
   * that opens the suite's settings. Its settings are registered under the "world" namespace, so they stay whichever
   * Axecleft modules are active.
   */
  const WELCOME_WORLD = "axecleftToolsWelcome", WELCOME_MINE = "axecleftToolsWelcomeMine";
  let welcomeNs = null;
  const welcomeGet = (k, d = true) => { try { return game.settings.get(welcomeNs ?? "world", k); } catch (e) { return d; } };
  const welcomeSet = async (k, v) => { try { await game.settings.set(welcomeNs ?? "world", k, v); } catch (e) { console.warn("AxecleftTools | welcome setting", e); } };
  /** The active Axecleft modules: [{ title, version }]. */
  const suiteModules = () => [...i18n.modules].map((id) => game.modules.get(id)).filter((m) => m?.active)
    .map((m) => ({ title: m.title ?? m.id, version: m.version ?? "" })).sort((x, y) => x.title.localeCompare(y.title));
  const linkButton = (href, icon, label, hint) => `<a class="axecleft-welcome-link" href="${escH(href)}" target="_blank" rel="noopener"><i class="${icon}"></i><span><strong>${escH(label)}</strong><small>${escH(hint)}</small></span></a>`;
  const welcomeLinks = () => `<div class="axecleft-welcome-links">
      ${linkButton(DISCORD_URL, "fab fa-discord", t("Join the Discord"), t("Help, news, ideas and early looks at what comes next."))}
      ${linkButton(PATREON_URL, "fab fa-patreon", t("Support on Patreon"), t("Axecleft's modules are free. Patrons get new releases two weeks early."))}
      ${linkButton(api.guideUrl(), "fas fa-book", t("User Guide"), t("How each tool works, in your web browser."))}
      ${toursButton()}
    </div>`;
  /** 9.7: "Take a tour" opens Foundry's Tour Management (when this user has an Axecleft tour). */
  const hasTours = () => {
    try {
      if (!TourBase || !globalThis.game?.tours) return false;
      return [...tourDefs.keys()].some((k) => { const tour = game.tours.get(k); return tour && (!tour.config.restricted || game.user.isGM); });
    } catch (e) { return false; }
  };
  const toursButton = () => (hasTours() ? `<button type="button" class="axecleft-welcome-link" data-axecleft-tours><i class="fas fa-person-hiking"></i><span><strong>${escH(t("Take a tour"))}</strong><small>${escH(t("Guided tours of each tool, one tab at a time."))}</small></span></button>` : "");
  /** Open Foundry's Tour Management window (closing the window the button was in). */
  api.openTours = (from = null) => {
    try {
      const TM = foundry.applications?.sidebar?.apps?.ToursManagement;
      if (TM) {
        const appEl = from?.closest?.(".application");
        if (appEl?.id) foundry.applications.instances?.get(appEl.id)?.close();
        const open = foundry.applications.instances?.get("tours-management") ?? new TM();
        return open.render({ force: true });
      }
      // Foundry v11: classic windows (ToursManagement is a global name, not a property of globalThis)
      const TM11 = typeof ToursManagement !== "undefined" ? ToursManagement : null;
      if (!TM11) return;
      const wins = Object.values(globalThis.ui?.windows ?? {});
      if (from) wins.find((w) => w?.element?.[0]?.contains?.(from))?.close();
      const open = wins.find((w) => w instanceof TM11) ?? new TM11();
      return open.render(true);
    } catch (err) { console.warn("AxecleftTools | Tour Management", err); }
  };
  if (!globalThis.__axecleftToursButton) {
    globalThis.__axecleftToursButton = true;
    document.addEventListener("click", (ev) => {
      const btn = ev.target?.closest?.("[data-axecleft-tours]");
      if (!btn) return;
      ev.preventDefault();
      globalThis.AxecleftTools?.openTours?.(btn);
    });
  }
  const welcomeStyle = () => {
    if (document.getElementById("axecleft-welcome-style")) return;
    const st = document.createElement("style");
    st.id = "axecleft-welcome-style";
    st.textContent = `.axecleft-welcome-links { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
      .axecleft-welcome-link { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--color-border-light-tertiary, #7a7971); border-radius: 6px; text-decoration: none; }
      .axecleft-welcome-link:hover { box-shadow: 0 0 6px var(--color-shadow-primary, #ff6400); }
      button.axecleft-welcome-link { width: 100%; height: auto; background: none; font: inherit; color: inherit; text-align: left; line-height: normal; justify-content: flex-start; cursor: pointer; }
      .axecleft-welcome-link i { font-size: 1.6em; width: 1.4em; text-align: center; }
      .axecleft-welcome-link span { display: flex; flex-direction: column; }
      .axecleft-welcome-link small { opacity: 0.8; }
      .axecleft-welcome-mods { margin: 4px 0 8px; padding-left: 18px; columns: 2; font-size: 0.9em; }
      .axecleft-welcome-check { display: flex; align-items: center; gap: 6px; margin: 4px 0; }`;
    document.head.append(st);
  };
  /** A VooDoo phone (a mobile account): no welcome window there. */
  const onPhone = () => { try { return !!game.user?.getFlag?.("axeclefts-voodoo", "main"); } catch (e) { return false; } };

  /** The welcome window: the links, the active modules, and "Show this when Foundry starts" for this user. */
  api.showWelcome = async () => {
    welcomeStyle();
    const mods = suiteModules();
    const content = `<p>${escH(t("Thanks for using Axecleft's Tool Suite! Come and say hello, ask for help or suggest an idea on Discord; Patreon keeps the modules free."))}</p>
      ${welcomeLinks()}
      ${mods.length ? `<p class="hint">${escH(t("Active in this world:"))}</p><ul class="axecleft-welcome-mods">${mods.map((m) => `<li>${escH(m.title)} <small>${escH(m.version)}</small></li>`).join("")}</ul>` : ""}
      <label class="axecleft-welcome-check"><input type="checkbox" name="welcomeMine" ${welcomeGet(WELCOME_MINE) ? "checked" : ""}> ${escH(t("Show this when Foundry starts"))}</label>
      <p class="hint">${escH(t("You can change this later: Configure Settings → any Axecleft module → Axecleft's Tool Suite."))}</p>`;
    await DialogShim.wait({
      window: { title: t("Axecleft's Tool Suite"), icon: "fas fa-toolbox" }, position: { width: 460 }, content,
      buttons: [{ action: "close", label: t("Close"), icon: "fas fa-check", default: true }],
      render: (ev, dlg) => {
        const el = dlg?.element?.querySelector ? dlg.element : dlg?.element?.[0];
        el?.querySelector?.("input[name='welcomeMine']")?.addEventListener("change", (e) => welcomeSet(WELCOME_MINE, !!e.currentTarget.checked));
      },
    });
  };

  /** The suite's settings: the welcome window (for the world, GM only; for me) and the links. */
  api.openSuiteSettings = async () => {
    welcomeStyle();
    const gm = !!game.user?.isGM;
    const content = `<p class="hint">${escH(t("Settings shared by every Axecleft module."))}</p>
      <label class="axecleft-welcome-check"><input type="checkbox" name="welcomeWorld" ${welcomeGet(WELCOME_WORLD) ? "checked" : ""} ${gm ? "" : "disabled"}> ${escH(t("Show the welcome window when Foundry starts (everyone in this world)"))}</label>
      <label class="axecleft-welcome-check"><input type="checkbox" name="welcomeMine" ${welcomeGet(WELCOME_MINE) ? "checked" : ""}> ${escH(t("Show it to me"))}</label>
      <p class="hint">${escH(t("The welcome window has the links to the Tool Suite's Discord, Patreon and User Guide."))}</p>
      ${welcomeLinks()}`;
    const res = await DialogShim.wait({
      window: { title: t("Axecleft's Tool Suite"), icon: "fas fa-toolbox" }, position: { width: 460 }, content,
      buttons: [
        { action: "save", label: t("Save"), icon: "fas fa-floppy-disk", default: true, callback: (ev, btn) => {
          const f = btn.form?.elements ?? {};
          return { world: !!f.welcomeWorld?.checked, mine: !!f.welcomeMine?.checked };
        } },
        { action: "show", label: t("Show the welcome window"), icon: "fas fa-door-open" },
      ],
    });
    if (res && typeof res === "object") {
      if (gm && res.world !== welcomeGet(WELCOME_WORLD)) await welcomeSet(WELCOME_WORLD, res.world);
      if (res.mine !== welcomeGet(WELCOME_MINE)) await welcomeSet(WELCOME_MINE, res.mine);
    } else if (res === "show") api.showWelcome();
  };

  /** At init: the welcome settings, and the "Axecleft's Tool Suite" button in each active Axecleft module's settings. */
  api.registerSupportMenus = () => {
    for (const ns of ["world", ...[...i18n.modules].filter((id) => game.modules.get(id)?.active)]) {
      try {
        if (!game.settings.settings?.has?.(`${ns}.${WELCOME_WORLD}`)) game.settings.register(ns, WELCOME_WORLD, { scope: "world", config: false, type: Boolean, default: true });
        if (!game.settings.settings?.has?.(`${ns}.${WELCOME_MINE}`)) game.settings.register(ns, WELCOME_MINE, { scope: "client", config: false, type: Boolean, default: true });
        welcomeNs = ns;
        break;
      } catch (e) { console.warn(`AxecleftTools | could not register the welcome settings under "${ns}"`, e); }
    }
    const Base = foundry.applications?.api?.ApplicationV2 ?? (typeof FormApplication !== "undefined" ? FormApplication : null);
    if (!Base) return;
    // Settings menus open a window; this one opens the suite's settings dialog instead.
    class AxecleftSuiteSettings extends Base {
      render() { globalThis.AxecleftTools.openSuiteSettings(); return this; }
    }
    const menu = { name: /*t*/"Axecleft's Tool Suite", label: /*t*/"Tool Suite settings", hint: /*t*/"Settings shared by every Axecleft module (the welcome window), and the links to the Tool Suite's Discord, Patreon and User Guide.", icon: "fas fa-toolbox", type: AxecleftSuiteSettings, restricted: false };
    for (const id of i18n.modules) {
      if (!game.modules.get(id)?.active || game.settings.menus.has(`${id}.suite`)) continue;
      try { game.settings.registerMenu(id, "suite", { ...menu }); } // a copy each: Foundry writes the module into it
      catch (err) { console.warn(`AxecleftTools | Couldn't add the Tool Suite button to ${id}'s settings`, err); }
    }
  };
  // The welcome window when Foundry starts (once, whichever version loads first; it calls the newest API)
  if (!globalThis.__axecleftWelcome) {
    globalThis.__axecleftWelcome = true;
    Hooks.once("ready", () => {
      const A = globalThis.AxecleftTools;
      if (!A?.showWelcome || onPhone() || !welcomeGet(WELCOME_WORLD) || !welcomeGet(WELCOME_MINE)) return;
      setTimeout(() => A.showWelcome(), 1500);
    });
  }
  /*
   * 9.5: a function as the number of dice. Some D35E spells give their damage as "min((@cl),10)d6" (Lightning Bolt).
   * Foundry's dice grammar only takes a number or a bracket before the "d", and D35E's pre-processing leaves min() and
   * max() alone outside its own size functions, so the roll fails ("Expected a bracket…"). Such a function is put in
   * brackets before Foundry reads the formula: "(min((@cl),10))d6". Nothing else in the formula changes.
   */
  const DICE_FN = /\b(min|max|floor|ceil|round|abs|trunc)\s*\(/gi;
  api.fixDiceFunctions = (formula) => {
    const f = String(formula ?? "");
    if (!/\)\s*d/i.test(f)) return f;
    let out = "", last = 0;
    DICE_FN.lastIndex = 0;
    let m;
    while ((m = DICE_FN.exec(f))) {
      const start = m.index;
      if (start < last) continue;
      // The function's closing bracket
      let depth = 0, end = -1;
      for (let i = start + m[0].length - 1; i < f.length; i++) {
        if (f[i] === "(") depth++;
        else if (f[i] === ")" && --depth === 0) { end = i; break; }
      }
      if (end < 0) break;
      const after = f.slice(end + 1);
      const already = f.slice(0, start).trimEnd().endsWith("(") && /^\s*\)/.test(after);
      if (/^\s*[dD](\d|\()/.test(after) && !already) {
        out += f.slice(last, start) + "(" + f.slice(start, end + 1) + ")";
        last = end + 1;
        DICE_FN.lastIndex = end + 1;
      }
    }
    return out + f.slice(last);
  };
  api.patchDiceFormulas = () => {
    const Base = globalThis.foundry?.dice?.Roll ?? globalThis.Roll;
    const classes = [...new Set([...(CONFIG.Dice?.rolls ?? []), Base].filter(Boolean))];
    for (const cls of classes) {
      if (!Object.prototype.hasOwnProperty.call(cls, "parse")) continue;
      const own = Object.getOwnPropertyDescriptor(cls, "parse")?.value;
      if (typeof own !== "function" || own.__axecleftDice) continue;
      const wrapped = function (formula, data) { return own.call(this, globalThis.AxecleftTools?.fixDiceFunctions?.(formula) ?? formula, data); };
      wrapped.__axecleftDice = true;
      try { Object.defineProperty(cls, "parse", { value: wrapped, writable: true, configurable: true }); }
      catch (err) { console.warn("AxecleftTools | dice formula fix", err); }
    }
  };
  if (!globalThis.__axecleftDiceFix) {
    globalThis.__axecleftDiceFix = true;
    Hooks.once("ready", () => globalThis.AxecleftTools?.patchDiceFormulas?.());
  }

  /*
   * 9.7: tours (9.71: Foundry v11 too). A tour walks through one tab of a window, step by step, with Foundry's own Tours
   * (Configure Settings → Tour Management, grouped by module). Each module describes its tours in English with
   * registerTour(); the text is translated like the rest of the module. Before each step the tour opens the window on
   * its tab (and any closed section holding the step's element); a step whose element isn't shown (a setting hides it)
   * is shown in the middle of the screen instead. Each of our windows also gets "Tour of this tab" in its ⋮ menu.
   *
   *   AxecleftTools.registerTour({
   *     module: "axecleft-gemstones",            // the module it is listed under (or a function returning one)
   *     id: "gems", title: "Treasure Generator: Gems", description: "…",
   *     app: "axecleft-treasure-generator",      // the window's id (or cls: a class of the window, for dialogs)
   *     tab: "t-axecleft-gemstones-gems",        // the tab it covers (for the window's ⋮ menu), optional
   *     open: async () => …,                     // opens the window on that tab
   *     steps: [{ id, title, content,            // content: "\n" starts a new paragraph
   *               field: "gem.grade" | sel: ".atg-tabs" (inside the window) | doc: "#chat" (anywhere) | nothing (centre),
   *               direction: "UP" | "DOWN" | "LEFT" | "RIGHT", gm: true }],
   *     next: ["axecleft-gemstones.art"],        // suggested when it ends
   *   });
   */
  const tourDefs = existing?.tourDefs ?? new Map();
  // Foundry v13+: foundry.nue.Tour; Foundry v11: the global Tour class (a global name, not a property of globalThis)
  const TourBase = globalThis.foundry?.nue?.Tour ?? (typeof Tour !== "undefined" ? Tour : null);
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const tourRoot = (def) => (def.app ? document.getElementById(def.app) : def.cls ? document.querySelector(`.${CSS.escape(def.cls)}`) : document.body);
  /** The CSS selector of a step's element. */
  const stepSelector = (def, s) => {
    if (s.doc) return s.doc;
    const root = def.app ? `#${CSS.escape(def.app)}` : def.cls ? `.${CSS.escape(def.cls)}` : "body";
    if (s.field) {
      const f = `[name="${String(s.field).replace(/"/g, '\\"')}"]`;
      return `${root} .form-group:has(${f}), ${root} .atg-checks:has(${f}), ${root} label:has(${f}), ${root} ${f}`;
    }
    if (s.sel) return s.sel.split(",").map((x) => `${root} ${x.trim()}`).join(", ");
    return null;
  };
  let AxecleftTour = existing?.AxecleftTour ?? null;
  if (TourBase && !AxecleftTour) {
    AxecleftTour = class AxecleftTour extends TourBase {
      #centered = null;
      get def() { return tourDefs.get(this.key) ?? null; }
      /** The window must be open before the first step (Foundry's Tour Management window closes over it otherwise). */
      async start() {
        try { await this.def?.open?.(); } catch (err) { console.error(`AxecleftTools | tour ${this.key}: couldn't open the window`, err); }
        await new Promise((r) => setTimeout(r, 200));
        return super.start();
      }
      async _preStep() {
        await super._preStep();
        const def = this.def, step = this.currentStep;
        if (!def || !step) return;
        // The window, open on the tour's tab (reopened if it was closed in between)
        const root = tourRoot(def);
        const onTab = !def.tab || !!root?.querySelector(`[data-tab-btn="${def.tab}"].active, [data-kind-btn="${def.tab}"].active, [data-tab="${def.tab}"].active, .item.active[data-tab="${def.tab}"]`);
        if (!visible(root) || !onTab) { try { await def.open?.(); } catch (err) { console.error(`AxecleftTools | tour ${this.key}`, err); } }
        const before = def.steps?.find((x) => x.id === step.id)?.before;
        try { await before?.(tourRoot(def)); } catch (err) { console.warn(`AxecleftTools | tour ${this.key} step ${step.id}`, err); }
        if (!step.selector) return;
        // Wait (up to 2 seconds) for the element, opening the closed sections around it
        let el = null;
        for (let i = 0; i < 40; i++) {
          el = this.#find(step.selector, true);
          if (el) {
            let opened = false;
            for (let d = el.closest("details:not([open])"); d; d = d.parentElement?.closest("details:not([open])")) { d.open = true; opened = true; }
            el = this.#find(step.selector);
            if (visible(el)) break;
            if (opened) continue;
          }
          el = null;
          await new Promise((r) => setTimeout(r, 50));
        }
        if (!el) return;
        this.#clearSticky(el);
        // The window must have stopped moving (a tab still drawing, the window fitting its height), then the element is
        // scrolled to the middle of its window
        await this.#settle(el);
        try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch (e) { /* old browser */ }
        await this.#settle(el);
      }
      /**
       * Bars pinned to the top or bottom of the element's scrolling window (a tab strip, a Generate button) would cover it
       * once it is scrolled into view: its scroll margins leave room for them.
       */
      #clearSticky(el) {
        try {
          let box = el.parentElement;
          while (box && box !== document.body) {
            const st = getComputedStyle(box);
            if (/(auto|scroll)/.test(st.overflowY) && box.scrollHeight > box.clientHeight) break;
            box = box.parentElement;
          }
          if (!box || box === document.body) return;
          let top = 0, bottom = 0;
          for (const bar of box.querySelectorAll("*")) {
            if (bar.contains(el) || el.contains(bar)) continue;
            const st = getComputedStyle(bar);
            if (st.position !== "sticky") continue;
            const h = bar.getBoundingClientRect().height;
            if (st.top !== "auto") top = Math.max(top, h);
            else if (st.bottom !== "auto") bottom = Math.max(bottom, h);
          }
          el.style.scrollMarginTop = `${Math.ceil(top) + 12}px`;
          el.style.scrollMarginBottom = `${Math.ceil(bottom) + 12}px`;
        } catch (e) { /* layout not readable */ }
      }
      /** Where an element is on screen, as text. */
      #where(el) { const r = el?.getBoundingClientRect?.(); return r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` : ""; }
      /** Wait until the element has been in the same place for 150 ms (at most 1.5 seconds). */
      async #settle(el) {
        let last = this.#where(el), same = 0;
        for (let i = 0; i < 30 && same < 3; i++) {
          await new Promise((r) => setTimeout(r, 50));
          const now = this.#where(el);
          same = now === last ? same + 1 : 0;
          last = now;
        }
      }
      #follow = null;
      /** While a step is shown, keep its element in view: if the window scrolls or moves, scroll it back and redraw the step. */
      #startFollow() {
        this.#stopFollow();
        const step = this.currentStep, el = this.targetElement;
        if (!step || !el || this.#centered) return;
        let where = this.#where(el), redraws = 0, busy = false;
        this.#follow = setInterval(async () => {
          if (busy || this.currentStep !== step || this.targetElement !== el) return this.#stopFollow();
          const now = this.#where(el);
          if (now === where || !visible(el)) return;
          if (redraws++ >= 6) return this.#stopFollow();
          busy = true;
          try {
            await this.#settle(el);
            try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch (e) { /* old browser */ }
            await this.#settle(el);
            if (this.currentStep !== step) return;
            await TourBase.prototype._postStep.call(this);
            await TourBase.prototype._renderStep.call(this);
            where = this.#where(el);
          } catch (err) { console.warn(`AxecleftTools | tour ${this.key}`, err); this.#stopFollow(); }
          finally { busy = false; }
        }, 200);
      }
      #stopFollow() { if (this.#follow) clearInterval(this.#follow); this.#follow = null; }
      exit() { this.#stopFollow(); return super.exit(); }
      /** The first element the selector finds that is shown (or, with any, the first at all). */
      #find(selector, any = false) {
        const all = [...document.querySelectorAll(selector)];
        return all.find(visible) ?? (any ? all[0] : null) ?? null;
      }
      _getTargetElement(selector) { return this.#find(selector); }
      /** A step whose element isn't shown is shown in the middle of the screen instead of failing. */
      async _renderStep() {
        const step = this.currentStep;
        this.#centered = null;
        if (step?.selector && !this.targetElement) {
          this.#centered = step.selector;
          delete step.selector;
          try { return await super._renderStep(); } finally { step.selector = this.#centered; }
        }
        await super._renderStep();
        this.#startFollow();
      }
      async _postStep() {
        this.#stopFollow();
        const step = this.currentStep;
        if (this.#centered && step) {
          delete step.selector;
          try { return await super._postStep(); } finally { step.selector = this.#centered; this.#centered = null; }
        }
        return super._postStep();
      }
    };
  }
  /** The tours of a module, built when the world is ready (the language is loaded then). */
  const buildTour = (def) => {
    if (!AxecleftTour || !globalThis.game?.tours) return false;
    const ns = typeof def.module === "function" ? def.module() : def.module;
    if (!ns || !game.modules.get(ns)?.active) return false;
    const key = `${ns}.${def.id}`;
    if (game.tours.has(key)) return true;
    const steps = (def.steps ?? []).map((s) => ({
      id: s.id, title: t(s.title), content: t(s.content), restricted: !!s.gm,
      ...(stepSelector(def, s) ? { selector: stepSelector(def, s) } : {}),
      ...(s.direction ? { tooltipDirection: s.direction } : {}),
    }));
    const tour = new AxecleftTour({
      namespace: ns, id: def.id, title: t(def.title), description: def.description ? t(def.description) : "", display: true,
      restricted: def.gm !== false, canBeResumed: false, steps,
      suggestedNextTours: (def.next ?? []).map((k) => (typeof k === "function" ? k() : k)).filter(Boolean),
    });
    tourDefs.set(key, def);
    try { game.tours.register(ns, def.id, tour); } catch (err) { console.warn(`AxecleftTools | tour ${key}`, err); return false; }
    return true;
  };
  const pendingTours = existing?.pendingTours ?? [];
  // Tours registered before this version of the file loaded
  for (const def of globalThis.__axecleftTourQueue?.splice(0) ?? []) pendingTours.push(def);
  api.tourDefs = tourDefs;
  api.pendingTours = pendingTours;
  api.AxecleftTour = AxecleftTour;
  /** Describe a tour (see above). It is registered with Foundry when the world is ready. */
  api.registerTour = (def) => {
    if (!def?.id || !def?.module || !Array.isArray(def.steps)) return console.error("AxecleftTools | registerTour() needs module, id and steps", def);
    if (globalThis.game?.ready) { if (!buildTour(def)) pendingTours.push(def); }
    else pendingTours.push(def);
  };
  api.buildTours = () => { for (const def of pendingTours.splice(0)) buildTour(def); };
  /** The registered tour of a window's tab (for its ⋮ menu). */
  const ownsWindow = (def, appId, classes = []) => (def.app && def.app === appId) || (def.cls && classes.includes(def.cls));
  api.tourFor = (appId, tab, classes = []) => {
    if (!globalThis.game?.tours) return null;
    for (const [key, def] of tourDefs) {
      if (!ownsWindow(def, appId, classes)) continue;
      if (def.tab && tab && def.tab !== tab) continue;
      if (def.tab && !tab) continue;
      const tour = game.tours.get(key);
      if (tour && (!tour.config.restricted || game.user.isGM)) return tour;
    }
    return null;
  };
  /** Start a tour from the beginning. */
  api.startTour = async (tour) => {
    if (!tour) return;
    try {
      const active = TourBase?.activeTour;
      if (active && active !== tour) active.exit();
      await tour.reset();
      await tour.start();
    } catch (err) { console.error("AxecleftTools | tour", err); ui.notifications?.error(err.message); }
  };
  if (!globalThis.__axecleftTours) {
    globalThis.__axecleftTours = true;
    Hooks.once("ready", () => globalThis.AxecleftTools?.buildTours?.());
    /** The tour button of a window: { label, start } (null when the window has no tour). */
    const tourButton = (app) => {
      const A = globalThis.AxecleftTools;
      const id = app?.id ?? app?.options?.id;
      if (!A?.tourFor || !id) return null;
      const current = () => {
        const root = document.getElementById(id);
        return root?.querySelector("[data-tab-btn].active")?.dataset.tabBtn ?? root?.querySelector("[data-kind-btn].active")?.dataset.kindBtn ?? root?.querySelector("nav .item.active[data-tab]")?.dataset.tab ?? (typeof app.tab === "string" ? app.tab : null);
      };
      const classes = [...(app.options?.classes ?? [])];
      const defs = [...A.tourDefs.values()].filter((d) => (d.app && d.app === id) || (d.cls && classes.includes(d.cls)));
      if (!defs.length) return null;
      return {
        label: A.t(defs.some((d) => d.tab) ? /*t*/"Tour of this tab" : /*t*/"Tour of this window"),
        start: () => {
          const tour = A.tourFor(id, current(), classes) ?? A.tourFor(id, null, classes);
          if (!tour) return ui.notifications.info(A.t("This tab has no tour yet."));
          A.startTour(tour);
        },
      };
    };
    // "Tour of this tab" in the ⋮ menu of each Axecleft window that has a tour (Foundry v13+)
    Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
      try {
        if (!Array.isArray(controls) || controls.some((c) => c.action === "axecleftTour")) return;
        const b = tourButton(app);
        if (b) controls.push({ icon: "fas fa-person-hiking", label: b.label, action: "axecleftTour", onClick: b.start });
      } catch (err) { console.warn("AxecleftTools | tour menu", err); }
    });
    // Foundry v11: a Tour button in the title bar of each Axecleft window that has a tour
    if (!foundry.applications?.api?.ApplicationV2) {
      Hooks.on("getApplicationHeaderButtons", (app, buttons) => {
        try {
          if (!Array.isArray(buttons) || buttons.some((x) => x.class === "axecleft-tour")) return;
          const b = tourButton(app);
          if (!b) return;
          buttons.unshift({ label: globalThis.AxecleftTools.t("Tour"), class: "axecleft-tour", icon: "fas fa-person-hiking", onclick: () => b.start() });
        } catch (err) { console.warn("AxecleftTools | tour button", err); }
      });
    }
  }

  // Once, whichever version loads first; it always calls the newest API.
  if (!globalThis.__axecleftSupportMenus) {
    globalThis.__axecleftSupportMenus = true;
    Hooks.once("init", () => globalThis.AxecleftTools?.registerSupportMenus?.());
  }

  // Foundry v11/v12: register the toolbar group's own (empty) canvas layer before the canvas is built.
  Hooks.once("init", () => {
    const layers = CONFIG.Canvas?.layers;
    // Foundry v11 core classes are global names but not properties of globalThis, so use typeof.
    const Base = typeof InteractionLayer !== "undefined" ? InteractionLayer : null;
    if (!layers || layers[LAYER] || foundry.utils.isNewerVersion?.(game.version ?? "0", "12.999")) return;
    if (!Base) return console.warn("AxecleftTools | InteractionLayer not found; the toolbar group will use the token layer.");
    class AxecleftToolsLayer extends Base {
      static get layerOptions() { return foundry.utils.mergeObject(super.layerOptions, { name: LAYER, zIndex: 180 }); }
      async _draw() {}
    }
    layers[LAYER] = { layerClass: AxecleftToolsLayer, group: "primary" };
    console.log("AxecleftTools | Registered the Axecleft's Tools canvas layer.");
  });
  // Register the hook only once; it always calls the newest API.
  if (!existing) Hooks.on("getSceneControlButtons", (controls) => globalThis.AxecleftTools.addControls(controls));
})();
