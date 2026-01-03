import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth } from "../src/firebase";

console.log("AUTH INSTANCE (login):", auth);

const provider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, provider);
  return result.user;
};

export const logout = async () => {
  await signOut(auth);
};
