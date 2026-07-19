# 钢铁前线迁移报告

## 范围

从《钢铁前线》样本选择玩家武器、两类武器、敌方 Bot、阵营、生命与伤害、HUD、音频和命中特效，重建为 `examples/steel-front-slice`。这不是复制原文件，而是用 GameWeave 公共 primitives 表达同一段玩法。

## 复用结果

- 步枪和 76mm 坦克炮共享 `Weapon`、`Ammo`、`defineWeapon`、`fire`、`reload`。
- 敌人复用 `BotController`、`Sensor`、`Targeting`、`NavigationAgent`、`StateMachine`。
- FPS 示例与迁移切片复用同一 Combat、Bots、Physics、Three 和 UI 包，没有复制包内实现。
- HTML HUD 只声明三个 binding；不再自行维护逐帧 DOM 更新。
- 音频与短暂命中特效仍留在游戏层，证明 escape hatch 可用于尚未稳定成通用 primitive 的反馈。

## API 不足与修正

- 初版把所有 Component 写入延迟到 phase 边界，阻断 Character → Physics 数据流；已修正为只有结构变化延迟。
- 初版 `Entity.set` 会用默认值覆盖未提供字段；迁移武器切换和 reload 时暴露问题，已改为合并当前值。
- 为迁移补充 `defineWeapon`、`hitscan`、`reload`、`Dead` 与结构化 `Query.where`。
- Physics 首个 adapter 只适合协议验证，不承担生产级碰撞求解；正式 solver 保持 adapter 边界。

## Escape hatch

迁移切片直接访问 `ThreeAdapter.scene` 创建短暂命中特效，并使用 Web Audio API 产生枪炮声。它们没有污染 Entity 序列化，也没有绕过托管 Transform。

## 代码量证据

2026-07-20 对原始样本中直接相关的八个模块执行 `wc -l`：weapons 118、ballistics 271、bot 1361、player 140、input 250、HUD 313、audio 334、particles 149，合计 2936 行。迁移切片由 `npm run metrics` 测得 51 行非空游戏层源码。

这不是“完整游戏等价重写”的 98% 缩减：原模块包含迁移切片没有覆盖的更多内容。它证明的是，在选定玩法范围内，通用循环、状态、Bot、战斗和 HUD 不再留在游戏层；第二个 FPS 示例同样只需 67 行非空编排代码。完整功能对等迁移不在 0.1.0 的范围内。
