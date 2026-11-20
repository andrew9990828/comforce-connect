// Local dev and preview access to Supabase. Codex (GPT-6) implemented proxying and browser-key validation.
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (key && !key.startsWith('sb_publishable_')) {
    let role
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role }
    catch { /* The error below also covers malformed keys. */ }
    if (role !== 'anon') throw new Error('Use the local publishable or anon browser key in .env.local.')
  }
  const proxy = {
    '/api/rest/v1': { target: 'http://127.0.0.1:54321', rewrite: (path: string) => path.slice(4) },
    '/api/auth/v1': { target: 'http://127.0.0.1:54321', rewrite: (path: string) => path.slice(4) },
  }
  return { plugins: [react()], server: { port: 5173, strictPort: true, proxy }, preview: { proxy } }
})
