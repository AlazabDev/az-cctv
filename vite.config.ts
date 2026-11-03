// AZ-CCTV runs on the azab-orchestrator Linux VM behind Nginx/systemd.
// Use a Node.js server bundle by default for self-hosted production.
// Preserve Lovable's managed Cloudflare preview when its sandbox is detected.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isLovableSandbox =
  process.env.LOVABLE_SANDBOX === "1" ||
  Boolean(process.env.DEV_SERVER__PROJECT_PATH);

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  ...(!isLovableSandbox ? { nitro: { preset: "node-server" } } : {}),
});
