import { expect, it } from "vitest";
import { UIManager } from "./index.js";

it("writes DOM-like targets only when a bound value changes", () => {
  let writes = 0;
  let value = 1;
  const target = { get textContent() { return ""; }, set textContent(_: string | null) { writes += 1; } };
  const manager = new UIManager();
  manager.bind(target, () => value);
  manager.update(); manager.update(); value = 2; manager.update();
  expect(writes).toBe(2);
});
