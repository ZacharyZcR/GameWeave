import { definePlugin, type Game, type SerializedWorld, type World, type WorldSnapshot } from "@gameweave/core";
import type { InputManager, InputRecording } from "@gameweave/character";

export interface FrameCapture {
  readonly tick: number;
  readonly state: WorldSnapshot;
}

export class DebugSession {
  readonly #game: Game;
  #captures: FrameCapture[] = [];

  constructor(game: Game) { this.#game = game; }

  inspect(): WorldSnapshot {
    const world = this.#game.activeWorld;
    if (!world) throw new Error("Cannot inspect without an active world");
    return world.inspect();
  }

  capture(): FrameCapture {
    const state = this.inspect();
    const capture = { tick: state.tick, state };
    this.#captures.push(capture);
    return capture;
  }

  timeline(): readonly FrameCapture[] { return this.#captures; }
  clear(): void { this.#captures = []; }
  step(frames = 1): FrameCapture { this.#game.step(frames); return this.capture(); }

  startInputRecording(): void { this.#input().startRecording(); }
  stopInputRecording(): InputRecording { return this.#input().stopRecording(); }
  playInput(recording: InputRecording): void { this.#input().play(recording); }
  stopInputPlayback(): void { this.#input().stopPlayback(); }

  screenshot(type = "image/png", quality?: number): string {
    const renderer = this.#game.service<{
      native?: { domElement: { toDataURL(type?: string, quality?: number): string } };
    }>("renderer");
    if (!renderer.native) throw new Error("Screenshot requires a canvas renderer");
    return renderer.native.domElement.toDataURL(type, quality);
  }

  #input(): InputManager { return this.#game.service<InputManager>("input"); }
}

export function debug() {
  let session: DebugSession | undefined;
  return {
    ...definePlugin({
      id: "gameweave.debug",
      install: (game) => { session = new DebugSession(game); game.provide("debug", session); },
    }),
    get session() {
      if (!session) throw new Error("Debug plugin is not installed");
      return session;
    },
  };
}

export interface ScenarioContext {
  readonly game: Game;
  readonly world: World;
  step(frames?: number): void;
  snapshot(): SerializedWorld;
}

export async function scenario(
  name: string,
  create: () => { game: Game; world: World },
  run: (context: ScenarioContext) => void | Promise<void>,
): Promise<void> {
  const { game, world } = create();
  try {
    await run({ game, world, step: (frames = 1) => game.step(frames), snapshot: () => world.serialize() });
  } catch (error) {
    throw new Error(`Scenario failed: ${name}`, { cause: error });
  }
}
