// Kiosk screens stay open for days, so a new deploy never reaches them unless someone reloads.
// Check the live index.html for a new bundle name and reload once the screen is idle.

const BUNDLE_RE = /\/assets\/index-[\w-]+\.js/;

function currentBundle(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  const m = s && s.src.match(BUNDLE_RE);
  return m ? m[0] : null;
}

export async function hasNewVersion(): Promise<boolean> {
  const mine = currentBundle();
  if (!mine) return false; // dev server or unknown layout
  try {
    const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const m = (await res.text()).match(BUNDLE_RE);
    return !!m && m[0] !== mine;
  } catch {
    return false;
  }
}

/**
 * Polls for a new deploy. When one is found, reloads as soon as isIdle() is true
 * and nobody has touched the screen for idleMs.
 */
export function startAutoUpdate(isIdle: () => boolean, everyMs = 5 * 60 * 1000, idleMs = 30 * 1000): () => void {
  let lastTouch = Date.now();
  let pending = false;
  const touch = () => { lastTouch = Date.now(); };
  const evs = ['pointerdown', 'keydown', 'touchstart'];
  evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));

  const check = async () => {
    if (!pending) pending = await hasNewVersion();
  };
  const tryReload = () => {
    if (pending && isIdle() && Date.now() - lastTouch >= idleMs) window.location.reload();
  };
  const poll = window.setInterval(check, everyMs);
  const tick = window.setInterval(tryReload, 5000);
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };
  document.addEventListener('visibilitychange', onVisible);
  check();

  return () => {
    window.clearInterval(poll);
    window.clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisible);
    evs.forEach((e) => window.removeEventListener(e, touch));
  };
}
