import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [
      {
        name: 'fallback-firebase-config',
        resolveId(id) {
          if (id.includes('firebase-applet-config.json')) {
            const targetPath = path.resolve(__dirname, 'firebase-applet-config.json');
            if (!fs.existsSync(targetPath)) {
              return '\0virtual:firebase-config';
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0virtual:firebase-config') {
            return JSON.stringify({
              apiKey: process.env.VITE_FIREBASE_API_KEY || "",
              authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "dummy-project.firebaseapp.com",
              projectId: process.env.VITE_FIREBASE_PROJECT_ID || "dummy-project",
              storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
              messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
              appId: process.env.VITE_FIREBASE_APP_ID || "",
              firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || "(default)"
            });
          }
          return null;
        }
      },
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: false,
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          maximumFileSizeToCacheInBytes: 5000000,
        },
        manifest: {
          name: 'MYM Bizflow',
          short_name: 'Bizflow',
          description: 'MYM Bizflow Supply Tracking App',
          theme_color: '#3B82F6',
          background_color: '#F4F7FB',
          display: 'standalone',
          icons: [
            {
              src: './logo.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(process.env.GOOGLE_MAPS_PLATFORM_KEY || '')
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.NODE_ENV === 'production' ? false : false,
      host: '0.0.0.0',
      port: 3000
    },
  };
});
