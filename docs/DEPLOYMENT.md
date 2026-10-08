# Publish the project

The source is published at [Thunderbirdmen/signal-clone](https://github.com/Thunderbirdmen/signal-clone). The submission also needs an HTTPS demo URL. Localhost is not a hosted submission.

## 1. GitHub

The public repository is already available at https://github.com/Thunderbirdmen/signal-clone. Push further source changes to its `main` branch.

Check `.gitignore` before staging. Keep `.venv`, `node_modules`, `.next`, runtime databases, session data, and `.env` files out of GitHub. Commit `.env.example` and dependency lock files.

## 2. FastAPI backend on Render

Create a **Web Service** from that repository:

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Runtime | Python |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health check | `/health` |
| PYTHON_VERSION | `3.13.5` |
| DATABASE_PATH | `/var/data/signal.db` |
| SEED_DEMO | `true` |
| DEMO_OTP | `123456` |
| ENABLE_DEMO_LOGIN | `true` for the public assignment demo only |
| FRONTEND_ORIGINS | Your exact final frontend origin, e.g. `https://your-signal.vercel.app` |

Attach a **persistent disk** mounted at `/var/data`. A Render persistent disk requires a paid service. Review the provider's current price before choosing it. Free Render instances have ephemeral filesystems and lose SQLite changes when restarted/redeployed, so that option does **not** satisfy durable hosted storage.

This configuration exposes seeded demo accounts through a known code. Treat all hosted demo content as public test data; do not use real messages or personal information. New-account registration also uses the fixed code and does not verify username or phone ownership.

Use one backend instance. Do not scale horizontally or add workers with the current in-memory WebSocket hub.

After deployment, visit `https://YOUR_BACKEND.onrender.com/health` and `/docs`.

## 3. Next.js frontend on Vercel

Import the same repository, use the Next.js preset, and set root directory to `frontend`.

Set this environment variable before building:

```text
NEXT_PUBLIC_API_URL=https://YOUR_BACKEND.onrender.com
```

Use `npm run build` and Vercel's default Next.js output handling. After receiving your stable frontend URL, set the backend's `FRONTEND_ORIGINS` to that **exact origin** (no trailing slash). Redeploy the backend after the change. Use the stable URL for evaluation; arbitrary preview URLs will not be allowed automatically.

`NEXT_PUBLIC_API_URL` is embedded in the browser bundle at build time. If changed, rebuild/redeploy the frontend. HTTPS frontend requires an HTTPS API; the client derives WSS automatically.

## 4. Final hosted checks

1. Open the frontend in a normal window and a private window.
2. Sign in as Alex and Maya; exchange messages without refreshing.
3. Observe unread count, typing and read receipts. Upload an image/file and add a reaction.
4. Create a group, send a message, rename it, promote/demote an admin, and add/remove a member. Set the 10-second timer, send a message and confirm it disappears.
5. Edit a sent text message; delete a message for yourself and one for everyone. Confirm another account sees the tombstone and can no longer download a deleted attachment.
6. Refresh both browsers; confirm sessions and history persist.
7. Restart the backend through your provider; confirm messages survive.
8. Check desktop and mobile layouts, browser console, and API/WebSocket network requests.
9. Put the actual public repository and stable frontend URLs in your submission.

## Alternatives

Any VM or container host with a persistent local volume and WebSocket support can run the backend. The included Docker Compose file is a local reference. Public self-hosting also requires an HTTPS reverse proxy and changing both the allowed frontend origin and frontend build-time API URL. A university-provided VM with persistent disk can avoid purchasing another service.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Failed to fetch | Backend health, HTTPS URL, exact CORS origin |
| Reconnecting banner | `/ws` support, allowed Origin, only one worker |
| Messages disappear after restart | `DATABASE_PATH` is inside the mounted persistent disk |
| UI calls localhost when hosted | Correct build-time API URL and rebuild |
| Different users appear to share login | Use private/normal windows or distinct browser profiles |
| Invalid session after database reset | Log in again to issue a new session |

References: [Render web services](https://render.com/docs/web-services), [persistent disks](https://render.com/docs/disks), [free service limitations](https://render.com/docs/free), [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables).
