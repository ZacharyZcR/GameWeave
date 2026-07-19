export type EntityId = string;

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ComponentData = Record<string, unknown>;

export type ComponentValidator<T extends ComponentData> = (
  value: unknown,
) => value is T;

export interface ComponentDefinition<T extends ComponentData> {
  readonly id: string;
  readonly version: number;
  readonly runtimeOnly: boolean;
  readonly defaults: () => T;
  readonly validate?: ComponentValidator<T>;
  readonly migrate?: (value: unknown, fromVersion: number) => T;
}

export type ComponentValue<D> = D extends ComponentDefinition<infer T>
  ? T
  : never;

export type ComponentInput<D> = D extends ComponentDefinition<infer T>
  ? Partial<T>
  : never;

export type ComponentInputs = Readonly<Record<string, ComponentData>>;

export interface SpawnOptions {
  readonly id?: EntityId;
  readonly name?: string;
  readonly components?: ComponentInputs;
}

export interface SerializedComponent {
  readonly version: number;
  readonly data: ComponentData;
}

export interface SerializedEntity {
  readonly id: EntityId;
  readonly name?: string;
  readonly components: Readonly<Record<string, SerializedComponent>>;
}

export interface SerializedWorld {
  readonly $schema: "https://gameweave.dev/schema/world-0.1.json";
  readonly version: 1;
  readonly name: string;
  readonly tick: number;
  readonly entities: readonly SerializedEntity[];
}

export interface WorldLoadOptions {
  readonly unknownComponents?: "error" | "preserve";
}

export const systemPhases = [
  "input",
  "preUpdate",
  "fixedUpdate",
  "update",
  "lateUpdate",
  "render",
  "postRender",
] as const;

export type SystemPhase = (typeof systemPhases)[number];

export interface SystemContext {
  readonly dt: number;
  readonly tick: number;
  readonly phase: SystemPhase;
}

export interface SystemDefinition {
  readonly name: string;
  readonly phase: SystemPhase;
  readonly after?: readonly string[];
  readonly before?: readonly string[];
  readonly optionalAfter?: readonly string[];
  readonly optionalBefore?: readonly string[];
  readonly run: (context: SystemContext) => void;
}

export interface SystemFactory {
  readonly name: string;
  readonly phase: SystemPhase;
  readonly after?: readonly string[];
  readonly before?: readonly string[];
  readonly optionalAfter?: readonly string[];
  readonly optionalBefore?: readonly string[];
  readonly setup: (world: import("./world.js").World) => (context: SystemContext) => void;
}

export interface WorldInspectOptions {
  readonly includeComponents?: boolean;
  readonly with?: readonly ComponentDefinition<ComponentData>[];
}

export interface InspectedEntity {
  readonly id: EntityId;
  readonly name?: string;
  readonly components: Readonly<Record<string, unknown>>;
}

export interface WorldSnapshot {
  readonly name: string;
  readonly tick: number;
  readonly entities: readonly InspectedEntity[];
  readonly systems: readonly {
    name: string;
    phase: SystemPhase;
    durationMs: number;
  }[];
}
