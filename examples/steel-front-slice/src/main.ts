import { bots, BotController, NavigationAgent, Sensor, StateMachine, Targeting } from "@gameweave/bots";
import { Ammo, combat, DamageInbox, defineWeapon, equipWeapon, Faction, fire, Health, hitscan, reload } from "@gameweave/combat";
import { createGame } from "@gameweave/core";
import { Collider, physics, RigidBody } from "@gameweave/physics";
import { Renderable, three, Transform } from "@gameweave/three";
import { ui } from "@gameweave/ui";
import { AmbientLight, BoxGeometry, Color, DirectionalLight, Mesh, MeshStandardMaterial, SphereGeometry } from "three";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const visuals = three({ canvas, rendererOptions: { antialias: true } });
visuals.adapter.scene.background = new Color(0x77796b);
visuals.adapter.scene.add(new AmbientLight(0xffe8c0, 1.6), new DirectionalLight(0xfff3d8, 2.5));
visuals.adapter.camera.position.set(0, 11, 21); visuals.adapter.camera.lookAt(0, 0, -5);
visuals.adapter.registerAsset("soldier", () => box(0x736c4a, 1, 2, 1));
visuals.adapter.registerAsset("ground", () => box(0x49483b, 50, .4, 50));

const game = createGame({ fixedStep: 1 / 60, seed: "steel-front" }).use(visuals).use(physics()).use(combat()).use(bots()).use(ui());
const world = game.createWorld("stalingrad-slice");
world.spawn().set(Transform, { position: [0, -1, 0] }).set(Renderable, { asset: "ground" });
const rifle = defineWeapon("svt-40", { fireMode: "semi", roundsPerMinute: 300, magazineSize: 10, reserve: 50, delivery: hitscan({ range: 250 }), damage: { amount: 34, type: "ballistic" } });
const cannon = defineWeapon("76mm-cannon", { fireMode: "semi", roundsPerMinute: 30, magazineSize: 1, reserve: 8, reloadTime: 3, delivery: hitscan({ range: 500 }), damage: { amount: 150, type: "explosive" } });
let selected = rifle;
const player = equipWeapon(world.spawn({ id: "player" }).set(Faction, { id: "soviet" }), selected);

for (let index = 0; index < 6; index += 1) {
  world.spawn({ id: `axis-${index}` }).set(Transform, { position: [-10 + index * 4, 0, -12] }).set(Renderable, { asset: "soldier" })
    .set(Collider, {}).set(RigidBody, { gravityScale: 0 }).set(Health, {}).set(DamageInbox, {}).set(Faction, { id: "axis" })
    .set(Sensor, { sight: 40 }).set(Targeting, {}).set(NavigationAgent, { stoppingDistance: 15 }).set(StateMachine, {}).set(BotController, {});
}

addEventListener("keydown", ({ key }) => {
  if (key !== "1" && key !== "2") return;
  selected = key === "1" ? rifle : cannon;
  equipWeapon(player, selected);
});
addEventListener("mousedown", () => {
  const target = [...world.query(BotController, Health)].find((entity) => (entity.get(Health)?.current ?? 0) > 0);
  if (!target) return;
  if (!fire(player, target, world)) { reload(player, world); return; }
  feedback(target.get(Transform)?.position ?? [0, 0, 0], selected.id === cannon.id);
});

const hud = game.service<import("@gameweave/ui").UIManager>("ui");
hud.bindSelector("#weapon", () => selected.id.toUpperCase());
hud.bindSelector("#ammo", () => player.get(Ammo)?.magazine ?? 0);
hud.bindSelector("#enemy", () => world.query(BotController, Health).where({ health: { current: { $gt: 0 } } }).length);

let previous = performance.now();
requestAnimationFrame(function frame(now) { const dt = Math.min((now - previous) / 1000, .1); previous = now; resize(); game.advance(dt); requestAnimationFrame(frame); });

function feedback(position: [number, number, number], heavy: boolean) {
  const flash = new Mesh(new SphereGeometry(heavy ? 1.5 : .35), new MeshStandardMaterial({ color: heavy ? 0xff6b21 : 0xffdd88, emissive: 0xff5500 }));
  flash.position.fromArray(position); visuals.adapter.scene.add(flash); setTimeout(() => { flash.removeFromParent(); flash.geometry.dispose(); flash.material.dispose(); }, 100);
  const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain();
  oscillator.frequency.value = heavy ? 55 : 140; gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .18); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .2);
}
function box(color: number, x: number, y: number, z: number) { return new Mesh(new BoxGeometry(x, y, z), new MeshStandardMaterial({ color })); }
function resize() { const width = canvas.clientWidth, height = canvas.clientHeight; visuals.adapter.native?.setSize(width, height, false); visuals.adapter.camera.aspect = width / height; visuals.adapter.camera.updateProjectionMatrix(); }
