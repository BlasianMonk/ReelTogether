# ReelTogether — Full-Stack Watch Party

A responsive **movie streaming and synchronized watch-party application** built with Node.js, Express, Socket.IO, and vanilla JavaScript. It supports **your own or licensed video files**. It does not include copyrighted films, third-party catalog scraping, DRM circumvention, or unauthorized redistribution.

## Features
- Browse a local movie library; HTTP byte-range streaming enables seeking without downloading the whole video.
- Host public or invite-only watch parties; share links to watch together.
- Real-time room chat, presence, and synchronized playback with host-controlled play/pause/seek.\n- Everyone can independently adjust their own video volume or mute; these audio settings never affect other viewers. Guests can use the native video volume control while playback remains host-authoritative.
- Host migration when the host disconnects; 100-message in-memory chat history per room.
- Responsive dark theater interface; optional admin-key-protected video uploads via API.
- Node unit tests, input validation, basic rate limiting, Helmet HTTP headers.
- Zero database required for the MVP; room state is in-memory and resets on restart.

## Requirements
Node.js 20+ and npm. Modern Chrome/Firefox/Edge/Safari browser. MP4 (H.264/AAC) is the most broadly compatible format.

## Start
```bash
cp .env.example .env
npm install
npm test
npm start
```
Windows PowerShell: `Copy-Item .env.example .env`.
Open **http://127.0.0.1:3000**.

1. Place a video you own or have permission to share in `media/` (e.g. `my-film.mp4`).
2. Click **Refresh**, select the film, enter a nickname and click **Create watch party**.
3. Click **Copy invite** and send the link to a friend. Both users must be able to reach the same server.
4. Host controls playback; other viewers stay synchronized and can chat.

## Optional video upload
Set `UPLOAD_KEY` in `.env` to a strong secret and restart. Upload using:
```bash
curl -X POST -H "x-upload-key: YOUR_SECRET" -F "movie=@your-video.mp4" http://127.0.0.1:3000/api/upload
```
Uploads are disabled without `UPLOAD_KEY`. Files are stored on disk and are not transcoded.

## Important deployment and security notes
- **Local development by default:** `HOST=127.0.0.1`. For a LAN, set `HOST=0.0.0.0`. For remote friends, use a trusted HTTPS reverse proxy (e.g. Caddy) with a properly configured firewall.
- **This is a portfolio-ready MVP, not a hardened public streaming service.** Video URLs are accessible to anyone who can reach the server and knows a filename; room privacy controls only room participation, **not video access**. Do not expose confidential or restricted media.
- Invites grant access to private rooms. Treat invite links as secrets. Host control is issued via a host key stored only in the creator's tab.
- For internet deployment, add account authentication, per-video authorization, secure cookies, persistent database storage, durable object storage, transcoding/HLS, moderation, HTTPS, CSRF protections for authenticated endpoints, observability, backups, and a Redis Socket.IO adapter for horizontal scaling.
- Socket.IO generally uses WebSockets with HTTP long-polling fallback.
- HTML5 video support varies by codec; use browser-compatible encoding.
- This app streams **self-hosted video**; it does not synchronize Netflix, Disney+, or other DRM-protected providers.
- Keep your `.env` private and do not commit media you lack rights to distribute.

## Architecture
```
Browser (HTML/CSS/JS)
  | REST: /api/movies, /api/rooms, /api/stream/:name (HTTP Range)
  | Socket.IO: room:join, chat:send, playback:update
Express + Socket.IO server
  | media/ video files
  | in-memory watch-party state and chat history
```

## Resume description
Developed a full-stack watch-party application using Node.js, Express, and Socket.IO, featuring HTTP byte-range video streaming, room-based real-time chat, synchronized playback controls, and shareable private invites. Designed a responsive frontend and implemented server-side validation, rate limiting, and automated unit tests.
