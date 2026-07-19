# 0.1.0 发布决策

状态：Ready for local packaging；尚未发布到 npm。

- **包拆分**：保留八个按职责划分的包，避免安装未使用的 gameplay 模块。
- **稳定范围**：0.1.0 保证 Definition ID、World/Entity/Component/System、Plugin、adapter 边界和序列化 version 语义；具体 gameplay 字段仍允许在 0.x 调整。
- **License**：MIT。
- **浏览器范围**：支持具备 ES2022、WebGL2、Web Audio 和 Pointer Lock 的现代 evergreen 浏览器；headless Core 不依赖 DOM。
- **Three.js**：`@gameweave/three` 和 `@gameweave/ui` 使用 `three ^0.180.0` peer dependency，避免重复 Three 实例。
- **文档与示例**：仓库文档为事实源，提供 FPS 和钢铁前线迁移切片。
- **CLI**：`@gameweave/cli` 将游戏构建为标准 Web 发行目录，再由独立 exporter 包装平台产物。

## 游戏导出

```bash
gameweave build
gameweave export web
gameweave export windows
```

`build` 生成 `dist/gameweave.manifest.json`，`export web` 生成带版本号的 zip。桌面导出使用 Tauri 2，并且必须在目标操作系统上构建；追加 `--prepare` 可以只生成 `src-tauri` 而不编译 installer。

发布前门禁：`npm run typecheck`、`npm test`、`npm run build`、所有公共包 `npm pack --dry-run`。
