import './ui/styles.css';
import { GameLoop } from './engine/loop';
import { ArenaRenderer } from './engine/renderer';
import { ThirdPersonCamera } from './engine/camera';
import { InputManager } from './engine/input';
import { ProceduralAudio } from './engine/audio';
import { getMachFromSpeed, getUrlFlags } from './engine/events';
import { ArenaSystem } from './systems/arenas';
import { VFXSystem } from './systems/vfx';
import { CombatSystem } from './systems/combat';
import { AISystem } from './systems/ai';
import { ProgressionSystem } from './systems/progression';
import { MatchDirector } from './systems/match';
import { DiegeticHUD } from './ui/hud';
import { MenuUI } from './ui/menu';

function bootstrap(): void {
  const flags = getUrlFlags();

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const hudRoot = document.getElementById('hud-root') as HTMLElement;
  const menuRoot = document.getElementById('menu-root') as HTMLElement;
  const debugOverlay = document.getElementById('debug-overlay') as HTMLElement;

  if (flags.debug && debugOverlay) {
    debugOverlay.style.display = 'block';
  }

  const tpsCamera = new ThirdPersonCamera();
  const arenaRenderer = new ArenaRenderer(canvas, tpsCamera.camera);
  const input = new InputManager(canvas);
  const audio = new ProceduralAudio();

  const arena = new ArenaSystem(arenaRenderer.scene);
  const vfx = new VFXSystem(arenaRenderer.scene, tpsCamera.camera);
  const combat = new CombatSystem();
  const ai = new AISystem();
  const progression = new ProgressionSystem(flags.unlockall);

  const match = new MatchDirector(
    arenaRenderer.scene,
    arena,
    combat,
    ai,
    vfx,
    progression,
    input,
    tpsCamera
  );
  match.autoplayHuman = flags.autoplay;

  // Unlock Web Audio on first user interaction
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  const menu = new MenuUI(menuRoot, progression, {
    onStartMatch: (mode, arenaId, difficulty) => {
      audio.unlock();
      match.startMatch(mode, arenaId, difficulty);
    },
    onLoadoutChanged: (charId, batId) => {
      match.fighters[0].setLoadout(charId, batId);
    },
    onArenaPreviewChanged: (arenaId) => {
      if (match.state === 'SHOWCASE') {
        arena.loadArena(arenaId);
      }
    },
    onReturnToShowcase: () => {
      match.startShowcaseDuel();
    },
  });

  const hud = new DiegeticHUD(
    hudRoot,
    () => {
      match.startShowcaseDuel();
      menu.renderMainMenu();
    },
    () => audio.toggleMute()
  );

  // Allow pressing Escape or Backquote to return to menu if not locked
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && match.state !== 'SHOWCASE' && match.state !== 'MATCH_OVER') {
      match.startShowcaseDuel();
      menu.renderMainMenu();
    }
  });

  let loop: GameLoop;

  match.setCallbacks({
    onMatchCompleted: (summary) => {
      menu.renderPostMatchCard(summary);
    },
    onTriggerHitstop: (durationSec) => {
      loop.triggerHitstop(durationSec);
    },
  });

  loop = new GameLoop(
    (fixedDt) => {
      match.updateFixed(fixedDt);
    },
    (_alpha, frameDt) => {
      const ball = match.ball;
      const player = match.fighters[0];

      // Determine target position for ball directional lock beam
      let lockedTargetPos = null;
      if (ball.targetId === 'gauntlet_drone' && match.mode === 'endless_gauntlet') {
        lockedTargetPos = match.dronePosition;
      } else {
        for (let i = 0; i < match.fighters.length; i++) {
          const f = match.fighters[i];
          if (f.alive && f.id === ball.targetId) {
            lockedTargetPos = f.position;
            break;
          }
        }
      }

      // Update ball visuals & floor projection ring
      let floorY = 0;
      for (let i = 0; i < arena.platforms.length; i++) {
        const p = arena.platforms[i];
        if (Math.hypot(ball.position.x - p.position.x, ball.position.z - p.position.z) <= p.radius) {
          floorY = Math.max(floorY, p.topY);
        }
      }
      ball.updateVisuals(
        frameDt,
        lockedTargetPos,
        ball.targetId === player.id && match.state !== 'SHOWCASE',
        floorY
      );

      // Update camera (Orbiting Showcase vs Over-the-Shoulder Third-Person Action Camera)
      const mouseDelta = input.consumeMouseDelta();
      if (match.state === 'SHOWCASE' || match.state === 'MATCH_OVER') {
        tpsCamera.updateShowcase(frameDt, ball.position);
      } else {
        tpsCamera.updateGameplay(
          frameDt,
          mouseDelta,
          player.position,
          ball.position,
          ball.targetId === player.id,
          input.ballAssistEnabled,
          arena.arenaRadius
        );
      }

      // Update reactive Velocity Tier lighting & holographic overhead rings
      arenaRenderer.updateReactiveLighting(
        ball.speed,
        ball.position,
        frameDt,
        (tierColor, tierInfo) => {
          arena.updateVisuals(frameDt, tierColor, tierInfo);
        }
      );

      // Update diegetic HUD
      hud.update(match, input.ballAssistEnabled);

      // Render 3D scene with selective UnrealBloomPass
      arenaRenderer.render();

      // Update optional debug overlay (?debug=1)
      if (flags.debug && debugOverlay) {
        const stats = arenaRenderer.getRenderStats();
        const mach = getMachFromSpeed(ball.speed).toFixed(2);
        debugOverlay.innerHTML =
          `FPS: ${loop.currentFps} | p95: ${loop.p95FrameMs}ms<br>` +
          `Draw Calls: ${stats.drawCalls} | Tris: ${stats.triangles}<br>` +
          `State: ${match.state} | Mode: ${match.mode} | Arena: ${arena.currentArenaId}<br>` +
          `Ball: Mach ${mach} | Target: ${ball.targetId || 'none'}`;
      }
    }
  );

  // Expose lightweight debug handle for browser verification tests
  (window as unknown as Record<string, unknown>).__HYPERBLADE__ = {
    match,
    arena,
    progression,
    loop,
    arenaRenderer,
  };

  loop.start();
}

bootstrap();
