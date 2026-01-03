import { onRequest } from "firebase-functions/v2/https";
import axios from "axios";
import type { Buffer } from "buffer";
import { randomUUID } from "crypto";


// Force CommonJS callable typing
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> =
  require("pdf-parse");

export async function parseTimetablePdf(buffer: Buffer) {
  const pdfData = await pdfParse(buffer);
  return pdfData.text;
}

/* =====================================================
   CONFIG
===================================================== */

const DAY_START_MINUTES = 6 * 60;   // 06:00
const DAY_END_MINUTES = 22 * 60;    // 22:00

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

/* =====================================================
   TYPES
===================================================== */

type RawAIEntry = {
  day: string;
  start: string;
  end: string;
  type: "Busy" | "Free";
};

type ScheduleEntry = {
  id: string;
  day: number;        // 0 = Monday
  from: string;
  to: string;
  status: "Busy";
};

type FreeSlot = {
  id: string;
  from: string;
  to: string;
  durationMinutes: number;
};

/* =====================================================
   HELPERS
===================================================== */

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const toTime = (m: number) => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

const dayMap: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

/* =====================================================
   MAIN FUNCTION
===================================================== */

export const parseTimetable = onRequest(
  { cors: true, timeoutSeconds: 60 },
  async (req, res) => {
    try {
      /* -------------------------------
         1. Validate Input
      -------------------------------- */
      const pdfBase64 = req.body?.pdfBase64;
      if (!pdfBase64) {
        res.status(400).json({ error: "Missing pdfBase64" });
        return;
      }

      /* -------------------------------
         2. Extract Text from PDF
      -------------------------------- */
      const buffer = Buffer.from(pdfBase64, "base64");
      const text = await parseTimetablePdf(buffer);


      if (!text || text.length < 200) {
        res.json({ schedule: [], freeSlots: [], warnings: ["PDF text too short"] });
        return;
      }

      /* -------------------------------
         3. Ask Gemini (STRICT JSON)
      -------------------------------- */
      const prompt = `
You are a timetable extraction engine.

From the text below, extract ONLY timetable entries.

Rules:
- Output ONLY valid JSON (no markdown)
- Use 24-hour time (HH:MM)
- Days must be Monday to Sunday
- Each entry must include:
  day, start, end, type
- If unsure, mark type as "Busy"

Text:
"""${text}"""
`;

      const geminiRes = await axios.post(
        `${GEMINI_URL}?key=${GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
        }
      );

      const rawText =
        geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error("Empty Gemini response");
      }

      const aiEntries: RawAIEntry[] = JSON.parse(rawText);

      /* -------------------------------
         4. Normalize & Validate
      -------------------------------- */
      const warnings: string[] = [];
      const busyByDay: Record<number, ScheduleEntry[]> = {};

      for (const e of aiEntries) {
        const dayIndex = dayMap[e.day.toLowerCase()];
        if (dayIndex === undefined) continue;

        if (!e.start || !e.end) continue;
        if (toMinutes(e.start) >= toMinutes(e.end)) continue;

        const entry: ScheduleEntry = {
          id: randomUUID(),
          day: dayIndex,
          from: e.start,
          to: e.end,
          status: "Busy",
        };

        busyByDay[dayIndex] ||= [];
        busyByDay[dayIndex].push(entry);
      }

      /* -------------------------------
         5. Compute Free Slots
      -------------------------------- */
      const schedule: ScheduleEntry[] = [];
      const freeSlots: FreeSlot[] = [];

      for (const day in busyByDay) {
        const blocks = busyByDay[day].sort(
          (a, b) => toMinutes(a.from) - toMinutes(b.from)
        );

        let cursor = DAY_START_MINUTES;

        for (const b of blocks) {
          const start = toMinutes(b.from);
          if (start > cursor) {
            freeSlots.push({
              id: randomUUID(),
              from: toTime(cursor),
              to: toTime(start),
              durationMinutes: start - cursor,
            });
          }
          cursor = Math.max(cursor, toMinutes(b.to));
          schedule.push(b);
        }

        if (cursor < DAY_END_MINUTES) {
          freeSlots.push({
            id: randomUUID(),
            from: toTime(cursor),
            to: toTime(DAY_END_MINUTES),
            durationMinutes: DAY_END_MINUTES - cursor,
          });
        }
      }

      /* -------------------------------
         6. Return Result
      -------------------------------- */
      res.json({ schedule, freeSlots, warnings });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Timetable parsing failed" });
    }
  }
);
