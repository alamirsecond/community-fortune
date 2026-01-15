// middleware/authHelpers.js
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();
const SECRET_KEY = process.env.JWT_SECRET;

export const generateToken = (user,rememberMe = false) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      ageVerified: user.age_verified
    },
    SECRET_KEY,
    { expiresIn: rememberMe ? '24h': '4h' }
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