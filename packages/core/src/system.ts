import { systemPhases } from "./types.js";
import type { SystemDefinition, SystemFactory, SystemPhase } from "./types.js";

export function defineSystem(system: SystemFactory): SystemFactory {
  if (!system.name.trim()) throw new Error("System name must not be empty");
  return Object.freeze(system);
}

export function orderSystems(
  systems: readonly SystemDefinition[],
  strict = true,
): Map<SystemPhase, readonly SystemDefinition[]> {
  const byName = new Map<string, SystemDefinition>();

  for (const system of systems) {
    if (byName.has(system.name)) {
      throw new Error(`Duplicate system: ${system.name}`);
    }
    byName.set(system.name, system);
  }

  const result = new Map<SystemPhase, readonly SystemDefinition[]>();

  for (const phase of systemPhases) {
    const phaseSystems = systems.filter((system) => system.phase === phase);
    result.set(phase, topologicalSort(phaseSystems, byName, strict));
  }

  return result;
}

function topologicalSort(
  systems: readonly SystemDefinition[],
  allSystems: ReadonlyMap<string, SystemDefinition>,
  strict: boolean,
): readonly SystemDefinition[] {
  const local = new Map(systems.map((system) => [system.name, system]));
  const edges = new Map<string, Set<string>>(
    systems.map((system) => [system.name, new Set<string>()]),
  );
  const indegree = new Map(systems.map((system) => [system.name, 0]));

  const addEdge = (from: string, to: string): void => {
    if (!local.has(from) || !local.has(to)) {
      const external = allSystems.get(local.has(from) ? to : from);
      if (external && external.phase !== local.get(local.has(from) ? from : to)?.phase) {
        throw new Error(`System dependency cannot cross phases: ${from} -> ${to}`);
      }
      if (!external && strict) {
        throw new Error(`Unknown system dependency: ${from} -> ${to}`);
      }
      return;
    }

    const targets = edges.get(from) as Set<string>;
    if (targets.has(to)) return;
    targets.add(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  };

  for (const system of systems) {
    for (const dependency of system.after ?? []) {
      addEdge(dependency, system.name);
    }
    for (const dependency of system.before ?? []) {
      addEdge(system.name, dependency);
    }
    for (const dependency of system.optionalAfter ?? []) {
      if (allSystems.has(dependency)) addEdge(dependency, system.name);
    }
    for (const dependency of system.optionalBefore ?? []) {
      if (allSystems.has(dependency)) addEdge(system.name, dependency);
    }
  }

  const ready = systems
    .filter((system) => indegree.get(system.name) === 0)
    .map((system) => system.name)
    .sort();
  const ordered: SystemDefinition[] = [];

  while (ready.length > 0) {
    const name = ready.shift() as string;
    ordered.push(local.get(name) as SystemDefinition);

    for (const target of [...(edges.get(name) ?? [])].sort()) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }

  if (ordered.length !== systems.length) {
    const cycle = systems
      .map((system) => system.name)
      .filter((name) => !ordered.some((system) => system.name === name));
    throw new Error(`System dependency cycle: ${cycle.join(", ")}`);
  }

  return ordered;
}
