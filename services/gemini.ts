
import { GoogleGenAI, Type } from "@google/genai";
import { Skill, TimeSlot, Suggestion, ScheduleEntry } from "../types";

// Helper to get client with current API key
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const geminiService = {
  async getSuggestions(slot: TimeSlot, skills: Skill[]): Promise<Suggestion[]> {
    const ai = getClient();
    const prompt = `Student has a free time slot of ${slot.durationMinutes} minutes.
    Their selected skills and priorities are: ${JSON.stringify(skills)}.
    
    Suggest 3 specific productive activities.
    
    Logic Rules:
    - Slot < 30 min: light task (e.g., flashcards, quick review, reading)
    - Slot 30-60 min: practice task (e.g., solving problems, coding exercise, active recall)
    - Slot > 60 min: deep study (e.g., conceptual learning, project work, writing)
    - Always respect skill priority (High > Medium > Low).
    - Tone: Smart, student-friendly, slightly witty.
    
    Return exactly 3 suggestions in JSON format.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
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
                recommended: { type: Type.BOOLEAN }
              },
              required: ['title', 'description', 'duration', 'type', 'skill']
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
    const prompt = `Analyze this timetable document. 
    1. Identify all busy time ranges (classes, labs, meetings).
    2. Extract start and end times in HH:mm format.
    3. Detect gaps between busy periods and mark them as 'Free' if they are within 08:00 to 18:00.
    4. Ignore subject names or descriptions; focus only on the temporal data.
    
    Return a structured JSON array of schedule entries.`;

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
        systemInstruction: `You are SchedWise, a world-class AI student planner. 
        Tone: Smart, student-friendly, slightly witty. Never rude, but sharp.
        Capabilities: Help with schedule changes, "Class cancelled" scenarios, study advice, and motivation.
        User Profile: ${JSON.stringify(profile)}.
        Philosophy: We don't ask you to find time — we unlock it for you.`
      },
      history: history.length > 0 ? history : []
    });

    const response = await chat.sendMessage({ message });
    return response.text || "I'm recalibrating. Try asking that again.";
  },

  async generateImage(prompt: string): Promise<string> {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error('Image generation failed');
  },

  async generateVideo(prompt: string, onStatus: (msg: string) => void): Promise<string> {
    const ai = getClient();
    onStatus('Submitting generation request...');
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    onStatus('Video is being synthesized. This may take a few minutes...');
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error('Video generation failed');
    
    return `${downloadLink}&key=${process.env.API_KEY}`;
  }
};
