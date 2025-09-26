export const DEFAULT_AFTER_LOGIN = '/app';

export function resolveNextPath(raw) {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  if (!decoded || !decoded.startsWith('/')) {
    return DEFAULT_AFTER_LOGIN;
  }
  return decoded || DEFAULT_AFTER_LOGIN;
}
