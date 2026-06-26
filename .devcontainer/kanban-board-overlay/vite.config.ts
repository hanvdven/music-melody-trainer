import { defineConfig } from "vite";
import dotenv from "dotenv";
import { kanbanApiPlugin } from "./plugins/kanban-api";

dotenv.config();

export default defineConfig({
  plugins: [kanbanApiPlugin()],
  server: {
    // Pinned to 5500 so the board never fights a project's own dev server (which
    // typically takes 5173). strictPort makes us fail loudly on conflict instead
    // of silently drifting to 5501/5502/...
    port: 5500,
    strictPort: true,
    open: true,
  },
});
