import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const tag = process.argv[2];
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag ?? "")) throw new Error(`Invalid release tag: ${tag ?? "missing"}`);
const expected = tag.slice(1);
const packageRoot = resolve(import.meta.dirname, "..", "packages");
for (const directory of await readdir(packageRoot)) {
  let manifest;
  try { manifest = JSON.parse(await readFile(resolve(packageRoot, directory, "package.json"), "utf8")); } catch { continue; }
  if (!manifest.private && manifest.version !== expected) throw new Error(`${manifest.name} is ${manifest.version}, expected ${expected}`);
}
console.log(`All public packages match ${tag}`);
