---
name: code-review
description: Review Four Survivors code for correctness, security, performance, and multiplayer consistency.
---

Perform a structured code review. Read the changed files first, then evaluate:

**Correctness**
- [ ] Game logic produces expected results (movement, damage, death, revive).
- [ ] No off-by-one errors in grid/array indexing.
- [ ] State transitions are exhaustive (no missing cases).

**Multiplayer Consistency**
- [ ] All game state mutations happen server-side only.
- [ ] Client never trusts its own position as authoritative.
- [ ] Entity IDs are server-assigned (not client-generated).
- [ ] No race conditions in room join/leave during active game.

**Security**
- [ ] No eval(), no dynamic require() with user input.
- [ ] Socket handlers validate input types and ranges (e.g., mouseAngle is a number 0–2π).
- [ ] Rate limiting on shoot events (max 10/sec per player).

**Performance**
- [ ] No new Three.js geometry/material created inside render loop or game loop.
- [ ] Event listeners are removed on cleanup (player disconnect, scene dispose).
- [ ] Server emits use `io.to(room).emit()` not individual loops.

**Code Quality**
- [ ] No magic numbers — use constants from `shared/constants.js`.
- [ ] Functions > 40 lines should be split.
- [ ] No commented-out code left in PR.

Output: PASS / WARN (describe) / FAIL (describe + suggested fix) per category.
