# Windows vs. Kali (`airmon-ng`) — honest comparison

People ask for "airmon-ng for Windows". This tool is **not** that, and it's
worth being precise about why.

## The core difference

| | Kali + `airmon-ng`/`airodump-ng` | WiFi Scanner (this tool) |
|---|---|---|
| **Mechanism** | Puts the adapter in **monitor mode**, captures raw 802.11 frames | Acts from the normal **managed** interface: ping, ARP, mDNS/SSDP/NetBIOS, TCP probes |
| **What you see** | *Every* frame in radio range on the channel: clients of **all** networks, probe requests, management frames, beacons with SSIDs | Only devices **on your LAN** that answer or announce themselves |
| **Client-isolated AP** (hotel/enterprise) | Sees all clients | Only the gateway responds |
| **Silent devices** | Visible via beacons/probes even when idle | May need a second scan (first sweep wakes them) |
| **SSID / signal strength** | SSID, RSSI per client, channel, encryption | Not available |
| **Deauth/association analysis** | Yes | No (and no attack features at all) |
| **OS** | Linux (or special adapters on Windows) | Windows 10/11, no admin rights |
| **Setup** | Live USB/VM, driver compat roulette, often an external adapter | Double-click one file |
| **Output richness** | Frame-level data you post-process | **Identification**: vendor, hostname, exact model (UPnP), device type + confidence + evidence |

## Why monitor mode basically isn't a thing on Windows

1. **Driver support.** Monitor mode requires driver/firmware support for
   promiscuous raw-frame capture. Most built-in Windows WiFi drivers don't
   expose it, and the ones that do are undocumented and unstable.
2. **Npcap + compatibility.** Wireshark's Npcap can capture on Windows, but
   that's *capturing what the driver delivers*, not true monitor mode with
   channel hopping. You generally still can't inject frames.
3. **Practical route.** People who need monitor mode on Windows buy a
   supported USB adapter and run Linux (live USB, WSL2 is not sufficient
   for real 802.11 monitor mode, VMs need USB passthrough).

So instead of pretending, this scanner does what Windows *can* do well:
probe the LAN and **identify** what answers.

## What you lose (real limitations)

- **You only see participants.** A device is discovered because it
  answers ping/ARP, announces itself (mDNS/SSDP/NetBIOS), or has open TCP
  ports. A purely silent device with all services closed can be missed.
- **Client isolation = empty scan.** On APs that block client-to-client
  traffic (hotels, enterprises, some guest networks), only the gateway
  responds. Monitor mode would still see those clients.
- **No radio-level data.** No SSID sniffing, no RSSI/signal bars per
  client, no channel usage, no evil-twin/deauth detection, no
  probe-request forensics.
- **MAC randomization.** Phones/laptops use random MACs per network, so
  the OUI often can't identify the manufacturer — labeled
  *Randomized (private MAC)* and identified by hostname/services instead.
  (Monitor mode doesn't fix randomization either — only the router's
  association logs show the identity reliably.)
- **Channel scope.** One scan = the channel(s) your adapter is on. No
  hopping across 2.4/5/6 GHz bands looking for hidden networks.

## What you gain

- Runs on your **everyday Windows machine** — no live USB, no driver
  hunting, no VM.
- **No admin rights**, no installation, nothing persistent.
- **Rich identification instead of raw frames**: exact model names via
  UPnP device descriptions, human names via mDNS/NetBIOS, device type with
  evidence and a confidence level, open-port fingerprints.
- **History and alerts** — SQLite-backed first-seen/last-seen, notes, and
  a new-device banner, which raw packet capture doesn't give you without
  extra tooling (Zeek, etc.).
- **Safe by construction**: it only reads (connect attempts, discovery
  queries) — no injection, no deauth, no payloads.

## Which should you use?

| Goal | Use |
|---|---|
| Inventory your home/homelab network, spot new devices, identify models | **This tool** |
| Troubleshoot "what's on my LAN" from a normal Windows laptop | **This tool** |
| See *all* radio-visible clients, audit WiFi security, capture frames | Kali + monitor-mode adapter + `airodump-ng`/Wireshark |
| Detect rogue APs / deauth attacks | Kali + monitor mode (this tool can't) |
| Locate a device by signal strength | Kali + monitor mode (no RSSI here) |

**Bottom line:** this is a *LAN identification and inventory tool* for
Windows, not a packet sniffer. It's honest about that trade: less raw data,
zero setup.
