# Verification record

Validated locally and against the hosted demo on 8–9 October 2026 with Node.js 25.5.0, Python 3.13, Next.js 16.4.0 and FastAPI 0.143.0.

## Automated checks

- Next.js production build: passed.
- TypeScript typecheck: passed.
- Python integration suite: **22 passed** after Note to Self, larger seed data, and private chat preferences.
- Python unused-import check: passed; Python and frontend source formatted.
- `npm audit --omit=dev --audit-level=high`: **0 reported vulnerabilities** in production dependencies on 9 October. This is a dependency check, not a security audit of the application.

The Python test client currently emits a Starlette warning about future migration from `httpx` to `httpx2`. It does not fail these tests. Dependencies are pinned for the tested environment.

## Browser checks

Tested in separate browser storage origins, using Alex at `localhost:3000` and Maya at `127.0.0.1:3000`:

- Demo login and seeded conversation list.
- Message sent from Alex; Maya saw its unread indicator.
- Reply sent from Maya; appeared in Alex's open chat without a reload.
- Read receipt reached `read` and presence showed `Online`.
- Both servers restarted; saved login session, messages and group survived.
- Group created through the UI with two other members.
- Group message sent and fourth member added; details updated to four members.
- Dark mode and 390 × 844 mobile chat layout; document width remained 390px with no horizontal overflow.
- Attachment upload through the browser and authorized download control.
- Reaction added to a message and visible in the conversation.
- Ten-second disappearing timer selected through conversation details; timed message counted down, vanished from the chat, and its sidebar preview reverted to the previous message.
- PNG uploaded through the browser and rendered inline from an authenticated blob URL.
- Quoted reply composed through the UI; Ctrl/⌘+Shift+F opened in-chat search.
- Tablet width 820px and mobile width 390px had no horizontal document overflow.
- Desktop two-pane layout at 1280 × 820.
- No browser errors or warnings observed during the checked conversation flow.

Screenshots: `desktop-features.jpg` and `mobile-features.jpg` in this directory.

## Scope limits

- The group rename, role transfer, leave, audit, mock OTP, and header behavior passed API integration tests. The browser checklist above predates these additions; the updated frontend passed TypeScript checking and a production build.
- Message edit, delete for me, delete for everyone, permissions, quote visibility, and attachment erasure passed API integration tests. The updated frontend passed TypeScript checking and a production build; these new controls have not been included in the earlier browser checklist.

- GitHub Actions [Validate application #1](https://github.com/Thunderbirdmen/signal-clone/actions/runs/37826930351) completed successfully on the initial public commit.
- Dockerfiles and Compose configuration are supplied but were not executed locally because Docker was unavailable.
- Before the OTP-only revision, the HTTPS Vercel demo completed two-step registration, showed three seeded contacts, and kept its session across reload. The revised OTP-only sign-in and registration paths passed API integration tests; a final hosted browser check is recorded below.
- A hosted API smoke test registered three accounts, confirmed the seeded contacts, created a direct conversation, sent and read a persistent message, created and renamed a three-member group, and confirmed that logout revoked a session.
- A separate hosted WebSocket smoke test connected two authenticated accounts with the production frontend Origin. The recipient received the real-time sync event after a message was sent, and REST history contained that same message.
- The final hosted API returned eight conversations for Alex, including Note to Self, with boolean preference fields. In the live Vercel UI, Alex signed in through the sample-account picker; the conversation list rendered without stray zeroes, and pin/unpin changed ordering and its icon. Render showed the backend deploy live, and Vercel showed the final frontend deploy ready.
- The Render free instance has no persistent disk. Persistence across a provider restart is unavailable and should not be claimed for the hosted demo.
- This is not a load test, a cryptographic security review, or exhaustive automated browser coverage.
