# Code signing (optional, but it removes most warnings)

The exe is currently **unsigned**, which is why Windows shows *"Windows
protected your PC"* (SmartScreen) on download and some AV products treat it
with suspicion. Signing proves the file comes from you and hasn't been
tampered with. This doc covers what it costs, what it actually fixes, and
how to wire it in.

## What signing does and doesn't fix

| Symptom | Fixed by signing? |
|---|---|
| SmartScreen *"Windows protected your PC"* on download | **Yes** — with an OV/EV certificate (EV: immediately; OV: after Microsoft gathers some download reputation, usually days–weeks) |
| "Unknown publisher" in file Properties | **Yes** |
| Heuristic AV flags ("network tool", "scanner") | **Partly** — signed files get scrutinized less, but a genuine behavior-based flag can still happen; the [VirusTotal + Microsoft submission](TROUBLESHOOTING.md) path remains |
| VirusTotal engine detections | **No change needed** — VT accepts unsigned files; signature just adds evidence |

Signing never expires from the user's perspective: timestamps keep the
signature valid after the certificate itself expires (that's why the
commands below always timestamp).

## Options

| Option | Cost | Best for |
|---|---|---|
| **[SignPath.io](https://signpath.io)** OSS program | **Free** for public open-source repos | This project, if it stays public — integrates with GitHub Actions, no cert to manage |
| **OV code-signing cert** (Certum, SSL.com, DigiCert…) | ~$70–250/year | Private projects or when you want full control; usually delivered as PFX or cloud signing |
| **EV code-signing cert** | ~$300–500/year + org validation | Instant SmartScreen reputation; overkill for a free tool |
| **Self-signed** | Free | Only for your own machine — gives end users *more* warnings, never distribute this way |

Cloud/HSM-backed certs (many modern OV/EV products) **cannot** export a
PFX; those work through the vendor's own CI integration or SignPath, not
the PFX flow below.

## Signing in CI (already wired up)

`.github/workflows/build.yml` signs the exe automatically **if** two
repository secrets are set — otherwise the step is skipped and the build
stays unsigned:

| Secret | Value |
|---|---|
| `CODESIGN_PFX_B64` | Your certificate as a base64-encoded PFX: `[Convert]::ToBase64String([IO.File]::ReadAllBytes('cert.pfx'))` |
| `CODESIGN_PFX_PASSWORD` | The PFX password |

GitHub → repo **Settings → Secrets and variables → Actions → New
repository secret** for each. On the next tag push the release exe comes
out signed (the step runs `signtool sign … /tr` + `signtool verify` and
fails the build if signing fails).

## Signing a local build

Windows SDK's `signtool` (comes with Visual Studio; on GitHub's
`windows-latest` runner it's under `C:\Program Files (x86)\Windows
Kits\10\bin\*\x64\`):

```powershell
# after npm run build
signtool sign /f cert.pfx /p <password> `
  /tr http://timestamp.digicert.com /td sha256 /fd sha256 `
  dist\WiFiScanner.exe

signtool verify /pa dist\WiFiScanner.exe    # must report "Successfully verified"
```

- `/tr` = RFC 3161 timestamp — required so the signature survives
  certificate expiry.
- Sign **after** `npm run build` (the build rewrites the exe with the SEA
  blob + icon; signing earlier invalidates it).

## After you have a signed build

1. Update the AV section in `github-posts/RELEASE-NOTES-v1.0.0.md` — the
   SmartScreen wording can be softened ("signed by …").
2. Optionally re-check the exe on [VirusTotal](https://www.virustotal.com)
   and paste the new permalink.
3. The `docs/TROUBLESHOOTING.md` SmartScreen section stays useful for
   older/unsigned historical builds.
