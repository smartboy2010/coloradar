export interface GestureCallbacks {
  onTap(x: number, y: number): void;
  onDoubleTap(x: number, y: number): void;
  onHoldStart(): void;
  onHoldEnd(): void;
}

export function setupGestures(element: HTMLElement, callbacks: GestureCallbacks) {
  const TAP_THRESHOLD = 250;
  const HOLD_THRESHOLD = 300;
  const DOUBLE_TAP_GAP = 300;
  const MOVE_THRESHOLD = 15;

  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let isHolding = false;
  let lastTapTime = 0;
  let doubleTapPending: ReturnType<typeof setTimeout> | null = null;
  let lastTapX = 0;
  let lastTapY = 0;

  function getPos(e: TouchEvent): [number, number] {
    const t = e.changedTouches[0];
    return [t.clientX, t.clientY];
  }

  element.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const [x, y] = getPos(e);
    touchStartTime = Date.now();
    touchStartX = x;
    touchStartY = y;
    isHolding = false;

    holdTimer = setTimeout(() => {
      isHolding = true;
      callbacks.onHoldStart();
    }, HOLD_THRESHOLD);
  }, { passive: false });

  element.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const [x, y] = getPos(e);
    const dist = Math.hypot(x - touchStartX, y - touchStartY);
    if (dist > MOVE_THRESHOLD && holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }, { passive: false });

  element.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }

    if (isHolding) {
      isHolding = false;
      callbacks.onHoldEnd();
      return;
    }

    const elapsed = Date.now() - touchStartTime;
    const [x, y] = getPos(e);
    const dist = Math.hypot(x - touchStartX, y - touchStartY);

    if (elapsed < TAP_THRESHOLD && dist < MOVE_THRESHOLD) {
      const now = Date.now();
      if (now - lastTapTime < DOUBLE_TAP_GAP &&
          Math.hypot(x - lastTapX, y - lastTapY) < 30) {
        if (doubleTapPending) {
          clearTimeout(doubleTapPending);
          doubleTapPending = null;
        }
        callbacks.onDoubleTap(x, y);
        lastTapTime = 0;
      } else {
        lastTapTime = now;
        lastTapX = x;
        lastTapY = y;
        doubleTapPending = setTimeout(() => {
          callbacks.onTap(x, y);
          doubleTapPending = null;
        }, DOUBLE_TAP_GAP);
      }
    }
  }, { passive: false });

  // Mouse fallback for desktop
  let mouseDown = false;
  let mouseStartTime = 0;
  let mouseHoldTimer: ReturnType<typeof setTimeout> | null = null;
  let mouseHolding = false;
  let mouseStartX = 0;
  let mouseStartY = 0;
  let lastMouseTapTime = 0;
  let mouseDoubleTapPending: ReturnType<typeof setTimeout> | null = null;
  let lastMouseTapX = 0;
  let lastMouseTapY = 0;

  element.addEventListener('mousedown', (e) => {
    mouseDown = true;
    mouseStartTime = Date.now();
    mouseStartX = e.clientX;
    mouseStartY = e.clientY;
    mouseHolding = false;

    mouseHoldTimer = setTimeout(() => {
      mouseHolding = true;
      callbacks.onHoldStart();
    }, HOLD_THRESHOLD);
  });

  element.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    const dist = Math.hypot(e.clientX - mouseStartX, e.clientY - mouseStartY);
    if (dist > MOVE_THRESHOLD && mouseHoldTimer) {
      clearTimeout(mouseHoldTimer);
      mouseHoldTimer = null;
    }
  });

  element.addEventListener('mouseup', (e) => {
    if (!mouseDown) return;
    mouseDown = false;

    if (mouseHoldTimer) {
      clearTimeout(mouseHoldTimer);
      mouseHoldTimer = null;
    }

    if (mouseHolding) {
      mouseHolding = false;
      callbacks.onHoldEnd();
      return;
    }

    const elapsed = Date.now() - mouseStartTime;
    const dist = Math.hypot(e.clientX - mouseStartX, e.clientY - mouseStartY);

    if (elapsed < TAP_THRESHOLD && dist < MOVE_THRESHOLD) {
      const now = Date.now();
      if (now - lastMouseTapTime < DOUBLE_TAP_GAP &&
          Math.hypot(e.clientX - lastMouseTapX, e.clientY - lastMouseTapY) < 30) {
        if (mouseDoubleTapPending) {
          clearTimeout(mouseDoubleTapPending);
          mouseDoubleTapPending = null;
        }
        callbacks.onDoubleTap(e.clientX, e.clientY);
        lastMouseTapTime = 0;
      } else {
        lastMouseTapTime = now;
        lastMouseTapX = e.clientX;
        lastMouseTapY = e.clientY;
        const cx = e.clientX, cy = e.clientY;
        mouseDoubleTapPending = setTimeout(() => {
          callbacks.onTap(cx, cy);
          mouseDoubleTapPending = null;
        }, DOUBLE_TAP_GAP);
      }
    }
  });
}
