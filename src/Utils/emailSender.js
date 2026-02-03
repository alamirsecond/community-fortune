import nodemailer from "nodemailer";
import systemSettingsCache from "./systemSettingsCache.js";

export const sendEmail = async (
  user_email,
  v_code,
  content = {},
  qrImageBuffer = null
) => {
  try {
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user_email)) {
      return {
        success: false,
        message: "Invalid email address format",
      };
    }

    const smtpConfig = {
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) ,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER ,
        pass: process.env.EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false,
      },
    };

    console.log("Using SMTP configuration for technosophia.net");

    const transporter = nodemailer.createTransport(smtpConfig);

    // Verify transporter configuration
    await transporter.verify();
    console.log("Email transporter verified successfully");

    const maybeTemplate = getTemplate?.(v_code, content);

    const defaultContent = {
      subject: "Password Reset Verification Code - Pharmacy Management System",
      text: `Your password reset verification code is: ${v_code}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #3447AA; margin: 0;">Pharmacy Management System</h2>
          </div>
          
          <h3 style="color: #333; border-bottom: 2px solid #3447AA; padding-bottom: 10px;">Password Reset Request</h3>
          
          <p>Hello,</p>
          
          <p>You requested to reset your password for your Pharmacy Management System account.</p>
          
          <div style="background: linear-gradient(135deg, #3447AA, #4e54c8); color: white; padding: 20px; margin: 25px 0; text-align: center; font-size: 28px; font-weight: bold; border-radius: 8px; letter-spacing: 5px;">
            ${v_code}
          </div>
          
          <p style="text-align: center; font-size: 14px; color: #666;">
            This verification code will expire in <strong>1 hour</strong>.
          </p>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #3447AA;">
            <p style="margin: 0; font-size: 13px; color: #666;">
              <strong>Security Tip:</strong> Never share this code with anyone. Our support team will never ask for your verification code.
            </p>
          </div>
          
          <p style="color: #999; font-size: 12px; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 20px;">
            If you didn't request this password reset, please ignore this email or contact our support team immediately.<br><br>
            <strong>Pharmacy Management System</strong><br>
            TechnoSophia Solutions
          </p>
        </div>
      `,
    };

    // Choose content: prefer explicit content, else template (if valid), else default
    const useTemplate = maybeTemplate && !content.subject && !content.text && !content.html;

    // Ensure 'from' matches an existing mailbox to pass sender verification.
    const fromAddress = process.env.EMAIL_USER || process.env.EMAIL;

    const mailOptions = {
      from: useTemplate
        ? process.env.EMAIL_FROM || `"Community Fortune" <${fromAddress}>`
        : `"Pharmacy Management System" <${fromAddress}>`,
      to: user_email,
      subject: content.subject || (useTemplate ? maybeTemplate.subject : defaultContent.subject),
      text: content.text || (useTemplate ? maybeTemplate.text : defaultContent.text),
      html: content.html || (useTemplate ? maybeTemplate.html : defaultContent.html),
      priority: "high",
      // Envelope ensures SMTP MAIL FROM uses a valid verified sender
      envelope: {
        from: fromAddress,
        to: user_email,
      },
    };

    // Only add QR code attachment if provided
    if (qrImageBuffer) {
      mailOptions.attachments = [
        {
          filename: "qrcode.png",
          content: qrImageBuffer,
          cid: "qrcode",
          contentType: "image/png",
        },
      ];
    }

    const info = await transporter.sendMail(mailOptions);

    console.log("Email sent successfully from technosophia.net:", info.messageId);

    return {
      success: true,
      message: "Email sent successfully!",
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Email sending error details:", {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
    });

    let userFriendlyMessage = "Failed to send email. Please try again later.";

    // Specific error handling for common SMTP issues
    if (error.code === "EAUTH") {
      userFriendlyMessage = "Email authentication failed. Please check your email credentials in the system configuration.";
    } else if (error.code === "ECONNECTION" || error.code === "ETIMEDOUT") {
      userFriendlyMessage = "Cannot connect to email server. Please check your internet connection and SMTP settings.";
    } else if (error.response?.includes("Authentication Required")) {
      userFriendlyMessage = "Email authentication required. Please verify your email account password.";
    } else if (error.response?.includes("550") || error.response?.includes("relay")) {
      userFriendlyMessage = "Email relay access denied. Please contact system administrator.";
    }

    return {
      success: false,
      message: userFriendlyMessage,
      errorCode: error.code || "EMAIL_SEND_FAILURE",
      technicalError: error.message,
    };
  }
};

// Template definitions
const getTemplate = (templateName, data) => {
  const templates = {
    // Verification Email
    verification: {
      subject: "Verify Your Email - Community Fortune",
      text: `Hello ${data.username}, your email verification code is: ${data.verificationToken}. This code expires in 15 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #3447AA; margin: 0;">Community Fortune</h2>
          </div>
          
          <h3 style="color: #333; border-bottom: 2px solid #3447AA; padding-bottom: 10px;">Email Verification</h3>
          
          <p>Hello ${data.username},</p>
          
          <p>Welcome to Community Fortune! Please verify your email address using the code below:</p>
          
          <div style="background: linear-gradient(135deg, #3447AA, #4e54c8); color: white; padding: 30px; margin: 25px 0; text-align: center; border-radius: 8px;">
            <p style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Your Verification Code</p>
            <div style="font-size: 42px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">
              ${data.verificationToken}
            </div>
          </div>
          
          <p style="text-align: center; font-size: 14px; color: #666;">
            Enter this code on the verification page to activate your account.
          </p>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-size: 13px; color: #856404;">
              <strong>⏰ Important:</strong> This code expires in <strong>15 minutes</strong>. Don't share this code with anyone.
            </p>
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #3447AA;">
            <p style="margin: 0; font-size: 13px; color: #666;">
              <strong>Security Tip:</strong> If you didn't create this account, please ignore this email.
            </p>
          </div>
          
          <p style="color: #999; font-size: 12px; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 20px;">
            <strong>Community Fortune</strong><br>
            TechnoSophia Solutions
          </p>
        </div>
      `,
    },

    // Welcome Email
    welcome: {
      subject: "Welcome to Community Fortune! 🎉",
      text: `Welcome ${data.username} to Community Fortune! Start participating in competitions today.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px; background: linear-gradient(135deg, #3447AA, #4e54c8); color: white; padding: 30px; border-radius: 8px;">
            <h1 style="margin: 0;">Welcome to Community Fortune! 🎉</h1>
          </div>
          
          <h2>Hello ${data.username},</h2>
          
          <p>Congratulations and welcome to Community Fortune - where dreams come true and fortunes are made!</p>
          
          <div style="background: #f0f7ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #3447AA; margin-top: 0;">🚀 Get Started</h3>
            <ul>
              <li>Browse exciting competitions</li>
              <li>Purchase tickets for your chance to win</li>
              <li>Track your entries and winnings</li>
              <li>Invite friends with your referral code</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${
              process.env.CLIENT_URL
            }" style="background: linear-gradient(135deg, #3447AA, #4e54c8); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Start Winning Now!
            </a>
          </div>
          
          <p>Need help? Contact our support team at ${
            process.env.SUPPORT_EMAIL || "support@communityfortune.com"
          }</p>
          
          <p style="color: #999; font-size: 12px; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 20px;">
            <strong>Community Fortune</strong><br>
            © 2024 Community Fortune. All rights reserved.
          </p>
        </div>
      `,
    },

    // Password Reset
    passwordReset: {
      subject: "Password Reset Code - Community Fortune",
      text: `Hello ${data.username}, your password reset code is: ${data.resetToken}. This code expires in 15 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #3447AA; margin: 0;">Community Fortune</h2>
          </div>
          
          <h3 style="color: #333; border-bottom: 2px solid #3447AA; padding-bottom: 10px;">Password Reset Request</h3>
          
          <p>Hello ${data.username},</p>
          
          <p>You requested to reset your password. Use the code below to reset your password:</p>
          
          <div style="background: linear-gradient(135deg, #3447AA, #4e54c8); color: white; padding: 30px; margin: 25px 0; text-align: center; border-radius: 8px;">
            <p style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Your Reset Code</p>
            <div style="font-size: 42px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">
              ${data.resetToken}
            </div>
          </div>
          
          <p style="text-align: center; font-size: 14px; color: #666;">
            Enter this code on the password reset page to set a new password.
          </p>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-size: 13px; color: #856404;">
              <strong>⏰ Important:</strong> This code expires in <strong>15 minutes</strong> for security.
            </p>
          </div>
          
          <div style="background: #ffeaea; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <p style="margin: 0; font-size: 13px; color: #721c24;">
              <strong>🔒 Security Warning:</strong> Never share this code with anyone. Community Fortune staff will never ask for this code.
            </p>
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #3447AA;">
            <p style="margin: 0; font-size: 13px; color: #666;">
              <strong>Didn't request this?</strong> If you didn't request a password reset, please ignore this email and your password will remain unchanged.
            </p>
          </div>
          
          <p style="color: #999; font-size: 12px; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 20px;">
            <strong>Community Fortune</strong><br>
            TechnoSophia Solutions
          </p>
        </div>
      `,
    },

    // Withdrawal Request
    withdrawalRequest: {
      subject: "Withdrawal Request Received - Community Fortune",
      text: `Your withdrawal request for £${data.amount} has been received. Reference: ${data.withdrawalId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #3447AA; margin: 0;">Community Fortune</h2>
          </div>
          
          <h3 style="color: #333; border-bottom: 2px solid #3447AA; padding-bottom: 10px;">Withdrawal Request Received</h3>
          
          <p>Hello ${data.username},</p>
          
          <p>We've received your withdrawal request and it's currently being processed.</p>
          
          <div style="background: #f0f7ff; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 24px; color: #3447AA; font-weight: bold;">£${
              data.amount
            }</p>
            <p style="margin: 5px 0 0 0; color: #666;">Reference: ${
              data.withdrawalId || "N/A"
            }</p>
          </div>
          
          <p><strong>Status:</strong> Under Review</p>
          <p><strong>Estimated Processing:</strong> 24-72 hours</p>
          
          <p>You can check the status of your withdrawal anytime in your account dashboard.</p>
          
          <p style="color: #999; font-size: 12px; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 20px;">
            Questions? Contact ${
              process.env.SUPPORT_EMAIL || "support@communityfortune.com"
            }<br>
            <strong>Community Fortune</strong><br>
            © 2024 Community Fortune. All rights reserved.
          </p>
        </div>
      `,
    },

    // Withdrawal Approved
    withdrawalApproved: {
      subject: "Withdrawal Approved - Community Fortune",
      text: `Your withdrawal request for £${data.amount} has been approved and is being processed.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px; background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; border-radius: 8px;">
            <h1 style="margin: 0;">Withdrawal Approved! 💰</h1>
          </div>
          
          <h2>Hello ${data.username},</h2>
          
          <p>Great news! Your withdrawal request has been approved and is now being processed.</p>
          
          <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 24px; color: #155724; font-weight: bold;">£${data.amount}</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4CAF50;">
            <p style="margin: 0; font-size: 13px; color: #666;">
              <strong>Processing Information:</strong><br>
              • Funds will be transferred to your registered payment method<br>
              • Processing time: 24-72 hours<br>
              • You will receive another email when the transfer is completed
            </p>
          </div>
          
          <p>Thank you for being part of Community Fortune!</p>
          
          <p style="color: #999; font-size: 12px; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 20px;">
            <strong>Community Fortune</strong><br>
            © 2024 Community Fortune. All rights reserved.
          </p>
        </div>
      `,
    },

    // Withdrawal Rejected
    withdrawalRejected: {
      subject: "Withdrawal Request Update - Community Fortune",
      text: `Your withdrawal request for £${data.amount} was rejected. Reason: ${data.reason}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #3447AA; margin: 0;">Community Fortune</h2>
          </div>
          
          <h3 style="color: #333; border-bottom: 2px solid #dc3545; padding-bottom: 10px;">Withdrawal Request Update</h3>
          
          <p>Hello ${data.username},</p>
          
          <p>Unfortunately, your withdrawal request could not be processed at this time.</p>
          
          <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 24px; color: #721c24; font-weight: bold;">£${
              data.amount
            }</p>
          </div>
          
          <div style="background: #ffeaea; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <p style="margin: 0; font-size: 13px; color: #721c24;">
              <strong>Reason:</strong><br>
              ${data.reason || "Please contact support for more information."}
            </p>
          </div>
          
          <p>The amount has been refunded to your cash wallet and is available for immediate use.</p>
          
          <p>If you believe this is an error or have any questions, please contact our support team.</p>
          
          <p style="color: #999; font-size: 12px; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 20px;">
            Need assistance? Contact ${
              process.env.SUPPORT_EMAIL || "support@communityfortune.com"
            }<br>
            <strong>Community Fortune</strong><br>
            © 2024 Community Fortune. All rights reserved.
          </p>
        </div>
      `,
    },

    // Competition Win
    competitionWin: {
      subject: "Congratulations! You Won! 🎊 - Community Fortune",
      text: `Congratulations ${data.username}! You won ${data.prize} in ${data.competitionName} competition.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px; background: linear-gradient(135deg, #FFD700, #FFA500); color: white; padding: 30px; border-radius: 8px;">
            <h1 style="margin: 0;">🎊 Congratulations! You Won! 🎊</h1>
          </div>
          
          <h2>Hello ${data.username},</h2>
          
          <p>We're thrilled to inform you that you've won our competition!</p>
          
          <div style="background: #fffae6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; border: 2px dashed #FFD700;">
            <p style="margin: 0; font-size: 20px; color: #333; font-weight: bold;">
              🏆 ${data.competitionName} 🏆
            </p>
            <p style="margin: 10px 0 0 0; font-size: 24px; color: #FFD700; font-weight: bold;">
              ${data.prize}
            </p>
          </div>
          
          <p>Our team will contact you shortly to arrange delivery of your prize.</p>
          
          <p>Thank you for participating and congratulations again on your big win!</p>
          
          <p style="color: #999; font-size: 12px; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 20px;">
            Have questions about your prize? Contact ${
              process.env.SUPPORT_EMAIL || "support@communityfortune.com"
            }<br>
            <strong>Community Fortune</strong><br>
            © 2024 Community Fortune. All rights reserved.
          </p>
        </div>
      `,
    },

    // KYC Approved
    kycApproved: {
      subject: "KYC Verification Approved - Community Fortune",
      text: `Congratulations ${data.username}! Your KYC verification has been approved.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px; background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; border-radius: 8px;">
            <h1 style="margin: 0;">KYC Verification Approved! ✅</h1>
          </div>
          
          <h2>Hello ${data.username},</h2>
          
          <p>Congratulations! Your KYC (Know Your Customer) verification has been successfully approved.</p>
          
          <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #155724; margin-top: 0;">✅ Verification Status:</h3>
            <ul style="color: #155724;">
              <li>KYC Status: <strong>Verified</strong></li>
              <li>Verification Level: Enhanced</li>
              <li>Verified at: ${new Date().toLocaleString()}</li>
            </ul>
          </div>
          
          <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0c5460; margin-top: 0;">🎯 Now You Can:</h3>
            <ul style="color: #0c5460;">
              <li>Make withdrawals from your cash wallet</li>
              <li>Participate in higher-value competitions</li>
              <li>Access all premium features</li>
              <li>Increase your account limits</li>
            </ul>
          </div>
          
          <p>Your account is now fully verified and you can enjoy all the benefits of being a verified Community Fortune member.</p>
          
          <p style="color: #999; font-size: 12px; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 20px;">
            <strong>Community Fortune</strong><br>
            © 2024 Community Fortune. All rights reserved.
          </p>
        </div>
      `,
    },

    // KYC Rejected
    kycRejected: {
      subject: "KYC Verification Update - Community Fortune",
      text: `Your KYC verification requires additional information. Please log in to your account to update your documents.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #3447AA; margin: 0;">Community Fortune</h2>
          </div>
          
          <h3 style="color: #333; border-bottom: 2px solid #dc3545; padding-bottom: 10px;">KYC Verification Update</h3>
          
          <p>Hello ${data.username},</p>
          
          <p>We need additional information to complete your KYC (Know Your Customer) verification.</p>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-size: 13px; color: #856404;">
              <strong>📋 Required Actions:</strong><br>
              1. Log in to your Community Fortune account<br>
              2. Go to Account Settings → Verification<br>
              3. Submit clear, legible documents<br>
              4. Ensure all information matches your registered details
            </p>
          </div>
          
          <p>Common reasons for rejection include:</p>
          <ul>
            <li>Blurry or unreadable documents</li>
            <li>Expired documents</li>
            <li>Information mismatch with account details</li>
            <li>Missing documents (front/back)</li>
          </ul>
          
          <p>Once you resubmit with correct documents, our team will review them within 24-48 hours.</p>
          
          <p style="color: #999; font-size: 12px; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 20px;">
            If you need assistance, contact our support team at ${
              process.env.SUPPORT_EMAIL || "support@communityfortune.com"
            }<br>
            <strong>Community Fortune</strong><br>
            © 2024 Community Fortune. All rights reserved.
          </p>
        </div>
      `,
    },
  };

  return templates[templateName] || null;
};

const isNotificationAllowed = async (notificationKey) => {
  try {
    return await systemSettingsCache.isNotificationEnabled(notificationKey);
  } catch (error) {
    console.warn(`Failed to evaluate notification setting for ${notificationKey}:`, error.message);
    return true;
  }
};


// Helper functions for common email sending scenarios
export const sendVerificationEmail = async (email, username, verificationToken) => {
  return await sendEmail(email, "verification", { username, verificationToken });
};

export const sendWelcomeEmail = async (email, username) => {
  if (!(await isNotificationAllowed("welcome_email"))) {
    return { success: true, message: "Welcome email suppressed by settings", suppressed: true };
  }
  return await sendEmail(email, "welcome", { username });
};

export const sendPasswordResetEmail = async (email, username, resetToken) => {
  if (!(await isNotificationAllowed("password_reset"))) {
    return { success: true, message: "Password reset email suppressed by settings", suppressed: true };
  }
  return await sendEmail(email, "passwordReset", { username, resetToken });
};

export const sendWithdrawalRequestEmail = async (email, username, amount, withdrawalId) => {
  if (!(await isNotificationAllowed("withdrawal_notification"))) {
    return { success: true, message: "Withdrawal request email suppressed by settings", suppressed: true };
  }
  return await sendEmail(email, "withdrawalRequest", { username, amount, withdrawalId });
};

export const sendWithdrawalApprovalEmail = async (email, username, amount) => {
  if (!(await isNotificationAllowed("withdrawal_notification"))) {
    return { success: true, message: "Withdrawal approval email suppressed by settings", suppressed: true };
  }
  return await sendEmail(email, "withdrawalApproved", { username, amount });
};

export const sendWithdrawalRejectionEmail = async (email, username, amount, reason) => {
  if (!(await isNotificationAllowed("withdrawal_notification"))) {
    return { success: true, message: "Withdrawal rejection email suppressed by settings", suppressed: true };
  }
  return await sendEmail(email, "withdrawalRejected", { username, amount, reason });
};

// New: Withdrawal Processing
export const sendWithdrawalProcessingEmail = async (email, username, amount) => {
  if (!(await isNotificationAllowed("withdrawal_notification"))) {
    return { success: true, message: "Withdrawal processing email suppressed by settings", suppressed: true };
  }
  return await sendEmail(email, "withdrawalProcessing", { username, amount });
};

// New: Withdrawal Completion
export const sendWithdrawalCompletionEmail = async (email, username, amount) => {
  if (!(await isNotificationAllowed("withdrawal_notification"))) {
    return { success: true, message: "Withdrawal completion email suppressed by settings", suppressed: true };
  }
  return await sendEmail(email, "withdrawalCompletion", { username, amount });
};

// New: OTP Email (for withdrawal verification)
export const sendOTPEmail = async (email, username, otp, context = "withdrawal") => {
  const notificationKey = context === "withdrawal" ? "withdrawal_notification" : "otp";
  if (!(await isNotificationAllowed(notificationKey))) {
    return { success: true, message: "OTP email suppressed by settings", suppressed: true };
  }
  return await sendEmail(email, "otp", { username, otp, context });
};

export const sendCompetitionWinEmail = async (email, username, competitionName, prize) => {
  if (!(await isNotificationAllowed("winner_notification"))) {
    return { success: true, message: "Competition win email suppressed by settings", suppressed: true };
  }
  return await sendEmail(email, "competitionWin", { username, competitionName, prize });
};

export const sendKycApprovalEmail = async (email, username) => {
  if (!(await isNotificationAllowed("kyc_status_update"))) {
    return { success: true, message: "KYC approval email suppressed by settings", suppressed: true };
  }
  return await sendEmail(email, "kycApproved", { username });
};

export const sendKycRejectionEmail = async (email, username) => {
  if (!(await isNotificationAllowed("kyc_status_update"))) {
    return { success: true, message: "KYC rejection email suppressed by settings", suppressed: true };
  }
  return await sendEmail(email, "kycRejected", { username });
};

// Test email function
export const testEmailConnection = async () => {
  try {
    const smtpConfig = {
      host: process.env.EMAIL_HOST || 'mail.technosophia.net',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false, // Use TLS
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false,
      },
    };

    const transporter = nodemailer.createTransport(smtpConfig);
    await transporter.verify();
    console.log("✅ Email server connection verified");
    return true;
  } catch (error) {
    console.error("❌ Email server connection failed:", error.message);
    return false;
  }
};

// Default export - export the main sendEmail function as default
export default sendEmail;
