import { createGame } from "@gameweave/core";
import { describe, expect, it } from "vitest";
import { audio, NullAudioAdapter, WebAudioAdapter, type AudioAdapter } from "./index.js";

describe("audio", () => {
  it("provides the adapter as a game service", () => {
    const adapter = new NullAudioAdapter();
    const game = createGame().use(audio(adapter));
    expect(game.service<AudioAdapter>("audio")).toBe(adapter);
  });

  it("records registration and playback on the null adapter", () => {
    const adapter = new NullAudioAdapter();
    adapter.register("shot", { synth: () => ({} as AudioBuffer) });
    adapter.play("shot", { volume: .5, position: [1, 2, 3] });
    expect(adapter.played).toEqual([{ id: "shot", options: { volume: .5, position: [1, 2, 3] } }]);
    expect(() => adapter.play("missing")).toThrow("Unknown sound");
    expect(() => adapter.register("shot", { url: "x" })).toThrow("already registered");
  });

  it("constructs the WebAudio adapter without touching AudioContext", () => {
    // node 环境没有 AudioContext；构造和注册必须是惰性的
    const adapter = new WebAudioAdapter();
    adapter.register("shot", { synth: () => ({} as AudioBuffer) });
    expect(() => adapter.register("shot", { url: "x" })).toThrow("already registered");
  });
});
