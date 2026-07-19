import type { ComponentInputs, SpawnOptions } from "./types.js";

export interface PrefabDefinition {
  readonly kind: "gameweave.prefab";
  readonly id: string;
  readonly name?: string;
  readonly components: ComponentInputs;
}

export function definePrefab(
  id: string,
  options: Omit<SpawnOptions, "id">,
): PrefabDefinition {
  if (!id.trim()) throw new Error("Prefab id must not be empty");
  return Object.freeze({
    kind: "gameweave.prefab" as const,
    id,
    ...(options.name ? { name: options.name } : {}),
    components: structuredClone(options.components ?? {}),
  });
}

export function isPrefab(value: SpawnOptions | PrefabDefinition): value is PrefabDefinition {
  return "kind" in value && value.kind === "gameweave.prefab";
}

export function instantiatePrefab(
  prefab: PrefabDefinition,
  overrides: SpawnOptions = {},
): SpawnOptions {
  const componentIds = new Set([
    ...Object.keys(prefab.components),
    ...Object.keys(overrides.components ?? {}),
  ]);
  const components = Object.fromEntries(
    [...componentIds].map((id) => [
      id,
      {
        ...(prefab.components[id] ?? {}),
        ...(overrides.components?.[id] ?? {}),
      },
    ]),
  );
  return {
    ...overrides,
    ...((overrides.name ?? prefab.name)
      ? { name: overrides.name ?? prefab.name }
      : {}),
    components,
  };
}
