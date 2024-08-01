import Cartesian3 from "../Core/Cartesian3.js";
import Cartographic from "../Core/Cartographic.js";
import Matrix4 from "../Core/Matrix4.js";
//>>includeStart('debug', pragmas.debug);
// import OrthographicOffCenterFrustum from "../../Core/OrthographicOffCenterFrustum.js";
//>>includeEnd('debug');

function ShadowMapCamera() {
  this.positionCartographic = new Cartographic();
  this.positionWC = new Cartesian3();
  this.directionWC = Cartesian3.clone(Cartesian3.UNIT_Z);
  this.upWC = Cartesian3.clone(Cartesian3.UNIT_Y);
  this.rightWC = Cartesian3.clone(Cartesian3.UNIT_X);
  this.viewMatrix = new Matrix4();
  this.inverseViewMatrix = new Matrix4();

  /**
   * @type {OrthographicOffCenterFrustum}
   */
  this.frustum = undefined;

  this.viewProjectionMatrix = new Matrix4();
}

ShadowMapCamera.prototype.clone = function (camera) {
  Matrix4.clone(camera.viewMatrix, this.viewMatrix);
  Matrix4.clone(camera.inverseViewMatrix, this.inverseViewMatrix);
  this.frustum = camera.frustum.clone(this.frustum);
  Cartographic.clone(camera.positionCartographic, this.positionCartographic);
  Cartesian3.clone(camera.positionWC, this.positionWC);
  Cartesian3.clone(camera.directionWC, this.directionWC);
  Cartesian3.clone(camera.upWC, this.upWC);
  Cartesian3.clone(camera.rightWC, this.rightWC);
};

// Converts from NDC space to texture space
const scaleBiasMatrix = new Matrix4(
  0.5,
  0.0,
  0.0,
  0.5,
  0.0,
  0.5,
  0.0,
  0.5,
  0.0,
  0.0,
  0.5,
  0.5,
  0.0,
  0.0,
  0.0,
  1.0
);

/**
 * 该矩阵共 2 步：
 * 1. xyzw = projection * view
 * 2. xyzw = xyzw*0.5 + 0.5 // [-1, 1] => [0, 1], NDC to texture coordinates
 * @returns {Matrix4}
 * @private
 */
ShadowMapCamera.prototype.getViewProjection = function () {
  const view = this.viewMatrix;
  const projection = this.frustum.projectionMatrix;
  Matrix4.multiply(projection, view, this.viewProjectionMatrix);
  Matrix4.multiply(
    scaleBiasMatrix,
    this.viewProjectionMatrix,
    this.viewProjectionMatrix
  );
  return this.viewProjectionMatrix;
};

export default ShadowMapCamera;
