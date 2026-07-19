# 设计评审结果

外部评审对初稿作出了以下实质修改，并已进入实现：

- facade 写路径统一为 Component 写入或消息入队。
- Transform 单向权威，外部控制必须使用 `ManualTransform`。
- 确定性按核心、物理、渲染分层承诺。
- 输入录制按 fixed tick 对齐。
- Controller 采用可序列化 Component，InputSource 只保存注册名。
- Query 在单次迭代中稳定，结构变化在 phase 边界提交。
- 已有 Component 的 value change 对同 phase 后续 System 立即可见。
- Prefab 首版只支持单模板与 override。
- runtime schema 采用 predicate + version + migration，保留第三方 adapter 空间。

评审中发现的主要冲突已经通过 Core、Character、Physics 和迁移测试验证，不再存在未裁决的 Blocking 项。
