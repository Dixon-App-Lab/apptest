# Working with two AI-assistant accounts on one repo

**[Project name]** · added [date]

[This pattern is only worth adopting if you actually want a second
"developer" — e.g. a personal account that can pick up backlog items
without waiting on whoever holds the real credentials. If it's just you and
one assistant session, skip this file entirely; don't add the ceremony
without the need.]

## The two identities, and why they're kept apart

| | Primary account | Secondary account |
|---|---|---|
| Folder | `[path/to/primary-clone]` | `[path/to/secondary-clone]` |
| Git/platform identity | `[identity-a]` | `[identity-b]` |
| Has real secrets (`.env.local` / equivalent)? | Yes | **No, deliberately** |
| Can push to `main`? | Yes | **Never. Branch (+ PR if available) only.** |
| Job | Review, verify with real credentials, merge, keep the Dev Board honest | Implement, verify what's verifiable without secrets, propose |

The secondary account never gets a copy of real secrets. That's not an
oversight to fix later — it's the actual security boundary that makes it
safe to hand backlog items to a second identity at all. When asked to
verify something that needs real credentials, the correct move is to say so
plainly and propose the real gap honestly — never fake a verification or
ask to be handed the missing credentials "just this once."

Consider and reject giving the secondary account its own credentialed path
to a live preview (e.g. a paid-tier CI preview) unless the team is bigger
than two people — the primary account already has real secrets locally, so
it can do the visual verification step for free. Revisit only if this
becomes a genuinely bigger team.

## The process, step by step

### Phase A — Secondary account picks up an item

1. **Pull before anything else.** `git pull origin main`. Not optional — a
   session that skips this can report a stale backlog state as current
   without realising it.
2. Confirm on `main`, then branch: short, descriptive, no ticket-tracker
   prefix needed if the Dev Board ID is in the name (e.g. `b7-backup-restore-drill`).
3. Read the backlog card fully off the Dev Board before writing code.
4. Implement.
5. Verify everything that's verifiable *without* real secrets —
   type-check, lint, logic/boundary tests run directly against the actual
   function. Trace edge cases by hand rather than assuming they're fine;
   this is the step most likely to catch a real bug before it ships.
6. **State plainly what could NOT be verified**, rather than guessing or
   asking for secrets. That's the reviewing account's job next, not a gap
   to paper over.
7. Commit **only the relevant files.** Local tooling noise should never be
   swept in — check `git status` before `git add`, don't stage everything
   blindly.
8. Push the branch, open a PR if the tooling for it is available; if not,
   hand back the branch name and the platform's "compare/create PR" link —
   that's a documented fallback, not a failure.
9. **Report back once, in a short fixed shape**, then stop — its job for
   that item is done. It does not need to wait to hear "merged". If this
   account has no access to the systems needed to verify a live deploy —
   not "hasn't checked yet," but structurally can't — the report must end
   with one plain, literal instruction for what the human does next:

   > **Change:** what/where
   > **Verified:** what was actually checked, and how
   > **Not verified:** what couldn't be checked from this clone, and why
   > **PR / branch:** the link or name
   > **Next:** bring this to your primary-account session — it has the
   > real credentials, so it does the visual verify and the merge

## Kicking off Phase B from the secondary session's report

The primary-account session has no memory of what the secondary session
just did — it needs a self-contained message, not "please finish the
deployment" (too vague to act on: finish *what*, from *where*?). Reuse the
same fixed message every time, filling in only the branch/PR:

> *"I just finished a feature request in my secondary account — branch
> `<branch-name>` (PR: `<link, or 'none — use the branch'>`) is ready for
> review. Follow Phase B in docs/dual-account-workflow.md: pull it into
> this folder, verify it for real with actual login, then merge and update
> the Dev Board."*

Pointing at this doc instead of re-explaining the steps each time is the
point — Phase B doesn't change per feature, so the kick-off message
shouldn't try to restate it.

### Phase B — Primary account reviews, verifies, merges

1. The human brings the PR (link or branch name) to the primary-account
   session.
2. Pull the branch into the **primary** folder (real secrets live here).
3. Run it for real — dev server, actual login, actual rendered page. This
   is the step the secondary account structurally cannot do.
4. **When asking the human to eyeball something, name the exact URL
   explicitly** — e.g. "log into the local dev server at `localhost:3000`,
   not the live production URL." A vague "log in and check it" is a real
   failure mode: two URLs (a local test server and the real live site) can
   both plausibly answer to that description, and a human checking the
   wrong one out of habit will reasonably (and wrongly) read old content as
   "the fix isn't working."
5. **Don't over-trust your own automated browser tooling for authenticated
   pages either** — if a session-dependent read comes back looking wrong,
   consider whether the tooling dropped the session rather than assuming
   the code is broken. When in doubt, ask the human to look directly and
   tell you what they see; treat that as the verification.
6. Report findings plainly: looks right / found an issue.
7. If good, merge (via PR if one exists, or directly with an explicit
   **confirm before pushing** step every single time — the confirmation is
   the point, not the mechanism).
8. Switch back to local `main`, pull to catch up.
9. Update the Dev Board: add a **Standup Log** entry, move the card from
   Backlog to **Shipped**, commit, **push immediately** — no exceptions.
10. Confirm to the human it's shipped.

**The Dev Board is only ever updated from the primary side**, after a merge
actually happens. The secondary account proposes; it never marks its own
work "done" on the board — that would risk two identities writing to the
same file without knowing what the other did.

## What went wrong (keep this section, don't delete it as things get fixed)

[This section is the point of the whole doc. The first few real runs of any
new process surface mistakes that are worth naming permanently, not
quietly patching and forgetting — otherwise a future session re-learns the
same lesson a second or third time. Two real examples from where this
pattern was developed, kept here as a model of the right level of detail:

- A session mistook `git fetch` (updates git's knowledge of the remote)
  for `git pull` (updates the actual files on disk), and reported a stale
  backlog as current. Fixed by making "pull before forming any opinion
  about current state, every session, no exceptions" an explicit written
  rule, not an assumed default.
- A human was asked to "log in and check it" with no URL specified,
  checked the live production site out of habit, correctly saw old
  content (nothing had merged yet), and reasonably read that as the fix
  not working. Fixed by making "name the exact URL" an explicit step in
  the review phase, not an implicit expectation.

Delete this bracketed explanation once you've replaced it with your own
project's real incidents.]

## Open questions, not yet decided

[Track anything about this process that's still a judgement call rather
than a settled rule — e.g. whether the primary account should also be
branch-only, what happens when a secondary-account PR needs a fix after
review. Keep genuinely open items here rather than silently deciding them;
resolve into the process above once actually tested.]
