# Developer Guide

This section documents DragonFruit internals for contributors and maintainers.

## What you will find here

- Architectural conventions and domain boundaries
- Support system contracts and interaction precedence
- Handoff guidance for domain-owned documentation
- Grid, branching, and trunk replacement behavior
- Raft geometry and generation pipeline
- Scan coordinate/positioning policy
- Data storage contracts
- File format contracts (VOXL, LYS extraction)
- Plugin framework contracts (simple vs complex)
- Complex plugin contribution workflow
- Experiments framework contracts and gating semantics
- History and undo/redo invariants (typed façade, dispatch semantics)
- Registration seams (delete registry, mesh geometry store)
- State and store patterns (module stores, preferences modules)
- Config schema contracts and where each is validated
- Tauri IPC and native-bridge conventions
- Adding a new support type walkthrough
- Known gotchas, temporary rules, and desired refactors (backlog)
- RTSP relay reclaim API behavior
- Release process: branching, versioning, and channels

## Source-of-truth intent

These docs are written to be actionable and stable for engineering handoff.
When behavior changes, update these pages alongside implementation.
