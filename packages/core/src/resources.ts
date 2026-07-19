export interface ResourceDefinition<T> {
  readonly id: string;
  readonly create: () => T;
}

export function defineResource<T>(
  id: string,
  create: () => T,
): ResourceDefinition<T> {
  if (!id.trim()) throw new Error("Resource id must not be empty");
  return Object.freeze({ id, create });
}

export class Resources {
  #values = new Map<string, unknown>();

  has<T>(definition: ResourceDefinition<T>): boolean {
    return this.#values.has(definition.id);
  }

  get<T>(definition: ResourceDefinition<T>): T {
    if (!this.#values.has(definition.id)) {
      this.#values.set(definition.id, definition.create());
    }
    return this.#values.get(definition.id) as T;
  }

  set<T>(definition: ResourceDefinition<T>, value: T): void {
    this.#values.set(definition.id, value);
  }

  delete<T>(definition: ResourceDefinition<T>): boolean {
    return this.#values.delete(definition.id);
  }
}
