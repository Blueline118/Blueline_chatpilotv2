// Structured logging helpers
function asObject(data) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }
  if (data === undefined) return {};
  return { value: data };
}

export function warn(event, data = {}) {
  console.warn(event, asObject(data));
}

export function error(event, data = {}) {
  console.error(event, asObject(data));
}
