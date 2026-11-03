/**
 * A&M — the GM's Build profiles page: a profile (data/profiles.json, a class's own build or one of its variants) ↔ the
 * page's form values. No Foundry code. Fields the form doesn't show (bonusFeats, subSkills…) are kept as they are.
 */
import * as R from "./rules.js";

const lines = (s) => String(s ?? "").split(/\r?\n|,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
const featLine = (f) => (typeof f === "string" ? f : f?.choice ? `${f.name} (${f.choice})` : f?.name ?? "");
const lineFeat = (s) => { const m = s.match(/^(.+?)\s*\((.+)\)\s*$/); return m ? { name: m[1].trim(), choice: m[2].trim() } : s.trim(); };
/** The fields the form shows. */
export const PROFILE_FORM_KEYS = ["abilities", "increases", "skills", "feats", "alignments", "spells", "gear", "domains", "schools", "prohibit", "specialist"];

/** A profile → the form's values. skills: [{ key, label }] (skills are shown by name). */
export function profileToForm(prof = {}, skills = []) {
  const label = (k) => skills.find((s) => s.key === k)?.label ?? k;
  const g = prof.gear ?? {};
  return {
    abilities: [...(prof.abilities ?? []), ...R.ABILITIES.filter((a) => !(prof.abilities ?? []).includes(a))].slice(0, 6),
    increases: [...(prof.increases ?? [])].slice(0, 5),
    skills: (prof.skills ?? []).map(label).join("\n"),
    feats: (prof.feats ?? []).map(featLine).filter(Boolean).join("\n"),
    alignments: [...(prof.alignments ?? [])],
    spells: (prof.spells ?? []).join("\n"),
    melee: g.melee ?? "", ranged: g.ranged ?? "", swap: !!g.swap, noShield: !!g.noShield, offhand: !!g.offhand,
    domains: (prof.domains ?? []).join(", "), schools: (prof.schools ?? []).join(", "), prohibit: (prof.prohibit ?? []).join(", "),
    specialist: prof.specialist != null ? Math.round(Number(prof.specialist) * 100) : "",
  };
}

/** The form's values → a profile (keep: the profile as it was; the fields the form doesn't show stay). */
export function formToProfile(f, keep = {}, skills = []) {
  const out = {};
  for (const [k, v] of Object.entries(keep ?? {})) if (!PROFILE_FORM_KEYS.includes(k) && !["variants", "label", "variant"].includes(k)) out[k] = v;
  const key = (s) => { const l = s.toLowerCase(); return skills.find((x) => x.key === s || x.label.toLowerCase() === l)?.key ?? s; };
  const ab = (f.abilities ?? []).filter((a) => R.ABILITIES.includes(a));
  if (ab.length) out.abilities = [...new Set([...ab, ...R.ABILITIES])];
  const inc = (f.increases ?? []).filter((a) => R.ABILITIES.includes(a));
  if (inc.length) out.increases = inc;
  const sk = lines(f.skills).map(key); if (sk.length) out.skills = [...new Set(sk)];
  const feats = String(f.feats ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map(lineFeat); if (feats.length) out.feats = feats;
  const al = (f.alignments ?? []).filter((a) => R.ALIGNMENTS.includes(a)); if (al.length) out.alignments = al;
  const sp = String(f.spells ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean); if (sp.length) out.spells = sp;
  const gear = {};
  if (String(f.melee ?? "").trim()) gear.melee = String(f.melee).trim();
  if (String(f.ranged ?? "").trim()) gear.ranged = String(f.ranged).trim();
  for (const k of ["swap", "noShield", "offhand"]) if (f[k]) gear[k] = true;
  if (Object.keys(gear).length) out.gear = gear;
  const list = (s) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (list(f.domains).length) out.domains = list(f.domains);
  if (list(f.schools).length) out.schools = list(f.schools).map((x) => x.toLowerCase());
  if (list(f.prohibit).length) out.prohibit = list(f.prohibit).map((x) => x.toLowerCase());
  if (f.specialist !== "" && f.specialist != null && Number.isFinite(Number(f.specialist))) out.specialist = Math.max(0, Math.min(100, Number(f.specialist))) / 100;
  return out;
}
