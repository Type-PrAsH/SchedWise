import { GoogleGenAI, Type } from "@google/genai";
import { Skill, TimeSlot, Suggestion, ScheduleEntry } from "../types";

// =====================
// ENV + CLIENT
// =====================
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
  throw new Error("❌ Gemini API key missing. Check .env (VITE_GEMINI_API_KEY).");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// =====================
// INTENT DETECTION (NEW)
// =====================
function detectIntent(message: string) {
  const m = message.toLowerCase();

  if (
    m.includes("class cancelled") ||
    m.includes("free") ||
    m.includes("nothing to do") ||
    m.includes("time is free")
  ) return "FREE_TIME";

  if (
    m.includes("sad") ||
    m.includes("tired") ||
    m.includes("stressed") ||
    m.includes("annoyed") ||
    m.includes("burnt out")
  ) return "EMOTIONAL";

  if (
    m.includes("how") ||
    m.includes("what") ||
    m.includes("help") ||
    m.includes("explain")
  ) return "INFORMATION";

  return "CASUAL";
}

// =====================
// SERVICE
// =====================
export const geminiService = {

  // ---------------------
  // SUGGESTION ENGINE (UNCHANGED)
  // ---------------------
  async getSuggestions(slot: TimeSlot, skills: Skill[]): Promise<Suggestion[]> {
    const targetDuration = Math.max(5, slot.durationMinutes - 10);

    const prompt = `
Context:
User has ${slot.durationMinutes} minutes free.
Skills: ${JSON.stringify(skills)}

Task:
Suggest exactly 3 activities.

Rules:
- <30m → light tasks
- 30–60m → practice tasks
- >60m → deep-focus tasks
- Match skills and priorities
- EXACTLY ONE item must have "recommended": true
- Include youtubeSearchQuery suitable for ~${targetDuration} minutes
- Output ONLY valid JSON array
`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
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

  // ---------------------
  // TIMETABLE ANALYSIS (UNCHANGED)
  // ---------------------
  async analyzeTimetableFile(base64: string, mimeType: string): Promise<ScheduleEntry[]> {
    const prompt = `
Analyze the timetable image.
Extract busy and free time slots in HH:mm format.
Return JSON array only.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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

  // ---------------------
  // CHAT ASSISTANT (FIXED)
  // ---------------------
  async chatAssistant(
    message: string,
    profile: any,
    history: any[] = []
  ) {
    const intent = detectIntent(message);

    const systemInstruction = `
You are SchedWise, a focused AI student productivity assistant.

Your PRIMARY GOAL:
Help the user utilize their available time effectively.

SECONDARY GOAL:
Be polite and human, but keep small talk minimal.

USER SKILLS (REFERENCE):
${JSON.stringify(profile?.skills || [])}

CURRENT INTENT: ${intent}

STRICT BEHAVIOR RULES:

GENERAL:
- Be concise and task-oriented
- Acknowledge feelings in ONE short line max
- Redirect to action quickly
- Avoid motivational fluff and casual chatting
- Do NOT ask lifestyle or reflective questions

IF INTENT = FREE_TIME:
- Brief acknowledgement (1 line)
- Immediately ask:
  1) How much time is available
  2) Confirm focus on productive use by default
- Assume productivity unless user explicitly says otherwise

IF INTENT = EMOTIONAL:
- One short empathetic line
- Quickly ask what task they want to focus on
- Do NOT dwell on emotions

IF INTENT = INFORMATION:
- Give direct answer
- Ask if they want to act on it now

IF INTENT = CASUAL:
- Keep response very short
- Lightly steer toward work or planning

STYLE:
- Professional, calm, efficient
- No emojis
- No unnecessary praise
- Max 3 short sentences unless required
`;


    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      history,
      config: {
        temperature: 0.6,
        maxOutputTokens: 140,
        thinkingConfig: { thinkingBudget: 0 },
        systemInstruction
      }
    });

    const response = await chat.sendMessage({ message });
    return response.text || "I'm here — could you say that again?";
  }
};
