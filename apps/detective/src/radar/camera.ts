export type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'image';

export interface CameraModule {
  video: HTMLVideoElement;
  state: CameraState;
  start(): Promise<void>;
  stop(): void;
  loadImage(file: File): Promise<HTMLImageElement>;
  dispose(): void;
  readonly width: number;
  readonly height: number;
}

export function createCamera(): CameraModule {
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  video.style.display = 'none';

  let stream: MediaStream | null = null;
  let state: CameraState = 'idle';

  const mod: CameraModule = {
    video,
    get state() { return state; },
    set state(s: CameraState) { state = s; },
    get width() { return video.videoWidth || 640; },
    get height() { return video.videoHeight || 480; },

    async start() {
      if (state === 'active') return;
      state = 'requesting';

      if (!navigator.mediaDevices?.getUserMedia) {
        state = 'unavailable';
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
        state = 'active';
      } catch (err: unknown) {
        const e = err as DOMException;
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          state = 'denied';
        } else {
          state = 'unavailable';
        }
      }
    },

    stop() {
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        stream = null;
      }
      video.srcObject = null;
      state = 'idle';
    },

    async loadImage(file: File): Promise<HTMLImageElement> {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          state = 'image';
          resolve(img);
        };
        img.onerror = err => {
          URL.revokeObjectURL(url);
          reject(err);
        };
        img.src = url;
      });
    },
    dispose() {
      document.removeEventListener('visibilitychange', onVisibility);
      mod.stop();
    },
  };

  function onVisibility() {
    if (document.hidden && state === 'active') {
      mod.stop();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  return mod;
}
