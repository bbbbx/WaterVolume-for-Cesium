#ifndef _Caustic_
#define _Caustic_

uniform sampler2D CausticMap;
uniform float uCausticBlendDistance;

// Can be done per-vertex
vec2 CausticUVs(vec2 rawUV, vec2 offset) {
  const float _Size = 0.5;
  vec4 _Time = vec4(
    czm_timeSinceSceneLoad / 20.0,
    czm_timeSinceSceneLoad,
    czm_timeSinceSceneLoad * 2.0,
    czm_timeSinceSceneLoad * 3.0
  );

  //anim
  vec2 uv = rawUV * _Size + vec2(_Time.y, _Time.x) * 0.1;
  return uv + offset * 0.25;
}

vec3 getCaustic(vec3 waterPos, float waterDepthToEye) {
  float _BlendDistance = max(1.0, uCausticBlendDistance);// 3.0;

  float waveOffset = 0.5;

  vec2 causticUV = CausticUVs(waterPos.xy, vec2(waveOffset));
  // causticUV = waterPos.xy / 30.0;

  // https://www.desmos.com/calculator/thovc7uhxp
  float _WaterLevel = uOffset.z;
  float upperMask = clamp(-waterPos.z + _WaterLevel, 0.0, 1.0);
  float lowerMask = clamp((waterPos.z - _WaterLevel) / _BlendDistance + _BlendDistance, 0.0, 1.0);

  // vec2 causticUV = fract(uv * 100.0);
  vec3 caustics = textureLod(CausticMap, causticUV, abs(waterPos.z - _WaterLevel) * 3.0 / _BlendDistance).bbb;
  // vec3 caustics = textureLod(CausticMap, causticUV, 0.0).bbb;

  caustics *= min(upperMask, lowerMask) * 2.0;
  // caustics = max(vec3(0), caustics);
  caustics.r = max(0.0, caustics.r);
  caustics.g = max(0.0, caustics.g);
  caustics.b = max(0.0, caustics.b);

  caustics = mix(caustics, vec3(0), clamp((waterDepthToEye - 10.0) / 100.0, 0.0, 1.0));

  return caustics;
}

#endif
