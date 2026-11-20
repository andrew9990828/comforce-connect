# Chat bot

Work in progress on the `feature/chat-bot` branch.

## Goal

Build a chat bot into the ComForce Connect website. Residents can ask questions and request food, rides and family support in conversation. The bot gathers the same details as the [request form](../src/intake/) and submits one request with a single reference.

## Scope

- Available from the website's public pages, with a focus on the `/request` route next to the existing form.
- Uses the resident credential and the same scoped SQL functions as web intake. It gets no new database access.
- Uses fictional details only, like the rest of the demo.

## Open questions

- Which model and hosting approach to use for the conversation.
- How a resident hands off from the bot to a person on the team workspace.
