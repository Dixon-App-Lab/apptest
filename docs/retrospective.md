# Retrospective

**Fresh Draw**

The reflective layer above the Standup Log. The Standup Log (on the Dev
Board) is terse, per-session, Did/Blocked/Next. This doc is where a pattern
gets named once it's shown up more than once, or once a mistake was
expensive enough to be worth permanently remembering — usually appended
after a milestone ships or roughly weekly, whichever comes first.

**Rules for this doc:**
- **Append only.** Never rewrite or delete a past entry, even after the
  problem it describes is fixed — the point is the record of what actually
  happened, not a clean narrative.
- **Name failures as plainly as successes.** A retrospective that only
  records wins isn't earning its place; the value is almost entirely in the
  failures, because those are what stop a future session (or a future
  project) from re-learning the same lesson.
- **Write the "why," not just the "what."** "We started committing AND
  pushing every session" is not useful on its own — "because an unpushed
  local commit is invisible to every other session, and that caused two
  separate reconciliation messes in one day" is what makes the rule stick.
- One entry per real incident or milestone, dated, in reverse-chronological
  or chronological order (pick one, be consistent).

---

## 30 Jul 2026 — Unfilled template text read as a description of reality

**What happened.** Asked a general question about Android and iOS app
distribution, the assistant answered well, then recommended "build it as an
installable PWA first — your existing web app, plus a manifest and a service
worker." There was no existing web app. The repo contained one commit of SDLC
framework scaffolding and no code at all.

**Why.** `CLAUDE.md` is auto-loaded at session start, and its template
placeholders read like prose: *"One internal platform replacing N disconnected
spreadsheets… ~N staff, invite-only."* Combined with a real owner email on a
switchgear company domain, that composed into a plausible picture of a live
internal system. The assistant never ran `ls`. The owner had to ask "have I
muddled things?" to surface it — the burden of catching the error landed on the
person with least reason to doubt the answer.

**The uncomfortable part.** The framework's own premise is that committed files
are the source of truth. That premise assumes the files are *filled in*. A
template that reads as confident prose while saying nothing true is worse than
an obviously empty one, because it invites exactly this kind of confident
downstream reasoning. Placeholders that look like content are an active hazard,
not neutral scaffolding.

**Rules taken from it.**
- **Look at the repo before reasoning about the project.** `ls` and `git log`
  cost one tool call. Any claim about what a project "has" — an app, users, a
  stack — needs to come from files, not from the memory doc describing them.
- **Fill in or delete a template section, never leave it.** Bracketed
  placeholders in an auto-loaded file will be read as fact by something
  eventually.
- **A guardrail is now in `CLAUDE.md`** naming this specific failure, because
  the next session inherits the same auto-loaded context and the same trap.

**Second, smaller lesson from the same session.** Two real bugs shipped into the
working tree and were caught only by driving a real browser — an author
`display` rule silently defeating the `hidden` attribute, and the six main balls
wrapping 5+1 on a phone. Both looked correct in source review. Both were
invisible without rendering. The verification harness earned its keep on day
one; that is why "run it before claiming anything works" is a guardrail rather
than a suggestion.
