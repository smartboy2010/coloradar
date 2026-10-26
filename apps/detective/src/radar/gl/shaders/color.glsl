// sRGB decode/encode
float srgbDecode(float c) {
  return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}

float srgbEncode(float c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

vec3 srgbToLinear(vec3 c) {
  return vec3(srgbDecode(c.r), srgbDecode(c.g), srgbDecode(c.b));
}

vec3 linearToSrgb(vec3 c) {
  return vec3(srgbEncode(c.r), srgbEncode(c.g), srgbEncode(c.b));
}

// OKLab conversion matrices (Björn Ottosson)
// M1: linear sRGB → LMS
const mat3 M1 = mat3(
  0.4122214708, 0.2119034982, 0.0883024619,
  0.5363325363, 0.6806995451, 0.2817188376,
  0.0514459929, 0.1073969566, 0.6299787005
);

// M2: LMS^(1/3) → Lab
const mat3 M2 = mat3(
  0.2104542553,  1.9779984951,  0.0259040371,
  0.7936177850, -2.4285922050,  0.7827717662,
 -0.0040720468,  0.4505937099, -0.8086757660
);

// Inverse M2
const mat3 M2_INV = mat3(
  1.0,  1.0,  1.0,
  0.3963377774, -0.1055613458, -0.0894841775,
  0.2158037573, -0.0638541728, -1.2914855480
);

// Inverse M1
const mat3 M1_INV = mat3(
  4.0767416621, -1.2684380046, -0.0041960863,
 -3.3077115913,  2.6097574011, -0.7034186147,
  0.2309699292, -0.3413193965,  1.7076147010
);

vec3 linearRgbToOklab(vec3 rgb) {
  vec3 lms = M1 * rgb;
  lms = vec3(
    sign(lms.x) * pow(abs(lms.x), 1.0 / 3.0),
    sign(lms.y) * pow(abs(lms.y), 1.0 / 3.0),
    sign(lms.z) * pow(abs(lms.z), 1.0 / 3.0)
  );
  return M2 * lms;
}

vec3 oklabToLinearRgb(vec3 lab) {
  vec3 lms = M2_INV * lab;
  lms = lms * lms * lms;
  return M1_INV * lms;
}

vec3 oklabToOklch(vec3 lab) {
  float C = length(lab.yz);
  float h = atan(lab.z, lab.y);
  return vec3(lab.x, C, h);
}
