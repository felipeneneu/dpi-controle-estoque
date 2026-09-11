export async function checkHealth(baseUrl: string, timeoutMs = 4000): Promise<boolean> {
  const url = `${baseUrl.replace(/\/+$/, "")}/health`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const data = await res.json().catch(() => null);
    return res.ok && (data as { status?: string } | null)?.status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
