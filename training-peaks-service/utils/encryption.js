const crypto = require('crypto');

class EncryptionUtil {
    constructor() {
        // Generate a fixed 32-byte key for AES-256
        const envKey = process.env.ENCRYPTION_SECRET;
        if (envKey && envKey.length >= 32) {
            // Use first 32 characters if long enough
            this.encryptionKey = Buffer.from(envKey.substring(0, 32), 'utf8');
        } else if (envKey) {
            // Pad short key to 32 bytes
            const paddedKey = (envKey + '0'.repeat(32)).substring(0, 32);
            this.encryptionKey = Buffer.from(paddedKey, 'utf8');
        } else {
            // Generate a random 32-byte key
            this.encryptionKey = crypto.randomBytes(32);
        }
        
        console.log(`🔐 Encryption key length: ${this.encryptionKey.length} bytes`);
    }

    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return {
            encryptedData: encrypted,
            iv: iv.toString('hex')
        };
    }

    decrypt(encryptedData) {
        // Handle both old format (string) and new format (object)
        let iv, encrypted;
        
        if (typeof encryptedData === 'string') {
            // Old format: "iv:encrypted"
            const parts = encryptedData.split(':');
            iv = Buffer.from(parts[0], 'hex');
            encrypted = parts[1];
        } else {
            // New format: { encryptedData, iv }
            iv = Buffer.from(encryptedData.iv, 'hex');
            encrypted = encryptedData.encryptedData;
        }
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
}

module.exports = new EncryptionUtil();
