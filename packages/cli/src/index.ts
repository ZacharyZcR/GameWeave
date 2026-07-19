import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { zipSync } from "fflate";
import { createJiti } from "jiti";
import { build as viteBuild } from "vite";
import { exportTauri, prepareTauri, type DesktopTarget } from "@gameweave/export-tauri";

export interface GameWeaveConfig {
  readonly name: string;
  readonly identifier: string;
  readonly version: string;
  readonly root?: string;
  readonly outDir?: string;
  readonly window?: {
    readonly width?: number;
    readonly height?: number;
    readonly fullscreen?: boolean;
    readonly resizable?: boolean;
  };
}

export interface GameManifest {
  readonly format: 1;
  readonly name: string;
  readonly identifier: string;
  readonly version: string;
  readonly builtAt: string;
}

export function defineGame(config: GameWeaveConfig): GameWeaveConfig { return config; }

export async function loadGameConfig(cwd = process.cwd()): Promise<GameWeaveConfig> {
  const configPath = await findConfig(cwd);
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const config = await jiti.import<GameWeaveConfig>(configPath, { default: true });
  validateConfig(config);
  return config;
}

export async function buildGame(config: GameWeaveConfig, cwd = process.cwd()): Promise<string> {
  validateConfig(config);
  const root = resolve(cwd, config.root ?? ".");
  const outDir = resolve(root, config.outDir ?? "dist");
  await viteBuild({ root, build: { outDir, emptyOutDir: true } });
  const manifest: GameManifest = { format: 1, name: config.name, identifier: config.identifier, version: config.version, builtAt: new Date().toISOString() };
  await writeFile(resolve(outDir, "gameweave.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return outDir;
}

export async function exportWeb(config: GameWeaveConfig, cwd = process.cwd()): Promise<string> {
  const outDir = await buildGame(config, cwd);
  const target = resolve(cwd, `${slug(config.name)}-${config.version}-web.zip`);
  await writeFile(target, zipSync(await collectFiles(outDir), { level: 9 }));
  return target;
}

export async function prepareDesktop(config: GameWeaveConfig, cwd = process.cwd()): Promise<string> {
  const root = resolve(cwd, config.root ?? ".");
  return prepareTauri({ ...config, root, outDir: config.outDir ?? "dist" });
}

export async function exportDesktop(target: DesktopTarget, config: GameWeaveConfig, cwd = process.cwd()): Promise<string> {
  const root = resolve(cwd, config.root ?? ".");
  await buildGame(config, cwd);
  return exportTauri(target, { ...config, root, outDir: config.outDir ?? "dist" });
}

async function findConfig(cwd: string): Promise<string> {
  for (const name of ["gameweave.config.ts", "gameweave.config.mts", "gameweave.config.js", "gameweave.config.mjs"]) {
    const path = resolve(cwd, name);
    try { if ((await stat(path)).isFile()) return path; } catch { /* try next name */ }
  }
  throw new Error("No gameweave.config.ts found in the project root");
}

function validateConfig(config: GameWeaveConfig): void {
  for (const key of ["name", "identifier", "version"] as const) if (!config?.[key]?.trim()) throw new Error(`GameWeave config requires ${key}`);
  if (!/^[A-Za-z0-9.-]+$/.test(config.identifier)) throw new Error("identifier must use reverse-domain characters");
}

async function collectFiles(root: string): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {};
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result[relative(root, path).split(sep).join("/")] = new Uint8Array(await readFile(path));
    }
  }
  await visit(root);
  return result;
}

function slug(value: string): string { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "game"; }
