# Agent Rules & Architecture Protocol for 3rd

All agents operating in this workspace must adhere to the following core rules:

## 1. Modular Architecture
- Place all gameplay logic in dedicated subdirectories under `src/`:
  - `src/engine/`: Game loop, input handlers, audio engine, camera, and renderers.
  - `src/entities/`: Entity definitions, state representations, and data models.
  - `src/systems/`: Pure simulation logic and mechanics systems.
  - `src/ui/`: DOM / Canvas HUD and interactive overlays.
- Maintain a strict fixed-timestep physics / game loop running at 60 Hz (`FIXED_DT = 1/60`s) with accumulator interpolation if needed.

## 2. Browser Agent Verification
- Before committing or declaring any playable milestone complete, verify functionality in the Chrome Browser Agent.
- Must ensure clean console logs with zero unhandled errors or warnings.

## 3. Automatic Git Checkpoints
- After completing and verifying each playable feature or milestone, execute:
  ```bash
  git add -A
  git commit -m "checkpoint: <milestone>"
  ```

## 4. Second Brain Synchronization
- Keep the corresponding Obsidian Second Brain directory (`C:\Users\Linol\ObsidianVault\01-Games\3rd\`) updated with strict token discipline:
  - `STATE.md` (Max 80 lines)
  - `TODO.md` (Max 50 lines)
  - `BUGS_AND_RULES.md` (Max 80 lines)
