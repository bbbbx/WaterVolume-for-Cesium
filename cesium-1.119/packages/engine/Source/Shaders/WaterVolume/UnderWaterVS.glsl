in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec3 tangent;
in vec3 bitangent;
in vec2 st;
in float batchId;

// #ifdef EXTRUDED_GEOMETRY
  in vec3 extrudeDirection;
  uniform float u_globeMinimumAltitude;
// #endif

// VS 输出
#ifdef TEXTURE_COORDINATES
  #ifdef SPHERICAL
    out vec4 v_sphericalExtents;
  #else
    out vec2 v_inversePlaneExtents;
    out vec4 v_westPlane;
    out vec4 v_southPlane;
  #endif

  out vec3 v_uvMinAndSphericalLongitudeRotation;
  out vec3 v_uMaxAndInverseDistance;
  out vec3 v_vMaxAndInverseDistance;
#endif
out vec3 v_positionEC;
// out vec3 v_wavePos;

void main() {
  vec4 position = czm_computePosition();

  // #ifdef EXTRUDED_GEOMETRY
  //   float delta = min(u_globeMinimumAltitude, czm_geometricToleranceOverMeter * length(position.xyz));
  //   delta *= (czm_sceneMode == czm_sceneMode3D) ? 1.0 : 0.0;

  //   // extrudeDirection is 0.0 for the top layer
  //   position += vec4(extrudeDirection * delta, 0.0);
  // #endif


  vec3 waterPos = vec3((st.xy - vec2(0.5)) * uRectangle.xy, uOffset.z);

  // shallows mask，水浅的地方波浪大，对于斜率较大的背面不太有效
  float waterDepth = WaterTextureDepth(waterPos.xy);
  // waterPos.z += pow(clamp((-waterDepth + 1.5) * 0.4, 0.0, 1.0), 2.0);

  WaveStruct wave;
  SampleWaves(waterPos.xy, clamp((waterDepth * 0.1 + 0.05), 0.0, 1.0), wave, czm_timeSinceSceneLoad);
  waterPos.xy += wave.position.xy;
#ifdef FineGranularity
  waterPos.z += wave.position.z;
#endif

  // TODO: 仅对顶部偏移
  if (all(equal(extrudeDirection, vec3(0)))) {
    // position.xyz += tangent * uOffset.x;
    // position.xyz += bitangent * uOffset.y;
    // position.xyz += normal * uOffset.z;

// FIXME: 没有 FineGranularity 时，top 和 top of wall 没有闭合
    position.xyz += tangent * wave.position.x;
    position.xyz += bitangent * wave.position.y;
    position.xyz += normal * waterPos.z;
  }



  // VS 输出
  #ifdef TEXTURE_COORDINATES

    #ifdef SPHERICAL
      // spherical
      v_sphericalExtents = czm_batchTable_sphericalExtents(batchId);
      v_uvMinAndSphericalLongitudeRotation.z = czm_batchTable_longitudeRotation(batchId);
    #else
      // planar
      #ifdef COLUMBUS_VIEW_2D
      #else
        // 3D case has smaller "plane extents," so planes encoded as a 64 bit position and 2 vec3s for distances/direction
        vec3 southWestCorner = (czm_modelViewRelativeToEye * czm_translateRelativeToEye(czm_batchTable_southWest_HIGH(batchId), czm_batchTable_southWest_LOW(batchId))).xyz;
        vec3 northWestCorner = czm_normal * czm_batchTable_northward(batchId) + southWestCorner;
        vec3 southEastCorner = czm_normal * czm_batchTable_eastward(batchId) + southWestCorner;
      #endif

      vec3 eastWard = southEastCorner - southWestCorner;
      float eastExtent = length(eastWard);
      eastWard /= eastExtent;

      vec3 northWard = northWestCorner - southWestCorner;
      float northExtent = length(northWard);
      northWard /= northExtent;

      v_westPlane = vec4(eastWard, -dot(eastWard, southWestCorner));
      v_southPlane = vec4(northWard, -dot(northWard, southWestCorner));
      v_inversePlaneExtents = vec2(1.0 / eastExtent, 1.0 / northExtent);
    #endif

    vec4 uvMinAndExtents = czm_batchTable_uvMinAndExtents(batchId);
    vec4 uMaxVmax = czm_batchTable_uMaxVmax(batchId);

    v_uMaxAndInverseDistance = vec3(uMaxVmax.xy, uvMinAndExtents.z);
    v_vMaxAndInverseDistance = vec3(uMaxVmax.zw, uvMinAndExtents.w);
    v_uvMinAndSphericalLongitudeRotation.xy = uvMinAndExtents.xy;

  #endif

  v_positionEC = (czm_modelViewRelativeToEye * position).xyz;
  gl_Position = czm_depthClamp(czm_modelViewProjectionRelativeToEye * position);
}