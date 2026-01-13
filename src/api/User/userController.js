import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import pool from '../../../database.js';
import { generateToken } from '../../../middleware/authHelpers.js';
import userSchemas from './userSchemas.js';
import referralService from '../services/referralService.js';
import fs from 'fs';
import sendEmail, { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail } from '../../Utils/emailSender.js';

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateUniqueReferralCode = async (username) => {
  let referralCode;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    // Generate from username + random numbers
    const cleanUsername = username.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 6);
    const randomSuffix = Math.floor(1000 + Math.random() * 9000); // 4-digit number
    referralCode = cleanUsername + randomSuffix;
    
    // If username is too short, use UUID part
    if (cleanUsername.length < 3) {
      const uuidPart = uuidv4().replace(/-/g, '').substring(0, 10).toUpperCase();
      referralCode = uuidPart;
    }
    
    // Check if code exists
    const [existing] = await pool.query(
      `SELECT id FROM users WHERE referral_code = ?`,
      [referralCode]
    );
    
    if (existing.length === 0) {
      return referralCode;
    }
    
    attempts++;
  } while (attempts < maxAttempts);
  
  // Fallback to UUID if all attempts fail
  return uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase();
};

// Remove uploaded files when validation or processing fails
const cleanupUploadedFiles = (files) => {
  if (!files) return;
  Object.values(files)
    .flat()
    .forEach((file) => {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Failed to delete file:', err);
      }
    });
};

const userController = {
  // Google OAuth: sign in or register with Google ID token
  signInWithGoogle: async (req, res) => {
    try {
      const { idToken } = req.body || {};
      if (!idToken) {
        return res.status(400).json({ success: false, message: "Missing Google idToken" });
      }

      // Lazy import to avoid startup cost if unused
      const { OAuth2Client } = await import("google-auth-library");
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

      let ticket;
      try {
        ticket = await client.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
      } catch (e) {
        return res.status(401).json({ success: false, message: "Invalid Google token" });
      }

      const payload = ticket.getPayload();
      const googleUserId = payload.sub;
      const email = payload.email;
      const emailVerified = !!payload.email_verified;
      const name = payload.name || payload.given_name || "User";
      const picture = payload.picture || null;

      if (!email) {
        return res.status(400).json({ success: false, message: "Google account has no email" });
      }

      // Find existing user by email
      const [users] = await pool.query(
        `SELECT BIN_TO_UUID(id) as id, email, username, password_hash, role, age_verified, profile_photo, email_verified 
         FROM users WHERE email = ?`,
        [email]
      );

      let userId;
      let username;
      let role = "USER";

      if (users.length > 0) {
        // Existing user: ensure email_verified, update photo optionally
        const existing = users[0];
        userId = existing.id;
        username = existing.username;

        if (!existing.email_verified && emailVerified) {
          await pool.query(
            `UPDATE users SET email_verified = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = UUID_TO_BIN(?)`,
            [userId]
          );
        }

        if (picture && picture !== existing.profile_photo) {
          await pool.query(
            `UPDATE users SET profile_photo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = UUID_TO_BIN(?)`,
            [picture, userId]
          );
        }
      } else {
        // New user: register minimal profile
        const saltRounds = 12;
        const dummyPasswordHash = await bcrypt.hash(uuidv4() + googleUserId, saltRounds);
        userId = uuidv4();

        // Derive username from email/name, ensure uniqueness
        const baseUsername = (name || email.split("@")[0])
          .replace(/[^a-zA-Z0-9]/g, "")
          .toLowerCase()
          .slice(0, 20) || "user";
        username = baseUsername;

        // Try a few attempts to avoid collisions
        for (let i = 0; i < 5; i++) {
          const [exists] = await pool.query(`SELECT id FROM users WHERE username = ?`, [username]);
          if (exists.length === 0) break;
          username = baseUsername + Math.floor(Math.random() * 1000);
        }

        const referralCode = await generateUniqueReferralCode(username);

        const connection = await pool.getConnection();
        await connection.beginTransaction();
        try {
          await connection.query(
            `INSERT INTO users (id, email, username, password_hash, role, age_verified, profile_photo, email_verified, referral_code)
             VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              email,
              username,
              dummyPasswordHash,
              role,
              true, // age_verified can be set true or false depending on policy; set true for smoother UX
              picture,
              emailVerified || true, // mark verified given Google validated email
              referralCode,
            ]
          );

          // Optional: insert wallets if not created by triggers
          await connection.query(
            `INSERT IGNORE INTO wallets (id, user_id, type, balance) VALUES 
             (UUID_TO_BIN(?), UUID_TO_BIN(?), 'CASH', 0),
             (UUID_TO_BIN(?), UUID_TO_BIN(?), 'CREDIT', 0)`,
            [uuidv4(), userId, uuidv4(), userId]
          );

          // Record OAuth link for audit
          await connection.query(
            `INSERT INTO oauth_identities (id, user_id, provider, provider_user_id, created_at) 
             VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'google', ?, CURRENT_TIMESTAMP)`,
            [uuidv4(), userId, googleUserId]
          );

          await connection.commit();
        } catch (err) {
          await connection.rollback();
          throw err;
        } finally {
          connection.release();
        }
      }

      // Build response: token + wallets + minimal profile
      const authUserRows = await pool.query(
        `SELECT BIN_TO_UUID(id) as id, email, username, role, age_verified, profile_photo, email_verified, level, xp_points, referral_code, total_referrals,
         universal_tickets, subscription_tier_id, next_billing_date, bank_account_last_4, paypal_email
         FROM users WHERE id = UUID_TO_BIN(?)`,
        [userId]
      );
      const authUser = authUserRows[0][0];

      const token = generateToken({
        id: authUser.id,
        email: authUser.email,
        username: authUser.username,
        role: authUser.role,
      });

      const [wallets] = await pool.query(
        `SELECT type, balance FROM wallets WHERE user_id = UUID_TO_BIN(?)`,
        [userId]
      );
      const cashWallet = wallets.find((w) => w.type === "CASH");
      const creditWallet = wallets.find((w) => w.type === "CREDIT");

      return res.json({
        success: true,
        message: users.length > 0 ? "Login successful" : "Registration successful",
        data: {
          token,
          user: {
            id: authUser.id,
            email: authUser.email,
            username: authUser.username,
            role: authUser.role,
            ageVerified: authUser.age_verified,
            profilePhoto: authUser.profile_photo,
            emailVerified: authUser.email_verified,
            level: authUser?.level || 1,
            xpPoints: authUser?.xp_points || 0,
            referralCode: authUser?.referral_code,
            universalTickets: authUser?.universal_tickets,
            subscriptionTierId: authUser?.subscription_tier_id,
            nextBillingDate: authUser?.next_billing_date,
            bankAccountLast4: authUser?.bank_account_last_4,
            paypalEmail: authUser?.paypal_email,
          },
          wallets: {
            cash: cashWallet ? cashWallet.balance : 0,
            credit: creditWallet ? creditWallet.balance : 0,
          },
        },
      });
    } catch (error) {
      console.error("Google sign-in error:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  },
  registerUser: async (req, res) => {
    try {
      const { error, value } = userSchemas.registerSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const {
        email,
        username,
        password,
        firstName,
        lastName,
        phone,
        dateOfBirth,
        country,
        referralCode,
      } = value;

      // Support referral via link: accept query param `ref` when present
      const referralFromLink = req.query?.ref || req.query?.referral || req.query?.code;
      const effectiveReferralCode = referralFromLink || referralCode || null;

      const [existingUsers] = await pool.query(
        `SELECT id FROM users WHERE email = ? OR username = ?`,
        [email, username]
      );

      if (existingUsers.length > 0) {
        return res.status(409).json({
          success: false,
          message: "User already exists with this email or username",
        });
      }

      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      const userId = uuidv4();
      const connection = await pool.getConnection();

      await connection.beginTransaction();

      try {
        // 1. Generate referral code before inserting user
        const referralCodeForUser = await generateUniqueReferralCode(username);

        // 2. Insert user with referral code and proper role
        await connection.query(
          `INSERT INTO users (
          id, email, phone, username, password_hash, 
          first_name, last_name, date_of_birth, country, 
          kyc_status, role, email_verified, referral_code
        ) VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, 'verified', 'USER', FALSE, ?)`,
          [
            userId,
            email,
            phone,
            username,
            passwordHash,
            firstName,
            lastName,
            dateOfBirth,
            country,
            referralCodeForUser,
          ]
        );

        // Note: Wallets are automatically created by the trigger

        // 3. Create referral record
        await connection.query(
          `INSERT IGNORE INTO referrals (id, user_id, code, current_tier, status) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 1, 'ACTIVE')`,
          [uuidv4(), userId, referralCodeForUser]
        );

        // 4. Generate verification OTP (6-digit code)
        const verificationToken = generateOTP();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        // Store verification token
        await connection.query(
          `INSERT INTO email_verification_tokens (id, user_id, token, expires_at) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?)`,
          [uuidv4(), userId, verificationToken, expiresAt]
        );

        await connection.commit();

        // 6. Send verification email (outside transaction)
        let emailSent = false;
        let emailError = null;

        try {
          // Using the named export for verification email
          const emailResult = await sendVerificationEmail(
            email,
            username,
            verificationToken
          );

          if (emailResult.success) {
            console.log(`✅ Verification email sent successfully to ${email}`);
            emailSent = true;
          } else {
            console.error("❌ Verification email failed:", {
              to: email,
              error: emailResult.message,
              technicalError: emailResult.technicalError,
            });
            emailError = emailResult.message;
          }
        } catch (emailError) {
          console.error("❌ Email sending error:", {
            error: emailError.message,
            to: email,
          });
          emailError = emailError.message;
        }

        // 7. Send welcome email if verification email succeeded
        let welcomeEmailSent = false;
        if (emailSent) {
          try {
            const welcomeResult = await sendWelcomeEmail(email, username);
            if (welcomeResult.success) {
              console.log(`✅ Welcome email sent successfully to ${email}`);
              welcomeEmailSent = true;
            }
          } catch (welcomeError) {
            console.error("❌ Welcome email failed:", welcomeError.message);
          }
        }

        // 8. Process referral if code was provided (body or link)
        if (effectiveReferralCode) {
          try {
            await referralService.processReferral(userId, effectiveReferralCode);
            console.log(
              `✅ Referral processed successfully for user ${username}`
            );
          } catch (referralError) {
            console.error(
              "❌ Referral processing failed:",
              referralError.message
            );
            // Don't fail registration if referral processing fails
          }
        }

        // 9. Get created user data
        const [users] = await pool.query(
          `SELECT 
          BIN_TO_UUID(id) as id, 
          email, 
          username, 
          role, 
          profile_photo, 
          email_verified,
          referral_code,
          universal_tickets, subscription_tier_id, next_billing_date, bank_account_last_4, paypal_email
         FROM users WHERE id = UUID_TO_BIN(?)`,
          [userId]
        );
        const user = users[0];
        // 10. Get wallet info (created by trigger)
        const [wallets] = await pool.query(
          `SELECT type, balance FROM wallets WHERE user_id = UUID_TO_BIN(?)`,
          [userId]
        );

        // 11. Prepare response based on email sending status
        let responseMessage =
          "Registration submitted. Please check your email to verify your account.";
        let responseNotes = [];

        if (!emailSent) {
          responseNotes.push(
            "Verification email could not be sent. You may need to request a new verification email from your account settings."
          );
        } else if (!welcomeEmailSent) {
          responseNotes.push("Welcome email could not be sent.");
        }

        if (emailError) {
          responseNotes.push(`Email error: ${emailError}`);
        }

        res.status(201).json({
          success: true,
          message: responseMessage,
          notes: responseNotes.length > 0 ? responseNotes : undefined,
          data: {
            userId: user.id,
            email: user.email,
            username: user.username,
            emailVerified: user.email_verified,
            referralCode: user.referral_code,
            universalTickets: user.universal_tickets,
            subscriptionTierId: user.subscription_tier_id,
            nextBillingDate: user.next_billing_date,
            bankAccountLast4: user.bank_account_last_4,
            paypalEmail: user.paypal_email,
            wallets: wallets,
            emailDelivery: {
              verificationSent: emailSent,
              welcomeSent: welcomeEmailSent,
              nextSteps: emailSent
                ? "Check your inbox (and spam folder) for verification link"
                : "Please check your email settings or contact support",
            },
          },
        });
      } catch (error) {
        await connection.rollback();
        // Clean up uploaded files on error
        if (req.files) {
          Object.values(req.files)
            .flat()
            .forEach((file) => {
              try {
                fs.unlinkSync(file.path);
              } catch (fsError) {
                console.error("Failed to delete file:", fsError);
              }
            });
        }
        console.error("Registration transaction error:", error);

        // Check for specific error types
        if (error.code === "ER_DUP_ENTRY") {
          return res.status(409).json({
            success: false,
            message:
              "Duplicate entry. Please try again with different details.",
          });
        }

        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Registration error:", error);

      res.status(500).json({
        success: false,
        message: "Internal server error during registration",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
  // Generate a shareable referral link for the authenticated user
  getReferralLink: async (req, res) => {
    try {
      const [users] = await pool.query(
        `SELECT referral_code, BIN_TO_UUID(id) as id FROM users WHERE id = UUID_TO_BIN(?)`,
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      let code = users[0].referral_code;
      if (!code) {
        code = await referralService.generateReferralCode(req.user.id);
      }

      const baseClientUrl = process.env.CLIENT_URL || "https://communityfortune.example";
      const signupLink = `${baseClientUrl}/signup?ref=${encodeURIComponent(code)}`;
      const apiLink = `${process.env.API_BASE_URL || baseClientUrl}/api/users/register?ref=${encodeURIComponent(code)}`;

      res.json({
        success: true,
        data: {
          code,
          links: {
            web: signupLink,
            api: apiLink,
          },
        },
      });
    } catch (error) {
      console.error("Get referral link error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  },
  // Send email verification
  sendVerificationEmail: async (req, res) => {
    try {
      const { error, value } = userSchemas.resendVerificationSchema.validate(
        req.body
      );
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { email } = value;

      // Check if user exists
      const [users] = await pool.query(
        `SELECT BIN_TO_UUID(id) as id, email, username, email_verified 
         FROM users WHERE email = ?`,
        [email]
      );

      if (users.length === 0) {
        // Return success even if user doesn't exist for security
        return res.json({
          success: true,
          message: "If the email exists, a verification link has been sent",
        });
      }

      const user = users[0];

      // Check if already verified
      if (user.email_verified) {
        return res.status(400).json({
          success: false,
          message: "Email is already verified",
        });
      }

      // Generate verification OTP (6-digit code)
      const verificationToken = generateOTP();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store verification token
      await pool.query(
        `INSERT INTO email_verification_tokens (id, user_id, token, expires_at) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?)`,
        [uuidv4(), user.id, verificationToken, expiresAt]
      );

      // Send verification email
      const emailResult = await sendVerificationEmail(
        user.email,
        user.username,
        verificationToken
      );

      if (!emailResult.success) {
        console.error(
          "Failed to send verification email:",
          emailResult.message
        );
        // Still return success to user
      }

      res.json({
        success: true,
        message: "Verification email sent successfully",
      });
    } catch (error) {
      console.error("Send verification email error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  // Verify email with token
  verifyEmail: async (req, res) => {
    try {
      const { error, value } = userSchemas.verifyEmailSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { token } = value;

      // Verify token
      const [tokenRecords] = await pool.query(
        `SELECT evt.token, evt.expires_at, evt.used, BIN_TO_UUID(evt.user_id) as user_id, 
                u.email, u.username, u.email_verified
         FROM email_verification_tokens evt 
         JOIN users u ON evt.user_id = u.id 
         WHERE evt.token = ? AND evt.used = FALSE AND evt.expires_at > NOW()`,
        [token]
      );

      if (tokenRecords.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired verification token",
        });
      }

      const tokenRecord = tokenRecords[0];

      // Check if already verified
      if (tokenRecord.email_verified) {
        return res.status(400).json({
          success: false,
          message: "Email is already verified",
        });
      }

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Update user email verification status
        await connection.query(
          `UPDATE users SET email_verified = TRUE, updated_at = CURRENT_TIMESTAMP 
           WHERE id = UUID_TO_BIN(?)`,
          [tokenRecord.user_id]
        );

        // Mark token as used
        await connection.query(
          `UPDATE email_verification_tokens SET used = TRUE WHERE token = ?`,
          [token]
        );

        await connection.commit();

        res.json({
          success: true,
          message: "Email verified successfully",
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Verify email error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  // Submit KYC documents after registration
  submitKycRequest: async (req, res) => {
    try {
      if (!req.files || !req.files.governmentId || !req.files.selfiePhoto) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({
          success: false,
          message: "Government ID and selfie photo are required",
        });
      }

      const { error, value } = userSchemas.kycVerifySchema.validate(req.body);
      if (error) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { governmentIdType, governmentIdNumber, dateOfBirth } = value;

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Reset existing KYC docs and update user status/metadata
        await connection.query(
          `DELETE FROM kyc_documents WHERE user_id = UUID_TO_BIN(?)`,
          [req.user.id]
        );

        await connection.query(
          `UPDATE users 
           SET government_id_type = ?,
               government_id_number = ?,
               date_of_birth = ?,
               kyc_status = 'under_review',
               kyc_submitted_at = NOW(),
               kyc_verified_at = NULL,
               kyc_rejection_reason = NULL
           WHERE id = UUID_TO_BIN(?)`,
          [governmentIdType, governmentIdNumber, dateOfBirth, req.user.id]
        );

        const docs = [];

        const governmentIdFile = req.files.governmentId?.[0];
        if (governmentIdFile) {
          docs.push({ type: "government_id", file: governmentIdFile });
        }

        const selfiePhotoFile = req.files.selfiePhoto?.[0];
        if (selfiePhotoFile) {
          docs.push({ type: "selfie_photo", file: selfiePhotoFile });
        }

        if (req.files.additionalDocuments) {
          req.files.additionalDocuments.forEach((file) => {
            docs.push({ type: "additional_document", file });
          });
        }

        if (docs.length > 0) {
          const values = docs
            .map(
              () =>
                "(UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?,?, 'pending')"
            )
            .join(", ");

          const params = [];
          docs.forEach((doc) => {
            params.push(
              uuidv4(),
              req.user.id,
              doc.type,
              doc.file.path,
              doc.file.originalname,
              doc.file.mimetype,
              doc.file.size
            );
          });

          await connection.query(
            `INSERT INTO kyc_documents (id, user_id, document_type, file_path, file_name, mime_type, file_size, status) VALUES ${values}`,
            params
          );
        }

        await connection.commit();

        res.json({
          success: true,
          message: "KYC documents submitted successfully. Your verification is under review.",
        });
      } catch (error) {
        await connection.rollback();
        cleanupUploadedFiles(req.files);
        console.error("Submit KYC error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to submit KYC. Please try again.",
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      cleanupUploadedFiles(req.files);
      console.error("Submit KYC error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  // Add KYC status check method
  getKycStatus: async (req, res) => {
    try {
      const [users] = await pool.query(
        `SELECT kyc_status, kyc_submitted_at, kyc_verified_at, kyc_rejection_reason 
         FROM users WHERE id = UUID_TO_BIN(?)`,
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const user = users[0];

      res.json({
        success: true,
        data: {
          kycStatus: user.kyc_status,
          submittedAt: user.kyc_submitted_at,
          verifiedAt: user.kyc_verified_at,
          rejectionReason: user.kyc_rejection_reason,
        },
      });
    } catch (error) {
      console.error("Get KYC status error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  // Updated loginUser method to check email verification
  loginUser: async (req, res) => {
    try {
      const { error, value } = userSchemas.loginSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { email, password } = value;
      const [users] = await pool.query(
        `SELECT BIN_TO_UUID(id) as id, email, username, password_hash, role, age_verified, profile_photo, email_verified 
         FROM users WHERE email = ?`,
        [email]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      const user = users[0];

      const isValidPassword = await bcrypt.compare(
        password,
        user.password_hash
      );
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      // Check if email is verified
      if (!user.email_verified) {
        return res.status(403).json({
          success: false,
          message: "Please verify your email before logging in",
          code: "EMAIL_NOT_VERIFIED",
        });
      }
      const token = generateToken(user);
      const [wallets] = await pool.query(
        `SELECT type, balance FROM wallets WHERE user_id = UUID_TO_BIN(?)`,
        [user.id]
      );

      const cashWallet = wallets.find((w) => w.type === "CASH");
      const creditWallet = wallets.find((w) => w.type === "CREDIT");

      // Get user level and XP info
      const [userInfo] = await pool.query(
        `SELECT level, xp_points, referral_code, total_referrals 
         FROM users WHERE id = UUID_TO_BIN(?)`,
        [user.id]
      );

      const userStats = userInfo[0];

      res.json({
        success: true,
        message: "Login successful",
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            ageVerified: user.age_verified,
            profilePhoto: user.profile_photo,
            emailVerified: user.email_verified,
            level: userStats?.level || 1,
            xpPoints: userStats?.xp_points || 0,
            referralCode: userStats?.referral_code,
          },
          wallets: {
            cash: cashWallet ? cashWallet.balance : 0,
            credit: creditWallet ? creditWallet.balance : 0,
          },
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  getProfile: async (req, res) => {
    try {
      const [users] = await pool.query(
        `SELECT BIN_TO_UUID(id) as id, email, username, role, age_verified, profile_photo, phone, created_at,
                level, xp_points, referral_code, total_referrals, email_verified,
                universal_tickets, subscription_tier_id, next_billing_date, bank_account_last_4, paypal_email
         FROM users WHERE id = UUID_TO_BIN(?)`,
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const user = users[0];

      const [wallets] = await pool.query(
        `SELECT type, balance FROM wallets WHERE user_id = UUID_TO_BIN(?)`,
        [user.id]
      );

      const cashWallet = wallets.find((w) => w.type === "CASH");
      const creditWallet = wallets.find((w) => w.type === "CREDIT");

      // Get level information
      const [levelInfo] = await pool.query(
        `SELECT level_name, xp_required, perks 
         FROM user_levels WHERE level = ?`,
        [user.level]
      );

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            ageVerified: user.age_verified,
            profilePhoto: user.profile_photo,
            phone: user.phone,
            createdAt: user.created_at,
            emailVerified: user.email_verified,
            level: user.level,
            xpPoints: user.xp_points,
            referralCode: user.referral_code,
            totalReferrals: user.total_referrals,
            currentLevel: levelInfo[0] || {},
            universalTickets: user.universal_tickets,
            subscriptionTierId: user.subscription_tier_id,
            nextBillingDate: user.next_billing_date,
            bankAccountLast4: user.bank_account_last_4,
            paypalEmail: user.paypal_email,
          },
          wallets: {
            cash: cashWallet ? cashWallet.balance : 0,
            credit: creditWallet ? creditWallet.balance : 0,
          },
        },
      });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  updateProfile: async (req, res) => {
    try {
      const { error, value } = userSchemas.updateProfileSchema.validate(
        req.body
      );
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { username, profile_photo, phone } = value;

      const updates = [];
      const params = [];

      if (username) {
        updates.push("username = ?");
        params.push(username);
      }

      if (profile_photo !== undefined) {
        updates.push("profile_photo = ?");
        params.push(profile_photo);
      }

      if (phone !== undefined) {
        updates.push("phone = ?");
        params.push(phone);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid fields to update",
        });
      }

      if (username) {
        const [existingUsers] = await pool.query(
          `SELECT id FROM users WHERE username = ? AND id != UUID_TO_BIN(?)`,
          [username, req.user.id]
        );

        if (existingUsers.length > 0) {
          return res.status(409).json({
            success: false,
            message: "Username already taken",
          });
        }
      }

      params.push(req.user.id);

      await pool.query(
        `UPDATE users SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP 
         WHERE id = UUID_TO_BIN(?)`,
        params
      );

      const [users] = await pool.query(
        `SELECT BIN_TO_UUID(id) as id, email, username, role, age_verified, profile_photo, phone, email_verified
         FROM users WHERE id = UUID_TO_BIN(?)`,
        [req.user.id]
      );

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: {
          user: users[0],
        },
      });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  changePassword: async (req, res) => {
    try {
      const { error, value } = userSchemas.changePasswordSchema.validate(
        req.body
      );
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { currentPassword, newPassword } = value;

      const [users] = await pool.query(
        `SELECT password_hash FROM users WHERE id = UUID_TO_BIN(?)`,
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const isValidPassword = await bcrypt.compare(
        currentPassword,
        users[0].password_hash
      );
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      const saltRounds = 12;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      await pool.query(
        `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = UUID_TO_BIN(?)`,
        [newPasswordHash, req.user.id]
      );

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  requestPasswordReset: async (req, res) => {
    try {
      const { error, value } = userSchemas.resetPasswordSchema.validate(
        req.body
      );
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { email } = value;

      const [users] = await pool.query(
        `SELECT BIN_TO_UUID(id) as id, email, username FROM users WHERE email = ?`,
        [email]
      );

      if (users.length === 0) {
        return res.json({
          success: true,
          message: "If the email exists, a reset link has been sent",
        });
      }

      const user = users[0];
      const resetToken = generateOTP(); // Generate 6-digit OTP
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Save reset token to database
      await pool.query(
        `INSERT INTO password_resets (id, user_id, token, expires_at) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?)`,
        [uuidv4(), user.id, resetToken, expiresAt]
      );

      // Send email with OTP
      const emailResult = await sendPasswordResetEmail(
        user.email,
        user.username,
        resetToken
      );

      if (!emailResult.success) {
        console.error("Failed to send reset email:", emailResult.message);
        // Still return success to user for security
      }
      res.json({
        success: true,
        message: "If the email exists, a reset link has been sent",
      });
    } catch (error) {
      console.error("Password reset request error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  confirmPasswordReset: async (req, res) => {
    try {
      const { error, value } = userSchemas.confirmResetPasswordSchema.validate(
        req.body
      );
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { token, newPassword } = value;

      // Verify token
      const [resetRecords] = await pool.query(
        `SELECT pr.token, pr.expires_at, pr.used, BIN_TO_UUID(pr.user_id) as user_id, u.email, u.username
         FROM password_resets pr 
         JOIN users u ON pr.user_id = u.id 
         WHERE pr.token = ? AND pr.used = FALSE AND pr.expires_at > NOW()`,
        [token]
      );

      if (resetRecords.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired reset token",
        });
      }

      const resetRecord = resetRecords[0];

      // Hash new password
      const saltRounds = 12;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Update password
        await connection.query(
          `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE id = UUID_TO_BIN(?)`,
          [newPasswordHash, resetRecord.user_id]
        );

        // Mark token as used
        await connection.query(
          `UPDATE password_resets SET used = TRUE WHERE token = ?`,
          [token]
        );

        await connection.commit();

        res.json({
          success: true,
          message: "Password reset successfully",
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Password reset confirmation error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  adminCreateUser: async (req, res) => {
    try {
      const { error, value } = userSchemas.adminCreateSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { email, username, password, phone, role } = value;

      const [existingUsers] = await pool.query(
        `SELECT id FROM users WHERE email = ? OR username = ?`,
        [email, username]
      );

      if (existingUsers.length > 0) {
        return res.status(409).json({
          success: false,
          message: "User already exists with this email or username",
        });
      }

      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      const userId = uuidv4();

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Generate referral code for admin-created user
        const referralCodeForUser = await generateUniqueReferralCode(username);

        await connection.query(
          `INSERT INTO users (id, email, phone, username, password_hash, role, email_verified, referral_code) 
           VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, TRUE, ?)`,
          [
            userId,
            email,
            phone,
            username,
            passwordHash,
            role,
            referralCodeForUser,
          ]
        );

        // Create referral record
        await connection.query(
          `INSERT IGNORE INTO referrals (id, user_id, code, current_tier, status) 
           VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 1, 'ACTIVE')`,
          [uuidv4(), userId, referralCodeForUser]
        );

        await connection.query(
          `INSERT INTO admin_activities (id, admin_id, action, target_id, module) 
           VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, UUID_TO_BIN(?), 'users')`,
          [uuidv4(), req.user.id, `Created ${role} user: ${username}`, userId]
        );

        await connection.commit();

        const [users] = await pool.query(
          `SELECT BIN_TO_UUID(id) as id, email, username, role, age_verified, profile_photo, email_verified 
           FROM users WHERE id = UUID_TO_BIN(?)`,
          [userId]
        );

        res.status(201).json({
          success: true,
          message: `${role} user created successfully`,
          data: {
            user: users[0],
          },
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Admin create user error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  verifyAge: async (req, res) => {
    try {
      await pool.query(
        `UPDATE users SET age_verified = TRUE, updated_at = CURRENT_TIMESTAMP 
         WHERE id = UUID_TO_BIN(?)`,
        [req.user.id]
      );

      res.json({
        success: true,
        message: "Age verification completed successfully",
      });
    } catch (error) {
      console.error("Age verification error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  // REFERRAL SYSTEM METHODS

  // Generate or update referral code
  generateReferralCode: async (req, res) => {
    try {
      const { error, value } = userSchemas.generateReferralSchema.validate(
        req.body
      );
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { customCode } = value;

      // Check if user already has a referral code
      const [users] = await pool.query(
        `SELECT referral_code FROM users WHERE id = UUID_TO_BIN(?)`,
        [req.user.id]
      );

      if (users[0]?.referral_code) {
        return res.status(400).json({
          success: false,
          message: "You already have a referral code",
          data: { referralCode: users[0].referral_code },
        });
      }

      let referralCode;

      if (customCode) {
        // Check if custom code is available
        const [existing] = await pool.query(
          `SELECT id FROM users WHERE referral_code = ?`,
          [customCode]
        );

        if (existing.length > 0) {
          return res.status(409).json({
            success: false,
            message: "Referral code already taken",
          });
        }
        referralCode = customCode;
      } else {
        // Generate unique code
        const [userInfo] = await pool.query(
          `SELECT username FROM users WHERE id = UUID_TO_BIN(?)`,
          [req.user.id]
        );
        referralCode = await generateUniqueReferralCode(
          userInfo[0]?.username || "USER"
        );
      }

      // Update user's referral code
      await pool.query(
        `UPDATE users SET referral_code = ? WHERE id = UUID_TO_BIN(?)`,
        [referralCode, req.user.id]
      );

      // Create referral record
      await pool.query(
        `INSERT IGNORE INTO referrals (id, user_id, code, current_tier, status) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 1, 'ACTIVE')`,
        [uuidv4(), req.user.id, referralCode]
      );

      res.json({
        success: true,
        message: "Referral code generated successfully",
        data: { referralCode },
      });
    } catch (error) {
      console.error("Generate referral code error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  },

  // Get referral stats and rewards
  getReferralStats: async (req, res) => {
    try {
      const [userInfo] = await pool.query(
        `SELECT referral_code, total_referrals FROM users WHERE id = UUID_TO_BIN(?)`,
        [req.user.id]
      );

      const [referralInfo] = await pool.query(
        `SELECT total_earned, current_tier FROM referrals WHERE user_id = UUID_TO_BIN(?)`,
        [req.user.id]
      );

      const [referralHistory] = await pool.query(
        `SELECT COUNT(*) as count FROM referral_history WHERE referral_id = 
         (SELECT id FROM referrals WHERE user_id = UUID_TO_BIN(?))`,
        [req.user.id]
      );

      const stats = {
        referralCode: userInfo[0]?.referral_code,
        totalReferrals: userInfo[0]?.total_referrals || 0,
        totalEarned: referralInfo[0]?.total_earned || 0,
        currentTier: referralInfo[0]?.current_tier || 1,
        referralCount: referralHistory[0]?.count || 0,
      };

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Get referral stats error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  // Claim reward
  claimReward: async (req, res) => {
    try {
      const { error, value } = userSchemas.rewardClaimSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { rewardId } = value;

      // Check if reward exists and belongs to user
      const [rewards] = await pool.query(
        `SELECT reward_type, reward_value, reward_given 
         FROM referral_history 
         WHERE id = UUID_TO_BIN(?) AND referral_id = 
           (SELECT id FROM referrals WHERE user_id = UUID_TO_BIN(?))`,
        [rewardId, req.user.id]
      );

      if (rewards.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Reward not found",
        });
      }

      const reward = rewards[0];

      if (reward.reward_given) {
        return res.status(400).json({
          success: false,
          message: "Reward already claimed",
        });
      }

      // Process reward based on type
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Update reward status
        await connection.query(
          "UPDATE referral_history SET reward_given = TRUE, reward_claimed_at = NOW() WHERE id = UUID_TO_BIN(?)",
          [rewardId]
        );

        // Add to appropriate wallet
        if (reward.reward_type === "CREDIT") {
          await connection.query(
            `UPDATE wallets SET balance = balance + ? 
             WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
            [reward.reward_value, req.user.id]
          );
        } else if (reward.reward_type === "CASH") {
          await connection.query(
            `UPDATE wallets SET balance = balance + ? 
             WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
            [reward.reward_value, req.user.id]
          );
        }

        await connection.commit();

        res.json({
          success: true,
          message: "Reward claimed successfully",
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Claim reward error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  // Admin method to initialize level system
  adminInitializeLevels: async (req, res) => {
    try {
      const levels = [
        {
          level: 1,
          level_name: "Beginner",
          xp_required: 0,
          perks:
            '{"credit": 0, "discount": 0, "tickets": 0, "description": "Welcome to Community Fortune!"}',
        },
        {
          level: 2,
          level_name: "Explorer",
          xp_required: 1000,
          perks:
            '{"credit": 25, "discount": 5, "tickets": 1, "description": "5% discount on all purchases"}',
        },
        {
          level: 3,
          level_name: "Regular",
          xp_required: 5000,
          perks:
            '{"credit": 50, "discount": 10, "tickets": 2, "description": "10% discount + extra tickets"}',
        },
        {
          level: 4,
          level_name: "Enthusiast",
          xp_required: 15000,
          perks:
            '{"credit": 100, "discount": 15, "tickets": 5, "description": "15% discount + bonus credits"}',
        },
        {
          level: 5,
          level_name: "VIP",
          xp_required: 30000,
          perks:
            '{"credit": 200, "discount": 20, "tickets": 10, "description": "20% discount + VIP rewards"}',
        },
        {
          level: 6,
          level_name: "Elite",
          xp_required: 60000,
          perks:
            '{"credit": 500, "discount": 25, "tickets": 20, "description": "25% discount + Elite status"}',
        },
      ];

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        for (const level of levels) {
          await connection.query(
            `INSERT INTO user_levels (level, level_name, xp_required, perks) 
             VALUES (?, ?, ?, ?) 
             ON DUPLICATE KEY UPDATE level_name = ?, xp_required = ?, perks = ?`,
            [
              level.level,
              level.level_name,
              level.xp_required,
              level.perks,
              level.level_name,
              level.xp_required,
              level.perks,
            ]
          );
        }

        await connection.query(
          `INSERT INTO admin_activities (id, admin_id, action, module) 
           VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'Initialized level system', 'referral')`,
          [uuidv4(), req.user.id]
        );

        await connection.commit();

        res.json({
          success: true,
          message: "Level system initialized successfully",
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Initialize levels error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
};

export default userController;
