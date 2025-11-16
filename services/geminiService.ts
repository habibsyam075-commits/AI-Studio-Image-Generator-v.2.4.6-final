// services/geminiService.ts
import { GoogleGenAI, Modality, Part, Type } from '@google/genai';
import type { ModelData, SceneData, ReferenceData, ModelCreatorLocks, SceneLocks } from '../types';
import { GENDER_OPTIONS, EXPRESSION_OPTIONS, LIGHTING_OPTIONS, MOOD_OPTIONS, SHOT_TYPE_OPTIONS, ETHNICITY_FEATURES_MAP, SENSUAL_POSES, NON_SENSUAL_POSES, SHOT_TYPE_DESCRIPTIONS, MODERN_OUTFITS, AUTHENTIC_OUTFITS, RANDOM_DESCRIPTIONS, RANDOM_TONES, RANDOM_LOCATIONS, RANDOM_DETAILS, BODY_SHAPE_OPTIONS, RANDOM_COLORS } from '../constants';

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
};

/**
 * Builds a simplified and direct text prompt specifically for the Imagen model.
 */
const buildImagenPrompt = (modelData: ModelData, sceneData: SceneData, country: string, overallStyle: 'modern' | 'authentic', modelType: 'professional' | 'natural'): string => {
  const persona = modelType === 'professional' ? 'professional model' : 'natural person';
  const sensualTone = modelData.isSensual ? 'Tasteful and sensual portrait photography. CRITICAL: The lighting and pose MUST be used to artistically and tastefully accentuate the subject\'s specified Body Shape. ' : '';
  const ethnicFeaturesGuide = ETHNICITY_FEATURES_MAP[country] || 'A diverse range of human features.';
  const shotTypeDescription = SHOT_TYPE_DESCRIPTIONS[sceneData.shotType] || sceneData.shotType;
  const outfitColorDirective = modelData.outfitColor && modelData.outfitColor.toLowerCase() !== 'any' ? `The primary color of the outfit MUST be ${modelData.outfitColor}.` : '';

  const prompt = `
    **Primary Subject Mandate (NON-NEGOTIABLE):**
    1.  **Ethnicity & Authenticity:** The person in the photograph MUST be of **${country}** ethnicity.
    2.  **Ethnic Feature Guide (ABSOLUTE RULE):** To achieve this, you MUST strictly follow this guide for authentic facial features: **"${ethnicFeaturesGuide}"**. This guide is the final authority on the subject's appearance, overriding any conflicting part of the description below.
    3.  **Conflict Resolution:** If the 'Model Description' seems to contradict the guide, the **GUIDE ALWAYS WINS**.
    4.  **Diversity Mandate:** Avoid stereotypical representations. For every generation, create a completely unique individual with distinct facial features consistent with the guide. Do not reuse faces.

    **Composition Mandate (NON-NEGOTIABLE):**
    - **Framing:** The photograph MUST be a **${shotTypeDescription}**. This is a strict compositional requirement.

    **Photo Details:**
    - **Type:** A ${sensualTone}hyper-realistic cinematic photograph.
    - **Subject:** A ${modelData.age}-year-old ${modelData.gender} ${persona}.
    - **Body Shape (NON-NEGOTIABLE):** ${modelData.bodyShape}.
    - **Pose:** ${modelData.pose}.
    - **Model Description (Guideline Only, overruled by Ethnic Guide):** ${modelData.description}.
    - **Tones (Guideline Only, overruled by Ethnic Guide):** ${modelData.tones}.
    - **Outfit:** ${modelData.outfit}. ${outfitColorDirective}
    - **Expression:** A ${modelData.expression} expression.
    - **Scene:** In ${sceneData.location}. Mood is ${sceneData.mood}. Scene details: ${sceneData.details}.
    - **Style:** ${overallStyle}, culturally authentic to ${country}.
    - **Camera:** Fujifilm X-T4, Fujinon 35mm f/1.4 lens, Classic Chrome simulation.
    - **Goal:** Indistinguishable from a real photograph. Authentic, lived-in feel. NO CGI, 3D, or artificial look.
  `.replace(/\s+/g, ' ').trim();

  return prompt;
};


/**
 * Builds a detailed text prompt for image generation based on user inputs.
 */
const buildPrompt = (modelData: ModelData, sceneData: SceneData, country: string, referenceData: ReferenceData, overallStyle: 'modern' | 'authentic', modelType: 'professional' | 'natural'): string => {
  const sensualModeDirective = modelData.isSensual 
    ? `\n\n  **Sensual Mode Directive:** The overall tone of the photograph should be intimate, tasteful, and sensual. CRITICAL: The lighting, pose, and composition must be expertly crafted to tastefully and artistically accentuate the subject's specified **${modelData.bodyShape}** body shape. This is the primary goal of the sensual mode. Avoid anything explicit or vulgar.`
    : '';

  const personaDirective = modelType === 'professional'
    ? `\n\n  **Subject Persona (CRITICAL):** The subject is a **Professional Model**. Their pose, expression, and gaze must reflect this. They are confident, skilled, and aware of the camera's presence. Their body language should be deliberate and composed.`
    : `\n\n  **Subject Persona (CRITICAL):** The subject is a **Normal Person**, not a model. The goal is to capture a genuine, candid moment. Their pose, expression, and body language must be completely natural, unposed, and relaxed. They should appear unaware of the camera or as if a friend is taking their picture.`;
    
  const ethnicFeaturesGuide = ETHNICITY_FEATURES_MAP[country] || 'A diverse range of human features.';
  const shotTypeDescription = SHOT_TYPE_DESCRIPTIONS[sceneData.shotType] || sceneData.shotType;
  const outfitColorDirective = modelData.outfitColor && modelData.outfitColor.toLowerCase() !== 'any' ? `CRITICAL: The dominant color of the outfit MUST be **${modelData.outfitColor}**.` : '';
    
  const prompt = `
  **Primary Directive:** Create a single, hyper-realistic photograph. The final image must be absolutely indistinguishable from a photo taken by a world-class photographer on a real-world location. The aesthetic is authentic, candid, and deeply cinematic.${sensualModeDirective}${personaDirective}

  **Overall Style Mandate (CRITICAL):** The entire photograph must adhere to a '${overallStyle}' aesthetic. This choice influences everything from the architecture and furniture to the fashion and mood.

  **Cultural Context Adaptation (CRITICAL - HIGHEST PRIORITY):**
  - **Country:** ${country}
  - **Instruction:** This is the most important rule. You MUST interpret and adapt ALL other instructions to be authentic and culturally appropriate for ${country}.
    - **For the subject (NON-NEGOTIABLE):** The generated person's ethnicity and physical features (face, skin, hair, eyes) MUST be 100% representative of a person from **${country}**.
        - **Ethnic Feature Guide (ABSOLUTE RULE):** To achieve this, you MUST strictly follow this guide for authentic facial features: **"${ethnicFeaturesGuide}"**. This guide is the final authority on the subject's appearance.
        - **Diversity Mandate:** Avoid stereotypical representations. For every new generation, create a completely unique individual with distinct facial features consistent with the guide. Do not reuse faces.
        - **Conflict Resolution:** If the "Subject Details" below (like description or tones) conflict with the Ethnic Feature Guide, you MUST **IGNORE** the conflicting details and prioritize the guide. This is the absolute final authority.
    - **For the location:** If a specific style mentioned in the 'Environmental Context' (e.g., 'Scandinavian kitchen') conflicts with the country context (${country}), you MUST creatively merge the two concepts. The core cultural identity of the location MUST be ${country}, with the specified style being an influence. For example, for a 'Scandinavian kitchen' in 'Japan', the result should be a Japanese home that incorporates Scandinavian design principles (minimalism, natural wood, functionality), not a Scandinavian home randomly placed in Japan. Always prioritize the authenticity of the ${country} context.

  **Composition Mandate (NON-NEGOTIABLE):**
  - **Framing:** The photograph MUST be a **${shotTypeDescription}**. This is a strict compositional requirement.

  **CRITICAL Prohibition:**
  - **NO Artificial Framing:** The generated image must NOT have any artificial borders, black frames, vignettes, or any visual effect that suggests a digital frame has been added. The image content must extend to the very edge.
  - **NO CGI/3D Look:** Aggressively avoid any trace of CGI, 3D rendering, video game graphics, or digital artificiality. If a surface looks like plastic or unnaturally smooth, the generation has failed.
  - **NO Stock Photo Vibe:** Avoid sterile, perfectly staged, or overly clean environments. The scene must feel lived-in and natural.

  **Subject Details (Guideline Only, overruled by Ethnic Guide):**
  - **Individual:** A ${modelData.age}-year-old ${modelData.gender} model.
  - **Pose (NON-NEGOTIABLE):** The subject MUST be in the following pose: **${modelData.pose}**.
  - **Physicality:** ${modelData.description}. The subject has a **${modelData.bodyShape}** body shape.
  - **Color Tones (Hair, Eyes, Skin):** ${modelData.tones}.
  - **Expression:** A natural, candid ${modelData.expression}. Capture an authentic, unposed moment.
  - **Outfit:** ${modelData.outfit}. Clothing must have realistic weight, creases, and texture. ${outfitColorDirective}

  **Environmental Context:**
  - **Location:** ${sceneData.location}.
  - **Atmosphere:** A palpable ${sceneData.mood} mood.
  - **Scene Details:** ${sceneData.details}.

  **Mandatory Photographic & Realism Engine:**
  - **Camera & Lens Emulation:** Strictly emulate a **Fujifilm X-T4 with a Fujinon 35mm f/1.4 lens**.
  - **Color & Film Science:** Adhere strictly to the **Fujifilm "Classic Chrome" film simulation**. This means muted, cinematic tones with high color fidelity and a subtle, organic film grain (NOT digital noise).
  - **Lighting Physics:** ${sceneData.lighting}. The lighting must be physically accurate. Demonstrate a deep understanding of how light behaves in the real world: how it wraps around forms, creates soft penumbras, bounces off surfaces to create subtle fill light, and how different color temperatures (e.g., cool window light, warm lamp light) mix realistically.
  - **Lived-In Reality Principle:** This is the highest priority. The scene must feel real and occupied.
    - **Physical Coherence:** All elements must obey the laws of physics. Shadows must be cast from a consistent light source. Reflections in surfaces (glass, metal) must accurately mirror the environment. Objects must show the effect of gravity.
    - **Micro-Imperfections:** Introduce subtle, logical signs of life. A faint coffee cup ring on a a table, almost invisible micro-scratches on a phone screen, a book spine that's slightly creased, dust motes dancing in a sunbeam. These details should be barely noticeable but contribute to the overall authenticity.
    - **Texture Fidelity:** All surfaces must possess high-fidelity, tangible textures. Wood shows grain and pores, fabric has a visible weave, skin reveals natural micro-texture.

  **Reference Photo Instructions (If Provided):**
  ${referenceData.usePhoto && referenceData.photo ? `
    An image is provided as a reference. Adhere to these rules:
    - Style: ${referenceData.useStyle ? 'Strongly match the artistic style, color grading, and aesthetic of the reference.' : 'Ignore the style of the reference.'}
    - Composition: ${referenceData.useComposition ? 'Replicate the composition and camera angle of the reference.' : 'Ignore the composition of the reference.'}
    - Overlays: ${referenceData.keepOverlays ? 'Preserve any text or icons from the reference.' : 'Do not include overlays from the reference.'}
  ` : 'No reference photo provided.'}
  `;
  
  return prompt;
};

// Helper function for robust JSON extraction from AI responses
function extractJson(text: string): any {
  // Attempt to find JSON block within markdown ```json ... ```
  const markdownJsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownJsonMatch && markdownJsonMatch[1]) {
    try {
      return JSON.parse(markdownJsonMatch[1]);
    } catch (e) {
      console.error("Failed to parse JSON from markdown block, falling back.", e);
    }
  }

  // Fallback to finding the first '{' and last '}'
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("AI response did not contain a valid JSON object.");
  }

  const jsonString = text.substring(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Failed to parse extracted JSON string:", jsonString);
    throw new Error("AI returned malformed JSON.");
  }
}


/**
 * Generates an image using Gemini based on text and optional image inputs.
 * Returns an array of base64 encoded strings of the generated image(s).
 */
export const generateAIImage = async (
  apiKey: string,
  modelData: ModelData,
  sceneData: SceneData,
  referenceData: ReferenceData,
  country: string,
  overallStyle: 'modern' | 'authentic',
  modelType: 'professional' | 'natural',
  aspectRatio: '1:1' | '3:4' | '9:16',
  numberOfImages: 1 | 4 = 1,
  generationTier: 'premium' | 'standard' = 'premium',
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey });

  // Case 1: Reference photo is provided (Image Editing/Style Transfer)
  // Use gemini-2.5-flash-image, which generates a single image.
  if (referenceData.usePhoto && referenceData.photo) {
    const prompt = buildPrompt(modelData, sceneData, country, referenceData, overallStyle, modelType);
    const parts: Part[] = [{ text: prompt }];
    const imagePart = await fileToGenerativePart(referenceData.photo);
    parts.unshift(imagePart);

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });

      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            return [part.inlineData.data]; // Return as an array with one image
          }
        }
      } else {
        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason) {
            throw new Error(`Image generation failed. Reason: ${finishReason}. Please adjust your prompt.`);
        }
      }
    } catch (error: any) {
      console.error("Error generating image with Gemini:", error);
      throw new Error(error.message || 'An unknown error occurred during image generation.');
    }

    throw new Error('No image was generated by the AI. Please try adjusting your prompt or reference image.');
  } 
  
  // Case 2: No reference photo (Image Generation)
  else {
    const prompt = buildImagenPrompt(modelData, sceneData, country, overallStyle, modelType);
    
    if (generationTier === 'standard') {
      // Use gemini-2.5-flash-image for "tier 1" generation
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [{ text: prompt }],
          },
          config: {
            responseModalities: [Modality.IMAGE],
          },
        });

        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              return [part.inlineData.data]; // Return as an array with one image
            }
          }
        } else {
          const finishReason = response.candidates?.[0]?.finishReason;
          if (finishReason) {
            throw new Error(`Image generation failed. Reason: ${finishReason}. This may be due to safety policies.`);
          }
        }
        
        throw new Error('Image generation failed with Standard engine. No image data received.');

      } catch (error: any) {
        console.error("Error generating image with Gemini Flash Image:", error);
        throw new Error(error.message || 'An unknown error occurred during image generation with the Standard engine.');
      }
    } else { // 'premium' tier
      // Use Imagen to generate 1 or more images.
      try {
        const response = await ai.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: prompt,
          config: {
            numberOfImages: numberOfImages,
            outputMimeType: 'image/png',
            aspectRatio: aspectRatio,
          },
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
          return response.generatedImages.map(img => img.image.imageBytes);
        } else {
          throw new Error('Image generation failed. The model did not return any images. This may be due to safety policies. Please try adjusting your prompt to be less sensitive.');
        }
      } catch (error: any)
      {
        console.error("Error generating images with Imagen:", error);
        throw new Error(error.message || 'An unknown error occurred during image generation.');
      }
    }
  }
};

/**
 * Adapts a scene preset to a specific country's cultural context using Gemini.
 */
export const adaptScenePreset = async (
  apiKey: string,
  presetData: Partial<SceneData>,
  country: string
): Promise<Partial<SceneData>> => {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You are a reality simulation engine. Your task is to adapt a preset scene concept into a 100% realistic data profile for an average, everyday location in ${country}.
  
  **Core Mandate: Absolute Realism, NOT Aesthetics (NON-NEGOTIABLE)**
  Your ONLY priority is raw, unpolished realism. AVOID glossy, idealized, or "influencer" aesthetics at all costs.

  **MANDATE FOR MUNDANITY (ABSOLUTE RULE):**
  - **AVOID:** Designer furniture, perfect cleanliness, trendy decor.
  - **INCLUDE:** Normal signs of wear and tear, generic non-designer items, unplanned clutter, and culturally specific *commonplace* items.

  **Adaptation Task:**
  - **Original Scene Concept:** ${presetData.location}
  - **Original Scene Details:** ${presetData.details}
  - **Target Country:** ${country}

  **Instruction (CRITICAL):**
  Take the *essence* of the preset and filter it through your realism engine for ${country}. If the preset is "Grandma's Kitchen", you MUST describe a REAL, slightly messy, lived-in kitchen of a typical, non-wealthy grandmother in ${country}. It must NOT be a stylized, perfectly clean "farmhouse chic" kitchen. It must have authentic, culturally specific clutter.

  Provide a JSON object with two keys: "location" and "details".
  - "location": The rewritten, realistic, culturally-adapted location description.
  - "details": The rewritten, realistic, culturally-adapted details with sensory information that ground the scene in unpolished reality.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            location: { type: Type.STRING, description: "The rewritten, culturally-adapted location description." },
            details: { type: Type.STRING, description: "The rewritten, culturally-adapted details with sensory information." },
          },
          required: ["location", "details"],
        },
      },
    });

    const jsonResponse = extractJson(response.text);
    return jsonResponse as Partial<SceneData>;
  } catch (error: any) {
    console.error("Error adapting scene preset:", error);
    throw new Error("Failed to adapt scene preset. The AI returned a response that could not be processed. Please try again.");
  }
};

/**
 * Intelligently randomizes unlocked fields in a single, efficient API call.
 */
export const generateSmartRandomization = async (
  apiKey: string,
  unlockedFields: { model: (keyof Omit<ModelCreatorLocks, 'all'>)[]; scene: (keyof Omit<SceneLocks, 'all'>)[]; },
  currentModel: ModelData,
  currentScene: SceneData,
  country: string,
  overallStyle: 'modern' | 'authentic',
  modelType: 'professional' | 'natural',
  sceneType: 'any' | 'indoor' = 'any'
): Promise<Partial<ModelData & SceneData>> => {
  const ai = new GoogleGenAI({ apiKey });

  const { model: unlockedModel, scene: unlockedScene } = unlockedFields;

  const fieldsToRandomizeList = [
    ...unlockedModel.map(f => `model.${f}`),
    ...unlockedScene.map(f => `scene.${f}`)
  ].join(', ');
  
  if (!fieldsToRandomizeList) {
    return {};
  }

  const properties: Record<string, { type: any; enum?: readonly string[]; }> = {};
  if (unlockedModel.includes('description')) properties['description'] = { type: Type.STRING };
  if (unlockedModel.includes('gender')) properties['gender'] = { type: Type.STRING, enum: GENDER_OPTIONS };
  if (unlockedModel.includes('age')) properties['age'] = { type: Type.INTEGER };
  if (unlockedModel.includes('expression')) properties['expression'] = { type: Type.STRING, enum: EXPRESSION_OPTIONS };
  if (unlockedModel.includes('bodyShape')) properties['bodyShape'] = { type: Type.STRING, enum: BODY_SHAPE_OPTIONS };
  if (unlockedModel.includes('outfit')) properties['outfit'] = { type: Type.STRING };
  if (unlockedModel.includes('outfitColor')) properties['outfitColor'] = { type: Type.STRING };
  if (unlockedModel.includes('tones')) properties['tones'] = { type: Type.STRING };
  if (unlockedModel.includes('pose')) properties['pose'] = { type: Type.STRING };
  if (unlockedScene.includes('location')) properties['location'] = { type: Type.STRING };
  if (unlockedScene.includes('lighting')) properties['lighting'] = { type: Type.STRING, enum: LIGHTING_OPTIONS };
  if (unlockedScene.includes('mood')) properties['mood'] = { type: Type.STRING, enum: MOOD_OPTIONS };
  if (unlockedScene.includes('details')) properties['details'] = { type: Type.STRING };

  const responseSchema = {
    type: Type.OBJECT,
    properties,
  };

  const ethnicFeaturesGuide = ETHNICITY_FEATURES_MAP[country] || 'A diverse range of human features.';
  
  const sceneInstruction = sceneType === 'indoor'
    ? 'The scene MUST be an indoor location.'
    : 'The scene can be either indoor or outdoor.';

  const prompt = `
  You are a highly creative assistant for a photorealistic image generation tool. Your task is to intelligently randomize specific "unlocked" fields, ensuring the new values are fresh, contextually appropriate, and significantly different from the current ones.

  **Current Photoshoot Context (Use this for inspiration and context):**
  - **Country for Ethnicity & Location:** ${country}
  - **Overall Style:** ${overallStyle}
  - **Model Persona:** ${modelType}
  - **Sensual Mode:** ${currentModel.isSensual}
  - **Current Model Details (For Avoidance):** ${JSON.stringify(currentModel)}
  - **Current Scene Details (For Avoidance):** ${JSON.stringify(currentScene)}

  **Your ONLY Task:**
  Generate new, creative values for the following fields ONLY: **${fieldsToRandomizeList}**.
  Your response MUST be a JSON object containing keys for ONLY these fields.

  **CRITICAL RULES for generating new values:**
  1.  **DIVERSITY IS KEY:** The new values MUST be substantially different from the current values provided in the context.
  2.  **CULTURAL & CONTEXTUAL AWARENESS:** All generated values must be authentic and appropriate for the given context (${country}, ${overallStyle}, ${modelType}, etc.).
  3.  **ETHNIC FEATURES (If 'description' or 'tones' are requested):** You MUST strictly adhere to this guide for authentic features: **"${ethnicFeaturesGuide}"**. Create a specific individual, do not repeat the guide.
  4.  **BODY SHAPE (If requested):** The body shape must be realistic and consistent with the overall description.
  5.  **OUTFIT (If requested):** The outfit MUST strictly match the '${overallStyle}' style. It must also be culturally appropriate for ${country}. To ensure this, create a new, unique outfit description inspired by the following examples for a '${overallStyle}' look, but DO NOT copy them directly: ${JSON.stringify(overallStyle === 'modern' ? MODERN_OUTFITS : AUTHENTIC_OUTFITS)}.
  6.  **OUTFIT COLOR (If requested):** Generate a creative and suitable color for the described outfit. It can be a simple color ('red') or more descriptive ('sky blue').
  7.  **POSE (If requested):** The pose must match the model persona (${modelType}) and sensuality (${currentModel.isSensual}).
  8.  **SCENE (If requested):** Scene elements must feel like a real, mundane, and culturally authentic place in ${country}. Avoid idealized or generic descriptions. ${sceneInstruction}

  Generate the JSON response now.
  `;
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
    },
  });

  try {
    const jsonResponse = extractJson(response.text);
    return jsonResponse as Partial<ModelData & SceneData>;
  } catch (error) {
      console.error("Failed to parse JSON from smart randomization response. Original text:", response.text);
      throw new Error("Failed to process randomization. The AI returned a response that could not be read.");
  }
};

const pickRandom = <T>(options: T[], currentValue?: T): T => {
  const filteredOptions = currentValue ? options.filter(o => o !== currentValue) : options;
  if (filteredOptions.length > 0) {
    return filteredOptions[Math.floor(Math.random() * filteredOptions.length)];
  }
  // Fallback if all options are the same as current or options is empty
  return options[Math.floor(Math.random() * options.length)];
};

export const generateLocalRandomization = (
  unlockedFields: { model: (keyof Omit<ModelCreatorLocks, 'all'>)[]; scene: (keyof Omit<SceneLocks, 'all'>)[]; },
  currentModel: ModelData,
  currentScene: SceneData,
  overallStyle: 'modern' | 'authentic'
): Partial<ModelData & SceneData> => {
  const result: Partial<ModelData & SceneData> = {};
  const { model: unlockedModel, scene: unlockedScene } = unlockedFields;

  // Model randomization
  if (unlockedModel.includes('description')) result.description = pickRandom(RANDOM_DESCRIPTIONS, currentModel.description);
  if (unlockedModel.includes('gender')) result.gender = pickRandom(GENDER_OPTIONS, currentModel.gender);
  if (unlockedModel.includes('age')) result.age = Math.floor(Math.random() * (60 - 18 + 1)) + 18; // 18-60
  if (unlockedModel.includes('expression')) result.expression = pickRandom(EXPRESSION_OPTIONS, currentModel.expression);
  if (unlockedModel.includes('bodyShape')) result.bodyShape = pickRandom(BODY_SHAPE_OPTIONS, currentModel.bodyShape);
  if (unlockedModel.includes('outfit')) {
    const outfitOptions = overallStyle === 'modern' ? MODERN_OUTFITS : AUTHENTIC_OUTFITS;
    result.outfit = pickRandom(outfitOptions, currentModel.outfit);
  }
  if (unlockedModel.includes('outfitColor')) result.outfitColor = pickRandom(RANDOM_COLORS, currentModel.outfitColor);
  if (unlockedModel.includes('tones')) result.tones = pickRandom(RANDOM_TONES, currentModel.tones);
  if (unlockedModel.includes('pose')) {
    const poseOptions = currentModel.isSensual ? SENSUAL_POSES : NON_SENSUAL_POSES;
    result.pose = pickRandom(poseOptions, currentModel.pose);
  }

  // Scene randomization
  if (unlockedScene.includes('location')) result.location = pickRandom(RANDOM_LOCATIONS, currentScene.location);
  if (unlockedScene.includes('lighting')) result.lighting = pickRandom(LIGHTING_OPTIONS, currentScene.lighting);
  if (unlockedScene.includes('mood')) result.mood = pickRandom(MOOD_OPTIONS, currentScene.mood);
  if (unlockedScene.includes('details')) result.details = pickRandom(RANDOM_DETAILS, currentScene.details);

  return result;
};