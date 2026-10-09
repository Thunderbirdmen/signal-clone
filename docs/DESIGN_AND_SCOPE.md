# Design and scope

This is an original, Signal-inspired interface for the recruitment assignment. It is not a pixel-exact copy of a specific Signal Desktop release. The current Signal desktop layout and features were cross-checked against [Signal's download page](https://signal.org/download/) and [Signal Support](https://support.signal.org/); the tokens below are **this project's chosen values**, not official Signal design tokens.

## Implemented tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--blue` | `#3a76f0` | `#668fff` | Primary controls, outgoing messages |
| `--bg` | `#ffffff` | `#1b1c20` | Main background |
| `--surface` | `#f5f5f7` | `#25262c` | Inputs, hover surfaces |
| `--rail` | `#f0f0f3` | `#15161a` | Navigation rail |
| `--text` | `#202127` | `#eeeef2` | Main text |
| `--muted` | `#787b85` | `#999ba8` | Secondary text |
| `--line` | `#ececf0` | `#303138` | Dividers |
| `--selected` | `#e8edfa` | `#2d3856` | Selected chat |
| `--bubble` | `#f0f0f3` | `#303139` | Incoming bubble |

Typography uses Arial/Helvetica with a 12–16 px body scale and larger page headings. The spacing rhythm uses 4, 8, 12, 16, and 24 px. Inputs and cards use 8–12 px radii; avatars are circular and message bubbles are rounded. Icons are from Lucide and sized mostly 16–24 px. Visible keyboard focus uses a 3 px blue outline. Source of truth: [`frontend/src/app/globals.css`](../frontend/src/app/globals.css).

## Component tree

```text
Messenger
├── Auth (sign in, register, fixed OTP)
└── Workspace
    ├── Sidebar (navigation, search, filters, conversation actions)
    ├── Chat (header, message timeline, composer)
    ├── NewChat (direct, group, Note to Self)
    ├── Details (members, admins, timer, audit)
    └── Settings (profile, theme, logout)
```

Shared Avatar, IconButton, Receipt and modal styling are in `components/ui.tsx` and the global stylesheet. The responsive breakpoint hides the chat pane until a conversation is selected on smaller screens.

## Scope against the attached extension prompt

The original assignment's core flow and most optional extras are implemented: mocked OTP registration, password login, profile emoji avatar, contacts, direct/group chat, WebSocket sync, receipts, typing, attachments, reactions, replies, disappearing messages, dark mode, mobile layout, and keyboard shortcuts. This release also has Note to Self, edit/delete, and per-user pin/mute/archive.

The attached prompt asks for substantially more than the original assignment. It describes a previous backend phase with sequence ordering, watermark receipts, ticket-authenticated sockets and simulated end-to-end encryption; **that phase does not exist in this repository**. The actual backend uses message IDs for ordering, individual receipt rows, and a bearer token in the first WebSocket frame. Message contents are plaintext in SQLite. Do not present the app as end-to-end encrypted or safe for confidential conversations.

The following extension items are not implemented: photo avatar uploads, country picker, silent refresh, message requests/blocking, safety numbers, linked devices, encrypted offline queue, service-worker/PWA installation, system notifications, working privacy settings, forwarded messages, and a three-pane layout. The demo uses emoji avatars and a modal for details. The Render free tier has ephemeral SQLite storage, as chosen for the temporary hosted demo; local Docker has a persistent volume.

These omissions should be stated plainly in an interview. The strongest demonstration is the two-user live messaging flow, group administration, authorization checks, and the integration tests.
