// Google sign-in through Firebase Authentication.
// The Firebase settings live in shared/firebaseConfig.js.

import { initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, updateProfile } from "firebase/auth";
import { firebaseConfig as config } from "../shared/firebaseConfig.js";

export const googleReady = !!(config.apiKey && config.authDomain && config.projectId);

let auth;
function getFirebaseAuth() {
  if (!auth) auth = getAuth(initializeApp(config));
  return auth;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(getFirebaseAuth(), provider);
  return result.user;
}

export function signOutGoogle() {
  return googleReady ? signOut(getFirebaseAuth()) : Promise.resolve();
}

/** Calls back with the signed-in user (or null) now and whenever it changes. */
export function watchGoogleUser(callback) {
  if (!googleReady) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

/** Save the name the user chose on their Firebase account (so it follows them to other devices). */
export async function saveDisplayName(name) {
  const user = googleReady ? getFirebaseAuth().currentUser : null;
  if (user) await updateProfile(user, { displayName: name });
}

export function getIdToken(user) {
  return user.getIdToken(true);
}
