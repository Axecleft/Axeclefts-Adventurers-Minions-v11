/**
 * A&M v2 — tours of the window, one per page (Axecleft's Tools 9.7 tours: Configure Settings → Tour Management, or the
 * window's ⋮ menu → Tour of this tab). Players can take them too: they build characters on actors they own.
 * Steps point at the page's own fields; a step whose part isn't shown (a non-caster has no domains) shows in the middle.
 * Pages that need a character with levels show a sample one while the tour runs when the character being built has
 * none (the window's tourSample; the character being built comes back when the tour ends). Tall parts (a table) are
 * pointed at by their first row, so the step's box stays beside it on screen.
 */
const MOD = "axeclefts-adventurers-minions";
const APP = "axecleft-aam2";
const STEP_PAGES = ["basics", "abilities", "classes", "skills", "feats", "spells", "equipment", "review"];
/** The pages whose tours point at parts that need a character with levels: without one, the tour shows a sample. */
const NEED_LEVELS = new Set(["abilities", "classes", "skills", "feats", "spells", "equipment", "review"]);

/** When the tour is over (finished, closed, or another tour started), the sample goes and the character being built comes back. */
let watching = null;
function watchTourEnd(w) {
  clearInterval(watching);
  const TourClass = globalThis.foundry?.nue?.Tour ?? (typeof Tour !== "undefined" ? Tour : null);
  const ours = () => { const a = TourClass?.activeTour; return !!a && (a.namespace ?? a.config?.namespace) === MOD; };
  setTimeout(() => {
    watching = setInterval(() => {
      if (ours()) return;
      clearInterval(watching); watching = null;
      w.endTourSample?.();
    }, 500);
  }, 2000); // the tour starts after its window is open
}

/** grp(sel): the form row holding an element. */
const grp = (sel) => `.form-group:has(${sel})`;

export function registerTours(open) {
  const R = globalThis.AxecleftTools?.registerTour;
  if (!R) return;
  /** Opens the window on a page: the step pages need a character (the one being built, or a new one). */
  const show = (page) => async () => {
    const w = open();
    for (let i = 0; i < 50 && !w.root; i++) await new Promise((r) => setTimeout(r, 100));
    if (STEP_PAGES.includes(page)) {
      if (!w.plan) { const resume = w.acts?.resume; if (resume) resume.call(w); if (!w.plan) w.acts?.build?.call(w); }
      if (NEED_LEVELS.has(page) && w.tourSample) {
        try { await w.tourSample(page); } catch (err) { console.warn(`${MOD} | tour sample`, err); }
        if (w._tourStash) watchTourEnd(w);
      }
      if (w.page !== page) w.go(page); else w.paint();
    } else if (w.page !== page) { w.page = page; w.paint(); }
    await new Promise((r) => setTimeout(r, 150));
  };
  const tab = (page) => ({ module: MOD, app: APP, tab: page, open: show(page), gm: false });
  const nav = (page, title, content) => ({ id: "tab", sel: `.aam2-steps [data-step="${page}"]`, title, content, direction: "DOWN" });
  const side = { id: "side", sel: ".aam2-side", title: /*t*/"Summary", content: /*t*/"The character so far: level, hit points, BAB, saves and ability scores, skill points and feats still to choose, and how many things are left to check (See them on Review).", direction: "LEFT" };
  const foot = { id: "foot", sel: ".aam2-foot", title: /*t*/"Back, Next and Create", content: /*t*/"Move between the steps, or create the actor from any step (Edit: Apply changes). The dots on the steps show what is done (green) and what needs a look.", direction: "UP" };

  R({ ...tab("start"), id: "start", title: /*t*/"Adventurers and Minions: Start", description: /*t*/"The three ways to make or change a character.",
    next: [`${MOD}.basics`, `${MOD}.random`, `${MOD}.edit`],
    steps: [
      { id: "intro", title: /*t*/"Adventurers and Minions", content: /*t*/"Make complete D35E characters and NPCs. You choose; D35E works out BAB, saves, skills, AC, attacks and class features from your choices, as its own level-up window does." },
      { id: "build", sel: '[data-act="build"]', title: /*t*/"Build a character", content: /*t*/"Choose everything, step by step: basics, ability scores, classes and levels (gestalt too), skills, feats, spells or powers, and equipment. A character you were building is kept in this browser (Continue…)." },
      { id: "random", sel: '[data-act="randomPage"]', title: /*t*/"Random character", content: /*t*/"Pick what matters (race, class, level…) and A&M chooses the rest by the class profiles, modelled on the DMG's NPCs. You can change anything before creating, or make many at once." },
      { id: "edit", sel: '[data-act="editPage"]', title: /*t*/"Edit an actor", content: /*t*/"Read an existing actor back into the steps, add levels or change classes, and apply only what changed. A copy is kept first. Also in an actor's right-click menu and its sheet's ⋮ menu." },
      { id: "recent", sel: ".aam2-start table.aam2-t, .aam2-main table.aam2-t", title: /*t*/"Recent", content: /*t*/"The last characters you made or edited in this browser, with buttons to edit them again or open their sheets." },
      { id: "gm", sel: '[data-act="profilesPage"]', title: /*t*/"Build profiles and Prestige requirements", content: /*t*/"GM only. Build profiles: the builds A&M follows for each class (ability order, skills, feats, spells, gear), yours added or A&M's changed. Prestige requirements: what A&M checks before each prestige class. Both are kept in the world and each has its own tour." },
      { id: "token", title: /*t*/"From a token", content: /*t*/"The Adventurers and Minions button in the token tools opens this window, or Edit on the selected token's actor when you own it." },
      { id: "reload", sel: '[data-act="reload"]', title: /*t*/"Reload", content: /*t*/"Races, classes and feats are read from your compendiums once a session. Reload after adding or changing a compendium." },
    ] });

  R({ ...tab("random"), id: "random", title: /*t*/"Adventurers and Minions: Random", description: /*t*/"A random character or NPC, or many at once.",
    steps: [
      { id: "kind", sel: grp('[data-ropt="kind"]'), title: /*t*/"Character or NPC", content: /*t*/"A player character (character sheet, PC wealth) or an NPC (NPC sheet, NPC gear value)." },
      { id: "who", sel: grp('[data-ropt="race"]'), title: /*t*/"Race, sex and alignment", content: /*t*/"Leave any of them on Random: the race from the common races, the alignment one the class allows." },
      { id: "cls", sel: grp('[data-ropt="cls1"]'), title: /*t*/"Class", content: /*t*/"A class and how many levels in it, or Random. A second class makes a multiclass character. Variant classes (Unearthed Arcana) are in their own group of the list; Random never picks one by itself." },
      { id: "build", sel: grp('[data-ropt="var1"]'), title: /*t*/"Build", content: /*t*/"A class with several builds (a fighter's archer or two-handed, a wizard's evoker or summoner…): one of them, or Random. The build sets the ability order, skills, feats, spells and gear." },
      { id: "gestalt", sel: grp('[data-ropt="gestalt"]'), title: /*t*/"Gestalt", content: /*t*/"Two classes at every level (Unearthed Arcana): the class and second class each at the total level, random when not chosen." },
      { id: "level", sel: grp('[data-ropt="level"]'), title: /*t*/"Total level", content: /*t*/"The character's level; blank for 1 to 5 (or the class levels given)." },
      { id: "prestige", sel: grp('[data-ropt="prestige"]'), title: /*t*/"Prestige class", content: /*t*/"None, Random once the character qualifies, or one prestige class: the character takes it from the first level it meets the requirements, then the levels after it in that class." },
      { id: "method", sel: grp('[data-ropt="method"]'), title: /*t*/"Ability scores and hit points", content: /*t*/"How the scores are made (arrays, rolled or point buy, placed by the class profile) and how hit points are rolled." },
      { id: "many", sel: grp('[data-ropt="count"]'), title: /*t*/"How many", content: /*t*/"More than one goes straight into the folder below without Review: a band of guards, a party of adventurers." },
      { id: "owner", sel: grp('[data-ropt="owner"]'), title: /*t*/"Owner", content: /*t*/"GM: a player who will own the new actors (the GM always does)." },
      { id: "go", sel: '[data-act="generate"]', title: /*t*/"Generate", content: /*t*/"Makes the character and opens it on the steps (Review shows Roll again buttons for each part); the other button makes that many straight into the folder.", direction: "UP" },
    ] });

  R({ ...tab("profiles"), gm: true, id: "profiles", title: /*t*/"Adventurers and Minions: Build profiles", description: /*t*/"GM: the builds A&M follows for each class.",
    steps: [
      { id: "cls", sel: '[data-on="profileCls"]', title: /*t*/"Class and build", content: /*t*/"A class, then one of its builds: its own build, one of A&M's (an archer, a healer…), or New build." },
      { id: "form", sel: '[name="pf.skills"]', title: /*t*/"What the build chooses", content: /*t*/"The ability order and increases, skills, feats, alignments, favourite spells, weapons, and a cleric's domains or a wizard's schools. One per line; what's left empty follows the class's own build." },
      { id: "save", sel: '[data-act="profileSave"]', title: /*t*/"Save, hide or forget", content: /*t*/"Save keeps the build in the world; Hide takes one of A&M's builds off the lists; Forget yours goes back to A&M's.", direction: "UP" },
      { id: "move", sel: '[data-act="profileExport"]', title: /*t*/"Export and Import", content: /*t*/"Move your builds to another world.", direction: "UP" },
    ] });

  R({ ...tab("prestige"), gm: true, id: "prestige", title: /*t*/"Adventurers and Minions: Prestige requirements", description: /*t*/"GM: what A&M checks before each prestige class.",
    steps: [
      { id: "cls", sel: '[data-on="prestigeCls"]', title: /*t*/"Prestige class", content: /*t*/"Every prestige class found, with where its requirements come from: the SRD's, yours, or none." },
      { id: "form", sel: '[name="pr.race"]', title: /*t*/"Requirements", content: /*t*/"Race, alignment, base attack, skill ranks, feats, spellcasting, languages and the rest. A character who doesn't meet them gets a rule broken on Classes and levels, and the class lists mark the class ✘." },
      { id: "save", sel: '[data-act="prestigeSave"]', title: /*t*/"Save", content: /*t*/"Save yours (they replace the SRD's), Use the SRD's to go back, or No requirements.", direction: "UP" },
      { id: "move", sel: '[data-act="prestigeExport"]', title: /*t*/"Export and Import", content: /*t*/"Move your requirements to another world.", direction: "UP" },
    ] });

  R({ ...tab("edit"), id: "edit", title: /*t*/"Adventurers and Minions: Edit an actor", description: /*t*/"Read an actor back into the steps and change it.",
    steps: [
      { id: "pick", sel: grp('[name="edit.actor"]'), title: /*t*/"The actor", content: /*t*/"Pick one of your actors, a selected token's, or drop an actor on the window. Actors A&M made reopen exactly as built; others are read from their race, classes, level records, feats and spells." },
      { id: "open", sel: '[data-act="editOpen"]', title: /*t*/"Open", content: /*t*/"Reads the actor into the steps. What A&M guessed or couldn't place is listed at the top of Classes and levels and Review; anything it doesn't know stays on the actor untouched.", direction: "UP" },
      { id: "after", title: /*t*/"Then", content: /*t*/"Change anything on the steps: add levels, change a class, redo skills and feats. Review lists every change, Fill in what's missing completes new levels by the class profiles, and Apply changes writes only what changed, after making a copy in the folder A&M backups." },
    ] });

  R({ ...tab("basics"), id: "basics", title: /*t*/"Adventurers and Minions: Basics", description: /*t*/"Name, race, sex, alignment, languages and images.", next: [`${MOD}.abilities`],
    steps: [
      nav("basics", /*t*/"Steps", /*t*/"The steps of a character, in order. You can go to any of them at any time; the dot shows whether a step is done."),
      { id: "name", sel: grp('[data-bind="name"]'), title: /*t*/"Name and kind", content: /*t*/"The actor's name, and whether it is a player character or an NPC (its sheet and its wealth)." },
      { id: "race", sel: grp('[data-on="race"]'), title: /*t*/"Race", content: /*t*/"From your compendiums. The race's ability adjustments, size, speed, languages and bonus feat or skill points follow." },
      { id: "align", sel: grp('[data-bind="alignment"]'), title: /*t*/"Alignment", content: /*t*/"Some classes need one (a paladin, a monk, a druid): Classes and levels warns when it doesn't fit." },
      { id: "lang", sel: '[data-on="lang"]', title: /*t*/"Languages", content: /*t*/"The race's own languages come by themselves; tick bonus languages up to the Intelligence bonus." },
      { id: "img", sel: '[data-act="pickImg"]', title: /*t*/"Portrait and token", content: /*t*/"The actor's portrait and token images." },
      side, foot,
    ] });

  R({ ...tab("abilities"), id: "abilities", title: /*t*/"Adventurers and Minions: Abilities", description: /*t*/"Ability scores and the increases at levels 4, 8, 12…", next: [`${MOD}.classes`],
    steps: [
      nav("abilities", /*t*/"Abilities", /*t*/"The six ability scores before racial adjustments, and the increases every fourth level."),
      { id: "method", sel: '[data-on="method"]', title: /*t*/"Method", content: /*t*/"Point buy (with its budget), the elite or nonelite array, rolled scores, or scores typed in." },
      { id: "class", sel: '[data-act="placeByClass"]', title: /*t*/"Place by class", content: /*t*/"Puts the best scores where the first class's profile wants them (a wizard's Intelligence, a fighter's Strength)." },
      { id: "inc", sel: '[data-on="increase"]', title: /*t*/"Increases", content: /*t*/"The ability that goes up at levels 4, 8, 12… (Classes and levels adds the levels)." },
      side,
    ] });

  R({ ...tab("classes"), id: "classes", title: /*t*/"Adventurers and Minions: Classes and levels", description: /*t*/"Classes, levels, hit points and gestalt characters.", next: [`${MOD}.skills`],
    steps: [
      nav("classes", /*t*/"Classes and levels", /*t*/"One row per character level: the class taken at it, hit points, BAB, saves and what the level brings."),
      { id: "gestalt", sel: '[data-on="gestalt"]', title: /*t*/"Gestalt", content: /*t*/"Two classes at every level (Unearthed Arcana). Each level gets two class lists; on the actor each pair is one class A&M builds from the two (\"Fighter // Wizard\"), with the better hit die, BAB, saves and skill points and both classes' features. Spellcasting and powers stay with each class (at level 0), with bonus caster levels." },
      { id: "add", sel: '[data-act="addLevels"]', title: /*t*/"Add levels", content: /*t*/"Choose a class (two for gestalt) and how many levels, then Add levels. Add another class the same way to multiclass; change a level's class in its row. Variant classes (Unearthed Arcana) have their own group; a prestige class the character doesn't qualify for at that level is marked ✘ (point at it to see what's missing)." },
      { id: "rows", sel: "table.aam2-t tr:first-child", title: /*t*/"Levels", content: /*t*/"Each level's class and class level, hit die, hit points rolled (roll one again with the dice), BAB and saves before ability modifiers, and its gains: feats, class bonus feats, ability increases and the class features it brings (click one to read it)." },
      { id: "xp", sel: ".aam2-main .row.hint:has(.warn), .aam2-main .row.hint:has(.good)", title: /*t*/"Favored class and XP penalty", content: /*t*/"With two base classes: the race's favored class, and the multiclass XP penalty (−20% for each class more than one level below the highest). A character with a penalty gets a trait on the actor that reduces the XP it gains." },
      { id: "builds", sel: '[data-on="planVariant"]', title: /*t*/"Builds", content: /*t*/"The build each class follows when A&M chooses for it (Choose for me, Fill in, Standard gear, Roll again): a ranger's archer or two-weapon, a cleric's battle cleric or healer…" },
      { id: "variants", sel: '[data-on="featureOpt"]', title: /*t*/"Class feature variants", content: /*t*/"Unearthed Arcana's swaps for a class feature: a ranger's combat style (Archery or Two-Weapon Combat, with its feats at 2nd, 6th and 11th), favored environment, whirling frenzy, turning by level check, aspect of nature, and a specialist wizard's variants once its school is chosen. Point at one to read what it gives." },
      { id: "hp", sel: grp('[data-bind="hp.method"]'), title: /*t*/"Hit points", content: /*t*/"How new levels roll their hit points, the maximum at 1st level, and buttons to redo every level." },
      { id: "issues", sel: "ul.aam2-issues", title: /*t*/"To check", content: /*t*/"What breaks the rules here: an alignment the class doesn't allow, a class past its last level, hit points out of range, a gestalt level with one class." },
      side,
    ] });

  R({ ...tab("skills"), id: "skills", title: /*t*/"Adventurers and Minions: Skills", description: /*t*/"Skill points level by level.", next: [`${MOD}.feats`],
    steps: [
      nav("skills", /*t*/"Skills", /*t*/"Skill points are spent level by level, as D35E's level records keep them: each level's points by its class."),
      { id: "levels", sel: '[data-act="skLevel"]', title: /*t*/"Level", content: /*t*/"The level whose points you are spending; its colour shows points left (or overspent).", direction: "DOWN" },
      { id: "table", sel: "table.aam2-t tr:first-child", title: /*t*/"Points", content: /*t*/"+ and − spend points: a class skill point is a rank, a cross-class point half a rank. Maximum ranks follow the character level." },
      { id: "tools", sel: '[data-act="skMax"], [data-act="skCopy"]', title: /*t*/"Quick buttons", content: /*t*/"Copy the previous level's spending, put every point in class skills up to the maximum, or clear the level." },
      { id: "sub", sel: '[data-act="addSub"]', title: /*t*/"Craft, Perform, Profession", content: /*t*/"Name a sub-skill (Craft: Weaponsmithing) to spend points on it." },
      side,
    ] });

  R({ ...tab("feats"), id: "feats", title: /*t*/"Adventurers and Minions: Feats", description: /*t*/"General, racial and class bonus feats, with their prerequisites.", next: [`${MOD}.spells`],
    steps: [
      nav("feats", /*t*/"Feats", /*t*/"Every feat slot of the character, level by level: general feats, the race's bonus feat and class bonus feats (a fighter's, a wizard's, both classes' in gestalt)."),
      { id: "qualified", sel: '[data-on="qualified"]', title: /*t*/"Only what qualifies", content: /*t*/"List only the feats whose prerequisites the character meets at that level (a class bonus feat lists its class's choices)." },
      { id: "slot", sel: '[data-on="feat"]', title: /*t*/"A slot", content: /*t*/"Type or pick a feat. A feat with a choice (Weapon Focus, Skill Focus, Spell Focus) asks for it beside." },
      { id: "special", title: /*t*/"Rogue special abilities", content: /*t*/"At rogue levels 10, 13, 16 and 19 a slot offers the rogue's special abilities (Crippling Strike, Defensive Roll, Improved Evasion…) at the top of its list, then, below a divider, the feats it can take instead." },
      { id: "granted", sel: ".aam2-main p.hint:has(.fa-certificate)", title: /*t*/"Given by class features", content: /*t*/"Feats a class feature gives (a ranger's combat style, a conjurer's Augment Summoning): listed here, counted for other feats and prestige classes, and not offered again." },
      side,
    ] });

  R({ ...tab("spells"), id: "spells", title: /*t*/"Adventurers and Minions: Spells", description: /*t*/"Spells, domains, specialist schools and psionic powers.", next: [`${MOD}.equipment`],
    steps: [
      nav("spells", /*t*/"Spells and powers", /*t*/"One block per spellcasting or psionic class (both classes of a gestalt character)."),
      { id: "fill", sel: '[data-act="fillSpells"]', title: /*t*/"Choose for me", content: /*t*/"Fills every caster class by its profile's favourite spells or powers, then at random. Edit: adds what new levels bring and keeps the actor's spells." },
      { id: "domains", sel: '[data-on="setDomain"]', title: /*t*/"Domains", content: /*t*/"A cleric's two domains (alignment domains only for a cleric of that alignment). Their spells join the list, tagged domain, and each spell level gets a domain slot." },
      { id: "school", sel: '[data-on="setSchool"]', title: /*t*/"Specialist school or arcane domain", content: /*t*/"A wizard's school, and the schools given up (two, one for a diviner): their spells are never learned. Each spell level gets a specialty slot. Or an arcane domain (domain wizard, Unearthed Arcana): no schools given up, its domain spells go in the spellbook by themselves, at +1 caster level, and each spell level gets a domain slot." },
      { id: "slot", sel: '[data-on="setSpecial"]', title: /*t*/"Slot", content: /*t*/"The spell prepared in that level's domain or specialty slot (D35E's special slot on the actor)." },
      { id: "list", sel: "table.aam2-t tr:first-child", title: /*t*/"Spells by level", content: /*t*/"Each level: how many are known or in the spellbook, prepared against the day's slots, and the spells (add one by name, remove one). Psionic classes show powers known against their table, the highest power level and about how many power points a day." },
      { id: "spont", title: /*t*/"Spontaneous casting", content: /*t*/"With the world setting Spontaneous casting on (or a Spontaneous variant class), clerics, druids, paladins and rangers know a few spells of each level and cast them without preparing, and a wizard casts any spell of its spellbook. Nothing is prepared then." },
      side,
    ] });

  R({ ...tab("equipment"), id: "equipment", title: /*t*/"Adventurers and Minions: Equipment", description: /*t*/"Standard gear and treasure for the character's wealth.", next: [`${MOD}.review`],
    steps: [
      nav("equipment", /*t*/"Equipment", /*t*/"Gear by the DMG: an NPC's gear value or a PC's wealth for its level."),
      { id: "std", sel: '[data-act="fillGear"]', title: /*t*/"Standard gear", content: /*t*/"The DMG's NPC gear for the main class (a gestalt character's two classes combined) at its level, with its Weapon Focus weapons." },
      { id: "add", sel: '[data-act="addGear"]', title: /*t*/"Add", content: /*t*/"Add any weapon, armour, shield, ammunition or item by name, masterwork or with a bonus, a special material and special abilities (with Axecleft's Armory), and a quantity; its price counts against the wealth. The list warns about a heavy load, two items for one slot, and medium or heavy armour on a ranger with a combat style." },
      { id: "own", sel: '[data-on="actorItem"]', title: /*t*/"Edit: the actor's own gear", content: /*t*/"When editing an actor, each of its items can be kept, unequipped (into the pack) or sold: its trade-in value adds to the wealth the new levels bring." },
      { id: "loot", sel: '[data-on="loot"]', title: /*t*/"Treasure for the rest", content: /*t*/"What the gear leaves of the wealth is rolled as treasure by the Treasure Generator (Armory, Curios or Gemstones), else given as coins. Arms and armour are equipped on the actor." },
      side,
    ] });

  R({ ...tab("review"), id: "review", title: /*t*/"Adventurers and Minions: Review", description: /*t*/"Check the character, then create it (or apply an edit).",
    steps: [
      nav("review", /*t*/"Review", /*t*/"Everything the character will have, what still breaks the rules, and the button that makes it."),
      { id: "reroll", sel: '[data-act="reroll"]', title: /*t*/"Roll again", content: /*t*/"A random character: roll any part again (rolling the abilities redoes skills and feats too)." },
      { id: "check", sel: ".aam2-check", title: /*t*/"To check", content: /*t*/"What isn't right yet, by step (click a step to go there). Nothing stops you creating the actor. Edit: Fill in what's missing completes new levels by the class profiles." },
      { id: "features", sel: ".aam2-review h4", title: /*t*/"Class features", content: /*t*/"Each class's features with the class level they come at, the class feature variants taken included." },
      { id: "owner", sel: grp('[name="owner"]'), title: /*t*/"Owner", content: /*t*/"GM: a player who will own the new actor (the GM always does)." },
      { id: "create", sel: grp('[name="folder"]'), title: /*t*/"Create", content: /*t*/"The folder for the new actor, and whether to open its sheet. Edit: the list of changes, the copy made first, then Apply changes." },
      foot,
    ] });
}
