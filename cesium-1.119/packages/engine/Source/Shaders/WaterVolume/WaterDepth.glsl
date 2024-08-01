#ifndef _WaterDepth_
#define _WaterDepth_

uniform sampler2D uWaterDepthTexture;
uniform vec4 _VeraslWater_DepthCamParams;

vec3 EyePosToScreenPos(vec3 EyePos) {
  vec4 ClipPos = czm_projection * vec4(EyePos, 1.0);
  ClipPos /= ClipPos.w;
  return ClipPos.xyz * 0.5 + 0.5;
}
vec3 ScreenPosToEyePos(vec3 ScreenPos) {
  vec4 EyePos = czm_inverseProjection * vec4(ScreenPos * 2.0 - 1.0, 1.0);
  EyePos /= EyePos.w;
  return EyePos.xyz;
}

float GetWaterVolumesFrontFaceLinearDepth(vec2 screenUV) {
  float logDepthOrNot = texture(czm_waterVolumesFrontFaceDepthTexture, screenUV).r;
#ifdef LOG_DEPTH
  if (logDepthOrNot == 0.0) return 1.0;
#endif

  float linearDepth = czm_reverseLogDepth(logDepthOrNot);
  return linearDepth;
}

float GetWaterVolumesBackFaceLinearDepth(vec2 screenUV) {
  float logDepthOrNot = texture(czm_waterVolumesBackFaceDepthTexture, screenUV).r;
#ifdef LOG_DEPTH
  if (logDepthOrNot == 0.0) return 1.0;
#endif

  float linearDepth = czm_reverseLogDepth(logDepthOrNot);
  return linearDepth;
}

vec3 GetWaterVolumesFrontFaceEyeCoord(vec2 screenUV) {
  float logDepthOrDepth = texture(czm_waterVolumesFrontFaceDepthTexture, screenUV).r;
  vec4 eyeCoordinate = czm_windowToEyeCoordinates(/*gl_FragCoord.xy*/czm_viewport.zw * screenUV + czm_viewport.xy, logDepthOrDepth);
  // vec4 eyeCoordinate = czm_screenToEyeCoordinates(screenUV, logDepthOrDepth);
  return eyeCoordinate.xyz / eyeCoordinate.w;
}

vec3 GetWaterVolumesBackFaceEyeCoord(vec2 screenUV) {
  float logDepthOrDepth = texture(czm_waterVolumesBackFaceDepthTexture, screenUV).r;
  vec4 eyeCoordinate = czm_windowToEyeCoordinates(/*gl_FragCoord.xy*/czm_viewport.zw * screenUV + czm_viewport.xy, logDepthOrDepth);
  // vec4 eyeCoordinate = czm_screenToEyeCoordinates(screenUV, logDepthOrDepth);
  return eyeCoordinate.xyz / eyeCoordinate.w;
}

float GetBackgroundDepth(vec2 ScreenUV) {
  vec4 BackgroundPackedDepth = texture(czm_globeAndOpaquePackedDepthTexture, ScreenUV);
  float BackgroundLogDepth = czm_unpackDepth(BackgroundPackedDepth);
  if (BackgroundLogDepth == 0.0) return 0.0;

  float BackgroundLinearDepth = czm_reverseLogDepth(BackgroundLogDepth);
  return BackgroundLinearDepth;
}

vec3 GetBackgroundEyePos(vec2 ScreenUV) {
  float BackgroundLinearDepth = GetBackgroundDepth(ScreenUV);
  if (BackgroundLinearDepth == 0.0) {
    BackgroundLinearDepth = 1.0;
  }

  vec4 BackgroundEyePos = czm_inverseProjection * vec4(ScreenUV * 2.0 - 1.0, BackgroundLinearDepth * 2.0 - 1.0, 1.0);
  BackgroundEyePos /= BackgroundEyePos.w;
  return BackgroundEyePos.xyz;
}

float getWaterLength(vec2 ScreenUV) {
  vec3 waterFrontFaceEyeCoord = GetWaterVolumesFrontFaceEyeCoord(ScreenUV);
  vec3 waterBackFaceEyeCoord = GetWaterVolumesBackFaceEyeCoord(ScreenUV);

  float waterLength = mix(
    length(waterBackFaceEyeCoord),
    length(waterBackFaceEyeCoord) - length(waterFrontFaceEyeCoord),
    float(length(waterFrontFaceEyeCoord) < length(waterBackFaceEyeCoord))
  );
  return waterLength;

}

// x: water depth to eye
vec2 AdjustedDepth(vec2 ScreenUV, vec4 additionalData) { 
#ifdef IsUnderWater
  return vec2(getWaterLength(ScreenUV), 0.0);
#endif

#ifdef FineGranularity
#else
  // FIXME: 顶部应该单独处理，不渲染背面？否则平视时水的距离非常短，那水底怎么办？

  // 当没有 displace 时，顶部不会有起伏，可以这样计算
  // vec3 waterFrontFaceEyeCoord = GetWaterVolumesFrontFaceEyeCoord(ScreenUV);
  // vec3 waterBackFaceEyeCoord = GetWaterVolumesBackFaceEyeCoord(ScreenUV);

  // float waterDepthToEye = mix(
  //   length(waterBackFaceEyeCoord),
  //   length(waterBackFaceEyeCoord) - length(waterFrontFaceEyeCoord),
  //   float(length(waterFrontFaceEyeCoord) < length(waterBackFaceEyeCoord))
  // );
  // return vec2(waterDepthToEye, 0);
#endif

  float BackgroundLinearDepth = GetBackgroundDepth(ScreenUV);
  if (BackgroundLinearDepth == 0.0) {
    // BackgroundLinearDepth = 1.0;
    // return vec2(additionalData.y, 0);

    vec3 waterBackFaceEyeCoord = GetWaterVolumesBackFaceEyeCoord(ScreenUV);
    return vec2(length(waterBackFaceEyeCoord), 0);
  }

  vec4 BackgroundEyePos = czm_inverseProjection * vec4(ScreenUV * 2.0 - 1.0, BackgroundLinearDepth * 2.0 - 1.0, 1.0);
  // vec4 BackgroundEyePos = czm_windowToEyeCoordinates(/*gl_FragCoord.xy*/czm_viewport.zw * ScreenUV + czm_viewport.xy, BackgroundLinearDepth);

  BackgroundEyePos /= BackgroundEyePos.w;

  float d = -BackgroundEyePos.z;
  return vec2(d * additionalData.x - additionalData.y, BackgroundLinearDepth + 1.0);
}

float getWaterDepth(vec2 waterUV) {
  float z = texture(uWaterDepthTexture, waterUV + 0.5).r;
  float waterCameraZ = z * _VeraslWater_DepthCamParams.w;
  float waterDepth = waterCameraZ - _VeraslWater_DepthCamParams.z;

  // waterDepth += waveHeight;

  waterDepth = max(0.0, waterDepth);
  return waterDepth;


  // return max(0.0, texture(uWaterDepthTexture, waterPos.xy / uRectangle.xy + 0.5).r * (_VeraslWater_DepthCamParams.w) - _VeraslWater_DepthCamParams.z);

}

/* 获取水面到水底的高度，不包括波浪的高度！ */
float WaterTextureDepth(vec2 waterPos) {
  // WaterDepthMap 的相机比水面的 transform 高 4 米
  // float depthExtra = 4.0;
  // vec4 _VeraslWater_DepthCamParams = vec4(uOffset.z + depthExtra, 250.0, 0.0, 0.0);
  // 
  // return (1.0 - textureLod(uWaterDepthTexture, posWS.xy * 0.002/*因为orthographicSize250！*/ + 0.5, 0.0).r /*waterDepthMap at lod 1*/) * (uMaxWaterDepth + _VeraslWater_DepthCamParams.x) - _VeraslWater_DepthCamParams.x;
  // return (1.0 - textureLod(uWaterDepthTexture, posWS.xy / uRectangle.xy + 0.5, 0.0).r /*waterDepthMap at lod 1*/) * (uMaxWaterDepth + _VeraslWater_DepthCamParams.x) - _VeraslWater_DepthCamParams.x;
  return max(0.0, texture(uWaterDepthTexture, waterPos.xy / uRectangle.xy + 0.5).r * (_VeraslWater_DepthCamParams.w) - _VeraslWater_DepthCamParams.z);
}

vec3 WaterDepth(vec3 wavePos, vec4 additionalData, vec2 screenUV) {
  vec3 outDepth = vec3(0.0);
  outDepth.xz = AdjustedDepth(screenUV, additionalData);
  float wd = WaterTextureDepth(wavePos.xy);
#ifdef FineGranularity
  wd += wavePos.z;
#endif
  outDepth.y = wd;
  return outDepth;
}

#endif