#ifdef TEXTURE_COORDINATES
  #ifdef SPHERICAL
    in vec4 v_sphericalExtents;
  #else
    in vec2 v_inversePlaneExtents;
    in vec4 v_westPlane;
    in vec4 v_southPlane;
  #endif

  in vec3 v_uvMinAndSphericalLongitudeRotation;
  in vec3 v_uMaxAndInverseDistance;
  in vec3 v_vMaxAndInverseDistance;
#endif
in vec3 v_positionEC;
// in vec3 v_wavePos;


uniform sampler2D AbsorptionScatteringRampTexture;
// uniform sampler2D WaterTransmittanceTexture;
// uniform sampler2D attenuationTextureTexture;

uniform mat4 uEyePosToWaterWorldPos;

// uniform sampler2D CausticMap;
// uniform float uCausticBlendDistance;


vec3 Scattering(float depth) {
  return textureLod(AbsorptionScatteringRampTexture, vec2(depth, 1.0 - 0.375), 0.0).rgb;
}

vec3 Absorption(float depth) {
  return textureLod(AbsorptionScatteringRampTexture, vec2(depth, 1.0 - 0.0), 0.0).rgb;
}

// // Can be done per-vertex
// vec2 CausticUVs(vec2 rawUV, vec2 offset) {
//   const float _Size = 0.5;
//   vec4 _Time = vec4(
//     czm_realTimeSinceSceneLoad / 20.0,
//     czm_realTimeSinceSceneLoad,
//     czm_realTimeSinceSceneLoad * 2.0,
//     czm_realTimeSinceSceneLoad * 3.0
//   );

//   //anim
//   vec2 uv = rawUV * _Size + vec2(_Time.y, _Time.x) * 0.1;
//   return uv + offset * 0.25;
// }

// vec3 getTransmittance(float cosTheta, float waterDepth) {
//   const float maxDepthLightCanPass = 512.0;
//   vec2 UV = vec2(cosTheta * 0.5 + 0.5, pow(waterDepth / maxDepthLightCanPass, 3.0));
//   return textureLod(WaterTransmittanceTexture, UV, 0.0).rgb;
// }

// vec3 getAttenuation(float depth) {
//   vec3 attenuation = textureLod(attenuationTextureTexture, vec2(depth / 512.0, 0.0), 0.0).rgb;
//   return attenuation;
//   // return exp(-attenuation * depth);
// }

float RayleighPhase(float CosTheta) {
  float Factor = 3.0 / (16.0 * 3.141592653589793);
  return Factor * (1.0 + CosTheta * CosTheta);
}

void main() {

  vec2 screenUV = (gl_FragCoord.xy - czm_viewport.xy) / czm_viewport.zw;


  float logDepthOrDepth = czm_unpackDepth(texture(czm_globeAndOpaquePackedDepthTexture, screenUV));
  vec4 eyeCoordinate = czm_windowToEyeCoordinates(gl_FragCoord.xy, logDepthOrDepth);
  eyeCoordinate /= eyeCoordinate.w;

  // #ifdef TEXTURE_COORDINATES
  //   vec2 uv;
  //   #ifdef SPHERICAL
  //     不要用SPHERICAL
  //     vec4 worldCoordinate4 = czm_inverseView * eyeCoordinate;
  //     vec3 worldCoordinate = worldCoordinate4.xyz / worldCoordinate4.w;
  //     vec2 sphericalLatLong = czm_approximateSphericalCoordinates(worldCoordinate);
  //     sphericalLatLong.y += v_uvMinAndSphericalLongitudeRotation.z;
  //     sphericalLatLong.y = czm_branchFreeTernary(sphericalLatLong.y < czm_pi, sphericalLatLong.y, sphericalLatLong.y - czm_twoPi);
  //     uv.x = (sphericalLatLong.y - v_sphericalExtents.y) * v_sphericalExtents.w;
  //     uv.y = (sphericalLatLong.x - v_sphericalExtents.x) * v_sphericalExtents.z;
  //   #else
  //     // Unpack planes and transform to eye space
  //     uv.x = czm_planeDistance(v_westPlane, eyeCoordinate.xyz) * v_inversePlaneExtents.x;
  //     uv.y = czm_planeDistance(v_southPlane, eyeCoordinate.xyz) * v_inversePlaneExtents.y;
  //   #endif
  // #endif

  // if (uv.x <= 0.0 || 1.0 <= uv.x || uv.y <= 0.0 || 1.0 <= uv.y || logDepthOrDepth == 0.0) {
  //   discard;
  // }

  // // Remap texture coordinates from computed (approximately aligned with cartographic space) to the desired
  // // texture coordinate system, which typically forms a tight oriented bounding box around the geometry.
  // // Shader is provided a set of reference points for remapping.
  // uv.x = czm_lineDistance(v_uvMinAndSphericalLongitudeRotation.xy, v_uMaxAndInverseDistance.xy, uv) * v_uMaxAndInverseDistance.z;
  // uv.y = czm_lineDistance(v_uvMinAndSphericalLongitudeRotation.xy, v_vMaxAndInverseDistance.xy, uv) * v_vMaxAndInverseDistance.z;


  vec3 waterFrontFaceEyeCoord = GetWaterVolumesFrontFaceEyeCoord(screenUV);
  vec3 waterBackFaceEyeCoord = GetWaterVolumesBackFaceEyeCoord(screenUV);
  float backFaceDistance = length(waterBackFaceEyeCoord);
  float frontFaceDistance = length(waterFrontFaceEyeCoord);

#define _Debug_WaterDepthToEye 0
  float waterDepthToEye;
  if (backFaceDistance > frontFaceDistance) { // 在水体外
    waterDepthToEye = backFaceDistance - frontFaceDistance;
  #if _Debug_WaterDepthToEye
    out_FragColor = vec4(0, 1, 0, 1);
  #endif
  } else { // 在水体内
    waterDepthToEye = backFaceDistance;
  #if _Debug_WaterDepthToEye
    out_FragColor = vec4(1, 0, 0, 1);
  #endif
  }
#if _Debug_WaterDepthToEye
  return;
#endif

  vec3 sceneColor = textureLod(czm_globeAndOpaqueColorTexture, screenUV, 0.0).rgb;

  vec3 waterPos = (uEyePosToWaterWorldPos * vec4(eyeCoordinate.xyz, 1)).xyz;
  // worldPos.z += uOffset.z;

  // vec3 worldPos = vec3((uv - vec2(0.5)) * uRectangle.xy, 0.0);
  float waterDepth = WaterTextureDepth(waterPos.xy);

  WaveStruct wave;
  SampleWaves(waterPos.xy, clamp((waterDepth * 0.1 + 0.05), 0.0, 1.0), wave, czm_timeSinceSceneLoad);
  // worldPos += wave.position.xyz;
  // worldPos.xy += wave.position.xy;
  waterDepth += wave.position.z;

  vec3 caustics = getCaustic(waterPos, /*waterDepthToEye*/waterDepth);


#if defined(USE_CUBE_MAP_SHADOW) || defined(USE_SHADOW_DEPTH_TEXTURE)
  // float darkness = shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness.w;
  // caustics = vec3(0.0);
  // lightColor = vec3(0.0);
  // out_FragColor = vec4(1, 0, 1, 1);
  // return;
#endif
  vec3 lightColor = vec3(1) + caustics;

  // vec3 L = vec3(0.0);
  // vec3 opticalDepth = vec3(0.0);
  // vec3 transmittance = vec3(1.0);

  // const float sampleDistanceMax = 512.0;
  float tMax = min(waterDepthToEye, 512.0);
  // const float sampleCountMin = 4.0;
  // const float sampleCountMax = 32.0;
// #if __VERSION__ == 300
//   float sampleCount = mix(sampleCountMin, sampleCountMax, clamp(tMax / sampleDistanceMax, 0.0, 1.0));
// #else
//   const float sampleCount = sampleCountMax;
// #endif
  // float dt = tMax / sampleCount;
  // float t = 0.0;
  // float pixelNoise = 0.3;
  // vec3 viewDir = normalize(-eyeCoordinate.xyz);
  // vec3 V = -viewDir;

  // vec3 waterLocalPos = waterPos;// (uEyePosToWaterWorldPos * vec4(v_positionEC, 1)).xyz;
  // float waterDepth = -waterLocalPos.z + uOffset.z;
  vec3 lightAbsorption = Absorption(tMax / (uMaxWaterDepth * 3.0));
  // vec3 bgAttenuation = getAttenuation(tMax);
  vec3 sss = Scattering(tMax / (uMaxWaterDepth * 3.0));
  vec3 finalColor = (sceneColor * lightAbsorption * lightColor + sss);// * bgAttenuation;
  out_FragColor = vec4(finalColor, 1);

}