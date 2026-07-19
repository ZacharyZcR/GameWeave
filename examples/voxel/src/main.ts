import { audio, type AudioAdapter } from "@gameweave/audio";
import { CharacterMotor, Controller, InputManager, character } from "@gameweave/character";
import { createGame, createNoise2D, defineComponent, type EntityId, type World } from "@gameweave/core";
import { Collider, RigidBody, VoxelPhysicsAdapter, physics, type VoxelSource } from "@gameweave/physics";
import { DynamicMesh, Transform, three } from "@gameweave/three";
import { AmbientLight, Color, DirectionalLight, Fog, MathUtils, MeshStandardMaterial, Vector3 } from "three";

// ============ 体素数据 ============
const SIZE = 16, HEIGHT = 40, VIEW = 3;   // 区块尺寸 / 世界高 / 视距（切比雪夫半径）
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3;
const COLORS: Record<number, [number, number, number]> = {
  [GRASS]: [.36, .55, .3], [DIRT]: [.45, .35, .26], [STONE]: [.42, .43, .46],
};

const noise = createNoise2D("voxel-slice");
const chunks = new Map<string, { blocks: Uint8Array; entity: EntityId }>();
const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

const Chunk = defineComponent("chunk", { defaults: { cx: 0, cz: 0 } });

function generateBlocks(cx: number, cz: number): Uint8Array {
  const blocks = new Uint8Array(SIZE * SIZE * HEIGHT);
  for (let x = 0; x < SIZE; x += 1) {
    for (let z = 0; z < SIZE; z += 1) {
      const worldX = cx * SIZE + x, worldZ = cz * SIZE + z;
      const height = Math.floor(14 + noise.fbm(worldX * .03, worldZ * .03) * 9);
      for (let y = 0; y < HEIGHT; y += 1) {
        blocks[blockIndex(x, y, z)] = y > height ? AIR : y === height ? GRASS : y > height - 4 ? DIRT : STONE;
      }
    }
  }
  return blocks;
}

const blockIndex = (x: number, y: number, z: number) => (y * SIZE + z) * SIZE + x;

function blockAt(x: number, y: number, z: number): number {
  if (y < 0) return STONE;
  if (y >= HEIGHT) return AIR;
  const cx = Math.floor(x / SIZE), cz = Math.floor(z / SIZE);
  const chunk = chunks.get(chunkKey(cx, cz));
  if (!chunk) return AIR;
  return chunk.blocks[blockIndex(x - cx * SIZE, y, z - cz * SIZE)]!;
}

function setBlock(world: World, x: number, y: number, z: number, value: number): void {
  if (y < 1 || y >= HEIGHT) return;
  const cx = Math.floor(x / SIZE), cz = Math.floor(z / SIZE);
  const chunk = chunks.get(chunkKey(cx, cz));
  if (!chunk) return;
  chunk.blocks[blockIndex(x - cx * SIZE, y, z - cz * SIZE)] = value;
  remesh(world, cx, cz);
  // 边界方块影响相邻区块的裸露面
  const localX = x - cx * SIZE, localZ = z - cz * SIZE;
  if (localX === 0) remesh(world, cx - 1, cz);
  if (localX === SIZE - 1) remesh(world, cx + 1, cz);
  if (localZ === 0) remesh(world, cx, cz - 1);
  if (localZ === SIZE - 1) remesh(world, cx, cz + 1);
}

// ============ 网格化：朴素面剔除 ============
const FACES: readonly { dir: [number, number, number]; corners: readonly [number, number, number][] }[] = [
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 0, 1], [1, 1, 1]] },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 0, 0], [0, 1, 0]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]] },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]] },
  { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 0, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0]] },
];

function remesh(world: World, cx: number, cz: number): void {
  const chunk = chunks.get(chunkKey(cx, cz));
  if (!chunk || !world.hasEntity(chunk.entity)) return;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const baseX = cx * SIZE, baseZ = cz * SIZE;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let z = 0; z < SIZE; z += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const block = chunk.blocks[blockIndex(x, y, z)]!;
        if (block === AIR) continue;
        const color = COLORS[block]!;
        for (const face of FACES) {
          if (blockAt(baseX + x + face.dir[0], y + face.dir[1], baseZ + z + face.dir[2]) !== AIR) continue;
          const vertexBase = positions.length / 3;
          const shade = face.dir[1] === 1 ? 1 : face.dir[1] === -1 ? .55 : .78;
          for (const corner of face.corners) {
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(...face.dir);
            colors.push(color[0] * shade, color[1] * shade, color[2] * shade);
            uvs.push(corner[0], corner[2]);
          }
          indices.push(vertexBase, vertexBase + 1, vertexBase + 2, vertexBase + 2, vertexBase + 1, vertexBase + 3);
        }
      }
    }
  }
  const entity = world.entity(chunk.entity);
  const previous = entity.get(DynamicMesh);
  entity.set(DynamicMesh, {
    version: (previous?.version ?? 0) + 1,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    material: "terrain",
  });
}

function ensureChunk(world: World, cx: number, cz: number): void {
  const key = chunkKey(cx, cz);
  if (chunks.has(key)) return;
  const entity = world.spawn({ id: `chunk:${key}` })
    .set(Transform, { position: [cx * SIZE, 0, cz * SIZE] })
    .set(Chunk, { cx, cz });
  chunks.set(key, { blocks: generateBlocks(cx, cz), entity: entity.id });
  remesh(world, cx, cz);
  // 新区块出现后，相邻已有区块的边界面需要重算
  remesh(world, cx - 1, cz); remesh(world, cx + 1, cz);
  remesh(world, cx, cz - 1); remesh(world, cx, cz + 1);
}

// ============ 启动 ============
const canvas = document.getElementById("game") as HTMLCanvasElement;
const rendererPlugin = three({ canvas, rendererOptions: { antialias: true } });
const adapter = rendererPlugin.adapter;
adapter.scene.background = new Color(0x8db8d8);
adapter.scene.fog = new Fog(0x8db8d8, 30, 90);
adapter.scene.add(new AmbientLight(0xdfe8f0, 1.1));
const sun = new DirectionalLight(0xfff2d0, 2.2);
sun.position.set(18, 30, 10);
adapter.scene.add(sun);
adapter.camera.near = .1;
adapter.camera.far = 300;
adapter.camera.fov = 68;
adapter.camera.updateProjectionMatrix();
adapter.registerMaterial("terrain", new MeshStandardMaterial({ vertexColors: true, roughness: .92 }));

const voxelSource: VoxelSource = {
  isSolid: (x, y, z) => blockAt(x, y, z) !== AIR,
  entityAt: (x, y, z) => chunks.get(chunkKey(Math.floor(x / SIZE), Math.floor(z / SIZE)))?.entity,
};

const keys = new Set<string>();
let yaw = 0, pitch = 0;
addEventListener("keydown", (event) => keys.add(event.code));
addEventListener("keyup", (event) => keys.delete(event.code));
addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= event.movementX * .0022;
  pitch = MathUtils.clamp(pitch - event.movementY * .0022, -1.5, 1.5);
});
const input = new InputManager().register("keyboardMouse", () => {
  const rawX = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  const rawZ = Number(keys.has("KeyS")) - Number(keys.has("KeyW"));
  const length = Math.hypot(rawX, rawZ) || 1;
  const x = rawX / length, z = rawZ / length;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  return {
    move: [x * cos + z * sin, -x * sin + z * cos] as [number, number],
    look: [0, 0] as [number, number],
    jump: keys.has("Space"), sprint: keys.has("ShiftLeft"), fire: false,
  };
});

const audioPlugin = audio();
registerSounds(audioPlugin.adapter);
const voxelPhysics = new VoxelPhysicsAdapter(voxelSource, { gravity: [0, -22, 0] });
const game = createGame({ fixedStep: 1 / 60, seed: "voxel-slice" })
  .use(rendererPlugin).use(physics(voxelPhysics)).use(character(input)).use(audioPlugin);
const world = game.createWorld("voxel");

const player = world.spawn({ id: "player" })
  .set(Transform, { position: [8.5, 30, 8.5] })
  .set(RigidBody, { type: "kinematic", gravityScale: 0 })
  .set(Collider, { shape: "capsule", halfHeight: .45, radius: .38 })
  .set(CharacterMotor, { speed: 5, sprintSpeed: 8.2, jumpSpeed: 7.6, gravity: 22 })
  .set(Controller, { input: "keyboardMouse" });

// 流式生成：按玩家所在区块生成邻域
world.addSystem({
  name: "voxel.stream", phase: "fixedUpdate",
  run: () => {
    const position = player.get(Transform)?.position;
    if (!position) return;
    const cx = Math.floor(position[0] / SIZE), cz = Math.floor(position[2] / SIZE);
    for (let dx = -VIEW; dx <= VIEW; dx += 1) {
      for (let dz = -VIEW; dz <= VIEW; dz += 1) ensureChunk(world, cx + dx, cz + dz);
    }
    for (const [key, chunk] of chunks) {
      const [ccx, ccz] = key.split(",").map(Number) as [number, number];
      if (Math.max(Math.abs(ccx - cx), Math.abs(ccz - cz)) <= VIEW + 1) continue;
      world.despawn(chunk.entity);
      chunks.delete(key);
    }
    document.getElementById("stats")!.textContent = `${chunks.size} CHUNKS`;
  },
});

world.addSystem({
  name: "voxel.camera", phase: "render", optionalAfter: ["three.sync"], before: ["three.render"],
  run: () => {
    const position = player.get(Transform)?.position;
    if (!position) return;
    adapter.camera.position.set(position[0], position[1] + .65, position[2]);
    adapter.camera.rotation.set(pitch, yaw, 0, "YXZ");
  },
});

// 挖掘与放置
canvas.addEventListener("mousedown", (event) => {
  if (document.pointerLockElement !== canvas) { void canvas.requestPointerLock(); return; }
  const direction = adapter.camera.getWorldDirection(new Vector3());
  const origin: [number, number, number] = [adapter.camera.position.x, adapter.camera.position.y, adapter.camera.position.z];
  const hit = voxelPhysics.raycast(world, origin, [direction.x, direction.y, direction.z], 7);
  if (!hit?.voxel) return;
  if (event.button === 0) {
    setBlock(world, hit.voxel[0], hit.voxel[1], hit.voxel[2], AIR);
    audioPlugin.adapter.play("dig", { position: [...hit.point], pitch: .9 + Math.random() * .2 });
  } else if (event.button === 2) {
    const target: [number, number, number] = [
      hit.voxel[0] + hit.normal[0], hit.voxel[1] + hit.normal[1], hit.voxel[2] + hit.normal[2],
    ];
    // 不把方块放进玩家身体里
    const body = player.get(Transform)!.position;
    if (Math.abs(target[0] + .5 - body[0]) < .9 && Math.abs(target[2] + .5 - body[2]) < .9 &&
      target[1] + 1 > body[1] - .85 && target[1] < body[1] + .85) return;
    setBlock(world, target[0], target[1], target[2], DIRT);
    audioPlugin.adapter.play("place", { position: [...hit.point] });
  }
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

function registerSounds(sounds: AudioAdapter): void {
  const buffer = (ctx: BaseAudioContext, duration: number, fill: (t: number) => number) => {
    const data = ctx.createBuffer(1, Math.ceil(duration * ctx.sampleRate), ctx.sampleRate);
    const channel = data.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) channel[index] = fill(index / ctx.sampleRate);
    return data;
  };
  sounds.register("dig", { synth: (ctx) => buffer(ctx, .1, (t) => (Math.random() * 2 - 1) * Math.exp(-t * 45) * .55) });
  sounds.register("place", { synth: (ctx) => buffer(ctx, .08, (t) => Math.sin(2 * Math.PI * 240 * t) * Math.exp(-t * 50) * .5) });
}

function resize(): void {
  adapter.native?.setPixelRatio(Math.min(devicePixelRatio, 2));
  adapter.native?.setSize(canvas.clientWidth, canvas.clientHeight, false);
  adapter.camera.aspect = canvas.clientWidth / canvas.clientHeight;
  adapter.camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

await game.start(world);
const listenerForward = new Vector3();
world.addSystem({
  name: "voxel.listener", phase: "render", optionalAfter: ["voxel.camera"],
  run: () => {
    adapter.camera.getWorldDirection(listenerForward);
    audioPlugin.adapter.setListener(
      [adapter.camera.position.x, adapter.camera.position.y, adapter.camera.position.z],
      [listenerForward.x, listenerForward.y, listenerForward.z],
    );
  },
});

let previous = performance.now();
const frame = (now: number) => {
  game.advance(Math.min((now - previous) / 1000, .1));
  previous = now;
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
