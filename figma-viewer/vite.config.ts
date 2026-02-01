import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Rewrite requests like /run/mediapipe/... or /run/TOKEN/mediapipe/... to /mediapipe/...
 * so MediaPipe face_mesh assets (loaded by WebGazer with relative URLs) are
 * served from public/mediapipe/face_mesh/.
 * 
 * WebGazer loads assets with relative URLs from the page context.
 * Depending on the page URL structure, browser may resolve mediapipe/... to:
 * - /run/mediapipe/... (if page is /run or /run/)
 * - /run/TOKEN/mediapipe/... (if page is /run/TOKEN)
 */
function mediapipeRewrite() {
  return {
    name: 'mediapipe-rewrite',
    configureServer(server: import('vite').ViteDevServer) {
      const rewrite = (req: unknown, _res: unknown, next: () => void) => {
        const r = req as import('http').IncomingMessage
        const url = r.url ?? ''
        const [path, qs] = url.split('?')
        // Match both /run/mediapipe/... AND /run/TOKEN/mediapipe/...
        // (?:[^/]+\/)? makes the TOKEN segment optional
        const match = path.match(/^\/run\/(?:[^/]+\/)?(mediapipe\/.*)$/)
        if (match) {
          const newUrl = '/' + match[1] + (qs ? '?' + qs : '')
          console.log('[mediapipe-rewrite] Rewrote:', url, '->', newUrl)
          r.url = newUrl
        }
        next()
      }
      // Prepend so rewrite runs before static file serving
      const stack = (server.middlewares as unknown as { stack: { route: string; handle: (req: unknown, res: unknown, next: () => void) => void }[] }).stack
      stack.unshift({ route: '', handle: rewrite })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mediapipeRewrite()],
  server: {
    port: 5173, // Viewer на порту 5173
    open: false
  }
})
