import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../src/firebase";

export const loadUserData = async (uid: string) => {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
};

export const saveUserData = async (uid: string, data: any) => {
  const ref = doc(db, "users", uid);
  await setDoc(ref, data, { merge: true });
};
