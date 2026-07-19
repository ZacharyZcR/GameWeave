# GameWeave API 草案

状态：0.1.0 已实现 API。0.x 期间具体 gameplay 字段仍可能调整；稳定边界见 `RELEASE.md`。

两条全局约定：

- **引用模型**：类型化创作 API 接受 `defineX` 产出的定义对象；Inspector、查询条件和序列化使用稳定 ID。运行时对象不进入场景数据。
- **写路径**：Entity facade 方法全部是语法糖，定义为对 Component 的写入或消息入队，效果在对应 System 的阶段结算。不存在绕过 System 的第二条写路径。

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

`createGame()` 是主要入口；`Game` 类仍导出给需要继承类型或显式构造的工具。`pause()`、`resume()`、`setTimeScale()`、`step()` 和 `advance()` 管理时间。

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

Spawn 配置固定使用 `components`，避免 Entity 元数据与 Component ID 冲突。链式 `entity.set(Definition, partial)` 是代码路径的便捷入口。

## 3. Component

```ts
import { defineComponent } from "@gameweave/core";

export const Health = defineComponent("health", {
  defaults: {
    current: 100,
    max: 100,
  },
  validate: (value): value is HealthData =>
    isHealthData(value),
});
```

Core 采用 TypeScript + 可选 runtime predicate。Definition 还包含 `version` 和 `migrate`；外部场景数据必须经过 validator。该接口允许后续 Standard Schema adapter，而不强制 Core 携带验证库。

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

`world.query()` 返回 live view：结果在单个 System 执行期间是稳定快照，spawn/despawn 在阶段边界提交后可见。迭代中不会遇到半死实体。

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
  components: {
    transform: { position: [20, 0, 10] },
    health: { max: 150, current: 150 },
  },
});
```

首版只允许单 prefab + overrides，不支持多重 prefab 继承。

## 6. Controller 与 Character

```ts
const body = world.spawn(humanoidCharacter, {
  components: {
    characterMotor: { speed: 5, sprintSpeed: 9 },
  },
});

body.set(Controller, {
  input: "keyboardMouse",
});
```

`input` 是 InputSource 的注册名，由 InputManager 解析。Component 不持有运行时对象，否则无法序列化和回放。

切换为 AI：

```ts
body.remove(Controller);
body.set(BotController, {
  behavior: "assault",
});
```

Controller 是 Component：可序列化、可回放、inspect 可见，切换控制权就是组件替换。InputSource 只以注册名出现在 Component 中。

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

equipWeapon(player, rifle);
```

统一伤害消息：

```ts
queueDamage(target, {
  amount: 32,
  type: "ballistic",
  source: shooter.id,
  instigator: player.id,
  weapon: rifle.id,
  point: hit.point,
  normal: hit.normal,
  tags: ["headshot"],
});
```

这里需要区分 `source`（产生伤害的实体）与 `instigator`（应获得击杀归属的控制者）。

`queueDamage()` 向 `DamageInbox` 入队，在下一个 `fixedUpdate` 由 `combat.damage` 结算。调用后立即读 `Health` 拿到的仍是旧值。`fire()`、`fireHitscan()`、`reload(entity, world)` 和 `spawnProjectile()` 是同一数据路径上的便捷函数；reload 与 projectile lifetime 都使用 fixed simulation time。

## 8. AI

预设入口：

```ts
bot.set(BotController, {
  behavior: "assault",
});
bot.set(Sensor, { sight: 80, hearing: 30 });
```

组合入口：

```ts
const cautious = sequence(
  healthBelow(0.35),
  action((bot, world) => retreat(bot, world)),
);
const behavior = select(cautious, action(attackNearest));
```

`BehaviorRegistry` 注册字符串预设；`sequence`、`select`、`action` 和 predicate 构造公开组合节点。导航由 `NavigationAdapter` 提供，听觉刺激由 `emitNoise()` 进入 fixed tick。

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
const ui = game.service<UIManager>("ui");
ui.bindSelector("#health", () => player.get(Health)?.current ?? 0);
ui.bindSelector("#ammo", () => player.get(Ammo)?.magazine ?? 0);
```

GameWeave 不自研 DOM 框架，只提供：

- 游戏状态订阅
- 世界坐标到屏幕坐标投影
- 输入焦点和 pointer lock 协调
- HUD 常用 formatter
- 与主流 UI 框架连接的最小 adapter

绑定默认逐帧 pull 求值，值未变化不写 DOM。不做依赖追踪，不做脏检查框架。

## 12. Inspector 与测试

```ts
game.pause();
game.step(60);

const state = world.inspect({
  with: [Health, BotController],
  includeComponents: true,
});
```

```ts
await scenario("single shot applies exact damage", createCombatWorld, async ({ world, step }) => {
  const shooter = world.spawn(testShooter);
  const target = world.spawn(testTarget, { components: { health: { current: 100 } } });

  fire(shooter, target, world);
  step(1);

  expect(target.get(Health).current).toBe(68);
});
```

精确数值断言只对核心模拟层成立（见 DESIGN 3.6 的确定性分层）。示例刻意使用单发武器：自动武器在 N 帧内的开火次数取决于开火时序，不适合做精确断言的教学示例。

GameWeave 提供底层 deterministic scenario harness，不包装断言库。浏览器交互由示例工程和调用方选择 Playwright 等工具验证。

## 13. Three.js escape hatch

```ts
const adapter = game.service<ThreeAdapter>("renderer");
const object = adapter.object(entity.id);
const scene = adapter.scene;
const renderer = adapter.native;
```

底层对象必须明确标记所有权：由 GameWeave 创建的对象由 GameWeave 销毁；外部注入对象默认由调用方决定是否 dispose。

变换的事实源是 `Transform` 组件，render 阶段单向写入 `Object3D`。`position`、`quaternion`、`scale`、`visible` 由 GameWeave 管理：外部直接写入会在下一次同步被覆盖，开发模式下报 invariant 错误。要接管某个实体的变换，用 `ManualTransform` 显式 opt-out。其余字段（材质、自定义子节点、shader uniform）可自由修改。
