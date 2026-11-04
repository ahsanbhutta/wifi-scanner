# winget manifest — publish `WiFi Scanner` to Windows Package Manager

These three files are a ready-to-submit
[winget-pkgs](https://github.com/microsoft/winget-pkgs) manifest (schema
1.6, `portable` installer type — no installer, just the exe + an alias).

After submission, users get: `winget install WiFiScanner` (once approved).

## Before submitting — fill in the placeholders

| Placeholder | Where | Value |
|---|---|---|
| `<PUBLISHER>` | all 3 files (`PackageIdentifier`, `Publisher`, `PublisherUrl`) | Your GitHub handle or org — **must match how you want to be listed**, e.g. `johndoe.WiFiScanner` |
| `<OWNER>` | installer + locale files (URLs) | GitHub org/user that owns the repo |
| `<SHA256-OF-RELEASE-EXE>` | installer file | Hash of the **release asset** (see below) |

**The SHA-256 must come from the exe attached to the GitHub Release** (the
CI-built one), not a local build — builds are not byte-identical:

```powershell
Invoke-WebRequest https://github.com/<OWNER>/wifi-scanner/releases/download/v1.0.0/WiFiScanner.exe -OutFile WiFiScanner.exe
(Get-FileHash .\WiFiScanner.exe -Algorithm SHA256).Hash
```

Validate locally (winget CLI from https://github.com/microsoft/winget-cli):

```powershell
winget validate --manifest .\winget\manifests
```

## Submit

**Easiest — wingetcreate** (opens the PR for you):

```powershell
wingetcreate.exe submit `
  --token <your-github-pat-with-repo-scope> `
  .\winget\manifests\WiFiScanner.WiFiScanner.yaml `
  .\winget\manifests\WiFiScanner.WiFiScanner.installer.yaml `
  .\winget\manifests\WiFiScanner.WiFiScanner.locale.en-US.yaml
```

**Manual** — fork [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs),
copy the three files (keeping their `<Publisher>.WiFiScanner.*.yaml` names)
into `manifests/<first-letter>/<Publisher>/<PackageId>/<version>/` (path
convention is checked by their CI), open a PR. Review usually takes 1–5
days; fix any CI feedback on the PR.

## After approval

- `winget install <PUBLISHER>.WiFiScanner` works; run it with `WiFiScanner`.
- Bump `PackageVersion` + `InstallerUrl` (+ new SHA-256) for every future
  release — same three files, new folder in winget-pkgs.
- Optional: add an upgrade note to `PUBLISH-CHECKLIST.md` so each release
  includes the winget bump.
