#ifndef _BRDF_
#define _BRDF_

struct BRDFData {
  vec3  albedo;
  vec3  diffuse;
  vec3  specular;
  float reflectivity;
  float perceptualRoughness;
  float roughness;
  float roughness2;
  float grazingTerm;

  // We save some light invariant BRDF terms so we don't have to recompute
  // them in the light loop. Take a look at DirectBRDF function for detailed explaination.
  float normalizationTerm;     // roughness * 4.0 + 2.0
  float roughness2MinusOne;    // roughness^2 - 1.0
};

#define kDielectricSpec vec4(0.04, 0.04, 0.04, 1.0 - 0.04)
#define lerp mix
float saturate(float v) { return clamp(v, 0.0, 1.0); }

float Max3(float a, float b, float c) {
  return max(a, max(b, c));
}

float ReflectivitySpecular(vec3 specular)
{
  return Max3(specular.r, specular.g, specular.b);
}

float OneMinusReflectivityMetallic(float metallic)
{
    // We'll need oneMinusReflectivity, so
    //   1-reflectivity = 1-lerp(dielectricSpec, 1, metallic) = lerp(1-dielectricSpec, 0, metallic)
    // store (1-dielectricSpec) in kDielectricSpec.a, then
    //   1-reflectivity = lerp(alpha, 0, metallic) = alpha + metallic*(0 - alpha) =
    //                  = alpha - metallic * alpha
    float oneMinusDielectricSpec = kDielectricSpec.a;
    return oneMinusDielectricSpec - metallic * oneMinusDielectricSpec;
}


#if 1 // #ifndef BUILTIN_TARGET_API
float PerceptualRoughnessToRoughness(float perceptualRoughness)
{
  return perceptualRoughness * perceptualRoughness;
}

float RoughnessToPerceptualRoughness(float roughness)
{
  return sqrt(roughness);
}
#endif

float PerceptualSmoothnessToPerceptualRoughness(float perceptualSmoothness)
{
  return (1.0 - perceptualSmoothness);
}

#define HALF_MIN_SQRT 0.0
#define HALF_MIN 0.0
void InitializeBRDFDataDirect(vec3 albedo, vec3 diffuse, vec3 specular, float reflectivity, float oneMinusReflectivity, float smoothness, float alpha, inout BRDFData outBRDFData) {
  // outBRDFData = (BRDFData)0;
  {
    outBRDFData.albedo = vec3(0.0);
    outBRDFData.diffuse = vec3(0.0);
    outBRDFData.specular = vec3(0.0);
    outBRDFData.reflectivity = float(0.0);
    outBRDFData.perceptualRoughness = float(0.0);
    outBRDFData.roughness = float(0.0);
    outBRDFData.roughness2 = float(0.0);
    outBRDFData.grazingTerm = float(0.0);
  }

  outBRDFData.albedo = albedo;
  outBRDFData.diffuse = diffuse;
  outBRDFData.specular = specular;
  outBRDFData.reflectivity = reflectivity;

  outBRDFData.perceptualRoughness = PerceptualSmoothnessToPerceptualRoughness(smoothness);
  outBRDFData.roughness           = max(PerceptualRoughnessToRoughness(outBRDFData.perceptualRoughness), HALF_MIN_SQRT);
  outBRDFData.roughness2          = max(outBRDFData.roughness * outBRDFData.roughness, HALF_MIN);
  outBRDFData.grazingTerm         = saturate(smoothness + reflectivity);
  outBRDFData.normalizationTerm   = outBRDFData.roughness * float(4.0) + float(2.0);
  outBRDFData.roughness2MinusOne  = outBRDFData.roughness2 - float(1.0);

  // Input is expected to be non-alpha-premultiplied while ROP is set to pre-multiplied blend.
  // We use input color for specular, but (pre-)multiply the diffuse with alpha to complete the standard alpha blend equation.
  // In shader: Cs' = Cs * As, in ROP: Cs' + Cd(1-As);
  // i.e. we only alpha blend the diffuse part to background (transmittance).
  #if defined(_ALPHAPREMULTIPLY_ON)
    // TODO: would be clearer to multiply this once to accumulated diffuse lighting at end instead of the surface property.
    outBRDFData.diffuse *= alpha;
  #endif
}

void InitializeBRDFData(vec3 albedo, float metallic, vec3 specular, float smoothness, float alpha, inout BRDFData outBRDFData) {
#if 0 // ifdef _SPECULAR_SETUP
  // float reflectivity = ReflectivitySpecular(specular);
  // float oneMinusReflectivity = half(1.0) - reflectivity;
  // vec3 brdfDiffuse = albedo * oneMinusReflectivity;
  // vec3 brdfSpecular = specular;
#else
  float oneMinusReflectivity = OneMinusReflectivityMetallic(metallic);
  float reflectivity = float(1.0) - oneMinusReflectivity;
  vec3 brdfDiffuse = albedo * oneMinusReflectivity;
  vec3 brdfSpecular = lerp(kDielectricSpec.rgb, albedo, metallic);
#endif

  InitializeBRDFDataDirect(albedo, brdfDiffuse, brdfSpecular, reflectivity, oneMinusReflectivity, smoothness, alpha, outBRDFData);
}

#define half float
#define half3 vec3
#define REAL_IS_HALF 0

// Computes the scalar specular term for Minimalist CookTorrance BRDF
// NOTE: needs to be multiplied with reflectance f0, i.e. specular color to complete
half DirectBRDFSpecular(BRDFData brdfData, half3 normalWS, half3 lightDirectionWS, half3 viewDirectionWS)
{
  vec3 lightDirectionWSFloat3 = vec3(lightDirectionWS);
  vec3 halfDir = SafeNormalize(lightDirectionWSFloat3 + vec3(viewDirectionWS));

  float NoH = saturate(dot(vec3(normalWS), halfDir));
  half LoH = half(saturate(dot(lightDirectionWSFloat3, halfDir)));

  // GGX Distribution multiplied by combined approximation of Visibility and Fresnel
  // BRDFspec = (D * V * F) / 4.0
  // D = roughness^2 / ( NoH^2 * (roughness^2 - 1) + 1 )^2
  // V * F = 1.0 / ( LoH^2 * (roughness + 0.5) )
  // See "Optimizing PBR for Mobile" from Siggraph 2015 moving mobile graphics course
  // https://community.arm.com/events/1155

  // Final BRDFspec = roughness^2 / ( NoH^2 * (roughness^2 - 1) + 1 )^2 * (LoH^2 * (roughness + 0.5) * 4.0)
  // We further optimize a few light invariant terms
  // brdfData.normalizationTerm = (roughness + 0.5) * 4.0 rewritten as roughness * 4.0 + 2.0 to a fit a MAD.
  float d = NoH * NoH * brdfData.roughness2MinusOne + 1.00001;

  half LoH2 = LoH * LoH;
  half specularTerm = brdfData.roughness2 / ((d * d) * max(0.1, LoH2) * brdfData.normalizationTerm);

  // On platforms where half actually means something, the denominator has a risk of overflow
  // clamp below was added specifically to "fix" that, but dx compiler (we convert bytecode to metal/gles)
  // sees that specularTerm have only non-negative terms, so it skips max(0,..) in clamp (leaving only min(100,...))
#if REAL_IS_HALF
  specularTerm = specularTerm - HALF_MIN;
  // Update: Conservative bump from 100.0 to 1000.0 to better match the full float specular look.
  // Roughly 65504.0 / 32*2 == 1023.5,
  // or HALF_MAX / ((mobile) MAX_VISIBLE_LIGHTS * 2),
  // to reserve half of the per light range for specular and half for diffuse + indirect + emissive.
  specularTerm = clamp(specularTerm, 0.0, 1000.0); // Prevent FP16 overflow on mobiles
#endif

  return specularTerm;
}


vec3 DirectBRDF(BRDFData brdfData, vec3 normalWS, vec3 lightDirectionWS, vec3 viewDirectionWS, bool specularHighlightsOff) {
  if (!specularHighlightsOff) {
    float specularTerm = DirectBRDFSpecular(brdfData, normalWS, lightDirectionWS, viewDirectionWS);
    vec3 color = brdfData.diffuse + specularTerm * brdfData.specular;
    return color;
  } else {
    return brdfData.diffuse;
  }
}

vec3 DirectBRDF(BRDFData brdfData, vec3 normalWS, vec3 lightDirectionWS, vec3 viewDirectionWS) {
  return DirectBRDF(brdfData, normalWS, lightDirectionWS, viewDirectionWS, false);
}

#endif