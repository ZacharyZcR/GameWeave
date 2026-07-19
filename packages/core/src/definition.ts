import type {
  ComponentData,
  ComponentDefinition,
  ComponentValidator,
} from "./types.js";

export interface DefineComponentOptions<T extends ComponentData> {
  readonly defaults: T | (() => T);
  readonly version?: number;
  readonly runtimeOnly?: boolean;
  readonly validate?: ComponentValidator<T>;
  readonly migrate?: (value: unknown, fromVersion: number) => T;
}

export function defineComponent<T extends ComponentData>(
  id: string,
  options: DefineComponentOptions<T>,
): ComponentDefinition<T> {
  if (!id.trim()) {
    throw new Error("Component id must not be empty");
  }

  const defaults = options.defaults;
  const createDefaults: () => T =
    typeof defaults === "function"
      ? (defaults as () => T)
      : () => structuredClone(defaults);

  const version = options.version ?? 1;
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Component version must be a positive integer");
  }

  return Object.freeze({
    id,
    version,
    runtimeOnly: options.runtimeOnly ?? false,
    defaults: createDefaults,
    ...(options.validate ? { validate: options.validate } : {}),
    ...(options.migrate ? { migrate: options.migrate } : {}),
  });
}
