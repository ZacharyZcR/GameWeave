import { definePlugin } from "@gameweave/core";
import { Vector3, type Camera } from "three";

export interface TextTarget { textContent: string | null; }
interface Binding { target: TextTarget; read: () => unknown; last: unknown; }

export class UIManager {
  #bindings: Binding[] = [];
  bind(target: TextTarget, read: () => unknown): () => void {
    const binding: Binding = { target, read, last: Symbol("unset") };
    this.#bindings.push(binding);
    return () => { this.#bindings = this.#bindings.filter((item) => item !== binding); };
  }
  bindSelector(selector: string, read: () => unknown, root: ParentNode = document): () => void {
    const target = root.querySelector(selector);
    if (!target) throw new Error(`UI target not found: ${selector}`);
    return this.bind(target, read);
  }
  update(): void {
    for (const binding of this.#bindings) {
      const value = binding.read();
      if (Object.is(value, binding.last)) continue;
      binding.target.textContent = String(value ?? "");
      binding.last = value;
    }
  }
  project(position: readonly [number, number, number], camera: Camera, width: number, height: number) {
    const point = new Vector3(...position).project(camera);
    return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2, visible: point.z >= -1 && point.z <= 1 };
  }

  async lockPointer(target: Element): Promise<void> {
    if (!("requestPointerLock" in target)) throw new Error("Pointer lock is not supported");
    await target.requestPointerLock();
  }

  unlockPointer(): void {
    if (typeof document !== "undefined") document.exitPointerLock?.();
  }
}

export const formatInteger = (value: number): string => Math.round(value).toLocaleString("en-US");
export const formatPercent = (value: number, digits = 0): string => `${(value * 100).toFixed(digits)}%`;

export function ui(manager = new UIManager()) {
  return {
    ...definePlugin({
      id: "gameweave.ui",
      install: (game) => game.provide("ui", manager),
      setupWorld: (world) => world.addSystem({ name: "ui.update", phase: "postRender", run: () => manager.update() }),
    }), manager,
  };
}
