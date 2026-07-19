import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defineGame, loadGameConfig, prepareDesktop } from "./index.js";

describe("GameWeave CLI", () => {
  it("loads a typed project config", async () => {
    const root = await mkdtemp(join(tmpdir(), "gameweave-cli-"));
    await writeFile(join(root, "gameweave.config.ts"), "export default { name: 'Test', identifier: 'dev.gameweave.test', version: '0.1.0' }");
    expect(await loadGameConfig(root)).toMatchObject({ name: "Test", version: "0.1.0" });
  });
  it("prepares a Tauri desktop project", async () => {
    const root = await mkdtemp(join(tmpdir(), "gameweave-tauri-"));
    const config = defineGame({ name: "Steel Front", identifier: "dev.gameweave.steelfront", version: "0.1.0" });
    const path = await prepareDesktop(config, root);
    const tauri = JSON.parse(await readFile(join(path, "tauri.conf.json"), "utf8")) as { productName: string };
    expect(tauri.productName).toBe("Steel Front");
  });
});
