# Release Kit — WiFi Scanner v1.0.0

Everything needed to publish this project: repository documentation, user
docs, and ready-to-paste GitHub/social post copy.

**This folder is for maintainers — it is not part of the app.** Nothing here
is required to run or build the scanner.

## Where everything goes

### 1. Repository files (copy into the repo root)

| File in this kit | Goes to | What it is |
|---|---|---|
| `REPO-README.md` | `README.md` | The GitHub landing page |
| `LICENSE-MIT.txt` | `LICENSE` | MIT license (fill in the copyright name) |
| `CHANGELOG.md` | `CHANGELOG.md` | Keep-a-Changelog style history |
| `github-posts/.gitignore` | `.gitignore` | Keeps `node_modules/`, `dist/`, `data/` out |

### 2. Documentation (copy into the repo as `docs/`)

| File | Purpose |
|---|---|
| `docs/INSTALL.md` | Two ways in: the one-file exe, or running from source |
| `docs/USER-GUIDE.md` | Reading the dashboard: columns, filters, detail panel |
| `docs/TROUBLESHOOTING.md` | SmartScreen, AV flags, port conflicts, empty scans |
| `docs/FAQ.md` | Short answers to the questions every release gets |
| `docs/BUILD-FROM-SOURCE.md` | `npm install` → `npm run build` → one exe |
| `docs/ARCHITECTURE.md` | The scan pipeline, module by module |
| `docs/WINDOWS-vs-KALI.md` | Honest comparison with `airmon-ng` / monitor mode |
| `docs/PRIVACY-SECURITY.md` | What touches the network, what leaves the machine |
| `docs/CODE-SIGNING.md` | Optional: remove SmartScreen/AV warnings (cert options + CI secrets) |
| `docs/img/dashboard.jpeg` | Screenshot for the README (viewport) |
| `docs/img/dashboard-full.png` | Full-page screenshot (README hero image) |

> The `REPO-README.md` references screenshots at `docs/img/…`, so copy the
> `img/` folder along with the docs.

### 3. Post copy (do not put in the repo — paste from here)

| File | Purpose |
|---|---|
| `github-posts/RELEASE-NOTES-v1.0.0.md` | GitHub Release body |
| `github-posts/ANNOUNCEMENT-POSTS.md` | Short / Reddit / HN / X variants |
| `github-posts/REPO-META.md` | Repo description (≤350 chars) + topics |

### 4. Package managers (copy `winget/` into the repo)

| File | Purpose |
|---|---|
| `winget/manifests/*.yaml` | Ready-to-submit winget manifest — `winget install <PUBLISHER>.WiFiScanner` after approval |
| `winget/README.md` | Hash to fill + exact submission commands |

## Publish in 5 minutes

1. **Prepare the repo folder** — copy `REPO-README.md` → `README.md`,
   `LICENSE-MIT.txt` → `LICENSE`, `CHANGELOG.md`, `github-posts/.gitignore`
   → `.gitignore`, and the whole `docs/` folder into a fresh project copy.
2. **Sanity-check** — from the repo root: `npm install && npm start` → the
   dashboard loads on `http://127.0.0.1:3847`. Then `npm run build` →
   `dist\WiFiScanner.exe`.
3. **Create the GitHub repo** — name suggestion: `wifi-scanner`. Paste the
   description and topics from `github-posts/REPO-META.md`. Push.
4. **Attach the exe** — upload `dist\WiFiScanner.exe` to the v1.0.0 Release
   and paste `github-posts/RELEASE-NOTES-v1.0.0.md` as the body. (GitHub
   caps release assets at 2 GB, so 90 MB is fine.)
5. **Announce** — pick a variant from `github-posts/ANNOUNCEMENT-POSTS.md`
   for Reddit / Hacker News / X.

Full step-by-step with verification commands: `PUBLISH-CHECKLIST.md`.

## The one thing to decide before publishing

**Your name for the copyright line.** `LICENSE-MIT.txt` contains
`<COPYRIGHT HOLDER>` — replace it with your name or GitHub handle before
pushing, otherwise the license is ambiguous.
