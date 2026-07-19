# @gameweave/character

Fixed-tick input, recording and playback, character movement, controllers, and camera rigs for GameWeave. With `RapierPhysicsAdapter`, kinematic capsules support move-and-slide, slope limits, steps, and grounded detection.

```ts
const input = new InputManager().register("player", readInput);
const game = createGame().use(character(input));
```
