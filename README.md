# Koordinacna PWA

Implementacia podla `PRD-Koordinacna-PWA.md`.

## Spustenie aplikacie

### Vsetko naraz (Docker + HTTPS tunel pre iPhone)

Odporucane na testovanie GPS, push notifikacii a Google OAuth na telefone:

```powershell
# 1. Priprava (len prvy krat)
copy .env.example .env
# dopln do .env: VITE_GOOGLE_MAPS_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET

# 2. Spusti cely stack + Cloudflare tunel
npm run docker:up:tunnel
```

Tym sa spustia vsetky sluzby: **Postgres, Redis, API, Web, Caddy** a kontajner **tunnel** (`cloudflare/cloudflared`).

Po ~30 s v konzole uvidis:
- **HTTPS URL** (napr. `https://xxxx.trycloudflare.com`) + **QR kod** pre iPhone
- redirect URI pre Google OAuth (skopiruj do Google Cloud Console)

Na PC mozes sucastne pouzivat **http://localhost:8080**.

**Znova vypisat HTTPS URL** (ak si zatvoril terminal):
```powershell
npm run tunnel:url
```

**Log tunela:**
```powershell
docker compose --profile tunnel logs tunnel -f
```

**Zastavenie vsetkeho (vrátane tunela):**
```powershell
npm run docker:down
```

> **Bezpecnost:** HTTPS URL je verejne dostupna na internete. Nikomu ju neposielaj. Po teste tunel zastav (`docker:down`). Detail nizsie v sekcii o tuneli.

### Len lokalna siet (bez tunela)

Ak staci LAN / localhost (GPS na iPhone cez `http://192.168.x.x` **nefunguje**):

```powershell
npm run docker:up
```

Vypise LAN adresu + QR kod pre Wi-Fi pripojenie (LAN prihlasenie).

### Prvy prihlasenie

1. Na PC otvor `http://localhost:8080` a prihlas sa cez **Google**
2. Prvy pouzivatel dostane rolu `ADMIN`
3. Na iPhone otvor **HTTPS URL z tunela** a prihlas sa tiez cez Google (po doplneni redirect URI)

## Co obsahuje

- `web`: React + Vite PWA client s live mapou (Google Maps), pingami, skupinami a meeting pointami.
- `api`: Express + Prisma API (auth, role, skupiny, lokacie, ping, incident, admin toggles).
- `caddy`: reverse proxy – jeden vstupny bod pre frontend aj API.
- `docker-compose.yml`: Postgres, Redis, API, Web, Caddy (+ volitelny Cloudflare tunel)

## Routovanie (Caddy)

Vsetko ide cez **http://localhost:8080** (na PC) alebo **http://<LAN-IP>:8080** (na telefone):

| Cesta | Sluzba | Priklad |
|-------|--------|---------|
| `/` | PWA frontend | `http://localhost:8080/` |
| `/api/*` | REST API | `http://localhost:8080/api/health` |
| `/socket.io/*` | WebSocket (realtime) | Socket.IO cez rovnaky host |

Frontend aj API pouzivaju **relativne cesty** (`/api`) – netreba menit konfiguraciu pri pripojeni z telefonu.

## Prihlasenie

### PC (vyvoj)
- **Google OAuth** cez `http://localhost:8080` – redirect URI sa dopočíta automaticky.
- V Google Cloud Console staci jeden redirect URI: `http://localhost:8080/api/auth/callback/google`

### Telefon (ta ista Wi-Fi)
- Google **nepovoluje** IP adresy typu `192.168.x.x` v OAuth – to je obmedzenie Google, nie appky.
- Appka ponuka **LAN prihlasenie**: vyberies svoje meno zo zoznamu.
- **Postup:** najprv sa raz prihlas cez Google na PC → potom na telefone otvor LAN adresu a vyber meno.

## Test na telefone

1. Spusti stack:
   ```bash
   npm run docker:up
   ```
   (vypise aj LAN adresu pre telefon)

2. Telefon na **rovnakej Wi-Fi** otvori napr. `http://192.168.68.59:8080`

3. Vyber svoje meno v sekcii „Prihlasenie v lokalnej sieti“

4. Ak sa stranka nenacita, povol port **8080** vo Windows Firewall

> **GPS na telefone:** prehliadac vyzaduje HTTPS (alebo localhost). Cez `http://192.168.x.x` je poloha na iOS blokovana. Riesenie: HTTPS tunel (nizsie).

## HTTPS tunel (Cloudflare) – podrobnosti

Sluzba `tunnel` je v `docker-compose.yml` s Docker **profilom** `tunnel` – nespusti sa pri obycajnom `docker compose up`.

| Priklad | Popis |
|---------|--------|
| `npm run docker:up:tunnel` | build + start vsetkeho + vypis HTTPS URL a QR |
| `npm run tunnel:url` | znova vypise HTTPS URL a QR z logov |
| `docker compose --profile tunnel up -d --build` | to iste bez npm skriptu |
| `docker compose --profile tunnel logs tunnel -f` | sledovanie tunela |

Po nabehnuti otvor na iPhone **HTTPS URL** (nie `192.168.x.x`).

- URL sa pri kazdom restarte tunela **moze zmenit** (quick tunnel bez Cloudflare uctu).
- Do **Google Cloud Console** pridaj redirect URI: `https://xxxx.trycloudflare.com/api/auth/callback/google`
- Ak Maps API klic ma obmedzenia domeny, pridaj `https://*.trycloudflare.com/*` alebo konkretnu URL.
- Tunel je **verejny** – ktokolvek s URL sa moze pokusit pripojit (LAN login z internetu nefunguje, Google OAuth ano).

## Quick start – Docker (bez tunela)

1. Skopiruj `.env.example` do `.env` v root a dopln klice.
2. Spusti:
   ```powershell
   npm run docker:up
   ```
   alebo `docker compose up -d --build` + `npm run mobile:url`
3. Otvor **http://localhost:8080** na PC

## Quick start – lokalny dev (bez Docker buildu app)

1. Infra:
   ```bash
   docker compose up -d db redis
   ```
2. Backend:
   - `api/.env` z `api/.env.example` (`API_PUBLIC_PREFIX=` prazdne pre priamy API na :4000, alebo `/api` s Caddy)
   - `npm run prisma:generate -w api`
   - `npm run prisma:migrate -w api -- --name init`
   - `npm run dev:api`
3. Frontend:
   - `web/.env` z `web/.env.example` (`VITE_API_BASE_URL=/api`)
   - dopln Google Maps key
   - `npm run dev:web`
4. Vite (`host: true`) routuje `/api` na `localhost:4000` – telefon pripojis na `http://<LAN-IP>:3000`

## Google Maps API (mapa + trasy k zrazu)

### 1. Zapni API v projekte

V [Google Cloud Console → API & Services → Library](https://console.cloud.google.com/apis/library):

- **Maps JavaScript API** – zobrazenie mapy
- **Directions API** – trasy po chodníkoch/uliciach

Projekt musí mať **zapnutú fakturáciu** (Billing).

### 2. Nastav API kľúč

[Credentials → tvoj API kľúč](https://console.cloud.google.com/apis/credentials):

**API restrictions** (odporúčané: *Restrict key*):
- Pridaj **Maps JavaScript API**
- Pridaj **Directions API**

**Application restrictions** pre kľúč v `.env` (`VITE_GOOGLE_MAPS_API_KEY`):
- Typ: **HTTP referrers (web sites)**
- Príklady: `http://localhost:8080/*`, `https://*.trycloudflare.com/*`

> Trasy sa volajú najprv zo servera (Docker API). Ak kľúč má len HTTP referrer obmedzenie, server zlyhá s `REQUEST_DENIED` – appka potom **automaticky skúsi Directions z prehliadača** (fallback). Ak zlyhá aj to, treba krok 1 + 2.

### 3. Voliteľný serverový kľúč (produkcia)

Pre server bez fallbacku pridaj do `.env` samostatný kľúč bez referrer obmedzenia (alebo s IP servera):

```env
GOOGLE_MAPS_SERVER_API_KEY=...
```

Ak chýba, Docker použije `VITE_GOOGLE_MAPS_API_KEY`.

### Riešenie `REQUEST_DENIED`

1. Skontroluj, či je **Directions API enabled** v Library (nie len Maps JavaScript)
2. V kľúči → **API restrictions** → pridaj **Directions API**
3. Rebuild: `docker compose up -d --build`
4. Skús trasu znova – v logu hľadaj `route:fallback_client` (prehliadač) alebo `route:success`

## Poznamka

Prvy pouzivatel, ktory sa prihlasi cez Google, dostane rolu `ADMIN`.
Pre produkciu nastav `ALLOW_LAN_LOGIN=false`.
