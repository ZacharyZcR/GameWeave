# @gameweave/three

GameWeave 的 Three.js adapter：托管 Transform 同步、Renderable 资产、对象所有权和底层 Three.js escape hatch。

```ts
const renderer = three({ canvas: "#game" });
const game = createGame({ renderer });
renderer.adapter.registerAsset("crate", () => new Mesh(...));
```
