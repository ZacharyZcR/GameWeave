import {
  defineComponent,
  definePlugin,
  type EntityId,
  type GamePlugin,
  type World,
} from "@gameweave/core";
import {
  AnimationMixer,
  BufferAttribute,
  BufferGeometry,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  ObjectLoader,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type WebGLRendererParameters,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export interface TransformData extends Record<string, unknown> {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  visible: boolean;
}

export const Transform = defineComponent<TransformData>("transform", {
  defaults: {
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    scale: [1, 1, 1],
    visible: true,
  },
});

export interface RenderableData extends Record<string, unknown> {
  asset: string;
}

export const Renderable = defineComponent<RenderableData>("renderable", {
  defaults: { asset: "" },
  validate: (value): value is RenderableData =>
    typeof value === "object" && value !== null &&
    typeof (value as RenderableData).asset === "string",
});

export const ManualTransform = defineComponent("manualTransform", {
  defaults: { enabled: true },
});

export interface DynamicMeshData extends Record<string, unknown> {
  version: number;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  material: string;
}

// 运行时生成/重建的几何（体素区块、程序化地形、破坏变形）。
// 几何数据 runtimeOnly：从游戏数据重建，不进存档。改完数据递增 version 提交。
export const DynamicMesh = defineComponent<DynamicMeshData>("dynamicMesh", {
  defaults: () => ({
    version: 0,
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    colors: new Float32Array(0),
    indices: new Uint32Array(0),
    material: "",
  }),
  runtimeOnly: true,
});

// 动画意图：可序列化、可 inspect。表现由 adapter 的 AnimationMixer 驱动。
export const ModelAnimation = defineComponent("modelAnimation", {
  defaults: { clip: "", loop: true, speed: 1, transition: .2 },
});

export interface ModelSource {
  readonly scene: Object3D;
  readonly animations?: readonly AnimationClip[];
}

export interface ModelOptions {
  readonly scale?: number;
  readonly offset?: readonly [number, number, number];
  readonly castShadow?: boolean;
}

interface AnimationState {
  readonly mixer: AnimationMixer;
  readonly actions: ReadonlyMap<string, AnimationAction>;
  current: string;
}

export type ObjectFactory = () => Object3D;

export interface ThreeAdapterOptions {
  readonly scene?: Scene;
  readonly camera?: PerspectiveCamera;
  readonly renderer?: WebGLRenderer;
  readonly canvas?: HTMLCanvasElement | string;
  readonly rendererOptions?: WebGLRendererParameters;
}

export class ThreeAdapter {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly native: WebGLRenderer | undefined;
  #assets = new Map<string, ObjectFactory>();
  #assetTemplates: Object3D[] = [];
  #modelClips = new Map<string, readonly AnimationClip[]>();
  #objects = new Map<EntityId, Object3D>();
  #managed = new Set<EntityId>();
  #sharedGeometry = new WeakSet<Object3D>();
  #synced = new Map<EntityId, TransformData>();
  #animations = new Map<EntityId, AnimationState>();
  #materials = new Map<string, Material>();
  #defaultMaterial: Material | undefined;
  #meshVersions = new Map<EntityId, number>();

  constructor(options: ThreeAdapterOptions = {}) {
    this.scene = options.scene ?? new Scene();
    this.camera = options.camera ?? new PerspectiveCamera(60, 1, 0.1, 2_000);
    const canvas = typeof options.canvas === "string"
      ? document.querySelector<HTMLCanvasElement>(options.canvas) ?? undefined
      : options.canvas;
    if (typeof options.canvas === "string" && !canvas) {
      throw new Error(`Canvas not found: ${options.canvas}`);
    }
    this.native = options.renderer ?? (
      canvas
        ? new WebGLRenderer({
            ...options.rendererOptions,
            canvas,
          })
        : undefined
    );
  }

  registerAsset(id: string, factory: ObjectFactory): this {
    if (this.#assets.has(id)) throw new Error(`Three asset already registered: ${id}`);
    this.#assets.set(id, factory);
    return this;
  }

  async loadObject(id: string, url: string, loader = new ObjectLoader()): Promise<void> {
    const template = await loader.loadAsync(url);
    this.#assetTemplates.push(template);
    this.registerAsset(id, () => cloneOwned(template));
  }

  registerModel(id: string, model: ModelSource, options: ModelOptions = {}): this {
    const template = new Group();
    template.add(model.scene);
    if (options.scale !== undefined) model.scene.scale.setScalar(options.scale);
    if (options.offset) model.scene.position.set(...options.offset);
    if (options.castShadow) {
      model.scene.traverse((child) => {
        if (child instanceof Mesh) child.castShadow = true;
      });
    }
    this.#assetTemplates.push(template);
    // 骨骼安全克隆；几何共享，材质独立（每实例可单独改色而不串染）
    this.registerAsset(id, () => {
      const instance = cloneMaterials(cloneSkeleton(template));
      this.#sharedGeometry.add(instance);
      return instance;
    });
    this.#modelClips.set(id, [...(model.animations ?? [])]);
    return this;
  }

  async loadModel(id: string, url: string, options: ModelOptions = {}, loader = new GLTFLoader()): Promise<void> {
    const gltf = await loader.loadAsync(url);
    this.registerModel(id, { scene: gltf.scene, animations: gltf.animations }, options);
  }

  animations(asset: string): readonly string[] {
    return (this.#modelClips.get(asset) ?? []).map((clip) => clip.name);
  }

  registerMaterial(id: string, material: Material): this {
    if (this.#materials.has(id)) throw new Error(`Three material already registered: ${id}`);
    this.#materials.set(id, material);
    return this;
  }

  attach(entity: EntityId, object: Object3D, managed = false): void {
    this.detach(entity);
    this.#objects.set(entity, object);
    if (managed) this.#managed.add(entity);
    this.scene.add(object);
  }

  object(entity: EntityId): Object3D | undefined {
    return this.#objects.get(entity);
  }

  sync(world: World, dt = 0): void {
    const alive = new Set<EntityId>();
    for (const entity of world.query(Transform, Renderable)) {
      alive.add(entity.id);
      const renderable = entity.get(Renderable);
      const transform = entity.get(Transform);
      if (!renderable || !transform) continue;

      let object = this.#objects.get(entity.id);
      if (!object) {
        const factory = this.#assets.get(renderable.asset);
        if (!factory) throw new Error(`Unknown Three asset: ${renderable.asset}`);
        object = factory();
        this.attach(entity.id, object, true);
        const clips = this.#modelClips.get(renderable.asset);
        if (clips?.length) {
          // mixer 绑内层：root 的变换归 Transform 权威，动画只能动模型内部节点
          const mixer = new AnimationMixer(object.children[0] ?? object);
          this.#animations.set(entity.id, {
            mixer,
            actions: new Map(clips.map((clip) => [clip.name, mixer.clipAction(clip)])),
            current: "",
          });
        }
      }

      const animationState = this.#animations.get(entity.id);
      if (animationState) {
        const animation = entity.get(ModelAnimation);
        if (animation) applyAnimation(animationState, animation);
        animationState.mixer.update(dt);
      }

      if (!entity.has(ManualTransform)) {
        const previous = this.#synced.get(entity.id);
        if (previous && world.development && wasExternallyChanged(object, previous)) {
          throw new Error(`Managed transform was modified outside GameWeave: ${entity.id}`);
        }
        object.position.fromArray(transform.position);
        object.quaternion.fromArray(transform.quaternion);
        object.scale.fromArray(transform.scale);
        object.visible = transform.visible;
        this.#synced.set(entity.id, structuredClone(transform));
      }
    }

    for (const entity of world.query(Transform, DynamicMesh)) {
      alive.add(entity.id);
      const data = entity.get(DynamicMesh);
      const transform = entity.get(Transform);
      if (!data || !transform) continue;

      let object = this.#objects.get(entity.id);
      if (!object) {
        object = new Mesh(new BufferGeometry(), this.#materialOf(data.material));
        this.attach(entity.id, object, true);
        this.#meshVersions.set(entity.id, -1);
      }
      if (this.#meshVersions.get(entity.id) !== data.version) {
        const mesh = object as Mesh;
        mesh.geometry.dispose();
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
        geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
        geometry.setAttribute("uv", new BufferAttribute(data.uvs, 2));
        if (data.colors.length) geometry.setAttribute("color", new BufferAttribute(data.colors, 3));
        geometry.setIndex(new BufferAttribute(data.indices, 1));
        geometry.computeBoundingSphere();
        mesh.geometry = geometry;
        mesh.material = this.#materialOf(data.material);
        this.#meshVersions.set(entity.id, data.version);
      }
      object.position.fromArray(transform.position);
      object.quaternion.fromArray(transform.quaternion);
      object.scale.fromArray(transform.scale);
      object.visible = transform.visible;
    }

    // 只回收 sync 自己创建的对象；手动 attach 的由调用方管理
    for (const id of [...this.#managed]) {
      if (!world.hasEntity(id) || !alive.has(id)) this.detach(id);
    }
  }

  #materialOf(id: string): Material {
    const registered = id ? this.#materials.get(id) : undefined;
    if (id && !registered) throw new Error(`Unknown Three material: ${id}`);
    if (registered) return registered;
    this.#defaultMaterial ??= new MeshStandardMaterial({ color: 0xbdbdbd });
    return this.#defaultMaterial;
  }

  render(): void {
    this.native?.render(this.scene, this.camera);
  }

  detach(entity: EntityId): void {
    const object = this.#objects.get(entity);
    if (!object) return;
    this.#animations.get(entity)?.mixer.stopAllAction();
    this.#animations.delete(entity);
    object.removeFromParent();
    if (this.#managed.has(entity)) {
      if (this.#meshVersions.has(entity)) (object as Mesh).geometry.dispose(); // 动态网格：几何独占，材质共享
      else if (this.#sharedGeometry.has(object)) disposeMaterials(object);
      else disposeObject(object);
    }
    this.#managed.delete(entity);
    this.#synced.delete(entity);
    this.#meshVersions.delete(entity);
    this.#objects.delete(entity);
  }

  dispose(): void {
    for (const id of [...this.#objects.keys()]) this.detach(id);
    for (const template of this.#assetTemplates) disposeObject(template);
    this.#assetTemplates = [];
    this.native?.dispose();
  }
}

function applyAnimation(state: AnimationState, animation: ReturnType<typeof ModelAnimation.defaults>): void {
  if (animation.clip !== state.current) {
    state.actions.get(state.current)?.fadeOut(animation.transition);
    const next = animation.clip ? state.actions.get(animation.clip) : undefined;
    if (next) {
      next.reset().setLoop(animation.loop ? LoopRepeat : LoopOnce, Infinity).fadeIn(animation.transition).play();
      next.clampWhenFinished = !animation.loop;
    }
    state.current = animation.clip;
  }
  const active = state.actions.get(state.current);
  if (active) active.timeScale = animation.speed;
}

function cloneMaterials(root: Object3D): Object3D {
  root.traverse((object) => {
    const candidate = object as Object3D & { material?: { clone(): unknown } | { clone(): unknown }[] };
    if (Array.isArray(candidate.material)) {
      candidate.material = candidate.material.map((material) => material.clone()) as typeof candidate.material;
    } else if (candidate.material) {
      candidate.material = candidate.material.clone() as typeof candidate.material;
    }
  });
  return root;
}

function cloneOwned(template: Object3D): Object3D {
  const clone = template.clone(true);
  clone.traverse((object) => {
    const candidate = object as Object3D & {
      geometry?: { clone(): unknown };
      material?: { clone(): unknown } | { clone(): unknown }[];
    };
    if (candidate.geometry) candidate.geometry = candidate.geometry.clone() as typeof candidate.geometry;
    if (Array.isArray(candidate.material)) {
      candidate.material = candidate.material.map((material) => material.clone()) as typeof candidate.material;
    } else if (candidate.material) {
      candidate.material = candidate.material.clone() as typeof candidate.material;
    }
  });
  return clone;
}

function wasExternallyChanged(object: Object3D, expected: TransformData): boolean {
  return !object.position.toArray().every((value, index) => value === expected.position[index]) ||
    !object.quaternion.toArray().every((value, index) => value === expected.quaternion[index]) ||
    !object.scale.toArray().every((value, index) => value === expected.scale[index]) ||
    object.visible !== expected.visible;
}

export function three(options: ThreeAdapterOptions = {}): GamePlugin & {
  readonly adapter: ThreeAdapter;
} {
  const adapter = new ThreeAdapter(options);
  return {
    ...definePlugin({
      id: "gameweave.three",
      install: (game) => game.provide("renderer", adapter),
      setupWorld: (world) => {
        world.register(Transform).register(Renderable).register(ManualTransform).register(ModelAnimation).register(DynamicMesh);
        world.addSystem({
          name: "three.sync",
          phase: "render",
          run: ({ dt }) => adapter.sync(world, dt),
        });
        world.addSystem({
          name: "three.render",
          phase: "render",
          after: ["three.sync"],
          run: () => adapter.render(),
        });
      },
    }),
    adapter,
  };
}

function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    const candidate = object as Object3D & {
      geometry?: { dispose(): void };
      material?: { dispose(): void } | { dispose(): void }[];
    };
    candidate.geometry?.dispose();
    disposeCandidateMaterials(candidate);
  });
}

function disposeMaterials(root: Object3D): void {
  root.traverse(disposeCandidateMaterials);
}

function disposeCandidateMaterials(object: Object3D): void {
  const candidate = object as Object3D & { material?: { dispose(): void } | { dispose(): void }[] };
  const materials = Array.isArray(candidate.material) ? candidate.material : candidate.material ? [candidate.material] : [];
  for (const material of materials) material.dispose();
}

export { Object3D, PerspectiveCamera, Scene } from "three";
