import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAeqq5gyu_gAWLTgWZGr5D01Y5sPV29EzU",
  authDomain: "expense-tracker-edb60.firebaseapp.com",
  projectId: "expense-tracker-edb60",
  storageBucket: "expense-tracker-edb60.firebasestorage.app",
  messagingSenderId: "755574116866",
  appId: "1:755574116866:web:c03055a9dcf192ab3a8d1b",
};
const app = initializeApp(firebaseConfig);


export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});