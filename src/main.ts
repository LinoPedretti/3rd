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

  const arena = new ArenaSystem(arenaRenderer.scene, (def) => {
    arenaRenderer.setEnvironmentPalette(
      def.skyHex,
      def.fogNear,
      def.fogFar,
      def.sunIntensity,
      def.hemiSkyHex,
      def.hemiGroundHex
    );
  });
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
      if (match.previewingCharacter) {
        match.fighters[0].triggerPreviewPose();
      }
    },
    onArenaPreviewChanged: (arenaId) => {
      if (match.state === 'SHOWCASE') {
        arena.loadArena(arenaId);
        if (match.previewingCharacter) {
          const topY = arena.platforms.length > 0 ? arena.platforms[0].topY : 0;
          match.fighters[0].position.y = topY;
        }
      }
    },
    onMenuTabChanged: (tab) => {
      match.setCharacterPreviewMode(tab === 'CHARACTERS');
    },
    onPreviewSlash: () => {
      match.fighters[0].triggerPreviewPose();
    },
    onReturnToShowcase: () => {
      match.startShowcaseDuel();
    },
  });

  const hud = new DiegeticHUD(
    hudRoot,
    () => {
      match.startShowcaseDuel();
      menu.setActiveTab('PLAY');
    },
    () => audio.toggleMute()
  );

  // Allow pressing Escape or Backquote to return to menu if not locked
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && match.state !== 'SHOWCASE' && match.state !== 'MATCH_OVER') {
      match.startShowcaseDuel();
      menu.setActiveTab('PLAY');
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
    (alpha, frameDt) => {
      const ball = match.ball;
      const player = match.fighters[0];

      // Sub-frame interpolation for all living fighters
      for (let i = 0; i < match.fighters.length; i++) {
        match.fighters[i].updateRenderInterpolation(alpha);
      }

      // Determine target position for ball directional trajectory line
      let lockedTargetPos = null;
      if (ball.targetId === 'gauntlet_drone' && match.mode === 'endless_gauntlet') {
        lockedTargetPos = match.dronePosition;
      } else {
        for (let i = 0; i < match.fighters.length; i++) {
          const f = match.fighters[i];
          if (f.alive && f.id === ball.targetId) {
            lockedTargetPos = f.renderPosition;
            break;
          }
        }
      }

      // Update ball visuals & floor projection ring with sub-frame alpha interpolation
      let floorY = 0;
      for (let i = 0; i < arena.platforms.length; i++) {
        const p = arena.platforms[i];
        if (
          Math.hypot(
            ball.renderPosition.x - p.position.x,
            ball.renderPosition.z - p.position.z
          ) <= p.radius
        ) {
          floorY = Math.max(floorY, p.topY);
        }
      }
      ball.updateVisuals(
        alpha,
        frameDt,
        lockedTargetPos,
        ball.targetId === player.id && match.state !== 'SHOWCASE',
        floorY
      );

      // Update camera (Character Preview Studio vs Orbiting Showcase vs Third-Person Action Camera)
      const mouseDelta = input.consumeMouseDelta();
      if (match.state === 'SHOWCASE' && match.previewingCharacter) {
        tpsCamera.updateCharacterPreview(frameDt, player.renderPosition);
      } else if (match.state === 'SHOWCASE' || match.state === 'MATCH_OVER') {
        tpsCamera.updateShowcase(frameDt, ball.renderPosition);
      } else {
        tpsCamera.updateGameplay(
          frameDt,
          mouseDelta,
          player.renderPosition,
          ball.renderPosition,
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
