# @gameweave/physics

A replaceable physics protocol for GameWeave. `BasicPhysicsAdapter` supports deterministic unit tests, while `RapierPhysicsAdapter` provides production collision detection, sensors, events, raycasts, and kinematic character movement.

```ts
const game = createGame().use(physics());
entity.set(Collider, {}).set(RigidBody, {});
```

For production games, use `physics(new RapierPhysicsAdapter())` and call `await game.start(world)` after creating the world to initialize WASM. Box, sphere, and capsule colliders are supported. Collisions emit `physics:collisionStart` and `physics:collisionEnd`.
