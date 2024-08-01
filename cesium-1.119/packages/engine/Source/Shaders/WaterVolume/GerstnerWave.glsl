#ifndef _GerstnerWave_
#define _GerstnerWave_

struct Wave
{
  float amplitude;
  float direction;
  float wavelength;
  float speed;
  vec2  origin;
  float omni;
};

struct WaveStruct/*WaveAttrib*/
{
  vec3 position;
  vec3 normal;
  vec3 tangent;
  vec3 bitangent;
};

WaveStruct GerstnerWave(vec2 pos, float waveCountMulti, Wave wave, float steepness, float time) {
  float amplitude = max(wave.amplitude, 0.0000001);
  float direction = wave.direction;
  float wavelength = wave.wavelength;
  float speed = wave.speed;
  float omni = wave.omni;
  vec2 omniPos = wave.origin;

  WaveStruct waveOut;

  ////////////////////////////////wave value calculations//////////////////////////
  vec3 wavePos = vec3(0.0); // wave vector
  float w = 6.283185307179586 / wavelength; // frequency: 2pi over wavelength
  float S = -speed;// 0.5; // TODO: speed, in m/s unit
  float phi = S * w;// sqrt(9.8 * w); // frequency of the wave based off wavelength
  float Q = clamp(steepness, 0.0, 1.0);//0.76; // TODO:  we can leave the specification of Q as a "steepness" parameter for the production artist, allowing a range of 0 to 1
  float Qi = Q / (amplitude * w * (1.0/waveCountMulti)); // Larger values of Qi should be avoided, because they will cause loops to form above the wave crests

  // direction = radians(direction); // convert the incoming degrees to radians, for directional waves
  vec2 dirWaveInput = vec2(cos(direction), sin(direction)) * (1.0 - omni);
  vec2 omniWaveInput = (pos - omniPos) * omni;

  vec2 Di = normalize(dirWaveInput + omniWaveInput); // calculate wind direction
  float dir = dot(Di, pos - (omniPos * omni)); // calculate a gradient along the wind direction

  ////////////////////////////position output calculations/////////////////////////
  float calc = dir * w + time * phi; // the wave calculation
  float cosCalc = cos(calc); // cosine version(used for horizontal undulation)
  float sinCalc = sin(calc); // sin version(used for vertical undulation)

  // calculate the offsets for the current point
  wavePos.xy = Qi * amplitude * Di.xy * cosCalc;
  wavePos.z = (amplitude * sinCalc) * waveCountMulti;// the height is divided by the number of waves

  ////////////////////////////normal output calculations/////////////////////////
  float WA = w * amplitude;
  // normal vector
  vec3 normal = vec3(-(Di.xy * WA * cosCalc),
          1.0-(Qi * WA * sinCalc));
  normal = normalize(normal);

  vec3 tangent = vec3(
    1.0 - (Qi * Di.x*Di.x * WA * sinCalc),
    - Qi * Di.x * Di.y * WA * sinCalc,
    Di.x * WA * cosCalc
  );
  tangent = normalize(tangent);

  vec3 bitangent = vec3(
    - Qi * Di.x * Di.y * WA * sinCalc,
    1.0 - (Qi * Di.y*Di.y * WA * sinCalc),
    Di.y * WA * cosCalc
  );
  bitangent = normalize(bitangent);

  ////////////////////////////////assign to output///////////////////////////////
  waveOut.position = wavePos * clamp(amplitude * 10000.0, 0.0, 1.0);
  waveOut.normal = (normal * waveCountMulti);
  waveOut.tangent = (tangent * waveCountMulti);
  waveOut.bitangent = (bitangent * waveCountMulti);

  return waveOut;
}

#endif