# ReelTogether — PostgreSQL Edition

A full-stack watch-party app with persistent accounts, movie watch history, and room settings.

## Requirements

- Node.js 20+ and PostgreSQL 15+
- Your own authorized MP4/WebM files in `media/`

## Quick start

1. Create an empty PostgreSQL database called `reeltogether` (for example, `createdb reeltogether`).
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and a stable random `APP_SECRET` (32+ characters).
3. Run `npm install` then `npm start`.
4. Visit `http://127.0.0.1:3000`, register an account, and create a watch room.

The server automatically creates the `users`, `sessions`, `rooms`, and `watch_history` tables on startup. Existing rooms, title, public/private visibility, and last playback state persist across server restarts. Active viewer lists and chat messages are in-memory only.

## Database-backed features

- **Accounts:** unique usernames and scrypt-hashed passwords; random 30-day session tokens stored as SHA-256 hashes in PostgreSQL and sent as HTTP-only cookies.
- **Watch history:** records movies and playback positions when a signed-in viewer joins a room and when the host updates playback. Access your own history with `GET /api/history`.
- **Room settings:** signed-in room owners can edit title and public/invite-only visibility, saved to PostgreSQL using `PATCH /api/rooms/:room`. The interface has a Save room title & visibility button.
- **Rooms:** persistent metadata and playback state. Active viewers and live chat remain in memory.
- **Host controls:** host playback and seeking sync to guests; every viewer controls their own audio volume. Video uses `object-fit: contain` to avoid cropping.

## Important notes

- Room links depend on `APP_SECRET`; keep it unchanged across restarts. A newly started server will restore rooms on demand.
- The room owner can regain host control by signing in and joining their room. If the host disconnects, a temporary host may be promoted for the active session.
- This remains a portfolio MVP, **not a production-secure streaming service**. Direct `/api/stream/:name` URLs are not access-controlled; uploaded video access is not private. Do not host copyrighted media without authorization. Add per-video access control, CSRF protection, login throttling, robust validation, observability, backups, and HTTPS before public deployment.
- Cookies default to `SameSite=Lax`; set `COOKIE_SECURE=true` behind HTTPS. Do not commit `.env`, passwords, or media files.
- Socket.IO state is in-process and not horizontally scalable without a shared adapter. Room chat is not persisted.

## Useful endpoints

`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/history`, `GET /api/movies`, `GET /api/rooms`, `POST /api/rooms`, `GET /api/rooms/:room`, `PATCH /api/rooms/:room`.

## Testing

Run `npm test` for the original core unit tests. Run `node --check server/index.js` and `node --check public/app.js` for syntax checks. Database-backed integration tests require a running PostgreSQL instance.
