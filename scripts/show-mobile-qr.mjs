import os from "node:os";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";

const PORT = process.env.MOBILE_PORT ?? "8080";

function isLanIpv4(address) {
  if (address.startsWith("127.")) return false;
  if (address.startsWith("169.254.")) return false;
  if (address.startsWith("10.")) return true;
  if (address.startsWith("192.168.")) return true;
  const m = /^172\.(\d+)\./.exec(address);
  if (m) {
    const second = Number(m[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

function getLanIps() {
  const ips = new Set();
  const skipIfName =
    /^(lo|lo\d*|docker|br-|veth|vethernet|wsl|hyper-v|virtualbox|vmware|npcap|tailscale|zerotier|hamachi)/i;

  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (skipIfName.test(name)) continue;
    for (const net of entries ?? []) {
      const family = net.family;
      const isV4 = family === "IPv4" || family === 4;
      if (!isV4 || net.internal) continue;
      if (isLanIpv4(net.address)) ips.add(net.address);
    }
  }

  const list = [...ips];
  const homeLan = list.filter((ip) => ip.startsWith("192.168.") || ip.startsWith("10."));
  return homeLan.length > 0 ? homeLan : list;
}

export function printMobileQr(port = PORT) {
  const ips = getLanIps();

  console.log("");
  console.log("Koordinacna PWA - pripojenie z telefonu (ta ista Wi-Fi):");
  if (ips.length === 0) {
    console.log("  Nepodarilo sa zistit LAN IP. Skus: ipconfig");
  } else {
    for (const ip of ips) {
      const url = `http://${ip}:${port}`;
      console.log(`\n  ${url}\n`);
      qrcode.generate(url, { small: true });
    }
  }
  console.log("");
  console.log("Na telefone pouzi LAN prihlasenie (vyber mena).");
  console.log("Google OAuth funguje len na PC cez http://localhost:8080");
  console.log("");
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  printMobileQr();
}
