// Design preview routing. Codex (GPT-6) isolated sample screens from connected workspaces.
export const preview = /^\/preview(?:\/|$)/.test(location.pathname)
export const route = (path: string) => preview ? '/preview' + path : path
