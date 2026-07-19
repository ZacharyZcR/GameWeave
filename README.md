# GameWeave

> Gameplay primitives for Three.js.

GameWeave（中文暂定“织界”）是一个建立在 Three.js 之上的模块化游戏逻辑库。它把角色、武器、AI、载具、规则、存档和调试能力封装成可组合、可检查、适合人类与 AI 生成的 TypeScript API。

项目目前处于设计阶段，尚未进入实现。

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

## 当前状态

当前目标是先验证抽象边界，再开始编码。第一个 vertical slice 将从已有 Three.js 游戏中提取以下重复逻辑：

1. Game loop 与 World
2. Entity、Component 与 System
3. FPS 角色控制
4. Health、Damage、Weapon 与 Projectile
5. Bot 感知与简单行为
6. HUD 状态绑定
7. 结构化 Inspector 与确定性测试

## License

尚未决定。
