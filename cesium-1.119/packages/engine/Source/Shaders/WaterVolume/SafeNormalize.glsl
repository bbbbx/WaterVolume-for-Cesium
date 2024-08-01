#ifndef _SafeNormalize_
#define _SafeNormalize_

vec3 SafeNormalize(vec3 inVec) {
  float dp3 = max(0.001, dot(inVec, inVec));
  return inVec * sqrt(dp3);
}

#endif
