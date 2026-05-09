export const STORAGE_KEY = 'botc_grimoire_state';

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {
    // Storage full or private mode — silently continue
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
