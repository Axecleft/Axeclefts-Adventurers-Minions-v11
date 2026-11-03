/** A&M v2 — the window's styles (Foundry's own theme colours, like the other Axecleft tools). */
export const STYLE = `<style>
#axecleft-aam2 .window-content { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
/* Foundry v11 (Axecleft's Tools window stand-in): the window's body fills the window */
#axecleft-aam2 .axecleft-v11-body { flex: 1 1 auto; min-height: 0; height: 100%; }
.aam2 { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.aam2 { position: relative; }
/* Working overlay (the look of Shared Data's "Working…" label): covers the window while it works */
.aam2 .aam2-busy { position: absolute; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.35); cursor: progress; }
.aam2 .aam2-busy .pill { padding: 6px 16px; border-radius: 16px; background: rgba(20, 20, 30, 0.9); color: #f0f0e0; font-size: 14px; border: 1px solid #3b24f0; box-shadow: 0 0 8px rgba(0, 0, 0, 0.6); white-space: nowrap; max-width: 90%; overflow: hidden; text-overflow: ellipsis; }
.aam2 .aam2-busy .pill i { margin-right: 6px; }
.aam2 .aam2-busy .secs { opacity: 0.7; margin-left: 6px; font-variant-numeric: tabular-nums; }
.aam2 .hint { font-size: 0.85em; opacity: 0.85; margin: 2px 0 6px; }
.aam2 .bad { color: var(--color-level-error, #c33); }
.aam2 .warn { color: var(--color-level-warning, #c80); }
.aam2 .good { color: var(--color-level-success, #2a7d2a); }
.aam2 .muted { opacity: 0.7; }
.aam2 button { width: auto; }

/* Step bar */
.aam2 nav.aam2-steps { display: flex; gap: 2px; padding: 6px 8px 0; border-bottom: 1px solid var(--color-border-light-tertiary, #999); flex: 0 0 auto; }
.aam2 nav.aam2-steps button { flex: 1 1 0; min-width: 0; margin: 0; padding: 4px 4px; border-radius: 4px 4px 0 0; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: relative; }
.aam2 nav.aam2-steps button.active { font-weight: bold; box-shadow: inset 0 -3px 0 var(--color-warm-1, #c9593f); }
.aam2 nav.aam2-steps button .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-left: 4px; vertical-align: middle; }
.aam2 nav.aam2-steps button .dot.error { background: var(--color-level-error, #c33); }
.aam2 nav.aam2-steps button .dot.warn { background: var(--color-level-warning, #d90); }
.aam2 nav.aam2-steps button .dot.ok { background: var(--color-level-success, #2a7d2a); }

/* Body: the step on the left, the summary on the right */
.aam2 .aam2-body { display: flex; flex: 1 1 auto; min-height: 0; }
.aam2 .aam2-main { flex: 1 1 auto; min-width: 0; overflow-y: auto; padding: 8px 12px; }
.aam2 .aam2-side { flex: 0 0 215px; overflow-y: auto; padding: 8px 10px; border-left: 1px solid var(--color-border-light-tertiary, #999); font-size: 0.92em; }
.aam2 footer.aam2-foot { flex: 0 0 auto; display: flex; gap: 6px; padding: 6px 12px; border-top: 1px solid var(--color-border-light-tertiary, #999); align-items: center; }
.aam2 footer.aam2-foot .grow { flex: 1; }
.aam2 footer.aam2-foot button { flex: 0 0 auto; }

/* Forms */
.aam2 .form-group > label:first-child { flex: 0 0 9em; }
.aam2 .form-group select, .aam2 .form-group input[type=text] { flex: 1; min-width: 0; }
.aam2 .form-group input[type=number] { flex: 0 0 4.5em; }
.aam2 fieldset { margin: 8px 0 4px; padding: 4px 8px 6px; }
.aam2 .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.aam2 .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }

/* Start page */
.aam2 .aam2-drop { border: 2px dashed var(--color-border-light-tertiary, #7a7971); border-radius: 6px; padding: 14px; text-align: center; margin: 8px 0; opacity: .8; }
.aam2 .aam2-edit { margin: 0 0 6px; }
.aam2 .aam2-start { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 10px 0; }
.aam2 .aam2-start button { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 10px; height: auto; line-height: 1.3; white-space: normal; }
.aam2 .aam2-start button i { font-size: 2.2em; }
.aam2 .aam2-prq { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 0 10px; }
.aam2 .aam2-prq fieldset { margin: 4px 0; }
.aam2 .aam2-prq textarea { width: 100%; min-height: 3.6em; resize: vertical; }
.aam2 .aam2-prq .row label { white-space: nowrap; }
.aam2 .aam2-start button b { font-size: 1.15em; }
.aam2 .aam2-start button small { opacity: 0.8; }

/* Tables */
.aam2 table.aam2-t { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 0.95em; }
.aam2 table.aam2-t th { text-align: left; padding: 2px 4px; border-bottom: 1px solid var(--color-border-light-tertiary, #999); position: sticky; top: -8px; background: var(--background, var(--color-cool-5, #1b1d24)); z-index: 1; }
.aam2 table.aam2-t td { padding: 2px 4px; border-top: 1px solid rgba(128,128,128,0.2); vertical-align: middle; }
.aam2 table.aam2-t td.n, .aam2 table.aam2-t th.n { text-align: center; }
.aam2 table.aam2-t input[type=text], .aam2 table.aam2-t input[type=number] { width: 3.4em; text-align: center; height: 1.8em; }
.aam2 table.aam2-t td.gestalt { white-space: nowrap; }
.aam2 table.aam2-t td.gestalt select { width: calc(50% - 1.2em); min-width: 7em; }
.aam2 table.aam2-t select { height: 1.8em; }
.aam2 table.aam2-t tr.dim td { opacity: 0.55; }
.aam2 table.aam2-t tr.sel td { background: rgba(201, 89, 63, 0.12); }
.aam2 .step-btn { width: 1.8em; height: 1.8em; padding: 0; margin: 0; line-height: 1; }
.aam2 .chip { display: inline-block; padding: 0 5px; border-radius: 8px; font-size: 0.85em; background: rgba(128,128,128,0.2); margin: 0 2px 0 0; white-space: nowrap; }
.aam2 .chip.feature { background: rgba(70,130,180,0.25); } .aam2 .chip.feature[data-act] { cursor: pointer; } .aam2 .chip.feature[data-act]:hover { text-decoration: underline; }

/* Level picker on the Skills step */
.aam2 .aam2-levels { display: flex; flex-wrap: wrap; gap: 2px; margin: 4px 0 6px; }
.aam2 .aam2-levels button { flex: 0 0 auto; min-width: 2.2em; margin: 0; padding: 1px 4px; }
.aam2 .aam2-levels button.active { font-weight: bold; box-shadow: inset 0 -3px 0 var(--color-warm-1, #c9593f); }
.aam2 .aam2-levels button.left { border-color: var(--color-level-warning, #d90); }
.aam2 .aam2-levels button.over { border-color: var(--color-level-error, #c33); }

/* Feats */
.aam2 .aam2-slot { display: grid; grid-template-columns: 7.5em 1fr; gap: 2px 8px; align-items: start; padding: 4px 0; border-top: 1px solid rgba(128,128,128,0.2); }
.aam2 .aam2-slot .what { font-size: 0.9em; padding-top: 4px; }
.aam2 .aam2-slot .pick { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.aam2 .aam2-slot .pick input[type=text] { flex: 1 1 12em; min-width: 10em; }
.aam2 .aam2-slot .pick select { flex: 0 1 12em; }
.aam2 .aam2-slot .why { grid-column: 2; font-size: 0.85em; }

/* Summary */
.aam2 .aam2-side img.portrait { width: 100%; max-height: 150px; object-fit: contain; border: none; margin-bottom: 4px; }
.aam2 .aam2-side h3 { margin: 0 0 2px; font-size: 1.1em; border: none; }
.aam2 .aam2-side .sub { opacity: 0.85; margin-bottom: 6px; }
.aam2 .aam2-side table { width: 100%; border-collapse: collapse; margin: 4px 0; }
.aam2 .aam2-side td { padding: 1px 2px; }
.aam2 .aam2-side td.n { text-align: right; font-weight: bold; }
.aam2 .aam2-side .abil { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; text-align: center; margin: 4px 0; }
.aam2 .aam2-side .abil div { background: rgba(128,128,128,0.12); border-radius: 4px; padding: 1px 0; }
.aam2 .aam2-side .abil small { display: block; opacity: 0.75; font-size: 0.8em; }
.aam2 .aam2-side .issues { margin-top: 6px; font-size: 0.9em; }
.aam2 .aam2-side .issues a { cursor: pointer; text-decoration: underline; }

/* Review */
.aam2 .aam2-review h4 { margin: 10px 0 2px; border-bottom: 1px solid rgba(128,128,128,0.35); }
.aam2 .aam2-review ul.issues { margin: 2px 0; padding-left: 1.2em; }
.aam2 .aam2-review ul.issues a { cursor: pointer; text-decoration: underline; }
</style>`;
