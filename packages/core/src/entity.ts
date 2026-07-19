import type {
  ComponentData,
  ComponentDefinition,
  ComponentInput,
  ComponentValue,
  EntityId,
} from "./types.js";
import type { World } from "./world.js";

export class Entity {
  readonly id: EntityId;
  readonly #world: World;

  constructor(world: World, id: EntityId) {
    this.#world = world;
    this.id = id;
  }

  isAlive(): boolean {
    return this.#world.hasEntity(this.id);
  }

  componentById(id: string): ComponentData | undefined {
    return this.#world.getComponentById(this.id, id);
  }

  has<T extends ComponentData>(definition: ComponentDefinition<T>): boolean {
    return this.#world.hasComponent(this.id, definition);
  }

  get<D extends ComponentDefinition<ComponentData>>(
    definition: D,
  ): ComponentValue<D> | undefined {
    return this.#world.getComponent(this.id, definition) as
      | ComponentValue<D>
      | undefined;
  }

  set<D extends ComponentDefinition<ComponentData>>(
    definition: D,
    value: ComponentInput<D>,
  ): this {
    this.#world.setComponent(this.id, definition, value);
    return this;
  }

  remove(definition: ComponentDefinition<ComponentData>): this {
    this.#world.removeComponent(this.id, definition);
    return this;
  }

  despawn(): void {
    this.#world.despawn(this.id);
  }
}
