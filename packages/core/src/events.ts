export type EventMap = Record<string, unknown>;

export class EventBus<Events extends EventMap = EventMap> {
  #listeners = new Map<keyof Events, Set<(event: never) => void>>();

  on<K extends keyof Events>(
    type: K,
    listener: (event: Events[K]) => void,
  ): () => void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener as (event: never) => void);
    this.#listeners.set(type, listeners);
    return () => this.off(type, listener);
  }

  once<K extends keyof Events>(
    type: K,
    listener: (event: Events[K]) => void,
  ): () => void {
    const unsubscribe = this.on(type, (event) => {
      unsubscribe();
      listener(event);
    });
    return unsubscribe;
  }

  off<K extends keyof Events>(
    type: K,
    listener: (event: Events[K]) => void,
  ): void {
    const listeners = this.#listeners.get(type);
    listeners?.delete(listener as (event: never) => void);
    if (listeners?.size === 0) this.#listeners.delete(type);
  }

  emit<K extends keyof Events>(type: K, event: Events[K]): void {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) {
      listener(event as never);
    }
  }

  clear(): void {
    this.#listeners.clear();
  }
}
