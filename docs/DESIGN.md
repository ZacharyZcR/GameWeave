# GameWeave 总体设计

状态：Draft 0.1  
日期：2026-07-20

## 1. 问题

AI 已经能够使用 Three.js、HTML 和 CSS 生成完整的浏览器游戏，但当前作品仍需反复手写大量相同逻辑：

- game loop 与生命周期
- 玩家移动、相机和输入
- 碰撞、射线检测和物理同步
- 生命、伤害、武器、弹药和投射物
- Bot 感知、导航和行为
- 载具、阵营、任务、存档和 HUD
- 对象池、音效、粒子与调试信息

这导致原型生成很快，复杂度却随功能线性甚至超线性增长。大型生成文件、全局状态、隐式对象关系和无法自动复现的运行时问题，会迅速降低 AI 的修改可靠性。

GameWeave 的目标不是取代 Three.js，而是消除每个游戏都重复实现的 gameplay 基础设施。

## 2. 产品定义

> GameWeave 是建立在 Three.js 之上的模块化游戏逻辑库，把通用玩法能力表达成可组合、可序列化、可检查的 TypeScript API。

目标用户包括：

- 使用 AI 生成游戏的开发者
- 希望快速制作浏览器 3D 游戏的 TypeScript 开发者
- 需要直接访问 Three.js、但不想重复实现玩法基础设施的团队

## 3. 设计原则

### 3.1 Gameplay-first

公共 API 使用 `Character`、`Weapon`、`Health`、`Faction`、`Ability` 等游戏概念，而不是迫使使用者反复组合底层图形学操作。

### 3.2 Composition over inheritance

Entity 是身份和组件容器，能力由 Component 组合，批量逻辑由 System 执行。避免深继承树和“万能基类”。

### 3.3 Progressive disclosure

简单游戏应通过少量配置运行，复杂游戏可以逐层下降到 Component、System、Three.js Object3D 和 shader。

### 3.4 One source of truth

代码 API 与数据格式共享同一 schema。JSON/YAML 场景不能成为另一套功能较弱、行为不同的系统。

### 3.5 Inspectable by default

运行状态必须能以稳定的结构化数据导出。Inspector 首先服务机器读取，其次才是图形界面。

### 3.6 Deterministic where practical

固定 timestep、显式随机种子、输入记录和逐帧推进是一等能力，使 bug 可以复现、测试和回归。

### 3.7 Replaceable subsystems

渲染、物理、导航、音频和网络通过 adapter/plugin 接入。玩法模块不能绑死具体物理库。

### 3.8 Escape hatches

不隐藏 Three.js。高级用户可以访问底层 `Object3D`、`Scene`、`Camera` 和 `WebGLRenderer/WebGPURenderer`。

### 3.9 Pay only for what you use

模块可独立安装和 tree-shake。默认不为每个 Component 分配逐帧回调，也不把所有实体变成重量级对象。

### 3.10 No speculative universality

只有在至少两个真实游戏中重复出现、并能给出稳定语义的逻辑，才进入通用层。其余逻辑留在游戏代码或类型包中。

## 4. 借鉴与取舍

### Godot

借鉴：Scene/Node 的组合、层级结构、可实例化场景和统一生命周期。

不照搬：以编辑器为中心的节点类型数量，以及通过场景路径隐式寻找依赖。

### Unity 与 PlayCanvas

借鉴：轻量对象容器、Component 组合、Prefab/Template、可配置脚本属性。

不照搬：强依赖 Inspector 的对象引用和大量逐对象 `Update`。

### Unreal Engine

借鉴：World、GameMode、Pawn/Controller 分离、Gameplay Ability、AI perception 和可插拔 gameplay framework。

不照搬：庞大的类型层级、宏系统、重量级生命周期和默认复杂度。

### ECS 框架

借鉴：数据与行为分离、System 批处理、Query 和清晰的数据所有权。

不照搬：把 ECS 存储细节直接暴露为主要用户体验。公共 API 应优先表达游戏意图。

## 5. 核心模型

```text
Game
├── services
│   ├── RendererAdapter
│   ├── PhysicsAdapter
│   ├── AudioAdapter
│   └── InputManager
└── World
    ├── Entity registry
    ├── Components
    ├── Systems
    ├── Resources
    └── Event bus
```

### Game

应用生命周期和服务容器。负责初始化、暂停、恢复、销毁、World 切换和插件安装。

### World

一个可独立推进和序列化的模拟空间。包含实体、组件、系统、资源和世界级规则。

### Entity

稳定 ID 与便捷 facade。它不是行为继承树，也不拥有独立 game loop。

### Component

附着在 Entity 上的类型化状态。应尽量是可序列化数据；资源句柄和运行时对象通过 adapter 管理。

### System

查询一组 Component 并执行逻辑。System 声明阶段与顺序，避免脚本挂载顺序成为隐藏逻辑。

### Prefab

具有稳定 ID 的可复用实体配方，支持组合和显式 override。首版不设计复杂多重继承。

### Resource

由 World 或 Game 拥有的共享状态，例如导航地图、游戏规则、时间、随机数和资产缓存。

### Plugin

注册 Component schema、System、服务、序列化器和调试描述。插件必须能检测依赖冲突与重复注册。

## 6. 生命周期

建议固定阶段：

```text
input
preUpdate
fixedUpdate (0..n)
update
lateUpdate
render
postRender
```

原则：

- 模拟逻辑优先运行在固定 timestep。
- 渲染插值与模拟状态分离。
- System 顺序必须显式声明或由依赖拓扑产生。
- 普通 Component 不自动获得 `update()`。
- Entity 的 spawn/despawn 在阶段边界提交，避免遍历时修改集合。

## 7. 控制与角色分离

GameWeave 区分：

- `CharacterMotor`：身体如何移动
- `Controller`：移动意图来自哪里
- `InputSource`：键鼠、触控、手柄、网络或录制输入
- `CameraRig`：观察方式

同一个角色可在玩家、Bot、回放和远端网络控制之间切换，而不替换身体模型或玩法组件。

## 8. Gameplay primitives

首批候选原语：

```text
Transform        Renderable       Collider
RigidBody        CharacterMotor   Controller
Health           Damageable       Faction
Weapon           Ammo             Projectile
Hitscan          Explosion        Inventory
Sensor           Targeting        NavigationAgent
StateMachine     Behavior         Ability
Effect           Cooldown         Interactable
```

高层 preset（例如 FPSPlayer、AssaultBot）只能组合这些原语，不允许形成平行实现。

## 9. 序列化与场景格式

要求：

- schema 有版本号
- Entity 引用使用稳定 ID，不保存内存引用
- Component 数据可以独立迁移
- runtime-only 字段明确标记
- Prefab override 使用路径或结构化 patch，语义必须可验证
- 未知 Component 在严格模式报错，在工具模式可保留原始数据

示例：

```json
{
  "$schema": "https://gameweave.dev/schema/world-0.1.json",
  "version": 1,
  "entities": [
    {
      "id": "enemy-01",
      "prefab": "assault-soldier",
      "components": {
        "transform": { "position": [20, 0, 10] },
        "health": { "current": 100, "max": 100 },
        "faction": { "id": "enemy" }
      }
    }
  ]
}
```

## 10. AI-native 能力

“AI-native”不是在库中内置聊天框，而是让工程具备可发现、可修改、可验证的接口。

必须提供：

- 完整 TypeScript 类型、schema 和短小示例
- 稳定、可搜索的命名
- 结构化 runtime inspector
- 实体与组件查询
- 帧推进、暂停和时间缩放
- 随机种子与输入回放
- 截图和场景状态快照
- 性能计数器和系统耗时
- invariant 检查和友好错误
- headless 或最小浏览器自动测试接口

禁止依赖：

- 只有编辑器才能生成的隐藏数据
- 无法 diff 的二进制场景作为唯一事实源
- 依赖组件挂载顺序的隐式行为
- 只能从截图猜测的内部状态

## 11. 包边界

首版候选结构：

```text
@gameweave/core       Game、World、Entity、Component、System、Plugin
@gameweave/three      Three.js renderer 与 Object3D 同步
@gameweave/physics    物理抽象与首个 adapter
@gameweave/character  角色移动、控制器和相机
@gameweave/combat     生命、伤害、武器和投射物
@gameweave/ai         感知、目标、导航和行为
@gameweave/ui         DOM 状态绑定与屏幕投影
@gameweave/debug      Inspector、录制、回放和性能数据
```

实现阶段可能先使用 monorepo 内部包；发布粒度由 bundle、依赖关系和 API 稳定性决定，不提前承诺每个目录都是 npm 包。

## 12. 非目标

首版明确不做：

- 自研 renderer、physics solver 或模型格式
- 大型可视化场景编辑器
- 通用多人游戏后端
- 完整动画状态机编辑器
- 所有游戏类型的统一 DSL
- 无限制 Prefab 继承
- 自动生成美术资产
- 一开始支持所有 Three.js 版本和所有物理库

## 13. 成功标准

第一阶段成功不以 API 数量衡量，而以真实游戏迁移验证：

- 使用 GameWeave 重建一个 FPS vertical slice
- gameplay 代码量相较直接 Three.js 实现明显下降
- 武器、Bot、HUD 等模块能在第二个游戏复用
- AI 能仅依靠类型、文档和错误信息完成小功能修改
- 测试能确定性复现命中、死亡、换弹和 Bot 状态转换
- 使用者仍能访问并扩展底层 Three.js

## 14. 主要风险

### 抽象过早

缓解：只从真实游戏中提取重复逻辑，至少两个使用案例后再稳定公共 API。

### 高层 API 与自由度冲突

缓解：所有 preset 都由公开 primitives 组合，并保留 Three.js escape hatch。

### ECS 复杂度泄漏

缓解：Entity facade 和语义化 factory 作为默认入口，性能敏感代码再使用 Query/System。

### 插件边界碎片化

缓解：先稳定核心协议和少量内置模块，不急于形成插件市场。

### “AI-friendly”变成营销词

缓解：把它落实成可测指标：schema 覆盖、结构化错误、inspect 输出、确定性回放和 AI 完成任务成功率。
