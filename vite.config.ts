// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "robots.txt", "models/default-model.onnx"],
        manifest: {
          name: "WGDeepInsight",
          short_name: "WGDI",
          description: "Offline-first industrial inspection AI workspace",
          theme_color: "#0f172a",
          background_color: "#020617",
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            { src: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,woff2,json,ttf,wasm,onnx}"],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => ["document", "script", "style", "image", "font"].includes(request.destination),
              handler: "NetworkFirst",
              options: { cacheName: "wgdeepinsight-assets" },
            },
            {
              urlPattern: ({ url }) => url.pathname.includes("/models/"),
              handler: "CacheFirst",
              options: { cacheName: "wgdeepinsight-models" },
            },
          ],
        },
        devOptions: { enabled: true },
      }),
    ],
    server: {
      proxy: {
        "/py-api": {
          target: "http://localhost:8000",
          rewrite: (path) => path.replace(/^\/py-api/, ""),
          changeOrigin: true,
        },
      },
    },
  },
});
