// Native Windows notifications for new devices (toast, balloon fallback).
// Fire-and-forget: never throws, never blocks a scan. Best-effort only —
// if PowerShell or notifications are unavailable the scan continues silently.
// Disable with WIFI_SCANNER_NO_TOAST=1.
import { spawn } from 'node:child_process';

// Tries a real WinRT toast (registered under PowerShell's AUMID so no
// Start-Menu app is needed), then falls back to a tray balloon tip.
// Title/message travel via env vars — no shell interpolation of device
// names — and are XML-escaped inside PowerShell before use.
const PS_SCRIPT = `
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  $t = [Security.SecurityElement]::Escape($env:WS_TITLE)
  $m = [Security.SecurityElement]::Escape($env:WS_MSG)
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$t</text><text>$m</text></binding></visual></toast>")
  $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
  $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information
    $n.Visible = $true
    $n.ShowBalloonTip(8000, $env:WS_TITLE, $env:WS_MSG, 'Info')
    Start-Sleep -Seconds 9
    $n.Dispose()
  } catch { exit 1 }
}
`;

/** Show a desktop notification. Returns immediately; failures are ignored. */
export function notify(title, message) {
  if (process.env.WIFI_SCANNER_NO_TOAST === '1') return;
  try {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
      {
        env: { ...process.env, WS_TITLE: String(title), WS_MSG: String(message) },
        detached: true,
        stdio: 'ignore',
      },
    );
    child.on('error', () => { /* no PowerShell — notifications are optional */ });
    child.unref();
  } catch { /* best-effort */ }
}
