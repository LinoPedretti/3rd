---
name: game-dev-core
description: Enforces 60 FPS frame budgets, input buffering, particle/screen-shake game feel, and clean module separation.
---

# Game Dev Core

Follow these engineering and game-feel standards for all gameplay code in this workspace:

## 1. 60 FPS Frame Budget & Fixed Timestep
- Target a **16.67 ms** frame budget (60 FPS).
- Run simulation updates on a **fixed timestep** (`FIXED_DT = 1 / 60`) using an accumulator, clamping incoming `dt` (e.g., `Math.min(rawDt, 0.1)`) to prevent spiral-of-death stalls on tab switch.
- Avoid per-frame heap allocations in hot loops: reuse vectors, pre-allocate object/particle pools, and avoid creating closures inside `update()` or `render()`.

## 2. Input Buffering & Responsiveness
- Track both current and previous frame input states (`isDown`, `justPressed`, `justReleased`).
- Implement **input buffering** (e.g., 100–150 ms buffer window) for critical actions like jump, dash, or attack so inputs pressed slightly before landing or cooldown completion still register cleanly.
- Where applicable in platformers/action games, include coyote time and variable jump/action release for crisp control.

## 3. Game Feel ("Juice")
- **Particles**: Use pooled particle emitters in `src/systems/` for impacts, dust, trails, and pickups.
- **Screen Shake**: Support trauma-based or decaying camera shake in `src/engine/` triggered by hits, explosions, or heavy landings.
- **Hitstop / Feedback**: Use brief hitstop frames, flash frames, or audio cues on significant collisions to sell impact.

## 4. Clean Module Separation
- `src/engine/`: Loop, canvas/WebGL renderer, camera, input, asset & audio managers. No gameplay rules.
- `src/entities/`: Entity factories/classes and state data. No direct DOM/UI manipulation.
- `src/systems/`: Physics, collision, particles, spawning, and state machines.
- `src/ui/`: HUD, menus, and overlays that read state snapshots/events without mutating simulation internals directly.
