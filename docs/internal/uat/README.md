# UAT scenarios

Manual verification scenarios in Given/When/Then form. There is no automated UAT
framework in this repo — these are scripts for a person to follow.

**Provenance and health warning.** These came from an external knowledge base
kept outside this repo, seeded by an agent harvest. They were written at
different times against different states of the code and **have not been
re-verified against current behaviour**. Treat a failing step as "check whether
the scenario is stale" before treating it as a bug.

In particular, `rendering-idle-cpu.md`, `rendering-demand-gizmo.md` and
`rendering-demand-toggle.md` describe an on-demand rendering effort whose
supporting code is no longer in the tree (`frameloop='demand'` survives only in
`PrintingLayerGpuPreview.tsx`). Read them as history until someone confirms
otherwise.
