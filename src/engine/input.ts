export type BufferedAction = 'jump' | 'parry' | 'bunt' | 'dash' | 'ability';

const BUFFER_WINDOWS: Record<BufferedAction, number> = {
  jump: 0.12, // 120ms jump buffer
  parry: 0.1, // 100ms parry buffer
  bunt: 0.1,
  dash: 0.1,
  ability: 0.1,
};

export class InputManager {
  private keysDown: Set<string> = new Set();
  private keysJustPressed: Set<string> = new Set();
  private keysJustReleased: Set<string> = new Set();

  private mouseDown: Set<number> = new Set();
  private mouseJustPressed: Set<number> = new Set();

  private actionBuffers: Record<BufferedAction, number> = {
    jump: 0,
    parry: 0,
    bunt: 0,
    dash: 0,
    ability: 0,
  };

  public mouseDeltaX = 0;
  public mouseDeltaY = 0;
  public pointerLocked = false;
  public pointerLockAllowed = false;
  public ballAssistEnabled = true;

  private isDraggingFallback = false;
  private lastClientX = 0;
  private lastClientY = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.bindEvents();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (code === 'Tab') {
        e.preventDefault();
        this.ballAssistEnabled = !this.ballAssistEnabled;
      }
      if (!this.keysDown.has(code)) {
        this.keysJustPressed.add(code);
        this.checkKeyboardActionTriggers(code);
      }
      this.keysDown.add(code);
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      this.keysDown.delete(code);
      this.keysJustReleased.add(code);
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.mouseDown.clear();
      this.isDraggingFallback = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.pointerLockAllowed && !this.pointerLocked) {
        this.requestPointerLock();
      }
      if (e.button === 1) {
        e.preventDefault();
        this.ballAssistEnabled = !this.ballAssistEnabled;
      }
      if (!this.mouseDown.has(e.button)) {
        this.mouseJustPressed.add(e.button);
        if (e.button === 0) {
          this.triggerBuffer('parry');
        } else if (e.button === 2) {
          this.triggerBuffer('dash');
        }
      }
      this.mouseDown.add(e.button);
      this.isDraggingFallback = true;
      this.lastClientX = e.clientX;
      this.lastClientY = e.clientY;
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseDown.delete(e.button);
      if (this.mouseDown.size === 0) {
        this.isDraggingFallback = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDeltaX += e.movementX || 0;
        this.mouseDeltaY += e.movementY || 0;
      } else if (this.pointerLockAllowed && this.isDraggingFallback) {
        this.mouseDeltaX += e.clientX - this.lastClientX;
        this.mouseDeltaY += e.clientY - this.lastClientY;
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
  }

  private checkKeyboardActionTriggers(code: string): void {
    if (code === 'Space') {
      this.triggerBuffer('jump');
    } else if (code === 'KeyF') {
      this.triggerBuffer('parry');
    } else if (code === 'KeyE') {
      this.triggerBuffer('bunt');
    } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
      this.triggerBuffer('dash');
    } else if (code === 'KeyQ') {
      this.triggerBuffer('ability');
    }
  }

  public triggerBuffer(action: BufferedAction): void {
    this.actionBuffers[action] = BUFFER_WINDOWS[action];
  }

  public hasBuffered(action: BufferedAction): boolean {
    return this.actionBuffers[action] > 0;
  }

  public consumeBuffer(action: BufferedAction): boolean {
    if (this.actionBuffers[action] > 0) {
      this.actionBuffers[action] = 0;
      return true;
    }
    return false;
  }

  public isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  public justPressed(code: string): boolean {
    return this.keysJustPressed.has(code);
  }

  public justReleased(code: string): boolean {
    return this.keysJustReleased.has(code);
  }

  public getMoveAxes(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.isDown('KeyD')) x += 1;
    if (this.isDown('KeyA')) x -= 1;
    if (this.isDown('KeyW')) z += 1;
    if (this.isDown('KeyS')) z -= 1;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  public update(dt: number): void {
    // Keyboard camera look assist with arrow keys if not using mouse lock
    const keyTurnSpeed = 160 * dt;
    if (this.isDown('ArrowLeft')) this.mouseDeltaX -= keyTurnSpeed;
    if (this.isDown('ArrowRight')) this.mouseDeltaX += keyTurnSpeed;
    if (this.isDown('ArrowUp')) this.mouseDeltaY -= keyTurnSpeed * 0.7;
    if (this.isDown('ArrowDown')) this.mouseDeltaY += keyTurnSpeed * 0.7;

    for (const key of Object.keys(this.actionBuffers) as BufferedAction[]) {
      if (this.actionBuffers[key] > 0) {
        this.actionBuffers[key] = Math.max(0, this.actionBuffers[key] - dt);
      }
    }

    this.keysJustPressed.clear();
    this.keysJustReleased.clear();
    this.mouseJustPressed.clear();
  }

  public consumeMouseDelta(): { dx: number; dy: number } {
    const dx = this.mouseDeltaX;
    const dy = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return { dx, dy };
  }

  public setPointerLockAllowed(allowed: boolean): void {
    this.pointerLockAllowed = allowed;
    if (!allowed && this.pointerLocked) {
      this.exitPointerLock();
    }
  }

  public requestPointerLock(): void {
    try {
      if (document.pointerLockElement !== this.canvas && this.canvas.requestPointerLock) {
        const promise = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {
            // Headless browser or user denied pointer lock; fallback drag/arrows work seamlessly.
          });
        }
      }
    } catch {
      // Ignore if pointer lock is restricted
    }
  }

  public exitPointerLock(): void {
    try {
      if (document.pointerLockElement && document.exitPointerLock) {
        document.exitPointerLock();
      }
    } catch {
      // Ignore
    }
    this.pointerLocked = false;
  }
}
