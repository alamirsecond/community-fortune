import pool from "../../../database.js";
import bcrypt from "bcrypt";

class SettingsService {
  // ==================== PASSWORD SETTINGS ====================
  async changeAdminPassword(adminId, { oldPassword, newPassword, confirmNewPassword }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Get admin current password
      const [admin] = await connection.query(
        'SELECT password_hash FROM users WHERE id = UUID_TO_BIN(?) AND role IN ("SUPERADMIN", "ADMIN")',
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

      // Validate password strength
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await connection.query(
        'UPDATE users SET password_hash = ? WHERE id = UUID_TO_BIN(?)',
        [hashedPassword, adminId]
      );

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module) VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?)',
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
    const [settings] = await pool.query(
      `SELECT 
        setting_key,
        setting_value,
        description
       FROM system_settings
       WHERE setting_key LIKE 'maintenance_%'`
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
        try {
          formatted.allowed_ips = JSON.parse(setting.setting_value || '[]');
        } catch {
          formatted.allowed_ips = [];
        }
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
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, UUID_TO_BIN(?))
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
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)',
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
    // Get enabled methods from system settings
    const [enabledMethods] = await pool.query(
      `SELECT setting_value FROM system_settings 
       WHERE setting_key = 'payment_enabled_methods'`
    );

    const methods = enabledMethods[0] ? JSON.parse(enabledMethods[0].setting_value || '[]') : [
      'credit_debit_card', 'paypal', 'bank_transfer', 'revolut'
    ];

    return {
      enabled_methods: methods,
      display_names: {
        credit_debit_card: 'Credit/Debit Cards (Visa, Mastercard, Amex)',
        paypal: 'PayPal',
        bank_transfer: 'Bank Transfer',
        revolut: 'Revolut'
      }
    };
  }

  async getAllPaymentGateways() {
    const connection = await pool.getConnection();
    try {
      // Get all payment gateway configurations
      const [gateways] = await connection.query(
        `SELECT 
          BIN_TO_UUID(id) as id,
          gateway,
          display_name,
          environment,
          is_enabled,
          min_deposit,
          max_deposit,
          min_withdrawal,
          max_withdrawal,
          processing_fee_percent,
          fixed_fee,
          logo_url,
          is_default,
          created_at,
          updated_at
         FROM payment_gateway_settings
         ORDER BY sort_order, gateway`
      );

      // Get enabled methods
      const [enabledMethods] = await connection.query(
        `SELECT setting_value FROM system_settings 
         WHERE setting_key = 'payment_enabled_methods'`
      );

      const methods = enabledMethods[0] ? JSON.parse(enabledMethods[0].setting_value || '[]') : [];

      return {
        gateways,
        enabled_methods: methods
      };
    } finally {
      connection.release();
    }
  }

  async enablePaymentGateway(gateway, environment, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Update payment_gateway_settings
      await connection.query(
        `UPDATE payment_gateway_settings 
         SET is_enabled = TRUE,
             updated_at = CURRENT_TIMESTAMP
         WHERE gateway = ? AND environment = ?`,
        [gateway, environment]
      );

      // Update enabled methods in system_settings
      const [currentMethods] = await connection.query(
        `SELECT setting_value FROM system_settings 
         WHERE setting_key = 'payment_enabled_methods'`
      );

      let methods = currentMethods[0] ? JSON.parse(currentMethods[0].setting_value) : [];
      
      // Map gateway to method key
      const methodMap = {
        'PAYPAL': 'paypal',
        'STRIPE': 'credit_debit_card',
        'REVOLUT': 'revolut'
      };

      const methodKey = methodMap[gateway];
      if (methodKey && !methods.includes(methodKey)) {
        methods.push(methodKey);
        
        await connection.query(
          `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, UUID_TO_BIN(?))
           ON DUPLICATE KEY UPDATE 
           setting_value = VALUES(setting_value),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
          ['payment_enabled_methods', JSON.stringify(methods), 'Enabled payment methods', adminId]
        );
      }

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)',
        [adminId, 'ENABLE_PAYMENT_GATEWAY', 'SETTINGS', JSON.stringify({ gateway, environment })]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async disablePaymentGateway(gateway, environment, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Update payment_gateway_settings
      await connection.query(
        `UPDATE payment_gateway_settings 
         SET is_enabled = FALSE,
             updated_at = CURRENT_TIMESTAMP
         WHERE gateway = ? AND environment = ?`,
        [gateway, environment]
      );

      // Update enabled methods in system_settings
      const [currentMethods] = await connection.query(
        `SELECT setting_value FROM system_settings 
         WHERE setting_key = 'payment_enabled_methods'`
      );

      let methods = currentMethods[0] ? JSON.parse(currentMethods[0].setting_value) : [];
      
      // Map gateway to method key
      const methodMap = {
        'PAYPAL': 'paypal',
        'STRIPE': 'credit_debit_card',
        'REVOLUT': 'revolut'
      };

      const methodKey = methodMap[gateway];
      if (methodKey && methods.includes(methodKey)) {
        methods = methods.filter(m => m !== methodKey);
        
        await connection.query(
          `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, UUID_TO_BIN(?))
           ON DUPLICATE KEY UPDATE 
           setting_value = VALUES(setting_value),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
          ['payment_enabled_methods', JSON.stringify(methods), 'Enabled payment methods', adminId]
        );
      }

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)',
        [adminId, 'DISABLE_PAYMENT_GATEWAY', 'SETTINGS', JSON.stringify({ gateway, environment })]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async configurePaymentGateway(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        gateway,
        environment,
        display_name,
        client_id,
        client_secret,
        api_key,
        webhook_secret,
        public_key,
        private_key,
        min_deposit,
        max_deposit,
        min_withdrawal,
        max_withdrawal,
        processing_fee_percent,
        fixed_fee,
        logo_url,
        is_default,
        allowed_countries,
        restricted_countries
      } = data;

      // Update or insert gateway configuration
      await connection.query(
        `INSERT INTO payment_gateway_settings (
          id, gateway, display_name, environment, client_id, client_secret, api_key,
          webhook_secret, public_key, private_key, min_deposit, max_deposit,
          min_withdrawal, max_withdrawal, processing_fee_percent, fixed_fee,
          logo_url, is_default, allowed_countries, restricted_countries, updated_by
        ) VALUES (
          UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UUID_TO_BIN(?)
        ) ON DUPLICATE KEY UPDATE
          display_name = VALUES(display_name),
          client_id = VALUES(client_id),
          client_secret = VALUES(client_secret),
          api_key = VALUES(api_key),
          webhook_secret = VALUES(webhook_secret),
          public_key = VALUES(public_key),
          private_key = VALUES(private_key),
          min_deposit = VALUES(min_deposit),
          max_deposit = VALUES(max_deposit),
          min_withdrawal = VALUES(min_withdrawal),
          max_withdrawal = VALUES(max_withdrawal),
          processing_fee_percent = VALUES(processing_fee_percent),
          fixed_fee = VALUES(fixed_fee),
          logo_url = VALUES(logo_url),
          is_default = VALUES(is_default),
          allowed_countries = VALUES(allowed_countries),
          restricted_countries = VALUES(restricted_countries),
          updated_by = VALUES(updated_by),
          updated_at = CURRENT_TIMESTAMP`,
        [
          gateway, display_name, environment, client_id || null, client_secret || null, api_key || null,
          webhook_secret || null, public_key || null, private_key || null, min_deposit || 1.00,
          max_deposit || 5000.00, min_withdrawal || 5.00, max_withdrawal || 10000.00,
          processing_fee_percent || 0.00, fixed_fee || 0.00, logo_url || null, is_default || false,
          allowed_countries ? JSON.stringify(allowed_countries) : null,
          restricted_countries ? JSON.stringify(restricted_countries) : null,
          adminId
        ]
      );

      // If this gateway is set as default, unset others
      if (is_default) {
        await connection.query(
          `UPDATE payment_gateway_settings 
           SET is_default = FALSE 
           WHERE gateway != ? AND environment = ?`,
          [gateway, environment]
        );
      }

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)',
        [adminId, 'CONFIGURE_PAYMENT_GATEWAY', 'SETTINGS', JSON.stringify({ gateway, environment })]
      );

      await connection.commit();

      // Return updated gateway
      const [updatedGateway] = await connection.query(
        `SELECT BIN_TO_UUID(id) as id, * FROM payment_gateway_settings 
         WHERE gateway = ? AND environment = ?`,
        [gateway, environment]
      );

      return updatedGateway[0];
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
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, UUID_TO_BIN(?))
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
        'INSERT INTO admin_activities (id, admin_id, action, module) VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?)',
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
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, UUID_TO_BIN(?))
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
        'INSERT INTO admin_activities (id, admin_id, action, module) VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?)',
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

  // ==================== NOTIFICATION SETTINGS ====================
  async getNotificationSettings() {
    // Get user notification settings
    const [settings] = await pool.query(
      `SELECT 
        setting_key,
        setting_value,
        description
       FROM system_settings
       WHERE setting_key LIKE 'notification_user_%'`
    );

    const userNotifications = {
      welcome_email: { enabled: true, mandatory: true },
      competition_entry_confirmation: { enabled: true, mandatory: false },
      winner_notification: { enabled: true, mandatory: true },
      marketing_emails: { enabled: false, mandatory: false },
      deposit_notification: { enabled: true, mandatory: false },
      withdrawal_notification: { enabled: true, mandatory: false },
      kyc_status_update: { enabled: true, mandatory: false },
      referral_reward: { enabled: true, mandatory: false }
    };

    settings.forEach(setting => {
      const key = setting.setting_key.replace('notification_user_', '');
      if (userNotifications.hasOwnProperty(key)) {
        userNotifications[key].enabled = setting.setting_value === 'true';
      }
    });

    return {
      user_notifications: userNotifications,
      admin_notifications: {
        new_user_signup: true,
        new_deposit: true,
        new_withdrawal: true,
        kyc_submission: true,
        competition_winner: true,
        system_alerts: true
      }
    };
  }

  async getNotificationTypes() {
    return {
      user: [
        { key: 'welcome_email', name: 'Welcome Email (on signup)', mandatory: true },
        { key: 'competition_entry_confirmation', name: 'Competition Entry Confirmation', mandatory: false },
        { key: 'winner_notification', name: 'Winner Notification', mandatory: true },
        { key: 'marketing_emails', name: 'Marketing Emails', mandatory: false },
        { key: 'deposit_notification', name: 'Deposit Notification', mandatory: false },
        { key: 'withdrawal_notification', name: 'Withdrawal Notification', mandatory: false },
        { key: 'kyc_status_update', name: 'KYC Status Update', mandatory: false },
        { key: 'referral_reward', name: 'Referral Reward Notification', mandatory: false }
      ],
      admin: [
        { key: 'new_user_signup', name: 'New User Signup' },
        { key: 'new_deposit', name: 'New Deposit' },
        { key: 'new_withdrawal', name: 'New Withdrawal' },
        { key: 'kyc_submission', name: 'KYC Submission' },
        { key: 'competition_winner', name: 'Competition Winner' },
        { key: 'system_alerts', name: 'System Alerts' }
      ]
    };
  }

  async enableNotificationType(type, category, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, UUID_TO_BIN(?))
         ON DUPLICATE KEY UPDATE 
         setting_value = VALUES(setting_value),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
        [`notification_${category}_${type}`, 'true', `${category} notification: ${type}`, adminId]
      );

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)',
        [adminId, 'ENABLE_NOTIFICATION', 'SETTINGS', JSON.stringify({ type, category })]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async disableNotificationType(type, category, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, UUID_TO_BIN(?))
         ON DUPLICATE KEY UPDATE 
         setting_value = VALUES(setting_value),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
        [`notification_${category}_${type}`, 'false', `${category} notification: ${type}`, adminId]
      );

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module, details) VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)',
        [adminId, 'DISABLE_NOTIFICATION', 'SETTINGS', JSON.stringify({ type, category })]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateEmailTemplates(data, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const [key, value] of Object.entries(data)) {
        await connection.query(
          `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_by)
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, UUID_TO_BIN(?))
           ON DUPLICATE KEY UPDATE 
           setting_value = VALUES(setting_value),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
          [`email_template_${key}`, value, `Email template: ${key}`, adminId]
        );
      }

      // Log activity
      await connection.query(
        'INSERT INTO admin_activities (id, admin_id, action, module) VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?)',
        [adminId, 'UPDATE_EMAIL_TEMPLATES', 'SETTINGS']
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Note: Other methods (subscription tiers, legal, contact, faq, voucher, system)

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