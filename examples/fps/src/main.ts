import { bots, BotController, NavigationAgent, Sensor, StateMachine, Targeting } from "@gameweave/bots";
import { CameraRig, character, CharacterMotor, Controller, InputManager } from "@gameweave/character";
import { Ammo, combat, DamageInbox, Faction, fire, Health, Weapon } from "@gameweave/combat";
import { createGame } from "@gameweave/core";
import { debug } from "@gameweave/debug";
import { Collider, physics, RapierPhysicsAdapter, RigidBody } from "@gameweave/physics";
import { Renderable, three, Transform } from "@gameweave/three";
import { ui } from "@gameweave/ui";
import { AmbientLight, BoxGeometry, Color, DirectionalLight, Mesh, MeshStandardMaterial, Object3D } from "three";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const rendererPlugin = three({ canvas, rendererOptions: { antialias: true } });
rendererPlugin.adapter.scene.background = new Color(0x1c2228);
rendererPlugin.adapter.scene.add(new AmbientLight(0xffffff, 1.4), new DirectionalLight(0xffffff, 2));
rendererPlugin.adapter.camera.position.set(0, 8, 16);
rendererPlugin.adapter.camera.lookAt(0, 0, 0);

rendererPlugin.adapter.registerAsset("player", () => mesh(0x4ea1ff, [1, 2, 1]));
rendererPlugin.adapter.registerAsset("enemy", () => mesh(0xef5350, [1, 2, 1]));
rendererPlugin.adapter.registerAsset("ground", () => mesh(0x46515b, [40, 0.5, 40]));

const keys = new Set<string>();
addEventListener("keydown", ({ code }) => keys.add(code));
addEventListener("keyup", ({ code }) => keys.delete(code));
let firing = false;
addEventListener("mousedown", () => firing = true);
addEventListener("mouseup", () => firing = false);

const input = new InputManager().register("keyboardMouse", () => ({
  move: [Number(keys.has("KeyD")) - Number(keys.has("KeyA")), Number(keys.has("KeyS")) - Number(keys.has("KeyW"))],
  look: [0, 0], jump: keys.has("Space"), sprint: keys.has("ShiftLeft"), fire: firing,
}));

const uiPlugin = ui();
const physicsPlugin = physics(new RapierPhysicsAdapter({ autostep: { height: .35, width: .25 } }));
const game = createGame({ step: 1 / 60, seed: "fps-demo" })
  .use(rendererPlugin).use(physicsPlugin).use(character(input)).use(combat()).use(bots()).use(uiPlugin).use(debug());
const world = game.createWorld("battlefield");

world.spawn({ id: "ground" }).set(Transform, { position: [0, -.25, 0] }).set(Renderable, { asset: "ground" })
  .set(RigidBody, { type: "static" }).set(Collider, { size: [40, .5, 40] });
const player = world.spawn({ id: "player" }).set(Transform, { position: [0, 1.01, 0] }).set(Renderable, { asset: "player" })
  .set(RigidBody, { type: "kinematic", gravityScale: 0 }).set(Collider, { shape: "capsule", halfHeight: .5, radius: .5 })
  .set(CharacterMotor, {}).set(Controller, {})
  .set(CameraRig, {})
  .set(Health, {}).set(DamageInbox, {}).set(Faction, { id: "blue" }).set(Weapon, { id: "rifle", damage: 32, cooldown: .16 }).set(Ammo, {});

for (let index = 0; index < 8; index += 1) {
  world.spawn({ id: `enemy-${index}` }).set(Transform, { position: [-12 + index * 3.5, 0, -10] }).set(Renderable, { asset: "enemy" })
    .set(RigidBody, { type: "static", gravityScale: 0 }).set(Collider, {}).set(Health, {}).set(DamageInbox, {}).set(Faction, { id: "red" })
    .set(Sensor, { sight: 50 }).set(Targeting, {}).set(NavigationAgent, {}).set(StateMachine, {}).set(BotController, {})
    .set(Weapon, { id: "bot-rifle", damage: 5, cooldown: .7 }).set(Ammo, {});
}

world.addSystem({ name: "demo.playerFire", phase: "fixedUpdate", after: ["character.input"], before: ["combat.damage"], run: () => {
  if (!input.get("keyboardMouse").fire) return;
  const target = [...world.query(BotController, Health)].find((entity) => (entity.get(Health)?.current ?? 0) > 0);
  if (target) fire(player, target, world);
}});

uiPlugin.manager.bindSelector("#health", () => player.get(Health)?.current ?? 0);
uiPlugin.manager.bindSelector("#ammo", () => player.get(Ammo)?.magazine ?? 0);
uiPlugin.manager.bindSelector("#enemies", () => [...world.query(BotController, Health)].filter((entity) => (entity.get(Health)?.current ?? 0) > 0).length);

await game.start(world);
let previous = performance.now();
function frame(now: number) {
  const delta = Math.min((now - previous) / 1000, .1); previous = now;
  resize(); game.advance(delta); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
canvas.addEventListener("click", () => uiPlugin.manager.lockPointer(canvas));

function resize() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  rendererPlugin.adapter.native?.setSize(width, height, false);
  rendererPlugin.adapter.camera.aspect = width / height;
  rendererPlugin.adapter.camera.updateProjectionMatrix();
}
function mesh(color: number, size: [number, number, number]): Object3D {
  return new Mesh(new BoxGeometry(...size), new MeshStandardMaterial({ color }));
}
