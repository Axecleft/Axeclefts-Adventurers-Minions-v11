# Axecleft's Adventurers and Minions v2 — Design

A new module, built from nothing, that makes complete, working D35E characters and NPCs. It has three uses:

1. **Build.** Create a character or NPC step by step from menus.
2. **Random.** Generate a complete character. Race, sex, class and level are optional; anything left open is chosen for you.
3. **Edit.** Open an existing actor, add or change its classes and levels, and have the character redone to match.

Id: `axeclefts-adventurers-minions` (title "Axecleft's Adventurers and Minions"), from 1.14.2.0: it took over the first module's id and repository and replaces it (it shares no code with 1.0.2 / 1.14.1.0). It was developed as `axeclefts-aam2` ("v2"); data saved under that id is still read.

---

## 1. Principles
- **One engine, three doors.** Build, Random and Edit all fill in the same **character plan**, show it in the same steps and create or update the actor the same way. Random is Build with the choices made for you. Edit is Build starting from an existing actor.
- **D35E does the maths.** The module records choices: race, ability scores, the class taken at each level, hit points, skill ranks, feats and spells. It records them the way D35E's own level-up window does (*level-up progression*, below). D35E then works out:
  - class levels and HP;
  - BAB, saves and skill totals;
  - AC, attacks and spell slots;
  - class features from its Class Abilities compendium.
  
  The module never writes a number D35E can work out itself.
- **Rules-checked, never locked.** The module knows the SRD rules (skill points, maximum ranks, feat prerequisites, prestige requirements, alignment limits). It warns when a plan breaks one but lets you go ahead, as the Armory does past +10.
- **Nothing is lost.** The plan is saved on the actor, so Edit reopens exactly what was chosen. Edit never deletes anything you didn't remove yourself.
- **A working framework first.** The first release covers every step and all three uses end to end; details get refined after.
- **Built for the whole thing from the start.** The layout, look and data model are designed for every step and all three uses before any step is built, so later steps slot in instead of being bolted on.
- **Suite standards.**
  - Foundry's own theme (light or dark).
  - The Axecleft's Tools menu.
  - Every text translatable (French from the first release).
  - Foundry v14 / D35E 3.1 only for now (a v11 port isn't planned yet).
  - Only SRD data shipped. The module reads races, classes, feats and spells from the compendiums you have.

## 2. How D35E builds a character (what we write)
D35E 3.1 has a **level-up progression** mode (`system.details.levelUpProgression`). In it, the actor keeps one record per character level in `system.details.levelUpData`:

| Field | Meaning |
|---|---|
| `level` | character level (1, 2, 3…) |
| `classId` | the id of the class item on the actor that took this level |
| `hp` | hit points rolled (or taken) for this level |
| `skills` | `{ skillKey: { points, cls }, … }`: ranks bought this level (cross-class ranks count half) |
| `hasFeat`, `hasAbility` | set by D35E: a feat at levels 1, 3, 6…; an ability increase at 4, 8, 12… |

From these records D35E sets each class item's levels and HP and every skill's ranks. The number of records follows the actor's XP (`details.level.available`), so the module sets XP to the start of the target level.

**The module writes:**
- the race item;
- base ability scores, with the level 4/8/12… increases added to the chosen ability;
- class items;
- XP;
- the level records;
- feat items;
- spells into D35E's spellbooks;
- alignment, size, languages, name and images;
- later, equipment.

**D35E works out everything else.** Class features come from the Class Abilities compendium for classes whose *Automatic features* option is on (all SRD classes in D35E 3.1 have it on).

*To check in v14-dev before building:*
- how D35E's own level-up window records the ability increase;
- whether bonus feats (Fighter, Wizard, Monk, human) need anything beyond the feat item;
- how racial HD fit into the records (D35E keeps them out of the class progression).

## 3. The character plan
A plain object that every part of the module reads and writes:

```
identity  name, race, sex, alignment, deity, age, height, weight, languages, portrait, token, kind (PC / NPC)
abilities method (array / point buy / roll / typed), base scores, increases [{ level, ability }]
levels    [{ level, class, hp, skills: { key: ranks }, feats: [ … ], bonusFeats: [ … ], spells: [ … ] }]
spells    per class: spellbook / known / domains
gear      items (standard gear by class and level, treasure for the rest of the wealth)
options   HP method, PC or NPC wealth, …
```

- **Build** fills it step by step.
- **Random** fills the open parts.
- **Edit** reads it back from the actor. For an actor the module didn't make, it is rebuilt from the actor's classes, skills and feats, as well as possible, and you confirm.
- It is saved on the actor (`flags.axeclefts-adventurers-minions.plan`).

## 4. The window
One window, **Adventurers and Minions**, from the Tools menu, the Token controls and the Actors directory header.

**Start page.** Three large choices: **Build a character**, **Random character**, **Edit an actor**. Edit takes a selected token, a picked actor or one dropped on the window. A Recent list reopens plans you were working on.

**Steps.** A step bar along the top, and every step can be opened at any time:
1. **Basics.** Name, PC or NPC, race, sex, alignment, deity, age, height and weight, languages (racial plus bonus languages from Int), portrait and token.
2. **Abilities.** Array, point buy, roll or typed scores. They are placed highest-first by the class's priorities, or by hand. Racial changes are shown, and the 4/8/12… increases are chosen here.
3. **Classes and levels.**
   - A table with one row per character level: class, HP, feat or ability increase gained, and class features gained.
   - **Add levels** (class × n), change a level's class, remove levels from the top.
   - Prestige class requirements are checked, along with alignment limits and the multiclass XP penalty (shown, not enforced).
   - Racial HD for monsters and races that have them.
4. **Skills.** A grid of skills by level: points per level, class or cross-class, maximum ranks, and the totals D35E will show. Buttons: *Spread by priorities*, *Fill this level*, *Clear*.
5. **Feats.**
   - Slots by level: general feats, human bonus, and class bonus feats from the class's own list (Fighter, Wizard, Monk…).
   - Searchable, with prerequisites checked against the plan at that level. Unmet feats are greyed out with the reason.
   - A feat that needs a choice (Weapon Focus, Skill Focus, Spell Focus…) asks for it.
6. **Spells.**
   - Wizard spellbook: all 0-level spells, 3 + Int modifier 1st-level spells, then 2 per level.
   - Sorcerer and bard known spells by their tables.
   - Cleric domains and wizard specialist schools, from D35E's Spell Schools and Domains compendium (its feats go on the actor, so the sheet marks domain and school spells):
     - a cleric picks two domains (alignment domains only for a cleric of that alignment); a wizard may specialize, giving up two other schools (a diviner one) whose spells it never learns;
     - one extra spell per spell level from 1st, prepared in D35E's special slot (a copy of the spell marked special prepared, its id in the spellbook's specialSlots): a domain spell for a cleric, a spell of the school for a specialist.
   - Druid, cleric, paladin and ranger: nothing to choose (they know their list).
   - Prepared spells are left for play.
   - Psionic powers: powers known by the class tables, up to the highest power level; a psion's discipline powers (its class: Psion (Egoist)); D35E works out power points.
6b. **Gestalt** (Unearthed Arcana variant): a gestalt level's class in the plan is "gestalt:<uuid A>|<uuid B>" (core/gestalt.js); the catalog answers it with the merged class. On the actor one class item per pairing (foundry/gestalt.js) holds the better HD/BAB/saves/skill points, both skill lists, both classes' features in its added abilities and a Bonus Spellcaster Level per casting class and level; casting classes go on at level 0 for their spell tables, with the bonus levels spent on their spellbooks (bonusPrestigeCl). A psionic class does too, with a locked class feature (Gestalt Psionics) adding its gestalt levels' power points and psionic bonus manifester levels (D35E takes power points from a class item's own level).
7. **Equipment**. Starting package by class, or gear by PC/NPC wealth for the level, using Armory and Curios when installed.
8. **Review.**
   - A character sheet preview: abilities, HP, BAB, saves, skills, feats, spells and warnings.
   - **Create actor** (Build and Random) or **Apply changes** (Edit, with a list of what will change).
   - Options: folder, PC or NPC sheet, ownership.

A **summary panel** stays on the right on every step: race and classes, abilities, HP, BAB, saves, skill points left and feat slots left. It updates as you choose.

**Random page.**
- Race, sex, class (or a class mix such as "Fighter 3 / Rogue 2"), level, PC or NPC and alignment, each one optional.
- How to roll abilities, and **Generate**.
- The result opens on **Review**. From there you can **Reroll** one part (abilities, skills, feats, name…) or open any step to change it before creating. **Generate ×N** makes several at once straight into a folder, for crowds and guards.

## 5. Random choices (class profiles)
The DMG's NPC chapter (pages 112–127) gives a sample NPC for each class:
- starting ability scores in the order the class uses them;
- where its ability increases go;
- the skills it buys;
- its feats by level;
- spells known;
- gear by level.

Those choices are the model for the profiles. Each SRD class has a **profile**, shipped as module data that the GM can edit:
- abilities in priority order;
- key skills in priority order;
- preferred feats (by level and prerequisites);
- likely alignments;
- spell preferences (attack, defence or utility weights) and favourite domains.

NPC classes (Adept, Aristocrat, Commoner, Expert, Warrior) have profiles too. A class without a profile (from another module) gets one worked out from its data: hit die, BAB, good saves, class skills and casting ability.

- **Races:** profiles for languages, age, height and weight ranges and alignment tendency.
- **Names:** lists by race and sex, shared with the Merchant Generator's name lists.
- **Multiclass when the class is left open:** sensible pairs (Fighter/Rogue, Cleric/Fighter…) and SRD prestige classes once their requirements are met, with a setting for how often.

## 6. Rules data shipped (SRD)
- **Feat prerequisites** for every SRD feat: ability minimums, BAB, other feats, skill ranks, caster level, class features. D35E's feat items don't carry them in a form the module can check. Feats from other sources without data are offered with a "prerequisites not checked" mark.
- **Class bonus-feat lists:** Fighter, Wizard, Monk (by level), Rogue special abilities.
- **Prestige class requirements.**
- **Alignment limits:** Monk, Paladin, Barbarian, Bard, Druid, Assassin, Blackguard and others.
- **Starting ages, height and weight, and bonus languages by race.**

## 7. Edit (refactoring an existing actor)
- **Open** an actor. Its plan is read back, or rebuilt for actors made elsewhere.
- **Change.** Add levels (any class), swap the class of a level, remove levels, re-spend skills, swap feats, change ability scores or race.
- **Refactor.**
  - The module recomputes what each change affects: skill points from a new Int or class, feat slots, ability increases and feats whose prerequisites are no longer met.
  - It marks the steps that need attention, and offers to **refill automatically** (by the class profile) or to let you choose.
- **Apply.**
  - Review lists every change (items added or removed, levels, skills).
  - Apply updates the actor in place. Its tokens, items you added by hand, equipment and effects are kept.
  - A **backup copy** of the actor is made first (setting, on by default).

## 8. Settings
- Hit points:
  - level 1: maximum (PC), or as the other levels (NPC);
  - later levels: roll, average (rounded up) or maximum.
- Ability method defaults for PCs and NPCs (PC: point buy 25 or 4d6; NPC: elite or nonelite array).
- Where to look for races, classes, feats and spells: all compendiums, or the ones ticked.
- Folder for new actors; backup before edit.
- Class profiles: edit or reset (the GM).

## 9. Releases
1. **Engine and Build.**
   - Plan, catalog, rules checks, the window and Review.
   - Steps: Basics, Abilities, Classes and levels, Skills, Feats.
   - Creates working characters and NPCs without spells or gear.
2. **Random.** Class and race profiles, the Random page, reroll a part, Generate ×N.
3. **Edit.** Read an actor back, change levels, refactor, apply with backup. *(1.14.0.8)*
4. **Spells.** Spellbooks, known spells, domains; random spell choices.
5. **Equipment and images.** Gear by wealth (Armory and Curios when installed): done. Portraits and tokens by race and sex: **on hold until there's art** (the portrait and token chosen on Basics are used meanwhile).

Later, as a tab: the **Monster Builder** (racial HD and templates).

## 10. Questions for John
1. **Name and id.** Keep the title "Axecleft's Adventurers and Minions", with v2 replacing the old module on release? Or a new title? *Answered: v2 replaces it, same title, id and repository (1.14.2.0).*
2. **Order of releases.** Is the order above right? For example, should Random come before Edit, and should spells come before Edit?
3. **Equipment.** Is gear part of "complete" for the first public release, or can it wait?
4. **Edit and actors made elsewhere.** Should Edit work on any actor (best-effort read), or only on actors A&M made? *Answered: any actor (best-effort read; 1.14.0.8).*
5. **Players.** Should players be able to build their own characters (on actors they own), or should A&M be GM-only? *Answered: players too (1.14.0.8). They edit the actors they own; new actors are made by a logged-in GM's Foundry when the player lacks the Create New Actors permission (setting Players build through the GM).*
6. **Random depth.** Is one profile per class enough, or do you want variants ("archer ranger", "two-weapon ranger", "blaster wizard")?
