// Messages exchanged between the website assistants and their server endpoints. Claude (Opus 5.5) defined the protocol and limits.
import type { Service } from '../services'
import type { Action } from '../team/queue'

export type AgentName = 'community' | 'team'
export interface ChatTurn { role: 'user' | 'assistant'; text: string }

export const maxBodyBytes = 64 * 1024
export const limits = { turns: 30, characters: 2000 }

// Things the browser can do after a reply. The assistant never saves anything on its own.
export type ClientAction =
  | { type: 'prefill'; services: Service[]; description: string; neighborhood: string }
  | { type: 'link'; label: string; href: string }
  | { type: 'open_case'; reference: string; needId: string; label: string; service?: string }
  | { type: 'proposal'; needId: string; reference: string; action: Action; label: string; summary: string
      value?: string; when?: string; source?: string; referral?: string
      // Partner named by the selected referral (or ComForce for direct help), shown so staff can check who gets credit.
      partner?: string }

export interface AgentRequest { messages: ChatTurn[]; token?: string | null }
export interface AgentReply { reply: string; actions: ClientAction[] }
export interface AgentError { error: string }
