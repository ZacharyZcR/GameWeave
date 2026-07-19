import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type DesktopTarget = "windows" | "linux" | "macos";

export interface TauriExportConfig {
  readonly name: string;
  readonly identifier: string;
  readonly version: string;
  readonly root: string;
  readonly outDir: string;
  readonly window?: {
    readonly width?: number;
    readonly height?: number;
    readonly fullscreen?: boolean;
    readonly resizable?: boolean;
  };
}

export async function prepareTauri(config: TauriExportConfig): Promise<string> {
  const tauriDir = resolve(config.root, "src-tauri");
  await mkdir(resolve(tauriDir, "src"), { recursive: true });
  await writeFile(resolve(tauriDir, "Cargo.toml"), cargoToml(config));
  await writeFile(resolve(tauriDir, "build.rs"), "fn main() { tauri_build::build() }\n");
  await writeFile(resolve(tauriDir, "src", "main.rs"), "fn main() { gameweave_desktop::run() }\n");
  await writeFile(resolve(tauriDir, "src", "lib.rs"), "#[cfg_attr(mobile, tauri::mobile_entry_point)]\npub fn run() { tauri::Builder::default().run(tauri::generate_context!()).expect(\"failed to run GameWeave game\"); }\n");
  await writeFile(resolve(tauriDir, "tauri.conf.json"), `${JSON.stringify(tauriConfig(config), null, 2)}\n`);
  return tauriDir;
}

export async function exportTauri(target: DesktopTarget, config: TauriExportConfig): Promise<string> {
  assertHost(target);
  const tauriDir = await prepareTauri(config);
  const cli = fileURLToPath(import.meta.resolve("@tauri-apps/cli/tauri.js"));
  await run(process.execPath, [cli, "build"], config.root);
  return resolve(tauriDir, "target", "release", "bundle");
}

function tauriConfig(config: TauriExportConfig) {
  const window = config.window ?? {};
  return {
    "$schema": "https://schema.tauri.app/config/2",
    productName: config.name,
    version: config.version,
    identifier: config.identifier,
    build: { frontendDist: `../${config.outDir}` },
    app: { windows: [{ title: config.name, width: window.width ?? 1280, height: window.height ?? 720, fullscreen: window.fullscreen ?? false, resizable: window.resizable ?? true }] },
    bundle: { active: true, targets: "all" },
  };
}

function cargoToml(config: TauriExportConfig): string {
  const crate = config.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "gameweave_game";
  return `[package]\nname = "${crate}"\nversion = "${config.version}"\nedition = "2021"\n\n[lib]\nname = "gameweave_desktop"\ncrate-type = ["staticlib", "cdylib", "rlib"]\n\n[build-dependencies]\ntauri-build = { version = "2", features = [] }\n\n[dependencies]\ntauri = { version = "2", features = [] }\n`;
}

function assertHost(target: DesktopTarget): void {
  const host: Record<DesktopTarget, NodeJS.Platform> = { windows: "win32", linux: "linux", macos: "darwin" };
  if (process.platform !== host[target]) throw new Error(`${target} exports must be built on a ${target} runner`);
}

function run(command: string, args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Tauri exited with code ${code ?? "unknown"}`)));
  });
}
