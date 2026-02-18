
import { GoogleGenAI, Type } from "@google/genai";
import { ExhibitionStrategy, PromotionalAssets } from "../types";

const parseGeminiJson = (text: string) => {
  try {
    const cleaned = text.replace(/```json\n?|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error("The digital curator returned an unexpected format. Please refresh and try again.");
  }
};

export const generateExhibitionStrategy = async (
  collectionName: string,
  description: string,
  images: string[]
): Promise<ExhibitionStrategy> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const imageParts = images.map(img => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: img.split(',')[1] || img
    }
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        ...imageParts,
        { text: `Acting as a world-class fashion exhibition curator, analyze this fashion collection: "${collectionName}". Description: ${description}. 
        Create a detailed exhibition strategy including a theme name, a short evocative tagline, concept, lighting, music/soundscape, spatial arrangement, and materials.
        You MUST respond in raw JSON format matching the requested schema.` }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          themeName: { type: Type.STRING },
          tagline: { type: Type.STRING },
          conceptDescription: { type: Type.STRING },
          lightingStrategy: { type: Type.STRING },
          musicAtmosphere: { type: Type.STRING },
          spatialArrangement: { type: Type.STRING },
          materialsUsed: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["themeName", "tagline", "conceptDescription", "lightingStrategy", "musicAtmosphere", "spatialArrangement", "materialsUsed"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("The digital curator is currently unavailable.");
  return parseGeminiJson(text);
};

export const generatePromotionalSuite = async (
  collection: { name: string; strategy: ExhibitionStrategy }
): Promise<PromotionalAssets> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const copyResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Write promotional copy for a fashion exhibition. 
    Collection: ${collection.name}. 
    Theme: ${collection.strategy.themeName}. 
    Tagline: ${collection.strategy.tagline}.
    Provide: 1. A punchy Instagram caption with hashtags. 2. A sophisticated 2-sentence press snippet.
    Respond in raw JSON format.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          instagramCaption: { type: Type.STRING },
          pressSnippet: { type: Type.STRING }
        },
        required: ["instagramCaption", "pressSnippet"]
      }
    }
  });

  const copy = parseGeminiJson(copyResponse.text || "{}");

  const posterResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ 
        text: `A high-end cinematic fashion advertisement poster for an exhibition titled "${collection.strategy.themeName}". 
        Style: Vogue editorial, luxury, minimalist but dramatic. 
        Atmosphere: Avant-garde installation in the background, sharp fashion silhouette in the foreground. 
        Lighting: High contrast, dramatic shadows.` 
      }]
    },
    config: {
      imageConfig: {
        aspectRatio: "3:4"
      }
    }
  });

  let posterUrl = "";
  const candidate = posterResponse.candidates?.[0];
  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        posterUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
  }

  return {
    tagline: collection.strategy.tagline,
    instagramCaption: copy.instagramCaption,
    pressSnippet: copy.pressSnippet,
    posterUrl
  };
};

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

  const candidate = response.candidates?.[0];
  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }
  
  throw new Error("Failed to generate visual render.");
};
