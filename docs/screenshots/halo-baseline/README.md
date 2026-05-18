# Halo baseline screenshots

7 reference scenarios captured before (`-pre`) and after (`-post`) the
`feat/support-island-volumetric-overlays` work lands. PR review compares
the pre/post pair side-by-side to validate the visual change.

| # | filename pattern | scenario |
|---|---|---|
| 1 | `01-empty-plate-{pre,post}.png` | empty plate, no scan run — no halos visible |
| 2 | `02-island-tiny-{pre,post}.png` | single small island close-up — barely-visible green whisper |
| 3 | `03-island-large-{pre,post}.png` | single large island close-up — bright amber halo with pulse |
| 4 | `04-full-plate-{pre,post}.png` | 50-island full plate view — readable color gradient across islands |
| 5 | `05-selected-occluded-{pre,post}.png` | selected island visible through model geometry; occluded pass intensity preserved |
| 6 | `06-supports-halo-off-{pre,post}.png` | supports with `Show support coverage` OFF — current orange-only baseline |
| 7 | `07-supports-halo-on-{pre,post}.png` | supports with `Show support coverage` ON — green coverage indication |

## How to capture

```bash
# In one terminal:
npm run tauri:dev

# Then in another (after granting Accessibility / Screen Recording /
# Input Monitoring permissions per
# .github/instructions/agent-feedback-loop.instructions.md):
scripts/df-snap.sh docs/screenshots/halo-baseline/01-empty-plate-pre.png
# ... drive the app to each scenario, snap each one
```

Capture the `-pre` set on the unmodified `feat/agent-feedback-loop`
branch before this work merges, and the `-post` set on this branch with
the halo feature enabled. Commit both sets together in the PR.
