import { Entity } from "./entity.js";
import { EventBus } from "./events.js";
import { instantiatePrefab, isPrefab } from "./prefab.js";
import { Query } from "./query.js";
import { SeededRandom } from "./random.js";
import { Resources } from "./resources.js";
import { Scheduler } from "./scheduler.js";
import { orderSystems } from "./system.js";
import { systemPhases } from "./types.js";
import type {
  ComponentData,
  ComponentDefinition,
  ComponentInput,
  EntityId,
  SpawnOptions,
  SerializedWorld,
  SystemDefinition,
  SystemFactory,
  SystemPhase,
  WorldInspectOptions,
  WorldLoadOptions,
  WorldSnapshot,
} from "./types.js";
import type { PrefabDefinition } from "./prefab.js";

interface EntityRecord {
  readonly id: EntityId;
  name?: string;
  readonly components: Map<string, ComponentData>;
}

type Command = () => void;

export interface WorldOptions {
  readonly seed?: string | number;
  readonly development?: boolean;
  readonly services?: ReadonlyMap<string, unknown>;
}

export class World {
  readonly name: string;
  readonly random: SeededRandom;
  readonly development: boolean;
  readonly events = new EventBus();
  readonly resources = new Resources();
  readonly scheduler = new Scheduler();
  readonly services: ReadonlyMap<string, unknown>;

  #tick = 0;
  #nextEntityId = 1;
  #entities = new Map<EntityId, EntityRecord>();
  #pendingEntities = new Map<EntityId, EntityRecord>();
  #pendingComponents = new Map<EntityId, Map<string, ComponentData>>();
  #systemsDirty = false;
  #unknownComponents = new Map<EntityId, Record<string, import("./types.js").SerializedComponent>>();
  #definitions = new Map<string, ComponentDefinition<ComponentData>>();
  #systems: SystemDefinition[] = [];
  #systemDurations = new Map<string, number>();
  #orderedSystems = orderSystems([]);
  #runningSystem = false;
  #commands: Command[] = [];

  constructor(name: string, options: WorldOptions = {}) {
    if (!name.trim()) throw new Error("World name must not be empty");
    this.name = name;
    this.random = new SeededRandom(options.seed ?? name);
    this.development = options.development ?? true;
    this.services = options.services ?? new Map();
  }

  service<T>(id: string): T {
    if (!this.services.has(id)) throw new Error(`Unknown world service: ${id}`);
    return this.services.get(id) as T;
  }

  get tick(): number {
    return this.#tick;
  }

  register<T extends ComponentData>(definition: ComponentDefinition<T>): this {
    const existing = this.#definitions.get(definition.id);
    if (existing && existing !== definition) {
      throw new Error(`Component id already registered: ${definition.id}`);
    }
    this.#definitions.set(
      definition.id,
      definition as ComponentDefinition<ComponentData>,
    );
    return this;
  }

  addSystem(system: SystemDefinition | SystemFactory): this {
    const definition: SystemDefinition = "setup" in system
      ? {
          name: system.name,
          phase: system.phase,
          ...(system.after ? { after: system.after } : {}),
          ...(system.before ? { before: system.before } : {}),
          ...(system.optionalAfter ? { optionalAfter: system.optionalAfter } : {}),
          ...(system.optionalBefore ? { optionalBefore: system.optionalBefore } : {}),
          run: system.setup(this),
        }
      : system;
    const systems = [...this.#systems, definition];
    const orderedSystems = orderSystems(systems, false);
    this.#systems = systems;
    this.#orderedSystems = orderedSystems;
    this.#systemsDirty = true;
    return this;
  }

  spawn(options?: SpawnOptions): Entity;
  spawn(prefab: PrefabDefinition, overrides?: SpawnOptions): Entity;
  spawn(
    optionsOrPrefab: SpawnOptions | PrefabDefinition = {},
    overrides: SpawnOptions = {},
  ): Entity {
    const options = isPrefab(optionsOrPrefab)
      ? instantiatePrefab(optionsOrPrefab, overrides)
      : optionsOrPrefab;
    if (options.id === undefined) {
      while (this.hasEntity(`${this.name}:${this.#nextEntityId}`)) this.#nextEntityId += 1;
    }
    const id = options.id ?? `${this.name}:${this.#nextEntityId++}`;
    if (this.hasEntity(id)) throw new Error(`Duplicate entity id: ${id}`);

    const record: EntityRecord = {
      id,
      components: new Map(),
      ...(options.name ? { name: options.name } : {}),
    };

    for (const [componentId, input] of Object.entries(options.components ?? {})) {
      const definition = this.#requireDefinition(componentId);
      record.components.set(componentId, this.#createValue(definition, input));
    }

    this.#pendingEntities.set(id, record);
    this.#enqueue(() => {
      const pending = this.#pendingEntities.get(id);
      if (!pending) return;
      this.#pendingEntities.delete(id);
      this.#entities.set(id, pending);
    });
    return new Entity(this, id);
  }

  despawn(entity: Entity | EntityId): void {
    const id = typeof entity === "string" ? entity : entity.id;
    this.#assertAlive(id);
    if (this.#pendingEntities.delete(id)) return;
    this.#enqueue(() => {
      this.#entities.delete(id);
      this.#unknownComponents.delete(id);
      this.#pendingComponents.delete(id);
    });
  }

  entity(id: EntityId): Entity {
    this.#assertAlive(id);
    return new Entity(this, id);
  }

  hasEntity(id: EntityId): boolean {
    return this.#entities.has(id) || this.#pendingEntities.has(id);
  }

  hasComponent<T extends ComponentData>(
    id: EntityId,
    definition: ComponentDefinition<T>,
  ): boolean {
    return this.#componentOf(id, definition.id) !== undefined;
  }

  getComponent<T extends ComponentData>(
    id: EntityId,
    definition: ComponentDefinition<T>,
  ): T | undefined {
    return this.#componentOf(id, definition.id) as T | undefined;
  }

  getComponentById(id: EntityId, componentId: string): ComponentData | undefined {
    return this.#componentOf(id, componentId);
  }

  setComponent<T extends ComponentData>(
    id: EntityId,
    definition: ComponentDefinition<T>,
    input: ComponentInput<ComponentDefinition<T>>,
  ): void {
    this.#assertAlive(id);
    this.register(definition);
    const committed = this.#entities.get(id);
    if (committed && !committed.components.has(definition.id)) {
      // 已提交实体的新组件：数据立即可读，query 在阶段边界后可见
      const staged = this.#pendingComponents.get(id) ?? new Map<string, ComponentData>();
      staged.set(definition.id, this.#createValue(definition, {
        ...staged.get(definition.id),
        ...input,
      }));
      this.#pendingComponents.set(id, staged);
      this.#enqueue(() => {
        const value = this.#pendingComponents.get(id)?.get(definition.id);
        if (value === undefined) return;
        this.#entities.get(id)?.components.set(definition.id, value);
        this.#discardStaged(id, definition.id);
      });
      return;
    }
    const record = committed ?? this.#pendingEntities.get(id);
    record?.components.set(definition.id, this.#createValue(definition, {
      ...record.components.get(definition.id),
      ...input,
    }));
  }

  removeComponent(
    id: EntityId,
    definition: ComponentDefinition<ComponentData>,
  ): void {
    this.#assertAlive(id);
    const pending = this.#pendingEntities.get(id);
    if (pending) {
      pending.components.delete(definition.id);
      return;
    }
    this.#discardStaged(id, definition.id);
    this.#enqueue(() => this.#entities.get(id)?.components.delete(definition.id));
  }

  query(
    ...definitions: readonly ComponentDefinition<ComponentData>[]
  ): Query {
    for (const definition of definitions) this.register(definition);
    return new Query(this, definitions);
  }

  matchingEntityIds(
    definitions: readonly ComponentDefinition<ComponentData>[],
  ): readonly EntityId[] {
    return [...this.#entities.values()]
      .filter((record) =>
        definitions.every((definition) => record.components.has(definition.id)),
      )
      .map((record) => record.id);
  }

  runPhase(phase: SystemPhase, dt: number, tick = this.#tick): void {
    if (this.#systemsDirty) {
      this.#orderedSystems = orderSystems(this.#systems);
      this.#systemsDirty = false;
    }
    this.#tick = tick;
    this.#runningSystem = true;
    try {
      for (const system of this.#orderedSystems.get(phase) ?? []) {
        const start = performance.now();
        try {
          system.run({ dt, tick, phase });
        } finally {
          this.#systemDurations.set(system.name, performance.now() - start);
        }
      }
      if (phase === "fixedUpdate") this.scheduler.advance(dt);
    } finally {
      this.#runningSystem = false;
      this.flushCommands();
    }
  }

  runFrame(dt: number, fixedTick?: number): void {
    for (const phase of systemPhases) {
      if (phase === "fixedUpdate" && fixedTick === undefined) continue;
      this.runPhase(phase, dt, fixedTick ?? this.#tick);
    }
  }

  flushCommands(): void {
    const commands = this.#commands;
    this.#commands = [];
    for (const command of commands) command();
  }

  inspect(options: WorldInspectOptions = {}): WorldSnapshot {
    const includeComponents = options.includeComponents ?? true;
    return {
      name: this.name,
      tick: this.#tick,
      entities: [...this.#entities.values()]
        .filter((record) => (options.with ?? []).every((definition) => record.components.has(definition.id)))
        .map((record) => ({
        id: record.id,
        ...(record.name ? { name: record.name } : {}),
        components: includeComponents
          ? Object.fromEntries(
              [
                ...[...record.components].map(([id, value]) => [id, structuredClone(value)] as const),
                ...Object.entries(this.#unknownComponents.get(record.id) ?? {}).map(([id, entry]) => [id, structuredClone(entry.data)] as const),
              ].map(([id, value]) => [
                id,
                value,
              ]),
            )
          : Object.fromEntries([...record.components.keys()].map((id) => [id, true])),
      })),
      systems: systemPhases.flatMap((phase) =>
        (this.#orderedSystems.get(phase) ?? []).map((system) => ({
          name: system.name,
          phase,
          durationMs: this.#systemDurations.get(system.name) ?? 0,
        })),
      ),
    };
  }

  serialize(): SerializedWorld {
    return {
      $schema: "https://gameweave.dev/schema/world-0.1.json",
      version: 1,
      name: this.name,
      tick: this.#tick,
      entities: [...this.#entities.values()].map((record) => ({
        id: record.id,
        ...(record.name ? { name: record.name } : {}),
        components: {
          ...this.#unknownComponents.get(record.id),
          ...Object.fromEntries(
          [...record.components].filter(([id]) => !this.#requireDefinition(id).runtimeOnly).map(([id, data]) => {
            const definition = this.#requireDefinition(id);
            return [id, { version: definition.version, data: structuredClone(data) }];
          }),
        )},
      })),
    };
  }

  load(snapshot: SerializedWorld, options: WorldLoadOptions = {}): void {
    if (snapshot.version !== 1) {
      throw new Error(`Unsupported world version: ${String(snapshot.version)}`);
    }
    if (this.#runningSystem) throw new Error("Cannot load a world during a system phase");

    const entities = new Map<EntityId, EntityRecord>();
    const unknownComponents = new Map<EntityId, Record<string, import("./types.js").SerializedComponent>>();
    for (const serialized of snapshot.entities) {
      if (entities.has(serialized.id)) {
        throw new Error(`Duplicate serialized entity id: ${serialized.id}`);
      }
      const components = new Map<string, ComponentData>();
      for (const [id, entry] of Object.entries(serialized.components)) {
        const definition = this.#definitions.get(id);
        if (!definition) {
          if (options.unknownComponents !== "preserve") throw new Error(`Component is not registered: ${id}`);
          const entries = unknownComponents.get(serialized.id) ?? {};
          entries[id] = structuredClone(entry);
          unknownComponents.set(serialized.id, entries);
          continue;
        }
        const data = entry.version === definition.version
          ? entry.data
          : definition.migrate?.(entry.data, entry.version);
        if (!data) {
          throw new Error(
            `Component ${id} requires migration from ${entry.version} to ${definition.version}`,
          );
        }
        components.set(id, this.#createValue(definition, data));
      }
      entities.set(serialized.id, {
        id: serialized.id,
        components,
        ...(serialized.name ? { name: serialized.name } : {}),
      });
    }
    this.#entities = entities;
    this.#unknownComponents = unknownComponents;
    this.#pendingEntities.clear();
    this.#pendingComponents.clear();
    this.#commands = [];
    this.#tick = snapshot.tick;
  }

  #enqueue(command: Command): void {
    if (this.#runningSystem) {
      this.#commands.push(command);
      return;
    }
    command();
  }

  #assertAlive(id: EntityId): void {
    if (!this.hasEntity(id)) {
      throw new Error(`Entity is not alive: ${id}`);
    }
  }

  #componentOf(id: EntityId, componentId: string): ComponentData | undefined {
    const record = this.#entities.get(id) ?? this.#pendingEntities.get(id);
    return record?.components.get(componentId) ?? this.#pendingComponents.get(id)?.get(componentId);
  }

  #discardStaged(id: EntityId, componentId: string): void {
    const staged = this.#pendingComponents.get(id);
    if (!staged) return;
    staged.delete(componentId);
    if (staged.size === 0) this.#pendingComponents.delete(id);
  }

  #requireDefinition(id: string): ComponentDefinition<ComponentData> {
    const definition = this.#definitions.get(id);
    if (!definition) throw new Error(`Component is not registered: ${id}`);
    return definition;
  }

  #createValue<T extends ComponentData>(
    definition: ComponentDefinition<T>,
    input: Partial<T>,
  ): T {
    const value = { ...definition.defaults(), ...structuredClone(input) } as T;
    if (definition.validate && !definition.validate(value)) {
      throw new Error(`Invalid component data: ${definition.id}`);
    }
    return value;
  }
}
