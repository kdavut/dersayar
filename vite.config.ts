import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: [
        'firebase',
        'firebase/app',
        'firebase/firestore',
        'firebase/auth',
        'firebase/app-check',
        '@firebase/app',
        '@firebase/firestore',
        '@firebase/auth',
        '@firebase/app-check',
        '@firebase/component',
        '@firebase/util'
      ],
    },
    server: {
      // HMR, AI Studio ortamında DISABLE_HMR değişkeni ile devre dışı bırakılmıştır.
      // Düzenlemeler esnasında ekranda kırpışma yaşanmaması için otomatik dosya izleme özelliği devre dışıdır.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Düzenleme işlemleri sırasında CPU kullanımını ve sistem kaynaklarını korumak için dosya izleme modu kapatılmıştır.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
