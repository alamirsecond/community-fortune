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

// Helper function to format payment method
function formatPaymentMethod(method, includeFullDetails = false) {
  let details = {};
  
  try {
    if (method.account_details) {
      details = typeof method.account_details === 'string' 
        ? JSON.parse(method.account_details) 
        : method.account_details;
    }
  } catch (e) {
    console.error('Error parsing account details:', e);
  }

  const baseMethod = {
    id: method.id,
    type: method.payment_method,
    status: method.status,
    isDefault: false, // Not tracked in this approach
    lastUsed: method.updated_at,
    createdAt: method.created_at,
    updatedAt: method.updated_at
  };

  switch (method.payment_method) {
    case 'BANK_TRANSFER':
      return {
        ...baseMethod,
        displayName: 'Bank Transfer',
        details: includeFullDetails ? {
          bankName: method.bank_name || details.bank_name || '',
          accountNumber: details.account_number || '',
          confirmAccountNumber: details.account_number || '',
          sortCode: details.sort_code ? 
            `${details.sort_code.slice(0, 2)}-${details.sort_code.slice(2, 4)}-${details.sort_code.slice(4, 6)}` : '',
          accountHolder: details.account_holder || ''
        } : {
          bankName: method.bank_name || details.bank_name || '',
          accountNumber: method.bank_account_last_four ? `****${method.bank_account_last_four}` : '',
          accountHolder: details.account_holder || '',
          sortCode: details.sort_code ? 
            `**-**-${details.sort_code.slice(4, 6)}` : ''
        }
      };
    case 'PAYPAL':
      return {
        ...baseMethod,
        displayName: 'PayPal',
        details: includeFullDetails ? {
          email: method.paypal_email || details.email || '',
          confirmEmail: method.paypal_email || details.email || '',
          accountHolderName: details.account_holder || ''
        } : {
          email: maskEmail(method.paypal_email || details.email || ''),
          accountHolder: details.account_holder || ''
        }
      };
    case 'REVOLUT':
      return {
        ...baseMethod,
        displayName: 'Revolut',
        details: includeFullDetails ? {
          phone: details.phone || '',
          confirmPhone: details.phone || '',
          accountHolderName: details.account_holder || '',
          revolutTag: details.revolut_tag || ''
        } : {
          phone: maskPhone(details.phone || ''),
          accountHolder: details.account_holder || '',
          revolutTag: details.revolut_tag || ''
        }
      };
    default:
      return {
        ...baseMethod,
        displayName: method.payment_method,
        details: details
      };
  }
}

// Helper function to mask email
function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return email;
  return `${local[0]}***${local.slice(-1)}@${domain}`;
}
// Add this helper function at the top of your controller file
const notifyAdminsAboutKycSubmission = async (userId) => {
  try {
    // Get user info for notification
    const [userRows] = await pool.query(
      `SELECT username, email FROM users WHERE id = UUID_TO_BIN(?)`,
      [userId]
    );
    
    if (userRows.length > 0) {
      const user = userRows[0];
      
      // Create system alert for admins
      await pool.query(
        `INSERT INTO system_alerts (
          id, type, title, message, source
        ) VALUES (
          UUID_TO_BIN(UUID()),
          'INFO',
          'New KYC Submission',
          ?,
          'KYC'
        )`,
        [`User ${user.username} (${user.email}) has submitted KYC documents for review.`]
      );
      
      // Get admin emails for email notification (optional)
      const [adminRows] = await pool.query(
        `SELECT email FROM users WHERE role IN ('SUPERADMIN', 'ADMIN') AND email_verified = TRUE`
      );
      
      // You can add email sending logic here if needed
      console.log(`KYC submitted by ${user.username} (${user.email}). Notified ${adminRows.length} admins.`);
      
      return true;
    }
    return false;
  } catch (error) {
    console.error("Failed to notify admins:", error);
    return false;
  }
};
async function processReferralRegistration(connection, referredUserId, referralCode) {
  try {
    // 1. Find referrer by referral code
    const [referrers] = await connection.query(
      `SELECT 
        BIN_TO_UUID(u.id) as user_id, 
        u.username, 
        BIN_TO_UUID(rl.id) as referral_link_id
       FROM users u
       JOIN referral_links rl ON u.id = rl.user_id
       WHERE rl.referral_code = ?`,
      [referralCode]
    );

    if (referrers.length === 0) {
      throw new Error('Invalid referral code');
    }

    const referrer = referrers[0];

    // 2. Check if user is referring themselves
    if (referrer.user_id === referredUserId) {
      throw new Error('Cannot refer yourself');
    }

    // 3. Get referral settings to check limits
    const [settings] = await connection.query(
      `SELECT * FROM referral_settings WHERE is_active = TRUE ORDER BY id DESC LIMIT 1`
    );

    if (settings.length === 0) {
      throw new Error('Referral system is not configured');
    }

    const setting = settings[0];

    // 4. Check if referral system has available funds
    if (setting.amount_left < setting.reward_per_referral) {
      throw new Error('Referral system has insufficient funds');
    }

    // 5. Record SIGNUP event
    await connection.query(
      `INSERT INTO referral_events (
        referrer_id, referred_user_id, referral_link_id, 
        event_type, status, created_at
      ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'SIGNUP', 'PENDING', NOW())`,
      [referrer.user_id, referredUserId, referrer.referral_link_id]
    );

    // 6. Update referrer's stats
    await connection.query(
      `UPDATE user_referral_stats 
       SET total_referrals = total_referrals + 1
       WHERE user_id = UUID_TO_BIN(?)`,
      [referrer.user_id]
    );

    // 7. Update referral link stats
    await connection.query(
      `UPDATE referral_links 
       SET total_signups = total_signups + 1
       WHERE id = UUID_TO_BIN(?)`,
      [referrer.referral_link_id]
    );

    console.log(`Referral recorded: ${referrer.username} referred user ${referredUserId}`);
    return true;
  } catch (error) {
    console.error('Error processing referral:', error.message);
    throw error;
  }
}
// Helper function to mask phone
function maskPhone(phone) {
  if (!phone) return '';
  return phone.replace(/\d(?=\d{4})/g, '*');
}
// Helper function to log user activity
const logUserActivity = async (connection, activityData) => {
  try {
    const {
      userId,
      action,
      targetId = null,
      module = 'authentication',
      ipAddress,
      userAgent,
      details = {}
    } = activityData;

    const activityId = uuidv4();
    
    await connection.query(
      `INSERT INTO user_activities (
        id, user_id, action, target_id, module, 
        ip_address, user_agent, details, created_at
      ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, NOW())`,
      [
        activityId,
        userId,
        action,
        targetId,
        module,
        ipAddress,
        userAgent,
        JSON.stringify(details)
      ]
    );
    
    return activityId;
  } catch (error) {
    console.error('Error logging user activity:', error);
    // Don't throw error, just log it
  }
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
  let connection;
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

    const userId = uuidv4(); // This returns a string UUID
    connection = await pool.getConnection();

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
        ) VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'USER', FALSE, ?)`,
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

      // 3. Log registration activity
      await logUserActivity(connection, {
        userId: userId,
        action: 'USER_REGISTERED',
        module: 'authentication',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent') || null,
        details: {
          method: 'email',
          email: email,
          username: username,
          referralCodeUsed: effectiveReferralCode,
          country: country
        }
      });

      // 4. Get default referral tier (usually Bronze)
      const [tiers] = await connection.query(
        `SELECT id FROM referral_tiers WHERE min_referrals = 0 ORDER BY min_referrals LIMIT 1`
      );
      const defaultTierId = tiers.length > 0 ? tiers[0].id : null;

      // 5. Create referral link for the new user
      const referralLinkId = uuidv4();
      await connection.query(
        `INSERT INTO referral_links (
          id, user_id, referral_code, total_clicks, total_signups, 
          total_successful, total_earned, created_at
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 0, 0, 0, 0.00, NOW())`,
        [referralLinkId, userId, referralCodeForUser]
      );

      // 6. Log referral link creation
      await logUserActivity(connection, {
        userId: userId,
        action: 'REFERRAL_LINK_CREATED',
        module: 'referral',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent') || null,
        details: {
          referralCode: referralCodeForUser,
          linkId: referralLinkId
        }
      });

      // 7. Initialize user referral stats with default tier
      await connection.query(
        `INSERT INTO user_referral_stats (
          user_id, current_tier_id, total_referrals, 
          successful_referrals, total_earned, this_month_earned
        ) VALUES (UUID_TO_BIN(?), ?, ?, 0, 0.00, 0.00)`,
        [userId, defaultTierId, 0]
      );

      // 8. Generate verification OTP (6-digit code)
      const verificationToken = generateOTP();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store verification token
      await connection.query(
        `INSERT INTO email_verification_tokens (id, user_id, token, expires_at) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?)`,
        [uuidv4(), userId, verificationToken, expiresAt]
      );

      // 9. Log verification token creation
      await logUserActivity(connection, {
        userId: userId,
        action: 'VERIFICATION_TOKEN_CREATED',
        module: 'authentication',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent') || null,
        details: {
          tokenType: 'email_verification',
          expiresAt: expiresAt
        }
      });

      await connection.commit();

      // 10. Send verification email (outside transaction)
      let emailSent = false;
      let emailError = null;

      try {
        const emailResult = await sendVerificationEmail(
          email,
          username,
          verificationToken
        );

        if (emailResult.success) {
          console.log(`Verification email sent successfully to ${email}`);
          emailSent = true;
          
          // Log email sent activity
          await logUserActivity(connection, {
            userId: userId,
            action: 'VERIFICATION_EMAIL_SENT',
            module: 'authentication',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent') || null,
            details: {
              email: email,
              status: 'success'
            }
          });
        } else {
          console.error("Verification email failed:", {
            to: email,
            error: emailResult.message,
            technicalError: emailResult.technicalError,
          });
          emailError = emailResult.message;
          
          // Log email failure
          await logUserActivity(connection, {
            userId: userId,
            action: 'VERIFICATION_EMAIL_FAILED',
            module: 'authentication',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent') || null,
            details: {
              email: email,
              error: emailResult.message,
              status: 'failed'
            }
          });
        }
      } catch (emailErr) {
        console.error("Email sending error:", {
          error: emailErr.message,
          to: email,
        });
        emailError = emailErr.message;
      }

      // 11. Send welcome email if verification email succeeded
      let welcomeEmailSent = false;
      if (emailSent) {
        try {
          const welcomeResult = await sendWelcomeEmail(email, username);
          if (welcomeResult.success) {
            console.log(`✅ Welcome email sent successfully to ${email}`);
            welcomeEmailSent = true;
            
            // Log welcome email sent
            await logUserActivity(connection, {
              userId: userId,
              action: 'WELCOME_EMAIL_SENT',
              module: 'communication',
              ipAddress: req.ip || req.connection.remoteAddress,
              userAgent: req.get('User-Agent') || null,
              details: {
                email: email,
                status: 'success'
              }
            });
          }
        } catch (welcomeError) {
          console.error("❌ Welcome email failed:", welcomeError.message);
        }
      }

      // 12. Process referral if code was provided (body or link)
      if (effectiveReferralCode) {
        try {
          await processReferralRegistration(connection, userId, effectiveReferralCode);
          console.log(
            `✅ Referral processed successfully for user ${username}`
          );
          
          // Log referral processing
          await logUserActivity(connection, {
            userId: userId,
            action: 'REFERRAL_PROCESSED',
            module: 'referral',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent') || null,
            details: {
              referralCode: effectiveReferralCode,
              status: 'success'
            }
          });
        } catch (referralError) {
          console.error(
            "❌ Referral processing failed:",
            referralError.message
          );
          // Don't fail registration if referral processing fails
          
          // Log referral failure
          await logUserActivity(connection, {
            userId: userId,
            action: 'REFERRAL_PROCESSING_FAILED',
            module: 'referral',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent') || null,
            details: {
              referralCode: effectiveReferralCode,
              error: referralError.message,
              status: 'failed'
            }
          });
        }
      }

      // 13. Get created user data
      const [users] = await pool.query(
        `SELECT 
          BIN_TO_UUID(id) as id, 
          email, 
          username, 
          role, 
          profile_photo, 
          email_verified,
          referral_code
         FROM users WHERE id = UUID_TO_BIN(?)`,
        [userId]
      );
      const user = users[0];

      // 14. Get referral link info
      const [referralLinks] = await pool.query(
        `SELECT 
          BIN_TO_UUID(id) as id, 
          referral_code, 
          total_clicks, 
          total_signups, 
          total_earned 
         FROM referral_links WHERE user_id = UUID_TO_BIN(?)`,
        [userId]
      );

      // 15. Get referral stats
      const [referralStats] = await pool.query(
        `SELECT 
          rs.total_referrals,
          rs.successful_referrals,
          rs.total_earned,
          rs.this_month_earned,
          rt.name as tier_name,
          rt.color as tier_color
         FROM user_referral_stats rs
         LEFT JOIN referral_tiers rt ON rs.current_tier_id = rt.id
         WHERE rs.user_id = UUID_TO_BIN(?)`,
        [userId]
      );

      // 16. Prepare response based on email sending status
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
          referralLink: referralLinks.length > 0 ? referralLinks[0] : null,
          referralStats: referralStats.length > 0 ? referralStats[0] : null,
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
      
      // Log registration failure
      if (userId) {
        await logUserActivity(connection, {
          userId: userId,
          action: 'REGISTRATION_FAILED',
          module: 'authentication',
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent') || null,
          details: {
            error: error.message,
            errorCode: error.code,
            step: 'transaction'
          }
        });
      }
      
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
      if (connection) {
        connection.release();
      }
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
// user_controller.js - Updated submitKycRequest

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
      // 1. Reset existing KYC docs
      await connection.query(
        `DELETE FROM kyc_documents WHERE user_id = UUID_TO_BIN(?)`,
        [req.user.id]
      );

      // 2. Update user info
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

      // 3. Upload documents and get their UUIDs
      let governmentIdDocUUID = null;
      let selfieDocUUID = null;
      const additionalDocUUIDs = [];

      // Upload government ID and get the generated UUID
      const governmentIdFile = req.files.governmentId[0];
      const governmentIdUUID = uuidv4(); // Generate UUID for the document
      await connection.query(
        `INSERT INTO kyc_documents 
         (id, user_id, document_type, file_path, file_name, mime_type, file_size, status) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?, ?, 'pending')`,
        [
          governmentIdUUID,
          req.user.id,
          'government_id',
          governmentIdFile.path,
          governmentIdFile.originalname,
          governmentIdFile.mimetype,
          governmentIdFile.size
        ]
      );
      governmentIdDocUUID = governmentIdUUID;

      // Upload selfie and get the generated UUID
      const selfiePhotoFile = req.files.selfiePhoto[0];
      const selfieUUID = uuidv4(); // Generate UUID for the document
      await connection.query(
        `INSERT INTO kyc_documents 
         (id, user_id, document_type, file_path, file_name, mime_type, file_size, status) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?, ?, 'pending')`,
        [
          selfieUUID,
          req.user.id,
          'selfie_photo',
          selfiePhotoFile.path,
          selfiePhotoFile.originalname,
          selfiePhotoFile.mimetype,
          selfiePhotoFile.size
        ]
      );
      selfieDocUUID = selfieUUID;

      // Upload additional documents
      if (req.files.additionalDocuments) {
        for (const file of req.files.additionalDocuments) {
          const additionalUUID = uuidv4(); // Generate UUID for the document
          await connection.query(
            `INSERT INTO kyc_documents 
             (id, user_id, document_type, file_path, file_name, mime_type, file_size, status) 
             VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?, ?, 'pending')`,
            [
              additionalUUID,
              req.user.id,
              'additional_document',
              file.path,
              file.originalname,
              file.mimetype,
              file.size
            ]
          );
          additionalDocUUIDs.push(additionalUUID);
        }
      }

      // 4. Create verification record
      // First get user info for first_name, last_name
      const [userRows] = await connection.query(
        `SELECT first_name, last_name FROM users WHERE id = UUID_TO_BIN(?)`,
        [req.user.id]
      );
      
      const userInfo = userRows[0] || {};

      await connection.query(
        `INSERT INTO verifications (
          id, user_id, status, verification_type,
          document_type, document_number,
          government_id_doc_id, selfie_doc_id, additional_doc_ids,
          first_name, last_name, date_of_birth,
          government_id_type, government_id_number,
          created_at
        ) VALUES (
          UUID_TO_BIN(UUID()),
          UUID_TO_BIN(?),
          'PENDING',
          'KYC',
          ?,
          ?,
          UUID_TO_BIN(?),
          UUID_TO_BIN(?),
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          NOW()
        )`,
        [
          req.user.id,
          governmentIdType,
          governmentIdNumber,
          governmentIdDocUUID,  // Use the actual UUID string
          selfieDocUUID,        // Use the actual UUID string
          JSON.stringify(additionalDocUUIDs),
          userInfo.first_name || '',
          userInfo.last_name || '',
          dateOfBirth,
          governmentIdType,
          governmentIdNumber
        ]
      );

      // 5. Create kyc_reviews record
      await connection.query(
        `INSERT INTO kyc_reviews (
          id, user_id, old_status, new_status
        ) VALUES (
          UUID_TO_BIN(UUID()),
          UUID_TO_BIN(?),
          'pending',
          'under_review'
        )`,
        [req.user.id]
      );

      await connection.commit();

      // 6. Notify admins
      try {
        const [userRows] = await pool.query(
          `SELECT username, email FROM users WHERE id = UUID_TO_BIN(?)`,
          [req.user.id]
        );
        
        if (userRows.length > 0) {
          const user = userRows[0];
          
          await pool.query(
            `INSERT INTO system_alerts (
              id, type, title, message, source
            ) VALUES (
              UUID_TO_BIN(UUID()),
              'INFO',
              'New KYC Submission',
              ?,
              'KYC'
            )`,
            [`User ${user.username} (${user.email}) has submitted KYC documents for review.`]
          );
        }
      } catch (notifyError) {
        console.error("Failed to notify admins:", notifyError);
      }

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

      const { email, password, rememberMe } = value;
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

      const token = generateToken(user, rememberMe);

    await pool.query(
      `UPDATE users SET last_login = NOW() WHERE id = UUID_TO_BIN(?)`,
      [user.id]
    );
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
    const userId = req.user.id;
    const userUUID = userId;

    // 1. Get Basic User Information
    const [users] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        email,
        username,
        first_name,
        last_name,
        email as email_address,
        phone as phone_number,
        DATE_FORMAT(date_of_birth, '%d') as birth_day,
        DATE_FORMAT(date_of_birth, '%m') as birth_month,
        DATE_FORMAT(date_of_birth, '%Y') as birth_year,
        country as nationality,
        role,
        age_verified,
        profile_photo,
        created_at,
        level,
        xp_points,
        referral_code,
        total_referrals,
        email_verified,
        kyc_status as verification_status,
        is_active,
        government_id_number,
        government_id_type,
        is_deleted,
        is_suspended,
        suspension_reason
      FROM users WHERE id = UUID_TO_BIN(?)`,
      [userUUID]
    );

    if (users.length === 0 || users[0].is_deleted) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    // 2. Get Wallets - FIXED: Removed universal_tickets column
    const [wallets] = await pool.query(
      `SELECT type, balance FROM wallets WHERE user_id = UUID_TO_BIN(?)`,
      [userUUID]
    );

    const cashWallet = wallets.find((w) => w.type === "CASH");
    const creditWallet = wallets.find((w) => w.type === "CREDIT");

    // 3. Get Universal Tickets count from universal_tickets table
    const [universalTicketsResult] = await pool.query(
      `SELECT COUNT(*) as ticket_count FROM universal_tickets 
       WHERE user_id = UUID_TO_BIN(?) AND is_used = FALSE`,
      [userUUID]
    );

    const universalTicketsCount = universalTicketsResult[0]?.ticket_count || 0;

    // 4. Get Level Information
    const [levelInfo] = await pool.query(
      `SELECT level_name, xp_required, perks 
       FROM user_levels WHERE level = ?`,
      [user.level]
    );

    // 5. Get Withdrawal Methods (from withdrawals table)
    const [withdrawalMethods] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        payment_method,
        account_details,
        paypal_email,
        bank_account_last_four,
        bank_name,
        status,
        requested_at
       FROM withdrawals 
       WHERE user_id = UUID_TO_BIN(?)
       ORDER BY requested_at DESC`,
      [userUUID]
    );

    // Format withdrawal methods
    const formattedWithdrawalMethods = withdrawalMethods.map(method => {
      let details = {};
      
      try {
        if (method.account_details) {
          details = typeof method.account_details === 'string' 
            ? JSON.parse(method.account_details) 
            : method.account_details;
        }
      } catch (e) {
        console.error('Error parsing account details:', e);
      }

      const baseMethod = {
        id: method.id,
        type: method.payment_method,
        status: method.status,
        lastUsed: method.requested_at
      };
      switch (method.payment_method) {
        case 'BANK_TRANSFER':
          return {
            ...baseMethod,
            displayName: 'Bank Transfer',
            details: {
              bankName: method.bank_name || details.bank_name || 'Barclays',
              accountNumber: details.account_number ? `****${details.account_number.slice(-4)}` : '123456321',
              accountHolder: details.account_holder || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
              sortCode: details.sort_code || '',
              iban: details.iban || ''
            }
          };
        case 'PAYPAL':
          return {
            ...baseMethod,
            displayName: 'PayPal',
            details: {
              email: method.paypal_email || details.email || user.email
            }
          };
        case 'REVOLUT':
          return {
            ...baseMethod,
            displayName: 'Revolut',
            details: {
              phone: details.phone,
              accountHolder: details.account_holder || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
              accountNumber: details.account_number ? `****${details.account_number.slice(-4)}` : '',
              iban: details.iban || ''
            }
          };
        default:
          return {
            ...baseMethod,
            displayName: method.payment_method,
            details: details
          };
      }
    });

    // 6. Get Achievements
    const achievements = [];
    
    // First Purchase
    const [firstPurchase] = await pool.query(
      `SELECT MIN(created_at) as first_purchase_date 
       FROM purchases 
       WHERE user_id = UUID_TO_BIN(?) AND status = 'PAID'`,
      [userUUID]
    );
    
    if (firstPurchase[0]?.first_purchase_date) {
      achievements.push({
        title: 'First Purchase',
        description: 'Made your first ticket purchase',
        unlockedOn: formatDate(firstPurchase[0].first_purchase_date)
      });
    }
    
    // Big Spender (spent over £100)
    const [bigSpender] = await pool.query(
      `SELECT MIN(created_at) as big_spender_date
       FROM (
         SELECT created_at, SUM(total_amount) OVER (ORDER BY created_at) as running_total
         FROM purchases 
         WHERE user_id = UUID_TO_BIN(?) AND status = 'PAID'
       ) as spending
       WHERE running_total >= 100
       LIMIT 1`,
      [userUUID]
    );
    
    if (bigSpender[0]?.big_spender_date) {
      achievements.push({
        title: 'Big Spender',
        description: 'Spent over £100 on competitions',
        unlockedOn: formatDate(bigSpender[0].big_spender_date)
      });
    }
    
    // Game Master (played 10 different games)
    const [gameCount] = await pool.query(
      `SELECT COUNT(DISTINCT game_id) as game_count FROM game_plays 
       WHERE user_id = UUID_TO_BIN(?)`,
      [userUUID]
    );
    
    if (gameCount[0]?.game_count >= 10) {
      const [gameMasterDate] = await pool.query(
        `SELECT MIN(played_at) as game_master_date FROM game_plays 
         WHERE user_id = UUID_TO_BIN(?)`,
        [userUUID]
      );
      
      achievements.push({
        title: 'Game Master',
        description: 'Played 10 different mini games',
        unlockedOn: formatDate(gameMasterDate[0]?.game_master_date, '15/11/2025')
      });
    }
    
    
    // Lucky Winner (won first instant win)
    const [luckyWinner] = await pool.query(
      `SELECT MIN(claimed_at) as lucky_winner_date
       FROM instant_wins 
       WHERE claimed_by = UUID_TO_BIN(?) AND claimed_at IS NOT NULL`,
      [userUUID]
    );
    
    if (luckyWinner[0]?.lucky_winner_date) {
      achievements.push({
        title: 'Lucky Winner',
        description: 'Won your first instant win prize',
        unlockedOn: formatDate(luckyWinner[0].lucky_winner_date)
      });
    }

    // Helper function to format dates
    function formatDate(dateString) {
      if (!dateString) return '15/11/2025'; // Default date for mockup
      const date = new Date(dateString);
      return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    }

    // 7. Get Ticket Statistics
    const [ticketStats] = await pool.query(
      `SELECT 
        COUNT(DISTINCT CASE WHEN ce.status = 'ACTIVE' AND c.status = 'ACTIVE' THEN ce.competition_id END) as active_entries,
        COALESCE(SUM(CASE WHEN p.status = 'PAID' THEN p.total_amount ELSE 0 END), 0) as total_spent,
        COALESCE(SUM(CASE WHEN w.id IS NOT NULL THEN iw.prize_value ELSE 0 END), 0) as total_winnings
      FROM competition_entries ce
      LEFT JOIN purchases p ON ce.user_id = p.user_id AND ce.competition_id = p.competition_id
      LEFT JOIN competitions c ON ce.competition_id = c.id
      LEFT JOIN winners w ON ce.competition_id = w.competition_id AND ce.user_id = w.user_id
      LEFT JOIN instant_wins iw ON w.ticket_id = iw.id
      WHERE ce.user_id = UUID_TO_BIN(?)`,
      [userUUID]
    );

    // 8. Get Competitions
    const [competitions] = await pool.query(
      `SELECT 
        BIN_TO_UUID(c.id) as competition_id,
        c.title,
        c.category,
        c.price as ticket_price,
        c.status as competition_status,
        c.end_date,
        ce.entry_date as purchase_date,
        ce.status as entry_status,
        GROUP_CONCAT(DISTINCT t.ticket_number) as ticket_numbers,
        w.id as winner_id,
        iw.prize_value,
        iw.prize_name,
        c.description
      FROM competition_entries ce
      JOIN competitions c ON ce.competition_id = c.id
      LEFT JOIN tickets t ON ce.competition_id = t.competition_id AND ce.user_id = t.user_id
      LEFT JOIN winners w ON ce.competition_id = w.competition_id AND ce.user_id = w.user_id
      LEFT JOIN instant_wins iw ON w.ticket_id = iw.id
      WHERE ce.user_id = UUID_TO_BIN(?)
      GROUP BY c.id, ce.entry_date, ce.status, w.id, iw.prize_value, iw.prize_name
      ORDER BY ce.entry_date DESC
      LIMIT 20`,
      [userUUID]
    );

    // Format competitions
    const formattedCompetitions = competitions.map(comp => ({
      id: comp.competition_id,
      title: comp.title,
      status: comp.competition_status,
      ticketPrice: comp.ticket_price,
      prizeValue: comp.category === 'JACKPOT' ? '£1,000,000 Jackpot' : comp.prize_value ? `£${comp.prize_value}` : `£${comp.ticket_price}`,
      ticketNumbers: comp.ticket_numbers ? comp.ticket_numbers.split(',').map(num => `#${num}`) : [],
      purchaseDate: comp.purchase_date,
      hasWon: !!comp.winner_id,
      prizeDescription: comp.prize_name || comp.description || `Competition Prize`,
      isActive: comp.entry_status === 'ACTIVE' && comp.competition_status === 'ACTIVE'
    }));

    // 9. Get Transactions
    const [transactions] = await pool.query(
      `SELECT 
        'PURCHASE' as type,
        CONCAT(c.title, ' - ', COUNT(DISTINCT t.id), ' tickets') as description,
        p.created_at as date,
        p.total_amount as amount,
        p.status,
        BIN_TO_UUID(p.id) as transaction_id
      FROM purchases p
      JOIN competitions c ON p.competition_id = c.id
      LEFT JOIN tickets t ON p.id = t.purchase_id
      WHERE p.user_id = UUID_TO_BIN(?) AND p.status = 'PAID'
      GROUP BY p.id, c.title
      
      UNION ALL
      
      SELECT 
        'WITHDRAWAL' as type,
        'Withdrawal' as description,
        w.requested_at as date,
        w.amount,
        w.status,
        BIN_TO_UUID(w.id) as transaction_id
      FROM withdrawals w
      WHERE w.user_id = UUID_TO_BIN(?)
      
      UNION ALL
      
      SELECT 
        'TOPUP' as type,
        'Wallet top-up' as description,
        cp.created_at as date,
        cp.amount,
        cp.status,
        BIN_TO_UUID(cp.id) as transaction_id
      FROM credit_purchases cp
      WHERE cp.user_id = UUID_TO_BIN(?)
      
      UNION ALL
      
      SELECT 
        'INSTANT_WIN' as type,
        CONCAT('Instant Win Prize - ', COALESCE(iw.prize_name, 'Prize')) as description,
        iw.claimed_at as date,
        iw.prize_value as amount,
        'COMPLETED' as status,
        BIN_TO_UUID(iw.id) as transaction_id
      FROM instant_wins iw
      WHERE iw.claimed_by = UUID_TO_BIN(?)
      
      ORDER BY date DESC
      LIMIT 20`,
      [userUUID, userUUID, userUUID, userUUID]
    );

    // 10. Get Spending Limits
    const [spendingLimits] = await pool.query(
      `SELECT 
        daily_limit,
        weekly_limit,
        monthly_limit,
        single_purchase_limit,
        daily_spent,
        weekly_spent,
        monthly_spent,
        limit_reset_date
      FROM spending_limits 
      WHERE user_id = UUID_TO_BIN(?)`,
      [userUUID]
    );

    // 11. Get Subscription Info
    const [subscription] = await pool.query(
      `SELECT 
        st.tier_name,
        st.tier_level,
        st.badge_name,
        st.monthly_price,
        st.benefits,
        us.status,
        us.start_date,
        us.end_date,
        us.auto_renew,
        us.next_payment_date
      FROM user_subscriptions us
      JOIN subscription_tiers st ON us.tier_id = st.id
      WHERE us.user_id = UUID_TO_BIN(?) AND us.status = 'ACTIVE'
      ORDER BY us.created_at DESC
      LIMIT 1`,
      [userUUID]
    );

    // 12. Get Verification Details
    const [verifications] = await pool.query(
      `SELECT 
        status,
        verification_type,
        document_type,
        verified_at,
        rejected_reason,
        DATE_FORMAT(created_at, '%d/%m/%Y') as submitted_on
      FROM verifications 
      WHERE user_id = UUID_TO_BIN(?)
      ORDER BY created_at DESC
      LIMIT 1`,
      [userUUID]
    );

    // 13. Get Instant Wins
    const [instantWins] = await pool.query(
      `SELECT 
        iw.prize_name,
        iw.prize_value,
        iw.prize_type,
        DATE_FORMAT(iw.claimed_at, '%d %b %Y') as date_won,
        c.title as competition_title,
        c.category,
        c.price as ticket_cost
      FROM instant_wins iw
      LEFT JOIN competitions c ON iw.competition_id = c.id
      WHERE iw.claimed_by = UUID_TO_BIN(?)
      ORDER BY iw.claimed_at DESC
      LIMIT 10`,
      [userUUID]
    );

    // 14. Get Points Information
    const [pointsInfo] = await pool.query(
      `SELECT 
        total_points,
        earned_points,
        spent_points,
        redeemed_points
      FROM user_points 
      WHERE user_id = UUID_TO_BIN(?)`,
      [userUUID]
    );

    // 15. Get User Streaks
    const [userStreaks] = await pool.query(
      `SELECT 
        current_streak,
        longest_streak,
        last_login_date,
        total_logins
      FROM user_streaks 
      WHERE user_id = UUID_TO_BIN(?)`,
      [userUUID]
    );

    // 16. Get KYC Documents
    const [kycDocuments] = await pool.query(
      `SELECT 
        document_type,
        file_path,
        file_name,
        status,
        created_at
      FROM kyc_documents 
      WHERE user_id = UUID_TO_BIN(?)
      ORDER BY created_at DESC`,
      [userUUID]
    );

    // Determine user badge/tier
    let badge = 'User';
    let tier = 'STANDARD';
    let isHero = false;
    
    if (user.role === 'ADMIN' || user.role === 'SUPERADMIN') {
      badge = 'Admin';
      tier = 'ADMIN';
    } else if (subscription.length > 0) {
      badge = subscription[0].badge_name || subscription[0].tier_name;
      tier = subscription[0].tier_name;
    } else if (user.level >= 5) {
      badge = 'Hero';
      tier = 'VIP';
      isHero = true;
    } else if (user.total_referrals >= 10) {
      badge = 'Ambassador';
      tier = 'REFERRAL_MASTER';
    }

    // Prepare the complete response
    const response = {
      success: true,
      data: {
        // Personal Information
        personalInfo: {
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          emailAddress: user.email_address,
          phoneNumber: user.phone_number || '',
          dateOfBirth: {
            day: user.birth_day || '',
            month: user.birth_month || '',
            year: user.birth_year || ''
          },
          nationality: user.nationality || '',
          profilePhoto: user.profile_photo,
          ageVerified: user.age_verified,
          governmentIdType: user.government_id_type,
          governmentIdNumber: user.government_id_number
        },

        // Account Overview
        accountOverview: {
          fullName: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username,
          username: user.username,
          email: user.email,
          badge: badge,
          tier: tier,
          initials: (user.first_name?.[0] || '') + (user.last_name?.[0] || '') || user.username?.[0]?.toUpperCase() || 'U',
          welcomeMessage: `Welcome back, ${user.first_name || user.username}!`,
          heroStatus: isHero,
          isAdmin: user.role === 'ADMIN' || user.role === 'SUPERADMIN'
        },

        // Ticket Statistics
        ticketStats: {
          activeEntries: ticketStats[0]?.active_entries || 0,
          totalSpent: ticketStats[0]?.total_spent || 0,
          totalWinnings: ticketStats[0]?.total_winnings || 0,
          totalCompetitions: competitions.length
        },

        // Withdrawal Methods
        withdrawalMethods: formattedWithdrawalMethods,

        // Achievements
        achievements: achievements,

        // Competitions
        competitions: formattedCompetitions,

        // Transactions
        transactions: transactions.map(tx => ({
          id: tx.transaction_id,
          type: tx.type,
          description: tx.description,
          date: tx.date,
          amount: tx.amount,
          status: tx.status,
          isCompleted: tx.status === 'COMPLETED' || tx.status === 'PAID' || tx.status === 'APPROVED'
        })),

        // Spending Limits
        spendingLimits: spendingLimits[0] || {
          daily_limit: 0,
          weekly_limit: 0,
          monthly_limit: 0,
          single_purchase_limit: 0,
          daily_spent: 0,
          weekly_spent: 0,
          monthly_spent: 0,
          limit_reset_date: null
        },

        // Verification Status
        verification: {
          status: verifications[0]?.status || user.verification_status || 'pending',
          isVerified: (verifications[0]?.status === 'APPROVED') || (user.verification_status === 'verified'),
          verificationType: verifications[0]?.verification_type,
          documentType: verifications[0]?.document_type,
          verifiedAt: verifications[0]?.verified_at,
          submittedOn: verifications[0]?.submitted_on,
          kycDocuments: kycDocuments,
          message: verifications[0]?.status === 'APPROVED' 
            ? 'Your account is verified'
            : 'Complete your verification to unlock all features and increase your spending limits.'
        },

        // Wallets - FIXED: Using separate query for universal tickets
        wallets: {
          cash: cashWallet ? cashWallet.balance : 0,
          credit: creditWallet ? creditWallet.balance : 0,
          universalTickets: universalTicketsCount
        },

        // Level Information
        levelInfo: {
          currentLevel: user.level,
          levelName: levelInfo[0]?.level_name || 'Beginner',
          xpPoints: user.xp_points,
          xpRequired: levelInfo[0]?.xp_required || 0,
          perks: levelInfo[0]?.perks ? JSON.parse(levelInfo[0].perks) : {}
        },

        // Instant Wins
        instantWins: instantWins.map(iw => ({
          title: iw.competition_title || 'Instant Win',
          prizeName: iw.prize_name || 'Prize',
          prizeValue: iw.prize_value || 0,
          ticketCost: iw.ticket_cost || 0.00,
          dateWon: iw.date_won || '',
          category: iw.category || 'INSTANT_WIN',
          prizeType: iw.prize_type
        })),

        // Points Information
        pointsInfo: pointsInfo[0] || {
          total_points: 0,
          earned_points: 0,
          spent_points: 0,
          redeemed_points: 0
        },

        // Streaks
        streaks: userStreaks[0] || {
          current_streak: 0,
          longest_streak: 0,
          last_login_date: null,
          total_logins: 0
        },

        // Subscription Information
        subscription: subscription.length > 0 ? {
          tierName: subscription[0].tier_name,
          tierLevel: subscription[0].tier_level,
          badgeName: subscription[0].badge_name,
          monthlyPrice: subscription[0].monthly_price,
          benefits: subscription[0].benefits ? JSON.parse(subscription[0].benefits) : {},
          status: subscription[0].status,
          startDate: subscription[0].start_date,
          endDate: subscription[0].end_date,
          autoRenew: subscription[0].auto_renew,
          nextPaymentDate: subscription[0].next_payment_date
        } : null,

        // Referral Information
        referralInfo: {
          code: user.referral_code,
          totalReferrals: user.total_referrals,
          inviteLink: user.referral_code ? `https://yourdomain.com/invite/${user.referral_code}` : null
        },

        // Account Status
        accountStatus: {
          isActive: user.is_active,
          isSuspended: user.is_suspended,
          suspensionReason: user.suspension_reason,
          emailVerified: user.email_verified,
          ageVerified: user.age_verified,
          lastLogin: user.last_login,
          createdAt: user.created_at
        },

        // Account Settings
        accountSettings: {
          emailNotifications: {
            notifyInstantWins: true,
            notifyNewCompetitions: true,
            notifyWins: true,
            notifyWithdrawals: true,
            newsletter: true
          },
          privacySettings: {
            showMyWinsPublicly: true,
            showMyProfilePublicly: true,
            showMyActivityPublicly: false
          }
        },

        // Navigation Tabs
        navigation: [
          { id: 'overview', label: 'OVERVIEW', active: true },
          { id: 'tickets', label: 'TICKETS', active: false },
          { id: 'verification', label: 'VERIFICATION', active: false },
          { id: 'my-prizes', label: 'MY PRIZES', active: false },
          { id: 'transactions', label: 'TRANSACTIONS', active: false },
          { id: 'spending-limit', label: 'SPENDING LIMIT', active: false }
        ],

        // Important Notice (from UI mockup)
        importantNotice: "Rude/inappropriate names/images will result in a permanent ban, you have been warned. We can take a joke, we appreciate a joke, but anything that risks our business reputation will result in a ban."
      }
    };

    res.json(response);

  } catch (error) {
    console.error("Get complete profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
},

addPaymentMethod : async (req, res) => {
  try {
    const userId = req.user.id;
    const userUUID = userId;
    const { paymentMethod, ...details } = req.body;

    // Validate required fields
    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Payment method type is required"
      });
    }

    let validationErrors = {};
    let accountDetails = {};

    // Validate based on payment method type
    switch (paymentMethod.toUpperCase()) {
      case 'BANK_TRANSFER':
        // Validate Bank Transfer
        if (!details.bankName || details.bankName.trim() === '') {
          validationErrors.bankName = "Bank name is required";
        }
        
        if (!details.sortCode || details.sortCode.trim() === '') {
          validationErrors.sortCode = "Sort code is required";
        } else if (!/^\d{2}-\d{2}-\d{2}$/.test(details.sortCode)) {
          validationErrors.sortCode = "Sort code must be in format XX-XX-XX (6 digits)";
        } else {
          // Remove hyphens and validate 6 digits
          const cleanSortCode = details.sortCode.replace(/-/g, '');
          if (cleanSortCode.length !== 6) {
            validationErrors.sortCode = "Sort code must be exactly 6 digits";
          }
        }
        
        if (!details.accountNumber || details.accountNumber.trim() === '') {
          validationErrors.accountNumber = "Account number is required";
        } else if (details.accountNumber.length !== 8) {
          validationErrors.accountNumber = "Account number must be exactly 8 digits";
        } else if (!/^\d{8}$/.test(details.accountNumber)) {
          validationErrors.accountNumber = "Account number must contain only digits";
        }
        
        if (!details.confirmAccountNumber || details.confirmAccountNumber.trim() === '') {
          validationErrors.confirmAccountNumber = "Please confirm your account number";
        } else if (details.accountNumber !== details.confirmAccountNumber) {
          validationErrors.confirmAccountNumber = "Account numbers do not match";
        }

        accountDetails = {
          bank_name: details.bankName,
          sort_code: details.sortCode.replace(/-/g, ''),
          account_number: details.accountNumber,
          account_holder: details.accountHolder || `${req.user.first_name} ${req.user.last_name}`.trim(),
          account_holder_first_name: req.user.first_name,
          account_holder_last_name: req.user.last_name
        };
        break;

      case 'PAYPAL':
        // Validate PayPal
        if (!details.email || details.email.trim() === '') {
          validationErrors.email = "PayPal email is required";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) {
          validationErrors.email = "Please enter a valid email address";
        }
        
        if (!details.confirmEmail || details.confirmEmail.trim() === '') {
          validationErrors.confirmEmail = "Please confirm your PayPal email";
        } else if (details.email !== details.confirmEmail) {
          validationErrors.confirmEmail = "Email addresses do not match";
        }
        
        if (!details.accountHolderName || details.accountHolderName.trim() === '') {
          validationErrors.accountHolderName = "Account holder name is required";
        }

        accountDetails = {
          email: details.email,
          account_holder: details.accountHolderName,
          account_holder_first_name: req.user.first_name,
          account_holder_last_name: req.user.last_name
        };
        break;

      case 'REVOLUT':
        // Validate Revolut
        if (!details.phone || details.phone.trim() === '') {
          validationErrors.phone = "Revolut phone number is required";
        } else if (!/^\+[1-9]\d{1,14}$/.test(details.phone)) {
          validationErrors.phone = "Please enter a valid phone number with country code";
        }
        
        if (!details.confirmPhone || details.confirmPhone.trim() === '') {
          validationErrors.confirmPhone = "Please confirm your Revolut phone number";
        } else if (details.phone !== details.confirmPhone) {
          validationErrors.confirmPhone = "Phone numbers do not match";
        }
        
        if (!details.accountHolderName || details.accountHolderName.trim() === '') {
          validationErrors.accountHolderName = "Account holder name is required";
        }
        
        if (!details.revolutTag || details.revolutTag.trim() === '') {
          validationErrors.revolutTag = "Revolut tag is required";
        }

        accountDetails = {
          phone: details.phone,
          account_holder: details.accountHolderName,
          revolut_tag: details.revolutTag,
          account_holder_first_name: req.user.first_name,
          account_holder_last_name: req.user.last_name
        };
        break;

      default:
        return res.status(400).json({
          success: false,
          message: "Invalid payment method type"
        });
    }

    // Check if there are validation errors
    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors
      });
    }

    // Check if this payment method already exists for this user
    const [existingMethods] = await pool.query(
      `SELECT COUNT(*) as count FROM withdrawals 
       WHERE user_id = UUID_TO_BIN(?) 
       AND payment_method = ? 
       AND status = 'COMPLETED'  -- Only check completed withdrawals as saved methods
       AND (
         (payment_method = 'BANK_TRANSFER' AND account_details->>'$.account_number' = ?) OR
         (payment_method = 'PAYPAL' AND account_details->>'$.email' = ?) OR
         (payment_method = 'REVOLUT' AND account_details->>'$.phone' = ?)
       )`,
      [
        userUUID, 
        paymentMethod.toUpperCase(),
        accountDetails.account_number || '',
        accountDetails.email || '',
        accountDetails.phone || ''
      ]
    );

    if (existingMethods[0].count > 0) {
      return res.status(409).json({
        success: false,
        message: "This payment method already exists"
      });
    }

    // Insert as a "payment method" withdrawal with 0 amount
    const withdrawalUUID = crypto.randomUUID();
    await pool.query(
      `INSERT INTO withdrawals (
        id,
        user_id,
        amount,
        payment_method,
        account_details,
        paypal_email,
        bank_account_last_four,
        bank_name,
        status,
        requested_at
      ) VALUES (
        UUID_TO_BIN(?),
        UUID_TO_BIN(?),
        0.00,  -- 0 amount for payment method storage
        ?,
        ?,
        ?,
        ?,
        ?,
        'COMPLETED',  -- Mark as COMPLETED to indicate it's a saved payment method
        NOW()
      )`,
      [
        withdrawalUUID,
        userUUID,
        paymentMethod.toUpperCase(),
        JSON.stringify(accountDetails),
        paymentMethod.toUpperCase() === 'PAYPAL' ? details.email : null,
        paymentMethod.toUpperCase() === 'BANK_TRANSFER' ? details.accountNumber.slice(-4) : null,
        paymentMethod.toUpperCase() === 'BANK_TRANSFER' ? details.bankName : null
      ]
    );

    // Get the newly created payment method (withdrawal record)
    const [newPaymentMethod] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        payment_method,
        account_details,
        paypal_email,
        bank_account_last_four,
        bank_name,
        status,
        requested_at as created_at,
        updated_at
       FROM withdrawals 
       WHERE id = UUID_TO_BIN(?)`,
      [withdrawalUUID]
    );

    // Format the response
    const formattedMethod = formatPaymentMethod(newPaymentMethod[0]);

    res.status(201).json({
      success: true,
      message: 'Payment method added successfully',
      data: formattedMethod
    });

  } catch (error) {
    console.error("Add payment method error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
},
 getPaymentMethods : async (req, res) => {
  try {
    const userId = req.user.id;
    const userUUID = userId;

    // Get all COMPLETED withdrawals with 0 amount as saved payment methods
    const [paymentMethods] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        payment_method,
        account_details,
        paypal_email,
        bank_account_last_four,
        bank_name,
        status,
        requested_at as created_at,
        updated_at,
        amount
       FROM withdrawals 
       WHERE user_id = UUID_TO_BIN(?) 
       AND status = 'COMPLETED' 
       AND amount = 0.00  -- Only get payment method records (not actual withdrawals)
       ORDER BY requested_at DESC`,
      [userUUID]
    );

    const formattedMethods = paymentMethods.map(method => formatPaymentMethod(method));

    res.json({
      success: true,
      data: formattedMethods
    });

  } catch (error) {
    console.error("Get payment methods error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
},
 getPaymentMethodById : async (req, res) => {
  try {
    const userId = req.user.id;
    const userUUID = userId;
    const { id } = req.params;

    const [paymentMethod] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        payment_method,
        account_details,
        paypal_email,
        bank_account_last_four,
        bank_name,
        status,
        requested_at as created_at,
        updated_at,
        amount
       FROM withdrawals 
       WHERE id = UUID_TO_BIN(?) 
       AND user_id = UUID_TO_BIN(?) 
       AND status = 'COMPLETED' 
       AND amount = 0.00`,
      [id, userUUID]
    );

    if (paymentMethod.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found"
      });
    }

    const formattedMethod = formatPaymentMethod(paymentMethod[0], true); // true = include full details

    res.json({
      success: true,
      data: formattedMethod
    });

  } catch (error) {
    console.error("Get payment method by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
},
updatePaymentMethod : async (req, res) => {
  try {
    const userId = req.user.id;
    const userUUID = userId;
    const { id } = req.params;
    const { ...details } = req.body;

    // Check if payment method exists and belongs to user
    const [existingMethod] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        payment_method,
        account_details
       FROM withdrawals 
       WHERE id = UUID_TO_BIN(?) 
       AND user_id = UUID_TO_BIN(?) 
       AND status = 'COMPLETED' 
       AND amount = 0.00`,
      [id, userUUID]
    );

    if (existingMethod.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found"
      });
    }

    const paymentMethod = existingMethod[0].payment_method;
    let validationErrors = {};
    let accountDetails = {};

    // Parse existing account details
    let currentAccountDetails = {};
    try {
      if (existingMethod[0].account_details) {
        currentAccountDetails = typeof existingMethod[0].account_details === 'string' 
          ? JSON.parse(existingMethod[0].account_details) 
          : existingMethod[0].account_details;
      }
    } catch (e) {
      console.error('Error parsing current account details:', e);
    }

    // Validate based on payment method type
    switch (paymentMethod) {
      case 'BANK_TRANSFER':
        if (details.bankName && details.bankName.trim() === '') {
          validationErrors.bankName = "Bank name cannot be empty";
        }
        
        if (details.sortCode && details.sortCode.trim() !== '') {
          if (!/^\d{2}-\d{2}-\d{2}$/.test(details.sortCode)) {
            validationErrors.sortCode = "Sort code must be in format XX-XX-XX (6 digits)";
          } else {
            const cleanSortCode = details.sortCode.replace(/-/g, '');
            if (cleanSortCode.length !== 6) {
              validationErrors.sortCode = "Sort code must be exactly 6 digits";
            }
          }
        }
        
        if (details.accountNumber && details.accountNumber.trim() !== '') {
          if (details.accountNumber.length !== 8) {
            validationErrors.accountNumber = "Account number must be exactly 8 digits";
          } else if (!/^\d{8}$/.test(details.accountNumber)) {
            validationErrors.accountNumber = "Account number must contain only digits";
          }
        }
        
        if (details.confirmAccountNumber && details.confirmAccountNumber.trim() !== '' && 
            details.accountNumber !== details.confirmAccountNumber) {
          validationErrors.confirmAccountNumber = "Account numbers do not match";
        }

        accountDetails = {
          bank_name: details.bankName || currentAccountDetails.bank_name,
          sort_code: details.sortCode ? details.sortCode.replace(/-/g, '') : currentAccountDetails.sort_code,
          account_number: details.accountNumber || currentAccountDetails.account_number,
          account_holder: details.accountHolder || currentAccountDetails.account_holder,
          account_holder_first_name: currentAccountDetails.account_holder_first_name || req.user.first_name,
          account_holder_last_name: currentAccountDetails.account_holder_last_name || req.user.last_name
        };
        break;

      case 'PAYPAL':
        if (details.email && details.email.trim() !== '') {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) {
            validationErrors.email = "Please enter a valid email address";
          }
          
          if (details.confirmEmail && details.confirmEmail.trim() !== '' && 
              details.email !== details.confirmEmail) {
            validationErrors.confirmEmail = "Email addresses do not match";
          }
        }
        
        if (details.accountHolderName && details.accountHolderName.trim() === '') {
          validationErrors.accountHolderName = "Account holder name cannot be empty";
        }

        accountDetails = {
          email: details.email || currentAccountDetails.email,
          account_holder: details.accountHolderName || currentAccountDetails.account_holder,
          account_holder_first_name: currentAccountDetails.account_holder_first_name || req.user.first_name,
          account_holder_last_name: currentAccountDetails.account_holder_last_name || req.user.last_name
        };
        break;

      case 'REVOLUT':
        if (details.phone && details.phone.trim() !== '') {
          if (!/^\+[1-9]\d{1,14}$/.test(details.phone)) {
            validationErrors.phone = "Please enter a valid phone number with country code";
          }
          
          if (details.confirmPhone && details.confirmPhone.trim() !== '' && 
              details.phone !== details.confirmPhone) {
            validationErrors.confirmPhone = "Phone numbers do not match";
          }
        }
        
        if (details.accountHolderName && details.accountHolderName.trim() === '') {
          validationErrors.accountHolderName = "Account holder name cannot be empty";
        }
        
        if (details.revolutTag && details.revolutTag.trim() === '') {
          validationErrors.revolutTag = "Revolut tag cannot be empty";
        }

        accountDetails = {
          phone: details.phone || currentAccountDetails.phone,
          account_holder: details.accountHolderName || currentAccountDetails.account_holder,
          revolut_tag: details.revolutTag || currentAccountDetails.revolut_tag,
          account_holder_first_name: currentAccountDetails.account_holder_first_name || req.user.first_name,
          account_holder_last_name: currentAccountDetails.account_holder_last_name || req.user.last_name
        };
        break;
    }

    // Check if there are validation errors
    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors
      });
    }

    // Update the payment method (withdrawal record)
    await pool.query(
      `UPDATE withdrawals SET
        account_details = ?,
        paypal_email = ?,
        bank_account_last_four = ?,
        bank_name = ?,
        updated_at = NOW()
       WHERE id = UUID_TO_BIN(?) 
       AND user_id = UUID_TO_BIN(?) 
       AND status = 'COMPLETED' 
       AND amount = 0.00`,
      [
        JSON.stringify(accountDetails),
        paymentMethod === 'PAYPAL' ? accountDetails.email : null,
        paymentMethod === 'BANK_TRANSFER' && accountDetails.account_number 
          ? accountDetails.account_number.slice(-4) 
          : null,
        paymentMethod === 'BANK_TRANSFER' ? accountDetails.bank_name : null,
        id,
        userUUID
      ]
    );

    // Get updated payment method
    const [updatedMethod] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        payment_method,
        account_details,
        paypal_email,
        bank_account_last_four,
        bank_name,
        status,
        requested_at as created_at,
        updated_at,
        amount
       FROM withdrawals 
       WHERE id = UUID_TO_BIN(?)`,
      [id]
    );

    const formattedMethod = formatPaymentMethod(updatedMethod[0]);

    res.json({
      success: true,
      message: 'Payment method updated successfully',
      data: formattedMethod
    });

  } catch (error) {
    console.error("Update payment method error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
},
deletePaymentMethod :async (req, res) => {
  try {
    const userId = req.user.id;
    const userUUID = userId;
    const { id } = req.params;

    // Check if payment method exists and belongs to user
    const [existingMethod] = await pool.query(
      `SELECT BIN_TO_UUID(id) as id FROM withdrawals 
       WHERE id = UUID_TO_BIN(?) 
       AND user_id = UUID_TO_BIN(?) 
       AND status = 'COMPLETED' 
       AND amount = 0.00`,
      [id, userUUID]
    );

    if (existingMethod.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found"
      });
    }

    // Delete the payment method (withdrawal record)
    await pool.query(
      `DELETE FROM withdrawals 
       WHERE id = UUID_TO_BIN(?) 
       AND user_id = UUID_TO_BIN(?) 
       AND status = 'COMPLETED' 
       AND amount = 0.00`,
      [id, userUUID]
    );

    res.json({
      success: true,
      message: 'Payment method deleted successfully'
    });

  } catch (error) {
    console.error("Delete payment method error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
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
