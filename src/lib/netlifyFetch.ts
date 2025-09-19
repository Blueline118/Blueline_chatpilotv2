export async function netlifyJson(path: string, init: RequestInit = {}) {
  const res = await fetch(`/.netlify/functions/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (error) {
    body = null;
  }

  if (!res.ok) {
    const message =
      (typeof body?.error === 'string' && body.error) ||
      (body?.error?.message as string | undefined) ||
      res.statusText ||
      'Request failed';
    throw new Error(message);
  }

  return body;
}
