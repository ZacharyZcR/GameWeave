# GameWeave 路线图

路线图按验证结果推进，不按功能数量推进。

## Phase 0：设计与样本分析

交付物：

- [x] 产品定位
- [x] 初始架构草案
- [x] API 草案
- [x] 两个现有 Three.js 游戏的重复逻辑清单
- [x] 核心术语表
- [x] schema 方案决策记录
- [x] 渲染与物理 adapter 边界决策记录

退出条件：已完成外部技术评审，裁决与结果见 `REVIEW_RESULT.md`。

## Phase 1：Core spike

已验证：

- [x] `Game` 与 `World`
- [x] Entity ID 与生命周期
- [x] Component 注册、存储和 runtime schema
- [x] System 阶段、依赖与 Query
- [x] spawn/despawn command buffer
- [x] deterministic clock 与 seeded random
- [x] JSON inspect 输出
- [x] AI 修改任务集初版（≥10 个具体任务，如“给步枪加弹匣扩容”），用于反推 API 设计并支撑 DESIGN 13 的成功率指标

不发布稳定 API。

退出条件：无渲染环境下可确定性运行模拟测试；系统顺序和销毁语义明确。

## Phase 2：Three.js vertical slice

已实现：

- [x] Three.js adapter
- [x] Transform/Object3D 同步
- [x] 资产加载与所有权
- [x] FPS character motor
- [x] 输入、相机与 pointer lock
- [x] 基础 collider/physics adapter
- [x] Health、Damage、Hitscan Weapon
- [x] HUD DOM binding

退出条件：可玩 FPS 靶场，且底层 Three.js 可直接扩展。

## Phase 3：Bot 与回归验证

已实现：

- [x] Faction 与 Targeting
- [x] Sight/Hearing perception
- [x] Navigation adapter
- [x] State machine 与最小 behavior composition
- [x] 输入录制与回放
- [x] 截图、状态快照和 scenario tests

退出条件：Bot 可以搜索、追击和攻击；固定 seed 下测试结果稳定。

## Phase 4：真实游戏迁移

选择现有游戏的一段完整玩法迁移，而不是另写 demo：

- [x] 玩家移动与射击
- [x] 至少两类武器
- [x] 一种 Bot
- [x] 一种载具或重型武器
- [x] HUD、音频和粒子反馈

记录：

- [x] 迁移前后 gameplay 代码量
- [x] 重复逻辑减少与复用证据
- [x] escape hatch 使用位置
- [x] API 不足与错误抽象
- [x] AI 修改任务集成功率（12/12 自动测试）

退出条件：第二个游戏能复用核心模块，而不是复制后改名。

## Phase 5：首个公开版本

迁移验证后的决定见 `RELEASE.md`：

- [x] npm 包拆分粒度
- [x] 稳定 API 范围
- [x] License
- [x] 浏览器支持范围
- [x] Three.js peer dependency 范围
- [x] 文档与示例工程
- [x] 是否提供 CLI

## 暂不排期

- 可视化编辑器
- multiplayer replication
- 大型世界 streaming
- 完整动画图系统
- RPG ability framework
- RTS 群体寻路
- WebGPU 专用高级渲染
- 插件市场
