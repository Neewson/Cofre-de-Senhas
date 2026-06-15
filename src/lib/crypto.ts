/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Native Web Crypto API wrappers for secure client-side AES-GCM encryption
// Supports PBKDF2 key derivation from a user's Master Password.

/**
 * Encrypted payload format
 */
export interface EncryptedData {
  ciphertext: string; // Base64 encoded encrypted bytes
  iv: string;         // Base64 encoded Initialization Vector (12 bytes)
  salt: string;       // Base64 encoded salt used for PBKDF2 (16 bytes)
}

/**
 * ArrayBuffer to Base64
 */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 to ArrayBuffer
 */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derive an AES-GCM key from password and salt using PBKDF2
 */
async function deriveKey(password: string, saltBuffer: ArrayBuffer): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt solid text with password
 */
export async function encryptText(text: string, password: string): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  // Generate a random 16-byte salt
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  // Generate a random 12-byte IV for AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(password, salt.buffer);

  const encryptedContent = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    data
  );

  return {
    ciphertext: bufferToBase64(encryptedContent),
    iv: bufferToBase64(iv.buffer),
    salt: bufferToBase64(salt.buffer),
  };
}

/**
 * Decrypt payload with password
 * Throws an error if decryption fails (e.g. wrong password)
 */
export async function decryptText(encrypted: EncryptedData, password: string): Promise<string> {
  const saltBuffer = base64ToBuffer(encrypted.salt);
  const ivBuffer = base64ToBuffer(encrypted.iv);
  const ciphertextBuffer = base64ToBuffer(encrypted.ciphertext);

  const key = await deriveKey(password, saltBuffer);

  const decryptedContent = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(ivBuffer),
    },
    key,
    ciphertextBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedContent);
}

/**
 * Helper to generate a verification payload so we can check if a password is correct
 * without decrypting individual files first.
 */
export async function generateVerificationPayload(password: string): Promise<EncryptedData> {
  return encryptText('VERIFICATION_PASSED', password);
}

/**
 * Verify a password against a verification payload
 */
export async function verifyPassword(payload: EncryptedData, password: string): Promise<boolean> {
  try {
    const decrypted = await decryptText(payload, password);
    return decrypted === 'VERIFICATION_PASSED';
  } catch (e) {
    return false;
  }
}
