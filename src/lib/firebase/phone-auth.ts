'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  RecaptchaVerifier,
  getAuth,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';

/*
 * Client helper for Firebase Phone Auth. Send the `idToken` returned by confirmPhoneOtp to
 * POST /api/auth/phone/verify as { idToken }.
 * With NEXT_PUBLIC_ALLOW_FAKE_SMS=true no Firebase call is made: the server expects
 * { phone, fakeCode: "123456" } instead (see the route), and confirmPhoneOtp returns that code.
 */

export const FAKE_SMS = process.env.NEXT_PUBLIC_ALLOW_FAKE_SMS === 'true';

// NEXT_PUBLIC_* must be read as literal property accesses so Next.js inlines them.
function firebaseAuth() {
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
  return getAuth(app);
}

let verifier: RecaptchaVerifier | null = null;

function recaptcha(containerId: string): RecaptchaVerifier {
  if (!verifier) verifier = new RecaptchaVerifier(firebaseAuth(), containerId, { size: 'invisible' });
  return verifier;
}

function resetRecaptcha(): void {
  verifier?.clear();
  verifier = null;
}

/** Sends the SMS code. `containerId` is the id of an (empty) element in the page for the invisible reCAPTCHA. */
export async function sendPhoneOtp(
  phone: string,
  containerId = 'recaptcha-container',
): Promise<ConfirmationResult | null> {
  if (FAKE_SMS) return null;
  try {
    return await signInWithPhoneNumber(firebaseAuth(), phone, recaptcha(containerId));
  } catch (e) {
    resetRecaptcha(); // a failed reCAPTCHA cannot be reused
    throw e;
  }
}

/** Confirms the code and returns the Firebase ID token for the backend (or the fake code in fake mode). */
export async function confirmPhoneOtp(
  confirmationResult: ConfirmationResult | null,
  code: string,
): Promise<string> {
  if (FAKE_SMS) return code;
  if (!confirmationResult) throw new Error('Primero solicita el código');
  const { user } = await confirmationResult.confirm(code);
  return user.getIdToken();
}
