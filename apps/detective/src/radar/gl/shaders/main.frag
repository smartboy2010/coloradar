precision highp float;

varying vec2 v_texCoord;

uniform sampler2D u_video;
uniform sampler2D u_prevMask;
uniform int u_mode; // 0=passthrough, 1=highlight, 2=daltonize, 3=naming
uniform vec3 u_targetLab;
uniform float u_targetChroma;
uniform float u_tolerance;
uniform float u_smoothing; // temporal smoothing factor (0.0-1.0)
uniform int u_hasTarget; // 1 if color picked
uniform int u_showOriginal; // 1 = press-hold showing original

// Daltonization: up to two Machado simulations (rg_uncertain = protan + deutan)
uniform int u_simCount;
uniform mat3 u_sim0;
uniform mat3 u_sim1;
uniform float u_daltonStrength;

// Viewport
uniform vec2 u_resolution;
uniform vec2 u_videoSize;

// Low chroma threshold
const float LOW_CHROMA = 0.03;
// Luminance weight for similarity
const float LUM_WEIGHT = 0.4;

#pragma glslify: import('./color.glsl')

vec2 coverFitUV(vec2 uv) {
  float canvasAspect = u_resolution.x / u_resolution.y;
  float videoAspect = u_videoSize.x / u_videoSize.y;
  vec2 scale = vec2(1.0);
  if (canvasAspect > videoAspect) {
    scale.y = videoAspect / canvasAspect;
  } else {
    scale.x = canvasAspect / videoAspect;
  }
  return (uv - 0.5) * scale + 0.5;
}

float computeSimilarity(vec3 lab) {
  vec3 lch = oklabToOklch(lab);
  float pixelChroma = lch.y;

  if (u_targetChroma < LOW_CHROMA) {
    // Target is achromatic — match by luminance
    float dL = abs(lab.x - u_targetLab.x);
    return smoothstep(u_tolerance * 1.5, u_tolerance * 0.5, dL);
  } else {
    // Target is chromatic — exclude low-chroma pixels
    if (pixelChroma < LOW_CHROMA) return 0.0;
    float dL = lab.x - u_targetLab.x;
    float da = lab.y - u_targetLab.y;
    float db = lab.z - u_targetLab.z;
    float dist = sqrt(LUM_WEIGHT * LUM_WEIGHT * dL * dL + da * da + db * db);
    return smoothstep(u_tolerance * 1.2, u_tolerance * 0.3, dist);
  }
}

// Fidaner error redistribution matrix for daltonization
// Redistributes red-green error to blue channel
const mat3 FIDANER_T = mat3(
  0.0, 0.0, 0.0,
  0.7, 1.0, 0.0,
  0.7, 0.0, 1.0
);

// Error lost under simulation. With two simulations, each pixel leans towards the
// one that loses more of that pixel (soft worst case, weighted by squared error)
// so neither hard seams nor double correction appear where they disagree.
vec3 daltonError(vec3 linear) {
  if (u_simCount == 0) return vec3(0.0);
  vec3 e0 = linear - u_sim0 * linear;
  if (u_simCount == 1) return e0;
  vec3 e1 = linear - u_sim1 * linear;
  float w0 = dot(e0, e0);
  float w1 = dot(e1, e1);
  float sum = w0 + w1;
  float a = sum > 1e-8 ? w0 / sum : 0.5;
  return mix(e1, e0, a);
}

void main() {
  vec2 uv = coverFitUV(v_texCoord);

  // Out of bounds check
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec4 texColor = texture2D(u_video, uv);
  vec3 srgb = texColor.rgb;
  vec3 linear = srgbToLinear(srgb);

  // Show original (press-hold)
  if (u_showOriginal == 1) {
    gl_FragColor = vec4(srgb, 1.0);
    return;
  }

  // Mode: passthrough
  if (u_mode == 0) {
    gl_FragColor = vec4(srgb, 1.0);
    return;
  }

  // Mode: highlight
  if (u_mode == 1) {
    if (u_hasTarget == 0) {
      gl_FragColor = vec4(srgb, 1.0);
      return;
    }

    vec3 lab = linearRgbToOklab(linear);
    float similarity = computeSimilarity(lab);

    // Temporal smoothing with previous mask
    float prevMask = texture2D(u_prevMask, v_texCoord).a;
    float mask = mix(prevMask, similarity, 1.0 - u_smoothing);

    // Desaturate non-matching pixels
    float gray = dot(linear, vec3(0.2126, 0.7152, 0.0722));
    vec3 desaturated = linearToSrgb(vec3(gray * 0.4));
    vec3 highlighted = mix(desaturated, srgb, mask);

    // Edge detection for outline (using mask gradient)
    float dx = dFdx(mask);
    float dy = dFdy(mask);
    float edge = length(vec2(dx, dy));
    float outline = smoothstep(0.1, 0.5, edge);

    // White outline on highlighted regions
    highlighted = mix(highlighted, vec3(1.0), outline * 0.8);

    // Pack mask into alpha for ping-pong read
    gl_FragColor = vec4(highlighted, mask);
    return;
  }

  // Mode: daltonize
  if (u_mode == 2) {
    vec3 correction = FIDANER_T * daltonError(linear);
    vec3 result = clamp(linear + u_daltonStrength * correction, 0.0, 1.0);
    gl_FragColor = vec4(linearToSrgb(result), 1.0);
    return;
  }

  // Mode: naming (passthrough with daltonization applied)
  if (u_mode == 3) {
    // In naming mode, apply mild daltonization for better perception
    vec3 correction = FIDANER_T * daltonError(linear);
    vec3 result = clamp(linear + 0.5 * correction, 0.0, 1.0);
    gl_FragColor = vec4(linearToSrgb(result), 1.0);
    return;
  }

  gl_FragColor = vec4(srgb, 1.0);
}
