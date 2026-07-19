# ADR-0001：运行时 Schema

状态：Accepted

Component definition 同时包含稳定 ID、版本、默认值、可选 runtime validator 和 migration。TypeScript 负责静态类型，validator 负责外部场景数据边界。

暂不绑定单一第三方 schema 库。公共协议接受 predicate validator，后续可以提供 Standard Schema adapter，避免 Core 强制携带验证依赖。

序列化只保存稳定 ID、Component version 和纯数据；运行时对象留在 adapter 私有映射中。
