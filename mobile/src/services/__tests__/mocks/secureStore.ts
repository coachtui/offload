/**
 * In-memory stand-in for expo-secure-store (mapped in jest.config.js).
 * The map persists across imports within a test file — clearing it is the
 * test's job via __resetMockStore(), which is also how "fresh device" is
 * simulated.
 */

const store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return store.has(key) ? store.get(key)! : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

export function __resetMockStore(): void {
  store.clear();
}
