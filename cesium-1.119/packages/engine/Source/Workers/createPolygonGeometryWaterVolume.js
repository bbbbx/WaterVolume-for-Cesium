import Cartesian3 from "../Core/Cartesian3.js";
import defined from "../Core/defined.js";
import Ellipsoid from "../Core/Ellipsoid.js";
import Matrix4 from "../Core/Matrix4.js";
import PolygonGeometry from "../Core/PolygonGeometry.js";
import Transforms from "../Core/Transforms.js";

function createPolygonGeometryWaterVolume(polygonGeometry, offset) {
  if (defined(offset)) {
    polygonGeometry = PolygonGeometry.unpack(polygonGeometry, offset);
  }
  polygonGeometry._ellipsoid = Ellipsoid.clone(polygonGeometry._ellipsoid);
  const ellipsoid = polygonGeometry._ellipsoid;

  const geometry = PolygonGeometry.createGeometry(polygonGeometry);

  // TODO: 把 wall 在顶部的顶点 TBN 改为顶部的 TBN，以便在 VS displace wall 的顶部部分 pos。但破坏了法线
  // [ ...top, ...bottom, ...top_of_wall, ...bottom_of_wall, ...top_of_hold0, ...bottom_of_hold0 ]
  // [      0,        !0,              0,                !0,               0,                 !0 ]
  const positions = geometry.attributes.position.values;
  const normals = geometry.attributes.normal.values;
  const tangents = geometry.attributes.tangent.values;
  const bitangents = geometry.attributes.bitangent.values;
  const extrudeDirections = geometry.attributes.extrudeDirection.values;
  const extrudeDirection = new Cartesian3();
  const position = new Cartesian3();
  const scratchMatrix = new Matrix4();
  for (let i = 0; i < extrudeDirections.length; i += 3) {
    extrudeDirection.x = extrudeDirections[i];
    extrudeDirection.y = extrudeDirections[i + 1];
    extrudeDirection.z = extrudeDirections[i + 2];
    if (!Cartesian3.equals(extrudeDirection, Cartesian3.ZERO)) {
      // 不是顶部的顶点则跳过
      continue;
    }

    Cartesian3.unpack(positions, i, position);
    Transforms.eastNorthUpToFixedFrame(position, ellipsoid, scratchMatrix);

    tangents[i] = scratchMatrix[0];
    tangents[i + 1] = scratchMatrix[1];
    tangents[i + 2] = scratchMatrix[2];

    bitangents[i] = scratchMatrix[4];
    bitangents[i + 1] = scratchMatrix[5];
    bitangents[i + 2] = scratchMatrix[6];

    normals[i] = scratchMatrix[8];
    normals[i + 1] = scratchMatrix[9];
    normals[i + 2] = scratchMatrix[10];
  }

  return geometry;
}
export default createPolygonGeometryWaterVolume;
