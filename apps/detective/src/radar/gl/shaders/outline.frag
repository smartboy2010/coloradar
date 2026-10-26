precision highp float;

varying vec2 v_texCoord;
uniform sampler2D u_source;
uniform vec2 u_texelSize;

void main() {
  vec4 center = texture2D(u_source, v_texCoord);
  float mask = center.a;

  // Sobel edge detection on the mask channel
  float tl = texture2D(u_source, v_texCoord + vec2(-1.0, -1.0) * u_texelSize).a;
  float t  = texture2D(u_source, v_texCoord + vec2( 0.0, -1.0) * u_texelSize).a;
  float tr = texture2D(u_source, v_texCoord + vec2( 1.0, -1.0) * u_texelSize).a;
  float l  = texture2D(u_source, v_texCoord + vec2(-1.0,  0.0) * u_texelSize).a;
  float r  = texture2D(u_source, v_texCoord + vec2( 1.0,  0.0) * u_texelSize).a;
  float bl = texture2D(u_source, v_texCoord + vec2(-1.0,  1.0) * u_texelSize).a;
  float b  = texture2D(u_source, v_texCoord + vec2( 0.0,  1.0) * u_texelSize).a;
  float br = texture2D(u_source, v_texCoord + vec2( 1.0,  1.0) * u_texelSize).a;

  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
  float edge = length(vec2(gx, gy));
  float outline = smoothstep(0.15, 0.6, edge);

  vec3 color = mix(center.rgb, vec3(1.0), outline * 0.9);
  gl_FragColor = vec4(color, 1.0);
}
