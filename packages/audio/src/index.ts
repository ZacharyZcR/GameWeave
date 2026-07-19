import { definePlugin, type GamePlugin } from "@gameweave/core";

export type SoundSource =
  | { readonly synth: (ctx: BaseAudioContext) => AudioBuffer }
  | { readonly url: string };

export type AudioBus = "sfx" | "music";

export interface PlayOptions {
  readonly volume?: number;
  readonly pitch?: number;
  readonly position?: readonly [number, number, number];
  readonly bus?: AudioBus;
  readonly loop?: boolean;
}

export interface PlayHandle {
  stop(): void;
}

export interface AudioAdapter {
  initialize?(): void | Promise<void>;
  register(id: string, source: SoundSource): void;
  play(id: string, options?: PlayOptions): PlayHandle;
  setListener(position: readonly [number, number, number], forward?: readonly [number, number, number]): void;
  setBusVolume(bus: AudioBus | "master", volume: number): void;
  dispose?(): void;
}

const noHandle: PlayHandle = { stop() {} };

// headless 与测试环境的适配器：记录调用，不产生声音
export class NullAudioAdapter implements AudioAdapter {
  readonly registered = new Set<string>();
  readonly played: { id: string; options: PlayOptions }[] = [];

  register(id: string, _source: SoundSource): void {
    if (this.registered.has(id)) throw new Error(`Sound already registered: ${id}`);
    this.registered.add(id);
  }

  play(id: string, options: PlayOptions = {}): PlayHandle {
    if (!this.registered.has(id)) throw new Error(`Unknown sound: ${id}`);
    this.played.push({ id, options });
    return noHandle;
  }

  setListener(): void {}
  setBusVolume(): void {}
}

interface BusNodes {
  readonly master: GainNode;
  readonly sfx: GainNode;
  readonly music: GainNode;
}

export class WebAudioAdapter implements AudioAdapter {
  #ctx: AudioContext | undefined;
  #buses: BusNodes | undefined;
  #sources = new Map<string, SoundSource>();
  #buffers = new Map<string, AudioBuffer>();
  #loading = new Set<string>();

  register(id: string, source: SoundSource): void {
    if (this.#sources.has(id)) throw new Error(`Sound already registered: ${id}`);
    this.#sources.set(id, source);
  }

  play(id: string, options: PlayOptions = {}): PlayHandle {
    const source = this.#sources.get(id);
    if (!source) throw new Error(`Unknown sound: ${id}`);
    const ctx = this.#context();
    if (ctx.state === "suspended") void ctx.resume();
    const buffer = this.#bufferOf(id, source, ctx);
    if (!buffer) return noHandle;

    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = options.pitch ?? 1;
    node.loop = options.loop ?? false;
    const gain = ctx.createGain();
    gain.gain.value = options.volume ?? 1;

    let head: AudioNode = node;
    if (options.position) {
      const panner = ctx.createPanner();
      panner.panningModel = "equalpower";
      panner.distanceModel = "linear";
      panner.refDistance = 2;
      panner.maxDistance = 48;
      panner.positionX.value = options.position[0];
      panner.positionY.value = options.position[1];
      panner.positionZ.value = options.position[2];
      head.connect(panner);
      head = panner;
    }
    head.connect(gain);
    gain.connect(this.#busNodes()[options.bus ?? "sfx"]);
    node.start();
    return { stop: () => { try { node.stop(); } catch { /* already ended */ } } };
  }

  setListener(position: readonly [number, number, number], forward?: readonly [number, number, number]): void {
    const listener = this.#context().listener;
    if ("positionX" in listener && listener.positionX) {
      listener.positionX.value = position[0];
      listener.positionY.value = position[1];
      listener.positionZ.value = position[2];
      if (forward) {
        listener.forwardX.value = forward[0];
        listener.forwardY.value = forward[1];
        listener.forwardZ.value = forward[2];
      }
    } else {
      listener.setPosition(position[0], position[1], position[2]);
      if (forward) listener.setOrientation(forward[0], forward[1], forward[2], 0, 1, 0);
    }
  }

  setBusVolume(bus: AudioBus | "master", volume: number): void {
    this.#busNodes()[bus].gain.value = volume;
  }

  dispose(): void {
    void this.#ctx?.close();
    this.#ctx = undefined;
    this.#buses = undefined;
    this.#buffers.clear();
    this.#loading.clear();
  }

  #context(): AudioContext {
    this.#ctx ??= new AudioContext();
    return this.#ctx;
  }

  #busNodes(): BusNodes {
    if (!this.#buses) {
      const ctx = this.#context();
      const master = ctx.createGain();
      master.connect(ctx.destination);
      const sfx = ctx.createGain();
      sfx.connect(master);
      const music = ctx.createGain();
      music.connect(master);
      this.#buses = { master, sfx, music };
    }
    return this.#buses;
  }

  #bufferOf(id: string, source: SoundSource, ctx: AudioContext): AudioBuffer | undefined {
    const cached = this.#buffers.get(id);
    if (cached) return cached;
    if ("synth" in source) {
      const buffer = source.synth(ctx);
      this.#buffers.set(id, buffer);
      return buffer;
    }
    // URL 音源异步解码；就绪前的 play 静默丢弃
    if (!this.#loading.has(id)) {
      this.#loading.add(id);
      void fetch(source.url)
        .then((response) => response.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => this.#buffers.set(id, buffer))
        .finally(() => this.#loading.delete(id));
    }
    return undefined;
  }
}

function defaultAdapter(): AudioAdapter {
  return typeof AudioContext === "undefined" ? new NullAudioAdapter() : new WebAudioAdapter();
}

export function audio(adapter: AudioAdapter = defaultAdapter()): GamePlugin & { readonly adapter: AudioAdapter } {
  return {
    ...definePlugin({
      id: "gameweave.audio",
      install: (game) => game.provide("audio", adapter),
      start: () => adapter.initialize?.(),
    }),
    adapter,
  };
}
