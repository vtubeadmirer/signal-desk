import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
const tauriConf = JSON.parse(readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8")) as {
  plugins?: { updater?: { pubkey?: string; endpoints?: string[] } };
};
const updater = tauriConf.plugins?.updater;
// Skip the startup update check while the release scaffold still has placeholder keys/endpoints.
const updaterConfigured = Boolean(
  updater?.pubkey && !updater.pubkey.startsWith("REPLACE_WITH") &&
  updater.endpoints?.length && updater.endpoints.every((endpoint) => !endpoint.includes("REPLACE_WITH")),
);

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __UPDATER_CONFIGURED__: JSON.stringify(updaterConfigured),
  },
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
  },
});
