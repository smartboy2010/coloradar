import vertSrc from './shaders/main.vert?raw';
import fragSrc from './shaders/main.frag?raw';
import outlineFragSrc from './shaders/outline.frag?raw';
import colorGlsl from './shaders/color.glsl?raw';

export type RenderMode = 0 | 1 | 2 | 3;

export interface PipelineUniforms {
  mode: RenderMode;
  targetLab: [number, number, number];
  targetChroma: number;
  tolerance: number;
  hasTarget: boolean;
  showOriginal: boolean;
  simCount: 0 | 1 | 2;
  sim0: Float32Array;
  sim1: Float32Array;
  daltonStrength: number;
  videoWidth: number;
  videoHeight: number;
}

export interface GLPipeline {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  uploadVideoFrame(source: TexImageSource): void;
  render(uniforms: PipelineUniforms): void;
  resize(): void;
  destroy(): void;
}

function resolveIncludes(src: string, colorSrc: string): string {
  return src.replace(/#pragma glslify:\s*import\(['"]\.\/color\.glsl['"]\)/, colorSrc);
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function linkProgram(gl: WebGLRenderingContext, vSrc: string, fSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'a_position');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function loc(gl: WebGLRenderingContext, prog: WebGLProgram, name: string): WebGLUniformLocation | null {
  return gl.getUniformLocation(prog, name);
}

export function createPipeline(): GLPipeline {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';

  const attrs: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  };

  let gl = canvas.getContext('webgl2', attrs) as WebGLRenderingContext | null;
  const isWebGL2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', attrs);
  if (!gl) throw new Error('WebGL not supported');

  if (!isWebGL2) gl.getExtension('OES_standard_derivatives');

  // Build shader source with WebGL version compatibility
  const resolvedFrag = resolveIncludes(fragSrc, colorGlsl);

  const vp = isWebGL2 ? '#version 300 es\nprecision highp float;\n#define attribute in\n#define varying out\n' : '';
  const fp = isWebGL2
    ? '#version 300 es\nprecision highp float;\nprecision highp int;\n#define texture2D texture\n#define varying in\n#define gl_FragColor fragColor\nout vec4 fragColor;\n'
    : '#extension GL_OES_standard_derivatives : enable\n';

  const mainProg = linkProgram(gl, vp + vertSrc, fp + resolvedFrag);
  const outlineProg = linkProgram(gl, vp + vertSrc, fp + outlineFragSrc);

  // Cache uniform locations
  const mu = {
    video: loc(gl, mainProg, 'u_video'),
    prevMask: loc(gl, mainProg, 'u_prevMask'),
    mode: loc(gl, mainProg, 'u_mode'),
    targetLab: loc(gl, mainProg, 'u_targetLab'),
    targetChroma: loc(gl, mainProg, 'u_targetChroma'),
    tolerance: loc(gl, mainProg, 'u_tolerance'),
    smoothing: loc(gl, mainProg, 'u_smoothing'),
    hasTarget: loc(gl, mainProg, 'u_hasTarget'),
    showOriginal: loc(gl, mainProg, 'u_showOriginal'),
    simCount: loc(gl, mainProg, 'u_simCount'),
    sim0: loc(gl, mainProg, 'u_sim0'),
    sim1: loc(gl, mainProg, 'u_sim1'),
    daltonStrength: loc(gl, mainProg, 'u_daltonStrength'),
    resolution: loc(gl, mainProg, 'u_resolution'),
    videoSize: loc(gl, mainProg, 'u_videoSize'),
  };

  const ou = {
    source: loc(gl, outlineProg, 'u_source'),
    texelSize: loc(gl, outlineProg, 'u_texelSize'),
  };

  // Fullscreen quad
  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  // Video texture
  const videoTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, videoTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Ping-pong FBOs for temporal smoothing
  const ppTex: WebGLTexture[] = [];
  const ppFBO: WebGLFramebuffer[] = [];
  let ppW = 0, ppH = 0, ppIdx = 0;

  function ensurePingPong(w: number, h: number) {
    if (ppW === w && ppH === h) return;
    ppW = w; ppH = h;
    for (let i = 0; i < 2; i++) {
      if (ppTex[i]) gl!.deleteTexture(ppTex[i]);
      if (ppFBO[i]) gl!.deleteFramebuffer(ppFBO[i]);
      const t = gl!.createTexture()!;
      gl!.bindTexture(gl!.TEXTURE_2D, t);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, w, h, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      const f = gl!.createFramebuffer()!;
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, t, 0);
      ppTex[i] = t;
      ppFBO[i] = f;
    }
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }

  function quad() {
    gl!.bindBuffer(gl!.ARRAY_BUFFER, quadBuf);
    gl!.enableVertexAttribArray(0);
    gl!.vertexAttribPointer(0, 2, gl!.FLOAT, false, 0, 0);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  function setMainUniforms(u: PipelineUniforms) {
    gl!.uniform1i(mu.mode, u.mode);
    gl!.uniform3fv(mu.targetLab, u.targetLab);
    gl!.uniform1f(mu.targetChroma, u.targetChroma);
    gl!.uniform1f(mu.tolerance, u.tolerance);
    gl!.uniform1f(mu.smoothing, 0.6);
    gl!.uniform1i(mu.hasTarget, u.hasTarget ? 1 : 0);
    gl!.uniform1i(mu.showOriginal, u.showOriginal ? 1 : 0);
    gl!.uniform1i(mu.simCount, u.simCount);
    gl!.uniformMatrix3fv(mu.sim0, false, u.sim0);
    gl!.uniformMatrix3fv(mu.sim1, false, u.sim1);
    gl!.uniform1f(mu.daltonStrength, u.daltonStrength);
    gl!.uniform2f(mu.resolution, canvas.width, canvas.height);
    gl!.uniform2f(mu.videoSize, u.videoWidth, u.videoHeight);
  }

  return {
    canvas,
    gl,

    uploadVideoFrame(source: TexImageSource) {
      gl!.bindTexture(gl!.TEXTURE_2D, videoTex);
      // Match top-left video/image rows to GL texture space so FBO ping-pong uses the same UVs.
      gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, source);
      gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
    },

    render(u: PipelineUniforms) {
      const w = canvas.width, h = canvas.height;
      ensurePingPong(w, h);
      const ri = ppIdx, wi = 1 - ppIdx;

      if (u.mode === 1 && u.hasTarget) {
        // Pass 1: highlight → FBO
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, ppFBO[wi]);
        gl!.viewport(0, 0, w, h);
        gl!.useProgram(mainProg);
        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, videoTex);
        gl!.uniform1i(mu.video, 0);
        gl!.activeTexture(gl!.TEXTURE1);
        gl!.bindTexture(gl!.TEXTURE_2D, ppTex[ri]);
        gl!.uniform1i(mu.prevMask, 1);
        setMainUniforms(u);
        quad();

        // Pass 2: outline → screen
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
        gl!.viewport(0, 0, w, h);
        gl!.useProgram(outlineProg);
        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, ppTex[wi]);
        gl!.uniform1i(ou.source, 0);
        gl!.uniform2f(ou.texelSize, 1 / w, 1 / h);
        quad();

        ppIdx = wi;
      } else {
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
        gl!.viewport(0, 0, w, h);
        gl!.useProgram(mainProg);
        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, videoTex);
        gl!.uniform1i(mu.video, 0);
        gl!.activeTexture(gl!.TEXTURE1);
        gl!.bindTexture(gl!.TEXTURE_2D, ppTex[ri] ?? videoTex);
        gl!.uniform1i(mu.prevMask, 1);
        setMainUniforms(u);
        quad();
      }
    },

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    },

    destroy() {
      gl!.deleteProgram(mainProg);
      gl!.deleteProgram(outlineProg);
      gl!.deleteBuffer(quadBuf);
      gl!.deleteTexture(videoTex);
      for (const t of ppTex) if (t) gl!.deleteTexture(t);
      for (const f of ppFBO) if (f) gl!.deleteFramebuffer(f);
    },
  };
}
