export type AppMode = 'tuning' | 'practice' | 'score';

const STORAGE_KEY = 'pitch-lab-mode';

type ModeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isAppMode(value: string | null): value is AppMode {
  return value === 'tuning' || value === 'practice' || value === 'score';
}

export class ModeStore {
  private mode: AppMode;
  private readonly listeners = new Set<(mode: AppMode) => void>();
  private readonly storage: ModeStorage | null;

  constructor(storage?: ModeStorage) {
    this.storage = storage ?? defaultStorage();
    let saved: string | null = null;
    try {
      saved = this.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      this.storage = null;
    }
    if (isAppMode(saved)) {
      this.mode = saved;
    } else {
      this.mode = 'tuning';
      if (saved !== null) {
        try {
          this.storage?.removeItem(STORAGE_KEY);
        } catch {
          // Preference persistence is optional; mode switching remains usable.
        }
      }
    }
  }

  get current(): AppMode {
    return this.mode;
  }

  set(mode: AppMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    try {
      this.storage?.setItem(STORAGE_KEY, mode);
    } catch {
      // Preference persistence is optional; notify the live app regardless.
    }
    this.listeners.forEach((listener) => listener(mode));
  }

  subscribe(listener: (mode: AppMode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function defaultStorage(): ModeStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
