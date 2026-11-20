// Shared browser client. Codex (GPT-6) connected the public key and same-origin local API.
import { createClient } from '@supabase/supabase-js'

export const configured = Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
export const supabase = createClient(
  new URL(import.meta.env.VITE_SUPABASE_URL || '/api', window.location.origin).href,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'missing-local-public-key',
  { auth: { storageKey: 'comforce-local-session' } },
)
