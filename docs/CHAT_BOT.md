# Website assistants

The site has two separate AI assistants, powered by an OpenAI model (default `gpt-6-luna`, set with `OPENAI_MODEL`). Each one only gets the access its page needs.

| | Community assistant | Team assistant |
| --- | --- | --- |
| Where | Community impact and Request help (public pages) | Team workspace queue |
| Who | Residents and visitors | Staff and volunteers in a workspace |
| Data it can read | None. Only published site facts in its instructions | The caller's own queue, loaded with their workspace token or staff session |
| What it can do | Answer questions, explain the site, pre-fill the request form | Search and summarize the queue, explain next steps, open cases, draft updates |
| Writes | None. The resident reviews the form and presses Submit | None. Staff press **Save update** on each proposal card |

## Comparable products

- **Public bots don't use personal data.** GOV.UK Chat tells people not to enter personal information and filters it out. The service doesn't need any personal data to work ([terms](https://www.gov.uk/guidance/govuk-chat-terms-and-conditions), [launch post](https://gds.blog.gov.uk/2026/05/14/gov-uk-chat-launches/)). Our community assistant never asks for contact details and has no database access, so it can't reveal anyone's request.
- **Separate customer and staff assistants.** Intercom runs a customer-facing Fin AI Agent that answers from the help center, and a separate Copilot for support staff that reads conversation history and internal knowledge ([Copilot](https://www.intercom.com/help/en/articles/9121374-fin-ai-copilot-explained)). We split ours the same way.
- **Staff approve every action.** Zendesk's auto assist suggests actions, and an agent approves each one before it runs. Approved actions are recorded under that agent's name ([auto assist](https://support.zendesk.com/hc/en-us/articles/9945148867866-About-auto-assist)). Our team assistant's `propose_update` works the same way. Saves go through the existing `update_need` call with the staff member's own credentials, so the case history stays accurate.

## How it works

- The browser posts the chat to `/agent/community` or `/agent/team`. The server code in [server/agents/](../server/agents/) calls the OpenAI Chat Completions API with strict function tools and keeps the API key off the browser.
- The team endpoint loads `team_queue` with the caller’s credentials **before** calling the model. It rejects anyone without workspace access, and Postgres decides which cases are visible.
- The resident's contact field (phone or email) is never sent to the model. Contact details typed into free text can still reach a case: descriptions, family support notes, and history details and sources. Closed-need outcomes, delivering providers, partner contacts and agency names can contain them too. The team assistant replaces emails, phone numbers and street addresses in all of these fields with placeholders, and then runs every tool result through the same redaction again before it reaches the model ([server/agents/privacy.ts](../server/agents/privacy.ts)). An agency's case number is never sent; the model only learns whether one exists. The replacement is pattern-based, so it's a safety net, not a guarantee. Staff should still keep contact details out of notes. `npm test` plants fictional contact details in every one of these fields and checks the exact payload sent to OpenAI.
- Resident-written text is labeled as data, not instructions. Even if a description tries to steer the assistant, the assistant can still only propose changes.
- The conversation is kept in `sessionStorage` for the tab, so it survives page links and clears when the tab closes. Nothing is saved on the server. Team conversations are stored separately for each staff account and demo workspace, and all of them are cleared on sign-out. That includes a sign-out from another tab, or an expired session.
- Each proposal card gets its own operation key when it arrives, so saving it again, retrying it, or a reply arriving late can never write the update twice.
- Times the team assistant proposes without an offset are read as Chicago time, never as the server's time zone. Impossible dates (such as February 30) and times skipped when clocks spring forward are rejected, so staff choose a real time instead of getting a shifted one. Fulfillment and decline cards name the partner taken from the selected referral.
- If the model refuses or its content filter triggers, the reply points to 911 and 211.

## Setup

1. `npm install` (adds the `openai` package).
2. Locally, put `OPENAI_API_KEY=...` in `.env.local` (optionally `OPENAI_MODEL=...`). Never use a `VITE_` prefix for it. `npm run dev` and `npm run preview` serve the endpoints.
3. On Cloudflare Pages, [functions/agent/[name].ts](../functions/agent/%5Bname%5D.ts) serves the same endpoints. Add `OPENAI_API_KEY` as an encrypted secret, and set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as runtime variables. GitHub repository secrets don't reach Pages on their own. They're only visible to GitHub Actions workflows, so set these in the Pages project settings. Add a rate-limiting rule for `/agent/*`, because the community endpoint is public and every message costs API credits.

## Not done yet

- No server-side rate limiting.
- Andrew's standalone launcher has to pass `OPENAI_API_KEY` in its environment for the assistants to work there.
- `npm run test:assistant` checks the community assistant's boundaries against the real OpenAI API: off-topic requests, prompt injection, promises, legal, medical and eligibility advice, emergencies, and privacy. It sends 13 short requests per run. `npm test` covers conversation state, Chicago times and the outgoing team payload offline. With the local app and Supabase running, `npm run test:assistant-ui` checks the panel in a browser with a stubbed assistant endpoint, so no OpenAI credits are used. It covers a card saved while a reply is pending (exactly one referral row), reloading mid-answer, New chat during a reply, switching workspaces, and staff sign-out. `npm run test:live` passes with the floating button on screen.
