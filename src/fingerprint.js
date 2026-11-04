// Fingerprinting: combine vendor + hostname + mDNS TXT + SSDP + open ports
// into a device type / model guess with an explicit confidence level.

/** Hostname pattern rules (checked in order; first match wins for "type"). */
const HOST_RULES = [
  [/^(desktop-|laptop-|win-|msi-|rog-|omen-)/i, 'Windows PC', 'high'],
  [/^(iphone|ipad|ipod|apple)-/i, 'Apple iOS device', 'high'],
  [/^android-/i, 'Android device', 'medium'],
  [/^(galaxy|sm-|gt-)/i, 'Samsung device', 'medium'],
  [/^(chromecast|google)/i, 'Google/Chromecast device', 'medium'],
  [/^(raspberrypi|raspberrypi-)/i, 'Raspberry Pi', 'high'],
  [/^(esp|espressif|wemos|nodemcu|sonoff|tasmota|shelly|tuya)/i, 'IoT device (ESP/Tuya)', 'high'],
  [/^(brother|hp-|canon|epson|xerox|lexmark|ricoh)/i, 'Printer', 'high'],
  [/^(smart|roku|firetv|bravia|xbox|playstation|ps-|nintendo|switch)/i, 'TV/console', 'medium'],
  [/^(nas|synology|diskstation|qnap|truenas)/i, 'NAS', 'high'],
  [/-printer$|printer/i, 'Printer', 'medium'],
];

/** mDNS service type -> device type. */
const SERVICE_RULES = [
  ['_googlecast', 'Chromecast / Google TV', 'high'],
  ['_airplay', 'Apple AirPlay device', 'high'],
  ['_raop', 'AirPlay audio receiver', 'high'],
  ['_companion-link', 'Apple device', 'high'],
  ['_hap', 'HomeKit accessory', 'high'],
  ['_adb', 'Android device', 'high'],
  ['_mediarouter', 'Google Home / speaker', 'high'],
  ['_ipp', 'Printer', 'high'],
  ['_ipps', 'Printer', 'high'],
  ['_pdl-datastream', 'Printer', 'high'],
  ['_printer', 'Printer', 'high'],
  ['_smb', 'Windows/Samba file share', 'medium'],
  ['_workstation', 'Computer', 'medium'],
  ['_amzn-wplay', 'Amazon device (Fire/echo)', 'high'],
  ['_sonos', 'Sonos speaker', 'high'],
  ['_spotify-connect', 'Spotify Connect speaker', 'medium'],
  ['_nvstream', 'NVIDIA Shield', 'high'],
  ['_rtsp', 'Camera / streamer', 'medium'],
  ['_rfb', 'VNC host (computer)', 'medium'],
  ['_ssh', 'Computer (SSH)', 'medium'],
  ['_axis-video', 'Axis camera', 'high'],
  ['_mi-connect', 'Xiaomi device', 'high'],
  ['_matter', 'Matter IoT accessory', 'medium'],
  ['_dlna-device-info', 'Media device', 'medium'],
];

/** Port hint -> device type (from ports.js PORT_HINTS). */
const PORT_TYPE = {
  printer: ['Printer', 'high'],
  chromecast: ['Chromecast / Google TV', 'high'],
  'iphone-lockdown': ['Apple iOS device', 'high'],
  plex: ['Plex media server', 'high'],
  windows: ['Windows PC', 'medium'],
  'rtsp-streamer': ['Camera / IP camera', 'medium'],
  'apple-file': ['Apple device', 'medium'],
  'sip-phone': ['VoIP phone', 'medium'],
};

const VENDOR_TYPE = [
  [/apple/i, 'Apple device'],
  [/samsung/i, 'Samsung device'],
  [/google|nest/i, 'Google device'],
  [/amazon/i, 'Amazon device'],
  [/raspberry/i, 'Raspberry Pi'],
  [/espressif|tuya/i, 'IoT device'],
  [/tp-link|asus|netgear|d-link|ubiquiti|mikrotik|huawei|xiaomi|miwifi/i, 'Network device'],
  [/sony|lg electronics|vizio|tcl|hisense|roku/i, 'TV / media device'],
  [/sonos/i, 'Speaker'],
  [/nintendo|sony interactive|microsoft/i, 'Game console'],
  [/intel|realtek|amd/i, 'Computer component'],
];

const score = { high: 3, medium: 2, low: 1 };

/**
 * @param {object} dev  merged device: {mac, ip, vendor, randomized, hostname,
 *   netbios, mdns:{hostnames,services,txts}, ssdp:{desc,server}, open:[], http}
 * @returns {{type, model, confidence, reasons[]}}
 */
export function fingerprint(dev) {
  const reasons = [];
  const candidates = [];

  const add = (type, conf, reason) => {
    if (!type) return;
    candidates.push({ type, conf, reason });
    reasons.push(reason);
  };

  // 1. mDNS services (strongest for consumer gadgets).
  for (const svc of dev.mdns?.services ?? []) {
    const hit = SERVICE_RULES.find(([p]) => svc.startsWith(p));
    if (hit) add(hit[1], hit[2], `mDNS service ${svc}`);
  }

  // 2. Hostname patterns (mDNS hostnames + NetBIOS).
  const names = [
    ...(dev.mdns?.hostnames ?? []),
    dev.netbios?.name,
    dev.hostname,
  ].filter(Boolean);
  for (const n of names) {
    const hit = HOST_RULES.find(([re]) => re.test(n));
    if (hit) add(hit[1], hit[2], `hostname "${n}"`);
  }

  // 3. Open ports.
  for (const p of dev.open ?? []) {
    const t = PORT_TYPE[dev.portHints?.[p] ?? ''];
    if (t) add(t[0], t[1], `port ${p} open`);
  }

  // 4. SSDP description: exact model beats everything.
  let model = null;
  const d = dev.ssdp?.desc;
  if (d?.modelName) {
    model = [d.manufacturer, d.modelName, d.modelNumber].filter(Boolean).join(' ');
    add(`${d.manufacturer || 'Unknown'} ${d.modelName}`.trim(), 'high', 'UPnP device description');
  }

  // 5. mDNS TXT model hints (Apple/Chromecast expose model in TXT).
  if (!model) {
    for (const { type, txt } of dev.mdns?.txts ?? []) {
      const m = txt.model || txt.md || txt.modelname || txt.device_model || txt.am || txt.firmware;
      if (m && typeof m === 'string' && m.length < 60) {
        model = txt.model || txt.md ? `${m}` : model;
        if (!model) model = m;
        add(`TXT model: ${m}`, 'medium', `mDNS TXT (${type}) model`);
        break;
      }
    }
  }

  // 6. HTTP title/server hints (routers, cameras, printers expose these).
  if (dev.http?.title) {
    add(`HTTP title: ${dev.http.title}`, 'medium', `HTTP ${dev.http.port} title`);
    if (!model && dev.http.title.length <= 60) model = dev.http.title;
  }
  if (dev.http?.server) reasons.push(`HTTP Server: ${dev.http.server}`);

  // 7. Vendor-based weak fallback.
  if (dev.vendor && !dev.randomized) {
    const hit = VENDOR_TYPE.find(([re]) => re.test(dev.vendor));
    if (hit) add(hit[1], 'low', `vendor OUI: ${dev.vendor}`);
  }

  // Pick best candidate.
  candidates.sort((a, b) => score[b.conf] - score[a.conf]);
  const best = candidates[0] ?? null;

  const confidence = best ? best.conf : 'none';
  return {
    type: best?.type ?? (dev.randomized ? 'Unknown (randomized MAC)' : 'Unknown'),
    model: model || null,
    confidence,
    reasons: [...new Set(reasons)],
  };
}
