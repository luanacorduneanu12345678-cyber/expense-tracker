import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/expense-tracker/",

  plugins: [
    react(),

    VitePWA({
      registerType: "autoUpdate",

      includeAssets: [
        "apple-touch-icon.png",
        "favicon.svg",
      ],

      manifest: {
        name: "Expense Tracker",
        short_name: "Expenses",
        description: "Personal expense tracking application",

        theme_color: "#0b1220",
        background_color: "#0b1220",

        display: "standalone",

        start_url: "./",
        scope: "./",

        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg}",
        ],
      },
    }),
  ],
});