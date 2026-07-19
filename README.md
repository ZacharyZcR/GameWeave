# GameWeave

> Gameplay primitives for Three.js.

GameWeave（中文暂定“织界”）是一个建立在 Three.js 之上的模块化游戏逻辑库。它把角色、武器、AI、载具、规则、存档和调试能力封装成可组合、可检查、适合人类与 AI 生成的 TypeScript API。

项目当前完成 0.1.0 本地发布候选：八个库包、两个浏览器游戏切片和一套 12 项 AI 修改验收。0.x API 仍可能调整，尚未发布到 npm。

## 定位

Three.js 提供构建 3D 世界的图形积木；GameWeave 提供构建游戏的玩法积木。

GameWeave 是：

- TypeScript-first、Browser-first、Code-first
- 建立在 Three.js 上层的 gameplay library
- 数据驱动、模块化、可渐进采用
- 为 AI 生成、修改、检查和验证游戏而设计

GameWeave 不是：

- 新的 WebGL/WebGPU renderer
- Godot、Unity 或 Unreal 的浏览器复刻
- 强制使用可视化编辑器的完整 IDE
- 自研物理、建模或动画软件
- 自然语言套壳

## 文档

- [总体设计](docs/DESIGN.md)
- [API 草案](docs/API.md)
- [路线图](docs/ROADMAP.md)
- [评审指南](docs/REVIEW.md)
- [核心术语](docs/GLOSSARY.md)
- [样本分析](docs/SAMPLE_ANALYSIS.md)
- [AI 修改任务集](docs/AI_TASKS.md)
- [迁移报告](docs/MIGRATION_REPORT.md)
- [0.1.0 发布决策](docs/RELEASE.md)
- [0.1.0 完成审计](docs/COMPLETION_AUDIT.md)

## 当前状态

当前实现已从已有 Three.js 游戏中提取以下重复逻辑：

1. Game loop 与 World
2. Entity、Component 与 System
3. FPS 角色控制
4. Health、Damage、Weapon 与 Projectile
5. Bot 感知与简单行为
6. HUD 状态绑定
7. 结构化 Inspector 与确定性测试

当前可用的开发命令：

```bash
npm install
npm run typecheck
npm test
npm run build
```

当前 workspace：

```text
@gameweave/core       模拟核心、序列化、Plugin、Prefab
@gameweave/three      Three.js 表现与资产适配
@gameweave/physics    物理协议、Rapier solver 与基础测试 adapter
@gameweave/character  输入、胶囊角色移动与相机数据
@gameweave/combat     生命、伤害、武器与弹药
@gameweave/bots       感知、目标、状态与行为
@gameweave/ui         DOM 状态绑定与屏幕投影
@gameweave/debug      Inspector、输入录制与 Scenario
```

可构建的浏览器示例：

- `examples/showcase`：可玩 FPS，集中展示资源预加载、胶囊角色、刚体堆叠、碰撞事件、raycast，以及具备感知、追踪和攻击状态的敌方 AI。
- `examples/fps`：最小 FPS vertical slice。
- `examples/steel-front-slice`：现有游戏迁移切片。

运行完整 showcase：

```bash
npm run dev --workspace @gameweave/example-showcase
```

## License

MIT，见 [LICENSE](LICENSE)。
