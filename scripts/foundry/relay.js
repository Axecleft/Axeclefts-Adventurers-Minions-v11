/**
 * A&M v2 — players build too.
 *
 * Players can open the builder and edit the actors they own. Making a new actor needs Foundry's "Create New Actors"
 * permission, which players don't have by default: without it, A&M asks a GM who is logged in to create the actor
 * (owned by that player), and the player's own window then fills it in, as it would its own. The world setting
 * "Players build through the GM" turns this off. Edit's copy before an edit is made the same way.
 */
import { MOD } from "./catalog.js";

const A = () => globalThis.AxecleftTools;
const t = (s, d) => A()?.t?.(s, d) ?? s;
const CHANNEL = `module.${MOD}`;
const OWNER = () => CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
const pending = new Map();

const relayOn = () => { try { return game.settings.get(MOD, "playerBuild") !== false; } catch (e) { return true; } };
const activeGM = () => game.users?.activeGM ?? game.users?.find?.((u) => u.isGM && u.active) ?? null;
/** This user can create actors themselves. */
export const canCreate = () => !!game.user?.isGM || !!game.user?.can?.("ACTOR_CREATE");
/** This user can build new actors (themselves, or through the GM). */
export const canBuild = () => canCreate() || relayOn();

/** Foundry's Folder document class (on v11 a global name, not a property of globalThis). */
const FolderCls = () => CONFIG.Folder?.documentClass ?? (typeof Folder !== "undefined" ? Folder : globalThis.Folder);

/** The folder "A&M backups" (made when missing, by whoever can). */
export async function backupFolder() {
  const name = t("A&M backups");
  let folder = game.folders?.find?.((f) => f.type === "Actor" && f.name === name) ?? null;
  if (!folder && FolderCls()?.create) { try { folder = await FolderCls().create({ name, type: "Actor" }); } catch (e) { folder = null; } }
  return folder;
}

/** Wait (up to 5 seconds) for an actor the GM made to reach this client. */
async function arrived(id) {
  for (let i = 0; i < 100; i++) { const a = game.actors?.get(id); if (a?.isOwner) return a; await new Promise((r) => setTimeout(r, 50)); }
  return game.actors?.get(id) ?? null;
}

/**
 * Create an actor: by this user when they can, otherwise by a GM who is logged in, owned by this user.
 * options: { backup } (the GM puts it in the folder A&M backups) → the actor.
 */
export async function makeActor(data, { backup = false } = {}) {
  if (canCreate()) return Actor.create(data);
  if (!relayOn()) throw new Error(t("You don't have permission to create actors. The GM can give players the Create New Actors permission, or turn on Players build through the GM in A&M's settings."));
  const gm = activeGM();
  if (!gm) throw new Error(t("Creating an actor needs a GM to be logged in (players don't have the Create New Actors permission in this world)."));
  const id = foundry.utils.randomID();
  const actorId = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(t("The GM's Foundry didn't answer. Try again in a moment."))); }, 30000);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    game.socket.emit(CHANNEL, { type: "create", id, user: game.user.id, gm: gm.id, data, backup });
  });
  const actor = await arrived(actorId);
  if (!actor) throw new Error(t("The GM created the actor, but it hasn't reached you yet. Look in the Actors directory."));
  return actor;
}

/** The GM's side: create the actor asked for, owned by the player who asked. */
async function serve(msg) {
  const user = game.users?.get(msg.user);
  const reply = (o) => game.socket.emit(CHANNEL, { id: msg.id, user: msg.user, ...o });
  try {
    if (!user || user.isGM) return;
    if (!relayOn()) return reply({ type: "failed", error: t("The GM has turned off Players build through the GM.") });
    const data = foundry.utils.deepClone(msg.data ?? {});
    if (!["character", "npc"].includes(data.type)) return reply({ type: "failed", error: t("Only characters and NPCs can be built.") });
    delete data._id;
    data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0, [user.id]: OWNER() };
    if (msg.backup) data.folder = (await backupFolder())?.id ?? null;
    else if (data.folder && !game.folders?.get?.(data.folder)) data.folder = null;
    const actor = await Actor.create(data);
    reply({ type: "created", actor: actor.id });
  } catch (err) {
    console.error(`${MOD} | creating an actor for ${user?.name}`, err);
    reply({ type: "failed", error: err.message });
  }
}

/** Listen for requests (GM) and answers (players). Called when the world is ready. */
export function initRelay() {
  game.socket?.on?.(CHANNEL, (msg) => {
    if (!msg?.type) return;
    if (msg.type === "create") { if (msg.gm === game.user.id) serve(msg); return; }
    if (msg.user !== game.user.id) return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.type === "created") p.resolve(msg.actor);
    else p.reject(new Error(msg.error || t("The GM couldn't create the actor.")));
  });
}
