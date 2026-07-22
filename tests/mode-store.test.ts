import { describe, expect, it, vi } from 'vitest';
import { ModeStore, type AppMode } from '../src/app/mode-store';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('ModeStore', () => {
  it('defaults to tuning and persists valid changes', () => {
    const storage = new MemoryStorage();
    const store = new ModeStore(storage);
    expect(store.current).toBe('tuning');
    store.set('practice');
    expect(store.current).toBe('practice');
    expect(new ModeStore(storage).current).toBe('practice');
    store.set('score');
    expect(new ModeStore(storage).current).toBe('score');
  });

  it('discards corrupt persisted values', () => {
    const storage = new MemoryStorage();
    storage.setItem('pitch-lab-mode', 'unknown');
    expect(new ModeStore(storage).current).toBe('tuning');
    expect(storage.getItem('pitch-lab-mode')).toBeNull();
  });

  it('notifies only when the mode actually changes', () => {
    const store = new ModeStore(new MemoryStorage());
    const listener = vi.fn<(mode: AppMode) => void>();
    const unsubscribe = store.subscribe(listener);
    store.set('tuning');
    store.set('practice');
    store.set('practice');
    unsubscribe();
    store.set('tuning');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('practice');
  });

  it('keeps mode switching live when browser storage is blocked', () => {
    const storage = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };
    const store = new ModeStore(storage);
    const listener = vi.fn<(mode: AppMode) => void>();
    store.subscribe(listener);
    store.set('practice');
    expect(store.current).toBe('practice');
    expect(listener).toHaveBeenCalledWith('practice');
  });
});
