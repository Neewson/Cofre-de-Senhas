/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EncryptedData } from './lib/crypto';

/**
 * Encrypted format stored durably in localStorage
 */
export interface SecureRecord {
  id: string;
  encryptedQuestion: EncryptedData;
  encryptedAnswer: EncryptedData;
  requireMasterPasswordToReveal: boolean;
  createdAt: string;
}

/**
 * Decrypted format held safely in Component state/RAM while unlocked
 */
export interface DecryptedRecord {
  id: string;
  question: string;
  answer: string;
  requireMasterPasswordToReveal: boolean;
  createdAt: string;
}

/**
 * System configuration stored locally
 */
export interface SecureConfig {
  verificationPayload: EncryptedData; // Encrypted text 'VERIFICATION_PASSED' to verify password
}
