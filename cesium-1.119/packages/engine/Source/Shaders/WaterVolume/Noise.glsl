#ifndef _Noise_
#define _Noise_

// Simple noise from thebookofshaders.com
// 2D Random
vec2 random(vec2 st){
  st = vec2( dot(st,vec2(127.1,311.7)), dot(st,vec2(269.5,183.3)) );
  return -1.0 + 2.0 * fract(sin(st) * 43758.5453123);
}

// 2D Noise based on Morgan McGuire @morgan3d
// https://www.shadertoy.com/view/4dS3Wd
float noise (vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);

  vec2 u = f*f*(3.0-2.0*f);

  return mix( mix( dot( random(i), f),
                   dot( random(i + vec2(1.0,0.0) ), f - vec2(1.0,0.0) ), u.x),
              mix( dot( random(i + vec2(0.0,1.0) ), f - vec2(0.0,1.0) ),
                   dot( random(i + vec2(1.0,1.0) ), f - vec2(1.0,1.0) ), u.x), u.y);
}

#endif
