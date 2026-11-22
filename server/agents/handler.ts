// HTTP entry for both website assistants, shared by the Vite dev server and Cloudflare Pages Functions.
// Claude (Opus 5.5) implemented request validation, access checks and error responses.
import OpenAI from 'openai'
import { limits, type AgentName, type ChatTurn } from '../../src/assistant/protocol'
import { communityAgent } from './community'
import { AccessError, loadQueue, QueueUnavailableError, teamAgent } from './team'
import { runAgent, type AgentEnv } from './run'

export type { AgentEnv }
export const maxBodyBytes = 64 * 1024

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

function readTurns(body: unknown): ChatTurn[] | null {
  const messages = (body as { messages?: unknown })?.messages
  if (!Array.isArray(messages) || !messages.length || messages.length > limits.turns) return null
  const turns: ChatTurn[] = []
  for (const [index, message] of messages.entries()) {
    const role = (message as ChatTurn)?.role, text = (message as ChatTurn)?.text
    if (role !== (index % 2 ? 'assistant' : 'user') || typeof text !== 'string') return null
    if (!text.trim() || text.length > limits.characters * (role === 'assistant' ? 6 : 1)) return null
    turns.push({ role, text })
  }
  return turns[turns.length - 1].role === 'user' ? turns : null
}

export async function handleAgentRequest(name: string, request: Request, env: AgentEnv): Promise<Response> {
  if (name !== 'community' && name !== 'team') return json(404, { error: 'Unknown assistant.' })
  if (request.method !== 'POST') return json(405, { error: 'Use POST.' })
  // A custom header means other sites can't call this endpoint from a visitor's browser without a CORS preflight, which is never approved.
  if (request.headers.get('X-ComForce-Assistant') !== '1') return json(403, { error: 'Missing assistant header.' })
  if (Number(request.headers.get('Content-Length') || 0) > maxBodyBytes) return json(413, { error: 'Message too long.' })
  if (!env.OPENAI_API_KEY) return json(503, { error: 'The assistant isn’t set up yet. Add OPENAI_API_KEY on the server.' })

  let body: unknown
  try { body = await request.json() } catch { return json(400, { error: 'Send JSON.' }) }
  const turns = readTurns(body)
  if (!turns) return json(400, { error: `Keep the conversation to ${limits.turns} messages of ${limits.characters} characters or fewer.` })

  try {
    if ((name as AgentName) === 'community') return json(200, await runAgent(communityAgent, turns, env))
    const token = (body as { token?: unknown }).token
    const caller = {
      token: typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : null,
      authorization: request.headers.get('Authorization'),
    }
    // Checking access before calling the model keeps the team assistant closed to anyone without a workspace.
    const queue = await loadQueue(env, caller)
    return json(200, await runAgent(teamAgent(env, caller, queue), turns, env))
  } catch (error) {
    if (error instanceof AccessError) return json(403, { error: 'Open or sign in to the team workspace, then try again.' })
    if (error instanceof QueueUnavailableError) {
      console.error('Team queue unavailable', error.message)
      return json(503, { error: 'The team queue can’t be reached right now, so the assistant can’t look anything up. Check that the database is running, then try again.' })
    }
    if (error instanceof OpenAI.RateLimitError) return json(429, { error: 'The assistant is busy. Wait a moment and try again.' })
    if (error instanceof OpenAI.AuthenticationError) {
      console.error('Assistant API key rejected')
      return json(503, { error: 'The assistant’s API key was rejected. Check OPENAI_API_KEY on the server.' })
    }
    console.error('Assistant request failed', error instanceof OpenAI.APIError ? `${error.status} ${error.message}` : error)
    return json(502, { error: 'The assistant couldn’t answer just now. Please try again.' })
  }
}
