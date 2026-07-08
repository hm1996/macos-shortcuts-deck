# macOS Control Center Deck (MCC)

A customizable tablet-based control center for macOS.

MCC turns an Android tablet or iPad into a programmable dashboard for launching applications, running commands, monitoring infrastructure, and controlling a Mac over the local network.

Although the default configuration targets DevOps workflows (AWS, Kubernetes, Git, VPN, Grafana, incident.io, etc.), every workspace, shortcut, action, and status source can be customized for any workflow.

## Features

- Tablet-first Progressive Web App (PWA)
- Context-aware shortcuts based on the active macOS application
- Custom workspace screens
- macOS automation via AppleScript and shell commands
- AWS, Kubernetes, GitHub and VPN integration
- Infrastructure status monitoring
- Media controls and volume management
- Pomodoro timer
- Screenshot capture
- HTTPS support for PWA installation
- Built-in admin dashboard

> Replace the screenshot below with your own.

```text
docs/images/dashboard.png
```
 Runs on a 10.9" Galaxy Tab S9 FE in landscape mode, connected via LAN to a macOS host that executes all actions.

> **Disclaimer**: This project is configured with devops-oriented defaults (AWS, Kubernetes, Git, VPN, incident.io polling, etc.) — my personal setup. You are free to customize actions, workspaces, shortcuts, focus contexts, and agent polls to fit any workflow. See the [customization sections](#customizing-the-shortcut-bar) below.

---

## Prerequisites

- **macOS** — the server and agent run on macOS only (uses `open`, `osascript`, `scutil`, `screencapture`)
- **Node.js 18+** — runtime for the server and agent
- **npm** — included with Node.js

Optional but recommended for full functionality:

| Tool | Used for |
|---|---|
| `aws` CLI | AWS credential & EKS cluster polling |
| `gh` CLI | Git repo discovery from GitHub org |
| `kubectl` | Kubernetes context shortcuts |
| `openssl` | TLS certificate generation |

## Setup

```bash
# Clone, install dependencies, and configure in one step
bash scripts/setup.sh
```

The setup script will:
1. Verify Node.js is installed
2. Run `npm install` for all dependencies
3. Create `.env` from `.env.example` (if not already present)
4. Create `state/` and `certs/` directories
5. Check for optional CLI tools (`aws`, `gh`, `kubectl`, `openssl`)

### Configuration

The project ships with generic `YOUR_*` placeholders. Replace them with your own values before using the app.

#### 1. `.env`

| Variable | What to set |
|---|---|
| `DCC_AWS_PROFILES` | Your AWS CLI profile names, comma-separated. Example: `profile1,profile2` |
| `DCC_GIT_ORG` | Your GitHub organization name for repo discovery |
| `DCC_GIT_WORKSPACE` | Absolute path to your local Git workspace directory |
| `DCC_INCIDENT_IO_API_KEY` | incident.io API key (optional — leave blank to disable) |
| `DCC_INCIDENT_IO_SCHEDULE_ID` | incident.io schedule ID (optional) |
| `DCC_CHROME_PROFILE_WORK` | Chrome profile directory name for work (default: `Default`) |
| `DCC_CHROME_PROFILE_PERSONAL` | Chrome profile directory name for personal (default: `Default`) |

#### 2. `actions/actions.json`

| Line | Placeholder | Replace with |
|---|---|---|
| 13 | `YOUR_ACCOUNT_ID` | Your AWS account ID (12 digits) |
| 14 | `YOUR_ACCOUNT_ID` | Your second AWS account ID |
| 16 | `YOUR_ORG` | Your GitHub organization name |
| 29 | `YOUR_DOMAIN` | Your Grafana monitoring domain |
| 30 | `YOUR_DOMAIN` | Your Grafana production domain |
| 32 | `YOUR_ORG`, `YOUR_PROJECT` | Your Vercel org and project name |
| 33 | `YOUR_PROJECT_ID` | Your PostHog project ID |

> Add, remove, or rename actions to match your apps and workflows. Use `profile-directory="Default"` or set Chrome profile names in `.env`.

#### 3. `server/routes.js`

| Line | Placeholder | Replace with |
|---|---|---|
| 184 | `YOUR_PROFILE` | Your AWS profile name for Warp inline commands |
| 185 | `YOUR_PROFILE` | Your second AWS profile name |

#### 4. `public/js/config.js`

**Shortcut pickers (`SHORTCUT_CONTEXTS`)**

| Line(s) | Placeholder | Replace with |
|---|---|---|
| 352-353 | `YOUR_ACCOUNT_ID` | AWS account IDs in the AWS picker |
| 387-388 | `YOUR_DOMAIN` | Grafana domain names |
| 389 | `YOUR_ORG`, `YOUR_PROJECT` | Vercel org and project name |
| 391 | `YOUR_PROJECT_ID` | PostHog project ID |
| 399-400 | `YOUR_PROFILE` | AWS profile names in the Warp profile picker |

**Focus contexts (`FOCUS_CONTEXTS`)**

Add your own app bundle IDs and actions. To find an app's bundle ID: `osascript -e 'id of app "App Name"'`.

#### 5. `workspaces/*.json`

Edit or replace workspace screen definitions with your own cards. Cards can trigger actions from `actions.json`.

#### 6. Start the server

```bash
# HTTP + agent (background)
bin/dcc-start

# Or via npm
npm start                     # HTTPS if certs exist, HTTP otherwise
npm run start:normal          # HTTP-only
npm run dev                   # Auto-reload (server + agent + SSE)
```

```bash
bin/dcc-stop                  # Stop server + agent
```

#### 7. Generate TLS certs (recommended for PWA)

```bash
bash scripts/generate-lan-cert.sh <YOUR_LAN_IP>
```

Server runs on `https://<mac-ip>:8721` (TLS auto-enabled when certs exist in `certs/`). Open that URL on the tablet. Add to home screen for fullscreen PWA.

---

## TLS / SSL certificates

HTTPS is required for the PWA to register a service worker and enable "Add to Home Screen." The `scripts/generate-lan-cert.sh` script creates a self-signed CA and a server certificate for your LAN IP.

### Generate certificates

```bash
bash scripts/generate-lan-cert.sh 192.168.1.22   # replace with your Mac's LAN IP
```

This creates `certs/dcc-ca.crt` (the CA you install on the tablet) and `certs/dcc-local.fullchain.crt` + `certs/dcc-local.key` (used by the server).

### Install the CA certificate on your tablet

You must install `certs/dcc-ca.crt` on the tablet so it trusts the self-signed server certificate. Transfer the file via AirDrop, email, or USB.

**Android (Samsung Galaxy Tab / Pixel / etc.)**

1. Go to **Settings → Security & privacy → More security settings → Encryption & credentials → Install a certificate → CA certificate**
2. Navigate to and select `dcc-ca.crt`
3. Tap **Install**. You may be prompted for your lock screen PIN.
4. Confirm with **OK** on the security warning.

> **Path may vary**: Some devices: Settings → Biometrics & security → Other security settings → Install from device storage → CA certificate.

**iPad (iOS / iPadOS)**

1. **AirDrop or mail** `dcc-ca.crt` to the iPad and tap the file.
2. A **"Profile Downloaded"** prompt appears — tap **Close** or go to **Settings → General → VPN & Device Management**.
3. Tap the **MCC Local Root CA** profile, then tap **Install** (top right). Enter your passcode.
4. Tap **Install** again on the warning prompt, then **Done**.
5. Go to **Settings → General → About → Certificate Trust Settings**.
6. Toggle **MCC Local Root CA** to **ON**, then tap **Continue**.

> **Safari navigation method**: You can also visit `http://<mac-ip>:8721/certs/dcc-ca.crt` (HTTP, not HTTPS) and Safari will prompt you to install the profile directly.

The tablet will now trust `https://<mac-ip>:8721`. Reload the page to see the green lock and enable PWA install.

---

## Architecture

```
┌─────────────────────────┐      ┌──────────────────────────────┐
│  Tablet (PWA)           │      │  macOS Server                │
│  ┌───────────────────┐  │ LAN  │  ┌────────────────────────┐  │
│  │  public/           │──┼──────┼──│  server.js (HTTP/HTTPS) │  │
│  │  index.html + 14 JS│  │      │  │  server/routes.js       │  │
│  │  modules           │  │      │  │  server/eks.js          │  │
│  │  Swiper carousel   │  │      │  └────────────────────────┘  │
│  │  Focus contexts    │  │      │  ┌────────────────────────┐  │
│  │  Media + volume    │  │      │  │  agent/ (30s polling)   │  │
│  └───────────────────┘  │      │  │  AWS, K8s, Git, VPN      │  │
│  fetch /api/*           │      │  │  incident.io, on-call    │  │
│  POST /action           │      │  │  → state/*.json          │  │
└─────────────────────────┘      │  └────────────────────────┘  │
                                 │  open -a "/ osascript / gh   │
                                 └──────────────────────────────┘
```

## Project structure

```
├── bin/                  # Start/stop scripts + LaunchAgent
├── server.js             # HTTP/HTTPS server entry
├── server/
│   ├── routes.js         # API routes, action dispatch, media, volume
│   └── eks.js            # EKS cluster cache + discovery
├── agent/
│   ├── index.js          # Poll loop
│   ├── lib.js            # Helpers (exec, writeState, region cache)
│   └── polls.js          # AWS, K8s, Git, VPN, incident.io pollers
├── public/               # Tablet PWA (vanilla JS, no framework)
│   ├── index.html
│   ├── styles.css
│   ├── sw.js             # Service worker (network-first cache)
│   ├── manifest.webmanifest
│   └── js/
│       ├── config.js     # FOCUS_CONTEXTS, SHORTCUT_CONTEXTS, icons
│       ├── audio.js      # Web Audio API beeps + pomodoro alert
│       ├── elements.js   # DOM references
│       ├── carousel.js   # Swiper workspace carousel
│       ├── clock.js      # Clock + macOS focus polling → Focus workspace
│       ├── pomodoro.js   # 25/5/15 timer with modal
│       ├── media.js      # Spotify, volume, notifications, audio devices
│       ├── state.js      # State polling + status pills
│       ├── shortcuts.js  # 13 shortcut buttons + action dispatch
│       ├── pickers.js    # Context picker overlay
│       ├── tooltip.js    # Tap-info tooltips
│       ├── frecency.js   # Time-decayed usage ranking
│       └── main.js       # Init glue
├── workspaces/           # Screen definitions (auto-loaded JSON)
│   ├── develop.json
│   └── ops.json
├── actions/              # Action definitions (auto-loaded JSON)
│   └── actions.json
├── state/                # Agent output (aws, k8s, git, vpn JSONs)
└── certs/                # TLS certificates
```

## Workspace screens

Screens are defined as JSON files in `workspaces/`. Each file becomes a carousel slide (4 per row, 6 per row for Focus).

```json
{
  "title": "Develop",
  "subtitle": "Build pipelines, branch state, and coding context.",
  "cards": [
    { "title": "Build Queue", "tag": "CI", "value": "2", "hint": "Oldest job 4m" },
    { "title": "PR Review", "tag": "Code", "value": "5", "hint": "2 high-priority", "action": "open-github-org" }
  ]
}
```

To add/remove a screen: drop/delete a `.json` file in `workspaces/`. Reload the page.

### Focus workspace

The first slide shows context-aware actions based on the frontmost macOS app (polled every 3s via `/api/focus`). Each app gets 18 compact cards (6 per row × 3 rows).

Mappings are in `public/js/config.js` → `FOCUS_CONTEXTS` keyed by bundle ID. Actions use either:
- **URL openers** — `open -na "Google Chrome" ... "https://..."` for web destinations
- **appShortcut** — AppleScript keystroke combos for keyboard shortcuts
- **warpInline** — types commands in current Warp tab

## Actions

Actions are defined in `actions/actions.json`. Each is a name → shell command pair:

```json
{ "name": "open-gmail", "command": "open -na \"Google Chrome\" --args --profile-directory=\"Default\" \"https://mail.google.com\"" }
```

Dynamic actions (`open-k9s:*`, `open-github-repo:*`, `warp-cd-repo:*`, etc.) parse parameters at runtime. To add an action: add a line to `actions.json`, restart the server.

## Shortcut bar

13 persistent shortcut buttons at the bottom. 7 use context pickers (Chrome, VS Code, VPN, K9s, AWS, GitHub, Grafana). Tap → picker, double-tap → default action.

## Status bar

Left-to-right: pulse dot (green=online), clock (tap → Calendar), incident badge, status pills (VPN/AWS/K8s/Git), pomodoro timer, media strip (Spotify), volume float (bottom-right), on-call indicator.

## Floating controls

- **Volume** — bottom-right. Tap to expand, tap buttons to adjust. Double-tap → audio device picker.
- **Screenshot** — bottom-left camera icon. Tap to area-select → clipboard.

## Updating

| Change | Restart required |
|---|---|
| Workspaces | No (reload the page) |
| CSS | No (reload the page) |
| `config.js` | No (reload the page) |
| `actions/actions.json` | Yes |
| `.env` | Yes |
| Server or agent code | Yes |

Restart the application with:

```bash
bin/dcc-stop && bin/dcc-start
```

---

## Environment Variables

The following variables control the application:


| Variable | Default | Description |
|---|---|---|
| `DCC_PORT` | 8721 | HTTP/HTTPS port |
| `DCC_TLS_REQUIRED` | 0 | Force TLS (reject if no certs) |
| `DCC_DEV` | 0 | Enable SSE hot-reload + verbose |
| `DCC_VERBOSE` | 0 | Debug request logging |
| `DCC_POLL_MS` | 30000 | Agent poll interval |
| `DCC_FOCUS_MS` | 3000 | macOS focus poll interval |
| `DCC_AWS_PROFILES` | — | AWS CLI profiles to poll (comma-separated) |
| `DCC_INCIDENT_IO_API_KEY` | — | incident.io API key |
| `DCC_INCIDENT_IO_SCHEDULE_ID` | — | incident.io schedule ID |
| `DCC_GIT_ORG` | — | GitHub org for repo discovery |
| `DCC_GIT_WORKSPACE` | — | Local path for git repos |

### AWS profiles

Set `DCC_AWS_PROFILES` in `.env` with your AWS CLI profile names (comma-separated). The agent polls each profile for credentials and EKS clusters.

### Actions

Customize `actions/actions.json` with your own app names, URLs, and shortcuts. Restart the server after changes.

### Workspaces

Customize `workspaces/*.json` with your own cards and actions. No restart needed — reload the tablet page.

---

## Admin dashboard

Open `/admin` on the tablet (or desktop browser) for a visual admin panel. Five tabs:

| Tab | What you can do |
|---|---|
| **Dashboard** | Server health, screen/action counts, recent logs |
| **Screens** | Create, edit, and delete workspace screens + their cards |
| **Focus** | Add and edit focus contexts (app → quick actions) |
| **Actions** | Add and delete shell command actions |
| **Env Vars** | View, edit, add, and delete `.env` variables |

All changes are saved to disk immediately. Screens and focus contexts update on the tablet after a page reload. Actions and env vars require a server restart (`bin/dcc-stop && bin/dcc-start`).

---

## Customizing the shortcut bar

The 13 persistent buttons at the bottom of the tablet UI are defined in `public/index.html` as `<a>` links with `data-action` attributes. The configuration lives in `public/js/config.js` → `SHORTCUT_CONTEXTS`.

### Context pickers

A shortcut with `pickerMode: "single"` opens a picker overlay on tap. Double-tap fires the `defaultAction` directly without showing the picker.

```js
"my-action": {
  title: "My Picker",           // shown in the picker header
  pickerMode: "single",         // tap → picker, double-tap → default
  defaultAction: "option-1",    // fired on double-tap
  options: [                    // static options
    { label: "Option 1", description: "Description", action: "option-1" },
    { label: "Option 2", description: "Description", action: "option-2" }
  ]
}
```

### Dynamic pickers (fetch from server)

For data that changes, use `fetchOptions` + `mapItem` instead of static `options`:

```js
"open-k9s": {
  title: "K9s — cluster",
  pickerMode: "single",
  fetchOptions: "/api/clusters",            // GET endpoint returning JSON
  refreshEndpoint: "/api/clusters/refresh", // optional refresh button
  mapResponse: function (data) { return { items: data.items }; },
  mapItem: function (item) {
    return { label: item.name, description: item.region, action: `my-action:${item.name}` };
  },
  sortItems: function (options) { return sortByFrequency(options); }
}
```

### Adding a shortcut button

Add to `public/index.html`:

```html
<a class="shortcut-link shortcut-link--contextual" href="#" data-action="my-action">
  <svg class="shortcut-icon shortcut-icon--tabler" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <!-- icon paths here -->
  </svg>
  <span>Label</span>
</a>
```

Icons are SVGs from the `ACTION_ICONS` map in `config.js`. Prefix-match lookup: the action name prefix maps to an icon key (e.g., `open-chrome` → Chrome icon, `open-github-repo:*` → GitHub icon).

## Customizing the status bar

The status bar shows state pills (VPN, AWS, K8s, Git) polled from `state/*.json` by the agent. The mapping is in `public/js/config.js` → `STATE_SOURCES`:

```js
const STATE_SOURCES = {
  aws: ["/state/aws.json"],
  kubernetes: ["/state/kubernetes.json"],
  git: ["/state/git.json"],
  vpn: ["/state/vpn.json"],
  incidents: ["/state/incidents.json"],
  communicate: ["/state/communicate.json"]
};
```

Each state file contains an `instances` array. The status pill shows a summary count + colors (green for `ok`, yellow for `warn`, red for `error`). To add a new status source, add it to `STATE_SOURCES` and ensure the agent writes the corresponding JSON file.

### Status pill rendering

The logic is in `public/js/state.js`. Each pill is matched by a `data-source` attribute in `index.html`, with color classes:
- `pill--ok` (green) — all instances healthy
- `pill--warn` (yellow) — at least one warning
- `pill--error` (red) — at least one error or no data

## Adding more

### Adding a new workspace screen
Create a JSON file in `workspaces/`:
```json
{
  "title": "My Screen",
  "subtitle": "Description.",
  "cards": [
    { "title": "Card 1", "tag": "Tag", "value": "42", "hint": "Info" },
    { "title": "Card 2", "tag": "Tag", "value": "Open", "hint": "Click me", "action": "open-slack" }
  ]
}
```
Reload the tablet page. Cards appear in 6-per-row grid (alphabetical by filename).

### Adding a new action
Add to `actions/actions.json`:
```json
{ "name": "my-action", "command": "open -a \"App Name\"" }
```
Restart server (`bin/dcc-stop && bin/dcc-start`).

### Adding a new focus context
In `public/js/config.js` → `FOCUS_CONTEXTS`, add a bundle ID entry:
```js
"com.example.AppBundleId": {
  app: "My App",
  actions: [
    { label: "Action 1", action: "my-action" },
    { label: "Action 2", action: "open-slack" }
  ]
}
```
To find an app's bundle ID: `osascript -e 'id of app "App Name"'`.
Reload the tablet page.

### Adding a context picker shortcut
In `public/js/config.js` → `SHORTCUT_CONTEXTS`:
```js
"my-action": {
  title: "My Picker",
  pickerMode: "single",
  defaultAction: "option-1",
  options: [
    { label: "Option 1", description: "...", action: "option-1" },
    { label: "Option 2", description: "...", action: "option-2" }
  ]
}
```
Add a shortcut button in `public/index.html`:
```html
<a class="shortcut-link shortcut-link--contextual" href="#" data-action="my-action">
  <svg class="shortcut-icon shortcut-icon--tabler" ...>...</svg>
  <span>Label</span>
</a>
```
Reload the tablet page.


---

# Quick Reference

| Task | Command |
|---|---|
| Install | `bash scripts/setup.sh` |
| Development | `npm run dev` |
| Start | `bin/dcc-start` |
| Stop | `bin/dcc-stop` |
| Generate TLS certificates | `bash scripts/generate-lan-cert.sh <LAN_IP>` |

## Suggested Documentation Structure

```
README
├── Features
├── Installation
├── Configuration
├── Running
├── Architecture
├── Project Structure
├── Customization
│   ├── Workspaces
│   ├── Actions
│   ├── Focus Contexts
│   ├── Shortcut Bar
│   ├── Status Bar
│   └── Admin Dashboard
├── Updating
└── Quick Reference
```
