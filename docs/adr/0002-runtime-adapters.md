# ADR-0002：渲染与物理 Adapter 边界

状态：Accepted

`Transform` 是模拟层事实源，Three adapter 在 render phase 单向写入 `Object3D`。`ManualTransform` 允许实体整体退出同步。资产工厂和 Entity/Object3D 映射由 adapter 持有，不进入 World 序列化。

Physics adapter 只读取 World Component 并写回模拟数据，gameplay 不引用 solver 对象。首个 `BasicPhysicsAdapter` 提供确定性积分和基础 raycast，用于验证协议；生产级 solver 以后作为独立 adapter 接入。

所有权规则：adapter 自己通过 asset factory 创建的对象由 adapter dispose；外部 attach 的对象默认由调用者管理。
