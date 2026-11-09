// Resolve only credential-free HTTP(S) destinations; malformed links stay inert.
export function resolveWebURL(value: string, base?: URL) {
  try {
    const url = new URL(value, base);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
