# @gameweave/three

The GameWeave Three.js adapter manages transform synchronization, renderable assets, object ownership, model animation, and an explicit Three.js escape hatch.

```ts
const renderer = three({ canvas: "#game" });
const game = createGame({ renderer });
renderer.adapter.registerAsset("crate", () => new Mesh(...));
```
