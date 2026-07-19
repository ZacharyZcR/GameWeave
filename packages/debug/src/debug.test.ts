import { InputManager, character } from "@gameweave/character";
import { createGame } from "@gameweave/core";
import { expect, it } from "vitest";
import { debug, scenario } from "./index.js";

it("captures world state and records fixed-tick input", () => {
  let x = 0;
  const input = new InputManager().register("test", () => ({ move: [x++, 0], look: [0, 0], jump: false, sprint: false, fire: false }));
  const plugin = debug();
  const game = createGame().use(character(input)).use(plugin);
  game.createWorld("arena");
  plugin.session.startInputRecording();
  game.step(2);
  const recording = plugin.session.stopInputRecording();
  expect(recording.sources.test).toHaveLength(2);
  expect(plugin.session.capture().state.name).toBe("arena");
});

it("wraps deterministic scenario failures with their name", async () => {
  await expect(scenario("broken", () => {
    const game = createGame();
    return { game, world: game.createWorld("test") };
  }, () => { throw new Error("boom"); })).rejects.toThrow("Scenario failed: broken");
});

it("captures a renderer canvas as a data URL", () => {
  const plugin = debug();
  const game = createGame().provide("renderer", { native: { domElement: { toDataURL: () => "data:image/png;base64,test" } } }).use(plugin);
  game.createWorld("arena");
  expect(plugin.session.screenshot()).toBe("data:image/png;base64,test");
});
