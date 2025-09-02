const crypto = require('crypto');

class EncryptionUtil {
    constructor() {
        this.encryptionKey = process.env.ENCRYPTION_SECRET || crypto.randomBytes(32);
        if (typeof this.encryptionKey === 'string') {
            this.encryptionKey = Buffer.from(this.encryptionKey, 'hex');
        }
    }

    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    decrypt(encryptedText) {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
}

module.exports = new EncryptionUtil();
