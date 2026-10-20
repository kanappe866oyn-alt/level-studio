import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { desktopDownloadPlugin } from './tools/desktop_download_plugin.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), desktopDownloadPlugin()],
})
