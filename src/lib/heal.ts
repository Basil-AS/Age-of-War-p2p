/**
 * Stale-cache self-heal: an old service worker can serve an outdated bundle that asks for files that
 * no longer exist. On a boot failure we drop every service worker + cache once and reload.
 */
export async function purgeAndReload(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {
    /* best effort */
  }
  location.reload();
}

/** returns true when a reload was triggered (only ever once per tab session) */
export function healOnce(): boolean {
  try {
    if (sessionStorage.getItem('aow.healed')) return false;
    sessionStorage.setItem('aow.healed', '1');
  } catch {
    return false;
  }
  void purgeAndReload();
  return true;
}
