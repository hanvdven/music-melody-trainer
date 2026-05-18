import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

const gitBranch = (() => {
  try { return execSync('git rev-parse --abbrev-ref HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();

export default defineConfig({
  plugins: [react()],
  define: {
    // Injected at build time so debug overlays can show branch/PR without runtime git access.
    // VITE_PR_NUMBER can be overridden by CI: VITE_PR_NUMBER=42 npm run build
    'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(process.env.VITE_GIT_BRANCH || gitBranch),
    'import.meta.env.VITE_PR_NUMBER': JSON.stringify(process.env.VITE_PR_NUMBER || ''),
  },
});
