import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCDw82U3na909zHiHwvkuMNOqW5GcOxi54",
  authDomain: "shedwise-28abc.firebaseapp.com",
  projectId: "shedwise-28abc",
  storageBucket: "shedwise-28abc.firebasestorage.app",
  messagingSenderId: "207666442964",
  appId: "1:207666442964:web:0c90bb3f5dcb57d41dc141",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
