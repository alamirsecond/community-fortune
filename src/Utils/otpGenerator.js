// utils/otpGenerator.js
class OTPGenerator {
  constructor() {
    this.otpStore = new Map(); // In production, use Redis instead
  }

  // Generate numeric OTP
  generateNumericOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * digits.length)];
    }
    return otp;
  }

  // Generate alphanumeric OTP
  generateAlphaNumericOTP(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += chars[Math.floor(Math.random() * chars.length)];
    }
    return otp;
  }

  // Store OTP with expiration
  storeOTP(identifier, otp, expiresInMinutes = 10) {
    const expiresAt = Date.now() + (expiresInMinutes * 60 * 1000);
    this.otpStore.set(identifier, {
      otp,
      expiresAt,
      attempts: 0
    });

    // Auto cleanup after expiration
    setTimeout(() => {
      this.otpStore.delete(identifier);
    }, expiresInMinutes * 60 * 1000);

    return { otp, expiresAt };
  }

  // Verify OTP
  verifyOTP(identifier, providedOTP, maxAttempts = 3) {
    const stored = this.otpStore.get(identifier);
    
    if (!stored) {
      return { valid: false, message: 'OTP not found or expired' };
    }

    if (Date.now() > stored.expiresAt) {
      this.otpStore.delete(identifier);
      return { valid: false, message: 'OTP expired' };
    }

    if (stored.attempts >= maxAttempts) {
      this.otpStore.delete(identifier);
      return { valid: false, message: 'Too many failed attempts' };
    }

    // Increment attempts
    stored.attempts += 1;

    if (stored.otp !== providedOTP) {
      return { valid: false, message: 'Invalid OTP', attemptsLeft: maxAttempts - stored.attempts };
    }

    // OTP is valid, remove it
    this.otpStore.delete(identifier);
    return { valid: true, message: 'OTP verified successfully' };
  }

  // Get remaining time for OTP
  getRemainingTime(identifier) {
    const stored = this.otpStore.get(identifier);
    if (!stored) return 0;
    
    const remaining = stored.expiresAt - Date.now();
    return Math.max(0, Math.floor(remaining / 1000)); // Return in seconds
  }

  // Check if OTP exists and is valid
  hasValidOTP(identifier) {
    const stored = this.otpStore.get(identifier);
    return stored && Date.now() <= stored.expiresAt;
  }

  // Remove OTP (manual cleanup)
  removeOTP(identifier) {
    return this.otpStore.delete(identifier);
  }

  // Cleanup expired OTPs
  cleanupExpired() {
    const now = Date.now();
    for (const [identifier, data] of this.otpStore.entries()) {
      if (now > data.expiresAt) {
        this.otpStore.delete(identifier);
      }
    }
  }
}

// Create and export a singleton instance
const otpGenerator = new OTPGenerator();
export default otpGenerator;