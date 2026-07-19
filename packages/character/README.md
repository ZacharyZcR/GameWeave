# @gameweave/character

GameWeave 的 fixed-tick 输入、角色移动、Controller 与 CameraRig。

```ts
const input = new InputManager().register("player", readInput);
const game = createGame().use(character(input));
```
