import { httpsCallable } from "firebase/functions";
import { functions } from "../src/firebase";
import { ScheduleEntry, TimeSlot } from "../types";

type TimetableResult = {
  schedule: ScheduleEntry[];
  freeSlots: TimeSlot[];
  warnings?: string[];
};

export const parseTimetablePDF = async (pdfBase64: string) => {
  const parse = httpsCallable<
    { pdfBase64: string },
    TimetableResult
  >(functions, "parseTimetable");

  const res = await parse({ pdfBase64 });
  return res.data;
};
