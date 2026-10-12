/// <reference types="vite/client" />

/** Injected at build time from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;
/** True only when tauri.conf.json carries a real updater public key and endpoint. */
declare const __UPDATER_CONFIGURED__: boolean;
