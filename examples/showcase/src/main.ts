import { CharacterMotor, Controller, InputManager, character } from "@gameweave/character";
import { BotController, NavigationAgent, Sensor, StateMachine, Targeting, bots, emitNoise } from "@gameweave/bots";
import { Ammo, DamageInbox, Dead, Faction, Health, Weapon, combat, fireDirection } from "@gameweave/combat";
import { AssetManager, assets, createGame, type Entity, type World } from "@gameweave/core";
import { debug } from "@gameweave/debug";
import { Collider, RapierPhysicsAdapter, RigidBody, physics } from "@gameweave/physics";
import { Renderable, Transform, three } from "@gameweave/three";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  SphereGeometry,
  Vector3,
} from "three";

interface ArenaConfig {
  readonly targets: readonly [number, number, number][];
  readonly crates: readonly [number, number, number][];
  readonly barriers: readonly [number, number, number][];
}

const element = <T extends HTMLElement>(id: string) => {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing UI element: ${id}`);
  return value as T;
};

const loading = element<HTMLElement>("loading");
const loadingState = element<HTMLElement>("loading-state");
const progress = element<HTMLElement>("load-progress");
progress.style.width = "100%";
const errorScreen = element<HTMLElement>("error");
const errorMessage = element<HTMLElement>("error-message");
element<HTMLButtonElement>("retry").addEventListener("click", () => location.reload());

void start().catch((error: unknown) => {
  loading.classList.add("done");
  errorMessage.textContent = error instanceof Error ? error.message : String(error);
  errorScreen.hidden = false;
});

async function start(): Promise<void> {
  const assetManager = new AssetManager().register<ArenaConfig>("json", async (url, signal) => {
    const response = await fetch(url, signal ? { signal } : undefined);
    if (!response.ok) throw new Error(`资源加载失败: ${response.status} ${url}`);
    return response.json() as Promise<ArenaConfig>;
  });
  assetManager.onProgress(({ loaded, total, current }) => {
    progress.style.transform = `scaleX(${total === 0 ? 0 : loaded / total})`;
    loadingState.textContent = current ? `已载入 ${current.id}` : "读取场景配置";
  });
  await assetManager.preload([{ id: "arena", type: "json", url: "/arena.json" }]);
  const config = assetManager.get<ArenaConfig>("arena");
  if (!config) throw new Error("训练场配置为空");

  loadingState.textContent = "初始化 Rapier WASM";
  const canvas = element<HTMLCanvasElement>("game");
  const rendererPlugin = three({ canvas, rendererOptions: { antialias: true } });
  configureRenderer(rendererPlugin.adapter);
  registerVisuals(rendererPlugin.adapter);
  const viewModel = createViewModel();
  rendererPlugin.adapter.camera.add(viewModel);
  rendererPlugin.adapter.scene.add(rendererPlugin.adapter.camera);

  const keys = new Set<string>();
  let yaw = 0, pitch = 0;
  addEventListener("keydown", (event) => keys.add(event.code));
  addEventListener("keyup", (event) => keys.delete(event.code));
  addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= event.movementX * .0022;
    pitch = MathUtils.clamp(pitch - event.movementY * .0022, -1.45, 1.45);
  });
  const input = new InputManager().register("range", () => ({
    move: viewRelativeMove(
      Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
      Number(keys.has("KeyS")) - Number(keys.has("KeyW")),
      yaw,
    ),
    look: [0, 0], jump: keys.has("Space"), sprint: keys.has("ShiftLeft"), fire: false,
  }));

  const physicsAdapter = new RapierPhysicsAdapter({
    gravity: [0, -14, 0], snapToGround: .18, autostep: { height: .4, width: .25 },
  });
  const game = createGame({ fixedStep: 1 / 60, seed: "physics-range" })
    .use(assets(assetManager)).use(rendererPlugin).use(physics(physicsAdapter))
    .use(character(input)).use(combat()).use(bots()).use(debug());
  const world = game.createWorld("range");
  const player = buildArena(world, config);
  installDemoSystems(world, rendererPlugin.adapter, player, viewModel, () => ({ yaw, pitch }));
  bindTelemetry(world, player);

  let collisionCount = 0;
  world.events.on("physics:collisionStart", () => {
    collisionCount += 1;
    element("collisions").textContent = String(collisionCount);
  });
  world.events.on("combat:death", (event) => {
    const { target } = event as { target?: unknown };
    if (typeof target !== "string" || !world.hasEntity(target)) return;
    if (target === player.id) {
      element("runtime-state").textContent = "OPERATOR DOWN - PRESS R";
      return;
    }
    const entity = world.entity(target);
    entity.set(BotController, { enabled: false });
    entity.set(Transform, { visible: false });
    entity.remove(Collider);
  });
  world.events.on("combat:fire", (event) => {
    const { projectile } = event as { projectile?: unknown };
    if (typeof projectile === "string" && world.hasEntity(projectile)) world.entity(projectile).set(Renderable, { asset: "bullet" });
  });
  world.events.on("combat:projectileHit", (event) => {
    const { owner, target } = event as { owner?: unknown; target?: unknown };
    if (owner !== player.id || typeof target !== "string" || !world.hasEntity(target) || !world.entity(target).has(Health)) return;
    const marker = element("hit-marker");
    marker.classList.remove("active");
    void marker.offsetWidth;
    marker.classList.add("active");
    element("runtime-state").textContent = "PROJECTILE HIT";
  });

  canvas.addEventListener("pointerdown", () => {
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
    shootCrosshair(world, player, rendererPlugin.adapter, viewModel);
  });
  document.addEventListener("pointerlockchange", () => {
    element("runtime-state").textContent = document.pointerLockElement === canvas ? "FPS CONTROL ACTIVE" : "CLICK TO ENGAGE";
  });
  addEventListener("keydown", ({ code, repeat }) => {
    if (code === "KeyR" && !repeat) resetRange(world, player);
  });
  addEventListener("resize", () => resize(rendererPlugin.adapter, canvas));
  resize(rendererPlugin.adapter, canvas);

  await game.start(world);
  loading.classList.add("done");
  loading.addEventListener("transitionend", () => loading.remove(), { once: true });
  setTimeout(() => loading.remove(), 600);
  element("runtime-state").textContent = "RAPIER ONLINE";

  let previous = performance.now(), sampledAt = previous, frames = 0;
  const frame = (now: number) => {
    game.advance(Math.min((now - previous) / 1000, .1));
    previous = now;
    frames += 1;
    if (now - sampledAt >= 500) {
      element("fps").textContent = `${Math.round(frames * 1000 / (now - sampledAt))} FPS`;
      sampledAt = now;
      frames = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function configureRenderer(adapter: ReturnType<typeof three>["adapter"]): void {
  adapter.scene.background = new Color(0x171a18);
  adapter.scene.fog = new Fog(0x171a18, 22, 58);
  adapter.camera.fov = 52;
  adapter.camera.near = .1;
  adapter.camera.far = 100;
  adapter.camera.updateProjectionMatrix();
  if (adapter.native) {
    adapter.native.shadowMap.enabled = true;
    adapter.native.shadowMap.type = PCFSoftShadowMap;
    adapter.native.toneMapping = ACESFilmicToneMapping;
    adapter.native.toneMappingExposure = 1.1;
  }
  const sun = new DirectionalLight(0xffe6b8, 3.4);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -24;
  sun.shadow.camera.right = sun.shadow.camera.top = 24;
  adapter.scene.add(new AmbientLight(0x9bad9b, 1.1), sun);
  const grid = new GridHelper(40, 40, 0x6b5939, 0x30342f);
  grid.position.y = .012;
  adapter.scene.add(grid);
}

function registerVisuals(adapter: ReturnType<typeof three>["adapter"]): void {
  adapter.registerAsset("ground", () => mesh(new BoxGeometry(40, .02, 40), 0x252925, { receive: true }));
  adapter.registerAsset("crate", () => mesh(new BoxGeometry(1, 1, 1), 0x68715f, { cast: true, receive: true }));
  adapter.registerAsset("barrier", () => mesh(new BoxGeometry(3.5, 2, .65), 0x3c423c, { cast: true, receive: true }));
  adapter.registerAsset("target", createSoldier);
  adapter.registerAsset("bullet", () => mesh(new SphereGeometry(.065, 8, 6), 0xffb347, { metalness: .15 }));
}

function mesh(geometry: BufferGeometry, color: number, options: { cast?: boolean; receive?: boolean; rotateX?: number; metalness?: number } = {}): Object3D {
  const object = new Mesh(geometry, new MeshStandardMaterial({ color, roughness: .78, metalness: options.metalness ?? .06 }));
  object.castShadow = options.cast ?? false;
  object.receiveShadow = options.receive ?? false;
  object.rotation.x = options.rotateX ?? 0;
  return object;
}

function createSoldier(): Object3D {
  const root = new Group();
  const model = new Group();
  root.add(model);
  root.userData.model = model;
  const armor = new MeshStandardMaterial({ color: 0x984838, roughness: .72, metalness: .12 });
  const fabric = new MeshStandardMaterial({ color: 0x343833, roughness: .92 });
  const dark = new MeshStandardMaterial({ color: 0x171918, roughness: .58, metalness: .28 });
  const visor = new MeshStandardMaterial({ color: 0xd99b3f, roughness: .2, metalness: .72 });
  part(model, new BoxGeometry(.78, .72, .34), armor, [0, .2, 0]);
  part(model, new BoxGeometry(.9, .16, .42), armor, [0, .48, 0]);
  part(model, new BoxGeometry(.56, .28, .38), dark, [0, -.22, 0]);
  part(model, new SphereGeometry(.27, 16, 10), fabric, [0, .78, 0]);
  part(model, new BoxGeometry(.43, .13, .29), visor, [0, .79, -.19]);
  part(model, new BoxGeometry(.56, .1, .42), armor, [0, .98, 0]);
  part(model, new BoxGeometry(.18, .62, .2), fabric, [-.51, .13, 0], [0, 0, -.1]);
  part(model, new BoxGeometry(.18, .62, .2), fabric, [.51, .13, 0], [0, 0, .1]);
  part(model, new BoxGeometry(.24, .16, .25), armor, [-.5, .4, 0]);
  part(model, new BoxGeometry(.24, .16, .25), armor, [.5, .4, 0]);
  part(model, new BoxGeometry(.24, .68, .26), fabric, [-.2, -.65, 0]);
  part(model, new BoxGeometry(.24, .68, .26), fabric, [.2, -.65, 0]);
  part(model, new BoxGeometry(.3, .16, .48), dark, [-.2, -1.0, -.08]);
  part(model, new BoxGeometry(.3, .16, .48), dark, [.2, -1.0, -.08]);
  const rifle = part(model, new BoxGeometry(.14, .16, .88), dark, [.3, .08, -.38], [.12, 0, -.28]);
  part(rifle, new CylinderGeometry(.025, .025, .46, 8), dark, [0, 0, -.62], [Math.PI / 2, 0, 0]);
  root.traverse((object) => { if (object instanceof Mesh) object.castShadow = true; });
  return root;
}

function createViewModel(): Group {
  const root = new Group();
  root.position.set(.38, -.38, -.72);
  const glove = new MeshStandardMaterial({ color: 0x292d29, roughness: .9 });
  const sleeve = new MeshStandardMaterial({ color: 0x596052, roughness: .86 });
  const gun = new MeshStandardMaterial({ color: 0x202321, roughness: .48, metalness: .58 });
  const accent = new MeshStandardMaterial({ color: 0xb98535, roughness: .58, metalness: .35 });
  part(root, new BoxGeometry(.16, .17, .48), sleeve, [-.27, -.04, .14], [-.18, .08, 0]);
  part(root, new BoxGeometry(.14, .15, .26), glove, [-.18, .01, -.17], [-.1, 0, 0]);
  part(root, new BoxGeometry(.16, .17, .42), sleeve, [.27, -.08, .1], [.18, -.08, 0]);
  part(root, new BoxGeometry(.14, .15, .24), glove, [.17, -.01, -.2], [.08, 0, 0]);
  part(root, new BoxGeometry(.18, .2, .78), gun, [0, .08, -.43]);
  part(root, new BoxGeometry(.12, .11, .44), accent, [0, .08, -.97]);
  part(root, new CylinderGeometry(.032, .032, .55, 10), gun, [0, .08, -1.42], [Math.PI / 2, 0, 0]);
  part(root, new BoxGeometry(.12, .1, .16), gun, [0, .23, -.48]);
  part(root, new BoxGeometry(.08, .16, .22), gun, [0, -.1, -.22], [-.22, 0, 0]);
  part(root, new BoxGeometry(.1, .2, .3), gun, [0, -.12, -.53], [.18, 0, 0]);
  root.userData.recoil = 0;
  return root;
}

function part<T extends Object3D>(
  parent: Object3D,
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
): Mesh {
  const object = new Mesh(geometry, material);
  object.position.set(...position);
  object.rotation.set(...rotation);
  parent.add(object);
  return object;
}

function buildArena(world: World, config: ArenaConfig): Entity {
  world.spawn({ id: "ground" }).set(Transform, {}).set(Renderable, { asset: "ground" })
    .set(RigidBody, { type: "static" }).set(Collider, { size: [40, .02, 40] });
  for (const [index, position] of config.barriers.entries()) {
    world.spawn({ id: `barrier-${index}` }).set(Transform, { position }).set(Renderable, { asset: "barrier" })
      .set(RigidBody, { type: "static" }).set(Collider, { size: [3.5, 2, .65] });
  }
  for (const [index, position] of config.crates.entries()) {
    world.spawn({ id: `crate-${index}` }).set(Transform, { position }).set(Renderable, { asset: "crate" })
      .set(RigidBody, {}).set(Collider, { size: [1, 1, 1] });
  }
  for (const [index, position] of config.targets.entries()) {
    world.spawn({ id: `target-${index}` }).set(Transform, { position }).set(Renderable, { asset: "target" })
      .set(RigidBody, { type: "dynamic", lockRotations: true }).set(Collider, { shape: "capsule", halfHeight: .4, radius: .55 })
      .set(Health, { current: 40, max: 40 }).set(DamageInbox, {}).set(Faction, { id: "red" })
      .set(Sensor, { sight: 36, hearing: 22 }).set(Targeting, {}).set(NavigationAgent, { speed: 2.4, stoppingDistance: 18 })
      .set(StateMachine, {}).set(BotController, {}).set(Weapon, {
        id: "ai-rifle", damage: 2, cooldown: .7, range: 36, delivery: "projectile", projectileSpeed: 24,
      })
      .set(Ammo, { magazine: 999, reserve: 0, capacity: 999 });
  }
  return world.spawn({ id: "player" }).set(Transform, { position: [0, 1.01, 5] })
    .set(RigidBody, { type: "kinematic", gravityScale: 0 }).set(Collider, { shape: "capsule", halfHeight: .5, radius: .5 })
    .set(CharacterMotor, { speed: 5.2, sprintSpeed: 8.5, jumpSpeed: 6.2, gravity: 16 }).set(Controller, { input: "range" })
    .set(Health, { current: 100, max: 100 }).set(DamageInbox, {}).set(Faction, { id: "blue" })
    .set(Weapon, { id: "range-rifle", damage: 40, cooldown: .18, range: 40, delivery: "projectile", projectileSpeed: 38 })
    .set(Ammo, { magazine: 12, reserve: 0, capacity: 12 });
}

function installDemoSystems(
  world: World,
  adapter: ReturnType<typeof three>["adapter"],
  player: Entity,
  viewModel: Group,
  view: () => { readonly yaw: number; readonly pitch: number },
): void {
  world.addSystem({
    name: "showcase.camera", phase: "render", optionalAfter: ["three.sync"], before: ["three.render"],
    run: ({ dt }) => {
      const transform = player.get(Transform);
      if (!transform) return;
      const [x, y, z] = transform.position;
      const { yaw, pitch } = view();
      adapter.camera.position.set(x, y + .72, z);
      adapter.camera.rotation.set(pitch, yaw, 0, "YXZ");
      const velocity = player.get(RigidBody)?.velocity ?? [0, 0, 0];
      const moving = Math.min(1, Math.hypot(velocity[0], velocity[2]) / 5);
      const time = performance.now() * .001;
      const recoil = Number(viewModel.userData.recoil ?? 0) * Math.exp(-dt * 18);
      viewModel.userData.recoil = recoil;
      viewModel.position.set(
        .38 + Math.sin(time * 8) * .012 * moving,
        -.38 + Math.abs(Math.cos(time * 8)) * .012 * moving - recoil * .035,
        -.72 + recoil * .11,
      );
      viewModel.rotation.set(recoil * .08, 0, Math.sin(time * 4) * .006 * moving);
    },
  });
  world.addSystem({
    name: "showcase.aiFacing", phase: "render", after: ["three.sync"], before: ["three.render"],
    run: () => {
      for (const bot of world.query(BotController, Targeting, Transform)) {
        const targetId = bot.get(Targeting)?.target;
        const botPosition = bot.get(Transform)?.position;
        if (!targetId || !botPosition || !world.hasEntity(targetId)) continue;
        const targetPosition = world.entity(targetId).get(Transform)?.position;
        const object = adapter.object(bot.id);
        const model = object?.userData.model as Object3D | undefined;
        if (!targetPosition || !model) continue;
        model.rotation.y = Math.atan2(botPosition[0] - targetPosition[0], botPosition[2] - targetPosition[2]);
      }
    },
  });
}

function bindTelemetry(world: World, player: Entity): void {
  world.addSystem({
    name: "showcase.telemetry", phase: "postRender",
    run: () => {
      const activeBots = [...world.query(BotController)].filter((bot) => bot.get(BotController)?.enabled);
      const states = activeBots.map((bot) => bot.get(StateMachine)?.state ?? "idle");
      element("targets").textContent = String(activeBots.length);
      element("health").textContent = String(player.get(Health)?.current ?? 0);
      element("ammo").textContent = String(player.get(Ammo)?.magazine ?? 0);
      element("grounded").textContent = player.get(CharacterMotor)?.grounded ? "YES" : "NO";
      element("ai-state").textContent = states.includes("attack") ? "ATTACK" : states.includes("chase") ? "CHASE" : "IDLE";
    },
  });
}

function shootCrosshair(
  world: World,
  player: Entity,
  renderer: ReturnType<typeof three>["adapter"],
  viewModel: Group,
): void {
  const directionVector = renderer.camera.getWorldDirection(new Vector3());
  const direction: [number, number, number] = [directionVector.x, directionVector.y, directionVector.z];
  const originVector = renderer.camera.position.clone().addScaledVector(directionVector, .7);
  const origin: [number, number, number] = [originVector.x, originVector.y, originVector.z];
  const projectile = fireDirection(player, world, origin, direction);
  const transform = player.get(Transform);
  if (transform) emitNoise(world, { source: player.id, faction: "blue", position: transform.position, radius: 20 });
  if (!projectile) return;
  viewModel.userData.recoil = 1;
  element("runtime-state").textContent = "ROUND FIRED";
}

function resetRange(world: World, player: Entity): void {
  for (const target of world.query(Health)) {
    if (target.id === player.id) continue;
    target.set(Health, { current: 40 });
    target.set(Transform, { visible: true });
    if (!target.has(Collider)) target.set(Collider, { shape: "capsule", halfHeight: .4, radius: .55 });
    if (target.has(Dead)) target.remove(Dead);
    target.set(BotController, { enabled: true });
  }
  player.set(Ammo, { magazine: 12 });
  player.set(Health, { current: 100 });
  if (player.has(Dead)) player.remove(Dead);
  element("runtime-state").textContent = "RANGE RESET";
}

function viewRelativeMove(x: number, z: number, yaw: number): [number, number] {
  const length = Math.hypot(x, z);
  if (length === 0) return [0, 0];
  x /= Math.max(1, length);
  z /= Math.max(1, length);
  const sine = Math.sin(yaw), cosine = Math.cos(yaw);
  return [x * cosine + z * sine, -x * sine + z * cosine];
}

function resize(adapter: ReturnType<typeof three>["adapter"], canvas: HTMLCanvasElement): void {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  adapter.native?.setPixelRatio(Math.min(devicePixelRatio, 2));
  adapter.native?.setSize(width, height, false);
  adapter.camera.aspect = width / height;
  adapter.camera.updateProjectionMatrix();
}
