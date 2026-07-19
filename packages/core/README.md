# @gameweave/core

The renderer-independent simulation core for GameWeave. In 0.1.0, definition IDs, scheduler phases, structural mutation boundaries, and serialization version semantics form the initial stable surface. Other APIs may still change throughout the 0.x series.

Included systems:

- `Game`, `World`, and a fixed-step clock
- Typed component definitions
- Entity facades with invalid-handle semantics
- Live queries with per-iteration snapshots
- Explicit system phases and dependency ordering
- Phase-boundary command buffers
- Seeded random numbers
- Inspector snapshots that cannot mutate live state

Minimal example:

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
