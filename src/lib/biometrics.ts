// Web Authentication API (WebAuthn) helper for biometric (fingerprint/face) login fallback

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function isBiometricSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isBiometricSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function hasBiometricRegistered(userId: string): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  return !!localStorage.getItem(`bizflow_biometric_${userId}`);
}

export function removeBiometric(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  localStorage.removeItem(`bizflow_biometric_${userId}`);
}

export async function registerBiometric(user: { id: string; name: string }): Promise<{ success: boolean; error?: string }> {
  if (!isBiometricSupported()) {
    return { success: false, error: 'Biometric authentication is not supported on this browser.' };
  }

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    const userIdBytes = new TextEncoder().encode(user.id);

    // Get current domain for WebAuthn RP ID (must be valid hostname or undefined)
    let rpId: string | undefined = window.location.hostname;
    if (!rpId || rpId === 'localhost' || rpId === '127.0.0.1') {
      rpId = undefined; // allow browser default for local dev
    }

    const publicKeyOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: 'MYM BizFlow',
        ...(rpId ? { id: rpId } : {})
      },
      user: {
        id: userIdBytes,
        name: user.name,
        displayName: user.name
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
        { alg: -257, type: 'public-key' } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required'
      },
      timeout: 60000
    };

    const credential = await navigator.credentials.create({
      publicKey: publicKeyOptions
    }) as PublicKeyCredential | null;

    if (!credential) {
      return { success: false, error: 'Registration returned empty credential.' };
    }

    const rawIdB64 = bufferToBase64(credential.rawId);
    const data = {
      rawId: rawIdB64,
      registeredAt: new Date().toISOString(),
      userId: user.id,
      userName: user.name
    };

    localStorage.setItem(`bizflow_biometric_${user.id}`, JSON.stringify(data));
    return { success: true };
  } catch (err: any) {
    console.warn('Biometric registration error:', err);
    let errMsg = 'Biometric setup was cancelled or failed.';
    if (err?.name === 'NotAllowedError') {
      errMsg = 'Biometric prompt was cancelled or timed out.';
    } else if (err?.name === 'InvalidStateError') {
      errMsg = 'Biometrics already registered for this device.';
    } else if (err?.message) {
      errMsg = err.message;
    }
    return { success: false, error: errMsg };
  }
}

export async function verifyBiometric(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!isBiometricSupported()) {
    return { success: false, error: 'Biometrics not supported on this browser.' };
  }

  const storedStr = localStorage.getItem(`bizflow_biometric_${userId}`);
  if (!storedStr) {
    return { success: false, error: 'No biometric credential found for this user.' };
  }

  try {
    const stored = JSON.parse(storedStr);
    const rawIdBuffer = base64ToBuffer(stored.rawId);

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: rawIdBuffer,
            type: 'public-key'
          }
        ],
        userVerification: 'required',
        timeout: 60000
      }
    }) as PublicKeyCredential | null;

    if (!assertion) {
      return { success: false, error: 'Authentication returned no credential.' };
    }

    return { success: true };
  } catch (err: any) {
    console.warn('Biometric verification error:', err);
    let errMsg = 'Biometric scan was cancelled or unrecognized.';
    if (err?.name === 'NotAllowedError') {
      errMsg = 'Biometric prompt was cancelled or failed.';
    } else if (err?.message) {
      errMsg = err.message;
    }
    return { success: false, error: errMsg };
  }
}
