# Run ComForce Connect locally

This guide specifies the commands the first MVP build must implement and verify. In the finished repo, replace this sentence with the Node version tested and any platform-specific differences observed.

## First run

Install Git, the Node version pinned in the repo, and Docker Desktop or another running Docker-compatible engine. Use the terminal in VS Code. From the directory where you keep projects:

```sh
git clone --branch integration https://github.com/andrew9990828/comforce-connect.git
cd comforce-connect
npm ci
npx supabase start
```

On the first implementation branch before its PR lands, switch to that branch before running `npm ci`. The repo supplies the Supabase CLI as a development dependency. The first start downloads containers and initializes the local database from checked-in migrations and synthetic seed data.

Copy the tracked `.env.example` to `.env.local`. In PowerShell use `Copy-Item .env.example .env.local`. In macOS/Linux/Git Bash use `cp .env.example .env.local`. Run `npx supabase status`. Set the public browser key to the **publishable** key from the local project (legacy local stacks may label it **anon**). Keep the configured local API URL and port consistent with the implementation. Never put the secret/service-role key in a Vite variable. No hosted project or OpenAI key is needed.

```sh
npm run dev
```

Open the Local URL printed by Vite. Visit `/`, `/request`, and `/team`. Leave Docker running. On subsequent days, use `npx supabase start` then `npm run dev`. Restart Vite after changing its environment.

## Try the demo on your phone

Connect both devices to the same trusted Wi-Fi. Run `npm run dev -- --host 0.0.0.0`. Open the Network URL printed by Vite on the phone. The MVP should route local database requests and realtime traffic through the dev server or document an equivalent tested method. A phone interprets `localhost` as the phone itself. If the page will not load, check the laptop's private-network firewall permission and Wi-Fi client isolation.

Open the queue on the laptop. Submit the fictional groceries-and-ride request from the phone. Fulfill groceries and refer the ride. Check that food impact increases by one, the ride stays open, and refreshing preserves both outcomes. Two browser sessions work for the same test when a physical phone is unavailable.

## Checks and cleanup

```sh
npm test
npm run build
npm run preview
```

The production build includes TypeScript checks. The preview serves the compiled frontend. Use the dev server for the local cross-device walkthrough unless the preview also has database routing configured.

To rebuild the disposable local database from migrations and reseed, run `npx supabase db reset --local`. This erases local edits to demo records. Use it deliberately. Stop Vite with Ctrl+C and shut down local database containers with `npx supabase stop`.

If setup fails, check Docker is running, confirm the pinned Node version, and compare the URL and **public** key with `npx supabase status`. If a port is occupied, use the configured port consistently in the CLI and frontend. Never paste full CLI status output into a public issue because it may include local credentials.
