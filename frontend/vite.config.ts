/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'

/** Content Security Policy for the built app only (Vite's dev server needs inline scripts for hot reload).
 *  Scripts may only come from this site, so an injected script cannot run, read tokens, or misuse signing keys.
 *  VITE_API_BASE, when the API lives on another origin, is added to connect-src and img-src. */
function csp(): Plugin {
  return {
    name: 'sost-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const api = process.env.VITE_API_BASE?.match(/^https?:\/\/[^/]+/)?.[0] ?? ''
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        `img-src 'self' data: blob: ${api}`.trim(),
        `connect-src 'self' ${api}`.trim(),
        "media-src 'self' blob:",
        "worker-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
      return html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${policy}" />
    <meta name="referrer" content="no-referrer" />`)
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    csp(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sost Smart Corridor',
        short_name: 'Corridor',
        start_url: '/t',
        display: 'standalone',
        background_color: '#f4f1ea',
        theme_color: '#f4f1ea',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { navigateFallbackDenylist: [/^\/api/] },
    }),
  ],
  server: {
    host: true,
    allowedHosts: true, // lets a Cloudflare tunnel hostname through
    proxy: { '/api': { target: 'http://127.0.0.1:8000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  test: { environment: 'node' },
})
