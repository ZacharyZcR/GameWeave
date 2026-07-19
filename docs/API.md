# GameWeave API 草案

状态：探索性草案，不代表兼容性承诺。

## 1. 最小启动

```ts
import { createGame } from "@gameweave/core";
import { three } from "@gameweave/three";

const game = createGame({
  renderer: three({ canvas: "#game" }),
  fixedStep: 1 / 60,
  seed: "demo-01",
});

const world = game.createWorld("battlefield");

await game.start(world);
```

待确定：`createGame()` factory 与 `new Game()` 哪个是主要风格。当前倾向 factory，便于环境注入和测试。

## 2. Spawn

```ts
const soldier = world.spawn({
  name: "enemy-soldier",
  components: {
    transform: { position: [20, 0, 10] },
    model: { asset: "soldier.glb" },
    health: { current: 100, max: 100 },
    faction: { id: "enemy" },
  },
});
```

便捷写法是否允许扁平化仍待评审：

```ts
world.spawn({
  transform: { position: [20, 0, 10] },
  health: { max: 100 },
});
```

扁平写法更短，但会让 Entity 元数据与 Component 名称发生命名冲突。

## 3. Component

```ts
import { defineComponent } from "@gameweave/core";

export const Health = defineComponent("health", {
  schema: {
    current: "number",
    max: "number",
  },
  defaults: {
    current: 100,
    max: 100,
  },
});
```

需要评审 schema 方案：

- 自研最小 schema
- JSON Schema
- Standard Schema 兼容 validator
- 纯 TypeScript + 可选 runtime validation

要求是类型不能只存在于编译期，否则场景文件和 AI 工具无法验证。

## 4. System

```ts
const DamageSystem = defineSystem({
  name: "combat.damage",
  phase: "fixedUpdate",
  after: ["physics.step"],
  before: ["combat.death"],

  setup(world) {
    const targets = world.query(Health, DamageInbox);

    return () => {
      for (const entity of targets) {
        applyPendingDamage(entity);
      }
    };
  },
});
```

System 顺序以显式依赖解决，注册先后不能影响行为。

## 5. Prefab

```ts
const assaultSoldier = definePrefab("assault-soldier", {
  components: {
    health: { current: 100, max: 100 },
    faction: { id: "enemy" },
    characterMotor: { speed: 4 },
    inventory: { items: ["service-rifle"] },
  },
});

const enemy = world.spawn(assaultSoldier, {
  id: "enemy-01",
  transform: { position: [20, 0, 10] },
  health: { max: 150, current: 150 },
});
```

首版只允许单 prefab + overrides，不支持多重 prefab 继承。

## 6. Controller 与 Character

```ts
const body = world.spawn(humanoidCharacter, {
  characterMotor: {
    speed: 5,
    sprintSpeed: 9,
    jumpHeight: 1.2,
  },
});

body.set(PlayerController, {
  input: game.input.keyboardMouse(),
});
```

切换为 AI：

```ts
body.remove(PlayerController);
body.set(BotController, {
  behavior: assaultBehavior,
});
```

待评审：Controller 应当是 Component、独立 Entity，还是持有 body 引用的服务对象。

## 7. Combat

```ts
const rifle = defineWeapon("service-rifle", {
  fireMode: "automatic",
  roundsPerMinute: 600,
  magazineSize: 30,
  reloadTime: 2.1,
  delivery: hitscan({
    range: 300,
    spread: 0.008,
  }),
  damage: {
    amount: 32,
    type: "ballistic",
  },
});
```

统一伤害消息：

```ts
target.damage({
  amount: 32,
  type: "ballistic",
  source: shooter,
  instigator: player,
  weapon: rifle,
  point: hit.point,
  normal: hit.normal,
  tags: ["headshot"],
});
```

这里需要区分 `source`（产生伤害的实体）与 `instigator`（应获得击杀归属的控制者）。

## 8. AI

预设入口：

```ts
bot.set(BotController, {
  behavior: "assault",
  senses: {
    sight: 80,
    hearing: 30,
  },
});
```

组合入口：

```ts
const assaultBehavior = sequence(
  acquireTarget({ faction: "hostile" }),
  select(
    useCover({ when: healthBelow(0.35) }),
    moveIntoRange(),
  ),
  attackTarget(),
);
```

字符串预设必须解析成公开、可检查的行为定义，不能隐藏另一套 AI 实现。

## 9. 查询

```ts
const enemies = world.query(Health, Faction).where({
  faction: { id: "enemy" },
  health: { current: { $gt: 0 } },
});
```

热路径建议使用类型化 Query；面向调试和 AI 的 inspect query 可以接受 JSON 条件。两者不必是同一个性能模型。

## 10. Events

```ts
world.events.on("combat:damage", event => {
  console.log(event.target, event.amount);
});
```

系统间核心数据不应全部依赖字符串 event bus。高频事件可能使用 typed channel 或 inbox component；全局事件主要服务低频解耦和工具观察。

## 11. UI

```ts
game.ui.bind("#health", () => player.get(Health).current);
game.ui.bind("#ammo", () => player.get(WeaponState).remaining);
```

GameWeave 不自研 DOM 框架，只提供：

- 游戏状态订阅
- 世界坐标到屏幕坐标投影
- 输入焦点和 pointer lock 协调
- HUD 常用 formatter
- 与主流 UI 框架连接的最小 adapter

## 12. Inspector 与测试

```ts
game.pause();
game.step({ frames: 60 });

const state = world.inspect({
  entities: { with: [Health, BotController] },
  include: ["components", "systems", "performance"],
});
```

```ts
await scenario("rifle kills unarmored target", async ({ world, step }) => {
  const shooter = world.spawn(testShooter);
  const target = world.spawn(testTarget, { health: { current: 100 } });

  shooter.fireAt(target);
  await step(10);

  expect(target.get(Health).current).toBe(68);
});
```

待确定：测试 API 应当包装 Vitest/Playwright，还是只提供底层 deterministic harness。

## 13. Three.js escape hatch

```ts
const object = entity.get(Renderable).object3D;
const scene = world.services.renderer.scene;
const renderer = game.services.renderer.native;
```

底层对象必须明确标记所有权：由 GameWeave 创建的对象由 GameWeave 销毁；外部注入对象默认由调用方决定是否 dispose。
