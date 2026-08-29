# Development Flow

How this project actually got built, reconstructed from the commit history (`fd012b1` → `8551d7a`, 2026-07-02 → 2026-08-25). This is a description of the working pattern, not a rulebook — but the pattern held consistently enough to be worth writing down for SD2.

Related docs: [`docs/HANDOFF.md`](docs/HANDOFF.md) (authoritative spec) · [`PROGRESS.md`](PROGRESS.md) (build-order checklist) · [`DEPLOYMENT.md`](DEPLOYMENT.md) (manual deploy steps) · [`README.md`](README.md) (run instructions)

---

## The core loop

```
Spec (HANDOFF.md §12 build order)
   │
   ├─> pick next numbered task
   │        │
   │        ├─> build the whole layer in one commit  ──>  "Task N: <what landed>"
   │        │
   │        └─> tick the checklist + write notes     ──>  "PROGRESS: tick task N"
   │
   └─> blocked? record the blocker in PROGRESS, cover it with a mock, keep going
```

Everything lands on `main`. No feature branches, no merge commits, no PRs — single-developer trunk development. (CI is wired for `pull_request` anyway, so branching works if SD2 adds contributors.)

---

## Phases

### Phase 0 — Empty repo + framework scaffold (Jul 2)

| Commit | What |
|---|---|
| `fd012b1` | Initial commit — `.gitattributes`, stub README |
| `94169e3` | "initial paste" — raw `nest new` output dropped in |

Two commits, no design decisions. Just getting a repo and a framework skeleton on disk.

### Phase 1 — Write the spec before the code (Jul 4)

| Commit | What |
|---|---|
| `6b53ece` | Task 1: repo scaffold — README, `PROGRESS.md`, `docs/HANDOFF.md`, `.gitignore`, MiFloraDB CSV into `db/` |

**This is the pivot the whole project runs on.** A 439-line authoritative spec (`docs/HANDOFF.md`) landed *before* any feature code, covering: resolved decisions, tech stack, repo structure, DB schema, firmware spec, every backend endpoint, alert-evaluation rules, CI/CD, acceptance criteria, and explicit out-of-scope. Section 12 of that spec is a **numbered 14-task build order**; `PROGRESS.md` is that list as a checkbox mirror.

Note this commit also *deleted* the Phase 0 Nest scaffold and restored it into the working tree — the spec dictated the repo layout, not the framework's defaults.

**Consequence:** for the rest of the project, "what do I build next" was never an open question. Pick the next unchecked box.

### Phase 2 — One task, one commit (Jul 4 — all in a single day)

Six feature commits, each a complete vertical layer:

| Commit | Task(s) | Layer |
|---|---|---|
| `9af90ba` | 10 | `firmware/` — `main.cpp`, `platformio.ini`, I2C scanner, secrets example |
| `8e3c93e` | 11–12 | CI + deploy workflows, `DEPLOYMENT.md`, Azure notes |
| `5c4cb2d` | 7, 13 | `scripts/` — `sim_device`, `seed_demo`, `trigger_alert` + dev compose |
| `790ff5c` | 2 | `db/` — init migration (8 tables, RLS, indexes) + MiFloraDB import |
| `c31834d` | 8–9 | `app/` — 9 Expo screens, auth, onboarding, push, demo mode |
| `0a9c355` | 3–6 | `backend/` — guards, 8 module groups, tests, Dockerfile |

Three things stand out:

1. **Tasks were not done in numeric order** (10 → 11–12 → 7/13 → 2 → 8–9 → 3–6). The numbering set the scope of each unit of work, not the sequence. Layers got built in whatever order was unblocked.
2. **Layers were built independently against the spec's contracts, then integrated later.** The app was written against §8.4's endpoint list before the backend implementing it existed. This only works because the spec pinned the contract first.
3. **Commit messages are a summary, not a label.** `Tasks 3-6: NestJS backend — JWKS JWT + device-token guards, profiles/push/devices/plants/species/enrichment/sensors/alerts, tests, Dockerfile` tells you what's inside without opening the diff.

### Phase 3 — Bookkeeping commits, kept separate

Interleaved with the above: `c59703a`, `fd8eb29`, `7871b19`, `66a3255` — all `PROGRESS: tick ...`, all touching only `PROGRESS.md`.

These are worth calling out as a deliberate convention. The tick commit carries the **notes** that the code can't: what was verified green, what design decisions got made, what's deferred and why. From `66a3255`:

> `0a9c355`: backend/ complete — all 8.4 endpoints + GET/PUT /profiles/me … build+lint+14 unit+4 e2e green. Claim race hardened (`.is` owner null).

Code review reads the diff; a teammate picking up the project reads these.

### Phase 4 — Don't let a blocker stop the build

Task 7 (end-to-end sim verify) needed a live Supabase project that didn't exist yet. Instead of stalling, the blocker was **written down and routed around**:

- `PROGRESS.md` line 10 records the blocker and points at `DEPLOYMENT.md §1`
- The gap got covered by test doubles instead: `backend/test/utils/in-memory-supabase.ts`, and an ingest → alert → push e2e with Expo mocked

Same pattern for hardware (task 14, still open) and for the unapplied migration. **CI stays hermetic — no test needs real infra.**

### Phase 5 — Platform reality corrections (Jul 5–8)

Three commits where the outside world pushed back on the plan:

| Commit | Constraint hit | Response |
|---|---|---|
| `6464daf` | Expo SDK 51 wouldn't run in Expo Go (the whole demo story) | Upgrade to SDK 54; harden `seed_demo` secret write while in there |
| `cdf23be` | UCF Entra tenant blocks students creating service principals → `azure/login` impossible in CI | Fall back to ACR admin creds; **document the why in a comment right in `deploy.yml`** |
| `1e36617` | Nobody could run the thing from the README | Add run instructions + frontend tweaks |

The `cdf23be` pattern is the one to copy: the workaround explains itself at the point of the workaround, so the next person doesn't "fix" it back.

### Phase 6 — Design pass, isolated from logic (Jul 5–6)

| Commit | What |
|---|---|
| `9290272` | `mockups` — 8 reference PNGs committed into `app/mockups/` |
| `5d110a1` | `Restyle app to mockup visual language; logic unchanged` — 16 files, +749/−351 |

Visual mockups became a **checked-in artifact**, not a Figma link that rots. The restyle then touched 16 files across every screen in one commit, explicitly flagged **`logic unchanged`** — so the diff is reviewable as "styling only" and a regression after it can be triaged instantly.

### Phase 7 — Integration debugging against live infra (Aug 25)

`8551d7a` `debug` — the cross-cutting pass once everything was actually deployed and talking to real Supabase/Azure. Touched 20 source files across app *and* backend at once: added `backend/src/common/all-exceptions.filter.ts`, reworked `app/src/api/client.ts` error handling, `useAuth`, `usePolling`, plus `devices`/`plants`/`enrichment` services.

This is the cost of Phase 2's build-layers-independently approach, paid at the end: contracts agreed on paper still need a debugging pass once real data flows. Worth budgeting for it rather than being surprised by it.

---

## Conventions worth keeping

**Commits**
- `Task N: <layer> — <what landed>` for spec-driven work; `Tasks N-M:` when one commit closes several
- `PROGRESS: tick task N` as its own commit, carrying notes + blockers
- Flag intent when a diff is large but narrow: `logic unchanged`
- Explain non-obvious constraints in the message, e.g. `(tenant blocks service principals)`

**Working rules**
- Spec first. `docs/HANDOFF.md` is authoritative; if code and spec disagree, that's a bug in one of them
- Repo state lives in git; `PROGRESS.md` is the index, not a second source of truth
- A blocker gets recorded and mocked, never silently skipped
- Tests never require live infra — use the in-memory Supabase double and mock Expo push
- Keep restyles and logic changes in separate commits

**Pipeline** (`.github/workflows/`)
- `ci.yml` — on every PR and push to `main`: backend `lint` → `build` → `test` → `test:e2e`; app `lint` → `tsc --noEmit`
- `deploy.yml` — on push to `main` touching `backend/**`: build + push image to ACR, tagged `:<sha>` and `:latest`
- **Rollout is deliberately manual** — CI can't get ARM auth, so going live is a local `az containerapp update` (see README). Green CI ≠ deployed.

---

## Where it stands

Open items per `PROGRESS.md`:

- [ ] **7.** Live sim verify — script done, mocked path green; needs a real Supabase project
- [ ] **14.** Manual hardware end-to-end

Everything else (1–6, 8–13) is checked off, and the backend is deployed on Azure with the app pointed at it.
