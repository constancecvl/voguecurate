
import { GoogleGenAI, Type } from "@google/genai";
import { ExhibitionStrategy } from "../types";

/**
 * Generates a detailed exhibition strategy for a fashion collection.
 * Uses gemini-3-pro-preview for complex reasoning and curation tasks.
 */
export const generateExhibitionStrategy = async (
  collectionName: string,
  description: string,
  images: string[] // base64 strings
): Promise<ExhibitionStrategy> => {
  // Always use this pattern for Gemini initialization as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const imageParts = images.map(img => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: img.split(',')[1] || img
    }
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        ...imageParts,
        { text: `Acting as a world-class fashion exhibition curator (like Andrew Bolton), analyze this fashion collection: "${collectionName}". Description: ${description}. 
        Create a detailed exhibition strategy including a theme name, concept, lighting, music/soundscape, spatial arrangement, and suggested materials for the installation.` }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          themeName: { type: Type.STRING },
          conceptDescription: { type: Type.STRING },
          lightingStrategy: { type: Type.STRING },
          musicAtmosphere: { type: Type.STRING },
          spatialArrangement: { type: Type.STRING },
          materialsUsed: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["themeName", "conceptDescription", "lightingStrategy", "musicAtmosphere", "spatialArrangement", "materialsUsed"]
      }
    }
  });

  // Access the text property directly (not as a function)
  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }
  return JSON.parse(text.trim());
};

/**
 * Generates a visual concept sketch for the exhibition.
 * Uses gemini-2.5-flash-image for general image generation tasks.
 */
export const generateVisualConcept = async (
  strategy: ExhibitionStrategy
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `A professional architectural 3D render of a high-fashion exhibition titled "${strategy.themeName}". 
  The space shows: ${strategy.spatialArrangement}. 
  Lighting: ${strategy.lightingStrategy}. 
  Materials: ${strategy.materialsUsed.join(', ')}. 
  Atmosphere: Museum quality, sophisticated, avant-garde. Realistic textures, dramatic shadows.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9"
      }
    }
  });

  // Iterating through parts to find the image data as required for nano banana series models
  const candidate = response.candidates?.[0];
  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }
  
  throw new Error("Failed to generate image: No image data returned by the model");
};
