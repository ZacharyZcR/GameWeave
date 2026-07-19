# GameWeave 设计评审指南

感谢评审。当前仓库没有实现代码，评审目标是尽早发现对象模型、抽象边界和产品定位的问题，而不是讨论命名格式等细节。

## 建议阅读顺序

1. `README.md`
2. `docs/DESIGN.md`
3. `docs/API.md`
4. `docs/ROADMAP.md`

## 希望重点回答的问题

### 产品边界

1. “Three.js 上层 gameplay library”是否足够清晰？
2. 哪些能力属于通用 gameplay primitive，哪些应该留在游戏或类型包中？
3. 是否存在已经解决这一问题、但本文档遗漏的重要项目？

### 对象模型

4. 对外 Entity + Component、内部 System 批处理是否兼顾易用性和性能？
5. Entity facade 会不会造成状态所有权混乱或隐藏昂贵操作？
6. Component 应当是纯数据、带少量方法的对象，还是允许完整生命周期？
7. Controller 应当是 Component、独立 Entity，还是普通服务对象？

### 调度与确定性

8. 生命周期阶段是否足够？
9. System 依赖拓扑、阶段排序和 command buffer 的语义是否清楚？
10. 浏览器游戏中确定性应承诺到什么程度，才不会形成虚假保证？

### 序列化

11. runtime schema 选择什么方案最合适？
12. Prefab + override 是否足够，还是需要 composition/mixins？
13. Entity 引用、资产引用和插件自定义数据应如何迁移版本？

### Three.js 集成

14. Transform 与 Object3D 谁是事实源？如何避免双向同步和循环更新？
15. renderer、asset、physics 对象的创建与 dispose 所有权如何定义？
16. escape hatch 应开放到什么程度，才能自由扩展又不破坏 invariant？

### AI-native

17. 哪些接口能真正提高 AI 修改代码的可靠性？
18. Inspector JSON、schema、回放和 scenario test 是否足够？
19. 如何设计可量化的 AI 开发成功率测试，而不是停留在宣传语言？

## 评审输出格式

建议按严重程度整理：

```text
Blocking
- 会导致架构无法成立或必须重写的问题

Major
- 应在 Core spike 前解决的重要设计问题

Minor
- 可以在实现过程中调整的问题

Open questions
- 需要原型或 benchmark 才能回答的问题
```

每条意见最好包含：

- 对应文档章节
- 具体失败场景
- 推荐修改
- 推荐方案的代价

## 已裁决（欢迎评审挑战裁决本身）

- facade 写路径：所有 facade 方法糖化为 Component 写入或消息入队，在 System 阶段结算，无第二条写路径
- Transform/Object3D：Transform 单向权威，托管字段只读，`ManualTransform` 显式 opt-out
- 确定性分层：核心模拟跨环境确定，物理同机同版本可回归，渲染不承诺
- 输入录制以 fixed tick 为单位，回放对齐 tick 序列
- Controller 是 Component，InputSource 通过注册名引用

## 当前已知争议

- runtime schema 的依赖和性能成本
- Prefab override 的复杂度上限
- 事件总线与 typed data channel 的边界
- AI 友好与普通开发者体验是否需要不同 API
- `ManualTransform` opt-out 的粒度（整个变换还是逐字段）
