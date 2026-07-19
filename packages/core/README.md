# @gameweave/core

GameWeave 的无渲染模拟核心。当前版本为 0.1.0；Definition ID、调度阶段、结构变更边界和序列化版本语义属于首批稳定边界，其余 0.x API 仍可能调整。

已实现：

- `Game`、`World` 与 fixed-step clock
- 类型化 Component definition
- Entity facade 与失效 handle 语义
- live Query 与逐次迭代快照
- 显式 System phase 和依赖排序
- 阶段边界 command buffer
- seeded random
- 可脱离运行状态修改的 Inspector snapshot

最小示例：

```ts
import { createGame, defineComponent } from "@gameweave/core";

const Position = defineComponent("position", {
  defaults: { x: 0, y: 0 },
});

const Velocity = defineComponent("velocity", {
  defaults: { x: 0, y: 0 },
});

const game = createGame({ step: 1 / 60, seed: "demo" });
const world = game
  .createWorld("arena")
  .register(Position)
  .register(Velocity);

world.spawn({
  components: {
    position: {},
    velocity: { x: 3 },
  },
});

world.addSystem({
  name: "movement",
  phase: "fixedUpdate",
  run: ({ dt }) => {
    for (const entity of world.query(Position, Velocity)) {
      const position = entity.get(Position);
      const velocity = entity.get(Velocity);
      if (!position || !velocity) continue;
      entity.set(Position, { x: position.x + velocity.x * dt });
    }
  },
});

game.step(60);
console.log(world.inspect());
```
