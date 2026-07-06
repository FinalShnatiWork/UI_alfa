export const USER_PROFILE_KEY = 'broker-ui-user-profile';

export interface UserProfile {
  uid?: string;
  firstName?: string;
  lastName?: string;
  idDoc?: string;
  email?: string;
  phone?: string;
  currency?: string;
  leverage?: string;
  updatedAt?: number;
  [extra: string]: unknown;
}

/**
 * Retrieves the cached client-side user profile information from localStorage.
 *
 * @returns UserProfile object or null if none is saved/parse error occurs
 */
export function getUserProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    return typeof p === 'object' && p !== null ? (p as UserProfile) : null;
  } catch {
    return null;
  }
}

/**
 * Saves profile data to local state (for offline support) and guarantees a unique UID.
 *
 * @param data partial profile fields to merge
 * @returns updated full UserProfile object
 */
export function saveUserProfile(data: Partial<UserProfile>): UserProfile {
  const prev = getUserProfile() ?? {};
  const uid =
    prev.uid ??
    `BRK-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
  const merged: UserProfile = {
    ...prev,
    ...data,
    uid,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(merged));
  } catch {
    /* private mode / quota */
  }
  return merged;
}
