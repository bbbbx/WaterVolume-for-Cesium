// import * as Cesium from '../../Source/Cesium.js';
import Cartesian2 from "../Core/Cartesian2.js";
import Cartesian3 from "../Core/Cartesian3.js";
import Cartesian4 from "../Core/Cartesian4.js";
import Cartographic from "../Core/Cartographic.js";
import Matrix4 from "../Core/Matrix4.js";
import Transforms from "../Core/Transforms.js";
import CesiumMath from "../Core/Math.js";
import Resource from "../Core/Resource.js";
import buildModuleUrl from "../Core/buildModuleUrl.js";
import Rectangle from "../Core/Rectangle.js";
import defined from "../Core/defined.js";
import OrthographicOffCenterFrustum from "../Core/OrthographicOffCenterFrustum.js";
import OrientedBoundingBox from "../Core/OrientedBoundingBox.js";
import Ellipsoid from "../Core/Ellipsoid.js";
import EllipsoidGeodesic from "../Core/EllipsoidGeodesic.js";
import PolygonGeometry from "../Core/PolygonGeometry.js";
import GeometryInstance from "../Core/GeometryInstance.js";
// import GeometryAttribute from "../Core/GeometryAttribute.js";
// import ComponentDatatype from "../Core/ComponentDatatype.js";
// import PolygonHierarchy from "../Core/PolygonHierarchy.js";
import VertexFormat from "../Core/VertexFormat.js";
import ApproximateTerrainHeights from "../Core/ApproximateTerrainHeights.js";
import VerticalExaggeration from "../Core/VerticalExaggeration.js";
import defaultValue from "../Core/defaultValue.js";
import DeveloperError from "../Core/DeveloperError.js";
import RuntimeError from "../Core/RuntimeError.js";

import Pass from "../Renderer/Pass.js";
import Sampler from "../Renderer/Sampler.js";
import TextureWrap from "../Renderer/TextureWrap.js";
import TextureMinificationFilter from "../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../Renderer/TextureMagnificationFilter.js";
import Texture from "../Renderer/Texture.js";
import RenderState from "../Renderer/RenderState.js";
import ShaderSource from "../Renderer/ShaderSource.js";
import ShaderProgram from "../Renderer/ShaderProgram.js";
import DrawCommand from "../Renderer/DrawCommand.js";

import DepthFunction from "../Scene/DepthFunction.js";
import StencilFunction from "../Scene/StencilFunction.js";
import StencilOperation from "../Scene/StencilOperation.js";
import BlendingState from "../Scene/BlendingState.js";
import BlendEquation from "../Scene/BlendEquation.js";
import BlendFunction from "../Scene/BlendFunction.js";
import SceneMode from "../Scene/SceneMode.js";
import CullFace from "../Scene/CullFace.js";
import ShadowMode from "../Scene/ShadowMode.js";
import Primitive from "../Scene/Primitive.js";
import ShadowMap from "../Scene/ShadowMap.js";
import Appearance from "../Scene/Appearance.js";
import ShadowVolumeAppearance from "../Scene/ShadowVolumeAppearance.js";

import ShadowVolumeFS from "../Shaders/ShadowVolumeFS.js";

import ShadowMapCamera from "./ShadowMapCamera.js";

import Caustic from "../Shaders/WaterVolume/Caustic.js";
import Noise from "../Shaders/WaterVolume/Noise.js";
import GerstnerWave from "../Shaders/WaterVolume/GerstnerWave.js";
import SampleWaves from "../Shaders/WaterVolume/SampleWaves.js";
import WaterVertex from "../Shaders/WaterVolume/WaterVertex.js";
import WaterFragment from "../Shaders/WaterVolume/WaterFragment.js";
import SafeNormalize from "../Shaders/WaterVolume/SafeNormalize.js";
import BRDF from "../Shaders/WaterVolume/BRDF.js";
import WaterDepth from "../Shaders/WaterVolume/WaterDepth.js";
import WaterUniforms from "../Shaders/WaterVolume/WaterUniforms.js";
import UnderWaterVS from "../Shaders/WaterVolume/UnderWaterVS.js";
import UnderWaterColorPassFS from "../Shaders/WaterVolume/UnderWaterColorPassFS.js";

// import UnderWaterPrimitive from "./UnderWaterPrimitive.js";
// import createGeometryInstance from './createGeometryInstance.js';
// import getRectangle from './getRectangle.js';

let fetchAbsorptionScatteringRampImagePromise;
let fetchSurfaceMapImagePromise;
let fetchFoamImagePromise;
let absorptionScatteringRampImage, surfaceMapImage, foamImage;
let surfaceMapTexture, foamTexture;
function fetchImageResource(url) {
  return Resource.fetchImage({
    url: url,
    retryAttempts: 3,
  })
    .then((image) => image)
    .catch((error) => {
      throw new RuntimeError(`WaterVolume: failed to fetch image ${url}.`);
    });
}

const trilinearRepeatSampler = new Sampler({
  wrapS: TextureWrap.REPEAT,
  wrapT: TextureWrap.REPEAT,
  minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
  maximumAnisotropy: 16,
});
const trilinearClampSampler = new Sampler({
  wrapS: TextureWrap.CLAMP_TO_EDGE,
  wrapT: TextureWrap.CLAMP_TO_EDGE,
  minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
  maximumAnisotropy: 16,
});

/**
 * 符合 {@link Primitive} 接口的水体
 * @alias WaterVolume
 * @constructor
 *
 * @param {object} options 带有下列属性的对象
 * @param {PolygonHierarchy} options.polygonHierarchy 定义水体多边形和它的洞
 * @param {number} options.topHeight 定义水体顶部的高度
 * @param {number} [options.bottomHeight=0.0] 定义水体底部的高度
 * @param {boolean} [options.geometryWavesEnabled=true] 是否启用水体顶部几何的水波模拟。当水体顶部面积大于 1 平方千米时，为了性能，会强制不开启。
 *
 * @exception {DeveloperError} options.polygonHierarchy 是必需的。
 * @exception {DeveloperError} options.polygonHierarchy 的 position 的长度必须大于或等于 3。
 * @exception {DeveloperError} options.topHeight 是必需的。
 *
 * @example
 * const waterVolume = new WaterVolume({
 *   polygonHierarchy: polygonHierarchy,
 *   topHeight: 200.0,
 * });
 * viewer.scene.primitives.add(waterVolume);
 *
 * viewer.scene.primitives.remove(waterVolume);
 */
function WaterVolume(options) {
  if (!fetchAbsorptionScatteringRampImagePromise) {
    fetchAbsorptionScatteringRampImagePromise = fetchImageResource(
      buildModuleUrl("Assets/Textures/WaterVolume/AbsorptionScatteringRamp.png")
    ).then((_absorptionScatteringRampImage) => {
      absorptionScatteringRampImage = _absorptionScatteringRampImage;
    });
  }
  if (!fetchSurfaceMapImagePromise) {
    fetchSurfaceMapImagePromise = fetchImageResource(
      buildModuleUrl("Assets/Textures/WaterVolume/SurfaceMap.png")
    ).then((_surfaceMapImage) => {
      surfaceMapImage = _surfaceMapImage;
    });
  }
  if (!fetchFoamImagePromise) {
    fetchFoamImagePromise = fetchImageResource(
      buildModuleUrl("Assets/Textures/WaterVolume/Foam.png")
    ).then((_foamImage) => {
      foamImage = _foamImage;
    });
  }

  options = defaultValue(options, defaultValue.EMPTY_OBJECT);

  const polygonHierarchy = options.polygonHierarchy;
  const topHeight = options.topHeight;
  const bottomHeight = defaultValue(options.bottomHeight, 0.0);
  const geometryWavesEnabled = defaultValue(options.geometryWavesEnabled, true);

  //>>includeStart('debug', pragmas.debug);
  if (!defined(polygonHierarchy)) {
    throw new DeveloperError("options.polygonHierarchy are required.");
  }
  if (polygonHierarchy.positions.length < 3) {
    throw new DeveloperError(
      "the length of positions in options.polygonHierarchy must be greater than or equal 3."
    );
  }
  if (!defined(topHeight)) {
    throw new DeveloperError("options.topHeight are required.");
  }
  //>>includeEnd('debug');

  /**
   * 是否显示该水体。
   *
   * @type {boolean}
   * @default true
   */
  this.show = true;

  this._geometryWavesEnabled = geometryWavesEnabled;

  this._underWaterEnabled = true;
  this._waterBoundaryAppearance = undefined;
  this._underWaterAppearance = undefined;

  /**
   * @type {Cartesian3[]}
   * @private
   */
  // this._polygon = polygon;
  this._polygonHierarchy = polygonHierarchy;
  this._polygonRectangle = undefined;
  // this._ellipsoid = undefined;
  this._boundingVolumeNeedsUpdate = true;
  this._shadowMapCameraNeedsUpdate = true;

  // this._height = height;
  this._bottomHeight = bottomHeight;
  this._topHeight = topHeight;
  // this.height = height;

  // this._polygonGeometry = undefined;
  this._geometryInstance = undefined;
  this._primitive = undefined;

  // this._hasSphericalExtentsAttribute = undefined;
  // this._hasPlanarExtentsAttributes = undefined;

  this._frontFaceDepthPassRenderState = undefined;
  this._backFaceDepthPassRenderState = undefined;
  this._underWaterMaskPassRenderState = undefined;
  this._underWaterColorPassRenderState = undefined;

  this._underWaterMaskPassShaderProgram = undefined; // _spStencil: 没有考虑 show，_commandsIgnoreShow
  // this._pickShaderProgram = undefined; // _spStencil: 没有考虑 show，_commandsIgnoreShow
  // this._maskPassWithShowShaderProgram = undefined; // _sp：考虑了 show
  this._underWaterColorPassShaderProgram = undefined; // _spColor
  this._waterBoundaryShaderProgram = undefined;

  this._boundingVolumes = [];
  // this._boundingVolumes2D = [];

  this._uniforms = {
    depthCamZParams: new Cartesian4(0.0, 250.0, 0.0, 0.0),
    uOffset: new Cartesian4(0.0, 0.0, 0.0, this._topHeight),
    // _WaveCount: 0,
    waves_Amplitude: [],
    waves_Direction: [],
    waves_WaveLength: [],
    waves_WaveSpeed: [],
    waves_Origin: [],
    waves_Omni: [],
    uRectangle: new Cartesian4(0.0, 0.0, 0.0, 0.0),

    uMaxWaterDepth: 30.0,
    uMaxWaveHeight: 0.0,
    uSteepness: 1.0,

    // uCameraPitch: 0.0,

    _waterDepthFrustumInvProjectionMatrix: new Matrix4(),

    absorptionScatteringRampTexture: null,
    surfaceMapTexture: null,
    foamTexture: null,
    waterTransmittanceTexture: null,
    attenuationTexture: null,

    causticMap: null,

    uEyePosToWaterWorldPos: new Matrix4(),

    uCausticBlendDistance: Math.sqrt(3.0),
  };
  this._uniformMap = {
    _VeraslWater_DepthCamParams: () => this._uniforms.depthCamZParams,
    uOffset: () => this._uniforms.uOffset,
    _WaveCount: () => this._numWaves,
    waves_Amplitude: () => this._uniforms.waves_Amplitude,
    waves_Direction: () => this._uniforms.waves_Direction,
    waves_WaveLength: () => this._uniforms.waves_WaveLength,
    waves_WaveSpeed: () => this._uniforms.waves_WaveSpeed,
    waves_Origin: () => this._uniforms.waves_Origin,
    waves_Omni: () => this._uniforms.waves_Omni,

    uRectangle: () => this._uniforms.uRectangle,

    uMaxWaterDepth: () => this._uniforms.uMaxWaterDepth,
    uMaxWaveHeight: () => this._uniforms.uMaxWaveHeight,
    uSteepness: () => this._uniforms.uSteepness,

    // uCameraPitch: () => this._uniforms.uCameraPitch,

    uWaterDepthTexture: () => this._waterDepthShadowMap._shadowMapTexture,
    uWaterDepthFrustumInvProjectionMatrix: () =>
      this._uniforms._waterDepthFrustumInvProjectionMatrix,

    // MainNormalTexture: () => this._uniforms.   FoamTexture
    // SecondNormalTexture:
    AbsorptionScatteringRampTexture: () =>
      this._uniforms.absorptionScatteringRampTexture,
    SurfaceMapTexture: () => this._uniforms.surfaceMapTexture,
    FoamTexture: () => this._uniforms.foamTexture,
    // WaterTransmittanceTexture: () => this._uniforms.waterTransmittanceTexture,
    // attenuationTextureTexture: () => this._uniforms.attenuationTexture,

    // u_globeMinimumAltitude: () => 55000.0,

    // uOffset: () => this._uniforms.uOffset,
    // uRectangle: () => this._uniforms.uRectangle,
    uEyePosToWaterWorldPos: () => this._uniforms.uEyePosToWaterWorldPos,
    uCausticBlendDistance: () => this._uniforms.uCausticBlendDistance,

    CausticMap: () => this._uniforms.causticMap,
  };

  this._waveAmplitude = 0.6;
  this._waveDirection = 0.0;
  this._waveLength = 5.0;
  this._numWaves = 16;
  this._updateWavesUniform();
}

Object.defineProperties(WaterVolume.prototype, {
  /**
   * 定义水体多边形和它的洞
   *
   * @type {PolygonHierarchy}
   * @memberof WaterVolume.prototype
   * @readonly
   */
  polygonHierarchy: {
    get: function () {
      return this._polygonHierarchy;
    },
  },

  /**
   * 定义水体顶部的高度
   *
   * @type {number}
   * @memberof WaterVolume.prototype
   * @readonly
   */
  topHeight: {
    get: function () {
      return this._topHeight;
    },
  },
  /**
   * 定义水体底部的高度
   *
   * @type {number}
   * @memberof WaterVolume.prototype
   * @readonly
   */
  bottomHeight: {
    get: function () {
      return this._bottomHeight;
    },
  },

  /**
   * 水波振幅，最小为 0.01，最大为 {@link WaterVolume#waveLength} 的 1/4。
   *
   * @type {number}
   * @memberof WaterVolume.prototype
   * @default 0.6
   */
  waveAmplitude: {
    get: function () {
      return this._waveAmplitude;
    },
    set: function (value) {
      this._waveAmplitude = Number(value);
      this._updateWavesUniform();
    },
  },

  /**
   * 水波波长，最短为 3.0，最长为 20.0。
   *
   * @type {number}
   * @memberof WaterVolume.prototype
   * @default 5.0
   */
  waveLength: {
    get: function () {
      return this._waveLength;
    },
    set: function (value) {
      this._waveLength = Number(value);
      this._updateWavesUniform();
    },
  },

  /**
   * 水波移动方向，单位为角度，东为 0 度，北为 90 度。
   *
   * @type {number}
   * @memberof WaterVolume.prototype
   * @default 0.0
   */
  waveDirection: {
    get: function () {
      return this._waveDirection;
    },
    set: function (value) {
      this._waveDirection = Number(value);
      this._updateWavesUniform();
    },
  },

  /**
   * 水面顶部的偏移高度。
   *
   * @type {number}
   * @memberof WaterVolume.prototype
   * @default 0.0
   */
  topHeightOffset: {
    get: function () {
      return this._uniforms.uOffset.z;
    },
    set: function (value) {
      this._uniforms.uOffset.z = value;
      this._boundingVolumeNeedsUpdate = true;
      this._shadowMapCameraNeedsUpdate = true;
    },
  },

  /**
   * 将水体从模型转换为世界坐标的 4x4 转换矩阵。
   *
   * @type {Matrix4}
   * @memberof WaterVolume.prototype
   */
  modelMatrix: {
    get: function () {
      return this._primitive.modelMatrix;
    },
    set: function (value) {
      this._primitive.modelMatrix = value;
    },
  },

  /**
   * 是否开启水底渲染，如果不需要则可以关闭，可以节省一定的性能。
   *
   * @type {boolean}
   * @memberof WaterVolume.prototype
   * @default true
   */
  underWaterEnabled: {
    get: function () {
      return this._underWaterEnabled;
    },
    set: function (value) {
      if (value === this._underWaterEnabled) {
        return;
      }

      this._underWaterEnabled = value;
      if (this._primitive) {
        this._primitive.appearance = getWaterBoundaryAppearance(
          this._waves.length,
          this._underWaterEnabled
        );
      }
    },
  },

  /**
   * 水底焦散的可见距离。
   *
   * @type {number}
   * @memberof WaterVolume.prototype
   * @default 3.0
   */
  causticDistance: {
    get: function () {
      return Math.pow(this._uniforms.uCausticBlendDistance, 2);
    },
    set: function (value) {
      this._uniforms.uCausticBlendDistance = Math.sqrt(Number(value));
    },
  },

  /**
   * 水体的能见度。
   *
   * @type {number}
   * @memberof WaterVolume.prototype
   * @default 30.0
   */
  underWaterVisibilityDistance: {
    get: function () {
      return this._uniforms.uMaxWaterDepth;
    },
    set: function (value) {
      this._uniforms.uMaxWaterDepth = Number(value);
    },
  },

  /**
   * @private
   * @type {boolean}
   * @memberof WaterVolume.prototype
   */
  _canSubdivide: {
    get: function () {
      return this._uniforms.uRectangle.x * this._uniforms.uRectangle.y < 1e6;
    },
  },
});

WaterVolume.prototype._updateWavesUniform = function () {
  this._waveLength = CesiumMath.clamp(this._waveLength, 3.0, 20.0);
  this._waveAmplitude = CesiumMath.clamp(
    this._waveAmplitude,
    0.01,
    this._waveLength / 4.0
  );

  this._waves = generateGerstnerWaves(
    this._waveAmplitude,
    this._waveDirection,
    this._waveLength,
    this._numWaves
  );

  let maxWaveHeight = 0.0;
  for (const wave of this._waves) {
    maxWaveHeight += wave.amplitude;
  }
  maxWaveHeight /= this._waves.length;

  this._uniforms.uMaxWaveHeight = maxWaveHeight;

  for (let i = 0; i < this._numWaves; i++) {
    const wave = this._waves[i];
    this._uniforms.waves_Amplitude[i] = wave.amplitude;
    this._uniforms.waves_Direction[i] = wave.direction;
    this._uniforms.waves_WaveLength[i] = wave.wavelength;
    this._uniforms.waves_WaveSpeed[i] = wave.speed;
    this._uniforms.waves_Origin[i] = wave.origin;
    this._uniforms.waves_Omni[i] = wave.omni;
  }
};

function generateGerstnerWaves(
  medianAmplitude,
  medianDirection,
  medianWavelength,
  numWaves
) {
  const ratio = medianAmplitude / medianWavelength;

  const waves = new Array(numWaves);
  for (let i = 0; i < numWaves; i++) {
    const direction = CesiumMath.toRadians(
      medianDirection + CesiumMath.lerp(-30, 30, Math.random())
    );
    const wavelength =
      medianWavelength * CesiumMath.lerp(0.5, 2.0, Math.random());
    const speed = Math.sqrt((9.8 * 2.0 * Math.PI) / wavelength);
    const amplitude =
      ratio * CesiumMath.lerp(1.0, 1.1, Math.random()) * wavelength;

    waves[i] = {
      amplitude: amplitude,
      direction: direction,
      wavelength: wavelength,
      speed: speed,
      origin: new Cartesian2(0.0, 0.0),
      omni: Number(false),
    };
  }

  return waves;
}

function computeRectangleFromPoints(points, ellipsoid) {
  ellipsoid = ellipsoid ?? Ellipsoid.WGS84;
  let minLongitude = Rectangle.MAX_VALUE.east;
  let maxLongitude = Rectangle.MAX_VALUE.west;
  let minLatitude = Rectangle.MAX_VALUE.north;
  let maxLatitude = Rectangle.MAX_VALUE.south;
  const cartographic = new Cartographic();
  for (const point of points) {
    Cartographic.fromCartesian(point, ellipsoid, cartographic);
    minLongitude = Math.min(minLongitude, cartographic.longitude);
    maxLongitude = Math.max(maxLongitude, cartographic.longitude);
    minLatitude = Math.min(minLatitude, cartographic.latitude);
    maxLatitude = Math.max(maxLatitude, cartographic.latitude);
  }

  return new Rectangle(minLongitude, minLatitude, maxLongitude, maxLatitude);
}

function getWaterBoundaryAppearance(wavesLength, hasUnderWater) {
  return new Appearance({
    translucent: false,
    vertexShaderSource: /*glsl*/ `
      ${WaterUniforms}
      ${Noise}
      ${WaterDepth}
      ${GerstnerWave}
      #define _WaveCount ${wavesLength}
      ${SampleWaves}
      ${WaterVertex}
    `,
    fragmentShaderSource: /*glsl*/ `
      ${hasUnderWater ? "#define UnderWater" : ""}
      ${SafeNormalize}
      ${WaterUniforms}
      ${WaterDepth}
      ${GerstnerWave}
      #define _WaveCount ${wavesLength}
      ${SampleWaves}
      ${BRDF}
      ${Caustic}
      ${WaterFragment}
    `,
  });
}

function getUnderWaterAppearance(wavesLength) {
  return new Appearance({
    flat: false,
    vertexShaderSource: /*glsl*/ `
      ${GerstnerWave}
      #define _WaveCount ${wavesLength}
      #define IsUnderWater
      ${SampleWaves}
      ${WaterUniforms}
      ${WaterDepth}
      ${UnderWaterVS}
    `,
    fragmentShaderSource: /*glsl*/ `
      #define _WaveCount ${wavesLength}
      #define IsUnderWater
      ${WaterUniforms}
      ${WaterDepth}
      ${GerstnerWave}
      ${SampleWaves}
      ${Caustic}
      ${UnderWaterColorPassFS}
    `,
  });
}

function createWaterVolumeShaderProgram(
  waterVolume,
  primitive,
  frameState,
  appearance
) {
  const isFineGranularity =
    waterVolume._geometryWavesEnabled && waterVolume._canSubdivide;

  const context = frameState.context;

  let waterBoundaryVS = appearance.vertexShaderSource;
  waterBoundaryVS = primitive._batchTable.getVertexShaderCallback()(
    waterBoundaryVS
  );
  waterBoundaryVS = Primitive._appendDistanceDisplayConditionToShader(
    primitive,
    waterBoundaryVS
  );
  waterBoundaryVS = Primitive._modifyShaderPosition(
    primitive,
    waterBoundaryVS,
    /*frameState.scene3DOnly*/ true
  );
  // vs = Primitive._updateColorAttribute(primitive, vs);

  // const planarExtents = waterVolume._hasPlanarExtentsAttributes;
  // const cullFragmentsUsingExtents = planarExtents || waterVolume._hasSphericalExtentsAttribute;

  // if (waterVolume._extruded) {
  //   // vs = modifyForEncodedNormals(primitive, vs);
  // }

  // const extrudedDefine = waterVolume._extruded ? 'EXTRUDED_GEOMETRY' : '';
  // console.log(extrudedDefine);
  const waterBoundaryVSSource = new ShaderSource({
    defines: [/*extrudedDefine*/ isFineGranularity ? "FineGranularity" : ""],
    sources: [waterBoundaryVS],
  });
  const waterBoundaryFSSource = new ShaderSource({
    defines: [isFineGranularity ? "FineGranularity" : ""],
    sources: [appearance.fragmentShaderSource],
  });

  const attributeLocations = primitive._attributeLocations;
  waterVolume._waterBoundaryShaderProgram = ShaderProgram.replaceCache({
    context: context,
    shaderProgram: waterVolume._waterBoundaryShaderProgram,
    vertexShaderSource: waterBoundaryVSSource,
    fragmentShaderSource: waterBoundaryFSSource,
    attributeLocations: attributeLocations,
  });

  //
  {
    let underWaterVS = waterVolume._underWaterAppearance.vertexShaderSource;
    underWaterVS = /*underWaterPrimitive._primitive*/ primitive._batchTable.getVertexShaderCallback()(
      underWaterVS
    );
    underWaterVS = Primitive._appendDistanceDisplayConditionToShader(
      primitive,
      underWaterVS
    );
    underWaterVS = Primitive._modifyShaderPosition(
      primitive,
      underWaterVS,
      /*frameState.scene3DOnly*/ true
    );
    underWaterVS = Primitive._updateColorAttribute(primitive, underWaterVS);

    const planarExtents = true; //waterVolume._hasPlanarExtentsAttributes;
    // const cullFragmentsUsingExtents = planarExtents || waterVolume._hasSphericalExtentsAttribute;

    // if (waterVolume._extruded) {
    //   vs = modifyForEncodedNormals(primitive, vs);
    // }

    // const extrudedDefine = waterVolume._extruded ? 'EXTRUDED_GEOMETRY' : '';
    // console.log(extrudedDefine);
    const underWaterMaskPassVSSource = new ShaderSource({
      defines: [isFineGranularity ? "FineGranularity" : ""],
      sources: [underWaterVS],
    });
    const underWaterMaskPassFSSource = new ShaderSource({
      defines: [isFineGranularity ? "FineGranularity" : ""],
      sources: [ShadowVolumeFS],
    });

    // const attributeLocations = primitive._attributeLocations;

    waterVolume._underWaterMaskPassShaderProgram = ShaderProgram.replaceCache({
      context: context,
      shaderProgram: waterVolume._underWaterMaskPassShaderProgram,
      vertexShaderSource: underWaterMaskPassVSSource,
      fragmentShaderSource: underWaterMaskPassFSSource,
      attributeLocations: attributeLocations,
    });

    // underWaterPrimitive._pickShaderProgram = ShaderProgram.replaceCache({
    //   context: context,
    //   vertexShaderSource: maskPassVSSource,
    //   fragmentShaderSource: maskPassFSSource,
    //   attributeLocations: attributeLocations,
    // });

    // vs = Primitive._appendShowToShader(primitive, vs);
    // const maskPassWithShowVSSource = new ShaderSource({
    //   defines: [ extrudedDefine ],
    //   sources: [ vs ],
    // });
    // underWaterPrimitive._maskPassWithShowShaderProgram = ShaderProgram.replaceCache({
    //   context: context,
    //   shaderProgram: underWaterPrimitive._maskPassWithShowShaderProgram,
    //   vertexShaderSource: maskPassWithShowVSSource,
    //   fragmentShaderSource: maskPassFSSource,
    //   attributeLocations: attributeLocations,
    // });

    // const shadowVolumeAppearance = new ShadowVolumeAppearance(cullFragmentsUsingExtents, planarExtents, underWaterPrimitive._appearance);
    // console.log(shadowVolumeAppearance);
    // const colorPassVSSource = shadowVolumeAppearance.createVertexShader([extrudedDefine], vs, false, frameState.mapProjection);
    const underWaterColorPassVSSource = new ShaderSource({
      defines: [
        /*extrudedDefine, */ "TEXTURE_COORDINATES",
        isFineGranularity ? "FineGranularity" : "",
      ],
      sources: [underWaterVS],
    });
    const underWaterColorPassFSSource = new ShaderSource({
      defines: [
        "TEXTURE_COORDINATES",
        !planarExtents ? "SPHERICAL" : "",
        isFineGranularity ? "FineGranularity" : "",
      ],
      sources: [waterVolume._underWaterAppearance.fragmentShaderSource],
    }); // shadowVolumeAppearance.createFragmentShader(false); // ShadowVolumeAppearanceFS
    waterVolume._underWaterColorPassShaderProgram = ShaderProgram.replaceCache({
      context: context,
      shaderProgram: waterVolume._underWaterColorPassShaderProgram,
      vertexShaderSource: underWaterColorPassVSSource,
      fragmentShaderSource: underWaterColorPassFSSource,
      attributeLocations: attributeLocations,
    });
  }
}

/**
 * Called when {@link Viewer} or {@link CesiumWidget} render the scene to
 * get the draw commands needed to render this primitive.
 * <p>
 * Do not call this function directly.  This is documented just to
 * list the exceptions that may be propagated when the scene is rendered:
 * </p>
 *
 * @exception {DeveloperError} All instance geometries must have the same primitiveType.
 * @exception {DeveloperError} Appearance and material have a uniform with the same name.
 * @exception {DeveloperError} Primitive.modelMatrix is only supported in 3D mode.
 * @exception {RuntimeError} Vertex texture fetch support is required to render primitives with per-instance attributes. The maximum number of vertex texture image units must be greater than zero.
 */
WaterVolume.prototype.update = function (frameState) {
  if (
    // !mainNormalImage ||
    // !secondNormalImage ||
    !absorptionScatteringRampImage ||
    !surfaceMapImage ||
    !foamImage
    // !waterTransmittanceImage ||
    // !attenuationImage
    // !this.show
  ) {
    return;
  }

  if (frameState.mode !== SceneMode.SCENE3D) {
    return;
  }

  const context = frameState.context;
  const ellipsoid = frameState.mapProjection.ellipsoid;

  if (Cartesian4.equals(this._uniforms.uRectangle, Cartesian4.ZERO)) {
    const polygonRectangle = computeRectangleFromPoints(
      this._polygonHierarchy.positions,
      ellipsoid
    );
    this._polygonRectangle = polygonRectangle;

    const geodesic = new EllipsoidGeodesic(
      new Cartographic(
        polygonRectangle.west,
        polygonRectangle.south,
        this._topHeight
      ),
      new Cartographic(
        polygonRectangle.east,
        polygonRectangle.south,
        this._topHeight
      ),
      ellipsoid
    );
    const width = geodesic.surfaceDistance;

    geodesic.setEndPoints(
      new Cartographic(
        polygonRectangle.west,
        polygonRectangle.south,
        this._topHeight
      ),
      new Cartographic(
        polygonRectangle.west,
        polygonRectangle.north,
        this._topHeight
      )
    );
    const height = geodesic.surfaceDistance;

    this._uniforms.uRectangle.x = width;
    this._uniforms.uRectangle.y = height;
  }

  if (this._boundingVolumeNeedsUpdate) {
    const obb = OrientedBoundingBox.fromRectangle(
      this._polygonRectangle,
      this._bottomHeight,
      this._topHeight + this.topHeightOffset,
      ellipsoid
    );
    this._boundingVolumes[0] = obb;

    this._boundingVolumeNeedsUpdate = false;
  }

  if (!defined(this._uniforms.absorptionScatteringRampTexture)) {
    this._uniforms.absorptionScatteringRampTexture = new Texture({
      context: context,
      source: absorptionScatteringRampImage,
      sampler: trilinearClampSampler,
    });
    this._uniforms.absorptionScatteringRampTexture.generateMipmap();
  }
  if (!defined(surfaceMapTexture)) {
    surfaceMapTexture = new Texture({
      context: context,
      source: surfaceMapImage,
      sampler: trilinearRepeatSampler,
    });
    surfaceMapTexture.generateMipmap();
  }
  if (!defined(foamTexture)) {
    foamTexture = new Texture({
      context: context,
      source: foamImage,
      sampler: trilinearRepeatSampler,
    });
    foamTexture.generateMipmap();
  }

  this._uniforms.surfaceMapTexture = surfaceMapTexture;
  this._uniforms.causticMap = surfaceMapTexture;
  this._uniforms.foamTexture = foamTexture;

  const cellSize =
    this._geometryWavesEnabled && this._canSubdivide
      ? 2.0
      : CesiumMath.RADIANS_PER_DEGREE * ellipsoid.maximumRadius;
  if (!defined(this._geometryInstance)) {
    this._geometryInstance = createGeometryInstance(
      this._polygonHierarchy,
      this._bottomHeight,
      this._topHeight,
      frameState,
      cellSize
    );

    // 同步地创建顶点属性已经非常耗时了，不用异步的原因是我们还需要对 Cesium 创建的顶点属性进行修改
    // 下一帧再渲染
    // return;
  }

  if (!defined(this._primitive) /* || this.height !== this._height*/) {
    this._primitive = this._primitive && this._primitive.destroy();

    // const hasSphericalExtentsAttribute = ShadowVolumeAppearance.hasAttributesForSphericalExtents(this._geometryInstance.attributes);
    // const hasPlanarExtentsAttributes = ShadowVolumeAppearance.hasAttributesForTextureCoordinatePlanes(this._geometryInstance.attributes);
    // if (!hasPlanarExtentsAttributes) {
    //   debugger;
    // }

    // this._hasSphericalExtentsAttribute = hasSphericalExtentsAttribute;
    // this._hasPlanarExtentsAttributes = hasPlanarExtentsAttributes;

    this._waterBoundaryAppearance = getWaterBoundaryAppearance(
      this._waves.length,
      this._underWaterEnabled
    );
    this._underWaterAppearance = getUnderWaterAppearance(this._waves.length);

    const waterVolume = this;

    this._primitive = new Primitive({
      shadows: ShadowMode.RECEIVE_ONLY,
      releaseGeometryInstances: false,
      vertexCacheOptimize: false,
      interleave: false,
      compressVertices: false,
      geometryInstances: this._geometryInstance,
      appearance: this._waterBoundaryAppearance,
      // debugShowBoundingVolume: true,
      // asynchronous: false,

      _createShaderProgramFunction: function (
        primitive,
        frameState,
        appearance
      ) {
        createWaterVolumeShaderProgram(
          waterVolume,
          primitive,
          frameState,
          appearance
        );
      },

      _createRenderStatesFunction: (
        primitive,
        context,
        appearance,
        twoPasses
      ) => {
        waterVolume._frontFaceDepthPassRenderState = RenderState.fromCache(
          getXFaceDepthPass(CullFace.BACK)
        );
        waterVolume._backFaceDepthPassRenderState = RenderState.fromCache(
          getXFaceDepthPass(CullFace.FRONT)
        );

        const stencilEnabled = true;
        waterVolume._underWaterMaskPassRenderState = RenderState.fromCache(
          getMaskPassDepthStencilState(stencilEnabled)
        );
        waterVolume._underWaterColorPassRenderState = RenderState.fromCache(
          getColorPassDepthStencilState(stencilEnabled)
        );

        waterVolume._waterBoundaryRenderState = RenderState.fromCache({
          cull: {
            enabled: false,
          },
          depthTest: {
            enabled: true,
            func: DepthFunction.LESS_OR_EQUAL,
          },
          depthMask: true, // false,
          blending: BlendingState.DISABLED,
        });
      },
      _createCommandsFunction: (
        primitive,
        appearance,
        material,
        translucent,
        twoPasses,
        colorCommands,
        pickCommands,
        frameState
      ) => {
        const multiplier = 5;
        const commandLength = primitive._va.length * multiplier;
        colorCommands.length = commandLength;

        const uniformMap = primitive._batchTable.getUniformMapCallback()(
          this._uniformMap
        );

        let command,
          vaIndex = 0;
        for (let i = 0; i < commandLength; i += multiplier) {
          const vertexArray = primitive._va[vaIndex++];

          // Under Water Mask Pass
          command = colorCommands[i];
          if (!defined(command)) {
            command = colorCommands[i] = new DrawCommand({
              owner: waterVolume,
              primitiveType: primitive._primitiveType,
            });
          }
          command.vertexArray = vertexArray;
          command.renderState = waterVolume._underWaterMaskPassRenderState;
          command.shaderProgram = waterVolume._underWaterMaskPassShaderProgram;
          command.uniformMap = uniformMap;
          command.pass = Pass.WATER_VOLUME_UNDER_WATER;

          // Under Water Color Pass
          command = colorCommands[i + 1];
          if (!defined(command)) {
            command = colorCommands[i + 1] = new DrawCommand({
              owner: waterVolume,
              primitiveType: primitive._primitiveType,
            });
          }
          command.vertexArray = vertexArray;
          command.renderState = waterVolume._underWaterColorPassRenderState;
          command.shaderProgram = waterVolume._underWaterColorPassShaderProgram;
          command.uniformMap = uniformMap;
          command.receiveShadows = true;
          command.pass = Pass.WATER_VOLUME_UNDER_WATER;

          // Front Face Depth Pass
          command = colorCommands[i + 2];
          if (!defined(command)) {
            command = colorCommands[i + 2] = new DrawCommand({
              owner: waterVolume,
              primitiveType: primitive._primitiveType,
            });
          }
          command.vertexArray = vertexArray;
          command.renderState = waterVolume._frontFaceDepthPassRenderState;
          command.shaderProgram = waterVolume._underWaterMaskPassShaderProgram;
          command.uniformMap = uniformMap;
          command.pass = Pass.WATER_VOLUME_FRONT_FACE_DEPTH;

          // Back Face Depth Pass
          command = colorCommands[i + 3];
          if (!defined(command)) {
            command = colorCommands[i + 3] = new DrawCommand({
              owner: waterVolume,
              primitiveType: primitive._primitiveType,
            });
          }
          command.vertexArray = vertexArray;
          command.renderState = waterVolume._backFaceDepthPassRenderState;
          command.shaderProgram = waterVolume._underWaterMaskPassShaderProgram;
          command.uniformMap = uniformMap;
          command.pass = Pass.WATER_VOLUME_BACK_FACE_DEPTH;

          // if (need2DShader) { debugger; }

          // Water Boundary
          command = colorCommands[i + 4];
          if (!defined(command)) {
            command = colorCommands[i + 4] = new DrawCommand({
              owner: waterVolume,
              primitiveType: primitive._primitiveType,
            });
          }
          command.vertexArray = vertexArray;
          command.renderState = waterVolume._waterBoundaryRenderState;
          command.shaderProgram = waterVolume._waterBoundaryShaderProgram;
          command.uniformMap = uniformMap;
          command.receiveShadows = true;
          command.pass = Pass.WATER_VOLUME_BOUNDARY;
        }
      },

      // 创建 VAO 时会调用
      _createBoundingVolumeFunction: function (frameState, geometry) {
        // console.warn('_createBoundingVolumeFunction');
        const ellipsoid = frameState.mapProjection.ellipsoid;
        // const rectangle = getRectangle(frameState, geometry);
        // waterVolume._polygonRectangle;

        const obb = OrientedBoundingBox.fromRectangle(
          waterVolume._polygonRectangle,
          waterVolume._bottomHeight,
          waterVolume._topHeight + waterVolume.topHeightOffset,
          ellipsoid
        );
        waterVolume._boundingVolumes.push(obb);

        // if (!frameState.scene3DOnly) {
        //   const projection = frameState.mapProjection;
        //   const boundingVolume = Cesium.BoundingSphere.fromRectangleWithHeights2D(
        //     rectangle,
        //     projection,
        //     underWaterPrimitive._maxHeight,
        //     underWaterPrimitive._minHeight
        //   );
        //   Cartesian3.fromElements(
        //     boundingVolume.center.z,
        //     boundingVolume.center.x,
        //     boundingVolume.center.y,
        //     boundingVolume.center
        //   );

        //   underWaterPrimitive._boundingVolumes2D.push(boundingVolume);
        // }
      },

      _updateAndQueueCommandsFunction: function (
        primitive,
        frameState,
        colorCommands,
        pickCommands,
        modelMatrix,
        cull,
        debugShowBoundingVolume,
        twoPasses
      ) {
        let boundingVolumes;
        // if (frameState.mode === SceneMode.SCENE3D) {
        //   boundingVolumes = primitive._boundingSphereWC;
        // } else if (frameState.mode === SceneMode.COLUMBUS_VIEW) {
        //   boundingVolumes = primitive._boundingSphereCV;
        // } else if (
        //   frameState.mode === SceneMode.SCENE2D &&
        //   defined(primitive._boundingSphere2D)
        // ) {
        //   boundingVolumes = primitive._boundingSphere2D;
        // } else if (defined(primitive._boundingSphereMorph)) {
        //   boundingVolumes = primitive._boundingSphereMorph;
        // }
        if (frameState.mode === SceneMode.SCENE3D) {
          boundingVolumes = waterVolume._boundingVolumes;
        } else {
          // 仅支持 3D 模式。另外，Cesium 的 Primitive.modelMatrix 在非 3D 模式下只能是单位矩阵-_-||
          return;
          // boundingVolumes = waterVolume._boundingVolumes2D;
        }

        let i, boundingVolume, command;
        if (frameState.passes.render) {
          const colorCommandLength = colorCommands.length;
          for (i = 0; i < colorCommandLength; i++) {
            // 不渲染水底则跳过 0、1 command
            if (!waterVolume._underWaterEnabled) {
              if (i === 0 || i === 1) {
                continue;
              }
            }

            boundingVolume = boundingVolumes[Math.floor(i / 5)];

            command = colorCommands[i];
            updateAndQueueRenderCommand(
              waterVolume,
              command,
              frameState,
              modelMatrix,
              cull,
              boundingVolume,
              debugShowBoundingVolume
            );
          }
        }
      },
    });
  }

  const depthExtra = 4.0;
  if (!this._waterDepthShadowMap) {
    this._waterDepthShadowMapCamera = new ShadowMapCamera();
    const centerCartographic = Rectangle.center(this._polygonRectangle);
    centerCartographic.height =
      this._topHeight + this._uniforms.uOffset.z + depthExtra;
    this._waterDepthShadowMapCamera.positionWC = Cartesian3.fromRadians(
      centerCartographic.longitude,
      centerCartographic.latitude,
      centerCartographic.height,
      ellipsoid,
      this._waterDepthShadowMapCamera.positionWC
    );
    this._waterDepthShadowMapCamera.positionCartographic = Cartographic.clone(
      centerCartographic,
      this._waterDepthShadowMapCamera.positionCartographic
    );

    const transform = Transforms.eastNorthUpToFixedFrame(
      this._waterDepthShadowMapCamera.positionWC,
      ellipsoid
    );
    this._waterDepthShadowMapCamera.directionWC.x = -transform[8];
    this._waterDepthShadowMapCamera.directionWC.y = -transform[9];
    this._waterDepthShadowMapCamera.directionWC.z = -transform[10];

    this._waterDepthShadowMapCamera.rightWC.x = transform[0];
    this._waterDepthShadowMapCamera.rightWC.y = transform[1];
    this._waterDepthShadowMapCamera.rightWC.z = transform[2];

    this._waterDepthShadowMapCamera.upWC.x = transform[4];
    this._waterDepthShadowMapCamera.upWC.y = transform[5];
    this._waterDepthShadowMapCamera.upWC.z = transform[6];

    // this._waterDepthShadowMapCamera.viewMatrix = Matrix4.computeView(
    //   this._waterDepthShadowMapCamera.positionWC,
    //   this._waterDepthShadowMapCamera.directionWC,
    //   this._waterDepthShadowMapCamera.upWC,
    //   this._waterDepthShadowMapCamera.rightWC,
    //   this._waterDepthShadowMapCamera.viewMatrix
    // );
    // this._waterDepthShadowMapCamera.inverseViewMatrix = Matrix4.inverse(
    //   this._waterDepthShadowMapCamera.viewMatrix,
    //   this._waterDepthShadowMapCamera.inverseViewMatrix
    // );

    this._waterDepthShadowMapCamera.frustum = new OrthographicOffCenterFrustum({
      near: 0.01,
      // far: 200,// this._waterDepthShadowMapCamera.positionCartographic.height + 1000.0,
      left: -this._uniforms.uRectangle.x / 2,
      right: this._uniforms.uRectangle.x / 2,
      top: this._uniforms.uRectangle.y / 2,
      bottom: -this._uniforms.uRectangle.y / 2,
    });

    const shadowMapSize = 4096;
    this._waterDepthShadowMap = new ShadowMap({
      fromLightSource: false,
      context: context,
      // darkness: 1,
      // maximumDistance: 100,// 100000,// this._waterDepthShadowMapCamera.frustum.far,
      isPointLight: false,
      isSpotLight: false,
      cascadesEnabled: false,
      numberOfCascades: 1,
      size: shadowMapSize,
      // fadingEnabled: false,
      lightCamera: this._waterDepthShadowMapCamera,
    });
    // this._waterDepthShadowMap._forceUpdateEveryFrame = true;
  }

  if (this._shadowMapCameraNeedsUpdate) {
    this._waterDepthShadowMapCamera.positionCartographic.height =
      this._topHeight + this._uniforms.uOffset.z + depthExtra;
    this._waterDepthShadowMapCamera.positionWC = Cartesian3.fromRadians(
      this._waterDepthShadowMapCamera.positionCartographic.longitude,
      this._waterDepthShadowMapCamera.positionCartographic.latitude,
      this._waterDepthShadowMapCamera.positionCartographic.height,
      ellipsoid,
      this._waterDepthShadowMapCamera.positionWC
    );
    this._waterDepthShadowMapCamera.viewMatrix = Matrix4.computeView(
      this._waterDepthShadowMapCamera.positionWC,
      this._waterDepthShadowMapCamera.directionWC,
      this._waterDepthShadowMapCamera.upWC,
      this._waterDepthShadowMapCamera.rightWC,
      this._waterDepthShadowMapCamera.viewMatrix
    );
    this._waterDepthShadowMapCamera.inverseViewMatrix = Matrix4.inverse(
      this._waterDepthShadowMapCamera.viewMatrix,
      this._waterDepthShadowMapCamera.inverseViewMatrix
    );

    this._waterDepthShadowMapCamera.frustum.far = Math.max(
      10,
      this._waterDepthShadowMapCamera.positionCartographic.height
    ); // this._uniforms.uMaxWaterDepth + depthExtra;
    this._uniforms._waterDepthFrustumInvProjectionMatrix = Matrix4.inverse(
      this._waterDepthShadowMapCamera.frustum.projectionMatrix,
      this._uniforms._waterDepthFrustumInvProjectionMatrix
    );

    this._shadowMapCameraNeedsUpdate = false;
  }

  // console.log(this._waterDepthShadowMap._lightCamera.viewProjectionMatrix);
  // console.log(this._waterDepthShadowMap._shadowMapCamera.viewMatrix);
  frameState.shadowMaps.push(this._waterDepthShadowMap);

  const camera = frameState.camera;
  // this._uniforms.uCameraPitch = camera.pitch / (Math.PI / -2.0);
  this._uniforms.depthCamZParams.x = this._uniforms.uOffset.z + depthExtra;
  this._uniforms.depthCamZParams.z = depthExtra;
  this._uniforms.depthCamZParams.w =
    this._waterDepthShadowMapCamera.frustum.far -
    this._waterDepthShadowMapCamera.frustum.near;

  const centerCartographic = Rectangle.center(this._polygonRectangle);
  centerCartographic.height = this._topHeight; // + this._uniformMap.uOffset().z;
  const waterWorldPosToWorldPos = Transforms.eastNorthUpToFixedFrame(
    Cartesian3.fromRadians(
      centerCartographic.longitude,
      centerCartographic.latitude,
      centerCartographic.height
    ),
    ellipsoid
  );
  const eyePosToWorldPos = camera.inverseViewMatrix;
  const worldPosToWaterWorldPos = Matrix4.inverse(
    waterWorldPosToWorldPos,
    new Matrix4()
  );
  Matrix4.multiply(
    worldPosToWaterWorldPos,
    eyePosToWorldPos,
    this._uniforms.uEyePosToWaterWorldPos
  );

  this._primitive.show = this.show;
  this._primitive.update(frameState);
};

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <p>
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 * </p>
 *
 * @returns {boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
 *
 * @see WaterVolume#destroy
 */
WaterVolume.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys the WebGL resources held by this object.  Destroying an object allows for deterministic
 * release of WebGL resources, instead of relying on the garbage collector to destroy this object.
 * <p>
 * Once an object is destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
 * assign the return value (<code>undefined</code>) to the object as done in the example.
 * </p>
 *
 * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
 *
 *
 * @example
 * e = e && e.destroy();
 *
 * @see WaterVolume#isDestroyed
 */
WaterVolume.prototype.destroy = function () {
  this._underWaterMaskPassShaderProgram =
    this._underWaterMaskPassShaderProgram &&
    this._underWaterMaskPassShaderProgram.destroy();
  this._underWaterColorPassShaderProgram =
    this._underWaterColorPassShaderProgram &&
    this._underWaterColorPassShaderProgram.destroy();
  this._waterBoundaryShaderProgram =
    this._waterBoundaryShaderProgram &&
    this._waterBoundaryShaderProgram.destroy();
  this._uniforms.absorptionScatteringRampTexture =
    this._uniforms.absorptionScatteringRampTexture &&
    this._uniforms.absorptionScatteringRampTexture.destroy();

  this._waterDepthShadowMap =
    this._waterDepthShadowMap && this._waterDepthShadowMap.destroy();

  return this._primitive && this._primitive.destroy();
};

function updateAndQueueRenderCommand(
  waterVolume,
  command,
  frameState,
  modelMatrix,
  cull,
  boundingVolume,
  debugShowBoundingVolume
) {
  // Use derived appearance command for 2D if needed
  // const classificationPrimitive = groundPrimitive._primitive;
  // if (
  //   frameState.mode !== SceneMode.SCENE3D &&
  //   command.shaderProgram === classificationPrimitive._spColor &&
  //   classificationPrimitive._needs2DShader
  // ) {
  //   command = command.derivedCommands.appearance2D;
  // }
  if (frameState.mode !== SceneMode.SCENE3D) {
    return;
  }

  command.owner = waterVolume;
  command.modelMatrix = modelMatrix;
  command.boundingVolume = boundingVolume;
  command.cull = cull;
  command.debugShowBoundingVolume = debugShowBoundingVolume;

  frameState.commandList.push(command);
}

function getXFaceDepthPass(cullFace) {
  return {
    cull: {
      enabled: true,
      face: cullFace,
    },
    depthTest: {
      enabled: true,
      func: DepthFunction.LESS_OR_EQUAL,
    },
    depthMask: true,
  };
}

function getMaskPassDepthStencilState(enableStencil) {
  const stencilFunction = StencilFunction.ALWAYS;
  return {
    colorMask: {
      red: false,
      green: false,
      blue: false,
      alpha: false,
    },
    depthTest: {
      enabled: true,
      func: DepthFunction.LESS_OR_EQUAL,
    },
    depthMask: false,
    stencilMask: 0x0f,
    stencilTest: {
      enabled: enableStencil,
      frontFunction: stencilFunction,
      frontOperation: {
        fail: StencilOperation.KEEP,
        zFail: StencilOperation.DECREMENT_WRAP,
        zPass: StencilOperation.KEEP,
      },
      backFunction: stencilFunction,
      backOperation: {
        fail: StencilOperation.KEEP,
        zFail: StencilOperation.INCREMENT_WRAP,
        zPass: StencilOperation.KEEP,
      },
      reference: 0x80, // 随便，因为是 always
      mask: 0x80, // 随便，因为是 always
    },
  };
}

function getColorPassDepthStencilState(enableStencil) {
  const stencilFunction = StencilFunction.NOT_EQUAL;
  return {
    depthTest: {
      enabled: false,
      func: DepthFunction.LESS_OR_EQUAL,
    },
    depthMask: false,
    stencilMask: 0x0f,
    stencilTest: {
      enabled: enableStencil,
      frontFunction: stencilFunction,
      frontOperation: {
        fail: StencilOperation.ZERO,
        zFail: StencilOperation.ZERO,
        zPass: StencilOperation.ZERO,
      },
      backFunction: stencilFunction,
      backOperation: {
        fail: StencilOperation.ZERO,
        zFail: StencilOperation.ZERO,
        zPass: StencilOperation.ZERO,
      },
      reference: 0x00,
      mask: 0x0f,
    },
    // blending: BlendingState.ADDITIVE_BLEND,
    // blending: {
    //   enabled: true,
    //   equationRgb: BlendEquation.ADD,
    //   functionSourceRgb: BlendFunction.DESTINATION_COLOR,
    //   functionDestinationRgb: BlendFunction.ZERO,
    //   equationAlpha: BlendEquation.ADD,
    //   functionSourceAlpha: BlendFunction.ONE,
    //   functionDestinationAlpha: BlendFunction.ZERO,
    // }
    blending: {
      enabled: true,
      equationRgb: BlendEquation.ADD,
      functionSourceRgb: BlendFunction.ONE,
      functionDestinationRgb: BlendFunction.ZERO,
      equationAlpha: BlendEquation.ADD,
      functionSourceAlpha: BlendFunction.ONE,
      functionDestinationAlpha: BlendFunction.ZERO,
    },
  };
}

/////////////////////////////////////////////
const scratchBVCartesianHigh = new Cartesian3();
const scratchBVCartesianLow = new Cartesian3();
const scratchBVCartesian = new Cartesian3();
const scratchBVCartographic = new Cartographic();
const scratchBVRectangle = new Rectangle();

function getRectangle(ellipsoid, geometry) {
  if (
    !defined(geometry.attributes) ||
    !defined(geometry.attributes.position3DHigh)
  ) {
    if (defined(geometry.rectangle)) {
      return geometry.rectangle;
    }

    return undefined;
  }

  const highPositions = geometry.attributes.position3DHigh.values;
  const lowPositions = geometry.attributes.position3DLow.values;
  const length = highPositions.length;

  let minLat = Number.POSITIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < length; i += 3) {
    const highPosition = Cartesian3.unpack(
      highPositions,
      i,
      scratchBVCartesianHigh
    );
    const lowPosition = Cartesian3.unpack(
      lowPositions,
      i,
      scratchBVCartesianLow
    );

    const position = Cartesian3.add(
      highPosition,
      lowPosition,
      scratchBVCartesian
    );
    const cartographic = ellipsoid.cartesianToCartographic(
      position,
      scratchBVCartographic
    );

    const latitude = cartographic.latitude;
    const longitude = cartographic.longitude;

    minLat = Math.min(minLat, latitude);
    minLon = Math.min(minLon, longitude);
    maxLat = Math.max(maxLat, latitude);
    maxLon = Math.max(maxLon, longitude);
  }

  const rectangle = scratchBVRectangle;
  rectangle.north = maxLat;
  rectangle.south = minLat;
  rectangle.east = maxLon;
  rectangle.west = minLon;

  return rectangle;
}

// eslint-disable-next-line no-unused-vars
function modifyGeometryAttributesForWaterVolume(geometry, ellipsoid) {
  geometry = PolygonGeometry.createGeometry(geometry);
  // console.log(geometry);

  // const ellipsoid = geometry._ellipsoid;
  const userAttribValues = new Float32Array(
    geometry.attributes.extrudeDirection.values.length / 3
  );
  // userAttribValues.forEach((v, i) => userAttribValues[i] = 1.0);

  // TODO: 把 wall 在顶部的顶点 TBN 改为顶部的 TBN，以便在 VS displace wall 的顶部部分 pos
  // const vertexCount = geometry.attributes.position.values.length / 3;
  const position = geometry.attributes.position.values;
  const normal = geometry.attributes.normal;
  const tangent = geometry.attributes.tangent;
  const bitangent = geometry.attributes.bitangent;

  // [ ...top, ...bottom, ...top_of_wall, ...bottom_of_wall ]
  // [      0,        !0,              0,                !0 ]
  const extrudeDirection = geometry.attributes.extrudeDirection;
  const bottomIndexStart = extrudeDirection.values.findIndex((d) => d !== 0.0);
  const wallTopIndexStart =
    bottomIndexStart +
    extrudeDirection.values
      .subarray(bottomIndexStart)
      .findIndex((d) => d === 0.0);
  const wallBottomIndexStart =
    wallTopIndexStart +
    extrudeDirection.values
      .subarray(wallTopIndexStart)
      .findIndex((d) => d !== 0.0);
  const wallTopVertexOffset = wallTopIndexStart / 3;
  const wallBottomVertexOffset = wallBottomIndexStart / 3;
  // const topVertexCount = wallTopVertexOffset / 2;

  let wallTopIndex;
  let wallTopPosition = new Cartesian3();
  let wallTopNormal = new Cartesian3();
  let wallTopTangent = new Cartesian3();
  let wallTopBitangent = new Cartesian3();
  // const tangentRotationMatrix = Cesium.Matrix3.IDENTITY;
  for (let i = wallTopVertexOffset; i < wallBottomVertexOffset; i++) {
    wallTopIndex = i;
    // topIndex = Math.ceil((wallTopIndex - wallTopVertexOffset) / 2) % topVertexCount;
    // console.log(wallIndex, topIndex);

    wallTopPosition = Cartesian3.unpack(
      position,
      wallTopIndex * 3,
      wallTopPosition
    );
    wallTopNormal = ellipsoid.geodeticSurfaceNormal(
      wallTopPosition,
      wallTopNormal
    );
    wallTopTangent = Cartesian3.cross(
      Cartesian3.UNIT_Z,
      wallTopNormal,
      wallTopTangent
    );
    wallTopTangent = Cartesian3.normalize(
      wallTopTangent, //Cesium.Matrix3.multiplyByVector(tangentRotationMatrix, wallTopTangent, wallTopTangent),
      wallTopTangent
    );
    wallTopBitangent = Cartesian3.normalize(
      Cartesian3.cross(wallTopNormal, wallTopTangent, wallTopBitangent),
      wallTopBitangent
    );

    userAttribValues[wallTopIndex] = 1.0;

    normal.values[3 * wallTopIndex + 0] = wallTopNormal.x;
    normal.values[3 * wallTopIndex + 1] = wallTopNormal.y;
    normal.values[3 * wallTopIndex + 2] = wallTopNormal.z;

    tangent.values[3 * wallTopIndex + 0] = wallTopTangent.x;
    tangent.values[3 * wallTopIndex + 1] = wallTopTangent.y;
    tangent.values[3 * wallTopIndex + 2] = wallTopTangent.z;

    bitangent.values[3 * wallTopIndex + 0] = wallTopBitangent.x;
    bitangent.values[3 * wallTopIndex + 1] = wallTopBitangent.y;
    bitangent.values[3 * wallTopIndex + 2] = wallTopBitangent.z;

    // extrudeDirection.values[3 * wallTopIndex + 0] = 1.0;
    // extrudeDirection.values[3 * wallTopIndex + 1] = 1.0;
    // extrudeDirection.values[3 * wallTopIndex + 2] = 1.0;
  }

  // geometry.attributes.userAttrib = new GeometryAttribute({
  //   componentDatatype: ComponentDatatype.FLOAT,
  //   componentsPerAttribute: 1,
  //   normalize: false,
  //   values: userAttribValues,
  // });

  // console.log(geometry, bottomIndexStart, wallTopIndexStart, wallBottomIndexStart);

  return geometry;
}

function createGeometryInstance(
  polygonHierarchy,
  bottomHeight,
  topHeight,
  frameState,
  cellSize
) {
  const mapProjection = frameState.mapProjection;
  const ellipsoid = mapProjection.ellipsoid;

  const granularity =
    (cellSize / (2 * Math.PI * ellipsoid.maximumRadius)) * (Math.PI * 2.0);
  // eslint-disable-next-line prefer-const
  let geometry = new PolygonGeometry({
    polygonHierarchy: polygonHierarchy, // new PolygonHierarchy(polygon),
    ellipsoid: ellipsoid,
    granularity: granularity,
    perPositionHeight: false,
    extrudedHeight: bottomHeight,
    height: topHeight,
    vertexFormat: VertexFormat.ALL,
    shadowVolume: true,
    // closeTop: false,
    // closeBottom: true,
  });
  geometry._workerName = "createPolygonGeometryWaterVolume";

  const rectangle = getRectangle(ellipsoid, geometry);

  const result = ApproximateTerrainHeights.getMinimumMaximumHeights(
    rectangle,
    ellipsoid
  );

  const minTerrainHeight = result.minimumTerrainHeight;
  const maxTerrainHeight = result.maximumTerrainHeight;

  const exaggeration = frameState.verticalExaggeration;
  const exaggerationRelativeHeight =
    frameState.verticalExaggerationRelativeHeight;
  // eslint-disable-next-line no-unused-vars
  const minHeight = VerticalExaggeration.getHeight(
    minTerrainHeight,
    exaggeration,
    exaggerationRelativeHeight
  );
  const maxHeight = VerticalExaggeration.getHeight(
    maxTerrainHeight,
    exaggeration,
    exaggerationRelativeHeight
  );

  let newInstanceAttributes;
  // eslint-disable-next-line prefer-const
  let usePlanarExtents = true;
  // if (/*ShadowVolumeAppearance.shouldUseSphericalCoordinates(rectangle)*/false) {
  //   usePlanarExtents = false;
  // }

  if (usePlanarExtents) {
    newInstanceAttributes = ShadowVolumeAppearance.getPlanarTextureCoordinateAttributes(
      rectangle,
      geometry.textureCoordinateRotationPoints,
      ellipsoid,
      mapProjection,
      maxHeight
    );
  } else {
    newInstanceAttributes = ShadowVolumeAppearance.getSphericalExtentGeometryInstanceAttributes(
      rectangle,
      geometry.textureCoordinateRotationPoints,
      ellipsoid,
      mapProjection
    );
  }

  // geometry = PolygonGeometry.createShadowVolume(
  //   geometry,
  //   () => bottomHeight,// minHeight,//getComputeMinimumHeightFunction(this),
  //   () => topHeight// getComputeMaximumHeightFunction(this)
  // );
  // geometry._vertexFormat = VertexFormat.clone(VertexFormat.ALL);

  // const g = modifyGeometryAttributesForWaterVolume(geometry, ellipsoid);
  // const positions = Cartesian3.unpackArray(g.attributes.position.values);

  // for (let i = 4; i < positions.length; i += 1) {
  //   pc.add({
  //     position: positions[i],
  //   })
  // }

  // console.log(g);

  const geometryInstance = new GeometryInstance({
    geometry: geometry,
    attributes: newInstanceAttributes,
  });

  return geometryInstance;
}

export default WaterVolume;
