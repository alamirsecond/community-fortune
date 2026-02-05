// middleware/authHelpers.js
import jwt from 'jsonwebtoken';
import secretManager, { SECRET_KEYS } from '../src/Utils/secretManager.js';

export const generateToken = async (user, rememberMe = false) => {
  const secret = await secretManager.getSecret(SECRET_KEYS.JWT, {
    fallbackEnvVar: 'JWT_SECRET'
  });

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      ageVerified: user.age_verified
    },
    secret,
    { expiresIn: rememberMe ? '24h' : '4h' }
  );
};

export const requireAgeVerification = (req, res, next) => {
  if (!req.user.ageVerified) {
    return res.status(403).json({
      success: false,
      message: 'Age verification required to access this resource'
    });
  }
  next();
};