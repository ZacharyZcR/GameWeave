# @gameweave/debug

GameWeave 的 Inspector、性能快照、截图、fixed-tick 输入录制与 deterministic scenario harness。

```ts
const tools = debug();
const game = createGame().use(tools);
tools.session.step(60);
```
