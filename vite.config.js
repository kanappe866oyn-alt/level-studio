import { defineConfig } from 'vite'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import { desktopDownloadPlugin } from './tools/desktop_download_plugin.mjs'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.LEVEL_STUDIO_BASE || '/',
  plugins: [react(), desktopDownloadPlugin()],
})
