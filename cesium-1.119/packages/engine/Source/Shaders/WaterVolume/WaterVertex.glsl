#ifndef _WaterVertex_
#define _WaterVertex_

// -------------------------
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec3 tangent;
in vec3 bitangent;
in vec2 st;
in float batchId;

in vec3 extrudeDirection;


out vec3 v_positionEC;
out vec3 v_normalEC;
out vec3 v_tangentEC;
out vec3 v_bitangentEC;
out vec2 v_st;
// -------------------------

out vec4 v_UV;
// out vec3 v_waterPos;
// out vec3 v_normal;
out vec2 v_fogFactorNoise; // x: fogFactor, y: noise
// out vec4 v_additionalData;

out vec3 v_normal;
out vec3 v_tangent;
out vec3 v_bitangent;

void main()
{

  float time = czm_timeSinceSceneLoad;

  vec3 waterPos = vec3((st.xy - vec2(0.5)) * uRectangle.xy, uOffset.z);
  // v_UV.xy = st; // geometry UVs

  // v_normal = vec3(0, 0, 1);

  v_fogFactorNoise.y = ((noise(waterPos.xy * 0.5 + time) + noise(waterPos.xy * 1.0 + time)) * 0.25 - 0.5) + 1.0;

  // Detail UVs
  v_UV.zw = waterPos.xy * 0.1 + time * 0.05 + (v_fogFactorNoise.y * 0.1);
  v_UV.xy = waterPos.xy * 0.4 - vec2(time) * 0.1 + (v_fogFactorNoise.y * 0.2);

  // shallows mask，水浅的地方波浪大，对于斜率较大的背面不太有效
  float waterDepth = WaterTextureDepth(waterPos.xy);

  WaveStruct wave;
  SampleWaves(waterPos.xy, clamp((waterDepth * 0.1 + 0.05), 0.0, 1.0), wave, czm_timeSinceSceneLoad);
  waterPos.xy += wave.position.xy;
#ifdef FineGranularity
  waterPos.z += wave.position.z;
#endif

  vec4 positionRelativeToEye = czm_computePosition();

  // 仅对顶部偏移
  float isTopVertex = float(all(equal(extrudeDirection, vec3(0))));
  positionRelativeToEye.xyz += tangent * wave.position.x * isTopVertex;
  positionRelativeToEye.xyz += bitangent * wave.position.y * isTopVertex;
  positionRelativeToEye.xyz += normal * waterPos.z * isTopVertex; // wave.position.z;

  // v_waterPos = waterPos;

  mat3 tbn = mat3(tangent, bitangent, normal);
  vec3 newNormal = tbn * wave.normal.xyz;
  vec3 newTangent = tbn * wave.tangent.xyz;
  vec3 newBitangent = tbn * wave.bitangent.xyz;

  const float maxDistance = 250.0;
  float distanceBlend = clamp(abs(length(positionRelativeToEye * (1.0/maxDistance))) - 0.25, 0.0, 1.0);
  // v_normal = mix(v_normal, vec3(0, 0, 1), distanceBlend);
  newNormal = mix(newNormal, normal, distanceBlend);
  newTangent = mix(newTangent, tangent, distanceBlend);
  newBitangent = mix(newBitangent, bitangent, distanceBlend);

  newNormal = normalize(newNormal);
  newTangent = normalize(newTangent);
  newBitangent = normalize(newBitangent);

  v_normal = normal;
  v_tangent = tangent;
  v_bitangent = bitangent;

  v_positionEC = (czm_modelViewRelativeToEye * positionRelativeToEye).xyz;      // position in eye coordinates
  v_normalEC = czm_normal * newNormal;                         // normal in eye coordinates
  v_tangentEC = czm_normal * newTangent;                       // tangent in eye coordinates
  v_bitangentEC = czm_normal * newBitangent;                   // bitangent in eye coordinates
  v_st = st;

  // 网格稀疏时，插值的结果不对！
  // v_additionalData.x = length(v_positionEC / v_positionEC.z);
  // v_additionalData.y = length(v_positionEC);
  // v_additionalData.z = wave.position.z / uMaxWaveHeight;
  // v_additionalData.w = wave.position.x + wave.position.y;

  // vec4 worldPos = czm_inverseView * vec4(v_positionEC.xyz, 1);
  gl_Position = czm_modelViewProjectionRelativeToEye * positionRelativeToEye;
  // gl_Position = czm_viewProjection * worldPos;
}

#endif
