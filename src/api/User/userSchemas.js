// userSchemas.js
import Joi from "joi";

const userSchemas = {
  registerSchema: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required",
    }),
    username: Joi.string().alphanum().min(3).max(30).required().messages({
      "string.alphanum": "Username must only contain letters and numbers",
      "string.min": "Username must be at least 3 characters long",
      "string.max": "Username cannot exceed 30 characters",
      "any.required": "Username is required",
    }),
    password: Joi.string()
      .min(8)
      .pattern(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
      )
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters long",
        "string.pattern.base":
          "Password must contain at least one uppercase letter, one lowercase letter, one number and one special character",
        "any.required": "Password is required",
      }),
    firstName: Joi.string().max(50).required(),
    lastName: Joi.string().max(50).required(),
    phone: Joi.string().optional().allow("", null),
    dateOfBirth: Joi.date().max("1-1-2006").iso().required().messages({
      "date.max": "You must be at least 18 years old",
      "any.required": "Date of birth is required",
    }),
    country: Joi.string().length(2).uppercase().required(),
    referralCode: Joi.string().max(20).optional().allow("", null),
  }),

  loginSchema: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    rememberMe: Joi.boolean().default(false)

  }),

  updateProfileSchema: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).optional(),
    profile_photo: Joi.string().uri().optional().allow("", null),
    phone: Joi.string().optional().allow("", null),
  }),

  changePasswordSchema: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
  }),

  resetPasswordSchema: Joi.object({
    email: Joi.string().email().required(),
  }),

  confirmResetPasswordSchema: Joi.object({
    token: Joi.string().length(6).pattern(/^[0-9]{6}$/).required().messages({
      'string.length': 'Reset code must be 6 digits',
      'string.pattern.base': 'Reset code must contain only numbers',
      'any.required': 'Reset code is required'
    }),
    newPassword: Joi.string().min(6).required(),
  }),
  
  adminCreateSchema: Joi.object({
    email: Joi.string().email().required(),
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(6).required(),
    phone: Joi.string().optional().allow("", null),
    role: Joi.string().valid("user", "admin").default("user"),
  }),

  kycVerifySchema: Joi.object({
    governmentIdType: Joi.string()
      .valid("passport", "drivers_license", "national_id")
      .required(),
    governmentIdNumber: Joi.string().max(50).required(),
    dateOfBirth: Joi.date().max("1-1-2006").iso().required(),
  }),

  // Email Verification Schemas
  verifyEmailSchema: Joi.object({
    token: Joi.string().length(6).pattern(/^[0-9]{6}$/).required().messages({
      'string.length': 'Verification code must be 6 digits',
      'string.pattern.base': 'Verification code must contain only numbers',
      'any.required': 'Verification code is required'
    }),
  }),

  resendVerificationSchema: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required",
    }),
  }),




  // Referral System Schemas
  referralSchema: Joi.object({
    referralCode: Joi.string().max(20).optional().allow("", null),
  }),

  generateReferralSchema: Joi.object({
    customCode: Joi.string().alphanum().min(3).max(20).optional(),
  }),

  rewardClaimSchema: Joi.object({
    rewardId: Joi.string().uuid().required(),
  }),
};

export default userSchemas;
