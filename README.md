# Notflix (Netflix Clone)

A personal Netflix-style streaming app with **Plex** library integration, **Real-Debrid**, **Chromecast**, **AirPlay 2**, and a responsive UI.

**Framework:** [Next.js 16](https://nextjs.org/) (App Router, React 19, TypeScript)

---

## Local development (Cursor)

```bash
npm install
cp .env.example .env.local
# Edit .env.local — set PLEX_URL, PLEX_TOKEN, optional API keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Dev uses `.env.local` (Next.js loads it automatically).
- Settings can also be configured in the app UI (stored in browser localStorage).
- Server-side env vars (`PLEX_URL`, `PLEX_TOKEN`, `LIBRARY_PATH`) are fallbacks for API routes.

---

## GitHub workflow

```bash
git add .
git commit -m "Your message"
git push origin main
```

Never commit `.env` or `.env.local`. Only `.env.example` is tracked.

---

## unRAID deployment (Podman)

### 1. Clone on unRAID

```bash
mkdir -p /mnt/user/appdata/notflix
cd /mnt/user/appdata/notflix
git clone <your-repo-url> .
```

### 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Required in `.env`:

```env
PLEX_URL=http://10.10.0.8:32800
PLEX_TOKEN=your_plex_token_here
LIBRARY_PATH=/media
DATA_PATH=/app/data
NEXT_PUBLIC_APP_URL=http://10.10.0.8:3233
REAL_DEBRID_TOKEN=your_token_if_using_debrid
TMDB_API_KEY=your_key_if_using_tmdb
```

Get your Plex token: [Plex support docs](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/) or Plex Web → any item → Get Info → View XML (token is in the URL).

### 3. Build and run (Docker — no compose)

```bash
mkdir -p /mnt/user/appdata/notflix/data

docker build -t notflix .

docker rm -f notflix 2>/dev/null

docker run -d \
  --name notflix \
  --restart unless-stopped \
  -p 3233:3000 \
  --env-file /mnt/user/appdata/notflix/.env \
  -e NODE_ENV=production \
  -e HOSTNAME=0.0.0.0 \
  -e DATA_PATH=/app/data \
  -v /mnt/user/Media:/media:ro \
  -v /mnt/user/appdata/notflix/data:/app/data \
  notflix
```

Settings load from `.env` on start and persist to `/mnt/user/appdata/notflix/data/settings.json`.

**Optional:** `compose.yaml` is included if you prefer Compose Manager later.

### 4. Test

Open [http://10.10.0.8:3233](http://10.10.0.8:3233)

Container logs show startup config (token is never printed):

```bash
podman logs notflix
# [notflix]   PORT=3000
# [notflix]   PLEX_URL=http://10.10.0.8:32800
# [notflix]   LIBRARY_PATH=/media
# [notflix]   PLEX_TOKEN=[configured]
```

### 5. Restart after updates

```bash
cd /mnt/user/appdata/notflix
git pull
docker build -t notflix .
docker rm -f notflix
docker run -d \
  --name notflix \
  --restart unless-stopped \
  -p 3233:3000 \
  --env-file /mnt/user/appdata/notflix/.env \
  -e NODE_ENV=production \
  -e HOSTNAME=0.0.0.0 \
  -e DATA_PATH=/app/data \
  -v /mnt/user/Media:/media:ro \
  -v /mnt/user/appdata/notflix/data:/app/data \
  notflix
```

**Env-only change** (no code update): `docker restart notflix`

---

## Traefik reverse proxy

Add Traefik labels to `compose.yaml` (see commented section) and attach the container to your Traefik network.

Example dynamic config for **notflix.jrtech.com**:

```yaml
# compose.yaml labels (uncomment and adjust)
labels:
  - traefik.enable=true
  - traefik.http.routers.notflix.rule=Host(`notflix.jrtech.com`)
  - traefik.http.routers.notflix.entrypoints=websecure
  - traefik.http.routers.notflix.tls=true
  - traefik.http.routers.notflix.tls.certresolver=letsencrypt
  - traefik.http.services.notflix.loadbalancer.server.port=3000
```

Update `.env`:

```env
NEXT_PUBLIC_APP_URL=https://notflix.jrtech.com
```

When Traefik handles HTTPS, you can remove the host port mapping or keep `3233:3000` for LAN testing.

---

## Container layout

| Setting | Value |
|---------|-------|
| Internal port | `3000` |
| Host port | `3233` |
| Media mount | `/mnt/user/Media` → `/media:ro` |
| Settings/data | `/mnt/user/appdata/notflix/data` → `/app/data` |
| `DATA_PATH` | `/app/data` (persistent `settings.json`) |
| `LIBRARY_PATH` | `/media` |
| `PLEX_URL` | `http://10.10.0.8:32800` |
| `PLEX_TOKEN` | From `.env` only |

---

## Configuration reference

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default `3000`) |
| `HOSTNAME` | Bind address (default `0.0.0.0` in container) |
| `PLEX_URL` | Plex server URL |
| `PLEX_TOKEN` | Plex API token (secret) |
| `LIBRARY_PATH` | NFS/media path (`/media` in production) |
| `TMDB_API_KEY` | Optional browse metadata |
| `TVDB_API_KEY` | Optional TV metadata |
| `REAL_DEBRID_TOKEN` | Optional Debrid streams |
| `NEXT_PUBLIC_APP_URL` | Public app URL for links |

---

## Features

- **Plex** — Direct play from your library with genre browse rows
- **Real-Debrid** — Magnet links with ffmpeg audio transcode
- **NFS fallback** — Scan `LIBRARY_PATH` when Plex is not configured
- **Chromecast / AirPlay** — From the video player

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (localhost:3000) |
| `npm run build` | Production build (standalone output) |
| `npm start` | Production server on `0.0.0.0:$PORT` |

---

## Project structure

```
src/
├── app/           # Next.js App Router pages & API routes
├── components/    # UI, player, browse
├── lib/           # Plex, Debrid, env, settings
├── instrumentation.ts  # Startup logging
Dockerfile
compose.yaml
.env.example
```

Private / personal use.
