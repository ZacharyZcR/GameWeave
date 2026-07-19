# @gameweave/character

GameWeave 的 fixed-tick 输入、录制回放、角色移动、Controller 与 CameraRig。配合 `RapierPhysicsAdapter` 时，kinematic capsule 自动使用 move-and-slide、坡面限制、台阶与接地检测。

```ts
const input = new InputManager().register("player", readInput);
const game = createGame().use(character(input));
```
