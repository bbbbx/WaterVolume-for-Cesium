import BoundingRectangle from "../Core/BoundingRectangle.js";
import PixelFormat from "../Core/PixelFormat.js";
import defined from "../Core/defined.js";
import FramebufferManager from "../Renderer/FramebufferManager.js";
import Pass from "../Renderer/Pass.js";
import PassState from "../Renderer/PassState.js";
import PixelDatatype from "../Renderer/PixelDatatype.js";
import RenderState from "../Renderer/RenderState.js";
// import Sampler from "../Renderer/Sampler.js";
// import TextureMagnificationFilter from "../Renderer/TextureMagnificationFilter.js";
// import TextureMinificationFilter from "../Renderer/TextureMinificationFilter.js";
// import TextureWrap from "../Renderer/TextureWrap.js";
import DepthFunction from "../Scene/DepthFunction.js";

function createDebugCommand(
  context,
  colorTexture,
  packedDepthTexture,
  frontFaceDepthTexture,
  backFaceDepthTexture
) {
  const fs = /*glsl*/ `
    uniform sampler2D colorTexture;
    uniform sampler2D packedDepthTexture;
    uniform sampler2D frontFaceDepthTexture;
    uniform sampler2D backFaceDepthTexture;
    in vec2 v_textureCoordinates;
    void main()
    {
      vec2 screenUV = v_textureCoordinates;

      if (screenUV.x < 0.5) {
        out_FragColor = screenUV.y > 0.5
          ? textureLod(colorTexture,       vec2(screenUV.x, screenUV.y - 0.5) * 2.0, 0.0)
          : textureLod(packedDepthTexture, vec2(screenUV.x, screenUV.y) * 2.0, 0.0);
      } else {
        out_FragColor = screenUV.y > 0.5
          ? textureLod(frontFaceDepthTexture, vec2(screenUV.x - 0.5, screenUV.y - 0.5) * 2.0, 0.0)
          : textureLod(backFaceDepthTexture,  vec2(screenUV.x - 0.5, screenUV.y) * 2.0, 0.0);
      }
    }
  `;

  const drawCommand = context.createViewportQuadCommand(fs, {
    uniformMap: {
      colorTexture: () => colorTexture,
      packedDepthTexture: () => packedDepthTexture,
      frontFaceDepthTexture: () => frontFaceDepthTexture,
      backFaceDepthTexture: () => backFaceDepthTexture,
    },
  });
  drawCommand.pass = Pass.OVERLAY;
  return drawCommand;
}

function SceneTextures() {
  this.debugMode = false;

  this.picking = false;

  this._globeAndOpaqueColorFramebuffer = new FramebufferManager();
  this._globeAndOpaquePackedDepthFramebuffer = new FramebufferManager();

  this._waterVolumesFrontFaceFramebuffer = new FramebufferManager({
    color: false,
    colorAttachmentsLength: 0,
    supportsDepthTexture: true,
    depth: true,
  });
  this._waterVolumesBackFaceFramebuffer = new FramebufferManager({
    color: false,
    colorAttachmentsLength: 0,
    supportsDepthTexture: true,
    depth: true,
  });
  this._waterVolumesFramebuffer = new FramebufferManager({
    color: true,
    createColorAttachments: false,
    colorAttachmentsLength: 1,
    depth: false,
    depthStencil: true,
    createDepthAttachments: true,
    supportsDepthTexture: true,
  });

  this._copySceneDepthTextureCommandUniforms = {};
  this._copySceneDepthTextureCommand = undefined;
}

Object.defineProperties(SceneTextures.prototype, {
  globeAndOpaqueColorFramebuffer: {
    get: function () {
      return this._globeAndOpaqueColorFramebuffer.framebuffer;
    },
  },
  globeAndOpaquePackedDepthFramebuffer: {
    get: function () {
      return this._globeAndOpaquePackedDepthFramebuffer.framebuffer;
    },
  },
  waterVolumesFrontFaceFramebuffer: {
    get: function () {
      return this._waterVolumesFrontFaceFramebuffer.framebuffer;
    },
  },
  waterVolumesBackFaceFramebuffer: {
    get: function () {
      return this._waterVolumesBackFaceFramebuffer.framebuffer;
    },
  },
  waterVolumesFramebuffer: {
    get: function () {
      return this._waterVolumesFramebuffer.framebuffer;
    },
  },
});

SceneTextures.prototype.createDebugCommand = function (context) {
  const colorTexture = this.globeAndOpaqueColorFramebuffer.getColorTexture(0);
  const packedDepthTexture = this.globeAndOpaquePackedDepthFramebuffer.getColorTexture(
    0
  );
  const frontFaceDepthTexture = this._waterVolumesFrontFaceFramebuffer
    .framebuffer.depthTexture;
  const backFaceDepthTexture = this._waterVolumesBackFaceFramebuffer.framebuffer
    .depthTexture;
  const debugCommand = createDebugCommand(
    context,
    colorTexture,
    packedDepthTexture,
    frontFaceDepthTexture,
    backFaceDepthTexture
  );
  debugCommand.renderState = RenderState.fromCache({
    viewport: new BoundingRectangle(
      0,
      0,
      context.drawingBufferWidth,
      context.drawingBufferHeight
    ),
    depthMask: false,
  });
  return debugCommand;
};

// const trilinearSampler = new Sampler({
//   wrapS: TextureWrap.REPEAT,
//   wrapT: TextureWrap.REPEAT,
//   minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
//   magnificationFilter: TextureMagnificationFilter.LINEAR,
//   maximumAnisotropy: 16,
// });
SceneTextures.prototype.update = function (
  context,
  passState,
  viewport,
  numSamples,
  hdr,
  colorTexture,
  colorRenderbuffer
) {
  if (this.picking) {
    return;
  }

  const width = viewport.width;
  const height = viewport.height;

  const pixelDatatype =
    hdr
      ? context.halfFloatingPointTexture
        ? PixelDatatype.HALF_FLOAT
        : PixelDatatype.FLOAT
      : PixelDatatype.UNSIGNED_BYTE;
  this._globeAndOpaqueColorFramebuffer.update(
    context,
    width,
    height,
    /*numSamples*/ 1,
    pixelDatatype
  );
  // this._globeAndOpaqueColorFramebuffer.getColorTexture(0).sampler = trilinearSampler;

  this._globeAndOpaquePackedDepthFramebuffer.update(
    context,
    width,
    height,
    /*numSamples*/ 1,
    PixelDatatype.UNSIGNED_BYTE,
    PixelFormat.RGBA
  );

  this._waterVolumesFrontFaceFramebuffer.update(
    context,
    width,
    height,
    /*numSamples*/ 1
  );

  this._waterVolumesBackFaceFramebuffer.update(
    context,
    width,
    height,
    /*numSamples*/ 1
  );

  this._waterVolumesFramebuffer.setColorTexture(colorTexture, 0);
  if (numSamples > 1) {
    this._waterVolumesFramebuffer.setColorRenderbuffer(colorRenderbuffer, 0);
  }
  this._waterVolumesFramebuffer.update(context, width, height, numSamples);
};

const scratchPassState = new PassState();
scratchPassState.viewport = new BoundingRectangle();
// globeDepth.colorFramebufferManager.getDepthStencilTexture();
SceneTextures.prototype.copySceneDepthTexture = function (
  context,
  sceneDepthTexture
) {
  if (this.picking) {
    return;
  }

  if (!defined(this._copySceneDepthTextureCommand)) {
    this._copySceneDepthTextureCommand = context.createViewportQuadCommand(
      /*glsl*/ `
      uniform sampler2D u_depthTexture;
      in vec2 v_textureCoordinates;
      void main()
      {
        out_FragColor = vec4(1);
        gl_FragDepth = texture(u_depthTexture, v_textureCoordinates).r;
      }
    `,
      {
        renderState: RenderState.fromCache({
          colorMask: {
            red: false,
            green: false,
            blue: false,
            alpha: false,
          },
          cull: {
            enabled: false,
          },
          depthTest: {
            // FIXME: 不开启 depth test，则无法开启 depth write? 应该设置 always
            // https://stackoverflow.com/questions/55506999/how-to-disable-depth-test-but-enable-update-depth-texturelike-gldepthmaskgl-tr
            enabled: true,
            func: DepthFunction.ALWAYS,
          },
          depthMask: true,
        }),
        uniformMap: {
          u_depthTexture: () =>
            this._copySceneDepthTextureCommandUniforms.depthTexture,
        },
      }
    );
  }

  this._copySceneDepthTextureCommandUniforms.depthTexture = sceneDepthTexture;

  const passState = scratchPassState;
  passState.context = context;

  passState.viewport.x = 0;
  passState.viewport.y = 0;
  passState.viewport.width = sceneDepthTexture.width;
  passState.viewport.height = sceneDepthTexture.height;

  passState.framebuffer = this._waterVolumesFrontFaceFramebuffer.framebuffer;
  this._copySceneDepthTextureCommand.execute(context, passState);

  passState.framebuffer = this._waterVolumesBackFaceFramebuffer.framebuffer;
  this._copySceneDepthTextureCommand.execute(context, passState);

  passState.framebuffer = this._waterVolumesFramebuffer.framebuffer;
  this._copySceneDepthTextureCommand.execute(context, passState);
};

SceneTextures.prototype.destroy = function () {
  this._globeAndOpaqueColorFramebuffer =
    this._globeAndOpaqueColorFramebuffer &&
    this._globeAndOpaqueColorFramebuffer.destroy();
  this._globeAndOpaquePackedDepthFramebuffer =
    this._globeAndOpaquePackedDepthFramebuffer &&
    this._globeAndOpaquePackedDepthFramebuffer.destroy();
  this._waterVolumesFrontFaceFramebuffer =
    this._waterVolumesFrontFaceFramebuffer &&
    this._waterVolumesFrontFaceFramebuffer.destroy();
  this._waterVolumesBackFaceFramebuffer =
    this._waterVolumesBackFaceFramebuffer &&
    this._waterVolumesBackFaceFramebuffer.destroy();
  this._waterVolumesFramebuffer =
    this._waterVolumesFramebuffer && this._waterVolumesFramebuffer.destroy();
};

export default SceneTextures;
