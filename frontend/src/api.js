/**
 * Browser fetch wrapper so session cookies are sent on cross-origin dev (Vite proxy)
 * and same-origin Docker nginx → Flask.
 */

export function apiFetch(input, init = {}) {
  return fetch(input, { ...init, credentials: 'include' })
}
