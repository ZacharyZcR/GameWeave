# Three.js 游戏样本分析

## 钢铁前线

样本将玩法拆成约 40 个 JavaScript 文件，重复实现了 renderer、terrain、collision、navigation、particles、weather、weapons、soldier、ragdoll、ballistics、bot、tank、APC、plane、player、input、camera、game mode、HUD 和 touch。

适合进入 GameWeave 的稳定重复项：Game loop、Transform、碰撞适配、CharacterMotor、Controller、Health/Damage、Weapon/Ammo、Faction、Bot perception、HUD binding、对象生命周期和调试状态。

仍应保留在游戏层：具体战役、地图生成规则、武器平衡、坦克和飞机的专属操控手感。

## wrsk

样本同样自行实现 audio、creatures、data、factory、model library、network、player、space、station、textures、UI 和 world。其中模型源码膨胀到约 11 MB，证明资源表示不能与 gameplay 源码混合。

适合进入 GameWeave 的稳定重复项：World/Entity、资产注册、Prefab、输入、UI、序列化、网络边界和运行时 Inspector。

仍应保留在游戏层：空间站生成、具体生物行为、世界观数据和联机规则。

## 提取结论

只有两个样本都出现、或 FPS vertical slice 直接需要的能力进入通用层。GameWeave 不抽象具体内容，只抽象稳定协议和数据流。
