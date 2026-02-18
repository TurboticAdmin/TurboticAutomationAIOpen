import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

// Lazy initialization of encryption key to avoid build-time errors
let encryptionKey: string | undefined;
let key: Buffer | undefined;

function getEncryptionKey(): Buffer {
  if (!key) {
    encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    // Ensure the key is 32 bytes
    key = crypto.scryptSync(encryptionKey, 'salt', 32);
  }
  return key;
}

export function encrypt(text: string): string {
  try {
    // Handle null, undefined, or empty values
    if (!text || text === null || text === undefined) {
      return '';
    }
    
    // Convert to string if not already
    const textToEncrypt = String(text);
    
    const encryptionKey = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
    let encrypted = cipher.update(textToEncrypt, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt value');
  }
}

export function decrypt(encryptedText: string): string {
  try {
    // Check if the text is already encrypted (has the format iv:encrypted)
    if (encryptedText && encryptedText.length > 0 && !encryptedText.includes(':')) {
      // If not encrypted, return as is (for backward compatibility)
      return encryptedText;
    }

    if (encryptedText && encryptedText.length > 0 && encryptedText.includes(':')) {

      const encryptionKey = getEncryptionKey();
      const textParts = encryptedText.split(':');
      const iv = Buffer.from(textParts.shift()!, 'hex');
      const encryptedData = textParts.join(':');
      const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    else {
      return encryptedText;
    }
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt value');
  }
}