import nodemailer from "nodemailer";

const smtpPort = parseInt(process.env.EMAIL_PORT, 10) || 465;
const smtpSecure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === "true"
  : smtpPort === 465;
const smtpTimeoutMs = parseInt(process.env.SMTP_TIMEOUT_MS, 10) || 10000;

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  connectionTimeout: smtpTimeoutMs,
  greetingTimeout: smtpTimeoutMs,
  socketTimeout: smtpTimeoutMs,
});

// Send admin creation email
export const sendAdminCreationEmail = async ({
  to,
  subject,
  name,
  email,
  password,
  loginUrl,
  isReset = false,
}) => {
  try {
    const action = isReset ? "reset" : "created";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4f46e5; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .credentials { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
          .warning { color: #dc2626; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Community Fortune</h1>
            <h2>${isReset ? "Password Reset" : "Admin Account Created"}</h2>
          </div>
          
          <div class="content">
            <p>Hello <strong>${name}</strong>,</p>
            
            <p>Your admin account has been ${action} for the Community Fortune platform.</p>
            
            <div class="credentials">
              <h3>Your Login Credentials:</h3>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Temporary Password:</strong> ${password}</p>
              <p class="warning">⚠️ Please change your password after first login!</p>
            </div>
            
            <p style="text-align: center;">
              <a href="${loginUrl}" class="button">Login to Admin Panel</a>
            </p>
            
            <p><strong>Important Security Notes:</strong></p>
            <ul>
              <li>Never share your credentials with anyone</li>
              <li>Change your password immediately after first login</li>
              <li>Use a strong, unique password</li>
              <li>Enable two-factor authentication if available</li>
            </ul>
            
            <p>If you didn't request this ${action} account, please contact our support team immediately.</p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} Community Fortune. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Community Fortune - ${
        isReset ? "Password Reset" : "Admin Account Created"
      }
      
      Hello ${name},
      
      Your admin account has been ${action} for the Community Fortune platform.
      
      Login Details:
      Email: ${email}
      Temporary Password: ${password}
      
      ⚠️ IMPORTANT: Please change your password after first login!
      
      Login URL: ${loginUrl}
      
      Security Notes:
      - Never share your credentials
      - Change password immediately
      - Use a strong, unique password
      - Enable two-factor authentication
      
      If you didn't request this ${action} account, contact support immediately.
      
      © ${new Date().getFullYear()} Community Fortune
    `;

    const fromAddress = process.env.EMAIL_FROM;

    await transporter.sendMail({
      from: `"Community Fortune" <${fromAddress}>`,
      to,
      subject,
      html,
      text,
    });

    console.log(`✅ Admin ${action} email sent to: ${to}`);
    return true;
  } catch (error) {
    console.error(
      `❌ Failed to send admin ${isReset ? "reset" : "creation"} email:`,
      error
    );
    throw error;
  }
};

// Send password reset email
export const sendPasswordEmail = async ({
  to,
  subject,
  name,
  resetLink,
  role,
}) => {
  try {
    const panel =
      role === "SUPERADMIN"
        ? "Superadmin"
        : role === "ADMIN"
        ? "Admin"
        : "User";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4f46e5; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .button { display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .warning { color: #dc2626; font-size: 12px; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Community Fortune</h1>
            <h2>Password Reset Request</h2>
          </div>
          
          <div class="content">
            <p>Hello <strong>${name}</strong>,</p>
            
            <p>We received a request to reset your password for the Community Fortune ${panel} Panel.</p>
            
            <p style="text-align: center;">
              <a href="${resetLink}" class="button">Reset Your Password</a>
            </p>
            
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #6b7280;">${resetLink}</p>
            
            <p class="warning">⚠️ This link will expire in 1 hour for security reasons.</p>
            
            <p>If you didn't request a password reset, please ignore this email or contact support if you're concerned.</p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} Community Fortune. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Community Fortune - Password Reset Request
      
      Hello ${name},
      
      We received a request to reset your password for the Community Fortune ${panel} Panel.
      
      Reset your password here: ${resetLink}
      
      ⚠️ This link expires in 1 hour.
      
      If you didn't request this, please ignore this email.
      
      © ${new Date().getFullYear()} Community Fortune
    `;

    await transporter.sendMail({
      from: `"Community Fortune" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
      text,
    });

    console.log(`✅ Password reset email sent to: ${to}`);
    return true;
  } catch (error) {
    console.error("❌ Failed to send password reset email:", error);
    throw error;
  }
};
