import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";

const COMPOSE = "docker compose --profile tunnel";
const MAX_ATTEMPTS = 30;
const DELAY_MS = 2000;

function getTunnelLogs() {
  try {
    return execSync(`${COMPOSE} logs tunnel --no-log-prefix`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

function findTunnelUrl(logs) {
  const match = logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return match?.[0] ?? null;
}

export async function waitForTunnelUrl() {
  console.log("");
  console.log("Cakam na Cloudflare Tunnel URL...");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const url = findTunnelUrl(getTunnelLogs());
    if (url) return url;
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  return null;
}

function printTunnelInfo(url) {
  console.log("");
  console.log("Koordinacna PWA - HTTPS pre iPhone (GPS, push, OAuth):");
  console.log("");
  console.log(`  ${url}`);
  console.log("");
  qrcode.generate(url, { small: true });
  console.log("");
  console.log("Google OAuth – pridaj do Google Cloud Console redirect URI:");
  console.log(`  ${url}/api/auth/callback/google`);
  console.log("");
  console.log("Poznamka: URL sa pri kazdom restarte tunela moze zmenit (quick tunnel).");
  console.log("Log tunela: docker compose --profile tunnel logs tunnel -f");
  console.log("");
}

async function main() {
  const url = await waitForTunnelUrl();
  if (!url) {
    console.error("");
    console.error("Tunnel URL sa nepodarilo najst do 60 s.");
    console.error("Skontroluj: docker compose --profile tunnel logs tunnel");
    process.exit(1);
  }
  printTunnelInfo(url);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
