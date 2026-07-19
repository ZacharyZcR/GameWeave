import type { Game } from "./game.js";
import type { World } from "./world.js";

export interface GamePlugin {
  readonly id: string;
  readonly install?: (game: Game) => void;
  readonly setupWorld?: (world: World) => void;
}

export function definePlugin(plugin: GamePlugin): GamePlugin {
  if (!plugin.id.trim()) throw new Error("Plugin id must not be empty");
  return Object.freeze(plugin);
}
