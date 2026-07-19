import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const mode = process.argv[2] ?? "--dry-run";
if (mode !== "--dry-run" && mode !== "--publish") throw new Error("Use --dry-run or --publish");

const root = resolve(import.meta.dirname, "..");
const packageRoot = resolve(root, "packages");
const packages = new Map();
for (const directory of await readdir(packageRoot)) {
  const path = resolve(packageRoot, directory);
  let manifest;
  try { manifest = JSON.parse(await readFile(resolve(path, "package.json"), "utf8")); } catch { continue; }
  if (manifest.private) continue;
  if (!manifest.name?.startsWith("@gameweave/")) throw new Error(`Refusing unexpected package: ${manifest.name ?? directory}`);
  packages.set(manifest.name, { directory, path, manifest });
}

const ordered = [];
const visiting = new Set();
const visited = new Set();
function visit(name) {
  if (visited.has(name)) return;
  if (visiting.has(name)) throw new Error(`Internal dependency cycle at ${name}`);
  visiting.add(name);
  const entry = packages.get(name);
  const dependencies = { ...entry.manifest.dependencies, ...entry.manifest.peerDependencies, ...entry.manifest.optionalDependencies };
  for (const dependency of Object.keys(dependencies).filter((key) => packages.has(key)).sort()) visit(dependency);
  visiting.delete(name);
  visited.add(name);
  ordered.push(entry);
}
for (const name of [...packages.keys()].sort()) visit(name);

console.log(`GameWeave package order: ${ordered.map(({ manifest }) => manifest.name).join(" -> ")}`);
for (const { path, manifest } of ordered) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  if (mode === "--publish") {
    const existing = spawnSync(npm, ["view", `${manifest.name}@${manifest.version}`, "version"], { cwd: root, encoding: "utf8" });
    if (existing.status === 0 && existing.stdout.trim() === manifest.version) {
      console.log(`Skipping existing ${manifest.name}@${manifest.version}`);
      continue;
    }
  }
  const args = ["publish", "--access", "public"];
  if (mode === "--dry-run") args.push("--dry-run");
  console.log(`${mode === "--publish" ? "Publishing" : "Packing"} ${manifest.name}@${manifest.version}`);
  const result = spawnSync(npm, args, { cwd: path, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
