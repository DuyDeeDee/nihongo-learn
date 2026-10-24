type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

const memoryStore = new Map<string, CacheEntry<unknown>>();

export const clientCache = {
  get<T>(key: string): T | null {
    const entry = memoryStore.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      memoryStore.delete(key);
      return null;
    }
    return entry.data;
  },

  set<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): void {
    memoryStore.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  },

  invalidate(prefixOrKey: string): void {
    for (const key of memoryStore.keys()) {
      if (key.startsWith(prefixOrKey)) {
        memoryStore.delete(key);
      }
    }
  },

  clear(): void {
    memoryStore.clear();
  },
};
