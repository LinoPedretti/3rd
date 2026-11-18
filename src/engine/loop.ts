export const FIXED_DT = 1 / 60;
const MAX_ACCUMULATOR = 0.1;
const MAX_SUBSTEPS = 5;

export type FixedUpdateFn = (dt: number) => void;
export type RenderUpdateFn = (alpha: number, frameDt: number) => void;

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private rafId = 0;
  private hitstopTimer = 0;
  private hitstopTotal = 0;

  // Performance metrics
  private frameTimes: Float32Array = new Float32Array(120);
  private frameIndex = 0;
  private frameCount = 0;
  public currentFps = 60;
  public p95FrameMs = 16.67;

  constructor(
    private readonly onFixedUpdate: FixedUpdateFn,
    private readonly onRender: RenderUpdateFn
  ) {}

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  public stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /**
   * Freezes simulation steps for `durationSec` while rendering & camera punch continue.
   */
  public triggerHitstop(durationSec: number): void {
    if (durationSec > this.hitstopTimer) {
      this.hitstopTimer = durationSec;
      this.hitstopTotal = durationSec;
    }
  }

  public isInHitstop(): boolean {
    return this.hitstopTimer > 0;
  }

  public getHitstopProgress(): number {
    if (this.hitstopTotal <= 0 || this.hitstopTimer <= 0) return 0;
    return this.hitstopTimer / this.hitstopTotal;
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    const rawMs = now - this.lastTime;
    this.lastTime = now;
    const rawDt = Math.min(Math.max(rawMs * 0.001, 0), MAX_ACCUMULATOR);

    // Record telemetry
    if (rawMs > 0 && rawMs < 250) {
      this.frameTimes[this.frameIndex] = rawMs;
      this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;
      this.frameCount = Math.min(this.frameCount + 1, this.frameTimes.length);
      if (this.frameIndex % 15 === 0) {
        this.recomputeStats();
      }
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - rawDt);
    } else {
      this.accumulator += rawDt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
        this.onFixedUpdate(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_SUBSTEPS) {
        this.accumulator = 0;
      }
    }

    const alpha = this.accumulator / FIXED_DT;
    this.onRender(alpha, rawDt);

    this.rafId = requestAnimationFrame(this.tick);
  };

  private recomputeStats(): void {
    if (this.frameCount === 0) return;
    let sum = 0;
    const sorted: number[] = [];
    for (let i = 0; i < this.frameCount; i++) {
      const v = this.frameTimes[i];
      sum += v;
      sorted.push(v);
    }
    const avg = sum / this.frameCount;
    this.currentFps = avg > 0 ? Math.round(1000 / avg) : 60;
    sorted.sort((a, b) => a - b);
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    this.p95FrameMs = Number(sorted[p95Idx].toFixed(1));
  }
}
