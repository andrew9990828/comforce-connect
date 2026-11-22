// Shared OpenAI tool loop for the website assistants. Claude (Opus 5.5) implemented the loop, request limits and refusal handling.
import OpenAI from 'openai'
import { redact } from './privacy'
import type { ChatTurn, ClientAction } from '../../src/assistant/protocol'

export interface AgentEnv {
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
  SUPABASE_URL?: string
  SUPABASE_PUBLISHABLE_KEY?: string
}

// OpenAI's efficient model for focused, high-volume work. Override with OPENAI_MODEL.
export const defaultModel = 'gpt-6-luna'

export interface ToolOutcome { content: string; isError?: boolean }
export interface AgentDefinition {
  instructions: string
  context?: string
  tools: OpenAI.Chat.Completions.ChatCompletionTool[]
  runTool(name: string, input: Record<string, unknown>, actions: ClientAction[]): Promise<ToolOutcome>
}

const maxSteps = 8
const declined = 'I can’t help with that here. For anything urgent, call 911. You can also dial 211 for local resources.'

export async function runAgent(agent: AgentDefinition, turns: ChatTurn[], env: AgentEnv, language?: string) {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const replyLanguage = language && `Default to the selected site language (${language}). Use the language the person writes in or explicitly asks for when it differs.`
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: [agent.instructions, agent.context, replyLanguage].filter(Boolean).join('\n\n') },
    ...turns.map(turn => ({ role: turn.role, content: redact(turn.text) })),
  ]
  const actions: ClientAction[] = []

  for (let step = 0; step < maxSteps; step++) {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL || defaultModel,
      messages,
      tools: agent.tools,
      // gpt-6-luna rejects function tools on Chat Completions unless reasoning is off.
      reasoning_effort: 'none',
    })
    const choice = completion.choices[0]
    if (!choice) throw new Error('Empty response.')
    const message = choice.message
    if (message.refusal || choice.finish_reason === 'content_filter') return { reply: declined, actions: [] }
    const calls = (message.tool_calls ?? []).filter(call => call.type === 'function')
    if (!calls.length) return { reply: message.content?.trim() || 'Sorry, I don’t have an answer for that. Try asking another way.', actions }

    messages.push(message)
    for (const call of calls) {
      let outcome: ToolOutcome
      try {
        const parsed = JSON.parse(call.function.arguments || '{}')
        const input = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
        outcome = await agent.runTool(call.function.name, input, actions)
      } catch (error) {
        outcome = { content: error instanceof Error ? error.message : 'The tool failed.', isError: true }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: outcome.isError ? `Error: ${outcome.content}` : outcome.content })
    }
  }
  return { reply: 'That took more steps than I can manage at once. Try asking a narrower question.', actions }
}

// Strict function tools: the model must send exactly these fields.
export function tool(name: string, description: string, properties: Record<string, unknown>): OpenAI.Chat.Completions.ChatCompletionTool {
  return { type: 'function', function: { name, description, strict: true,
    parameters: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } } }
}

// String inputs from the model are checked here before any tool uses them.
export function text(input: Record<string, unknown>, key: string, max: number) {
  const value = input[key]
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new Error(`${key} must be text.`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new Error(`${key} must be ${max} characters or fewer.`)
  return trimmed
}
