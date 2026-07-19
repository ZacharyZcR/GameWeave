import {
  defineComponent,
  definePlugin,
  type EntityId,
  type GamePlugin,
  type World,
} from "@gameweave/core";
import {
  Object3D,
  ObjectLoader,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type WebGLRendererParameters,
} from "three";

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
  #objects = new Map<EntityId, Object3D>();
  #managed = new Set<EntityId>();
  #synced = new Map<EntityId, TransformData>();

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

  attach(entity: EntityId, object: Object3D, managed = false): void {
    this.detach(entity);
    this.#objects.set(entity, object);
    if (managed) this.#managed.add(entity);
    this.scene.add(object);
  }

  object(entity: EntityId): Object3D | undefined {
    return this.#objects.get(entity);
  }

  sync(world: World): void {
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

    for (const id of [...this.#objects.keys()]) {
      if (!world.hasEntity(id) || !alive.has(id)) this.detach(id);
    }
  }

  render(): void {
    this.native?.render(this.scene, this.camera);
  }

  detach(entity: EntityId): void {
    const object = this.#objects.get(entity);
    if (!object) return;
    object.removeFromParent();
    if (this.#managed.has(entity)) disposeObject(object);
    this.#managed.delete(entity);
    this.#synced.delete(entity);
    this.#objects.delete(entity);
  }

  dispose(): void {
    for (const id of [...this.#objects.keys()]) this.detach(id);
    for (const template of this.#assetTemplates) disposeObject(template);
    this.#assetTemplates = [];
    this.native?.dispose();
  }
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
        world.register(Transform).register(Renderable).register(ManualTransform);
        world.addSystem({
          name: "three.sync",
          phase: "render",
          run: () => adapter.sync(world),
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
    const materials = Array.isArray(candidate.material)
      ? candidate.material
      : candidate.material ? [candidate.material] : [];
    for (const material of materials) material.dispose();
  });
}

export { Object3D, PerspectiveCamera, Scene } from "three";
