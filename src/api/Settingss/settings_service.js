import pool from "../../../database.js";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from 'uuid';

class SettingsService {
  // ==================== PASSWORD SETTINGS ====================
  async changeAdminPassword(adminId, { oldPassword, newPassword, confirmNewPassword }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Get admin current password
      const [admin] = await connection.query(
        'SELECT password_hash FROM users WHERE id = ? AND role IN ("SUPERADMIN", "ADMIN")',
        [adminId]
      );

      if (admin.length === 0) {
        throw new Error('Admin not found');
      }

      // Verify old password
      const isValid = await bcrypt.compare(oldPassword, admin[0].password_hash);
      if (!isValid) {
        throw new Error('Current password is incorrect');
      }

      // Verify new passwords match
      if (newPassword !== confirmNewPassword) {
        throw new Error('New passwords do not match');
      }

      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await connection.query(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [hashedPassword, adminId]
      );

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?)',
        [adminId, 'CHANGE_PASSWORD', 'SETTINGS']
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== MAINTENANCE MODE ====================
  async getMaintenanceSettings() {
    // Store maintenance settings in system_settings table
    const [settings] = await pool.query(
      `SELECT 
        setting_key,
        setting_value,
        description
       FROM system_settings
       WHERE setting_key LIKE 'maintenance_%'
       OR setting_key = 'maintenance_mode'`
    );

    const formatted = {
      maintenance_mode: false,
      allowed_ips: [],
      maintenance_message: 'System is under maintenance. Please try again later.',
      estimated_duration: '2 hours'
    };

    settings.forEach(setting => {
      if (setting.setting_key === 'maintenance_mode') {
        formatted.maintenance_mode = setting.setting_value === 'true';
      } else if (setting.setting_key === 'maintenance_allowed_ips') {
        formatted.allowed_ips = JSON.parse(setting.setting_value || '[]');
      } else if (setting.setting_key === 'maintenance_message') {
        formatted.maintenance_message = setting.setting_value;
      } else if (setting.setting_key === 'maintenance_estimated_duration') {
        formatted.estimated_duration = setting.setting_value;
      }
    });

    return formatted;
  }

  async updateMaintenanceSettings(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const settings = [
        ['maintenance_mode', data.maintenance_mode.toString(), 'Maintenance mode status'],
        ['maintenance_allowed_ips', JSON.stringify(data.allowed_ips || []), 'Allowed IPs during maintenance'],
        ['maintenance_message', data.maintenance_message, 'Maintenance message'],
        ['maintenance_estimated_duration', data.estimated_duration, 'Estimated maintenance duration']
      ];

      for (const [key, value, description] of settings) {
        await connection.query(
          `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
           setting_value = VALUES(setting_value),
           description = VALUES(description),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
          [key, value, description, adminId]
        );
      }

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)',
        [adminId, 'UPDATE_MAINTENANCE', 'SETTINGS', JSON.stringify({ mode: data.maintenance_mode })]
      );

      await connection.commit();
      return this.getMaintenanceSettings();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== PAYMENT GATEWAY ====================
  async getPaymentGateways() {
    const [gateways] = await pool.query(
      `SELECT 
        setting_key,
        setting_value,
        description
       FROM system_settings
       WHERE setting_key LIKE 'payment_gateway_%'`
    );

    const formatted = {
      enabled_methods: ['credit_debit_card', 'paypal', 'bank_transfer', 'revolut'],
      gateways: {
        stripe: { enabled: false, publishable_key: '', secret_key: '' },
        paypal: { enabled: false, client_id: '', secret: '' },
        revolut: { enabled: false, api_key: '' }
      }
    };

    gateways.forEach(setting => {
      const key = setting.setting_key.replace('payment_gateway_', '');
      if (key === 'enabled_methods') {
        formatted.enabled_methods = JSON.parse(setting.setting_value || '[]');
      } else if (key.startsWith('stripe_')) {
        const stripeKey = key.replace('stripe_', '');
        formatted.gateways.stripe[stripeKey] = setting.setting_value;
      } else if (key.startsWith('paypal_')) {
        const paypalKey = key.replace('paypal_', '');
        formatted.gateways.paypal[paypalKey] = setting.setting_value;
      } else if (key.startsWith('revolut_')) {
        const revolutKey = key.replace('revolut_', '');
        formatted.gateways.revolut[revolutKey] = setting.setting_value;
      }
    });

    return formatted;
  }

  async updatePaymentGateways(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Update enabled methods
      await connection.query(
        `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         setting_value = VALUES(setting_value),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
        ['payment_gateway_enabled_methods', JSON.stringify(data.enabled_methods), 'Enabled payment methods', adminId]
      );

      // Update Stripe settings
      if (data.stripe) {
        for (const [key, value] of Object.entries(data.stripe)) {
          await connection.query(
            `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
             VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             setting_value = VALUES(setting_value),
             updated_by = VALUES(updated_by),
             updated_at = CURRENT_TIMESTAMP`,
            [`payment_gateway_stripe_${key}`, value, `Stripe ${key}`, adminId]
          );
        }
      }

      // Update PayPal settings
      if (data.paypal) {
        for (const [key, value] of Object.entries(data.paypal)) {
          await connection.query(
            `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
             VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             setting_value = VALUES(setting_value),
             updated_by = VALUES(updated_by),
             updated_at = CURRENT_TIMESTAMP`,
            [`payment_gateway_paypal_${key}`, value, `PayPal ${key}`, adminId]
          );
        }
      }

      // Update Revolut settings
      if (data.revolut) {
        for (const [key, value] of Object.entries(data.revolut)) {
          await connection.query(
            `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
             VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             setting_value = VALUES(setting_value),
             updated_by = VALUES(updated_by),
             updated_at = CURRENT_TIMESTAMP`,
            [`payment_gateway_revolut_${key}`, value, `Revolut ${key}`, adminId]
          );
        }
      }

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?)',
        [adminId, 'UPDATE_PAYMENT_GATEWAYS', 'SETTINGS']
      );

      await connection.commit();
      return this.getPaymentGateways();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getTransactionLimits() {
    const [limits] = await pool.query(
      `SELECT 
        setting_key,
        setting_value,
        description
       FROM system_settings
       WHERE setting_key LIKE 'transaction_limit_%'`
    );

    const formatted = {
      min_deposit: 10.00,
      max_deposit: 10000.00,
      min_withdrawal: 20.00,
      max_withdrawal: 5000.00,
      daily_deposit_limit: 5000.00,
      daily_withdrawal_limit: 2000.00
    };

    limits.forEach(limit => {
      const key = limit.setting_key.replace('transaction_limit_', '');
      if (formatted.hasOwnProperty(key)) {
        formatted[key] = parseFloat(limit.setting_value) || formatted[key];
      }
    });

    return formatted;
  }

  async updateTransactionLimits(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const limits = [
        ['min_deposit', data.min_deposit, 'Minimum deposit amount'],
        ['max_deposit', data.max_deposit, 'Maximum deposit amount'],
        ['min_withdrawal', data.min_withdrawal, 'Minimum withdrawal amount'],
        ['max_withdrawal', data.max_withdrawal, 'Maximum withdrawal amount'],
        ['daily_deposit_limit', data.daily_deposit_limit, 'Daily deposit limit'],
        ['daily_withdrawal_limit', data.daily_withdrawal_limit, 'Daily withdrawal limit']
      ];

      for (const [key, value, description] of limits) {
        await connection.query(
          `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
           setting_value = VALUES(setting_value),
           description = VALUES(description),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
          [`transaction_limit_${key}`, value.toString(), description, adminId]
        );
      }

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?)',
        [adminId, 'UPDATE_TRANSACTION_LIMITS', 'SETTINGS']
      );

      await connection.commit();
      return this.getTransactionLimits();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== SECURITY & AUTHENTICATION ====================
  async getSecuritySettings() {
    const [settings] = await pool.query(
      `SELECT 
        setting_key,
        setting_value,
        description
       FROM system_settings
       WHERE setting_key LIKE 'security_%'`
    );

    const formatted = {
      admin_session_timeout: 30, // minutes
      enable_captcha_failed_attempts: true,
      failed_attempts_threshold: 5,
      lock_account_minutes: 30,
      two_factor_enabled: false,
      password_min_length: 8,
      password_require_special: true
    };

    settings.forEach(setting => {
      const key = setting.setting_key.replace('security_', '');
      if (key === 'admin_session_timeout') {
        formatted.admin_session_timeout = parseInt(setting.setting_value) || 30;
      } else if (key === 'enable_captcha_failed_attempts') {
        formatted.enable_captcha_failed_attempts = setting.setting_value === 'true';
      } else if (key === 'failed_attempts_threshold') {
        formatted.failed_attempts_threshold = parseInt(setting.setting_value) || 5;
      } else if (key === 'lock_account_minutes') {
        formatted.lock_account_minutes = parseInt(setting.setting_value) || 30;
      } else if (key === 'two_factor_enabled') {
        formatted.two_factor_enabled = setting.setting_value === 'true';
      } else if (key === 'password_min_length') {
        formatted.password_min_length = parseInt(setting.setting_value) || 8;
      } else if (key === 'password_require_special') {
        formatted.password_require_special = setting.setting_value === 'true';
      }
    });

    return formatted;
  }

  async updateSecuritySettings(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const securitySettings = [
        ['admin_session_timeout', data.admin_session_timeout, 'Admin session timeout in minutes'],
        ['enable_captcha_failed_attempts', data.enable_captcha_failed_attempts, 'Enable CAPTCHA after failed attempts'],
        ['failed_attempts_threshold', data.failed_attempts_threshold, 'Failed login attempts threshold'],
        ['lock_account_minutes', data.lock_account_minutes, 'Account lock duration in minutes'],
        ['two_factor_enabled', data.two_factor_enabled, 'Enable two-factor authentication'],
        ['password_min_length', data.password_min_length, 'Minimum password length'],
        ['password_require_special', data.password_require_special, 'Require special characters in password']
      ];

      for (const [key, value, description] of securitySettings) {
        await connection.query(
          `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
           setting_value = VALUES(setting_value),
           description = VALUES(description),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
          [`security_${key}`, value.toString(), description, adminId]
        );
      }

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?)',
        [adminId, 'UPDATE_SECURITY_SETTINGS', 'SETTINGS']
      );

      await connection.commit();
      return this.getSecuritySettings();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== SUBSCRIPTION TIERS ====================
  async getSubscriptionTiers() {
    const [tiers] = await pool.query(
      `SELECT 
        st.*,
        COUNT(us.id) as current_subscribers
       FROM subscription_tiers st
       LEFT JOIN user_subscriptions us ON st.id = us.tier_id AND us.status = 'ACTIVE'
       GROUP BY st.id
       ORDER BY st.tier_level`
    );

    return tiers;
  }

  async getSubscriptionTierById(tierId) {
    const [tiers] = await pool.query(
      `SELECT 
        st.*,
        COUNT(us.id) as current_subscribers
       FROM subscription_tiers st
       LEFT JOIN user_subscriptions us ON st.id = us.tier_id AND us.status = 'ACTIVE'
       WHERE st.id = UUID_TO_BIN(?)
       GROUP BY st.id`,
      [tierId]
    );

    if (tiers.length === 0) {
      throw new Error('Subscription tier not found');
    }

    return tiers[0];
  }

  async createSubscriptionTier(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO subscription_tiers 
         (id, tier_name, tier_level, monthly_price, benefits, free_jackpot_tickets, monthly_site_credit, badge_name, subscriber_competition_access)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.tier_name,
          data.tier_level,
          data.monthly_price,
          JSON.stringify(data.benefits || []),
          data.free_jackpot_tickets || 0,
          data.monthly_site_credit || 0,
          data.badge_name || null,
          data.subscriber_competition_access || false
        ]
      );

      const [newTier] = await connection.query(
        'SELECT * FROM subscription_tiers WHERE id = ?',
        [result.insertId]
      );

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)',
        [adminId, 'CREATE_SUBSCRIPTION_TIER', 'SETTINGS', JSON.stringify({ tier_name: data.tier_name })]
      );

      await connection.commit();
      return newTier[0];
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Tier level already exists');
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateSubscriptionTier(tierId, data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if tier exists
      const [existing] = await connection.query(
        'SELECT * FROM subscription_tiers WHERE id = UUID_TO_BIN(?)',
        [tierId]
      );

      if (existing.length === 0) {
        throw new Error('Subscription tier not found');
      }

      await connection.query(
        `UPDATE subscription_tiers 
         SET tier_name = ?,
             tier_level = ?,
             monthly_price = ?,
             benefits = ?,
             free_jackpot_tickets = ?,
             monthly_site_credit = ?,
             badge_name = ?,
             subscriber_competition_access = ?
         WHERE id = UUID_TO_BIN(?)`,
        [
          data.tier_name,
          data.tier_level,
          data.monthly_price,
          JSON.stringify(data.benefits || []),
          data.free_jackpot_tickets || 0,
          data.monthly_site_credit || 0,
          data.badge_name || null,
          data.subscriber_competition_access || false,
          tierId
        ]
      );

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)',
        [adminId, 'UPDATE_SUBSCRIPTION_TIER', 'SETTINGS', JSON.stringify({ tier_id: tierId })]
      );

      await connection.commit();
      return this.getSubscriptionTierById(tierId);
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Tier level already exists');
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteSubscriptionTier(tierId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if any users are subscribed to this tier
      const [subscribers] = await connection.query(
        'SELECT COUNT(*) as count FROM user_subscriptions WHERE tier_id = UUID_TO_BIN(?) AND status = "ACTIVE"',
        [tierId]
      );

      if (subscribers[0].count > 0) {
        throw new Error('Cannot delete tier with active subscribers. Reassign users first.');
      }

      const [result] = await connection.query(
        'DELETE FROM subscription_tiers WHERE id = UUID_TO_BIN(?)',
        [tierId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Subscription tier not found');
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== NOTIFICATION SETTINGS ====================
  async getNotificationSettings() {
    const [settings] = await pool.query(
      `SELECT 
        setting_key,
        setting_value,
        description
       FROM system_settings
       WHERE setting_key LIKE 'notification_%'`
    );

    const formatted = {
      user_notifications: {
        welcome_email: true,
        competition_entry_confirmation: true,
        winner_notification: true,
        marketing_emails: false,
        deposit_notification: true,
        withdrawal_notification: true,
        kyc_status_update: true,
        referral_reward: true
      },
      admin_notifications: {
        new_user_signup: true,
        new_deposit: true,
        new_withdrawal: true,
        kyc_submission: true,
        competition_winner: true,
        system_alerts: true
      },
      email_templates: {
        welcome_subject: 'Welcome to Community Fortune!',
        welcome_body: 'Welcome {{username}}! Thank you for joining our community.',
        winner_subject: 'Congratulations! You Won!',
        winner_body: 'Congratulations {{username}}! You won {{prize}} in {{competition}}.'
      }
    };

    settings.forEach(setting => {
      const key = setting.setting_key.replace('notification_', '');
      if (key.startsWith('user_')) {
        const userKey = key.replace('user_', '');
        if (formatted.user_notifications.hasOwnProperty(userKey)) {
          formatted.user_notifications[userKey] = setting.setting_value === 'true';
        }
      } else if (key.startsWith('admin_')) {
        const adminKey = key.replace('admin_', '');
        if (formatted.admin_notifications.hasOwnProperty(adminKey)) {
          formatted.admin_notifications[adminKey] = setting.setting_value === 'true';
        }
      } else if (key.startsWith('email_')) {
        const emailKey = key.replace('email_', '');
        if (formatted.email_templates.hasOwnProperty(emailKey)) {
          formatted.email_templates[emailKey] = setting.setting_value;
        }
      }
    });

    return formatted;
  }

  async updateNotificationSettings(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Update user notifications
      if (data.user_notifications) {
        for (const [key, value] of Object.entries(data.user_notifications)) {
          await connection.query(
            `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
             VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             setting_value = VALUES(setting_value),
             updated_by = VALUES(updated_by),
             updated_at = CURRENT_TIMESTAMP`,
            [`notification_user_${key}`, value.toString(), `User notification: ${key}`, adminId]
          );
        }
      }

      // Update admin notifications
      if (data.admin_notifications) {
        for (const [key, value] of Object.entries(data.admin_notifications)) {
          await connection.query(
            `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
             VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             setting_value = VALUES(setting_value),
             updated_by = VALUES(updated_by),
             updated_at = CURRENT_TIMESTAMP`,
            [`notification_admin_${key}`, value.toString(), `Admin notification: ${key}`, adminId]
          );
        }
      }

      // Update email templates
      if (data.email_templates) {
        for (const [key, value] of Object.entries(data.email_templates)) {
          await connection.query(
            `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
             VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             setting_value = VALUES(setting_value),
             updated_by = VALUES(updated_by),
             updated_at = CURRENT_TIMESTAMP`,
            [`notification_email_${key}`, value, `Email template: ${key}`, adminId]
          );
        }
      }

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?)',
        [adminId, 'UPDATE_NOTIFICATION_SETTINGS', 'SETTINGS']
      );

      await connection.commit();
      return this.getNotificationSettings();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== LEGAL & COMPLIANCE ====================
  async getLegalSettings() {
    const [documents] = await pool.query(
      `SELECT 
        type,
        title,
        version,
        effective_date,
        is_active,
        updated_at
       FROM legal_documents
       ORDER BY type`
    );

    const [ageVerification] = await pool.query(
      `SELECT setting_value FROM system_settings 
       WHERE setting_key = 'age_verification_required'`
    );

    return {
      documents,
      age_verification_required: ageVerification[0]?.setting_value === 'true' || true
    };
  }

  async getLegalDocument(type) {
    const [documents] = await pool.query(
      `SELECT * FROM legal_documents 
       WHERE type = ? AND is_active = TRUE 
       ORDER BY version DESC LIMIT 1`,
      [type.toUpperCase()]
    );

    if (documents.length === 0) {
      throw new Error('Legal document not found');
    }

    return documents[0];
  }

  async updateLegalDocument(type, data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Get current active document to deactivate
      await connection.query(
        'UPDATE legal_documents SET is_active = FALSE WHERE type = ? AND is_active = TRUE',
        [type.toUpperCase()]
      );

      // Insert new document
      const [result] = await connection.query(
        `INSERT INTO legal_documents 
         (id, title, type, content, version, is_active, effective_date, updated_by)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, TRUE, ?, ?)`,
        [
          data.title,
          type.toUpperCase(),
          data.content,
          data.version,
          data.effective_date || new Date(),
          adminId
        ]
      );

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)',
        [adminId, 'UPDATE_LEGAL_DOCUMENT', 'SETTINGS', JSON.stringify({ type })]
      );

      await connection.commit();
      
      const [newDocument] = await connection.query(
        'SELECT * FROM legal_documents WHERE id = ?',
        [result.insertId]
      );

      return newDocument[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getAgeVerificationSettings() {
    const [settings] = await pool.query(
      `SELECT 
        setting_key,
        setting_value,
        description
       FROM system_settings
       WHERE setting_key = 'age_verification_required'`
    );

    return {
      require_age_verification: settings[0]?.setting_value === 'true' || true,
      minimum_age: 18,
      verification_method: 'DOCUMENT_UPLOAD'
    };
  }

  async updateAgeVerificationSettings(requireAgeVerification, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         setting_value = VALUES(setting_value),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
        ['age_verification_required', requireAgeVerification.toString(), 'Require age verification (18+)', adminId]
      );

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)',
        [adminId, 'UPDATE_AGE_VERIFICATION', 'SETTINGS', JSON.stringify({ required: requireAgeVerification })]
      );

      await connection.commit();
      return this.getAgeVerificationSettings();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== CONTACT SETTINGS ====================
  async getContactSettings() {
    const [settings] = await pool.query(
      `SELECT 
        setting_key,
        setting_value,
        description
       FROM contact_settings`
    );

    const formatted = {};
    settings.forEach(setting => {
      formatted[setting.setting_key] = setting.setting_value;
    });

    return formatted;
  }

  async updateContactSettings(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const [key, value] of Object.entries(data)) {
        await connection.query(
          `UPDATE contact_settings 
           SET setting_value = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE setting_key = ?`,
          [value, key]
        );
      }

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?)',
        [adminId, 'UPDATE_CONTACT_SETTINGS', 'SETTINGS']
      );

      await connection.commit();
      return this.getContactSettings();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== FAQ SETTINGS ====================
  async getAllFaqs() {
    const [faqs] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        scope,
        question,
        answer,
        is_published,
        sort_order,
        created_at,
        updated_at
       FROM faqs
       ORDER BY scope, sort_order`
    );

    return faqs;
  }

  async getFaqsByScope(scope) {
    const [faqs] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        scope,
        question,
        answer,
        is_published,
        sort_order,
        created_at,
        updated_at
       FROM faqs
       WHERE scope = ?
       AND is_published = TRUE
       ORDER BY sort_order`,
      [scope.toUpperCase()]
    );

    return faqs;
  }

  async createFaq(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO faqs 
         (id, scope, question, answer, is_published, sort_order)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?)`,
        [
          data.scope.toUpperCase(),
          data.question,
          data.answer,
          data.is_published !== undefined ? data.is_published : true,
          data.sort_order || 1
        ]
      );

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)',
        [adminId, 'CREATE_FAQ', 'SETTINGS', JSON.stringify({ scope: data.scope })]
      );

      await connection.commit();
      
      const [newFaq] = await connection.query(
        'SELECT BIN_TO_UUID(id) as id, * FROM faqs WHERE id = ?',
        [result.insertId]
      );

      return newFaq[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateFaq(faqId, data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `UPDATE faqs 
         SET scope = ?,
             question = ?,
             answer = ?,
             is_published = ?,
             sort_order = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [
          data.scope.toUpperCase(),
          data.question,
          data.answer,
          data.is_published !== undefined ? data.is_published : true,
          data.sort_order || 1,
          faqId
        ]
      );

      if (result.affectedRows === 0) {
        throw new Error('FAQ not found');
      }

      await connection.commit();
      
      const [updatedFaq] = await connection.query(
        'SELECT BIN_TO_UUID(id) as id, * FROM faqs WHERE id = UUID_TO_BIN(?)',
        [faqId]
      );

      return updatedFaq[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteFaq(faqId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        'DELETE FROM faqs WHERE id = UUID_TO_BIN(?)',
        [faqId]
      );

      if (result.affectedRows === 0) {
        throw new Error('FAQ not found');
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== VOUCHER SETTINGS ====================
  async getVoucherSettings() {
    const [vouchers] = await pool.query(
      `SELECT 
        BIN_TO_UUID(v.id) as id,
        v.code,
        v.campaign_name,
        v.voucher_type,
        v.reward_type,
        v.reward_value,
        v.start_date,
        v.expiry_date,
        v.usage_limit,
        v.usage_count,
        v.status,
        BIN_TO_UUID(v.created_by) as created_by,
        v.created_at,
        v.updated_at,
        (v.usage_limit - v.usage_count) as remaining_uses,
        CASE 
          WHEN v.expiry_date < NOW() THEN 'EXPIRED'
          WHEN v.usage_count >= v.usage_limit THEN 'USED_UP'
          WHEN v.status != 'ACTIVE' THEN v.status
          ELSE 'ACTIVE'
        END as effective_status
       FROM vouchers v
       ORDER BY v.created_at DESC`
    );

    return vouchers;
  }

  async createVoucher(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Generate unique code if not provided
      let code = data.code;
      if (!code && data.voucher_type === 'SINGLE_USE') {
        code = this.generateVoucherCode(8);
        // Ensure uniqueness
        let attempts = 0;
        while (attempts < 10) {
          const [existing] = await connection.query(
            'SELECT id FROM vouchers WHERE code = ?',
            [code]
          );
          if (existing.length === 0) break;
          code = this.generateVoucherCode(8);
          attempts++;
        }
      }

      const [result] = await connection.query(
        `INSERT INTO vouchers 
         (id, code, campaign_name, voucher_type, reward_type, reward_value,
          start_date, expiry_date, usage_limit, code_prefix,
          bulk_quantity, bulk_code_length, status, created_by)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UUID_TO_BIN(?))`,
        [
          code,
          data.campaign_name,
          data.voucher_type,
          data.reward_type,
          data.reward_value,
          data.start_date,
          data.expiry_date,
          data.usage_limit || 1,
          data.code_prefix || null,
          data.bulk_quantity || 0,
          data.bulk_code_length || 8,
          'ACTIVE',
          adminId
        ]
      );

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)',
        [adminId, 'CREATE_VOUCHER', 'SETTINGS', JSON.stringify({ campaign: data.campaign_name })]
      );

      await connection.commit();
      
      const [newVoucher] = await connection.query(
        'SELECT BIN_TO_UUID(id) as id, * FROM vouchers WHERE id = ?',
        [result.insertId]
      );

      return newVoucher[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateVoucher(voucherId, data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `UPDATE vouchers 
         SET campaign_name = ?,
             voucher_type = ?,
             reward_type = ?,
             reward_value = ?,
             start_date = ?,
             expiry_date = ?,
             usage_limit = ?,
             code_prefix = ?,
             bulk_quantity = ?,
             bulk_code_length = ?,
             status = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [
          data.campaign_name,
          data.voucher_type,
          data.reward_type,
          data.reward_value,
          data.start_date,
          data.expiry_date,
          data.usage_limit || 1,
          data.code_prefix || null,
          data.bulk_quantity || 0,
          data.bulk_code_length || 8,
          data.status || 'ACTIVE',
          voucherId
        ]
      );

      if (result.affectedRows === 0) {
        throw new Error('Voucher not found');
      }

      await connection.commit();
      
      const [updatedVoucher] = await connection.query(
        'SELECT BIN_TO_UUID(id) as id, * FROM vouchers WHERE id = UUID_TO_BIN(?)',
        [voucherId]
      );

      return updatedVoucher[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteVoucher(voucherId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        'DELETE FROM vouchers WHERE id = UUID_TO_BIN(?)',
        [voucherId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Voucher not found');
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  generateVoucherCode(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // ==================== SYSTEM SETTINGS ====================
  async getSystemSettings() {
    const [settings] = await pool.query(
      `SELECT 
        setting_key,
        setting_value,
        description
       FROM system_settings
       WHERE setting_key NOT LIKE 'notification_%'
       AND setting_key NOT LIKE 'security_%'
       AND setting_key NOT LIKE 'payment_gateway_%'
       AND setting_key NOT LIKE 'transaction_limit_%'
       AND setting_key NOT LIKE 'maintenance_%'
       AND setting_key != 'age_verification_required'`
    );

    const formatted = {
      site_name: 'Community Fortune',
      site_url: 'https://community-fortune.com',
      support_email: 'support@community-fortune.com',
      default_currency: 'USD',
      timezone: 'UTC',
      date_format: 'YYYY-MM-DD',
      items_per_page: 20,
      enable_registration: true,
      enable_email_verification: true,
      enable_kyc_verification: true,
      referral_enabled: true,
      social_sharing_enabled: true,
      game_leaderboard_enabled: true
    };

    settings.forEach(setting => {
      const key = setting.setting_key;
      if (formatted.hasOwnProperty(key)) {
        // Parse boolean values
        if (setting.setting_value === 'true' || setting.setting_value === 'false') {
          formatted[key] = setting.setting_value === 'true';
        } else if (!isNaN(setting.setting_value) && setting.setting_value !== '') {
          formatted[key] = parseFloat(setting.setting_value);
        } else {
          formatted[key] = setting.setting_value;
        }
      }
    });

    return formatted;
  }

  async updateSystemSettings(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const [key, value] of Object.entries(data)) {
        await connection.query(
          `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
           setting_value = VALUES(setting_value),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
          [key, value.toString(), `System setting: ${key}`, adminId]
        );
      }

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?)',
        [adminId, 'UPDATE_SYSTEM_SETTINGS', 'SETTINGS']
      );

      await connection.commit();
      return this.getSystemSettings();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default new SettingsService();