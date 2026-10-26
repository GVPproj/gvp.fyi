/** Authenticate once; keep credentials and bounded response reads out of preparation code.
 * Callers sanitize errors at their build entry point.
 */
export async function publishingTransport(env, { timeout, limit, fetcher = fetch }) {
  const base = new URL(env.PUBLISHING_POCKETBASE_URL);
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(base.hostname))) ||
    base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
    !env.PUBLISHING_BUILD_EMAIL || !env.PUBLISHING_BUILD_PASSWORD) throw new Error();

  async function request(route, options, byteLimit) {
    const response = await fetcher(new URL(route, base), {
      ...options, redirect: 'error', signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok || !response.body) throw new Error();
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > byteLimit) throw new Error();
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  const auth = JSON.parse(await request('/api/collections/publishing_builds/auth-with-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.PUBLISHING_BUILD_EMAIL, password: env.PUBLISHING_BUILD_PASSWORD }),
  }, limit));
  if (typeof auth.token !== 'string' || !auth.token || auth.record?.collectionName !== 'publishing_builds') throw new Error();
  return (route, byteLimit = limit) => request(route, { headers: { Authorization: auth.token } }, byteLimit);
}
