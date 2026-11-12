import { del, get, set } from 'idb-keyval';
import type { GameState } from './types';

const KEY = 'costruiamo-un-parco/salvataggio';

export interface SaveStore {
  load(): Promise<GameState | undefined>;
  save(state: GameState): Promise<void>;
  clear(): Promise<void>;
}

/** Salvataggio nel browser (IndexedDB): sopravvive alla chiusura della scheda. */
export const browserStore: SaveStore = {
  load: () => get<GameState>(KEY),
  save: (state) => set(KEY, structuredClone(state)),
  clear: () => del(KEY),
};

export function memoryStore(): SaveStore {
  let data: GameState | undefined;
  return {
    load: async () => (data ? structuredClone(data) : undefined),
    save: async (s) => void (data = structuredClone(s)),
    clear: async () => void (data = undefined),
  };
}

export function exportSave(state: GameState): Blob {
  return new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
}
