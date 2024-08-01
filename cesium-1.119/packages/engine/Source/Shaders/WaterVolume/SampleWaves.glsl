#ifndef _WaterWaves_
#define _WaterWaves_

// 因为 Cesium 不支持这种用法，¯\_(ツ)_/¯，"waves[3].origin"/"waves[1].direction" 会去掉数组后缀所有的，找 uniformMap 的 "waves"
// uniform int _WaveCount;
// const int _WaveCount = 8;
// uniform Wave waves[_WaveCount];
uniform float waves_Amplitude[_WaveCount];
uniform float waves_Direction[_WaveCount];
uniform float waves_WaveLength[_WaveCount];
uniform float waves_WaveSpeed[_WaveCount];
uniform vec2 waves_Origin[_WaveCount];
uniform float waves_Omni[_WaveCount];
uniform float uSteepness;

void SampleWaves(vec2 position, float opacity/*=0.7557617192000001*/, out WaveStruct waveOut, float time) {
  vec2 pos = position.xy;
  waveOut.position = vec3(0.0);
  waveOut.normal = vec3(0.0);
  waveOut.tangent = vec3(0.0);
  waveOut.bitangent = vec3(0.0);
  float waveCountMulti = 1.0 / float(_WaveCount);
  vec3 opacityMask = clamp(vec3(3.0, 3.0, 1.0) * opacity, 0.0, 1.0);

  for(int i = 0; i < _WaveCount/*=8*/; i++)
  {
    // Wave wave = waves[i];
    Wave wave;
    wave.amplitude = waves_Amplitude[i];
    wave.direction = waves_Direction[i];
    wave.wavelength = waves_WaveLength[i];
    wave.speed = waves_WaveSpeed[i];
    wave.origin = waves_Origin[i];
    wave.omni = waves_Omni[i];

    WaveStruct outWave = GerstnerWave(pos,
      waveCountMulti,
      wave,
      uSteepness,
      time); // calculate the wave

    waveOut.position += outWave.position; // add the position
    waveOut.normal += outWave.normal; // add the normal
    waveOut.tangent += outWave.tangent;
    waveOut.bitangent += outWave.bitangent;
  }

  waveOut.position *= opacityMask;

  waveOut.normal = normalize(waveOut.normal);
  waveOut.tangent = normalize(waveOut.tangent);
  waveOut.bitangent = normalize(waveOut.bitangent);
}

#endif
