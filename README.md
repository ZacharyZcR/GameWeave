# GameWeave

> Gameplay primitives for Three.js.

GameWeave is a modular TypeScript game library built on top of Three.js. It packages recurring game systems—characters, weapons, AI, physics integration, UI, localization, debugging, and distribution—into composable and inspectable APIs designed for both human and AI-assisted development.

The project is currently a local 0.1.0 release candidate. APIs may still change throughout the 0.x series and the packages have not yet been published to npm.

## Why GameWeave

Three.js provides the rendering building blocks for a 3D world. GameWeave provides the gameplay building blocks required to turn that world into a game.

GameWeave is:

- TypeScript-first, browser-first, and code-first
- A gameplay library layered on top of Three.js
- Data-driven, modular, and incrementally adoptable
- Designed for generating, modifying, inspecting, and testing games with AI

GameWeave is not:

- A new WebGL or WebGPU renderer
- A browser clone of Godot, Unity, or Unreal Engine
- A mandatory visual editor or full IDE
- A custom physics, modeling, or animation package
- A natural-language wrapper around existing tools

## Packages

```text
@gameweave/core          Simulation, serialization, plugins, and prefabs
@gameweave/three         Three.js rendering and asset integration
@gameweave/physics       Physics protocol, Rapier adapter, and test adapter
@gameweave/character     Input, capsule movement, controllers, and camera rigs
@gameweave/combat        Health, damage, weapons, ammunition, and projectiles
@gameweave/bots          Perception, targeting, navigation, and behaviors
@gameweave/i18n          Runtime localization with English defaults
@gameweave/ui            DOM HUD bindings and screen projection
@gameweave/debug         Inspector, input recording, and scenarios
@gameweave/cli           Game build and export commands
@gameweave/export-tauri  Tauri 2 desktop exporter
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Run the complete FPS showcase:

```bash
npm run dev --workspace @gameweave/example-showcase
```

The default interface language is English. Append `?lang=zh-CN` to the showcase URL to verify the optional Chinese catalog.

## Examples

- `examples/showcase`: playable FPS demonstrating asset loading, capsule movement, muzzle projectiles, reloads, grenades, ragdoll death, rigid-body collisions, destructible props, and enemy AI.
- `examples/fps`: minimal FPS vertical slice.
- `examples/steel-front-slice`: migration slice extracted from an existing game.

Examples are private workspaces used for testing and demonstration. They are not published to npm.

## Documentation

- [Design](docs/DESIGN.md)
- [API](docs/API.md)
- [Roadmap](docs/ROADMAP.md)
- [Review guide](docs/REVIEW.md)
- [Glossary](docs/GLOSSARY.md)
- [Sample analysis](docs/SAMPLE_ANALYSIS.md)
- [AI modification tasks](docs/AI_TASKS.md)
- [Migration report](docs/MIGRATION_REPORT.md)
- [0.1.0 release decision](docs/RELEASE.md)
- [0.1.0 completion audit](docs/COMPLETION_AUDIT.md)

Some detailed design documents are currently written in Chinese. Public package documentation and user-facing defaults are English.

## License

MIT. See [LICENSE](LICENSE).
