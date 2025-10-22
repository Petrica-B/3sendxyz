type StoredValue = string | null;

const canUseBrowserStorage =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const storage = canUseBrowserStorage ? window.localStorage : null;

const AsyncStorage = {
  async getItem(key: string): Promise<StoredValue> {
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!storage) return;
    try {
      storage.setItem(key, value);
    } catch {
      /* no-op */
    }
  },

  async removeItem(key: string): Promise<void> {
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch {
      /* no-op */
    }
  },

  async clear(): Promise<void> {
    if (!storage) return;
    try {
      storage.clear();
    } catch {
      /* no-op */
    }
  },

  async getAllKeys(): Promise<string[]> {
    if (!storage) return [];
    try {
      return Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index);
        return key ?? '';
      }).filter(Boolean);
    } catch {
      return [];
    }
  },

  async multiGet(keys: string[]): Promise<[string, StoredValue][]> {
    const results = await Promise.all(
      keys.map(async (key) => [key, await AsyncStorage.getItem(key)] as const),
    );
    return results as [string, StoredValue][];
  },

  async multiSet(entries: [string, string][]): Promise<void> {
    await Promise.all(entries.map(([key, value]) => AsyncStorage.setItem(key, value)));
  },

  async multiRemove(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => AsyncStorage.removeItem(key)));
  },

  async mergeItem(key: string, value: string): Promise<void> {
    if (!storage) return;
    try {
      const existing = storage.getItem(key);
      if (!existing) {
        storage.setItem(key, value);
        return;
      }

      const merged = {
        ...JSON.parse(existing),
        ...JSON.parse(value),
      };

      storage.setItem(key, JSON.stringify(merged));
    } catch {
      // If JSON parsing fails, fall back to overriding the value
      try {
        storage?.setItem(key, value);
      } catch {
        /* no-op */
      }
    }
  },
};

export { AsyncStorage };
export default AsyncStorage;

