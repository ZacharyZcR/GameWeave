# @gameweave/ui

Lightweight DOM HUD bindings, screen projection, and Pointer Lock coordination for GameWeave.

```ts
const manager = game.service<UIManager>("ui");
manager.bindSelector("#health", () => player.get(Health)?.current ?? 0);
```
