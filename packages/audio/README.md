# @gameweave/audio

GameWeave 音频 adapter：WebAudio 空间化播放、程序化合成音源注册、总线音量。

```ts
import { audio, WebAudioAdapter } from "@gameweave/audio";

const plugin = audio();
game.use(plugin);

plugin.adapter.register("shot", { synth: ctx => renderShot(ctx) });
plugin.adapter.register("theme", { url: "/audio/theme.ogg" });

plugin.adapter.play("shot", { position: [4, 1, -8], pitch: .95 });
plugin.adapter.setListener(cameraPosition, cameraForward);
```

- `synth` 音源在首次播放时渲染并缓存，零外部素材即可发声。
- `position` 走 PannerNode 线性衰减；省略则为 2D 音效。
- headless / 测试环境用 `NullAudioAdapter`（默认在无 `AudioContext` 环境自动选择），播放调用可断言。
