# AI-Native SDLC Framework

A small set of process artifacts for running a real software project as a
close working loop between a product owner and an AI coding assistant —
extracted from a live production project, not written speculatively.

This is **not** an app skeleton. There's no starter code here on purpose —
it's the coordination layer that sits above whatever stack you pick: how
work gets captured, triaged, tracked, built, reviewed, and remembered
across sessions that don't share a conversation.

## What's in here, and why

| File | What it is |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | The project's memory and collaboration contract — read by the AI assistant at the start of every session. Fill in the bracketed sections; keep the structure. |
| [`AGENTS.md`](AGENTS.md) | A standing reminder to check framework-specific quirks before writing code, for projects on unusual/bleeding-edge versions. Delete if not applicable. |
| [`docs/dev-board.html`](docs/dev-board.html) | The actual mechanism: a single committed file that is Feedback Inbox → triage → Backlog/Blocked/Decisions → Standup Log → Shipped. This is the load-bearing artifact in this whole framework — see below. |
| [`docs/dual-account-workflow.md`](docs/dual-account-workflow.md) | Optional. Only relevant if you want a second AI identity (e.g. a no-secrets account) picking up work independently. Delete if it's just you and one assistant. |
| [`docs/retrospective.md`](docs/retrospective.md) | Append-only log of process lessons — not feature history, process history. |
| [`docs/user-stories-template.md`](docs/user-stories-template.md) | A format for narrative requirements, explicitly subordinate to the Dev Board for current status. |

## The one idea that matters most: a single, committed source of truth

Everything else in this framework is downstream of one hard-won rule: **if
project state doesn't live in a file that's committed to the repo and
pushed, it does not reliably exist.**

Concretely, that rules out:
- Keeping the backlog only in chat history (a new session can't see it).
- Keeping it only in a published artifact/doc outside the repo (it
  silently drifts from what the repo says, and a fresh session has no
  reason to know to look there).
- Keeping it in a local commit you forgot to push (invisible to every
  other session, and to any collaborator).
- Relying on an AI assistant's own persistent memory system for anything
  that needs to survive across a different account, a different machine,
  or a fresh clone — that memory is typically scoped to one working
  directory on one machine, not shared.

The Dev Board (`docs/dev-board.html`) exists specifically to be the thing
that survives all of that: plain HTML+CSS (renders standalone, no build
step, no dependency on a hosting platform), theme-aware, committed like any
other file, and structured so both a human skimming it and an AI assistant
parsing it get the same picture.

## How to use this template

1. **Fill in `CLAUDE.md`** — the bracketed sections especially: mission,
   owner, domain-specific rules that must never be gotten wrong, schema/
   architecture patterns, guardrails. This is the file your AI assistant
   reads first every session; the quality of that file is roughly the
   quality of every session that follows.
2. **Decide if you need `docs/dual-account-workflow.md` at all.** Most
   projects don't, until "someone else (or another AI identity) needs to
   pick up work without waiting on the person holding the real
   credentials" becomes a real, not hypothetical, need.
3. **Start using the Dev Board immediately**, even mostly empty — the habit
   of routing feedback through Inbox → triage → Backlog, and closing every
   session with a Standup Log entry, is more valuable than having it fully
   populated on day one.
4. **Write your first retrospective entry the first time something goes
   wrong**, not before. Forcing one before there's a real incident produces
   filler, and filler trains you to skim the doc.
5. Add numbered spec docs (`00-requirements.md`, `02-data-model.md`, etc.)
   as your project actually needs them — this template deliberately doesn't
   pre-create empty versions of every standard SDLC doc type; write them
   with real content when there's real content to put in them.

## Principles this framework encodes (distilled)

- **Commit AND push, every session, no exceptions.** The single most
  common failure mode this framework guards against is state that exists
  somewhere other than "committed and pushed."
- **Don't silently fix-and-forget.** Feedback and decisions leave a trace
  on the board even when they're handled immediately.
- **Numbered, addressable items.** B-cards, G-cards, D-cards — short IDs
  make backlog items referenceable in a single sentence of chat
  ("promote B2 to Next") instead of re-describing them.
- **Ask, don't guess, on scope.** Product decisions are the owner's;
  architectural/implementation decisions are the assistant's. Keep that
  line explicit rather than assumed.
- **Say what couldn't be verified.** Especially relevant with the dual-
  account pattern: state plainly what's unverified and why, rather than
  guessing or asking for access that shouldn't be handed over casually.
- **Name the exact URL/location when asking a human to check something.**
  "Log in and check it" is ambiguous whenever more than one plausible
  target exists (local vs. live, staging vs. prod).
- **Retrospective entries are append-only and unflattering on purpose.**
  The value is in the failures, named plainly, not a polished history.
