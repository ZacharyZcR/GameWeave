# @gameweave/debug

Inspector snapshots, screenshots, fixed-tick input recording, and a deterministic scenario harness for GameWeave.

```ts
const tools = debug();
const game = createGame().use(tools);
tools.session.step(60);
```
