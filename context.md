# CONTEXT — MS Rewards Automation System

Read this file completely before doing anything else. This is shared context for
two separate AI coding sessions working on two related repos. Do not skip
sections even if they seem irrelevant to your specific task — the ground rules
at the bottom apply to both.

## 1. What this system is

Two repos, one system:

1. **RewardsScheduler** — an Electron desktop app (`JUST-RELAXX/RewardsScheduler`
   on GitHub, currently **public**). Automates Bing searches across multiple
   Edge browser profiles to earn Microsoft Rewards points, using tiled window
   management.
2. **curiosity-typer-api** — a small Express backend deployed on Vercel
   (`curiosity-typer.vercel.app`). It also has its own GitHub repo, currently
   **private** (unlike RewardsScheduler, it has never been made public). It
   generates AI search phrases via Groq and, separately, randomized
   "human-like" delay timings via pure math (no AI). The Electron app calls
   this backend over HTTPS with a bearer token.

## 2. Current baseline state (as of 2026-08-19)

- RewardsScheduler's last known-good commit on `master` is `75c037a`
  ("UI: Auto-hide status banner after 10 seconds for a cleaner homepage").
  Confirm with `git log -1 --oneline` before changing anything. If it's
  different, stop and ask the user what changed.
- A prior AI coding session (2026-08-18) made confused, broken edits directly
  in RewardsScheduler's working directory (touching `main.js`,
  `modules/profile-manager.js`, `renderer/app.js`, `renderer/extension-logic.js`,
  `renderer/index.html`, `renderer/styles.css`), causing the app to render a
  blank window. Those edits were never committed and have since been reverted
  with `git stash`. Treat any reasoning or half-finished code from that
  session as noise — don't try to "continue" or "complete" it.

## 3. The actual incident timeline (context only — nothing here is a task)

| Date | Event |
|---|---|
| 2026-06-09 | A Groq API key was hardcoded directly into `RewardsScheduler/renderer/extension-logic.js` inside a function called `fetchGroqDelays()`. |
| 2026-06-17 | Groq announced (official docs, `console.groq.com/docs/deprecations`) that `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` would shut down on 2026-08-16, recommending migration to `openai/gpt-oss-20b`. |
| 2026-08-16 | Shutdown happened. `fetchGroqDelays()` (hardcoded to `llama-3.3-70b-versatile`) started failing — but this was **already handled gracefully**: the caller falls back to a plain randomized delay when this function returns null. This was never an emergency. |
| 2026-08-18 | The RewardsScheduler repo was made public so an AI agent could read the files. Within hours, GitGuardian's public-repo scanner found the June 9th key and Groq auto-revoked it. This is old exposure being newly *detected*, not new damage. |
| 2026-08-18 (same day) | While trying to "fix" the (non-critical) dead-model issue, a confused AI session broke the Electron UI across 6 files. **This is the only genuinely new problem** created by that session. |
| (ongoing) | Separately, `curiosity-typer-api`'s `/getPrompts` endpoint — which shares the same leaked primary key — started failing outright, because its retry logic only handled HTTP 429 (rate limits), never HTTP 401/403 (revoked key), so it never tried its fallback key. |

## 4. Non-negotiable ground rules for both sessions

1. **Never hardcode API keys, secrets, or credentials in source code.** Use
   environment variables. If a `.env` file doesn't exist yet, create one —
   but confirm it's listed in `.gitignore` *before* writing any real value
   into it. This applies even in the private `curiosity-typer-api` repo —
   "private" is a setting that can change (or be misconfigured, or shared
   with a collaborator later); a secret committed to git history is
   recoverable by anyone with repo access regardless of the current
   visibility toggle. Treat "private" as convenience, not as a security
   boundary.
2. **Do not run `git commit` or `git push`** without the user explicitly
   telling you to. Make your changes, summarize exactly what you changed,
   and stop.
3. **Never rewrite git history** (`git filter-repo`, `rebase` on shared
   branches, force-push, etc.) without separate, explicit confirmation —
   this is destructive and hard to undo.
4. **Stay scoped.** Only touch what your specific task prompt describes.
   Do not refactor unrelated code, upgrade dependencies, change UI/UX, or
   "improve" things nobody asked about.
5. **The user does not write code themselves** and is relying on you to get
   this right without hand-holding. If an instruction is ambiguous, or a
   change could have side effects beyond what's described, **stop and ask
   a specific question** instead of guessing at the "most likely" intent.
   Guessing under ambiguity is exactly what caused the Aug 18 breakage.
6. **Preserve existing defensive/fallback code.** Some of this codebase
   already fails gracefully on purpose (see the delay fallback above). If a
   fix requires removing a safety net, say so explicitly and explain why —
   don't remove it silently as a side effect.
7. **Verify before declaring anything done.** Run `node --check` on any
   file you edit. For the Electron app specifically, you cannot see the
   rendered window — ask the user to launch it and confirm the UI actually
   renders before considering your task complete.
8. **Model going forward for all Groq calls:** `openai/gpt-oss-20b`, with
   `reasoning_effort: "low"` for simple tasks like list generation (saves
   tokens, no quality loss for this use case). Free-tier limits confirmed
   from Groq's docs on 2026-08-19: 30 RPM, 1,000 requests/day, 8,000 TPM,
   200,000 tokens/day — comfortably enough for this app's usage.