export const DEFAULT_AFTER_LOGIN = '/app';

export function resolveNextPath(raw) {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  if (!decoded.startsWith('/')) {
    return null;
  }
  return decoded;
}
