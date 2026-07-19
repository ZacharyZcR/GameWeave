# @gameweave/ui

GameWeave 的轻量 DOM HUD binding、屏幕投影和 Pointer Lock 协调层。

```ts
const manager = game.service<UIManager>("ui");
manager.bindSelector("#health", () => player.get(Health)?.current ?? 0);
```
