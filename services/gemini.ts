
import { GoogleGenAI, Type } from "@google/genai";
import { Skill, TimeSlot, Suggestion, ScheduleEntry } from "../types";

// Helper to get client with current API key
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const geminiService = {
  async getSuggestions(slot: TimeSlot, skills: Skill[]): Promise<Suggestion[]> {
    const ai = getClient();
    const targetDuration = Math.max(5, slot.durationMinutes - 10);
    
    // Streamlined prompt to reduce input processing time
    const prompt = `Context: ${slot.durationMinutes} min free. Skills: ${JSON.stringify(skills)}.
    Task: Suggest 3 specific activities. 
    Guidelines:
    - <30m: light tasks (review, cards).
    - 30-60m: practice (problems, drill).
    - >60m: deep study (project, concepts).
    - Match priorities. Witty student tone.
    - Exactly one 'recommended: true'.
    - 'youtubeSearchQuery' for educational video around ${targetDuration}m.
    Output: JSON array of 3 objects.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          temperature: 0.7,
          thinkingConfig: { thinkingBudget: 0 }, // Disable reasoning for speed
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                duration: { type: Type.NUMBER },
                type: { type: Type.STRING, enum: ['light', 'practice', 'deep'] },
                skill: { type: Type.STRING },
                recommended: { type: Type.BOOLEAN },
                youtubeSearchQuery: { type: Type.STRING }
              },
              required: ['title', 'description', 'duration', 'type', 'skill', 'youtubeSearchQuery']
            }
          }
        }
      });

      return JSON.parse(response.text || '[]');
    } catch (e) {
      console.error("Failed to generate suggestions", e);
      return [];
    }
  },

  async analyzeTimetableFile(base64: string, mimeType: string): Promise<ScheduleEntry[]> {
    const ai = getClient();
    const prompt = `Analyze timetable. 
    1. Identify all busy ranges.
    2. Extract start/end (HH:mm).
    3. Detect gaps and mark as 'Free' (08:00-18:00).
    Return: JSON array.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            inlineData: {
              data: base64,
              mimeType: mimeType
            }
          },
          { text: prompt }
        ],
        config: {
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                from: { type: Type.STRING, description: "Start time in HH:mm format" },
                to: { type: Type.STRING, description: "End time in HH:mm format" },
                status: { type: Type.STRING, enum: ['Busy', 'Free'] }
              },
              required: ['from', 'to', 'status']
            }
          }
        }
      });

      const entries = JSON.parse(response.text || '[]');
      return entries.map((e: any, i: number) => ({
        ...e,
        id: `ai-${Date.now()}-${i}`
      }));
    } catch (e) {
      console.error("Failed to analyze PDF", e);
      throw e;
    }
  },

  async chatAssistant(message: string, profile: any, history: any[] = []) {
    const ai = getClient();
    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        systemInstruction: `You are SchedWise, a smart AI student planner. Tone: Sharp, witty, helpful. User: ${JSON.stringify(profile)}.`
      },
      history: history.length > 0 ? history : []
    });

    const response = await chat.sendMessage({ message });
    return response.text || "I'm recalibrating. Try asking that again.";
  },

  // Fix: Implemented generateImage using gemini-2.5-flash-image model
  async generateImage(prompt: string): Promise<string> {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    // The output response may contain both image and text parts; iterate to find the image part.
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64EncodeString = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }
    throw new Error("No image data found in generation response");
  },

  // Fix: Implemented generateVideo using veo-3.1-fast-generate-preview model
  async generateVideo(prompt: string, onStatus: (msg: string) => void): Promise<string> {
    const ai = getClient();
    onStatus('Initializing temporal generation cluster...');
    
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    while (!operation.done) {
      // Poll for operation status every 10 seconds to update user and check completion
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
      onStatus('Synthesizing motion vectors and high-fidelity frames...');
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
      throw new Error("Video synthesis completed but no download link was retrieved.");
    }

    onStatus('Finalizing high-bandwidth neural transfer...');
    // Must append the API key when fetching from the generated video URI.
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }
};
