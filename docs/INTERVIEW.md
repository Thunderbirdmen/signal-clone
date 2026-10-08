# Understand and demonstrate your project

## Learn in this order

1. `backend/app/db.py`: understand each table, foreign key, composite key, and index.
2. `backend/app/main.py`: follow login → create direct chat → send → fetch → read.
3. `backend/app/realtime.py`: see how one user can have several sockets and how fan-out works.
4. `frontend/src/lib/api.ts`: understand the HTTP wrapper and TypeScript models.
5. `frontend/src/lib/useMessenger.ts`: understand reconnect, state refresh, optimistic sends and retries.
6. `frontend/src/components/Chat.tsx`: follow a typed draft through `onSend` to its rendered status.
7. Read `backend/app/features.py`: explain file validation and expiry cleanup.
8. Run `backend/tests/test_api.py` and `backend/tests/test_features.py`; explain what each scenario protects.

## Five-minute demonstration

1. Open normal and private browser windows. Use Alex and Maya demo accounts.
2. As Alex, open Maya and type slowly; point out the typing indicator in Maya's window.
3. Send text. Explain sending → sent → delivered → read. Keep the other chat closed once to show unread count.
4. Reply as Maya. Refresh Alex's page and reopen Maya to prove database persistence.
5. Create a group with Maya and Jordan; send a message. Open details as Alex and add Riley.
6. Explain that Maya cannot manage members because authorization runs server-side.
7. Attach an image and a text file; download them from Maya’s window. Add a ❤️ reaction, then change it to 👍.
8. Send a quoted reply and click the quote to jump to the original. Turn on the 10-second timer, send a message and watch it disappear. Turn the timer off afterward.
9. Show contact search, profile editing, dark mode, mobile layout and keyboard shortcuts.
10. Finish with `/docs`, database schema, and the passing backend tests.

## Questions you should be able to answer

**Why FastAPI?**
It offers typed request validation with Pydantic, async WebSocket endpoints, and generated API documentation. SQLite is accessed through Python's standard library to keep transactions and queries visible.

**Why REST plus WebSockets?**
REST handles durable writes and authorized reads. WebSockets notify clients about changed state and typing. The client refetches after reconnect, so a dropped event is recoverable. This trades extra HTTP queries for simpler correctness in a small demo.

**Trace one message.**
The UI creates a UUID and displays a sending bubble. The API verifies session and membership. It inserts the message and per-recipient receipts in one transaction, then emits a sync event. Clients refetch. If the request fails, the failed bubble can retry with the same UUID; a uniqueness constraint stops duplicate insertion.

**Why a separate members table?**
Users and conversations have a many-to-many relationship. A join table expresses membership and the member's role without comma-separated IDs or duplicated user records.

**Why separate receipts?**
Group members can receive/read at different times. A single read flag on a message cannot represent that. Group display status is calculated across the recipients who were members when it was sent.

**How do you stop strangers reading another chat?**
Every relevant endpoint checks the authenticated user against the membership table. The tests explicitly try unauthorized reads/writes. WebSocket typing also rechecks membership.

**How are sessions handled?**
The server generates a cryptographically random token, stores its hash and expiry, and returns the raw token once. REST sends it in the Authorization header. WebSockets send it in the first frame rather than the URL. Logout revokes that session and closes its sockets.

**Is this encrypted like Signal?**
No. The brief permits mocking encryption. The app labels this limitation, and SQLite contains plaintext messages. TLS protects transport when hosted over HTTPS, but TLS is not end-to-end encryption. A real implementation would need an established, audited cryptographic protocol and client-side key management.

**How do files, reactions and expiry work?**
The client base64-encodes one file up to 10 MB; the server validates bytes, saves them in a SQLite attachment row tied to a message, and serves them only after membership checks. Reactions live in a separate table with one row per person per message. A conversation timer is copied to each newly sent message as an absolute UTC expiry. The backend hides expired messages immediately and a background task deletes messages with their attachment bytes and reactions. Deletion is not a cryptographic erase or a guarantee about old backups.

**What happens offline?**
Messages remain stored, with sent status until recipients connect. Reconnecting marks delivery and triggers fresh reads. An offline sender sees a failure and can retry. There is no durable client-side offline queue.

**How does pagination work?**
Fetch newest messages ordered by ID descending, then reverse them for chronological rendering. Request earlier history using `before=<oldest ID>` rather than offsets, which can shift as new messages arrive.

**Why one worker?**
Each Python process has its own in-memory socket registry. Several workers would not know about each other's clients. At larger scale use shared pub/sub, a distributed presence store and a suitable shared database.

**What would you improve with more time?**
Real identity verification, secure cookie sessions, stronger abuse protection, a proper migration tool, optimized summary queries, viewport-based read tracking, durable offline queues, attachment validation/storage, ownership transfer and extensive end-to-end automation.

## Small exercises before the interview

- Add another avatar to both frontend and backend allowed lists; explain why both exist.
- Change the typing expiry and describe why it does not belong in persistent message history.
- Write a test that a removed group member cannot send a typing event.
- Explain what happens if a sender retries after the database commit but before receiving the HTTP response.
- Explain why setting `DATABASE_PATH` on an ephemeral hosted filesystem is insufficient for persistence.

Be honest about using AI assistance. The assignment allows it, and understanding your decisions matters more than claiming unaided authorship.
