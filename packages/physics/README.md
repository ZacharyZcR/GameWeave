# @gameweave/physics

GameWeave 的可替换物理协议。`BasicPhysicsAdapter` 用于确定性单元测试，`RapierPhysicsAdapter` 提供生产级碰撞、sensor、事件、raycast 与 kinematic character movement。

```ts
const game = createGame().use(physics());
entity.set(Collider, {}).set(RigidBody, {});
```

正式游戏使用 `physics(new RapierPhysicsAdapter())`，并在创建世界后 `await game.start(world)` 初始化 WASM。支持 `box`、`sphere`、`capsule` collider；碰撞通过 `physics:collisionStart` / `physics:collisionEnd` 发布。
