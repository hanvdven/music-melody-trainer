import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { execSync } from 'child_process';

const gitBranch = (() => {
  try { return execSync('git rev-parse --abbrev-ref HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();

// Auto-detect the open PR number for the current branch from the GitHub API (no auth needed
// for public repos). Falls back to VITE_PR_NUMBER env var (useful in CI or offline builds).
const fetchPRNumber = async () => {
  if (process.env.VITE_PR_NUMBER) return process.env.VITE_PR_NUMBER;
  const branch = process.env.VITE_GIT_BRANCH || gitBranch;
  if (!branch || branch === 'unknown' || branch === 'HEAD') return '';
  try {
    const url = `https://api.github.com/repos/hanvdven/music-melody-trainer/pulls?head=hanvdven:${encodeURIComponent(branch)}&state=open&per_page=1`;
    // #955 (boot-slowness diagnostic): this ran unbounded — a slow/unreachable GitHub API
    // (offline, rate-limited, AV/proxy intercepting the connection) stalled `npm run dev`
    // from starting at all, since defineConfig's async factory is awaited before the dev
    // server binds its port. A dead PR-number lookup must never block boot.
    const resp = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(2000) });
    if (!resp.ok) return '';
    const data = await resp.json();
    return Array.isArray(data) && data.length > 0 ? String(data[0].number) : '';
  } catch {
    return '';
  }
};

// #955 (boot-slowness diagnostic, "WebSocket connection ... failed: Unexpected response code: 400"):
// GitHub Codespaces terminates TLS and forwards ports 443/80 to the container, so the browser's HMR
// client (reading its own page URL) tries to open the WebSocket against the forwarded https port
// instead of the container's real 5173 — the proxy 400s because nothing is listening on 443 for a raw
// upgrade. `CODESPACES=true` is set by the Codespaces environment itself (never true for a plain local
// `npm run dev` or a non-Codespaces devcontainer), so this only kicks in where the mismatch can occur.
const isCodespaces = process.env.CODESPACES === 'true';

export default defineConfig(async () => {
  const prNumber = await fetchPRNumber();
  return {
    plugins: [
      react(),
      // #955 (boot-slowness diagnostic): a HAR capture of a real boot showed 1606 requests, ~1100
      // of them individual PNG module resolutions from the bestiary/character-creator's eager
      // `import.meta.glob` asset maps (see src/model/bestiaryAssets.js, characterAssets.js). The
      // slowest entries spent most of their time in `blocked`/`_blocked_queueing` (up to 2.7s),
      // not actual transform work — classic HTTP/1.1 head-of-line blocking: Chrome caps concurrent
      // connections to ~6 per origin, so 1600 small requests queue up in waves instead of running in
      // parallel. HTTP/2 (available once the dev server speaks HTTPS) multiplexes unlimited requests
      // over one connection, removing that queueing entirely — without touching any asset-loading
      // code. Self-signed cert is cached under node_modules/.vite/basic-ssl and regenerated monthly;
      // the browser will show a one-time "not secure" warning to click through per machine/profile.
      // Dev-server-only: does not run during `vite build`/`vite preview`'s actual bundling, only
      // adds https to the `server`/`preview` config objects.
      basicSsl(),
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      // #859 (Han 2026-08-11, "soms start level helemaal niet"): silently drifting to a new port
      // when 5173 is already occupied let old `npm run dev` processes pile up unkilled across
      // days (found 3 zombie node processes from Aug 9/10/11 all listening simultaneously). A
      // browser tab pointed at 5173 could then be served by a stale server with an out-of-date
      // module graph, producing "impossible" missing-export crashes. strictPort:true makes a
      // second dev server fail loudly instead of masking the leftover process.
      strictPort: true,
      hmr: isCodespaces ? { clientPort: 443 } : undefined,
    },
    define: {
      // Injected at build time so debug overlays can show branch/PR without runtime git access.
      // VITE_PR_NUMBER can be overridden by CI: VITE_PR_NUMBER=42 npm run build
      'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(process.env.VITE_GIT_BRANCH || gitBranch),
      'import.meta.env.VITE_PR_NUMBER': JSON.stringify(prNumber),
    },
  };
});
