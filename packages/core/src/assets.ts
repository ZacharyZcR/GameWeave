import { definePlugin } from "./plugin.js";

export interface AssetRequest {
  readonly id: string;
  readonly type: string;
  readonly url: string;
}

export interface AssetProgress {
  readonly loaded: number;
  readonly total: number;
  readonly current?: AssetRequest;
}

export type AssetLoader<T = unknown> = (url: string, signal?: AbortSignal) => Promise<T>;
export type AssetProgressListener = (progress: AssetProgress) => void;

interface CacheEntry {
  readonly request: AssetRequest;
  readonly promise: Promise<unknown>;
  value?: unknown;
}

export class AssetManager {
  #loaders = new Map<string, AssetLoader>();
  #cache = new Map<string, CacheEntry>();
  #listeners = new Set<AssetProgressListener>();

  register<T>(type: string, loader: AssetLoader<T>): this {
    if (!type.trim()) throw new Error("Asset loader type must not be empty");
    if (this.#loaders.has(type)) throw new Error(`Asset loader already registered: ${type}`);
    this.#loaders.set(type, loader as AssetLoader);
    return this;
  }

  load<T>(request: AssetRequest, signal?: AbortSignal): Promise<T> {
    const cached = this.#cache.get(request.id);
    if (cached) {
      if (cached.request.type !== request.type || cached.request.url !== request.url) {
        throw new Error(`Asset id already points to another resource: ${request.id}`);
      }
      return cached.promise as Promise<T>;
    }
    const loader = this.#loaders.get(request.type);
    if (!loader) throw new Error(`Unknown asset loader: ${request.type}`);
    const entry: CacheEntry = {
      request: { ...request },
      promise: loader(request.url, signal).then((value) => {
        entry.value = value;
        return value;
      }).catch((error: unknown) => {
        this.#cache.delete(request.id);
        throw error;
      }),
    };
    this.#cache.set(request.id, entry);
    return entry.promise as Promise<T>;
  }

  async preload(requests: readonly AssetRequest[], signal?: AbortSignal): Promise<void> {
    let loaded = 0;
    this.#emit({ loaded, total: requests.length });
    await Promise.all(requests.map(async (request) => {
      await this.load(request, signal);
      loaded += 1;
      this.#emit({ loaded, total: requests.length, current: request });
    }));
  }

  get<T>(id: string): T | undefined {
    return this.#cache.get(id)?.value as T | undefined;
  }

  has(id: string): boolean {
    return this.#cache.has(id);
  }

  unload(id: string, dispose?: (asset: unknown) => void): boolean {
    const entry = this.#cache.get(id);
    if (!entry) return false;
    if (entry.value !== undefined) dispose?.(entry.value);
    return this.#cache.delete(id);
  }

  clear(dispose?: (asset: unknown) => void): void {
    for (const id of [...this.#cache.keys()]) this.unload(id, dispose);
  }

  onProgress(listener: AssetProgressListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(progress: AssetProgress): void {
    for (const listener of this.#listeners) listener(progress);
  }
}

export function assets(manager = new AssetManager()) {
  return {
    ...definePlugin({ id: "gameweave.assets", install: (game) => game.provide("assets", manager) }),
    manager,
  };
}
