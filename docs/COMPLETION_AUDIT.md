# 0.1.0 完成审计

审计对象：`DESIGN.md`、`API.md`、`ROADMAP.md`。本表只引用当前仓库可重复验证的证据。

| 要求 | 实现证据 | 验证证据 |
|---|---|---|
| Game、World、Entity、Component、System | `packages/core/src` | Core tests |
| phase、依赖排序、command buffer | `world.ts`、`system.ts` | system ordering、optional dependency、structural/value visibility tests |
| fixed clock、seed、pause、time scale | `clock.ts`、`random.ts`、`game.ts` | deterministic simulation 与 game controls tests |
| runtime schema、version、migration | `definition.ts`、`world.load` | validation、migration tests |
| 未知数据保留、runtime-only | `World.load/serialize` | unknown tool data test |
| Prefab 与 override | `prefab.ts` | prefab test 与 AI task 06 |
| Plugin、Service、Resource、Event、Scheduler | Core 对应模块 | Core integration tests 与 AI task 12 |
| Three.js adapter 与资产所有权 | `packages/three` | sync、despawn、dispose packaging tests |
| Transform 单向权威与 ManualTransform | `ThreeAdapter.sync` | invariant test 与 AI task 11 |
| Physics adapter、RigidBody、Collider、raycast | `packages/physics` | Basic integration、真实 Rapier contact/event/raycast tests |
| Character、Controller、Input、CameraRig | `packages/character` | movement 与 plugin-order tests；FPS build |
| fixed-tick 输入录制与回放 | `InputManager`、`DebugSession` | debug test 与 AI task 08 |
| Health、Damage、Weapon、Ammo、Hitscan | `packages/combat` | exact damage、hitscan tests |
| reload、death、projectile lifetime | Combat fixed systems | combat tests |
| Faction、Sight/Hearing、Targeting | `packages/bots` | hostile target 与 hearing tests |
| Navigation adapter、状态机、行为组合 | `packages/bots` | Bot tests、AI task 04 |
| DOM binding、投影、Pointer Lock | `packages/ui` | no duplicate writes test；FPS typecheck/build |
| Inspector、性能耗时、截图、scenario | `packages/debug`、`World.inspect` | debug tests |
| headless 自动测试 | Vitest workspaces | `npm test` |
| FPS vertical slice | `examples/fps` | TypeScript 与 Vite production build |
| 第二个真实样本切片 | `examples/steel-front-slice` | TypeScript 与 Vite production build |
| 两类武器、重型武器、Bot、HUD、音效、粒子 | steel-front slice | production build 与 migration report |
| AI 修改成功率 | `tests/ai-tasks` | 12/12 tests |
| Escape hatch | 两个示例直接使用 ThreeAdapter | build 与 migration report |
| 公共包发布结构 | 八个 0.1.0 package manifests | 八次 `npm pack --dry-run` |

## 门禁命令

```bash
npm install
npm run typecheck
npm test
npm run build
npm run metrics
for package_dir in ./packages/*; do npm pack "$package_dir" --dry-run --json; done
git diff --check
```

## 已知边界

- `BasicPhysicsAdapter` 仍只用于协议与确定性测试；正式浏览器游戏使用内置 `RapierPhysicsAdapter`。
- 0.1.0 不包含可视化编辑器、多人后端、完整动画图、WebGPU 专用管线或 CLI，这些均列在设计非目标或未排期范围。
- 两个浏览器 bundle 包含完整 Three.js，Vite 报告超过 500 kB 的非阻塞优化警告；gzip 约 167 kB。
- 尚未执行 npm publish；“完成”指仓库内 0.1.0 实现与本地发布候选完成，不代表远端包已经发布。
