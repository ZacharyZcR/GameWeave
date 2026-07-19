import type { Entity } from "./entity.js";
import type { ComponentDefinition, ComponentData, EntityId } from "./types.js";
import type { World } from "./world.js";

export class Query implements Iterable<Entity> {
  readonly #world: World;
  readonly #definitions: readonly ComponentDefinition<ComponentData>[];

  constructor(
    world: World,
    definitions: readonly ComponentDefinition<ComponentData>[],
  ) {
    this.#world = world;
    this.#definitions = definitions;
  }

  snapshot(): readonly Entity[] {
    return this.#world
      .matchingEntityIds(this.#definitions)
      .map((id: EntityId) => this.#world.entity(id));
  }

  where(conditions: Readonly<Record<string, unknown>>): readonly Entity[] {
    return this.snapshot().filter((entity) => matches(entity, conditions));
  }

  [Symbol.iterator](): Iterator<Entity> {
    return this.snapshot()[Symbol.iterator]();
  }
}

function matches(entity: Entity, conditions: Readonly<Record<string, unknown>>): boolean {
  for (const [componentId, expected] of Object.entries(conditions)) {
    const value = entity.componentById(componentId);
    if (!matchValue(value, expected)) return false;
  }
  return true;
}

function matchValue(actual: unknown, expected: unknown): boolean {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    for (const [key, value] of Object.entries(expected)) {
      if (key === "$gt") { if (!(typeof actual === "number" && actual > Number(value))) return false; continue; }
      if (key === "$gte") { if (!(typeof actual === "number" && actual >= Number(value))) return false; continue; }
      if (key === "$lt") { if (!(typeof actual === "number" && actual < Number(value))) return false; continue; }
      if (key === "$lte") { if (!(typeof actual === "number" && actual <= Number(value))) return false; continue; }
      if (key === "$ne") { if (Object.is(actual, value)) return false; continue; }
      if (!actual || typeof actual !== "object") return false;
      if (!matchValue((actual as Record<string, unknown>)[key], value)) return false;
    }
    return true;
  }
  return Object.is(actual, expected);
}
