# Run ComForce Connect locally

Use the PowerShell terminal in VS Code. Development checks ran on Windows with Git 2.55.0, Node 22.15.0, npm 10.9.2, Supabase CLI 2.122.1 and Microsoft Edge 157. Start Docker Desktop in Linux-container mode for the CLI stack.

The implementation machine lacked Docker. Its two-browser walkthrough ran with standalone PostgreSQL 17.12, PostgREST 13.0.7, Supabase Auth 2.198.0 and Mailpit 1.34.0. A temporary Windows build of Auth used Go’s standard TCP listener. The CLI startup reached the missing-engine check. Container initialization, CLI reset and physical-phone LAN access still need a Docker-equipped laptop.

## First run

Install Git, Node 22.15 or later and Docker Desktop, then start Docker Desktop. From your projects folder, clone the repository. If Andrew has already integrated the feature, use the clone as-is. For a shared feature branch awaiting integration, run `git switch --track origin/feature/comforce-mvp` after cloning. In the original local MVP checkout, run `git switch feature/comforce-mvp` directly.

```sh
git clone --branch integration https://github.com/andrew9990828/comforce-connect.git
cd comforce-connect
```

After selecting the branch containing `package.json`, check the Docker server and install from the lockfile.

```powershell
docker version
npm ci
npx supabase start
```

The repo supplies the CLI as a development dependency. The first start downloads containers and initializes the database with the checked-in migrations and fictional seed. Later starts reuse your local data.

Create the environment file once and display only the browser-safe keys.

```powershell
Copy-Item .env.example .env.local
npx supabase status -o env | Select-String '^(PUBLISHABLE_KEY|ANON_KEY)='
```

In `.env.local`, paste the **publishable** value into `VITE_SUPABASE_PUBLISHABLE_KEY`. The legacy **anon** value also works. Leave `VITE_SUPABASE_URL=/api`. Keep private keys out of browser configuration. If PowerShell blocks `npm.ps1` or `npx.ps1`, use `npm.cmd` and `npx.cmd` for the same commands.

```sh
npm run dev
```

Open `http://localhost:5173` for impact and `/request` for intake. To enter `/team`, choose **Send sign-in code**, open Mailpit at `http://127.0.0.1:54324` on the laptop and read the latest six-digit code for `von@comforce.example`. Enter it and choose **Open workspace**. In the workspace choose **New request** to log a call or text. On subsequent days, use `npx supabase start` then `npm run dev`. Restart Vite after environment edits.

## Try the demo on your phone

Connect both devices to trusted Wi-Fi. Stop Vite and run `npm run dev -- --host 0.0.0.0`. Open its Network URL on the phone. A phone interprets `localhost` as itself. The same-origin Vite proxy forwards the app’s REST polling and authentication requests to port 54321 on the laptop. Only Vite needs LAN access. Keep Studio, PostgreSQL and Mailpit on the development computer. If the page will not load, check the laptop’s private-network firewall permission and Wi-Fi client isolation.

Open the queue on the laptop. Submit the fictional groceries-and-ride request from the phone. Fulfill groceries and refer the ride. Check that food impact increases by one, the ride stays open, and refreshing preserves both outcomes. Two browser sessions work for the same test when a physical phone is unavailable.

## Checks and cleanup

```sh
npm test
npm run test:db
npm run test:live
npm run build
npm run preview
```

Run the checks from a second terminal with Vite and Supabase running. `npm test` checks intake rules. `test:db` runs the SQL regression suite. `test:live` uses installed Edge or Chrome and two isolated sessions, including mobile emulation. Set `CHROME_PATH` to another Chromium executable if needed. Each run leaves a fictional two-need request in this local database. The production build includes TypeScript checks. Preview serves the compiled frontend with the same local API proxy, usually at `http://localhost:4173`.

**Destructive local-only reset.** To erase local demo records and staff sessions and restore the seed, run `npx supabase db reset --local`. Sign in again afterward. Stop dev and preview servers with Ctrl+C. Shut down the stack with `npx supabase stop` to keep the local database for next time.

If startup fails, check that `docker version` shows a server, check `node --version` and compare the public key with the filtered status command above. The CLI’s full status output may contain private credentials.

**Hosted later.** A static host would serve `dist/` with navigation fallback to `index.html`. Its build would use the dedicated demo project’s HTTPS URL and publishable key. Isolate each public visitor’s fictional workspace or restrict input to fixed samples before turning on a public staff demo.
