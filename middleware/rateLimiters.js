// middleware/rateLimiters.js
import rateLimit from "express-rate-limit";

// Login rate limiter
export const loginLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, 
  max: 50, 
  message: {
    success: false,
    message: "Too many login attempts. Please try again in 30 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// API rate limiter for general endpoints
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per window
  message: {
    success: false,
    message: "Too many API requests. Please try again in 15 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for sensitive operations
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    message: "Too many requests. Please slow down."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Competition creation rate limiter (admin only)
export const competitionCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 competitions per hour
  message: {
    success: false,
    message: "Too many competition creations. Please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Ticket purchase rate limiter
export const ticketPurchaseLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 ticket purchases per 5 minutes
  message: {
    success: false,
    message: "Too many ticket purchases. Please try again in 5 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Withdrawal request rate limiter
export const withdrawalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 withdrawal requests per hour
  message: {
    success: false,
    message: "Too many withdrawal requests. Please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export default {
  loginLimiter,
  apiLimiter,
  strictLimiter,
  competitionCreationLimiter,
  ticketPurchaseLimiter,
  withdrawalLimiter
};