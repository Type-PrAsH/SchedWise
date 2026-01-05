import { GoogleGenAI, Type } from "@google/genai";
import { Skill, TimeSlot, Suggestion, ScheduleEntry } from "../types";

// ✅ Vite-safe API key access
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
  throw new Error("❌ Gemini API key missing. Check .env (VITE_GEMINI_API_KEY).");
}

// ✅ Single shared client
const ai = new GoogleGenAI({ apiKey: API_KEY });

export const geminiService = {
  async getSuggestions(slot: TimeSlot, skills: Skill[]): Promise<Suggestion[]> {
    const targetDuration = Math.max(5, slot.durationMinutes - 10);

    const prompt = `Context: ${slot.durationMinutes} min free. Skills: ${JSON.stringify(skills)}.
Task: Suggest 3 specific activities.
Guidelines:
- <30m: light tasks
- 30–60m: practice
- >60m: deep study
- Match priorities
- Exactly one recommended:true
- Include youtubeSearchQuery around ${targetDuration}m
Output: JSON array.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          temperature: 0.7,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                duration: { type: Type.NUMBER },
                type: { type: Type.STRING },
                skill: { type: Type.STRING },
                recommended: { type: Type.BOOLEAN },
                youtubeSearchQuery: { type: Type.STRING }
              }
            }
          }
        }
      });

      return JSON.parse(response.text || "[]");
    } catch (e) {
      console.error("Failed to generate suggestions", e);
      return [];
    }
  },

  async analyzeTimetableFile(base64: string, mimeType: string): Promise<ScheduleEntry[]> {
    const prompt = `Analyze timetable.
Extract busy/free slots (HH:mm).
Return JSON array.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { inlineData: { data: base64, mimeType } },
        { text: prompt }
      ],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json"
      }
    });

    const entries = JSON.parse(response.text || "[]");
    return entries.map((e: any, i: number) => ({
      ...e,
      id: `ai-${Date.now()}-${i}`
    }));
  },

  
  async chatAssistant(message: string, profile: any, history: any[] = []) {
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      history,

      config: {
  thinkingConfig: { thinkingBudget: 0 },
  maxOutputTokens: 120,
  temperature: 0.4,
  systemInstruction: `
You are SchedWise an AI student planner.

USER OPTED SKILLS (SOURCE OF TRUTH):
${JSON.stringify(profile?.skills || [])}

RESPONSE RULES:
- Suggestions ONLY. No explanations.
- MAXIMUM 5 short points.
- Time-aware and actionable.
- EXACTLY ONE item must be marked "(Recommended)".

TIME LOGIC:
- User provides free time in minutes or hours.
- NEVER exceed available free time.
- >=60 min → deep-focus tasks (~50 min).
- <30 min → light tasks only.

FORMAT:
- Numbered list only.
- One line per suggestion.
- Short, crisp sentences.
`


      }
    });

    const response = await chat.sendMessage({ message });
    return response.text || "I'm recalibrating. Try again.";
  }
};
