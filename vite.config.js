import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
    const resp = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!resp.ok) return '';
    const data = await resp.json();
    return Array.isArray(data) && data.length > 0 ? String(data[0].number) : '';
  } catch {
    return '';
  }
};

export default defineConfig(async () => {
  const prNumber = await fetchPRNumber();
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
    },
    define: {
      // Injected at build time so debug overlays can show branch/PR without runtime git access.
      // VITE_PR_NUMBER can be overridden by CI: VITE_PR_NUMBER=42 npm run build
      'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(process.env.VITE_GIT_BRANCH || gitBranch),
      'import.meta.env.VITE_PR_NUMBER': JSON.stringify(prNumber),
    },
  };
});
