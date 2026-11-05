# Publish Checklist — v1.0.0

End-to-end steps from this kit to a live GitHub release. Estimated time:
15–20 minutes.

---

## 0. One-time decision

- [x] Replace `<COPYRIGHT HOLDER>` in `LICENSE-MIT.txt` with your name/handle. *(done: `LICENSE` = ahsanbhutta)*
- [x] In `CHANGELOG.md`, fix the release URL at the bottom
      (`https://github.com/<OWNER>/<REPO>/…`). *(done: ahsanbhutta/wifi-scanner)*

---

## 1. Assemble the repo folder

Copy from this kit into the project root (a fresh folder you'll turn into
the git repo — or the existing `wifi-scanner\` folder):

```powershell
$kit  = "C:\Users\t3zaa\OneDrive\Documents\Default Project\wifi-scanner\release-kit"
$repo = "C:\path\to\your\new\repo"     # or the existing wifi-scanner folder

Copy-Item "$kit\REPO-README.md"        "$repo\README.md"
Copy-Item "$kit\LICENSE-MIT.txt"       "$repo\LICENSE"
Copy-Item "$kit\CHANGELOG.md"          "$repo\CHANGELOG.md"
Copy-Item "$kit\github-posts\.gitignore" "$repo\.gitignore"
Copy-Item "$kit\docs"                  "$repo\docs" -Recurse
Copy-Item "$kit\winget"                "$repo\winget" -Recurse   # optional but recommended
```

- [x] `README.md`, `LICENSE`, `CHANGELOG.md`, `.gitignore`, `docs/` in place
- [x] Screenshot paths resolve: `docs/img/dashboard-full.png` exists and the
      README's image link renders

## 2. Verify the project still works

Run from the repo root:

```powershell
npm install
npm start          # → http://127.0.0.1:3847
```

- [x] Dashboard loads, **Scan network** finds devices
- [ ] Stop it (Ctrl+C), then:

```powershell
npm run build      # → dist\WiFiScanner.exe (~90 MB)
```

- [x] `dist\WiFiScanner.exe` exists (kill any running WiFiScanner first:
      `Get-Process WiFiScanner | Stop-Process -Force`)
- [x] Double-click test: browser opens, scan works, second double-click
      doesn't start a duplicate

## 3. Create the GitHub repository

- [x] New repo, name suggestion: **`wifi-scanner`** → https://github.com/ahsanbhutta/wifi-scanner
- [x] Description: paste from `github-posts/REPO-META.md` (≤350 chars)
- [x] Topics: paste from the same file
- [x] Add MIT license (or let the pushed `LICENSE` be detected)
- [x] Push:

```powershell
cd $repo
git init
git add .
git commit -m "WiFi Scanner v1.0.0 — LAN device scanner with vendor/model ID"
git branch -M main
git remote add origin https://github.com/<OWNER>/wifi-scanner.git
git push -u origin main
```

- [x] Repo page renders: README, screenshot, license, topics

## 4. Attach the executable as a Release

> **CI shortcut:** if you pushed a `v1.0.0` tag instead of committing to
> `main`, the GitHub Actions workflow already built the exe **and created
> the release** with `.github/release-body.md` as the body — just open the
> release, review, and edit (e.g. paste the VirusTotal link). The manual
> steps below are the fallback.

- [ ] GitHub → **Releases → Draft a new release**
- [ ] Tag: `v1.0.0`, title: `WiFi Scanner v1.0.0`
- [ ] Body: paste `github-posts/RELEASE-NOTES-v1.0.0.md`
- [ ] Attach `dist\WiFiScanner.exe` (drag & drop; ~90 MB — well under the
      2 GB asset limit)
- [ ] Publish

**Alternative:** check `dist/` is gitignored, then commit the exe via
[Git LFS](https://git-lfs.com) if you prefer it in-repo. Plain GitHub
 Releases are simpler for a 90 MB binary.

- [ ] Test download: open the release URL in a private window, download,
      run it. Expect the SmartScreen prompt (More info → Run anyway) — this
      is the real user experience; confirm the docs mention it.

## 4b. Optional — code signing (removes SmartScreen/AV friction)

Full guide: [`docs/CODE-SIGNING.md`](docs/CODE-SIGNING.md).

- [ ] **Free path (public repo):** apply for a [SignPath.io OSS](https://signpath.io)
      certificate and hook it into CI
- [ ] **Paid path:** buy an OV/EV cert, then add repo secrets
      `CODESIGN_PFX_B64` + `CODESIGN_PFX_PASSWORD` — CI signs every build
      automatically (the step is already in `.github/workflows/build.yml`)
- [ ] Signed? Update the SmartScreen wording in the release notes and
      note it in the announcement

## 5. Sanity pass on the live repo

- [ ] README screenshot renders on the repo home page
- [ ] All README doc links resolve (`docs/…`)
- [ ] Release download works from the button in the README's Quick start
      (`../../releases/latest` link)
- [ ] `git clone` into a temp folder + `npm install && npm start` works

## 6. Optional — publish to winget

After the release is live (the manifest hashes the release asset):
[`winget/README.md`](winget/README.md) has the exact commands.

- [ ] Replace `<SHA256-OF-RELEASE-EXE>` in `winget/manifests/*.yaml` (the
      publisher/owner placeholders are already filled for this repo)
- [ ] `winget validate --manifest .\winget\manifests`
- [ ] Submit via `wingetcreate submit …` (or a PR to microsoft/winget-pkgs)
- [ ] Once approved: `winget install <PUBLISHER>.WiFiScanner` works

## 7. Announce

Pick a variant from `github-posts/ANNOUNCEMENT-POSTS.md`:

- [ ] Reddit (`r/selfhosted`, `r/homelab`, `r/windows`)
- [ ] Hacker News (Show HN)
- [ ] X / Mastodon / Discord

---

## Release-day support notes

Common first-day issues and their answers live in
`docs/TROUBLESHOOTING.md` and `docs/FAQ.md` — link those instead of
re-explaining SmartScreen every time.

If a user reports an AV flag: ask for the detection name + VirusTotal
link, note that the source is public and reproducible with
`npm run build` (see `docs/BUILD-FROM-SOURCE.md`).
