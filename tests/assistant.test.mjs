// Offline checks for the website assistants: conversation state, Chicago times and what reaches the model.
// Claude (Opus 5.5) wrote these for the PR #8 review. No network: OpenAI and Supabase are replaced with a stub fetch.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let vite, conversation, time, handler
before(async () => {
  // Own cache folder and no dependency scan, so running tests never invalidates a running npm run dev.
  vite = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-tests', optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error' })
  conversation = await vite.ssrLoadModule('/src/assistant/conversation.ts')
  time = await vite.ssrLoadModule('/server/agents/time.ts')
  handler = await vite.ssrLoadModule('/server/agents/handler.ts')
})
after(() => vite.close())

const proposal = { type: 'proposal', needId: 'need-1', reference: 'CF-1001', action: 'refer', label: 'Refer', summary: 'Refer to a pantry.', value: 'Marker Pantry' }

test('a card saved while another reply is pending stays saved and keeps its key', () => {
  const { newChat, addReply, withKeys, updateAction } = conversation
  let state = newChat(true)
  const chat = state.chat
  state = { ...state, turns: [{ role: 'user', text: 'Refer CF-1001' }] }
  state = addReply(state, chat, { role: 'assistant', text: 'Here is a card.', actions: withKeys([proposal]) })
  const key = state.turns[1].actions[0].key
  assert.match(key, /^[0-9a-f-]{36}$/, 'Proposals get an operation key when they arrive.')
  // A second question is sent, then the card is saved before its reply arrives.
  state = { ...state, turns: [...state.turns, { role: 'user', text: 'What is overdue?' }] }
  state = updateAction(state, chat, 1, 0, { status: 'saved' })
  state = addReply(state, chat, { role: 'assistant', text: 'Two needs are overdue.' })
  assert.equal(state.turns[1].actions[0].status, 'saved', 'The late reply must not bring back Save update.')
  assert.equal(state.turns[1].actions[0].key, key, 'The card keeps the same operation key.')
  assert.equal(state.turns.length, 4)
})

test('replies and card updates for a cleared chat are discarded', () => {
  const { newChat, addReply, updateAction } = conversation
  const old = newChat(true)
  const cleared = newChat(true)
  assert.deepEqual(addReply(cleared, old.chat, { role: 'assistant', text: 'Late reply' }), cleared)
  assert.deepEqual(updateAction(cleared, old.chat, 0, 0, { status: 'saved' }), cleared)
})

test('a reload mid-answer returns the unanswered question instead of leaving it in the transcript', () => {
  const { restore } = conversation
  const saved = { open: true, chat: 'c1', turns: [
    { role: 'user', text: 'First' }, { role: 'assistant', text: 'Answer' }, { role: 'user', text: 'Lost' }, { role: 'user', text: 'Second' },
  ] }
  const { state, unsent } = restore(saved)
  assert.deepEqual(state.turns.map(t => t.role), ['user', 'assistant'])
  assert.equal(unsent, 'Second')
  assert.equal(state.chat, 'c1')
  assert.equal(restore(null).state.turns.length, 0)
})

test('sign-out removes every team conversation and nothing else', () => {
  const { clearTeamChats, teamPrefix } = conversation
  const store = new Map([[teamPrefix + 'v2.staff-a', '{}'], [teamPrefix + 'v1', '{}'], ['comforce.assistant.community.v1', '{}']])
  const storage = { get length() { return store.size }, key: i => [...store.keys()][i] ?? null, removeItem: k => store.delete(k) }
  clearTeamChats(storage)
  assert.deepEqual([...store.keys()], ['comforce.assistant.community.v1'])
})

test('times without an offset are Chicago time in winter and summer', () => {
  const { chicagoTime } = time
  assert.equal(chicagoTime('2026-01-15T09:30'), '2026-01-15T15:30:00.000Z')
  assert.equal(chicagoTime('2026-07-15T09:30'), '2026-07-15T14:30:00.000Z')
  assert.equal(chicagoTime('2026-11-01T09:30:00'), '2026-11-01T15:30:00.000Z', 'Day daylight saving ends')
  assert.equal(chicagoTime('2026-03-08T09:30'), '2026-03-08T14:30:00.000Z', 'Day daylight saving starts')
  assert.equal(chicagoTime('2026-01-15T09:30:00Z'), '2026-01-15T09:30:00.000Z')
  assert.equal(chicagoTime('2026-01-15T09:30-06:00'), '2026-01-15T15:30:00.000Z')
  for (const bad of ['', '2026-01-15', 'tomorrow at 9', '2026-02-30T09:30']) assert.throws(() => chicagoTime(bad), bad)
})

test('impossible dates and spring-forward times are rejected instead of shifted', () => {
  const { chicagoTime } = time
  // 2:00 to 2:59 AM never happens in Chicago on the spring-forward night.
  assert.throws(() => chicagoTime('2027-03-14T02:30'), /spring forward/)
  assert.throws(() => chicagoTime('2026-03-08T02:00'), /spring forward/)
  assert.equal(chicagoTime('2027-03-14T01:59'), '2027-03-14T07:59:00.000Z', 'Just before the gap is still valid.')
  assert.equal(chicagoTime('2027-03-14T03:00'), '2027-03-14T08:00:00.000Z', 'Just after the gap is still valid.')
  // An explicit offset doesn't excuse an impossible calendar date.
  for (const bad of ['2026-02-30T09:30-06:00', '2026-02-30T09:30Z', '2026-04-31T09:30:00+00:00', '2026-01-15T24:00Z', '2026-01-15T09:30+15:00'])
    assert.throws(() => chicagoTime(bad), bad)
})

// One fictional case with contact details planted in every free-text field.
const markers = ['marker.alpha@example.test', 'contact.field@example.test', '414-555-0142', '(262) 555-0199', '1234 W Marker St', 'AGENCY-REF-7781', 'source.beta@example.test']
const queue = [{
  id: 'req-1', reference: 'CF-1001', neighborhood: 'Harambee', contact_method: 'email', contact: 'contact.field@example.test', source: 'web',
  created_at: '2026-11-10T15:00:00Z',
  description: 'Needs groceries for the plum family. Email marker.alpha@example.test or call 414-555-0142. Lives at 1234 W Marker St.',
  family_support: { support: 'Check-ins for the plum family', safe_contact: 'Text (262) 555-0199 after 6pm only', agency: 'MPD', agency_reference: 'AGENCY-REF-7781' },
  needs: [{
    id: 'need-1', service: 'food', status: 'open', assigned_staff_id: null, owner: 'Dee', follow_up: '2026-11-25T15:00:00Z', provider: null,
    fulfilled_at: null, unmet_reason: null, partner_contact: null,
    referrals: [{ id: 'ref-1', partner: 'Riverwest Pantry', sent_at: '2026-11-12T15:00:00Z', declined_at: null }],
    history: [{ at: '2026-11-12T15:00:00Z', action: 'refer', detail: 'Called 414-555-0142 to confirm', source: 'source.beta@example.test', actor_name: 'Dee', actor_role: 'caseworker' }],
  }],
}, {
  // A closed case: contact details hide in the unmet reason, the delivering provider, the partner contact and the agency.
  id: 'req-2', reference: 'CF-1002', neighborhood: 'Riverwest', contact_method: 'text', contact: '(414) 555-0177', source: 'call',
  created_at: '2026-11-01T15:00:00Z', description: 'Closed fictional case for the quince family.',
  family_support: { support: 'Family check-ins', safe_contact: 'Any time', agency: 'Ask for agency.gamma@example.test', agency_reference: '' },
  needs: [{
    id: 'need-2', service: 'family_support', status: 'unmet', assigned_staff_id: null, owner: 'Von', follow_up: null, provider: null,
    fulfilled_at: null, unmet_reason: 'Closed because unmet.delta@example.test stopped replying', partner_contact: 'partner.epsilon@example.test',
    referrals: [], history: [],
  }, {
    id: 'need-3', service: 'food', status: 'fulfilled', assigned_staff_id: null, owner: 'Von', follow_up: null, provider: 'provider.zeta@example.test',
    fulfilled_at: '2026-11-03T15:00:00Z', unmet_reason: null, partner_contact: null,
    referrals: [{ id: 'ref-2', partner: 'Pantry via referral.eta@example.test', sent_at: '2026-11-02T15:00:00Z', declined_at: null }], history: [],
  }],
}]
markers.push('agency.gamma@example.test', 'unmet.delta@example.test', 'partner.epsilon@example.test', 'provider.zeta@example.test', 'referral.eta@example.test', '(414) 555-0177')

test('the model never receives planted contact details, and fulfillment cards name the credited partner', async () => {
  const sent = []
  const script = [
    { tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_case', arguments: JSON.stringify({ reference: 'CF-1001' }) } }] },
    { tool_calls: [{ id: 'c2', type: 'function', function: { name: 'find_needs', arguments: JSON.stringify({ service: '', status: '', owner: '', neighborhood: '', overdue_only: false, unassigned_only: false, search: 'plum' }) } }] },
    { tool_calls: [{ id: 'c4', type: 'function', function: { name: 'get_case', arguments: JSON.stringify({ reference: 'CF-1002' }) } }] },
    { tool_calls: [{ id: 'c5', type: 'function', function: { name: 'find_needs', arguments: JSON.stringify({ service: '', status: '', owner: 'Von', neighborhood: '', overdue_only: false, unassigned_only: false, search: '' }) } }] },
    { tool_calls: [{ id: 'c3', type: 'function', function: { name: 'propose_update', arguments: JSON.stringify({ need_id: 'need-1', action: 'fulfill', value: '', when: '', source: '', referral_id: 'ref-1', summary: 'Groceries delivered by the pantry.' }) } }] },
    { content: 'The card is ready for you to confirm.' },
  ]
  const realFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('/rest/v1/rpc/team_queue')) return json(queue)
    if (url.includes('/chat/completions')) {
      sent.push(typeof init?.body === 'string' ? init.body : await new Response(init?.body).text())
      const message = script.shift()
      return json({ id: 'x', object: 'chat.completion', created: 0, model: 'stub', choices: [{ index: 0, finish_reason: message.tool_calls ? 'tool_calls' : 'stop',
        message: { role: 'assistant', content: message.content ?? null, refusal: null, tool_calls: message.tool_calls } }] })
    }
    throw new Error('Unexpected request to ' + url)
  }
  try {
    const request = new Request('http://localhost/agent/team', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ComForce-Assistant': '1' },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'Tell me about CF-1001 and mark it delivered.' }], token: 'a'.repeat(64) }),
    })
    const response = await handler.handleAgentRequest('team', request, { OPENAI_API_KEY: 'test', SUPABASE_URL: 'http://supabase.test', SUPABASE_PUBLISHABLE_KEY: 'test' })
    const body = await response.json()
    assert.equal(response.status, 200, JSON.stringify(body))
    assert.equal(sent.length, 6, 'Every scripted model call happened.')
    const payload = sent.join('\n')
    // The closed case's outcome, partner and agency reached the model through both tools, with the emails replaced.
    const toolResult = id => JSON.parse(sent.at(-1)).messages.find(m => m.role === 'tool' && m.tool_call_id === id).content
    for (const id of ['c4', 'c5']) {
      const content = toolResult(id)
      assert.ok(content.includes('Closed because [email removed] stopped replying'), `${id} lacks the redacted unmet reason: ${content}`)
      assert.ok(content.includes('[email removed]') && !/@example\.test/.test(content), `${id} leaked an email`)
    }
    assert.ok(toolResult('c4').includes('Delivered by [email removed]') && toolResult('c4').includes('Pantry via [email removed]'))
    for (const marker of markers) assert.ok(!payload.includes(marker) && !payload.includes(JSON.stringify(marker).slice(1, -1)), `Model payload contained ${marker}`)
    assert.ok(payload.includes('Needs groceries for the plum family'), 'The case itself still reaches the model.')
    assert.ok(payload.includes('[email removed]') && payload.includes('[phone removed]') && payload.includes('[address removed]'))
    const card = body.actions.find(action => action.type === 'proposal')
    assert.equal(card.partner, 'Riverwest Pantry')
    assert.equal(card.referral, 'ref-1')
  } finally { globalThis.fetch = realFetch }
})
