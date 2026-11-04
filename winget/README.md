# winget manifest — publish `WiFi Scanner` to Windows Package Manager

The three files in `manifests/` are a ready-to-submit
[winget-pkgs](https://github.com/microsoft/winget-pkgs) manifest (schema
1.6, `portable` installer type — no installer, the exe itself).

After submission, users get: `winget install ahsanbhutta.WiFiScanner`
(run it with `WiFiScanner`).

> The README must stay **outside** the `manifests/` folder — `winget
> validate` parses every file in that folder as YAML.

## Before submitting — fill in the hash

| Placeholder | Where | Value |
|---|---|---|
| `<SHA256-OF-RELEASE-EXE>` | `manifests/WiFiScanner.WiFiScanner.installer.yaml` | Hash of the **release asset** (see below) — fill after the release exists |

Publisher/owner are already filled in (`ahsanbhutta`) — edit all three
files if the repo ever moves to an org.

**The SHA-256 must come from the exe attached to the GitHub Release** (the
CI-built one), not a local build — builds are not byte-identical:

```powershell
Invoke-WebRequest https://github.com/ahsanbhutta/wifi-scanner/releases/download/v1.0.0/WiFiScanner.exe -OutFile WiFiScanner.exe
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
copy the three files (keeping their `ahsanbhutta.WiFiScanner.*.yaml` names)
into `manifests/<first-letter>/<Publisher>/<PackageId>/<version>/` (path
convention is checked by their CI), open a PR. Review usually takes 1–5
days; fix any CI feedback on the PR.

## After approval

- `winget install ahsanbhutta.WiFiScanner` works; run it with
  `WiFiScanner`.
- Bump `PackageVersion` + `InstallerUrl` (+ new SHA-256) for every future
  release — same three files, new folder in winget-pkgs.
- Optional: add an upgrade note to `PUBLISH-CHECKLIST.md` so each release
  includes the winget bump.
