import BoundingRectangle from "../Core/BoundingRectangle";
import Cartesian3 from "../Core/Cartesian3";
import Matrix4 from "../Core/Matrix4";
import PixelFormat from "../Core/PixelFormat";
import defined from "../Core/defined";
import PerspectiveFrustum from "../Core/PerspectiveFrustum";
import CesiumMath from "../Core/Math";
import CubeMap from "../Renderer/CubeMap";
import DrawCommand from "../Renderer/DrawCommand";
import Framebuffer from "../Renderer/Framebuffer";
import PassState from "../Renderer/PassState";
import PixelDatatype from "../Renderer/PixelDatatype";
import RenderState from "../Renderer/RenderState";
import ShaderSource from "../Renderer/ShaderSource";
import Sampler from "../Renderer/Sampler";
import TextureMagnificationFilter from "../Renderer/TextureMagnificationFilter";
import TextureMinificationFilter from "../Renderer/TextureMinificationFilter";
import TextureWrap from "../Renderer/TextureWrap";

const CAPTURED_SKY_CUBE_MAP_RESOLUTION = 256;

function createCubeMapFaceFramebuffers(cubeMap, context) {
  const faces = [
    cubeMap.positiveX,
    cubeMap.negativeX,
    cubeMap.positiveY,
    cubeMap.negativeY,
    cubeMap.positiveZ,
    cubeMap.negativeZ,
  ];

  const framebuffers = [];
  for (const face of faces) {
    const framebuffer = new Framebuffer({
      context: context,
      colorTextures: [face],
      // depthRenderbuffer: depthRenderbuffer,
      destroyAttachments: false,
    });
    framebuffers.push(framebuffer);
  }

  return framebuffers;
}

function SkyCapture() {
  this._skyCubeMap = undefined;
  this._captureSkyFramebuffers = [];

  this._captureSkyDrawCommand = undefined;

  this._skyCaptureFaceIndex = 0;
  this._skyCaptureUniformMap = {
    faceIndex: () => this._skyCaptureFaceIndex,
  };
}

SkyCapture.prototype.update = function (frameState) {
  const context = frameState.context;

  if (!defined(this._skyCubeMap)) {
    this._skyCubeMap = new CubeMap({
      context: context,
      width: CAPTURED_SKY_CUBE_MAP_RESOLUTION,
      height: CAPTURED_SKY_CUBE_MAP_RESOLUTION,
      // R11G11B10_FLOAT
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR,
        wrapS: TextureWrap.CLAMP_TO_EDGE,
        wrapT: TextureWrap.CLAMP_TO_EDGE,
      }),
    });
    this._captureSkyFramebuffers = createCubeMapFaceFramebuffers(
      this._skyCubeMap,
      context
    );
  }

  if (!defined(this._captureSkyDrawCommand)) {
    const shaderProgram = context.shaderCache.getShaderProgram({
      vertexShaderSource: new ShaderSource({
        defines: [],
        sources: [
          /*glsl*/ `
          in vec2 position;
          in vec2 textureCoordinates;
          out vec2 vUV;
          void main() {
            gl_Position = vec4(position, 0, 1);

            vec2 uv = textureCoordinates;

            vUV = textureCoordinates;
          }
        `,
        ],
      }),
      fragmentShaderSource: new ShaderSource({
        defines: [],
        sources: [
          /*glsl*/ `
          in vec2 vUV;
          #define OutColor0 out_FragColor

          uniform float faceIndex;

          vec3 GetRayDir(vec2 st, int faceIndex)
          {
            vec2 uv = 2.0 * vec2(st.x, 1.0 - st.y) - vec2(1.0, 1.0);

            // Select vector based on cubemap face index.
            vec3 ret;
            switch (faceIndex)
            {
            case 0: ret = vec3(1.0, uv.y, -uv.x);  break;
            case 1: ret = vec3(-1.0, uv.y, uv.x);  break;
            case 2: ret = vec3(uv.x, 1.0, -uv.y);  break;
            case 3: ret = vec3(uv.x, -1.0, uv.y);  break;
            case 4: ret = vec3(uv.x, uv.y, 1.0);   break;
            case 5: ret = vec3(-uv.x, uv.y, -1.0); break;
            }
            return normalize(ret);
          }

          void main() {
            OutColor0 = vec4(vUV, faceIndex / 6.0, 1);
          #if 0
            vec3 color;
            switch (int(faceIndex))
            {
              case 0: color = vec3(1, 0, 0); break;
              case 1: color = vec3(0, 1, 1); break;
              case 2: color = vec3(0, 1, 0); break;
              case 3: color = vec3(1, 0, 1); break;
              case 4: color = vec3(0, 0, 1); break;
              case 5: color = vec3(1, 1, 0); break;
            }
            OutColor0.rgb = color;
          #endif
            // OutColor0 = vec4(dir, 1);
            // OutColor0 = vec4(vec3(luminance), 1);
          }
        `,
        ],
      }),
    });

    const renderState = RenderState.fromCache({
      cull: {
        enabled: false,
      },
      depthTest: {
        enabled: false,
      },
      depthMask: false,
      viewport: {
        x: 0,
        y: 0,
        width: CAPTURED_SKY_CUBE_MAP_RESOLUTION,
        height: CAPTURED_SKY_CUBE_MAP_RESOLUTION,
      },
    });

    this._captureSkyDrawCommand = new DrawCommand({
      vertexArray: context.getViewportQuadVertexArray(),
      uniformMap: this._skyCaptureUniformMap,
      shaderProgram: shaderProgram,
      renderState: renderState,
      modelMatrix: new Matrix4(),
    });
  }
};

const captureSkyFrustum = new PerspectiveFrustum({
  fov: CesiumMath.PI_OVER_TWO,
  aspectRatio: 1.0,
});
const passState = new PassState();

const cameraPosX = new Cartesian3();
const cameraNegX = new Cartesian3();
const cameraPosY = new Cartesian3();
const cameraNegY = new Cartesian3();
const cameraPosZ = new Cartesian3();
const cameraNegZ = new Cartesian3();
const directions = [
  cameraPosX,
  cameraNegX,
  cameraPosY,
  cameraNegY,
  cameraPosZ,
  cameraNegZ,
];
const rights = [
  cameraNegZ,
  cameraPosZ,
  cameraPosX,
  cameraPosX,
  cameraPosX,
  cameraNegX,
];
const ups = [
  cameraNegY,
  cameraNegY,
  cameraPosZ,
  cameraNegZ,
  cameraNegY,
  cameraNegY,
];

SkyCapture.prototype.executeSkyCapture = function (scene) {
  const frameState = scene.frameState;
  const environmentState = scene._environmentState;
  const camera = scene.camera;

  const originalDirection = camera.direction;
  const originalRight = camera.right;
  const originalUp = camera.up;
  const originalFrustum = camera.frustum;

  camera.direction.clone(cameraNegZ);
  camera.right.clone(cameraPosX);
  camera.up.clone(cameraPosY);
  Cartesian3.negate(cameraNegZ, cameraPosZ);
  Cartesian3.negate(cameraPosX, cameraNegX);
  Cartesian3.negate(cameraPosY, cameraNegY);

  const context = frameState.context;
  const us = context.uniformState;

  captureSkyFrustum.near = originalFrustum.near;
  captureSkyFrustum.far = originalFrustum.far;
  camera.frustum = captureSkyFrustum;
  us.updateFrustum(captureSkyFrustum);

  const skyBoxCommand = environmentState.skyBoxCommand;

  passState.context = context;
  passState.viewport = new BoundingRectangle(
    0,
    0,
    CAPTURED_SKY_CUBE_MAP_RESOLUTION,
    CAPTURED_SKY_CUBE_MAP_RESOLUTION
  );
  for (
    let faceIndex = 0;
    faceIndex < this._captureSkyFramebuffers.length;
    faceIndex++
  ) {
    passState.framebuffer = this._captureSkyFramebuffers[faceIndex];

    camera.direction = directions[faceIndex];
    camera.right = rights[faceIndex];
    camera.up = ups[faceIndex];

    us.updateCamera(camera);

    if (defined(skyBoxCommand)) {
      skyBoxCommand.execute(context, passState);
    }

    if (
      environmentState.isSkyAtmosphereVisible &&
      defined(environmentState.skyAtmosphereCommand)
    ) {
      environmentState.skyAtmosphereCommand.execute(context, passState);
    }

    this._skyCaptureFaceIndex = faceIndex;
    // this._captureSkyDrawCommand.execute(context, passState);
  }
  this._skyCubeMap.generateMipmap();

  context.uniformState.skyCaptureCubeMap = this._skyCubeMap;

  camera.direction = originalDirection;
  camera.right = originalRight;
  camera.up = originalUp;
  camera.frustum = originalFrustum;
  // us.updateCamera(camera);
};

SkyCapture.prototype.destroy = function () {
  this._skyCubeMap = this._skyCubeMap && this._skyCubeMap.destroy();
  for (let i = 0; i < this._captureSkyFramebuffers.length; i++) {
    const framebuffer = this._captureSkyFramebuffers[i];
    this._captureSkyFramebuffers[i] = framebuffer && framebuffer.destroy();
  }
};

export default SkyCapture;
