import { readFileSync } from "node:fs";

const files = ["examples/fps/src/main.ts", "examples/steel-front-slice/src/main.ts"];
for (const file of files) {
  const lines = readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("\n").filter((line) => line.trim() && !line.trim().startsWith("//")).length;
  console.log(`${file}: ${lines} non-empty source lines`);
}
