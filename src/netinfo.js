// Discover the local IPv4 subnet + default gateway via PowerShell.
import { runPowerShell } from './util.js';

const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
# Exclude virtual/hypervisor/tunnel adapters: they often hold a default route
# (Hyper-V, WSL, VMware, VirtualBox, Tailscale, ZeroTier, bluetooth, ...).
$virtual = 'vEthernet|WSL|Hyper-V|VMware|VirtualBox|vbox|Tailscale|ZeroTier|Loopback|Bluetooth|Teredo|isatap|VPN|WireGuard|OpenVPN|Docker|container'
function Get-Entry($if) {
  $a = $if.IPv4Address | Select-Object -First 1
  if (-not $a) { return $null }
  $gw = ($if.IPv4DefaultGateway.NextHop | Select-Object -First 1)
  [pscustomobject]@{
    ip = $a.IPAddress; prefix = [int]$a.PrefixLength; gw = $gw
    alias = $if.InterfaceAlias; desc = $if.NetAdapter.InterfaceDescription
  }
}
$all = @(Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4Address } | ForEach-Object { Get-Entry $_ })
$physical = @($all | Where-Object { $_.alias -notmatch $virtual -and $_.desc -notmatch $virtual })
$pick = $null
# 1) The interface that owns the default route (lowest metric) wins.
$def = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' |
  Sort-Object RouteMetric | Select-Object -First 1
if ($def) {
  $pick = $physical | Where-Object { $_.alias -eq $def.InterfaceAlias } | Select-Object -First 1
  if ($pick -and -not $pick.gw) { $pick.gw = $def.NextHop }
}
# 2) Otherwise a non-virtual adapter that has its own gateway in-subnet.
if (-not $pick) {
  $pick = $physical | Where-Object { $_.gw } | Select-Object -First 1
}
# 3) Otherwise any non-virtual adapter; borrow the default-route gateway.
if (-not $pick) { $pick = $physical | Select-Object -First 1 }
if ($pick -and -not $pick.gw -and $def) { $pick.gw = $def.NextHop }
if ($pick) { ConvertTo-Json -InputObject $pick -Compress }
`;

/** Returns {ip, prefix, gateway, alias} or null. */
export async function getNetworkInfo() {
  const res = await runPowerShell(PS_SCRIPT);
  if (!res.ok) {
    console.error(
      `netinfo: powershell failed (timedOut=${res.timedOut}) err=${res.err || '(none)'}`,
    );
    return null;
  }
  const out = res.out;
  if (!out) {
    console.error('netinfo: empty output (no Up adapter with IPv4?)');
    return null;
  }
  try {
    const info = JSON.parse(out);
    if (!info.ip || typeof info.prefix !== 'number') {
      console.error(`netinfo: bad shape ${out.slice(0, 200)}`);
      return null;
    }
    return {
      ip: info.ip,
      prefix: info.prefix,
      gateway: info.gw || null,
      alias: info.alias || '',
    };
  } catch (e) {
    console.error(`netinfo: JSON parse failed: ${e.message}; out=${out.slice(0, 200)}`);
    return null;
  }
}

/** List of host IPs in the subnet (excluding network/broadcast), capped at `max`. */
export function subnetHosts(ip, prefix, max = 1024) {
  const ipInt = ip.split('.').reduce((a, o) => (a << 8) + (Number(o) & 255), 0) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const base = (ipInt & mask) >>> 0;
  const size = 2 ** (32 - prefix);
  const hosts = [];
  const start = prefix >= 31 ? 0 : 1;
  const end = prefix >= 31 ? size : size - 1;
  for (let i = start; i < end && hosts.length < max; i++) {
    const n = (base + i) >>> 0;
    if (n === ipInt) continue; // skip self
    hosts.push([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }
  return hosts;
}
