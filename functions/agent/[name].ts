// Cloudflare Pages Function serving /agent/community and /agent/team. Claude (Opus 5.5) wrote this adapter.
// Set OPENAI_API_KEY as an encrypted Pages secret (and optionally OPENAI_MODEL), plus SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.
import { handleAgentRequest, type AgentEnv } from '../../server/agents/handler'

interface Context { request: Request; env: AgentEnv & { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }; params: { name?: string | string[] } }

export const onRequest = ({ request, env, params }: Context) => handleAgentRequest(String(params.name ?? ''), request, {
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  OPENAI_MODEL: env.OPENAI_MODEL,
  SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY,
})
