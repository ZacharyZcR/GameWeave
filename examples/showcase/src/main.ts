import { CharacterMotor, Controller, InputManager, Ragdoll, activateRagdoll, character } from "@gameweave/character";
import { BotController, NavigationAgent, Sensor, StateMachine, Targeting, bots, emitNoise } from "@gameweave/bots";
import { Ammo, DamageInbox, Dead, Faction, Health, Reloading, Weapon, combat, fireDirection, reload, throwGrenade } from "@gameweave/combat";
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
  PointLight,
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
  let yaw = 0, pitch = 0, aiming = false, thirdPerson = false;
  addEventListener("keydown", (event) => keys.add(event.code));
  addEventListener("keyup", (event) => keys.delete(event.code));
  addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;
    const sensitivity = aiming ? .001 : .0022;
    yaw -= event.movementX * sensitivity;
    pitch = MathUtils.clamp(pitch - event.movementY * sensitivity, -1.45, 1.45);
  });
  addEventListener("mouseup", (event) => { if (event.button === 2) aiming = false; });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
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
  const effects = createEffects(rendererPlugin.adapter);
  installDemoSystems(world, rendererPlugin.adapter, player, viewModel, effects, () => ({ yaw, pitch, aiming, thirdPerson }));
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
      element("runtime-state").textContent = "OPERATOR DOWN - PRESS T";
      return;
    }
    const entity = world.entity(target);
    if (entity.has(BotController)) {
      entity.set(BotController, { enabled: false });
      entity.set(RigidBody, { lockRotations: false, velocity: [0, 2.2, 1.8] });
      activateRagdoll(entity, { duration: 1.25, impulse: [0, 2.2, 1.8] });
      return;
    }
    // 可破坏物：碎裂后移除
    const position = entity.get(Transform)?.position;
    if (position) effects.burst(position, "dust", 22);
    entity.despawn();
  });
  world.events.on("combat:explosion", (event) => {
    const { position } = event as { position?: [number, number, number] };
    if (!position) return;
    effects.explosion(position);
    const playerPosition = player.get(Transform)?.position;
    if (playerPosition) {
      const distance = Math.hypot(...position.map((value, index) => value - playerPosition[index]!));
      effects.rumble(Math.max(0, 1 - distance / 16));
    }
  });
  world.events.on("combat:fire", (event) => {
    const { projectile } = event as { projectile?: unknown };
    if (typeof projectile === "string" && world.hasEntity(projectile)) world.entity(projectile).set(Renderable, { asset: "bullet" });
  });
  world.events.on("combat:projectileHit", (event) => {
    const { owner, target, point, normal } = event as {
      owner?: unknown; target?: unknown;
      point?: [number, number, number]; normal?: [number, number, number];
    };
    const fleshy = typeof target === "string" && world.hasEntity(target) && world.entity(target).has(Health);
    if (point && normal) effects.impact(point, normal, fleshy ? "flesh" : "dust");
    if (fleshy && target !== player.id) effects.flash(target);
    if (owner !== player.id || !fleshy) return;
    const marker = element("hit-marker");
    marker.classList.remove("active");
    void marker.offsetWidth;
    marker.classList.add("active");
    element("runtime-state").textContent = "PROJECTILE HIT";
  });
  world.events.on("combat:damage", (event) => {
    const { target, amount } = event as { target?: unknown; amount?: number };
    if (target !== player.id) return;
    effects.playerHit(amount ?? 0);
    element("runtime-state").textContent = "TAKING FIRE";
  });

  // mousedown 而不是 pointerdown：按住一个键后再按另一个键不会再触发 pointerdown
  canvas.addEventListener("mousedown", (event) => {
    if (document.pointerLockElement !== canvas) {
      void canvas.requestPointerLock();
      return;
    }
    if (event.button === 2) { aiming = true; return; }
    if (event.button === 0) shootCrosshair(world, player, rendererPlugin.adapter, viewModel, thirdPerson);
  });
  document.addEventListener("pointerlockchange", () => {
    element("runtime-state").textContent = document.pointerLockElement === canvas ? "FPS CONTROL ACTIVE" : "CLICK TO ENGAGE";
  });
  let grenades = 3;
  const updateGrenades = () => element("grenades").textContent = String(grenades);
  addEventListener("keydown", ({ code, repeat }) => {
    if (code === "KeyR" && !repeat && reload(player, world)) element("runtime-state").textContent = "RELOADING";
    if (code === "KeyT" && !repeat) { resetRange(world, player, config); grenades = 3; updateGrenades(); }
    if (code === "KeyG" && !repeat && grenades > 0 && !player.has(Dead)) {
      const directionVector = rendererPlugin.adapter.camera.getWorldDirection(new Vector3());
      const bodyTransform = player.get(Transform);
      if (!bodyTransform) return;
      const origin = new Vector3(...bodyTransform.position).add(new Vector3(0, .72, 0)).addScaledVector(directionVector, .6);
      throwGrenade(world, {
        owner: player.id,
        position: [origin.x, origin.y, origin.z],
        velocity: [directionVector.x * 13, directionVector.y * 13 + 4.5, directionVector.z * 13],
        damage: 90, radius: 5.5, fuse: 2.2, impulse: 9,
      }).set(Renderable, { asset: "grenade" });
      grenades -= 1;
      updateGrenades();
      element("runtime-state").textContent = "FRAG OUT";
    }
    if (code === "KeyV" && !repeat) {
      thirdPerson = !thirdPerson;
      if (thirdPerson) player.set(Renderable, { asset: "operator" });
      else player.remove(Renderable);
      viewModel.visible = !thirdPerson;
      element("runtime-state").textContent = thirdPerson ? "THIRD PERSON" : "FIRST PERSON";
    }
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
  adapter.registerAsset("target", () => createSoldier());
  adapter.registerAsset("operator", () => createSoldier({ armor: 0x35608a, visor: 0x8fb6dd }));
  adapter.registerAsset("bullet", () => mesh(new SphereGeometry(.065, 8, 6), 0xffb347, { metalness: .15 }));
  adapter.registerAsset("grenade", () => {
    const body = mesh(new SphereGeometry(.12, 10, 8), 0x3a4a35, { cast: true, metalness: .3 });
    body.add(mesh(new BoxGeometry(.06, .08, .06), 0x8a8f85, { metalness: .5 }));
    (body.children[0] as Object3D).position.y = .14;
    return body;
  });
}

function mesh(geometry: BufferGeometry, color: number, options: { cast?: boolean; receive?: boolean; rotateX?: number; metalness?: number } = {}): Object3D {
  const object = new Mesh(geometry, new MeshStandardMaterial({ color, roughness: .78, metalness: options.metalness ?? .06 }));
  object.castShadow = options.cast ?? false;
  object.receiveShadow = options.receive ?? false;
  object.rotation.x = options.rotateX ?? 0;
  return object;
}

function createSoldier(palette: { armor?: number; visor?: number } = {}): Object3D {
  const root = new Group();
  const model = new Group();
  root.add(model);
  root.userData.model = model;
  const armor = new MeshStandardMaterial({ color: palette.armor ?? 0x984838, roughness: .72, metalness: .12 });
  const fabric = new MeshStandardMaterial({ color: 0x343833, roughness: .92 });
  const dark = new MeshStandardMaterial({ color: 0x171918, roughness: .58, metalness: .28 });
  const visor = new MeshStandardMaterial({ color: palette.visor ?? 0xd99b3f, roughness: .2, metalness: .72 });
  const torso = part(model, new BoxGeometry(.78, .72, .34), armor, [0, .2, 0]);
  part(model, new BoxGeometry(.9, .16, .42), armor, [0, .48, 0]);
  part(model, new BoxGeometry(.56, .28, .38), dark, [0, -.22, 0]);
  const head = part(model, new SphereGeometry(.27, 16, 10), fabric, [0, .78, 0]);
  part(model, new BoxGeometry(.43, .13, .29), visor, [0, .79, -.19]);
  part(model, new BoxGeometry(.56, .1, .42), armor, [0, .98, 0]);
  const leftArm = part(model, new BoxGeometry(.18, .62, .2), fabric, [-.51, .13, 0], [0, 0, -.1]);
  const rightArm = part(model, new BoxGeometry(.18, .62, .2), fabric, [.51, .13, 0], [0, 0, .1]);
  part(model, new BoxGeometry(.24, .16, .25), armor, [-.5, .4, 0]);
  part(model, new BoxGeometry(.24, .16, .25), armor, [.5, .4, 0]);
  const leftLeg = part(model, new BoxGeometry(.24, .68, .26), fabric, [-.2, -.65, 0]);
  const rightLeg = part(model, new BoxGeometry(.24, .68, .26), fabric, [.2, -.65, 0]);
  part(model, new BoxGeometry(.3, .16, .48), dark, [-.2, -1.0, -.08]);
  part(model, new BoxGeometry(.3, .16, .48), dark, [.2, -1.0, -.08]);
  const rifle = part(model, new BoxGeometry(.12, .14, .62), dark, [.24, .14, -.4]);
  part(rifle, new BoxGeometry(.05, .13, .16), dark, [0, -.13, .08]);
  part(rifle, new BoxGeometry(.09, .09, .2), armor, [0, -.02, .32]);
  part(rifle, new BoxGeometry(.05, .06, .1), dark, [0, .1, .18]);
  part(rifle, new CylinderGeometry(.026, .026, .5, 8), dark, [0, .02, -.53], [Math.PI / 2, 0, 0]);
  part(rifle, new BoxGeometry(.06, .07, .1), dark, [0, .02, -.76]);
  root.userData.bones = { torso, head, leftArm, rightArm, leftLeg, rightLeg, rifle };
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
  part(root, new BoxGeometry(.1, .04, .14), gun, [0, .17, -.48]);
  part(root, new BoxGeometry(.03, .08, .05), gun, [-.05, .23, -.48]);
  part(root, new BoxGeometry(.03, .08, .05), gun, [.05, .23, -.48]);
  part(root, new BoxGeometry(.016, .07, .03), accent, [0, .215, -1.12]);
  part(root, new BoxGeometry(.08, .16, .22), gun, [0, -.1, -.22], [-.22, 0, 0]);
  part(root, new BoxGeometry(.1, .2, .3), gun, [0, -.12, -.53], [.18, 0, 0]);
  const muzzle = new Object3D();
  muzzle.position.set(0, .08, -1.72);
  root.add(muzzle);
  root.userData.muzzle = muzzle;
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

function spawnBarrier(world: World, index: number, position: readonly [number, number, number]): void {
  world.spawn({ id: `barrier-${index}` }).set(Transform, { position: [...position] }).set(Renderable, { asset: "barrier" })
    .set(RigidBody, { type: "static" }).set(Collider, { size: [3.5, 2, .65] })
    .set(Health, { current: 120, max: 120 }).set(DamageInbox, {});
}

function spawnCrate(world: World, index: number, position: readonly [number, number, number]): void {
  world.spawn({ id: `crate-${index}` }).set(Transform, { position: [...position] }).set(Renderable, { asset: "crate" })
    .set(RigidBody, {}).set(Collider, { size: [1, 1, 1] })
    .set(Health, { current: 40, max: 40 }).set(DamageInbox, {});
}

function buildArena(world: World, config: ArenaConfig): Entity {
  world.spawn({ id: "ground" }).set(Transform, {}).set(Renderable, { asset: "ground" })
    .set(RigidBody, { type: "static" }).set(Collider, { size: [40, .02, 40] });
  for (const [index, position] of config.barriers.entries()) spawnBarrier(world, index, position);
  for (const [index, position] of config.crates.entries()) spawnCrate(world, index, position);
  for (const [index, position] of config.targets.entries()) {
    world.spawn({ id: `target-${index}` }).set(Transform, { position }).set(Renderable, { asset: "target" })
      .set(RigidBody, { type: "dynamic", lockRotations: true }).set(Collider, { shape: "capsule", halfHeight: .4, radius: .55 })
      .set(Health, { current: 40, max: 40 }).set(DamageInbox, {}).set(Faction, { id: "red" })
      .set(Sensor, { sight: 36, hearing: 22 }).set(Targeting, {}).set(NavigationAgent, { speed: 2.4, stoppingDistance: 18 })
      .set(StateMachine, {}).set(BotController, {}).set(Weapon, {
        id: "ai-rifle", damage: 2, cooldown: .7, range: 36, delivery: "projectile", projectileSpeed: 24,
        muzzle: [.24, .16, 1.21],
      })
      .set(Ammo, { magazine: 999, reserve: 0, capacity: 999 }).set(Ragdoll, {});
  }
  return world.spawn({ id: "player" }).set(Transform, { position: [0, 1.01, 5] })
    .set(RigidBody, { type: "kinematic", gravityScale: 0 }).set(Collider, { shape: "capsule", halfHeight: .5, radius: .5 })
    .set(CharacterMotor, { speed: 5.2, sprintSpeed: 8.5, jumpSpeed: 6.2, gravity: 16 }).set(Controller, { input: "range" })
    .set(Health, { current: 100, max: 100 }).set(DamageInbox, {}).set(Faction, { id: "blue" })
    .set(Weapon, { id: "range-rifle", damage: 40, cooldown: .18, range: 40, delivery: "projectile", projectileSpeed: 38 })
    .set(Ammo, { magazine: 12, reserve: 48, capacity: 12 });
}

interface ImpactParticle {
  readonly mesh: Mesh;
  readonly velocity: Vector3;
  life: number;
  readonly ttl: number;
}

function createEffects(adapter: ReturnType<typeof three>["adapter"]) {
  const vignette = element<HTMLElement>("damage-vignette");
  const geometry = new BoxGeometry(.055, .055, .055);
  const materials = {
    flesh: new MeshStandardMaterial({ color: 0xe0523a, emissive: 0x99200f, emissiveIntensity: 1.3, roughness: .55 }),
    dust: new MeshStandardMaterial({ color: 0x99a08f, roughness: .95 }),
    blast: new MeshStandardMaterial({ color: 0xffb347, emissive: 0xd96a1f, emissiveIntensity: 2.2, roughness: .4 }),
  };
  const particles: ImpactParticle[] = [];
  const lights: { light: PointLight; life: number; ttl: number }[] = [];
  const flashes = new Map<string, { materials: readonly MeshStandardMaterial[]; strength: number }>();
  let shake = 0;

  const emit = (
    point: readonly [number, number, number],
    normal: readonly [number, number, number],
    kind: keyof typeof materials,
    count: number,
    speed: number,
  ): void => {
    for (let index = 0; index < count; index += 1) {
      const mesh = new Mesh(geometry, materials[kind]);
      mesh.position.set(...point);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      const velocity = new Vector3(...normal).multiplyScalar(speed * (.45 + Math.random() * .55))
        .add(new Vector3(Math.random() - .5, Math.random() - .2, Math.random() - .5).multiplyScalar(speed * .65));
      adapter.scene.add(mesh);
      particles.push({ mesh, velocity, life: 0, ttl: .28 + Math.random() * .22 });
    }
  };

  return {
    get shake() { return shake; },
    impact(point: readonly [number, number, number], normal: readonly [number, number, number], kind: "flesh" | "dust"): void {
      emit(point, normal, kind, 9, 4.8);
    },
    burst(point: readonly [number, number, number], kind: "flesh" | "dust", count: number): void {
      emit(point, [0, 1, 0], kind, count, 6.5);
    },
    explosion(point: readonly [number, number, number]): void {
      emit(point, [0, 1, 0], "blast", 30, 11);
      emit(point, [0, 1, 0], "dust", 14, 7);
      const light = new PointLight(0xffa040, 40, 14, 1.6);
      light.position.set(point[0], point[1] + .4, point[2]);
      adapter.scene.add(light);
      lights.push({ light, life: 0, ttl: .18 });
    },
    rumble(strength: number): void {
      shake = Math.min(1, shake + strength);
    },
    flash(entity: string): void {
      const existing = flashes.get(entity);
      if (existing) { existing.strength = 1; return; }
      const object = adapter.object(entity);
      if (!object) return;
      const found = new Set<MeshStandardMaterial>();
      object.traverse((child) => {
        if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) found.add(child.material);
      });
      flashes.set(entity, { materials: [...found], strength: 1 });
    },
    playerHit(amount: number): void {
      shake = Math.min(1, shake + .35 + amount * .012);
      vignette.classList.remove("active");
      void vignette.offsetWidth;
      vignette.classList.add("active");
    },
    update(dt: number): void {
      shake = Math.max(0, shake - dt * 2.4);
      for (let index = lights.length - 1; index >= 0; index -= 1) {
        const entry = lights[index]!;
        entry.life += dt;
        if (entry.life >= entry.ttl) {
          adapter.scene.remove(entry.light);
          lights.splice(index, 1);
          continue;
        }
        entry.light.intensity = 40 * (1 - entry.life / entry.ttl);
      }
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index]!;
        particle.life += dt;
        if (particle.life >= particle.ttl) {
          adapter.scene.remove(particle.mesh);
          particles.splice(index, 1);
          continue;
        }
        particle.velocity.y -= 12 * dt;
        particle.mesh.position.addScaledVector(particle.velocity, dt);
        particle.mesh.scale.setScalar(1 - particle.life / particle.ttl);
      }
      for (const [entity, flash] of flashes) {
        flash.strength -= dt * 5.5;
        const intensity = Math.max(0, flash.strength) * 1.8;
        for (const material of flash.materials) {
          material.emissive.setHex(0xff3a1f);
          material.emissiveIntensity = intensity;
        }
        if (flash.strength <= 0) flashes.delete(entity);
      }
    },
  };
}

function installDemoSystems(
  world: World,
  adapter: ReturnType<typeof three>["adapter"],
  player: Entity,
  viewModel: Group,
  effects: ReturnType<typeof createEffects>,
  view: () => { readonly yaw: number; readonly pitch: number; readonly aiming: boolean; readonly thirdPerson: boolean },
): void {
  world.addSystem({
    name: "showcase.effects", phase: "render", optionalAfter: ["three.sync"], before: ["three.render"],
    run: ({ dt }) => effects.update(dt),
  });
  world.addSystem({
    name: "showcase.camera", phase: "render", optionalAfter: ["three.sync"], before: ["three.render"],
    run: ({ dt }) => {
      const transform = player.get(Transform);
      if (!transform) return;
      const [x, y, z] = transform.position;
      const { yaw, pitch, aiming, thirdPerson } = view();
      const targetFov = aiming ? (thirdPerson ? 38 : 28) : 52;
      adapter.camera.fov += (targetFov - adapter.camera.fov) * Math.min(1, dt * 14);
      adapter.camera.updateProjectionMatrix();
      adapter.camera.rotation.set(pitch, yaw, 0, "YXZ");
      adapter.camera.position.set(x, y + .72, z);
      if (thirdPerson) {
        const back = new Vector3(0, 0, 1).applyEuler(adapter.camera.rotation);
        adapter.camera.position.addScaledVector(back, 3.4);
        const model = adapter.object(player.id)?.userData.model as Object3D | undefined;
        if (model) model.rotation.y = yaw;
      }
      const velocity = player.get(RigidBody)?.velocity ?? [0, 0, 0];
      const moving = Math.min(1, Math.hypot(velocity[0], velocity[2]) / 5);
      const time = performance.now() * .001;
      const recoil = Number(viewModel.userData.recoil ?? 0) * Math.exp(-dt * 18);
      const reloading = player.get(Reloading), weapon = player.get(Weapon);
      const reloadProgress = reloading && weapon ? 1 - reloading.remaining / weapon.reloadTime : 0;
      const reloadArc = reloading ? Math.sin(reloadProgress * Math.PI) : 0;
      const aim = Number(viewModel.userData.aim ?? 0);
      const aimBlend = aim + ((aiming && !thirdPerson ? 1 : 0) - aim) * Math.min(1, dt * 12);
      const sway = moving * (1 - aimBlend * .75);
      viewModel.userData.recoil = recoil;
      viewModel.userData.aim = aimBlend;
      viewModel.position.set(
        MathUtils.lerp(.38, 0, aimBlend) + Math.sin(time * 8) * .012 * sway,
        MathUtils.lerp(-.38, -.25, aimBlend) + Math.abs(Math.cos(time * 8)) * .012 * sway - recoil * .035 - reloadArc * .34,
        MathUtils.lerp(-.72, -.5, aimBlend) + recoil * .11,
      );
      viewModel.rotation.set(recoil * .08 + reloadArc * .28, 0, Math.sin(time * 4) * .006 * sway + reloadArc * .55);
      const trauma = effects.shake ** 2;
      if (trauma > 0) {
        adapter.camera.rotation.x += Math.sin(time * 91) * trauma * .05;
        adapter.camera.rotation.y += Math.cos(time * 83) * trauma * .05;
        adapter.camera.rotation.z = Math.sin(time * 71) * trauma * .06;
      }
    },
  });
  world.addSystem({
    name: "showcase.aiFacing", phase: "render", after: ["three.sync"], before: ["three.render"],
    run: () => {
      for (const bot of world.query(BotController, Targeting, Transform)) {
        if (bot.get(Ragdoll)?.active) continue;
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
  world.addSystem({
    // 在 ragdolls 之后运行：非 ragdoll 状态下 ragdolls 会把骨骼归零，跑步摆动要覆盖它
    name: "showcase.locomotion", phase: "render", after: ["showcase.ragdolls"], before: ["three.render"],
    run: ({ dt }) => {
      for (const entity of world.query(Transform, RigidBody)) {
        const object = adapter.object(entity.id);
        const bones = object?.userData.bones as Record<string, Object3D> | undefined;
        const model = object?.userData.model as Object3D | undefined;
        if (!object || !bones || !model || entity.get(Ragdoll)?.active) continue;
        const velocity = entity.get(RigidBody)?.velocity ?? [0, 0, 0];
        const speed = Math.hypot(velocity[0], velocity[2]);
        const blend = Number(object.userData.runBlend ?? 0);
        const nextBlend = blend + (Math.min(1, speed / 2.2) - blend) * Math.min(1, dt * 10);
        const phase = Number(object.userData.runPhase ?? 0) + (nextBlend > .02 ? dt * (4 + speed * 2.6) : 0);
        object.userData.runBlend = nextBlend;
        object.userData.runPhase = phase;
        const swing = Math.sin(phase) * .62 * nextBlend;
        bones.leftLeg!.rotation.x = swing;
        bones.rightLeg!.rotation.x = -swing;
        bones.leftArm!.rotation.x = -swing * .55;
        bones.rightArm!.rotation.x = swing * .25;
        model.position.y = Math.abs(Math.sin(phase)) * .05 * nextBlend;
      }
    },
  });
  world.addSystem({
    name: "showcase.ragdolls", phase: "render", after: ["three.sync"], before: ["three.render"],
    run: () => {
      for (const entity of world.query(Ragdoll)) {
        const ragdoll = entity.get(Ragdoll);
        const object = adapter.object(entity.id);
        const model = object?.userData.model as Object3D | undefined;
        const bones = object?.userData.bones as Record<string, Object3D> | undefined;
        if (!ragdoll || !model || !bones) continue;
        const t = ragdoll.active ? Math.min(1, ragdoll.elapsed / ragdoll.duration) : 0;
        const eased = 1 - (1 - t) ** 3;
        model.rotation.z = eased * 1.42;
        model.rotation.x = eased * -.28;
        model.position.y = eased * -.72;
        bones.leftArm!.rotation.z = -.1 - eased * 1.5;
        bones.rightArm!.rotation.z = .1 + eased * 1.2;
        bones.leftLeg!.rotation.x = eased * .55;
        bones.rightLeg!.rotation.x = eased * -.42;
        bones.head!.rotation.z = eased * -.5;
        bones.rifle!.rotation.x = .12 + eased * .85;
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
  thirdPerson: boolean,
): void {
  const directionVector = renderer.camera.getWorldDirection(new Vector3());
  const direction: [number, number, number] = [directionVector.x, directionVector.y, directionVector.z];
  const bodyTransform = player.get(Transform);
  let originVector: Vector3;
  if (thirdPerson && bodyTransform) {
    originVector = new Vector3(...bodyTransform.position).add(new Vector3(0, .72, 0)).addScaledVector(directionVector, .8);
  } else {
    renderer.camera.updateMatrixWorld(true);
    const muzzle = viewModel.userData.muzzle as Object3D | undefined;
    originVector = muzzle?.getWorldPosition(new Vector3()) ?? renderer.camera.position.clone().addScaledVector(directionVector, .7);
  }
  const origin: [number, number, number] = [originVector.x, originVector.y, originVector.z];
  const projectile = fireDirection(player, world, origin, direction);
  const transform = player.get(Transform);
  if (transform) emitNoise(world, { source: player.id, faction: "blue", position: transform.position, radius: 20 });
  if (!projectile) return;
  viewModel.userData.recoil = 1;
  element("runtime-state").textContent = "ROUND FIRED";
}

function resetRange(world: World, player: Entity, config: ArenaConfig): void {
  for (const target of world.query(Health, BotController)) {
    target.set(Health, { current: 40 });
    target.set(Transform, { visible: true });
    if (!target.has(Collider)) target.set(Collider, { shape: "capsule", halfHeight: .4, radius: .55 });
    if (target.has(Dead)) target.remove(Dead);
    target.set(Ragdoll, { active: false, elapsed: 0 });
    target.set(RigidBody, { lockRotations: true, velocity: [0, 0, 0] });
    target.set(BotController, { enabled: true });
  }
  for (const [index, position] of config.barriers.entries()) {
    if (world.hasEntity(`barrier-${index}`)) world.entity(`barrier-${index}`).set(Health, { current: 120 }).set(Transform, { position: [...position] });
    else spawnBarrier(world, index, position);
  }
  for (const [index, position] of config.crates.entries()) {
    if (world.hasEntity(`crate-${index}`)) world.entity(`crate-${index}`).set(Health, { current: 40 }).set(Transform, { position: [...position] }).set(RigidBody, { velocity: [0, 0, 0] });
    else spawnCrate(world, index, position);
  }
  player.set(Ammo, { magazine: 12, reserve: 48 });
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
