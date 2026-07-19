import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { prepareTauri } from "./index.js";

it("generates a Tauri 2 project from game metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "gameweave-export-"));
  const directory = await prepareTauri({ name: "Arena", identifier: "dev.gameweave.arena", version: "0.1.0", root, outDir: "dist", window: { fullscreen: true } });
  const config = JSON.parse(await readFile(join(directory, "tauri.conf.json"), "utf8")) as { app: { windows: { fullscreen: boolean }[] } };
  expect(config.app.windows[0]?.fullscreen).toBe(true);
});
