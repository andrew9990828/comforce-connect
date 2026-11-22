// Local dev and preview access to Supabase. Codex (GPT-6) implemented proxying and browser-key validation.
// Claude (Opus 5.5) added the /agent assistant endpoints, which keep the OpenAI key on the server.
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleAgentRequest, maxBodyBytes, type AgentEnv } from './server/agents/handler'

function assistants(env: AgentEnv): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const match = req.url?.match(/^\/agent\/([a-z]+)(?:\?|$)/)
    if (!match) return next()
    void (async () => {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > maxBodyBytes) { res.statusCode = 413; res.end(); return }
        chunks.push(chunk)
      }
      const headers = Object.entries(req.headers).flatMap(([key, value]): [string, string][] =>
        value === undefined ? [] : Array.isArray(value) ? value.map(item => [key, item]) : [[key, value]])
      const request = new Request(new URL(req.url!, 'http://localhost'), {
        method: req.method, headers, body: req.method === 'POST' ? new Uint8Array(Buffer.concat(chunks)) : undefined,
      })
      const response = await handleAgentRequest(match[1], request, env)
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    })().catch(next)
  }
  return {
    name: 'comforce-assistants',
    configureServer: server => { server.middlewares.use(middleware) },
    configurePreviewServer: server => { server.middlewares.use(middleware) },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (key && !key.startsWith('sb_publishable_')) {
    let role
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role }
    catch { /* The error below also covers malformed keys. */ }
    if (role !== 'anon') throw new Error('Use the local publishable or anon browser key in .env.local.')
  }
  // Server-only values. Never prefix OPENAI_API_KEY with VITE_, or it would ship to browsers.
  const server = loadEnv(mode, process.cwd(), ['OPENAI_', 'SUPABASE_'])
  const agentEnv: AgentEnv = {
    OPENAI_API_KEY: server.OPENAI_API_KEY,
    OPENAI_MODEL: server.OPENAI_MODEL,
    SUPABASE_URL: server.SUPABASE_URL || (env.VITE_SUPABASE_URL?.startsWith('http') ? env.VITE_SUPABASE_URL : 'http://127.0.0.1:54321'),
    SUPABASE_PUBLISHABLE_KEY: server.SUPABASE_PUBLISHABLE_KEY || key,
  }
  const proxy = {
    '/api/rest/v1': { target: 'http://127.0.0.1:54321', rewrite: (path: string) => path.slice(4) },
    '/api/auth/v1': { target: 'http://127.0.0.1:54321', rewrite: (path: string) => path.slice(4) },
  }
  // Listen on 127.0.0.1 so the docs' links work; Node can otherwise bind only the IPv6 localhost. --host still overrides this.
  return { plugins: [react(), assistants(agentEnv)], server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy }, preview: { host: '127.0.0.1', proxy } }
})
