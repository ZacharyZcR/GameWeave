# 核心术语

- **Game**：应用生命周期、World 集合、Plugin 和全局 Service 的所有者。
- **World**：可独立推进、查询、检查和序列化的模拟空间。
- **Entity**：稳定 ID 与操作 facade，不承载独立更新循环。
- **Component**：由稳定 ID 标识的类型化状态。
- **System**：在显式 phase 中批量读取或修改 Component 的逻辑。
- **Structural change**：spawn、despawn、add、remove Component；在 phase 边界提交。
- **Value change**：修改已有 Component 的数据；立即对后续 System 可见。
- **Prefab**：可复用 Entity 配方，实例化时允许显式 override。
- **Resource**：由 World 拥有、无需附着 Entity 的共享状态。
- **Service**：由 Game 拥有的外部能力，例如 renderer、input、physics。
- **Plugin**：向 Game 与 World 安装 Service、Component 和 System 的模块。
- **Adapter**：把外部实现映射到 GameWeave 稳定接口的边界层。
- **Fixed tick**：确定性核心模拟的离散时间单位。
- **Inspector snapshot**：与运行状态脱离的结构化只读快照。
- **Escape hatch**：显式访问 Three.js 等底层对象的扩展入口。
