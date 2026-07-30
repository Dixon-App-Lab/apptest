# No framework here — but the platform still surprises

This project has no framework to get wrong: hand-written HTML, CSS and ES
modules, no build step, one devDependency. So the usual version-drift trap
doesn't apply.

What does apply is the **browser platform**, where assumptions fail quietly
rather than loudly. Two examples already bitten in this repo, both found by
running the app rather than reading it:

- `[hidden]` comes from the UA stylesheet, so any author rule that sets
  `display` on the same element wins and the attribute stops working.
- Headless Chromium clamps small window sizes and crops the screenshot instead
  of scaling the page.

Neither is exotic; both looked correct in the source. The rule this file exists
to enforce: **verify platform behaviour in a real browser before claiming it
works.** `npm run verify` is that check. Extend it when you learn something new,
so the next session inherits the knowledge instead of rediscovering it.
