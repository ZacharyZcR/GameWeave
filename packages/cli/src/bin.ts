#!/usr/bin/env node
import { buildGame, exportDesktop, exportWeb, loadGameConfig, prepareDesktop } from "./index.js";

async function main(): Promise<void> {
  const [command, target, option] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") return usage();
  const config = await loadGameConfig();
  if (command === "build") return report("Built", await buildGame(config));
  if (command !== "export") throw new Error(`Unknown command: ${command}`);
  if (target === "web") return report("Exported", await exportWeb(config));
  if (target === "windows" || target === "linux" || target === "macos") {
    if (option === "--prepare") return report("Prepared", await prepareDesktop(config));
    return report("Exported", await exportDesktop(target, config));
  }
  throw new Error("Export target must be web, windows, linux, or macos");
}

function report(action: string, path: string): void { console.log(`${action}: ${path}`); }
function usage(): void { console.log("gameweave build\ngameweave export web\ngameweave export <windows|linux|macos> [--prepare]"); }
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
