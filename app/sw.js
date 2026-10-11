/* Sakura PWA service worker.
 *
 * It:
 *   1. precaches ONE build's shell at install — the document, its
 *      content-hashed bundle, and the fonts, icon fonts and small assets it
 *      needs — so the app can boot offline from the very first visit
 *   2. serves navigations network-first, falling back to that shell when the
 *      network fails, returns a 5xx, or takes longer than NAV_TIMEOUT_MS
 *   3. serves content-hashed build assets cache-first
 *   4. serves downloads from the offline library, cache-only
 *   5. passes everything else straight through
 *
 * It used to precache nothing: the shell was stored only when a navigation
 * passed through the worker, and the first page load never does (the worker is
 * not controlling it yet). So someone who downloaded chapters on their first
 * visit and reopened the app offline got a bare "Offline" page on every route,
 * Downloads included: the downloads were in the cache, and unreachable.
 *
 * Precaching is safe here in a way it usually is not. Everything precached is
 * content-hashed except the document; the document is network-first; and the
 * cached document is only ever replaced together with the bundle it loads. So
 * an online user always gets the newest build, and an offline one always gets
 * a document whose bundle is actually in the cache.
 *
 * This file can brick an installed PWA for every user at once, which is why it
 * stays small and why the two rules below are absolute.
 */

// Shell cache. Versioned, and swept on activate.
const SHELL_CACHE = 'sakura-shell-v2';
const SHELL = '/app/';

/**
 * The offline library. NEVER swept.
 *
 * RULE 1: only caches named `sakura-shell-*` may be deleted here, and nothing
 * in this file deletes an entry from the library.
 *
 * The previous version deleted every key that was not the current shell cache,
 * and because install() calls skipWaiting(), that ran on EVERY deploy. Any
 * downloaded chapter would have been destroyed by the next release — silently,
 * and for everyone at once. The library is deliberately not versioned: its
 * contents are user data, not build output, and nothing here may assume it can
 * be regenerated.
 */
const LIBRARY_CACHE = 'sakura-offline-v1';

/**
 * Same-origin URL prefix for downloads.
 *
 * Pages are stored under synthetic URLs rather than as blobs so the reader can
 * keep rendering `<Image source={{ uri }}>` with no idea the page is local —
 * that is the whole reason this uses Cache Storage rather than OPFS, which
 * would force blob: URL minting and revocation bookkeeping into the reader.
 *
 * Must sit inside the worker's registration scope (/app/) or these requests
 * never reach this handler. Mirrors OFFLINE_PREFIX in
 * sakura-mobile/lib/offline-cache-keys.ts; everything under it (pages, HLS
 * playlists and segments, title snapshots, covers) is served the same way.
 */
const OFFLINE_PREFIX = '/app/__offline/';

/**
 * This build's precache list, written in by web/scripts/write-precache-manifest.mjs:
 *   { build: '<bundle hash>', urls: ['/app/_expo/static/js/web/index-<hash>.js', '/app/assets/…', …] }
 * Every URL in it is content-hashed. The document is not listed: it is always
 * SHELL, and it is fetched fresh at install.
 *
 * Inlined rather than fetched from a separate file so that sw.js changes byte
 * for byte on every deploy. That is the only thing that makes a browser install
 * a new worker: an identical sw.js never runs install again, so a list fetched
 * at install would have been read once, on the first visit, and never again.
 *
 * null in web/public/sw.js itself. An unbuilt copy has no export to precache,
 * so install caches nothing up front and activate prunes nothing.
 */
const PRECACHE = /* @sakura-precache */ {"build":"e3fd772cdf6dbd8af5fd09e465d64c0d","urls":["/app/_expo/static/css/anime-discovery.web-71d9270b1291aa0d5f7e48712d5f5fa1.css","/app/_expo/static/css/novel-discovery.web-053e858682585e077412d631a1f53a48.css","/app/_expo/static/css/manga-catalog.web-9435da89858765f29ea641430a2e38d4.css","/app/_expo/static/js/web/index-e3fd772cdf6dbd8af5fd09e465d64c0d.js","/app/assets/vendor/@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.2b1bb82750274fc2d1043bf3891cb531.ttf","/app/assets/vendor/@expo-google-fonts/nunito/700Bold/Nunito_700Bold.c133c0b8cd169e7798d0cd239477cf32.ttf","/app/assets/vendor/@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.b1364260246b29fd9393a1a071f3af61.ttf","/app/assets/vendor/@expo-google-fonts/nunito/400Regular/Nunito_400Regular.f04f0e9ff969fd52a75deade3a9761cd.ttf","/app/assets/vendor/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/SimpleLineIcons.d2285965fe34b05465047401b8595dd0.ttf","/app/assets/vendor/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Entypo.31b5ffea3daddc69dd01a1f3d6cf63c5.ttf","/app/assets/vendor/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Regular.370dd5af19f8364907b6e2c41f45dbbf.ttf","/app/assets/vendor/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Octicons.871378c6eab492a3e689a9385dc45a12.ttf","/app/assets/vendor/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/AntDesign.3f78af31cca60105799838a1a7a59fbd.ttf","/app/assets/vendor/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Brands.56c8d80832e37783f12c05db7c8849e2.ttf","/app/assets/vendor/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.b4eb097d35f44ed943676fd56f6bdc51.ttf","/app/assets/vendor/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Solid.adec7d6f310bc577f05e8fe06a5daccf.ttf","/app/assets/vendor/expo-router/assets/file.19eeb73b9593a38f8e9f418337fc7d10.png","/app/assets/vendor/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7.png","/app/assets/vendor/expo-router/assets/forward.d8b800c443b8972542883e0b9de2bdc6.png","/app/assets/vendor/expo-router/assets/react-navigation/elements/back-icon.35ba0eaec5a4f5ed12ca16fabeae451d.png","/app/assets/vendor/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55.png","/app/assets/vendor/expo-router/assets/pkg.ab19f4cbc543357183a20571f68380a3.png","/app/assets/vendor/expo-router/assets/sitemap.412dd9275b6b48ad28f5e3d81bb1f626.png","/app/assets/vendor/expo-router/assets/error.d1ea1496f9057eb392d5bbf3732a61b7.png","/app/assets/vendor/expo-router/assets/react-navigation/elements/back-icon-mask.0a328cd9c1afd0afe8e3b1ec5165b1b4.png","/app/assets/vendor/expo-router/assets/react-navigation/elements/search-icon.286d67d3f74808a60a78d3ebf1a5fb57.png","/app/assets/vendor/expo-router/assets/unmatched.20e71bdf79e3a97bf55fd9e164041578.png","/app/assets/vendor/expo-router/assets/arrow_down.017bc6ba3fc25503e5eb5e53826d48a8.png","/app/assets/generated/card-images/psyopanime.70ce83757eb64d0837bb3389fdc0d195.webp","/app/assets/_sakura-mobile/assets/sounds/tap.15b0efd7b20ecc3b05183915349b9fb5.mp3","/app/assets/generated/card-images/burnie-senders-poster.faca659d250da3043bf073daa0b30c49.webp","/app/assets/generated/card-images/degenfiles-ep1.a20c43f150b3485e8db517e6ca826f2d.webp","/app/assets/_sakura-mobile/assets/images/sakura-textlogo.cb81e3e4f8217141c91d706d539a0ea1.png","/app/assets/generated/card-images/degenfiles.d078915f65f1c8711bc3909ac4cc5595.webp","/app/assets/_sakura-mobile/assets/sounds/switch.d94c1be6d1da27259b4e14b01f14b6df.wav","/app/assets/generated/card-images/2he.23eec8ad96b32100867fd38ee75e87f4.webp","/app/assets/_sakura-mobile/assets/images/logo.499f460218847ca80d1dc1dc2e5e42b8.png"]};

/**
 * How long a navigation waits on the network before the cached shell is served
 * instead. With no limit, a captive portal or a connection that is technically
 * up but useless never reached the fallback: the fetch neither succeeds nor
 * fails, and the user stares at a white screen. The slow response still lands
 * in the background and refreshes the shell for next time.
 */
const NAV_TIMEOUT_MS = 4000;

/** Parallel fetches while precaching. Install runs while the page is loading. */
const PRECACHE_CONCURRENCY = 4;
// A stalled CDN response must not leave the first worker installing forever.
const PRECACHE_TIMEOUT_MS = 60_000;

/**
 * How long a freshly fetched document may wait for its bundle to reach the
 * cache (the page is loading it) before giving up on adopting it as the shell.
 */
const ADOPT_POLLS = 30;
const ADOPT_POLL_MS = 2000;

const TIMED_OUT = {};

const sameOrigin = (u) => new URL(u, self.location.origin).href;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const contentType = (res) => (res.headers.get('Content-Type') || '').toLowerCase();

/**
 * RULE 2: only ever cache-first on paths whose filenames contain a content
 * hash. These cannot change under a fixed URL, so a stale hit is impossible;
 * anything else must stay network-first or the app can pin itself to an old
 * build with no way out.
 */
function isHashedPath(pathname) {
  return (pathname.startsWith('/app/_expo/') || pathname.startsWith('/app/assets/')) &&
    /[.-][a-f0-9]{16,}\.[^/]+$/i.test(pathname);
}

/** The hashed scripts and stylesheets a shell document loads, as absolute URLs. */
function shellEntries(html) {
  const out = new Set();
  const re = /(?:src|href)="(\/app\/_expo\/static\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.add(sameOrigin(m[1]));
  return [...out];
}

/**
 * Whether a response may be stored under a content-hashed URL. Never HTML: if a
 * rewrite ever answered a missing bundle with index.html, caching that would
 * serve the document as JavaScript for good, because these entries are never
 * revalidated.
 */
function isCacheableAsset(res) {
  return !!res && res.status === 200 && !contentType(res).includes('text/html');
}

async function hasAll(cache, urls) {
  const hits = await Promise.all(urls.map((u) => cache.match(u)));
  return hits.every(Boolean);
}

async function cacheHashed(cache, url, signal) {
  // A hit cannot be stale, so this skips everything an earlier build already
  // stored: on most deploys only the new bundle is downloaded.
  if (await cache.match(url)) return;
  signal.throwIfAborted();
  const res = await fetch(url, { signal });
  if (!isCacheableAsset(res)) throw new Error(`precache ${url}: ${res && res.status}`);
  signal.throwIfAborted();
  await cache.put(url, res);
}

/** Promise.allSettled semantics with a concurrency cap: failures are skipped, never thrown. */
async function settleAll(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch {
        // Best effort. One missing icon font must not cost the user the shell.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Fetch this build's document and everything on the precache list into the
 * shell cache. The document is stored last, and only if every script it loads
 * made it in: a document whose bundle is missing boots to a blank page, which
 * is worse than keeping the previous, complete pair.
 */
async function precacheShell(signal) {
  if (!PRECACHE || !Array.isArray(PRECACHE.urls)) return;
  const cache = await caches.open(SHELL_CACHE);

  let doc = null;
  try {
    const res = await fetch(SHELL, { cache: 'no-cache', signal });
    if (res.status === 200 && contentType(res).includes('text/html')) {
      const entries = shellEntries(await res.clone().text());
      if (entries.length) doc = { res, entries };
    }
  } catch {
    // Offline or flaky: whatever shell is already cached stays.
  }

  // The document's own entries as well as the list's: if a newer deploy landed
  // between this worker being fetched and now, the document loads a bundle the
  // list has never heard of.
  const wanted = new Set(PRECACHE.urls.map(sameOrigin));
  if (doc) {
    // Commit a usable shell before optional icons/assets: one hung font must
    // not prevent a successfully fetched document and bundle working offline.
    await settleAll(doc.entries, PRECACHE_CONCURRENCY, (u) => cacheHashed(cache, u, signal));
    signal.throwIfAborted();
    if (await hasAll(cache, doc.entries)) await cache.put(SHELL, doc.res);
    for (const u of doc.entries) wanted.delete(u);
  }
  await settleAll([...wanted], PRECACHE_CONCURRENCY, (u) => cacheHashed(cache, u, signal));
}

let warming = null;
function warmShell() {
  if (!warming) {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(); }, PRECACHE_TIMEOUT_MS);
    });
    warming = Promise.race([precacheShell(controller.signal).catch(() => {}), deadline])
      .finally(() => {
        clearTimeout(timer);
        warming = null;
      });
  }
  return warming;
}

/**
 * Delete bundles from earlier builds. Every deploy adds a ~7.5MB bundle, and
 * this cache shares the origin's storage quota with the user's downloads, so
 * letting them pile up raises the odds that the browser evicts the whole
 * origin, downloads included.
 *
 * Keeps this build's list AND whatever the cached document loads, so the
 * offline shell is never left pointing at a deleted bundle (the document lags
 * the list when install could not fetch it). Only /app/_expo/ is pruned:
 * /app/assets/ also holds large images that are cached on first use rather
 * than precached, and pruning those would only mean downloading them again.
 */
async function pruneStaleBundles() {
  if (!PRECACHE || !Array.isArray(PRECACHE.urls)) return;
  const cache = await caches.open(SHELL_CACHE);
  const keep = new Set(PRECACHE.urls.map(sameOrigin));
  const shell = await cache.match(SHELL);
  if (shell) for (const u of shellEntries(await shell.text())) keep.add(u);
  const requests = await cache.keys();
  await Promise.all(
    requests
      .filter((r) => new URL(r.url).pathname.startsWith('/app/_expo/') && !keep.has(r.url))
      .map((r) => cache.delete(r)),
  );
}

/**
 * Store a navigation response as the shell once the bundle it loads is in the
 * cache. The page is loading that bundle right now through the hashed-asset
 * route below, so this waits for it rather than downloading it a second time.
 *
 * Anything that is not the app's document (an image or a JSON file opened
 * directly in a tab) is never adopted. The old handler stored every OK
 * navigation as the shell, so opening /app/version.json once would have made
 * the offline app a JSON file.
 */
async function adoptShell(res) {
  if (!res || res.status !== 200 || !contentType(res).includes('text/html')) return;
  const entries = shellEntries(await res.clone().text());
  if (!entries.length) return;
  const cache = await caches.open(SHELL_CACHE);
  for (let i = 0; i < ADOPT_POLLS; i++) {
    if (await hasAll(cache, entries)) {
      await cache.put(SHELL, res);
      return;
    }
    await sleep(ADOPT_POLL_MS);
  }
}

async function cachedShell() {
  const cache = await caches.open(SHELL_CACHE);
  return (await cache.match(SHELL)) || null;
}

async function navigate(event) {
  const network = fetch(event.request);
  // A late rejection, after the timeout won, must not surface as unhandled.
  network.catch(() => {});

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), NAV_TIMEOUT_MS);
  });
  let res;
  try {
    res = await Promise.race([network, timeout]);
  } catch {
    res = null; // offline, DNS failure, connection reset
  } finally {
    clearTimeout(timer);
  }

  if (res === TIMED_OUT) {
    const cached = await cachedShell();
    if (cached) {
      event.waitUntil(network.then((late) => adoptShell(late)).catch(() => {}));
      return cached;
    }
    // No shell yet (a first visit): waiting is the only way in.
    try {
      res = await network;
    } catch {
      res = null;
    }
  }

  // Every route under /app/ is the same document, so a server error is never
  // the "real" page and the cached shell is strictly better than an error page.
  if (res && res.status < 500) {
    if (res.ok) event.waitUntil(adoptShell(res.clone()).catch(() => {}));
    return res;
  }
  const cached = await cachedShell();
  if (cached) return cached;
  return res || new Response('Offline', { status: 503, statusText: 'Offline' });
}

/**
 * Range support, for downloaded video and for audio.
 *
 * Images never send a Range header, so they take the early return below and
 * get the stored response untouched. Media elements are different: a <video>
 * asks for byte ranges to seek, and returning the stored 200 verbatim meant the
 * browser could play from the start but could not seek at all — measured on a
 * 43s clip, seeking to 34.74s left currentTime at 0.00 and buffered stuck at
 * [0, 14.195]. Safari is stricter still and may refuse a media response that
 * ignores Range outright, which is why precached tap sounds come through here
 * too.
 */
async function withRange(req, hit) {
  const range = req.headers.get('range');
  if (!range || hit.status !== 200) return hit;

  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  // Ignore unsupported/malformed ranges before consuming the cached body.
  // Returning `hit` after blob() makes respondWith reject a used response.
  if (!m) return hit;
  const blob = await hit.blob();
  const size = blob.size;

  const unsatisfiable = () =>
    new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' },
    });

  let start;
  let end;
  if (m[1] === '') {
    // Suffix form: the last N bytes.
    const n = parseInt(m[2], 10);
    if (!Number.isFinite(n) || n <= 0) return unsatisfiable();
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
  }
  if (!Number.isFinite(start) || start > end || start >= size) return unsatisfiable();

  const type = hit.headers.get('Content-Type') || 'application/octet-stream';
  const slice = blob.slice(start, end + 1, type);
  return new Response(slice, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': type,
      'Content-Length': String(slice.size),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('install', (event) => {
  // Activate immediately so a new deploy replaces the old worker.
  self.skipWaiting();
  // Never rejects. Failing install over one missing asset would leave a
  // first-time visitor with no worker at all, and so no way to open anything
  // they download; on an update the previous complete shell stays put anyway,
  // because precacheShell only ever replaces the document together with its
  // bundle.
  event.waitUntil(warmShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          // RULE 1, enforced. An unrecognised cache is left alone: deleting
          // something we did not create is how user data disappears.
          .filter((k) => k.startsWith('sakura-shell-') && k !== SHELL_CACHE)
          .map((k) => caches.delete(k)),
      );
      try {
        await pruneStaleBundles();
      } catch {
        // A failed prune costs disk space, never the shell.
      }
      await self.clients.claim();
    })(),
  );
});

/**
 * `{ type: 'sakura:warm-shell' }` from a page re-runs the precache. Download
 * code can send it as a download starts, so that if install's precache was cut
 * short, the shell is whole again before the user takes the app offline. Cheap
 * to repeat: everything already cached is skipped.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'sakura:warm-shell') event.waitUntil(warmShell());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Downloads. Cache-only by design: a synthetic URL has no server to fall back
  // to, so a miss is a genuine miss and must not become a network request that
  // 404s against the deployment.
  if (url.origin === self.location.origin && url.pathname.startsWith(OFFLINE_PREFIX)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(LIBRARY_CACHE);
        // Match on the URL STRING, not the Request. cache.match(req) would take
        // the Range header into account and miss every time.
        const hit = await cache.match(req.url);
        if (!hit) {
          // 404 rather than a network attempt, so the reader's own fallback
          // runs and the user gets the online page instead of a broken image.
          return new Response('Not downloaded', { status: 404, statusText: 'Not downloaded' });
        }
        return withRange(req, hit);
      })(),
    );
    return;
  }

  /**
   * Content-hashed build assets, cache-first (RULE 2, see isHashedPath).
   *
   * Without this the cached shell loads a <script> whose bundle was never
   * stored, so "offline" meant a blank page — the PWA could not actually boot
   * offline at all, which made an offline library pointless.
   */
  if (url.origin === self.location.origin && isHashedPath(url.pathname)) {
    let finishCache;
    // cache.put consumes the response body after fetch has resolved. Keep the
    // worker alive until it finishes, even if the browser closes the page.
    event.waitUntil(new Promise((resolve) => { finishCache = resolve; }));
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(SHELL_CACHE);
          // By URL string, for the same Range reason as the library above.
          const hit = await cache.match(req.url);
          if (hit) return withRange(req, hit);
          const res = await fetch(req);
          if (isCacheableAsset(res)) {
            const done = finishCache;
            finishCache = () => {};
            cache.put(req.url, res.clone()).catch(() => {}).finally(done);
          }
          return res;
        } finally {
          finishCache();
        }
      })(),
    );
    return;
  }

  // Only app documents fall back to the shell. A missing static file must
  // never become a successful HTML response (including when opened in a tab).
  if (req.mode === 'navigate' && url.origin === self.location.origin &&
      url.pathname.startsWith('/app/') &&
      !/^\/app\/(?:_expo\/|assets\/|icons\/|share\/|(?:sw\.js|version\.json|manifest\.json|metadata\.json|favicon\.ico)$)/.test(url.pathname)) {
    event.respondWith(navigate(event));
    return;
  }

  // Everything else falls through to the network untouched.
});
