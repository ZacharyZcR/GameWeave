# GameWeave API 草案

状态：0.1.0 已实现 API。0.x 期间具体 gameplay 字段仍可能调整；稳定边界见 `RELEASE.md`。

两条全局约定：

- **引用模型**：类型化创作 API 接受 `defineX` 产出的定义对象；Inspector、查询条件和序列化使用稳定 ID。运行时对象不进入场景数据。
- **写路径**：Entity facade 方法全部是语法糖，定义为对 Component 的写入或消息入队，效果在对应 System 的阶段结算。不存在绕过 System 的第二条写路径。
- **可见性**：组件数据写入（含阶段内新增的组件和新 spawn 实体的配置）对 `get()`/`has()` 立即可见；query 匹配集合与实体存亡在阶段边界更新。

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

`game.start()` 会等待插件的异步初始化（例如 Rapier WASM），同一插件只初始化一次。

### 1.1 资源加载

```ts
import { AssetManager, assets } from "@gameweave/core";

const manager = new AssetManager()
  .register("json", url => fetch(url).then(response => response.json()));
game.use(assets(manager));

manager.onProgress(({ loaded, total }) => updateLoadingBar(loaded / total));
await manager.preload([
  { id: "level-01", type: "json", url: "/levels/01.json" },
]);
```

相同 ID、type、URL 的并发加载只执行一次；失败项会从缓存移除并允许重试。相同 ID 指向不同资源会直接报错，避免生成代码悄悄覆盖资源。

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

交互通过 `Interactable` 组件表达：`{ prompt, radius, enabled }`，`prompt` 是给表现层的提示文案（或 i18n key）。`findInteractable(world, origin, direction, maxDistance)` 沿准星射线返回第一个启用且在其 `radius` 内的可交互实体；`interact(world, entity, instigator?)` 发布 `interact:use` 事件，具体效果由游戏订阅决定——引擎不内置"门"或"箱子"的语义。

死亡或失衡状态通过 `Ragdoll` 组件表达。`activateRagdoll(entity, { impulse, duration })` 会切换可序列化状态，并停止 CharacterMotor 接管该实体；Three、Rapier 或其他 adapter 根据同一状态驱动具体骨架和物理表现。

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

`Weapon.muzzle` 是 `[right, up, forward]` 局部偏移，决定 `fire()` 生成弹丸的出膛点（forward 取实体到目标的方向）；默认 `[0, .4, .7]`。`fireDirection()` 的显式 `origin` 不受它影响。

Projectile 武器不会在扣弹时提前结算伤害。`fireDirection()` 只生成弹丸；`combat.projectiles` 在每个 fixed tick 对本帧位移执行 swept raycast。弹丸碰到的第一个 collider 会终止它，只有该实体同时具备 `Health` 与 `DamageInbox` 才会产生伤害。因此高速弹丸不会穿透薄墙，障碍物也不会被误写入伤害组件。

`reload()` 成功时立即发布 `combat:reloadStart`，装填完成后发布 `combat:reload`。表现层可以据此播放完整换弹动作，不需要轮询或复制计时器。

`throwGrenade()` 生成带 `Grenade` 组件的 dynamic 刚体，由物理 adapter 模拟抛物线；`combat.grenades` 在 fixed tick 递减引信（可序列化的剩余量语义），到点调用 `explode()`。爆炸对范围内具备 `Health` + `DamageInbox` 的实体按距离线性衰减 `queueDamage`（不分敌我、不做遮挡检测），对 dynamic 刚体施加径向冲量，并发布 `combat:explosion`。给场景物件挂上 `Health` + `DamageInbox` 即可获得可破坏地形——子弹与爆炸走同一条伤害路径。

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

## 11.5 Audio

```ts
import { audio } from "@gameweave/audio";

const sound = audio();
game.use(sound);

sound.adapter.register("shot", { synth: ctx => renderShotBuffer(ctx) });
sound.adapter.register("theme", { url: "/audio/theme.ogg" });
sound.adapter.play("shot", { position: [4, 1, -8], pitch: .95 });
sound.adapter.setListener(cameraPosition, cameraForward);
```

`AudioAdapter` 是可替换服务：浏览器默认 `WebAudioAdapter`（PannerNode 空间化、sfx/music 总线、`synth` 程序化音源一次渲染缓存、`url` 音源异步解码），headless 与测试环境自动落到 `NullAudioAdapter`（记录播放调用，可断言）。声音触发是表现层职责——订阅 `combat:fire` 等事件调用 `play()`，模拟层不感知音频。

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

## 13. 真实模型

```ts
const adapter = game.service<ThreeAdapter>("renderer");
await adapter.loadModel("soldier", "/models/soldier.glb", {
  scale: 1.2, offset: [0, -.95, 0], castShadow: true,
});

const enemy = world.spawn()
  .set(Transform, { position: [4, 0, -8] })
  .set(Renderable, { asset: "soldier" })
  .set(ModelAnimation, { clip: "Run", speed: 1.4 });

adapter.animations("soldier"); // ["Idle", "Run", "Shoot", ...]
```

`loadModel()` 用 GLTFLoader 加载 GLB/GLTF；`registerModel(id, { scene, animations }, options)` 是它的纯逻辑底层，可传入任何来源的模型（自定义 loader、程序化生成、测试桩）。注册后模型就是普通资产：`Renderable.asset` 引用，实例化用骨骼安全克隆，几何共享、材质每实例独立。

`ModelAnimation` 是可序列化的动画意图：`{ clip, loop, speed, transition }`。gameplay 代码只写组件（例如 Bot 进入 chase 时 `set(ModelAnimation, { clip: "Run" })`），adapter 负责 AnimationMixer 的 crossfade、循环与 clamp。`clip: ""` 表示淡出停止。

所有权分层：实体 root 的变换归 `Transform` 权威，动画只驱动模型内部节点——两者永不冲突，`ManualTransform` 语义不变。

## 14. I18n

```ts
import { createI18n, translateDocument } from "@gameweave/i18n";

const i18n = createI18n({
  messages: {
    en: { score: "Score: {value}" },
    zh: { score: "分数：{value}" },
  },
});

i18n.t("score", { value: 10 }); // Score: 10
i18n.setLocale("zh-CN");        // zh-CN -> zh -> en
translateDocument(i18n);
```

`locale` 与 `fallbackLocale` 默认都是 `en`。HTML 可使用 `data-i18n`、`data-i18n-title`、`data-i18n-aria-label` 和 `data-i18n-placeholder`。

## 15. Three.js escape hatch

```ts
const adapter = game.service<ThreeAdapter>("renderer");
const object = adapter.object(entity.id);
const scene = adapter.scene;
const renderer = adapter.native;
```

底层对象必须明确标记所有权：由 GameWeave 创建的对象由 GameWeave 销毁；外部注入对象默认由调用方决定是否 dispose。

变换的事实源是 `Transform` 组件，render 阶段单向写入 `Object3D`。`position`、`quaternion`、`scale`、`visible` 由 GameWeave 管理：外部直接写入会在下一次同步被覆盖，开发模式下报 invariant 错误。要接管某个实体的变换，用 `ManualTransform` 显式 opt-out。其余字段（材质、自定义子节点、shader uniform）可自由修改。
