/**
 * AES-256-GCM Encryption/Decryption for sensitive data (user API keys)
 * 
 * Requires ENCRYPTION_KEY environment variable (base64-encoded 32-byte key).
 * Generate with: openssl rand -base64 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16  // 128 bits
const TAG_LENGTH = 16 // 128 bits

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set')
  }
  
  const keyBuffer = Buffer.from(key, 'base64')
  if (keyBuffer.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte base64-encoded string')
  }
  
  return keyBuffer
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string containing: IV + ciphertext + auth tag
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  
  const cipher = createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(plaintext, 'utf8')
  encrypted = Buffer.concat([encrypted, cipher.final()])
  
  const tag = cipher.getAuthTag()
  
  // Format: base64(IV + ciphertext + tag)
  const combined = Buffer.concat([iv, encrypted, tag])
  return combined.toString('base64')
}

/**
 * Decrypt a string encrypted with encrypt().
 * Expects a base64 string containing: IV + ciphertext + auth tag
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey()
  const combined = Buffer.from(encryptedBase64, 'base64')
  
  if (combined.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted data: too short')
  }
  
  const iv = combined.subarray(0, IV_LENGTH)
  const tag = combined.subarray(combined.length - TAG_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH)
  
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  
  let decrypted = decipher.update(ciphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  
  return decrypted.toString('utf8')
}

/**
 * Check if encryption is properly configured.
 * Returns true if ENCRYPTION_KEY is set and valid.
 */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey()
    return true
  } catch {
    return false
  }
}

/**
 * Check if a string looks like it was encrypted by us (base64, correct minimum length).
 * This is a heuristic — not a guarantee.
 */
export function looksEncrypted(value: string): boolean {
  if (!value) return false
  
  try {
    const buf = Buffer.from(value, 'base64')
    // Must be at least IV + tag + 1 byte of ciphertext
    return buf.length >= IV_LENGTH + TAG_LENGTH + 1 && 
           // Re-encoding should match (i.e. it's valid base64)
           buf.toString('base64') === value
  } catch {
    return false
  }
}
