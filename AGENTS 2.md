# AGENTS.md — macOS Control Center Deck (MCC)

## What this project is
Tablet-first remote control panel for macOS. A Node.js HTTP/HTTPS server serves a PWA to a tablet over LAN. The tablet sends actions (shell commands) that execute on the macOS host. A polling agent gathers AWS, K8s, Git, VPN, and incident.io status.

## Tech stack
- **Backend**: Node.js (vanilla, no framework) — `server.js`, `server/routes.js`, `server/eks.js`
- **Agent**: Node.js poll loop — `agent/index.js`, `agent/lib.js`, `agent/polls.js`
- **Frontend**: Vanilla JS, no framework — `public/` (all files)
- **State**: JSON files in `state/`, written by the agent, read by the frontend
- **CSS**: Vanilla, dark theme, tablet-first (1920×1080 landscape)
- **UI library**: Swiper 14 (carousel navigation between workspace screens)
- **Dependencies**: `dotenv`, `nodemon` (dev), `swiper` (production)

## Project conventions

### Code style
- Vanilla JS everywhere — no TypeScript, no JSX, no build step
- Server: CommonJS (`require`/`module.exports`), Node.js built-in modules only
- Frontend: IIFE-style scripts, global variables (no modules, no ES imports)
- All scripts loaded via `<script>` tags in `index.html`
- CSS: dark theme (`#0a0f17` background), accent color `#cfa06d` (gold), secondary `#7fc7b2` (teal)
- Icons: inline SVG with `viewBox="0 0 24 24"` stroke-based Tabler-style

### File patterns
- **Actions**: `actions/actions.json` — array of `{ name, command }` objects. Reloaded on every POST to `/action` (no server restart needed).
- **Workspaces**: `workspaces/*.json` — auto-loaded by the frontend via `/api/workspaces`. Each file becomes a carousel slide.
- **State**: `state/*.json` — agent output. Read by the frontend via fetch. Never committed.
- **Public**: Pure static files. Served by the Node.js server with MIME-type mapping.

### API patterns
- Routes are in `server/routes.js` → `handleRequest()`
- Admin routes: `/api/admin/*` (GET/PUT for screens, actions, focus, env)
- Action dispatch: `POST /action` with `{ action: "name", param: "value" }` → executes shell command
- Focus polling: `GET /api/focus` → returns frontmost app bundle ID
- State served statically: `/state/*.json`

### Server patterns
- HTTP/HTTPS auto-detection: if `certs/dcc-local.key` + `certs/dcc-local.fullchain.crt` exist → HTTPS, else HTTP
- Dev mode (`DCC_DEV=1`): enables SSE at `/api/dev-events` for hot-reload
- All config via `.env` (dotenv)
- Logs go to stdout (captured to `/tmp/dcc-server.log` by launch scripts)

## Placeholders to replace on first use

The project ships with `YOUR_*` placeholders in several files. All must be replaced before using the app.

| File | Placeholder | Replace with |
|---|---|---|
| `.env` | `DCC_AWS_PROFILES=` | Comma-separated AWS CLI profile names |
| `.env` | `DCC_GIT_ORG=` | GitHub organization name |
| `.env` | `DCC_GIT_WORKSPACE=` | Absolute path to local git workspace |
| `actions/actions.json` L13-14 | `YOUR_ACCOUNT_ID` | AWS account IDs |
| `actions/actions.json` L16 | `YOUR_ORG` | GitHub org name |
| `actions/actions.json` L29-30 | `YOUR_DOMAIN` | Grafana monitoring domains |
| `actions/actions.json` L32 | `YOUR_ORG`, `YOUR_PROJECT` | Vercel org and project |
| `actions/actions.json` L33 | `YOUR_PROJECT_ID` | PostHog project ID |
| `server/routes.js` L184-185 | `YOUR_PROFILE` | AWS profile names for Warp inline |
| `public/js/config.js` L352-353 | `YOUR_ACCOUNT_ID` | AWS account IDs in picker |
| `public/js/config.js` L387-388 | `YOUR_DOMAIN` | Grafana domains in picker |
| `public/js/config.js` L389 | `YOUR_ORG`, `YOUR_PROJECT` | Vercel info in picker |
| `public/js/config.js` L391 | `YOUR_PROJECT_ID` | PostHog project ID in picker |
| `public/js/config.js` L399-400 | `YOUR_PROFILE` | AWS profiles in Warp picker |

## How to modify

### Adding a new action
1. Add to `actions/actions.json` or use Admin → Actions tab
2. No restart needed (reloaded on next POST)

### Adding a new workspace screen
1. Create a `.json` file in `workspaces/` or use Admin → Screens tab
2. Format: `{ "title": "X", "subtitle": "Y", "cards": [...] }`
3. Each card: `{ title, tag, value, hint, action? }`
4. No restart needed — reload the tablet page

### Adding a new focus context
1. Add to `FOCUS_CONTEXTS` in `public/js/config.js` or use Admin → Focus tab
2. Keyed by macOS bundle ID (e.g., `"com.google.Chrome"`)
3. Format: `{ app: "Name", actions: [{ label, action }] }`
4. No restart needed — reload the tablet page

### Adding a new shortcut picker
1. Add to `SHORTCUT_CONTEXTS` in `public/js/config.js`
2. Add the button HTML to `public/index.html` with `data-action` attribute
3. Add icon SVG to `ACTION_ICONS` in `config.js`

### Modifying the agent poll logic
1. Edit `agent/polls.js` — add/change poll functions
2. Edit `agent/index.js` — register the new poll in the loop
3. State files are automatically written by `writeState(filename, data)` from `agent/lib.js`

### Modifying server routes
1. Edit `server/routes.js` → `handleRequest()`
2. Admin routes go through the `handleAdmin()` dispatch → `getAdminResource()`

## Gotchas
- Frontend is NOT a module system — watch for global variable collisions
- State files (`state/*.json`) are gitignored but may be tracked if committed before the gitignore was added
- TLS certs in `certs/` are gitignored — never commit them
- `.env` is gitignored — use `.env.example` for the template
- The agent polls are macOS-specific (use `osascript`, `scutil`, `open`, `screencapture`)
- Action dispatch executes shell commands — treat action definitions as trusted input
- `DCC_AWS_PROFILES` env var controls which AWS profiles the agent polls (comma-separated)
- Workspace screens are ordered alphabetically by filename, with "Focus" always first
- The static file server is minimal — it only serves files with known MIME types from `public/`