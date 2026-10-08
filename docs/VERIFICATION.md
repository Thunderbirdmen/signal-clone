# Verification record

Validated locally on 8 October 2026 with Node.js 25.5.0, Python 3.13, Next.js 16.4.0 and FastAPI 0.143.0.

## Automated checks

- Next.js production build: passed.
- TypeScript typecheck: passed.
- Python integration suite: **20 passed** after message edit and deletion changes.
- Python unused-import check: passed; Python and frontend source formatted.
- npm installation audit: no vulnerabilities reported for the installed dependency tree.

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

- The new group rename, role transfer, leave, audit, password, and header behavior passed API integration tests. The browser checklist above predates these additions; the updated frontend passed TypeScript checking and a production build.
- Message edit, delete for me, delete for everyone, permissions, quote visibility, and attachment erasure passed API integration tests. The updated frontend passed TypeScript checking and a production build; these new controls have not been included in the earlier browser checklist.

- GitHub Actions workflow is included but has not run remotely.
- Dockerfiles and Compose configuration are supplied but were not executed locally because Docker was unavailable.
- Hosted behavior, HTTPS, provider CORS configuration and persistence across provider restarts must be verified after deployment.
- This is not a load test, a cryptographic security review, or exhaustive automated browser coverage.
