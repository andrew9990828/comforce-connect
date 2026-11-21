# Run ComForce Connect locally

Use fictional details. The public entry is [Community impact](http://127.0.0.1:5173/), intake is [Request help](http://127.0.0.1:5173/request), and judges open the [Team workspace](http://127.0.0.1:5173/team) directly. The public atlas uses a shared read-only template. Writable team and intake workspaces last 24 hours, so use the same browser and site address during a demo session.

## Andrew’s laptop · tested standalone setup

The installed launcher starts PostgreSQL 17.12, PostgREST 13.0.7, Supabase Auth 2.198.0, Mailpit 1.34.0, a local API gateway and the Vite frontend. Its data and per-user credentials live under `%LOCALAPPDATA%\ComForceConnect\standalone`. The gateway listens on loopback port 54321. The frontend uses a browser-safe key injected by the launcher.

**Restart and preserve records.** If [Impact](http://127.0.0.1:5173/) displays the atlas and [Team](http://127.0.0.1:5173/team) loads its queue, reuse them. After a reboot or normal shutdown, run this in PowerShell under Andrew’s Windows account. Keep the terminal open. The launcher reopens the existing database and supplies the public key without editing `.env.local`.

```powershell
$runtime = Join-Path $env:LOCALAPPDATA 'ComForceConnect\standalone'
& (Join-Path $runtime 'start.ps1')
```

**Phone presentation.** Connect the phone and laptop to the same trusted Wi-Fi. From the repo root, the following serves the existing production build on the laptop’s Wi-Fi address. Run it only if that address is not already serving the presentation. Keep this second terminal open.

```powershell
$runtime = Join-Path $env:LOCALAPPDATA 'ComForceConnect\standalone'
$wifi = (Get-NetIPConfiguration -InterfaceAlias 'Wi-Fi').IPv4Address.IPAddress
& (Join-Path $runtime 'bin\node.exe') .\node_modules\vite\bin\vite.js preview --host $wifi --port 5173 --strictPort
```

To rebuild this standalone presentation after a code change, open the running loopback Impact page with browser developer tools. In **Network**, reload, select the `public_impact` request and copy only the value of its `apikey` request header. In a Node 22.15+ terminal at the repo root, run `$env:VITE_SUPABASE_PUBLISHABLE_KEY = (Get-Clipboard).Trim()`, then `$env:VITE_SUPABASE_URL = '/api'` and `npm run build`. This uses the same public configuration as the running frontend and leaves `.env.local` intact.

1. Open the printed **Network URL** with `/team` on the laptop. Choose **Pair a resident device → Copy resident link**. Share that link privately with the phone. If you opened Team on loopback, enter the full Network URL in **Laptop’s Wi-Fi address** before copying.
2. Open the link on the phone. This pairs resident intake and Impact to that laptop queue. For the family story, select **Missing person / family support** and **Transportation**. Another judge can open plain `/team` in their own browser to start a separate workspace. The database keeps no more than 50 active visitor workspaces and removes expired ones before provisioning another.
3. To rehearse on one computer, use a private window for the resident and a normal window for the team. To reuse changes, keep the original browser storage. If a phone cannot reach the Network URL, check private-network firewall access for that frontend and Wi-Fi client isolation.

**Optional verified staff.** Open [Staff sign-in](http://127.0.0.1:5173/team?mode=staff). Enter `von@comforce.example` and choose **Send sign-in code**. In a second tab open [local Mailpit](http://127.0.0.1:54324/), copy the newest six-digit code, return to the staff tab and choose **Open workspace**. This path opens the preserved original cases. The fictional team demo opens immediately.

## Docker and the Supabase CLI · portable setup

Install Node 22.15 or later and start Docker Desktop with Linux containers. From a checkout containing this feature, run the following in PowerShell. Use `npm.cmd` or `npx.cmd` if local script execution is restricted.

```powershell
npm ci
npx supabase start
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npx supabase status -o env | Select-String '^(PUBLISHABLE_KEY|ANON_KEY)='
```

Set `VITE_SUPABASE_PUBLISHABLE_KEY` to the public key from the filtered output and keep `VITE_SUPABASE_URL=/api` locally. Start `npm run dev`. For a Wi-Fi presentation, build with those values and run `npm run preview -- --host YOUR_WIFI_IP --port 5173 --strictPort` on the Wi-Fi interface. A fresh CLI database uses the migrations and both configured seed files. To apply forward migrations to existing CLI data, run `npx supabase migration up --local`, then load only [demo_seed.sql](../supabase/demo_seed.sql) using the local Studio SQL Editor. For a normal restart, use `npx supabase stop` then `npx supabase start`.

**Destructive local reset (Docker only).** `npx supabase db reset --local` erases the local database and recreates it with both seed files. Use a fresh browser profile afterward. For another judging workspace without erasing data, open `/team` in a separate browser profile. On Andrew’s standalone installation, retain the existing cluster and its credentials during restarts.

## Checks

```sh
npm test
npm run typecheck
npm run test:db
npm run build
npm run preview
```

With the local app running, execute `npm run test:live`. For production preview, set `$env:COMFORCE_APP_URL='http://127.0.0.1:4173'` first. The walkthrough runs real fictional transactions in new isolated workspaces. It checks both multi-service stories, retries, independent access, reloads, keyboard use, touch emulation and 390/1440 px layouts. Set `CHROME_PATH` when Edge or Chrome is outside the default paths.

The native Windows stack was tested with a fresh PostgreSQL database, both seed files, the SQL suites and an in-place upgrade of Andrew’s database. Docker was unavailable on this laptop. Physical phone and live hosted checks remain for presentation day. [Supabase and Cloudflare handoff](../README.md#hosting-checklist)
