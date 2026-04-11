export const USER_PROFILE_KEY = 'broker-ui-user-profile';

/** @returns {Record<string, unknown> | null} */
export function getUserProfile() {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p === 'object' && p !== null ? p : null;
  } catch {
    return null;
  }
}

/**
 * Saves registration fields (never store passwords). Assigns UID on first save.
 * @param {Record<string, string>} data
 */
export function saveUserProfile(data) {
  const prev = getUserProfile() || {};
  const uid =
    prev.uid ||
    `BRK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const merged = {
    ...prev,
    ...data,
    uid,
    updatedAt: Date.now(),
  };
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(merged));
  return merged;
}
