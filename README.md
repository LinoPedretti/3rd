# 3rd

A game project built with modern web technologies and a modular ECS / component-based architecture.

## Architecture & Directory Structure
- `src/engine/`: Core game loop (fixed 60 Hz timestep), camera, input management, audio synthesis, and canvas rendering.
- `src/entities/`: Game entities, data definitions, and component pools.
- `src/systems/`: Isolated simulation systems (physics, interaction, animation, mechanics).
- `src/ui/`: HUD and DOM-based overlay UI.
- `public/`: Static assets (`audio/`, `sprites/`).

## Workflow
1. Develop modular features adhering to the fixed-timestep loop (`1/60`s).
2. Verify all playable milestones using the Chrome Browser Agent with zero console errors.
3. Commit progress using conventional commit checkpoints (`checkpoint: <milestone>`).
4. Keep the Obsidian Second Brain (`C:\Users\Linol\ObsidianVault\01-Games\3rd\`) synchronized.
