#ifndef _WATER_FRAGMENT_
#define _WATER_FRAGMENT_

uniform sampler2D AbsorptionScatteringRampTexture;
uniform sampler2D SurfaceMapTexture;
uniform sampler2D FoamTexture;

// uniform sampler2D uWaterDepthTexture;
uniform mat4 uWaterDepthFrustumInvProjectionMatrix;
uniform mat4 uEyePosToWaterWorldPos;

// uniform vec4 uOffset;
// uniform float uMaxWaterDepth;
// uniform vec4 uRectangle;


in vec3 v_positionEC;
// in vec3 v_normalEC;
// in vec3 v_tangentEC;
// in vec3 v_bitangentEC;
in vec2 v_st;


in vec4 v_UV;
// in vec3 v_waterPos;
// in vec4 v_additionalData;

in vec3 v_normal;
in vec3 v_tangent;
in vec3 v_bitangent;

bool RayHitScreenPos(vec3 RayOrigin, vec3 RayDir, float maxDistance, out vec2 ScreenPos) {
  const int stepCount = 16;

  float stepDistance = maxDistance / float(stepCount);

  vec3 SamplePos;
  vec3 SampleScreenPos;
  for (int i = 0; i < stepCount; ++i) {
    SamplePos = RayOrigin + RayDir * ((float(i) + 0.3) * stepDistance);
    SampleScreenPos = EyePosToScreenPos(SamplePos);
    if (
      SampleScreenPos.x < 0.0 ||
      SampleScreenPos.x > 1.0 ||
      SampleScreenPos.y < 0.0 ||
      SampleScreenPos.y > 1.0
    ) { // out of screen, invalid sampling
      return false;
    }

    float BackgroundDepth = GetBackgroundDepth(SampleScreenPos.xy);
    if (BackgroundDepth == 0.0) {
      BackgroundDepth = 1.0;
    }
    vec3 BackgroundPos = ScreenPosToEyePos(vec3(SampleScreenPos.xy, BackgroundDepth));
    float Thickness = distance(SamplePos, BackgroundPos);

    float SampleDepth = SampleScreenPos.z;
    if (
      SampleDepth >= BackgroundDepth
      // && // sample is behind background and
      // Thickness <= 5.0         // make sure sample is near by background. this value is constant, other wise you can get depth of back face
    ) {
      ScreenPos = SampleScreenPos.xy;
      return true;
    }
  }

  return false;
}

void Unity_NormalStrength_float(vec3 In, float Strength, out vec3 Out)
{
  Out = vec3(In.rg * Strength, mix(1.0, In.b, clamp(Strength, 0.0, 1.0)));
}

vec3 Scattering(float depth)
{
  return textureLod(AbsorptionScatteringRampTexture, vec2(depth, 1.0 - 0.375), 0.0).rgb;
}
vec3 Absorption(float depth)
{
  return textureLod(AbsorptionScatteringRampTexture, vec2(depth, 1.0 - 0.0), 0.0).rgb;
}

// FIXME:
vec2 DistortionUV(float depth, vec3 normalEC) {
  vec3 viewNormal = mat3(czm_projection) * -normalEC;
  return viewNormal.xz * clamp(depth * 0.002, 0.0, 1.0);
}

vec3 Refraction(vec2 distortionUV/*, float depth, float maxDepthInv*/) {
  if (
    distortionUV.x < 0.0 ||
    distortionUV.x > 1.0 ||
    distortionUV.y < 0.0 ||
    distortionUV.y > 1.0
  ) {
    return vec3(0.0);
  }
  vec3 background = textureLod(czm_globeAndOpaqueColorTexture, distortionUV, 0.0).rgb;
  // vec3 background = textureLod(czm_globeAndOpaqueColorTexture, distortionUV, depth * 0.25).rgb;
  // vec3 background = texture(czm_globeAndOpaqueColorTexture, distortionUV).rgb;
  return background;// * Absorption(depth * maxDepthInv);
}

vec3 SampleRefractions(vec3 N, vec3 V, vec3 P) {
  vec3 refraction = vec3(0);

  vec3 R = refract(-V, N, 1.1);

  vec2 refractionUV;
  if (RayHitScreenPos(P, R, 100.0, refractionUV)) {
    refraction = textureLod(czm_globeAndOpaqueColorTexture, refractionUV, 0.0).rgb;
    // return vec3(1, 0, 1);
  } else {
    // reflection = textureLod(czm_skyCaptureCubeMap, reflectVector, 0.0).rgb * 0.3;
    // reflection = texture(czm_skyCaptureCubeMap, reflectVector).rgb * 0.5; // TODO: find a better value
    // refraction = czm_textureCube(czm_skyCaptureCubeMap, R, -1000.0).rgb * 0.5; // TODO: find a better value
    vec4 clipPos = czm_projection * vec4(P, 1);
    refractionUV = (clipPos.xy / clipPos.w) * 0.5 + 0.5;
    refraction = textureLod(czm_globeAndOpaqueColorTexture, refractionUV, 0.0).rgb;
    // return vec3(0, 1, 0);
  }

  return refraction;
}

float CalculateFresnelTerm(vec3 N, vec3 V) {
  return pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
}
vec3 SampleReflections(vec3 N, vec3 V, vec3 surfaceEyePos, float roughness) {
  vec3 reflection = vec3(0);
  vec2 refOffset = vec2(0);

  vec3 reflectVector = reflect(-V, N);

  vec2 ReflectUV;
  if (RayHitScreenPos(surfaceEyePos, reflectVector, 80.0, ReflectUV)) {
    reflection = textureLod(czm_globeAndOpaqueColorTexture, ReflectUV, 6.0 * roughness).rgb;
    // return vec3(1, 0, 1);
  } else {
    reflection = czm_textureCube(czm_skyCaptureCubeMap, reflectVector).rgb * 0.5;
    // return vec3(0, 1, 0);
  }

  return reflection;
}


struct WaterVertexOutput {
  vec4 uv;
  vec3 wavePos;
  vec3 waterPos;
  vec3 normal;
  vec3 normalEC;
  mat3 tangentToEyeMatrix;
  vec4 additionalData;
  vec2 fogFactorNoise;
};

vec4 WaterFragment(WaterVertexOutput IN) {
  vec2 ScreenUV = gl_FragCoord.xy / czm_viewport.zw;

  vec3 waterFrontFaceEyeCoord = GetWaterVolumesFrontFaceEyeCoord(ScreenUV);
  vec3 waterBackFaceEyeCoord = GetWaterVolumesBackFaceEyeCoord(ScreenUV);

  float waterDepthToEye = mix(
    length(waterBackFaceEyeCoord),
    length(waterBackFaceEyeCoord) - length(waterFrontFaceEyeCoord),
    float(length(waterFrontFaceEyeCoord) < length(waterBackFaceEyeCoord))
  );
#if 0
  if (length(waterFrontFaceEyeCoord) < length(waterBackFaceEyeCoord)) { // 在水体外
    waterDepthToEye = length(waterBackFaceEyeCoord) - length(waterFrontFaceEyeCoord);
    // out_FragColor = vec4(0, 1, 0, 1);
  } else { // 在水体内
    waterDepthToEye = length(waterBackFaceEyeCoord);
    // out_FragColor = vec4(1, 0, 0, 1);
  }
#endif


  vec3 depth = WaterDepth(IN.wavePos, IN.additionalData, ScreenUV.xy);// TODO - hardcoded shore depth UVs

  float depthEdge = clamp(depth.y * 20.0 + 1.0, 0.0, 1.0);
#if 0
  if (depthEdge < 1.0) {
    return vec4(1,0,1,1);
  }
#endif
  // return vec4(depthEdge);
  float depthMulti = 1.0 / uMaxWaterDepth;

  // vec4 waterFX = displace 前的

  vec3 SurfaceEyePos = v_positionEC;

  // vec3 BackgroundEyePos = GetBackgroundEyePos(ScreenUV);
  // vec3 BackgroundToSurface = SurfaceEyePos - BackgroundEyePos.xyz;
  // float UnderWaterDepth = length(BackgroundToSurface);

  float MaxDepth = uMaxWaterDepth;
  float maxDepthInv = 1.0 / MaxDepth;
  // float waterDepth = UnderWaterDepth; // FIXME:
  // float seaFloorDepth = GetSeaFloorDepth(ScreenUV, SurfaceEyePos);
  // float depthEdge = 1.0;// TODO:

  // float Alpha = clamp(UnderWaterDepth / MaxDepth, 0.0, 1.0);

  // vec2 screenUV = ScreenUV;
  // vec2 jitterUV = screenUV.xy * _ScreenParams.xy * _DitherPattern_TexelSize.xy;
  // vec3 jitterTexture = texture(DitherPattern, jitterUV).xyz * 2.0 - 1.0;
  // vec3 lightJitteredPos = IN.waterPos + jitterTexture.xyz * 2.5;
  // 用 lightJitteredPos 去采样 shadow


  vec3 V = normalize(- v_positionEC);
  vec3 L = czm_lightDirectionEC;
  vec3 N = normalize(IN.normalEC);

  // Detail waves
  vec2 detailBump1 = texture(SurfaceMapTexture, IN.uv.zw).xy * 2.0 - 1.0;
  vec2 detailBump2 = texture(SurfaceMapTexture, IN.uv.xy).xy * 2.0 - 1.0;
  vec2 detailBump = (detailBump1 + detailBump2 * 0.5) * clamp(depth.x * 0.25 + 0.25, 0.0, 1.0);

  mat3 tangentToEyeMatrix = IN.tangentToEyeMatrix;
  float _BumpScale = /*TODO:uniform*/0.1;
  N += (tangentToEyeMatrix * vec3(detailBump.x, detailBump.y, 0.0)) * _BumpScale;
  N = normalize(N);


  vec3 mainLightColor = /*NdotL **/ czm_lightColor;// TODO: 乘上大气的 transmittance
  vec3 DI = mainLightColor;

  vec3 II = vec3(0); // TODO: 从 SH 中获取
  float shadow = 1.0;

  vec3 foamMap = texture(FoamTexture, IN.uv.zw).rgb; //r=thick, g=medium, b=light
#if 1
  float waveFoam = 0.0;
  float edgeFoam = clamp(1.0 - depth.x * 0.5 - 0.25, 0.0, 1.0) * depthEdge;
  // float foamBlendMask = 1.0 - Alpha;
  float foamBlendMask = max(max(waveFoam, edgeFoam), 0.1 * 2.0);
  vec3 foamBlend = texture(AbsorptionScatteringRampTexture, vec2(foamBlendMask, 1.0 - 0.66)).rgb;
  float foamMask = clamp(length(foamMap * foamBlend) * 1.5 - 0.1 + clamp(1.0 - depth.x * /*TODO:uniform*/2.0, 0.0, 1.0) * 0.5, 0.0, 1.0);
#else
  float distortedUnderWaterDepth = length(SurfaceEyePos - GetBackgroundEyePos(distortedScreenUV).xyz);
  float foamAlpha = clamp(distortedUnderWaterDepth / MaxDepth, 0.0, 1.0);

  float foamBlendMask = 1.0 - foamAlpha;//Alpha;
  vec3 foamBlend = texture(AbsorptionScatteringRampTexture, vec2(foamBlendMask, 1.0 - 0.66)).rgb;
  float foamMask = clamp(length(foamMap * foamBlend) * 0.3 - 0.1 + clamp(1.0 - foamAlpha/*Alpha*/ * 4.0, 0.0, 1.0) * 0.5, 0.0, 1.0);
#endif


  vec2 distortion = DistortionUV(depth.x, /*IN.normal*/ /*IN.normalEC*/ N);
  distortion *= 1.0 - clamp(length(SurfaceEyePos) * 0.005, 0.0, 1.0); // TODO: 按距离远近缩放，非常重要

  vec2 distort = distortion;
// return vec4(distortion * 0.5 + 0.5, 0, 1);
  distortion = ScreenUV + distortion;
  float d = depth.x;
  depth.xz = AdjustedDepth(distortion, IN.additionalData);

#if 0
  if (depth.x == 0.0) {
    return vec4(distort,0,1);
  }
#endif
  {
    // vec3 front = GetWaterVolumesFrontFaceEyeCoord(distortion);
    // vec3 back = GetWaterVolumesBackFaceEyeCoord(distortion);
    // float frontLength = length(front);
    // float backLength = length(back);
    // return vec4(float(frontLength <= backLength));
    // return vec4(float(backLength - frontLength));
  }
// return vec4(depth.x);

  distortion = depth.x <= 0.0 ? ScreenUV : distortion;
// return vec4(distortion, 0, 1);
  depth.x = depth.x <= 0.0 ? d : depth.x;

  vec3 refraction = Refraction(distortion/*, depth.x, depthMulti*/);
  // vec3 refraction = SampleRefractions(N, V, SurfaceEyePos);
// return vec4(refraction, 1);

  // vec3 caustics = getCaustic(IN.waterPos, waterDepthToEye);
#ifndef UnderWater
  // vec3 waterPos = vec3((v_st.xy - vec2(0.5)) * uRectangle.xy, uOffset.z);
  waterBackFaceEyeCoord = GetWaterVolumesBackFaceEyeCoord(distortion);

  vec3 bgWaterPos = (uEyePosToWaterWorldPos * vec4(waterBackFaceEyeCoord.xyz, 1)).xyz;


  float waterDepth = WaterTextureDepth(bgWaterPos.xy);

  WaveStruct wave;
  SampleWaves(bgWaterPos.xy, clamp((waterDepth * 0.1 + 0.05), 0.0, 1.0), wave, czm_timeSinceSceneLoad);
  // waterPos += wave.position.xyz;
  bgWaterPos.xy += wave.position.xy;
#ifdef FineGranularity
  waterDepth += wave.position.z;
#endif

  vec3 caustics = getCaustic(bgWaterPos, waterDepth);
  refraction += caustics * 0.5;
  // return vec4(vec3(caustics),1);
  // return vec4(vec3(waterDepth/10.0),1);
  // return vec4(vec3(fract(waterPos.xy), 0),1);
#endif
  refraction *= Absorption(depth.x * depthMulti);


  vec3 sss = (DI * shadow + II);
  // 其他灯光 ...
  //   sss +=
  sss *= Scattering(depth.x * depthMulti);
// return vec4(sss, 1);
// return vec4(depth.x * depthMulti);



  float fresnelTerm = CalculateFresnelTerm(N, V);
#if 0
  return vec4(vec3(N), 1);
#endif

  BRDFData brdfData;
  InitializeBRDFData(vec3(0), 1.0, vec3(1), 0.9, 1.0, brdfData);
  vec3 spec = DirectBRDF(brdfData, N, L, V) * shadow * mainLightColor;

  vec3 reflection = SampleReflections(N, V, SurfaceEyePos, 0.0);

  reflection *= fresnelTerm;
  reflection = clamp(reflection + spec, vec3(0.0), vec3(1024.0));// * depthEdge;



#if 0
  reflection = vec3(0);
#endif
#if 0
  return vec4(reflection, 1);
#endif

#if 0
  refraction = vec3(0);
#endif
#if 0
  return vec4(refraction, 1);
#endif

#if 0
  sss = vec3(0);
#endif

#if 0
  foamMask = 0.0;
#endif

  vec3 diffuse = refraction + sss;
  vec3 foam = vec3(foamMask) * (shadow * mainLightColor + DI);
#if defined(USE_CUBE_MAP_SHADOW) || defined(USE_SHADOW_DEPTH_TEXTURE)
  // float darkness = 0.3;// shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness.w;
  // foamMask = 0.0;
  // diffuse *= darkness;
#endif

  vec3 comp = mix(reflection + diffuse, foam, foamMask);

  return vec4(comp, 1);
  // return vec4(fract(IN.uv.zw), 0, 1);
}



void main() {
#if 0
  out_FragColor = vec4(v_st, 0, 1);
  return;
#endif

  vec3 positionToEyeEC = -v_positionEC;
  // mat3 tangentToEyeMatrix = czm_tangentToEyeSpaceMatrix(v_normalEC, v_tangentEC, v_bitangentEC);

  vec3 waterPos = vec3((v_st.xy - vec2(0.5)) * uRectangle.xy, uOffset.z);

  // shallows mask，水浅的地方波浪大，对于斜率较大的背面不太有效
  float waterDepth = WaterTextureDepth(waterPos.xy);

  WaveStruct wave;
  SampleWaves(waterPos.xy, clamp((waterDepth * 0.1 + 0.05), 0.0, 1.0), wave, czm_timeSinceSceneLoad);
  waterPos.xy += wave.position.xy;
#ifdef FineGranularity
  // waterPos.z += pow(clamp((-waterDepth + 1.5) * 0.4, 0.0, 1.0), 2.0);
  waterPos.z += wave.position.z;
#endif
  // normal = wave.normal;
  float maxDistance = 250.0;
  float distanceBlend = clamp(abs(length(positionToEyeEC * (1.0/maxDistance))) - 0.25, 0.0, 1.0);
  // normal = mix(normal, vec3(0, 0, 1), distanceBlend);

  vec3 normal = normalize(v_normal);
  vec3 tangent = normalize(v_tangent);
  vec3 bitangent = normalize(v_bitangent);

  mat3 tbn = mat3(tangent, bitangent, normal);
  vec3 newNormal = tbn * wave.normal.xyz;
  vec3 newTangent = tbn * wave.tangent.xyz;
  vec3 newBitangent = tbn * wave.bitangent.xyz;

  normal = normalize(mix(newNormal, normal, distanceBlend));
  tangent = normalize(mix(newTangent, tangent, distanceBlend));
  bitangent = normalize(mix(newBitangent, bitangent, distanceBlend));

  if (czm_backFacing()) {
    normal = -normal;
    // bitangent = -bitangent;
  }

  vec3 normalEC = czm_normal * normal;
  vec3 tangentEC = czm_normal * tangent;
  vec3 bitangentEC = czm_normal * bitangent;

  mat3 tangentToEyeMatrix = czm_tangentToEyeSpaceMatrix(normalEC, tangentEC, bitangentEC);

  WaterVertexOutput IN;
  IN.uv = v_UV;
  IN.wavePos = waterPos - vec3(0, 0, uOffset.z);// wave.position;
  IN.waterPos = waterPos;//v_waterPos;
  IN.normal = normal;
  IN.normalEC = normalEC;
  IN.tangentToEyeMatrix = tangentToEyeMatrix;
  // IN.additionalData = v_additionalData;

// 网格稀疏时，插值的结果不对！
// #ifdef FineGranularity
  IN.additionalData.x = length(v_positionEC / v_positionEC.z);
  IN.additionalData.y = length(v_positionEC);
// #endif

  out_FragColor = WaterFragment(IN);

#if 0
  out_FragColor.rgb = normalEC;
#endif

#if 0
  out_FragColor.rgb = vec3(GetBackgroundDepth(gl_FragCoord.xy / czm_viewport.zw));
  if (out_FragColor.r == 0.0 && out_FragColor.g == 0.0 && out_FragColor.b == 0.0) {
    out_FragColor.rgb = vec3(1,0,1);
  }
#endif

#if 0
  {
    vec2 waterDepthUV = waterPos.xy / (uRectangle.xy / 2.0) * 0.5 + 0.5;
    float depth = texture(uWaterDepthTexture,  waterDepthUV).r;
    // out_FragColor.rgb = vec3(depth);
    // return;
    // out_FragColor.rgb = vec3(waterDepthUV, 0);


    vec4 NDC = vec4(vec3(waterDepthUV, depth) * 2.0 - 1.0, 1.0);
    vec4 viewPos = uWaterDepthFrustumInvProjectionMatrix * NDC;
    viewPos /= viewPos.w;

    float waterHeight = uOffset.z + uOffset.w + waterPos.z;
    float backgroundHeight = (uOffset.z + uOffset.w + 100.0) - (-viewPos.z);

    float waterDepth = waterHeight - backgroundHeight;
    // out_FragColor.rgb = vec3(waterDepth / 30.0);
    // out_FragColor.rgb = vec3((-viewPos.z - 100.0) / 100.0);
  }
#endif

// #ifdef FLAT
//   out_FragColor = vec4(material.diffuse + material.emission, material.alpha);
// #else
//   out_FragColor = czm_phong(normalize(positionToEyeEC), material, czm_lightDirectionEC);
// #endif
}

#endif
