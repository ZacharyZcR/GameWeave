# GameWeave 路线图

路线图按验证结果推进，不按功能数量推进。

## Phase 0：设计与样本分析

交付物：

- [x] 产品定位
- [x] 初始架构草案
- [x] API 草案
- [ ] 两个现有 Three.js 游戏的重复逻辑清单
- [ ] 核心术语表
- [ ] schema 方案决策记录
- [ ] 渲染与物理 adapter 边界决策记录

退出条件：至少完成一次外部技术评审，主要对象模型不存在未解释的根本冲突。

## Phase 1：Core spike

只验证：

- `Game` 与 `World`
- Entity ID 与生命周期
- Component 注册、存储和 runtime schema
- System 阶段、依赖与 Query
- spawn/despawn command buffer
- deterministic clock 与 seeded random
- JSON inspect 输出

不发布稳定 API。

退出条件：无渲染环境下可确定性运行模拟测试；系统顺序和销毁语义明确。

## Phase 2：Three.js vertical slice

实现：

- Three.js adapter
- Transform/Object3D 同步
- 资产加载与所有权
- FPS character motor
- 输入、相机与 pointer lock
- 基础 collider/physics adapter
- Health、Damage、Hitscan Weapon
- HUD DOM binding

退出条件：可玩 FPS 靶场，且底层 Three.js 可直接扩展。

## Phase 3：Bot 与回归验证

实现：

- Faction 与 Targeting
- Sight/Hearing perception
- Navigation adapter
- State machine 或最小 behavior composition
- 输入录制与回放
- 截图、状态快照和 scenario tests

退出条件：Bot 可以搜索、追击和攻击；固定 seed 下测试结果稳定。

## Phase 4：真实游戏迁移

选择现有游戏的一段完整玩法迁移，而不是另写 demo：

- 玩家移动与射击
- 至少两类武器
- 一种 Bot
- 一种载具或重型武器
- HUD、音频和粒子反馈

记录：

- 迁移前后 gameplay 代码量
- 重复逻辑减少比例
- escape hatch 使用位置
- API 不足与错误抽象
- AI 独立修改任务成功率

退出条件：第二个游戏能复用核心模块，而不是复制后改名。

## Phase 5：首个公开版本

只有迁移验证后才决定：

- npm 包拆分粒度
- 稳定 API 范围
- License
- 浏览器支持范围
- Three.js peer dependency 范围
- 文档站与示例工程
- 是否提供 CLI

## 暂不排期

- 可视化编辑器
- multiplayer replication
- 大型世界 streaming
- 完整动画图系统
- RPG ability framework
- RTS 群体寻路
- WebGPU 专用高级渲染
- 插件市场
