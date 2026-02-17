import pool from "../../../database.js";
import paymentGatewayService from "./PaymentGatewayService.js";
import secretManager, { SECRET_KEYS } from '../../Utils/secretManager.js';

class PaymentService {
  constructor() {
    // Gateways managed by PaymentGatewayService
  }

  static ALLOWED_GATEWAYS = new Set(['PAYPAL', 'STRIPE', 'REVOLUT']);

  // ==================== INITIALIZATION ====================
  // ==================== INITIALIZATION ====================
  // Gateway initialization is now handled by PaymentGatewayService

  // ==================== HELPER METHODS ====================
  async getGatewayConfigurations() {
    const connection = await pool.getConnection();
    try {
      const [gateways] = await connection.query(
        `SELECT * FROM payment_gateway_settings`
      );
      return gateways;
    } finally {
      connection.release();
    }
  }

  ensureGatewayAllowed(gateway) {
    const normalized = String(gateway || '').toUpperCase();
    if (!PaymentService.ALLOWED_GATEWAYS.has(normalized)) {
      throw new Error('Unsupported payment gateway');
    }
    return normalized;
  }

  async ensureGatewayInitialized(gateway) {
    await paymentGatewayService.validateGatewayAvailability(gateway);
    return String(gateway).toUpperCase();
  }

  // ==================== PUBLIC ROUTES ====================
  async getEnabledGateways(country = 'GB') {
    const connection = await pool.getConnection();
    try {
      const [gateways] = await connection.query(
        `SELECT 
          gateway,
          display_name,
          min_deposit,
          max_deposit,
          min_withdrawal,
          max_withdrawal,
          processing_fee_percent,
          fixed_fee,
          logo_url
         FROM payment_gateway_settings 
         WHERE is_enabled = TRUE 
         AND environment = 'SANDBOX'
         ORDER BY sort_order`
      );

      const filteredGateways = [];
      for (const gateway of gateways) {
        if (await this.isGatewayAllowedForCountry(gateway.gateway, country)) {
          filteredGateways.push(gateway);
        }
      }
      return filteredGateways;
    } finally {
      connection.release();
    }
  }

  async isGatewayAllowedForCountry(gateway, country) {
    const connection = await pool.getConnection();
    try {
      const [config] = await connection.query(
        `SELECT allowed_countries, restricted_countries 
         FROM payment_gateway_settings 
         WHERE gateway = ? AND environment = 'LIVE' AND is_enabled = TRUE`,
        [gateway]
      );
      if (config.length === 0) return false;
      const { allowed_countries, restricted_countries } = config[0];
      if (restricted_countries) {
        const restricted = JSON.parse(restricted_countries);
        if (restricted.includes(country)) return false;
      }
      if (allowed_countries) {
        const allowed = JSON.parse(allowed_countries);
        if (allowed.length > 0 && !allowed.includes(country)) return false;
      }
      return true;
    } finally {
      connection.release();
    }
  }

  // ==================== USER PAYMENT METHODS ====================
  async getUserPaymentMethods(userId) {
    const connection = await pool.getConnection();
    try {
      const [methods] = await connection.query(
        `SELECT 
          BIN_TO_UUID(id) as id,
          gateway,
          method_type,
          display_name,
          last_four,
          expiry_month,
          expiry_year,
          card_brand,
          bank_name,
          account_name,
          email,
          is_default,
          is_active,
          created_at
         FROM user_payment_methods 
         WHERE user_id = UUID_TO_BIN(?) AND is_active = TRUE
         ORDER BY is_default DESC, created_at DESC`,
        [userId]
      );
      return methods;
    } finally {
      connection.release();
    }
  }

  async addPaymentMethod(userId, methodData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const { gateway, method_type, gateway_account_id, ...details } = methodData;
      const [gatewayConfig] = await connection.query(
        `SELECT is_enabled FROM payment_gateway_settings 
         WHERE gateway = ? AND environment = 'LIVE'`,
        [gateway]
      );
      if (!gatewayConfig.length || !gatewayConfig[0].is_enabled) {
        throw new Error('Payment gateway is not enabled');
      }
      if (details.is_default) {
        await connection.query(
          `UPDATE user_payment_methods 
           SET is_default = FALSE 
           WHERE user_id = UUID_TO_BIN(?)`,
          [userId]
        );
      }
      const [result] = await connection.query(
        `INSERT INTO user_payment_methods 
         (id, user_id, gateway, method_type, gateway_account_id, 
          display_name, last_four, expiry_month, expiry_year, 
          card_brand, bank_name, account_name, email, is_default, metadata)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, gateway, method_type, gateway_account_id,
          details.display_name || null,
          details.last_four || null,
          details.expiry_month || null,
          details.expiry_year || null,
          details.card_brand || null,
          details.bank_name || null,
          details.account_name || null,
          details.email || null,
          details.is_default || false,
          JSON.stringify(details.metadata || {})
        ]
      );
      const [newMethod] = await connection.query(
        `SELECT *, BIN_TO_UUID(id) as id
         FROM user_payment_methods
         WHERE user_id = UUID_TO_BIN(?)
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      );
      await connection.commit();
      return newMethod[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updatePaymentMethod(userId, methodId, updateData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      if (updateData.is_default) {
        await connection.query(
          `UPDATE user_payment_methods 
           SET is_default = FALSE 
           WHERE user_id = UUID_TO_BIN(?)`,
          [userId]
        );
      }

      const updateFields = [];
      const updateValues = [];

      Object.keys(updateData).forEach(key => {
        if (key === 'metadata') {
          updateFields.push(`${key} = ?`);
          updateValues.push(JSON.stringify(updateData[key]));
        } else if (key !== 'id' && key !== 'user_id') {
          updateFields.push(`${key} = ?`);
          updateValues.push(updateData[key]);
        }
      });

      updateValues.push(methodId, userId);

      const [result] = await connection.query(
        `UPDATE user_payment_methods 
         SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?)`,
        updateValues
      );

      if (result.affectedRows === 0) {
        throw new Error('Payment method not found or unauthorized');
      }

      const [updatedMethod] = await connection.query(
        `SELECT BIN_TO_UUID(id) as id, * FROM user_payment_methods WHERE id = UUID_TO_BIN(?)`,
        [methodId]
      );

      await connection.commit();
      return updatedMethod[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async removePaymentMethod(userId, methodId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `UPDATE user_payment_methods 
         SET is_active = FALSE, is_default = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TOUID(?) AND user_id = UUID_TO_BIN(?)`,
        [methodId, userId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Payment method not found or unauthorized');
      }

      await connection.commit();
      return { success: true, message: 'Payment method removed' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async setDefaultPaymentMethod(userId, methodId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE user_payment_methods 
         SET is_default = FALSE 
         WHERE user_id = UUID_TO_BIN(?)`,
        [userId]
      );

      const [result] = await connection.query(
        `UPDATE user_payment_methods 
         SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?) AND is_active = TRUE`,
        [methodId, userId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Payment method not found or unauthorized');
      }

      await connection.commit();
      return { success: true, message: 'Default payment method updated' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== DEPOSITS ====================
  async createDeposit(userId, depositData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { amount, gateway, wallet_type, currency = 'GBP', payment_method_id, return_url, cancel_url } = depositData;
      const normalizedGateway = await this.ensureGatewayInitialized(gateway);

      if (!payment_method_id) {
        throw new Error('Payment method is required');
      }

      let userPaymentMethod = null;
      if (payment_method_id) {
        const [methods] = await connection.query(
          `SELECT gateway, gateway_account_id
           FROM user_payment_methods
           WHERE id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?) AND is_active = TRUE`,
          [payment_method_id, userId]
        );

        if (!methods.length) {
          throw new Error('Payment method not found for user');
        }

        userPaymentMethod = methods[0];

        if (userPaymentMethod.gateway !== normalizedGateway) {
          throw new Error('Payment method does not match selected gateway');
        }
      }

      const [user] = await connection.query(
        `SELECT email, country FROM users WHERE id = UUID_TO_BIN(?)`,
        [userId]
      );
      if (!user.length) throw new Error('User not found');

      const config = paymentGatewayService.getGatewayConfig(normalizedGateway);
      if (!config) throw new Error('Payment gateway is not available');

      if (amount < config.min_deposit || amount > config.max_deposit) {
        throw new Error(`Amount must be between ${config.min_deposit} and ${config.max_deposit}`);
      }

      const feeAmount = (amount * config.processing_fee_percent / 100) + config.fixed_fee;
      const netAmount = amount - feeAmount;

      const [paymentRequest] = await connection.query(
        `INSERT INTO payment_requests 
         (id, user_id, type, gateway, amount, currency, fee_amount, net_amount, 
          deposit_to_wallet, status, payment_method_id)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'DEPOSIT', ?, ?, ?, ?, ?, ?, 'PENDING', UUID_TO_BIN(?))`,
        [userId, normalizedGateway, amount, currency, feeAmount, netAmount, wallet_type, payment_method_id || null]
      );

      const requestId = paymentRequest.insertId;
      let paymentResult;

      switch (normalizedGateway) {
        case 'PAYPAL':
          paymentResult = await this.createPayPalDeposit(user[0].email, amount, currency, return_url, cancel_url, requestId);
          break;
        case 'STRIPE':
          paymentResult = await this.createStripeDeposit(
            user[0].email,
            amount,
            currency,
            requestId,
            userPaymentMethod?.gateway_account_id || null
          );
          break;
        case 'REVOLUT':
          paymentResult = await this.createRevolutDeposit(amount, currency, requestId);
          break;
        default:
          throw new Error('Unsupported payment gateway');
      }

      await connection.query(
        `UPDATE payment_requests 
         SET gateway_order_id = ?, gateway_payment_id = ?, gateway_response = ?
         WHERE id = ?`,
        [paymentResult.orderId || null, paymentResult.paymentId || null, JSON.stringify(paymentResult.gatewayResponse || {}), requestId]
      );

      const [payment] = await connection.query(
        `INSERT INTO payments 
         (id, user_id, type, amount, currency, status, gateway, 
          gateway_reference, reference_id, metadata)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'DEPOSIT', ?, ?, 'PENDING', ?, ?, UUID_TO_BIN(?), ?)`,
        [userId, amount, currency, normalizedGateway, paymentResult.paymentId || paymentResult.orderId, requestId, JSON.stringify({
          wallet_type, return_url, cancel_url, ...paymentResult.gatewayResponse
        })]
      );

      await connection.query(
        `UPDATE payment_requests SET payment_id = ? WHERE id = ?`,
        [payment.insertId, requestId]
      );

      await connection.query(
        `INSERT INTO transactions 
         (id, user_id, type, amount, currency, status, gateway, 
          reference_table, reference_id, payment_id, description)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'deposit', ?, ?, 'pending', ?, 
                 'payment_requests', UUID_TO_BIN(?), UUID_TO_BIN(?), ?)`,
        [userId, amount, currency, normalizedGateway, requestId, payment.insertId, `Deposit via ${normalizedGateway}`]
      );

      await connection.commit();

      return {
        paymentId: payment.insertId,
        requestId: requestId,
        checkoutUrl: paymentResult.checkoutUrl,
        paymentIntent: paymentResult.paymentIntent,
        ...paymentResult
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getDepositDetails(userId, depositId) {
    const connection = await pool.getConnection();
    try {
      const [deposit] = await connection.query(
        `SELECT 
          BIN_TO_UUID(pr.id) as id,
          pr.type,
          pr.gateway,
          pr.amount,
          pr.currency,
          pr.fee_amount,
          pr.net_amount,
          pr.status,
          pr.deposit_to_wallet,
          pr.created_at,
          pr.completed_at,
          pr.gateway_order_id,
          pr.gateway_payment_id,
          pr.gateway_response
         FROM payment_requests pr
         WHERE pr.id = UUID_TO_BIN(?) 
         AND pr.user_id = UUID_TO_BIN(?) 
         AND pr.type = 'DEPOSIT'`,
        [depositId, userId]
      );
      if (!deposit.length) throw new Error('Deposit not found');
      return deposit[0];
    } finally {
      connection.release();
    }
  }

  async getUserDeposits(userId, limit = 50, offset = 0) {
    const connection = await pool.getConnection();
    try {
      const [deposits] = await connection.query(
        `SELECT 
          BIN_TO_UUID(id) as id,
          gateway,
          amount,
          currency,
          status,
          created_at,
          completed_at
         FROM payment_requests 
         WHERE user_id = UUID_TO_BIN(?) 
         AND type = 'DEPOSIT'
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );

      const [total] = await connection.query(
        `SELECT COUNT(*) as total FROM payment_requests 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'DEPOSIT'`,
        [userId]
      );

      return {
        deposits,
        pagination: {
          total: total[0].total,
          limit,
          offset
        }
      };
    } finally {
      connection.release();
    }
  }

  async cancelDeposit(userId, depositId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [deposit] = await connection.query(
        `SELECT * FROM payment_requests 
         WHERE id = UUID_TO_BIN(?) 
         AND user_id = UUID_TO_BIN(?) 
         AND type = 'DEPOSIT' 
         AND status = 'PENDING'`,
        [depositId, userId]
      );

      if (!deposit.length) throw new Error('Deposit not found or cannot be cancelled');

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [depositId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [depositId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [depositId]
      );

      await connection.commit();
      return { success: true, message: 'Deposit cancelled successfully' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async retryDeposit(userId, depositId) {
    const connection = await pool.getConnection();
    try {
      const [deposit] = await connection.query(
        `SELECT * FROM payment_requests 
         WHERE id = UUID_TO_BIN(?) 
         AND user_id = UUID_TO_BIN(?) 
         AND type = 'DEPOSIT' 
         AND status IN ('FAILED', 'CANCELLED')`,
        [depositId, userId]
      );

      if (!deposit.length) throw new Error('Deposit not found or cannot be retried');

      const depositData = deposit[0];

      const retryData = {
        amount: depositData.amount,
        gateway: depositData.gateway,
        wallet_type: depositData.deposit_to_wallet,
        currency: depositData.currency,
        payment_method_id: depositData.payment_method_id
      };

      const result = await this.createDeposit(userId, retryData);

      await connection.query(
        `UPDATE payment_requests 
         SET retry_of = UUID_TO_BIN(?), updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [depositId, result.requestId]
      );

      return result;
    } catch (error) {
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== WITHDRAWALS ====================
  async createWithdrawal(userId, withdrawalData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { amount, gateway, account_details, payment_method_id } = withdrawalData;
      const normalizedGateway = await this.ensureGatewayInitialized(gateway);

      if (!payment_method_id) {
        throw new Error('Payment method is required');
      }

      if (payment_method_id) {
        const [methods] = await connection.query(
          `SELECT id FROM user_payment_methods
           WHERE id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?) AND is_active = TRUE`,
          [payment_method_id, userId]
        );

        if (!methods.length) {
          throw new Error('Payment method not found for user');
        }
      }

      const [wallet] = await connection.query(
        `SELECT balance FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
        [userId]
      );
      if (!wallet.length || wallet[0].balance < amount) throw new Error('Insufficient funds');

      const environment = process.env.NODE_ENV === 'production' ? 'LIVE' : 'SANDBOX';
      const [gatewayConfig] = await connection.query(
        `SELECT * FROM payment_gateway_settings 
         WHERE gateway = ? AND environment = ? AND is_enabled = TRUE`,
        [normalizedGateway, environment]
      );
      if (!gatewayConfig.length) throw new Error('Withdrawal gateway is not available');

      const config = gatewayConfig[0];
      if (amount < config.min_withdrawal || amount > config.max_withdrawal) {
        throw new Error(`Amount must be between ${config.min_withdrawal} and ${config.max_withdrawal}`);
      }

      const [limits] = await connection.query(
        `SELECT * FROM transaction_limits WHERE user_id = UUID_TO_BIN(?)`,
        [userId]
      );
      if (limits.length) {
        const limit = limits[0];
        if (amount > limit.max_single_withdrawal) {
          throw new Error(`Amount exceeds single withdrawal limit of ${limit.max_single_withdrawal}`);
        }
        if (amount + limit.daily_withdrawal_used > limit.daily_withdrawal_limit) {
          throw new Error(`Amount would exceed daily withdrawal limit of ${limit.daily_withdrawal_limit}`);
        }
      }

      const feeAmount = (amount * config.processing_fee_percent / 100) + config.fixed_fee;
      const netAmount = amount - feeAmount;

      const [withdrawal] = await connection.query(
        `INSERT INTO withdrawals 
         (id, user_id, amount, payment_method, account_details, status)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?, 'PENDING')`,
        [userId, amount, normalizedGateway, JSON.stringify(account_details)]
      );

      const withdrawalId = withdrawal.insertId;

      const [paymentRequest] = await connection.query(
        `INSERT INTO payment_requests 
         (id, user_id, type, gateway, amount, currency, fee_amount, net_amount,
          withdrawal_id, status, requires_admin_approval)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'WITHDRAWAL', ?, ?, 'GBP', ?, ?, 
                 UUID_TO_BIN(?), 'PENDING', TRUE)`,
        [userId, normalizedGateway, amount, feeAmount, netAmount, withdrawalId]
      );

      const requestId = paymentRequest.insertId;

      const [payment] = await connection.query(
        `INSERT INTO payments 
         (id, user_id, type, amount, currency, status, gateway, reference_id, metadata)
         VALUES (UUID_TO_UUID(), UUID_TO_BIN(?), 'WITHDRAWAL', ?, 'GBP', 'PENDING', ?, UUID_TO_BIN(?), ?)`,
        [userId, amount, normalizedGateway, requestId, JSON.stringify({
          account_details, fee_amount: feeAmount, net_amount: netAmount
        })]
      );

      await connection.query(
        `UPDATE withdrawals SET payment_id = ? WHERE id = ?`,
        [payment.insertId, withdrawalId]
      );

      await connection.query(
        `UPDATE payment_requests SET payment_id = ? WHERE id = ?`,
        [payment.insertId, requestId]
      );

      await connection.query(
        `INSERT INTO transactions 
         (id, user_id, type, amount, currency, status, gateway, 
          reference_table, reference_id, payment_id, description)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'withdrawal', ?, 'GBP', 'pending', ?, 
                 'payment_requests', UUID_TO_BIN(?), UUID_TO_BIN(?), ?)`,
        [userId, amount, normalizedGateway, requestId, payment.insertId, `Withdrawal via ${normalizedGateway}`]
      );

      await connection.query(
        `UPDATE wallets SET balance = balance - ? WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
        [amount, userId]
      );

      await connection.query(
        `INSERT INTO wallet_transactions 
         (id, wallet_id, amount, type, reference, description)
         SELECT 
           UUID_TO_BIN(UUID()),
           w.id,
           ?,
           'HOLD',
           ?,
           'Withdrawal hold'
         FROM wallets w 
         WHERE w.user_id = UUID_TO_BIN(?) AND w.type = 'CASH'`,
        [amount, `WITHDRAWAL_${withdrawalId}`, userId]
      );

      await connection.commit();

      return {
        withdrawalId: withdrawalId,
        requestId: requestId,
        paymentId: payment.insertId,
        amount: amount,
        feeAmount: feeAmount,
        netAmount: netAmount,
        status: 'PENDING',
        requiresAdminApproval: true
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getWithdrawalDetails(userId, withdrawalId) {
    const connection = await pool.getConnection();
    try {
      const [withdrawal] = await connection.query(
        `SELECT 
          BIN_TO_UUID(w.id) as id,
          w.amount,
          w.payment_method as gateway,
          w.account_details,
          w.status,
          w.requested_at,
          w.updated_at,
          w.admin_notes,
          pr.fee_amount,
          pr.net_amount,
          pr.gateway_payment_id
         FROM withdrawals w
         LEFT JOIN payment_requests pr ON w.payment_id = pr.payment_id
         WHERE w.id = UUID_TO_BIN(?) AND w.user_id = UUID_TO_BIN(?)`,
        [withdrawalId, userId]
      );
      if (!withdrawal.length) throw new Error('Withdrawal not found');

      const result = withdrawal[0];
      if (result.account_details) {
        result.account_details = JSON.parse(result.account_details);
      }

      return result;
    } finally {
      connection.release();
    }
  }

  async getUserWithdrawals(userId, limit = 50, offset = 0) {
    const connection = await pool.getConnection();
    try {
      const [withdrawals] = await connection.query(
        `SELECT 
          BIN_TO_UUID(id) as id,
          amount,
          payment_method as gateway,
          status,
          created_at,
          updated_at
         FROM withdrawals 
         WHERE user_id = UUID_TO_BIN(?)
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );

      const [total] = await connection.query(
        `SELECT COUNT(*) as total FROM withdrawals 
         WHERE user_id = UUID_TO_BIN(?)`,
        [userId]
      );

      return {
        withdrawals,
        pagination: {
          total: total[0].total,
          limit,
          offset
        }
      };
    } finally {
      connection.release();
    }
  }

  async cancelWithdrawal(userId, withdrawalId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [withdrawal] = await connection.query(
        `SELECT * FROM withdrawals 
         WHERE id = UUID_TO_BIN(?) 
         AND user_id = UUID_TO_BIN(?) 
         AND status = 'PENDING'`,
        [withdrawalId, userId]
      );

      if (!withdrawal.length) throw new Error('Withdrawal not found or cannot be cancelled');

      await connection.query(
        `UPDATE withdrawals 
         SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [withdrawalId]
      );

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
         WHERE withdrawal_id = UUID_TO_BIN(?)`,
        [withdrawalId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = (
           SELECT id FROM payment_requests WHERE withdrawal_id = UUID_TO_BIN(?)
         )`,
        [withdrawalId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = (
           SELECT id FROM payment_requests WHERE withdrawal_id = UUID_TO_BIN(?)
         )`,
        [withdrawalId]
      );

      await connection.query(
        `UPDATE wallets 
         SET balance = balance + ? 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
        [withdrawal[0].amount, userId]
      );

      await connection.query(
        `INSERT INTO wallet_transactions 
         (id, wallet_id, amount, type, reference, description)
         SELECT 
           UUID_TO_BIN(UUID()),
           w.id,
           ?,
           'RELEASE_HOLD',
           ?,
           'Withdrawal cancelled - funds released'
         FROM wallets w 
         WHERE w.user_id = UUID_TO_BIN(?) AND w.type = 'CASH'`,
        [withdrawal[0].amount, `WITHDRAWAL_${withdrawalId}_CANCELLED`, userId]
      );

      await connection.commit();
      return { success: true, message: 'Withdrawal cancelled successfully' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== TRANSACTIONS ====================
  async getUserTransactions(userId, filters = {}, limit = 50, offset = 0) {
    const connection = await pool.getConnection();
    try {
      let query = `SELECT 
          BIN_TO_UUID(t.id) as id,
          t.type,
          t.amount,
          t.currency,
          t.status,
          t.gateway,
         t.description,
          t.created_at,
          t.completed_at,
          t.reference_table,
          BIN_TO_UUID(t.reference_id) as reference_id
         FROM transactions t
         WHERE t.user_id = UUID_TO_BIN(?)`;

      const queryParams = [userId];
      let paramCount = 1;

      if (filters.type) {
        query += ` AND t.type = ?`;
        queryParams.push(filters.type);
        paramCount++;
      }

      if (filters.status) {
        query += ` AND t.status = ?`;
        queryParams.push(filters.status);
        paramCount++;
      }

      if (filters.startDate) {
        query += ` AND t.created_at >= ?`;
        queryParams.push(filters.startDate);
        paramCount++;
      }

      if (filters.endDate) {
        query += ` AND t.created_at <= ?`;
        queryParams.push(filters.endDate);
        paramCount++;
      }

      query += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
      queryParams.push(limit, offset);

      const [transactions] = await connection.query(query, queryParams);

      const [total] = await connection.query(
        `SELECT COUNT(*) as total FROM transactions t WHERE t.user_id = UUID_TO_BIN(?)`,
        [userId]
      );

      return {
        transactions,
        pagination: {
          total: total[0].total,
          limit,
          offset
        }
      };
    } finally {
      connection.release();
    }
  }


  async getTransactionDetails(transactionId) {
    const connection = await pool.getConnection();
    try {
      // Get transaction with user details and payment info
      const [transaction] = await connection.query(
        `SELECT 
        t.*,
        BIN_TO_UUID(t.id) as transaction_id,
        BIN_TO_UUID(t.user_id) as user_uuid,
        u.email as user_email,
        u.first_name,
        u.last_name,
        u.phone,
        u.status as user_status,
        u.created_at as user_created_at,
        p.gateway_reference,
        p.metadata as payment_metadata,
        pm.method_type,
        pm.display_name as payment_method_display,
        pm.last_four,
        pm.expiry_month,
        pm.expiry_year,
        pm.card_brand
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN payments p ON t.payment_id = p.id
       LEFT JOIN user_payment_methods pm ON p.payment_method_id = pm.id
       WHERE t.id = UUID_TO_BIN(?)`,
        [transactionId]
      );

      if (!transaction.length) {
        throw new Error('Transaction not found');
      }

      const tx = transaction[0];

      // Get user's total transaction stats
      const [userStats] = await connection.query(
        `SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN type = 'deposit' AND status = 'completed' THEN amount ELSE 0 END) as total_deposits,
        SUM(CASE WHEN type = 'withdrawal' AND status = 'completed' THEN amount ELSE 0 END) as total_withdrawals
       FROM transactions 
       WHERE user_id = UUID_TO_BIN(?)`,
        [tx.user_uuid]
      );

      // Get refund history for this transaction
      const [refunds] = await connection.query(
        `SELECT 
        BIN_TO_UUID(r.id) as refund_id,
        r.amount,
        r.currency,
        r.reason,
        r.status,
        r.created_at,
        r.gateway_refund_id,
        u.email as admin_email
       FROM refunds r
       LEFT JOIN users u ON r.admin_id = u.id
       WHERE r.transaction_id = UUID_TO_BIN(?)`,
        [transactionId]
      );

      // Get internal notes for this transaction
      const [notes] = await connection.query(
        `SELECT 
        BIN_TO_UUID(id) as note_id,
        content,
        created_at,
        u.email as admin_email,
        u.first_name as admin_first_name,
        u.last_name as admin_last_name
       FROM transaction_notes
       JOIN users u ON transaction_notes.admin_id = u.id
       WHERE transaction_id = UUID_TO_BIN(?)
       ORDER BY created_at DESC`,
        [transactionId]
      );

      // Parse payment metadata
      let paymentMetadata = {};
      try {
        if (tx.payment_metadata) {
          paymentMetadata = JSON.parse(tx.payment_metadata);
        }
      } catch (e) {
        paymentMetadata = {};
      }

      // Calculate processing fee if not already stored
      const processingFee = tx.processing_fee || (tx.amount * 0.029 + 0.30); // Example: 2.9% + £0.30
      const netAmount = tx.net_amount || (tx.amount - processingFee);

      return {
        transaction: {
          id: `TXN-${tx.id.substring(0, 8).toUpperCase()}`,
          transaction_amount: parseFloat(tx.amount),
          currency: tx.currency || 'GBP',
          type: tx.type,
          status: tx.status,
          created_at: tx.created_at,
          completed_at: tx.completed_at,
          gateway: tx.gateway,
          gateway_reference: tx.gateway_reference,
          description: tx.description
        },
        user_information: {
          full_name: `${tx.first_name} ${tx.last_name}`,
          email_address: tx.user_email,
          user_id: `USR-${tx.user_uuid.substring(0, 8).toUpperCase()}`,
          account_status: tx.user_status === 'active' ? 'Active & Verified' : tx.user_status,
          join_date: tx.user_created_at,
          total_transactions: userStats[0]?.total_transactions || 0,
          total_deposits: userStats[0]?.total_deposits || 0,
          total_withdrawals: userStats[0]?.total_withdrawals || 0
        },
        payment_details: {
          payment_method: tx.payment_method_display || `${tx.card_brand || 'Card'} ending in ${tx.last_four || '****'}`,
          processing_fee: processingFee,
          fee_percentage: ((processingFee / tx.amount) * 100).toFixed(1),
          card_holder: `${tx.first_name} ${tx.last_name}`,
          net_amount: netAmount,
          expiry: tx.expiry_month && tx.expiry_year ? `${tx.expiry_month}/${tx.expiry_year}` : null
        },
        refund_history: refunds,
        internal_notes: notes,
        available_actions: {
          can_refund: tx.status === 'completed' && ['deposit', 'competition_entry'].includes(tx.type),
          can_download_receipt: true,
          can_email_user: true,
          can_add_note: true,
          can_view_user: true
        }
      };
    } finally {
      connection.release();
    }
  }
  // ==================== PAYMENT REQUESTS ====================
  async getUserPaymentRequests(userId, limit = 50, offset = 0) {
    const connection = await pool.getConnection();
    try {
      const [requests] = await connection.query(
        `SELECT 
          BIN_TO_UUID(pr.id) as id,
          pr.type,
          pr.gateway,
          pr.amount,
          pr.currency,
          pr.status,
          pr.created_at,
          pr.completed_at,
          BIN_TO_UUID(pr.withdrawal_id) as withdrawal_id,
          pr.deposit_to_wallet
         FROM payment_requests pr
         WHERE pr.user_id = UUID_TO_BIN(?)
         ORDER BY pr.created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );

      const [total] = await connection.query(
        `SELECT COUNT(*) as total FROM payment_requests pr WHERE pr.user_id = UUID_TO_BIN(?)`,
        [userId]
      );

      return {
        requests,
        pagination: {
          total: total[0].total,
          limit,
          offset
        }
      };
    } finally {
      connection.release();
    }
  }

  async getPaymentRequestDetails(userId, requestId) {
    const connection = await pool.getConnection();
    try {
      const [request] = await connection.query(
        `SELECT 
          BIN_TO_UUID(pr.id) as id,
          pr.type,
          pr.gateway,
          pr.amount,
          pr.currency,
          pr.fee_amount,
          pr.net_amount,
          pr.status,
          pr.created_at,
          pr.completed_at,
          pr.gateway_order_id,
          pr.gateway_payment_id,
          pr.gateway_response,
          BIN_TO_UUID(pr.withdrawal_id) as withdrawal_id,
          pr.deposit_to_wallet,
          pr.requires_admin_approval,
          pr.admin_notes,
          pr.retry_of
         FROM payment_requests pr
         WHERE pr.id = UUID_TO_BIN(?) AND pr.user_id = UUID_TO_BIN(?)`,
        [requestId, userId]
      );

      if (!request.length) throw new Error('Payment request not found');

      const result = request[0];
      if (result.gateway_response) {
        result.gateway_response = JSON.parse(result.gateway_response);
      }

      return result;
    } finally {
      connection.release();
    }
  }

  // ==================== ADMIN ROUTES ====================
  async getAllPaymentRequests(filters = {}, limit = 50, offset = 0) {
    const connection = await pool.getConnection();
    try {
      let query = `SELECT 
          BIN_TO_UUID(pr.id) as id,
          BIN_TO_UUID(pr.user_id) as user_id,
          pr.type,
          pr.gateway,
          pr.amount,
          pr.currency,
          pr.status,
          pr.created_at,
          pr.completed_at,
          pr.requires_admin_approval,
          u.email as user_email,
          u.first_name,
          u.last_name
         FROM payment_requests pr
         JOIN users u ON pr.user_id = u.id
         WHERE 1=1`;

      const queryParams = [];

      if (filters.type) {
        query += ` AND pr.type = ?`;
        queryParams.push(filters.type);
      }

      if (filters.status) {
        query += ` AND pr.status = ?`;
        queryParams.push(filters.status);
      }

      if (filters.gateway) {
        query += ` AND pr.gateway = ?`;
        queryParams.push(filters.gateway);
      }

      if (filters.startDate) {
        query += ` AND pr.created_at >= ?`;
        queryParams.push(filters.startDate);
      }

      if (filters.endDate) {
        query += ` AND pr.created_at <= ?`;
        queryParams.push(filters.endDate);
      }

      query += ` ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`;
      queryParams.push(limit, offset);

      const [requests] = await connection.query(query, queryParams);

      const [total] = await connection.query(
        `SELECT COUNT(*) as total FROM payment_requests pr WHERE 1=1`,
        queryParams.slice(0, -2)
      );

      return {
        requests,
        pagination: {
          total: total[0].total,
          limit,
          offset
        }
      };
    } finally {
      connection.release();
    }
  }

  async approvePaymentRequest(adminId, requestId, notes = '') {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [request] = await connection.query(
        `SELECT * FROM payment_requests 
         WHERE id = UUID_TO_BIN(?) AND status = 'PENDING' AND requires_admin_approval = TRUE`,
        [requestId]
      );

      if (!request.length) throw new Error('Payment request not found or already processed');

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'APPROVED',
             admin_notes = CONCAT(admin_notes, ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [`\n[${new Date().toISOString()}] Approved by admin ${adminId}: ${notes}\n`, requestId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'approved', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );

      await connection.query(
        `INSERT INTO admin_activities 
         (id, admin_id, action, module, details)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)`,
        [adminId, 'APPROVE_PAYMENT_REQUEST', 'PAYMENT',
          JSON.stringify({ request_id: requestId, notes })]
      );

      await connection.commit();
      return { success: true, message: 'Payment request approved' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async rejectPaymentRequest(adminId, requestId, reason) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [request] = await connection.query(
        `SELECT * FROM payment_requests 
         WHERE id = UUID_TO_BIN(?) AND status = 'PENDING'`,
        [requestId]
      );

      if (!request.length) throw new Error('Payment request not found or already processed');

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'REJECTED',
             admin_notes = CONCAT(admin_notes, ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [`\n[${new Date().toISOString()}] Rejected by admin ${adminId}: ${reason}\n`, requestId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );

      if (request[0].type === 'WITHDRAWAL') {
        await connection.query(
          `UPDATE withdrawals 
           SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP
           WHERE payment_id = (
             SELECT id FROM payments WHERE reference_id = UUID_TO_BIN(?)
           )`,
          [requestId]
        );

        await connection.query(
          `UPDATE wallets 
           SET balance = balance + ? 
           WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
          [request[0].amount, request[0].user_id]
        );

        await connection.query(
          `INSERT INTO wallet_transactions 
           (id, wallet_id, amount, type, reference, description)
           SELECT 
             UUID_TO_BIN(UUID()),
             w.id,
             ?,
             'RELEASE_HOLD',
             ?,
             'Withdrawal rejected - funds released'
           FROM wallets w 
           WHERE w.user_id = UUID_TO_BIN(?) AND w.type = 'CASH'`,
          [request[0].amount, `WITHDRAWAL_REJECTED_${requestId}`, request[0].user_id]
        );
      }

      await connection.query(
        `INSERT INTO admin_activities 
         (id, admin_id, action, module, details)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)`,
        [adminId, 'REJECT_PAYMENT_REQUEST', 'PAYMENT',
          JSON.stringify({ request_id: requestId, reason })]
      );

      await connection.commit();
      return { success: true, message: 'Payment request rejected' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async completePaymentRequest(adminId, requestId, gatewayReference = null) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [request] = await connection.query(
        `SELECT * FROM payment_requests 
         WHERE id = UUID_TO_BIN(?) AND status IN ('PENDING', 'APPROVED')`,
        [requestId]
      );

      if (!request.length) throw new Error('Payment request not found or already completed');

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'COMPLETED',
             gateway_payment_id = ?,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [gatewayReference, requestId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'COMPLETED',
             gateway_capture_id = ?,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [gatewayReference, requestId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );

      if (request[0].type === 'DEPOSIT') {
        await connection.query(
          `UPDATE wallets 
           SET balance = balance + ? 
           WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
          [request[0].net_amount, request[0].user_id, request[0].deposit_to_wallet]
        );

        await connection.query(
          `INSERT INTO wallet_transactions 
           (id, wallet_id, amount, type, reference, description)
           SELECT 
             UUID_TO_BIN(UUID()),
             w.id,
             ?,
             'CREDIT',
             ?,
             'Deposit completed'
           FROM wallets w 
           WHERE w.user_id = UUID_TO_BIN(?) AND w.type = ?`,
          [request[0].net_amount, `DEPOSIT_${requestId}`, request[0].user_id, request[0].deposit_to_wallet]
        );
      }

      if (request[0].type === 'WITHDRAWAL') {
        await connection.query(
          `UPDATE withdrawals 
           SET status = 'COMPLETED',
               gateway_reference = ?,
               admin_id = UUID_TO_BIN(?),
               updated_at = CURRENT_TIMESTAMP
           WHERE payment_id = (
             SELECT id FROM payments WHERE reference_id = UUID_TO_BIN(?)
           )`,
          [gatewayReference, adminId, requestId]
        );
      }

      await connection.query(
        `INSERT INTO admin_activities 
         (id, admin_id, action, module, details)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)`,
        [adminId, 'COMPLETE_PAYMENT_REQUEST', 'PAYMENT',
          JSON.stringify({ request_id: requestId, gateway_reference: gatewayReference })]
      );

      await connection.commit();
      return { success: true, message: 'Payment request completed' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== TRANSACTION MANAGEMENT ====================
  async getAllTransactions(filters = {}, limit = 50, offset = 0) {
    const connection = await pool.getConnection();
    try {
      let query = `SELECT 
          BIN_TO_UUID(t.id) as id,
          BIN_TO_UUID(t.user_id) as user_id,
          t.type,
          t.amount,
          t.currency,
          t.status,
          t.gateway,
          t.description,
          t.created_at,
          t.completed_at,
          u.email as user_email,
          u.first_name,
          u.last_name
         FROM transactions t
         JOIN users u ON t.user_id = u.id
         WHERE 1=1`;

      const queryParams = [];

      if (filters.type) {
        query += ` AND t.type = ?`;
        queryParams.push(filters.type);
      }

      if (filters.status) {
        query += ` AND t.status = ?`;
        queryParams.push(filters.status);
      }

      if (filters.gateway) {
        query += ` AND t.gateway = ?`;
        queryParams.push(filters.gateway);
      }

      if (filters.startDate) {
        query += ` AND t.created_at >= ?`;
        queryParams.push(filters.startDate);
      }

      if (filters.endDate) {
        query += ` AND t.created_at <= ?`;
        queryParams.push(filters.endDate);
      }

      query += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
      queryParams.push(limit, offset);

      const [transactions] = await connection.query(query, queryParams);

      const [total] = await connection.query(
        `SELECT COUNT(*) as total FROM transactions t WHERE 1=1`,
        queryParams.slice(0, -2)
      );

      return {
        transactions,
        pagination: {
          total: total[0].total,
          limit,
          offset
        }
      };
    } finally {
      connection.release();
    }
  }

  async exportTransactions(filters = {}, limit = 200000) {
    const connection = await pool.getConnection();
    try {
      let query = `SELECT 
          BIN_TO_UUID(t.id) as id,
          BIN_TO_UUID(t.user_id) as user_id,
          t.type,
          t.amount,
          t.currency,
          t.status,
          t.gateway,
          t.description,
          t.created_at,
          t.completed_at,
          t.reference_table,
          BIN_TO_UUID(t.reference_id) as reference_id
         FROM transactions t
         WHERE 1=1`;

      const queryParams = [];

      if (filters.type) {
        query += ` AND t.type = ?`;
        queryParams.push(filters.type);
      }

      if (filters.status) {
        query += ` AND t.status = ?`;
        queryParams.push(filters.status);
      }

      if (filters.gateway) {
        query += ` AND t.gateway = ?`;
        queryParams.push(filters.gateway);
      }

      if (filters.startDate) {
        query += ` AND t.created_at >= ?`;
        queryParams.push(filters.startDate);
      }

      if (filters.endDate) {
        query += ` AND t.created_at <= ?`;
        queryParams.push(filters.endDate);
      }

      query += ` ORDER BY t.created_at DESC LIMIT ?`;
      queryParams.push(limit);

      const [transactions] = await connection.query(query, queryParams);
      return transactions;
    } finally {
      connection.release();
    }
  }
  // Add to paymentService.js
  async getTransactionAnalytics(period = 'this_week', startDate = null, endDate = null) {
    const connection = await pool.getConnection();
    try {
      // Calculate date ranges based on period
      let dateRange = this.calculateDateRange(period, startDate, endDate);

      // Get total deposits
      const [deposits] = await connection.query(
        `SELECT 
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) as count
       FROM transactions 
       WHERE type = 'deposit' 
         AND status = 'completed'
         AND created_at BETWEEN ? AND ?`,
        [dateRange.start, dateRange.end]
      );

      // Get total withdrawals
      const [withdrawals] = await connection.query(
        `SELECT 
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) as count
       FROM transactions 
       WHERE type = 'withdrawal' 
         AND status = 'completed'
         AND created_at BETWEEN ? AND ?`,
        [dateRange.start, dateRange.end]
      );

      // Get competition entries (assuming you have a competition_entries table)
      const [competitions] = await connection.query(
        `SELECT 
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) as count
       FROM transactions 
       WHERE type = 'competition_entry' 
         AND status = 'completed'
         AND created_at BETWEEN ? AND ?`,
        [dateRange.start, dateRange.end]
      );

      // Get pending withdrawals
      const [pendingWithdrawals] = await connection.query(
        `SELECT 
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) as count
       FROM transactions 
       WHERE type = 'withdrawal' 
         AND status = 'pending'
         AND created_at BETWEEN ? AND ?`,
        [dateRange.start, dateRange.end]
      );

      // Get today's activity
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const [todayActivity] = await connection.query(
        `SELECT 
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) as count
       FROM transactions 
       WHERE status = 'completed'
         AND created_at BETWEEN ? AND ?`,
        [todayStart, todayEnd]
      );

      // Get average transaction value
      const [avgTransaction] = await connection.query(
        `SELECT 
        COALESCE(AVG(amount), 0) as avg_amount,
        COUNT(*) as count
       FROM transactions 
       WHERE status = 'completed'
         AND created_at BETWEEN ? AND ?`,
        [dateRange.start, dateRange.end]
      );

      // Calculate net revenue (deposits + competition entries - withdrawals)
      const netRevenue = deposits[0].total_amount + competitions[0].total_amount - withdrawals[0].total_amount;
      const profitMargin = deposits[0].total_amount > 0 ?
        ((netRevenue / deposits[0].total_amount) * 100).toFixed(1) : 0;

      return {
        summary: {
          total_deposits: {
            amount: deposits[0].total_amount,
            count: deposits[0].count,
            currency: '£',
            change_percentage: 12, // You'd need to calculate this vs previous period
            change_label: '+12% this week',
            trend: 'up'
          },
          total_withdrawals: {
            amount: withdrawals[0].total_amount,
            count: withdrawals[0].count,
            currency: '£',
            change_percentage: -5,
            change_label: '-5% vs last week',
            trend: 'down'
          },
          competition_entries: {
            count: competitions[0].count,
            amount: competitions[0].total_amount,
            change_percentage: 18,
            change_label: '+18% vs last week',
            trend: 'up'
          },
          net_revenue: {
            amount: netRevenue,
            currency: '£',
            profit_margin: parseFloat(profitMargin),
            change_label: `+${profitMargin}% profit margin`,
            trend: 'up'
          },
          today_activity: {
            amount: todayActivity[0].total_amount,
            count: todayActivity[0].count,
            change_percentage: 8.5,
            change_label: '+8.5% vs yesterday'
          },
          pending_withdrawals: {
            count: pendingWithdrawals[0].count,
            total_amount: pendingWithdrawals[0].total_amount,
            label: `£${pendingWithdrawals[0].total_amount.toLocaleString()} in queue`
          },
          avg_transaction_value: {
            amount: avgTransaction[0].avg_amount,
            count: avgTransaction[0].count,
            change_percentage: 2.3,
            change_label: '+2.3% vs last month'
          }
        }
      };
    } finally {
      connection.release();
    }
  }

  calculateDateRange(period, startDate, endDate) {
    const now = new Date();
    let start, end = now;

    switch (period) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'this_week':
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        start = new Date(now.setDate(diff));
        start.setHours(0, 0, 0, 0);
        break;
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'custom':
        if (startDate && endDate) {
          start = new Date(startDate);
          end = new Date(endDate);
        }
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    }

    return { start, end };
  }
  async refundTransaction(adminId, transactionId, amount, reason) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [transaction] = await connection.query(
        `SELECT t.*, p.gateway, p.gateway_reference, p.amount as original_amount
         FROM transactions t
         JOIN payments p ON t.payment_id = p.id
         WHERE t.id = UUID_TO_BIN(?) AND t.status = 'completed'`,
        [transactionId]
      );

      if (!transaction.length) {
        throw new Error('Transaction not found or cannot be refunded');
      }

      const tx = transaction[0];
      const refundAmount = amount || tx.amount;

      const normalizedGateway = await this.ensureGatewayInitialized(tx.gateway);

      let refundResult;
      switch (normalizedGateway) {
        case 'PAYPAL':
          refundResult = await this.refundPayPalPayment(tx.gateway_reference, refundAmount);
          break;
        case 'STRIPE':
          refundResult = await this.refundStripePayment(tx.gateway_reference, refundAmount);
          break;
        case 'REVOLUT':
          refundResult = await this.refundRevolutPayment(tx.gateway_reference, refundAmount);
          break;
        default:
          throw new Error('Refund not supported for this gateway');
      }

      if (!refundResult.success) {
        throw new Error(`Refund failed: ${refundResult.error}`);
      }

      const [refund] = await connection.query(
        `INSERT INTO refunds 
         (id, payment_id, amount, currency, reason, gateway_refund_id, status)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?, ?, 'COMPLETED')`,
        [tx.payment_id, refundAmount, tx.currency, reason, refundResult.refundId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = CASE 
           WHEN ? = amount THEN 'REFUNDED' 
           ELSE 'PARTIALLY_REFUNDED' 
         END
         WHERE id = UUID_TO_BIN(?)`,
        [refundAmount, tx.payment_id]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [transactionId]
      );

      if (tx.type === 'deposit') {
        await connection.query(
          `UPDATE wallets 
           SET balance = balance - ? 
           WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
          [refundAmount, tx.user_id]
        );

        await connection.query(
          `INSERT INTO wallet_transactions 
           (id, wallet_id, amount, type, reference, description)
           SELECT 
             UUID_TO_BIN(UUID()),
             w.id,
             ?,
             'DEBIT',
             ?,
             'Refund: ?'
           FROM wallets w 
           WHERE w.user_id = UUID_TO_BIN(?) AND w.type = 'CASH'`,
          [refundAmount, `REFUND_${refund.insertId}`, reason, tx.user_id]
        );
      }

      await connection.query(
        `INSERT INTO admin_activities 
         (id, admin_id, action, module, details)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)`,
        [adminId, 'PROCESS_REFUND', 'PAYMENT',
          JSON.stringify({ transaction_id: transactionId, amount: refundAmount, reason })]
      );

      await connection.commit();
      return {
        refundId: refund.insertId,
        amount: refundAmount,
        gatewayRefundId: refundResult.refundId,
        status: 'COMPLETED'
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== WITHDRAWAL MANAGEMENT ====================
  async getWithdrawalDetails(withdrawalId, userId) {
    const connection = await pool.getConnection();

    try {
      let query = `
      SELECT
        BIN_TO_UUID(w.id) AS id,
        w.amount,
        w.payment_method AS gateway,
        w.account_details,
        w.status,
        w.requested_at,
        w.updated_at,
        w.admin_notes,
        pr.fee_amount,
        pr.net_amount,
        pr.gateway_payment_id
      FROM withdrawals w
      LEFT JOIN payment_requests pr ON w.payment_id = pr.payment_id
      WHERE w.user_id = UUID_TO_BIN(?)
    `;

      const params = [userId];

      // ✅ Only filter by ID if it's a real UUID
      if (withdrawalId && withdrawalId !== 'all') {
        query += ` AND w.id = UUID_TO_BIN(?)`;
        params.push(withdrawalId);
      }

      const [rows] = await connection.query(query, params);
      return withdrawalId === 'all' ? rows : rows[0] || [];

    } finally {
      connection.release();
    }
  }

  async processWithdrawal(adminId, withdrawalId, transactionReference) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Get withdrawal details
      const [withdrawal] = await connection.query(
        `SELECT w.*, pr.gateway, pr.amount, pr.net_amount, u.email, u.id as user_id
             FROM withdrawals w
             JOIN payment_requests pr ON w.payment_request_id = pr.id
             JOIN users u ON w.user_id = u.id
             WHERE w.id = UUID_TO_BIN(?) AND w.status = 'APPROVED'`,
        [withdrawalId]
      );

      if (!withdrawal.length) {
        throw new Error('Withdrawal not found or already processed');
      }

      const withdrawalData = withdrawal[0];

      // Parse account details
      let accountDetails = {};
      try {
        accountDetails = JSON.parse(withdrawalData.account_details);
      } catch (e) {
        accountDetails = { error: 'Invalid account details format' };
      }

      // Process via gateway
      let gatewayResult;
      const normalizedGateway = await this.ensureGatewayInitialized(withdrawalData.gateway);
      switch (normalizedGateway) {
        case 'PAYPAL':
          gatewayResult = await this.processPayPalWithdrawal(
            withdrawalData.email,
            withdrawalData.net_amount,
            'GBP',
            accountDetails
          );
          break;
        case 'STRIPE':
          gatewayResult = await this.processStripeWithdrawal(
            withdrawalData.net_amount,
            'GBP',
            accountDetails
          );
          break;
        case 'REVOLUT':
          gatewayResult = await this.processRevolutWithdrawal(
            withdrawalData.net_amount,
            'GBP',
            accountDetails
          );
          break;
        case 'BANK_TRANSFER':
          gatewayResult = await this.processBankTransferWithdrawal(
            withdrawalData.net_amount,
            'GBP',
            accountDetails
          );
          break;
        default:
          throw new Error('Unsupported withdrawal gateway');
      }

      if (!gatewayResult.success) {
        throw new Error(`Gateway error: ${gatewayResult.error}`);
      }

      // Update withdrawal status
      await connection.query(
        `UPDATE withdrawals 
             SET status = 'PROCESSING', 
                 admin_id = UUID_TO_BIN(?),
                 gateway_reference = ?,
                 processing_data = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = UUID_TO_BIN(?)`,
        [
          adminId,
          gatewayResult.reference || transactionReference,
          JSON.stringify(gatewayResult),
          withdrawalId
        ]
      );

      // Update payment request
      await connection.query(
        `UPDATE payment_requests 
             SET status = 'PROCESSING',
                 gateway_payment_id = ?,
                 gateway_response = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE withdrawal_id = UUID_TO_BIN(?)`,
        [
          gatewayResult.reference || transactionReference,
          JSON.stringify(gatewayResult.response || {}),
          withdrawalId
        ]
      );

      // Log admin activity
      await connection.query(
        `INSERT INTO admin_activities 
             (id, admin_id, action, module, details)
             VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)`,
        [adminId, 'PROCESS_WITHDRAWAL', 'PAYMENT',
          JSON.stringify({
            withdrawal_id: withdrawalId,
            amount: withdrawalData.amount,
            gateway: withdrawalData.gateway,
            reference: gatewayResult.reference
          })]
      );

      await connection.commit();

      return {
        success: true,
        withdrawalId: withdrawalId,
        reference: gatewayResult.reference,
        status: 'PROCESSING',
        gatewayResult: gatewayResult
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async rejectWithdrawal(adminId, withdrawalId, reason) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [withdrawal] = await connection.query(
        `SELECT * FROM withdrawals 
         WHERE id = UUID_TO_BIN(?) AND status = 'PENDING'`,
        [withdrawalId]
      );

      if (!withdrawal.length) {
        throw new Error('Withdrawal not found or already processed');
      }

      await connection.query(
        `UPDATE withdrawals 
         SET status = 'REJECTED',
             admin_id = UUID_TO_BIN(?),
             admin_notes = CONCAT(COALESCE(admin_notes, ''), ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [adminId, `\n[${new Date().toISOString()}] Rejected: ${reason}\n`, withdrawalId]
      );

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'REJECTED',
             updated_at = CURRENT_TIMESTAMP
         WHERE withdrawal_id = UUID_TO_BIN(?)`,
        [withdrawalId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'REJECTED',
             updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = (
           SELECT id FROM payment_requests WHERE withdrawal_id = UUID_TO_BIN(?)
         )`,
        [withdrawalId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'rejected',
             updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = (
           SELECT id FROM payment_requests WHERE withdrawal_id = UUID_TO_BIN(?)
         )`,
        [withdrawalId]
      );

      await connection.query(
        `UPDATE wallets 
         SET balance = balance + ? 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
        [withdrawal[0].amount, withdrawal[0].user_id]
      );

      await connection.query(
        `INSERT INTO wallet_transactions 
         (id, wallet_id, amount, type, reference, description)
         SELECT 
           UUID_TO_BIN(UUID()),
           w.id,
           ?,
           'RELEASE_HOLD',
           ?,
           'Withdrawal rejected - funds released'
         FROM wallets w 
         WHERE w.user_id = UUID_TO_BIN(?) AND w.type = 'CASH'`,
        [withdrawal[0].amount, `WITHDRAWAL_REJECTED_${withdrawalId}`, withdrawal[0].user_id]
      );

      await connection.query(
        `INSERT INTO admin_activities 
         (id, admin_id, action, module, details)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?)`,
        [adminId, 'REJECT_WITHDRAWAL', 'PAYMENT',
          JSON.stringify({ withdrawal_id: withdrawalId, reason })]
      );

      await connection.commit();
      return { success: true, message: 'Withdrawal rejected successfully' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== REPORTS ====================
  async getDailyReport(date = null) {
    const connection = await pool.getConnection();
    try {
      const reportDate = date || new Date().toISOString().split('T')[0];

      const [deposits] = await connection.query(
        `SELECT 
          COUNT(*) as count,
          SUM(amount) as total_amount,
          AVG(amount) as average_amount,
          gateway
         FROM payment_requests 
         WHERE type = 'DEPOSIT' 
         AND DATE(created_at) = ?
         AND status = 'COMPLETED'
         GROUP BY gateway`,
        [reportDate]
      );

      const [withdrawals] = await connection.query(
        `SELECT 
          COUNT(*) as count,
          SUM(amount) as total_amount,
          AVG(amount) as average_amount,
          payment_method as gateway
         FROM withdrawals 
         WHERE DATE(created_at) = ?
         AND status = 'COMPLETED'
         GROUP BY payment_method`,
        [reportDate]
      );

      const [fees] = await connection.query(
        `SELECT 
          SUM(fee_amount) as total_fees,
          gateway
         FROM payment_requests 
         WHERE DATE(created_at) = ?
         AND status = 'COMPLETED'
         GROUP BY gateway`,
        [reportDate]
      );

      const [newUsers] = await connection.query(
        `SELECT COUNT(*) as new_users 
         FROM users 
         WHERE DATE(created_at) = ?`,
        [reportDate]
      );

      return {
        date: reportDate,
        deposits,
        withdrawals,
        fees,
        new_users: newUsers[0].new_users || 0
      };
    } finally {
      connection.release();
    }
  }

  async getMonthlyReport(year = null, month = null) {
    const connection = await pool.getConnection();
    try {
      const currentDate = new Date();
      const reportYear = year || currentDate.getFullYear();
      const reportMonth = month || currentDate.getMonth() + 1;

      const [deposits] = await connection.query(
        `SELECT 
          DATE(created_at) as date,
          COUNT(*) as count,
          SUM(amount) as total_amount,
          gateway
         FROM payment_requests 
         WHERE type = 'DEPOSIT' 
         AND YEAR(created_at) = ?
         AND MONTH(created_at) = ?
         AND status = 'COMPLETED'
         GROUP BY DATE(created_at), gateway
         ORDER BY DATE(created_at)`,
        [reportYear, reportMonth]
      );

      const [withdrawals] = await connection.query(
        `SELECT 
          DATE(created_at) as date,
          COUNT(*) as count,
          SUM(amount) as total_amount,
          payment_method as gateway
         FROM withdrawals 
         WHERE YEAR(created_at) = ?
         AND MONTH(created_at) = ?
         AND status = 'COMPLETED'
         GROUP BY DATE(created_at), payment_method
         ORDER BY DATE(created_at)`,
        [reportYear, reportMonth]
      );

      const [summary] = await connection.query(
        `SELECT 
          COUNT(DISTINCT user_id) as active_users,
          SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE 0 END) as total_deposits,
          SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END) as total_withdrawals,
          SUM(fee_amount) as total_fees
         FROM payment_requests 
         WHERE YEAR(created_at) = ?
         AND MONTH(created_at) = ?
         AND status = 'COMPLETED'`,
        [reportYear, reportMonth]
      );

      return {
        year: reportYear,
        month: reportMonth,
        deposits,
        withdrawals,
        summary: summary[0] || {}
      };
    } finally {
      connection.release();
    }
  }

  async getGatewayReport(startDate = null, endDate = null) {
    const connection = await pool.getConnection();
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const reportStartDate = startDate || thirtyDaysAgo.toISOString().split('T')[0];
      const reportEndDate = endDate || new Date().toISOString().split('T')[0];

      const [gatewayStats] = await connection.query(
        `SELECT 
          pr.gateway,
          COUNT(CASE WHEN pr.type = 'DEPOSIT' THEN 1 END) as deposit_count,
          SUM(CASE WHEN pr.type = 'DEPOSIT' THEN pr.amount ELSE 0 END) as deposit_amount,
          COUNT(CASE WHEN pr.type = 'WITHDRAWAL' THEN 1 END) as withdrawal_count,
          SUM(CASE WHEN pr.type = 'WITHDRAWAL' THEN pr.amount ELSE 0 END) as withdrawal_amount,
          AVG(CASE WHEN pr.type = 'DEPOSIT' THEN pr.amount END) as avg_deposit,
          AVG(CASE WHEN pr.type = 'WITHDRAWAL' THEN pr.amount END) as avg_withdrawal,
          SUM(pr.fee_amount) as total_fees,
          COUNT(DISTINCT pr.user_id) as unique_users
         FROM payment_requests pr
         WHERE pr.created_at BETWEEN ? AND ?
         AND pr.status = 'COMPLETED'
         GROUP BY pr.gateway
         ORDER BY deposit_amount DESC`,
        [`${reportStartDate} 00:00:00`, `${reportEndDate} 23:59:59`]
      );

      const [successRates] = await connection.query(
        `SELECT 
          gateway,
          COUNT(*) as total_requests,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
         FROM payment_requests 
         WHERE created_at BETWEEN ? AND ?
         GROUP BY gateway`,
        [`${reportStartDate} 00:00:00`, `${reportEndDate} 23:59:59`]
      );

      return {
        period: {
          start_date: reportStartDate,
          end_date: reportEndDate
        },
        gateway_stats: gatewayStats,
        success_rates: successRates
      };
    } finally {
      connection.release();
    }
  }

  // ==================== SUPERADMIN ROUTES ====================
  async getGatewayConfigurations() {
    const connection = await pool.getConnection();

    const parseCountries = (value) => {
      if (!value) return [];

      // Already an array (some drivers return JSON as objects)
      if (Array.isArray(value)) return value;

      if (typeof value === 'string') {
        const trimmed = value.trim();

        // JSON array string
        if (trimmed.startsWith('[')) {
          try {
            return JSON.parse(trimmed);
          } catch {
            return [];
          }
        }

        // CSV fallback: "GB,US,CA,AU"
        return trimmed
          .split(',')
          .map(v => v.trim())
          .filter(Boolean);
      }

      return [];
    };

    try {
      const [configs] = await connection.query(
        `SELECT 
        BIN_TO_UUID(id) AS id,
        gateway,
        environment,
        display_name,
        client_id,
        client_secret,
        api_key,
        webhook_secret,
        is_enabled,
        min_deposit,
        max_deposit,
        min_withdrawal,
        max_withdrawal,
        processing_fee_percent,
        fixed_fee,
        allowed_countries,
        restricted_countries,
        sort_order,
        logo_url,
        created_at,
        updated_at
       FROM payment_gateway_settings
       ORDER BY gateway, environment`
      );

      return configs.map(config => ({
        ...config,
        allowed_countries: parseCountries(config.allowed_countries),
        restricted_countries: parseCountries(config.restricted_countries)
      }));
    } finally {
      connection.release();
    }
  }


  async updateGatewayConfiguration(configData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { id, ...updateData } = configData;

      const updateFields = [];
      const updateValues = [];

      Object.keys(updateData).forEach(key => {
        if (key === 'allowed_countries' || key === 'restricted_countries') {
          updateFields.push(`${key} = ?`);
          updateValues.push(JSON.stringify(updateData[key]));
        } else if (key !== 'id') {
          updateFields.push(`${key} = ?`);
          updateValues.push(updateData[key]);
        }
      });

      updateValues.push(id);

      const [result] = await connection.query(
        `UPDATE payment_gateway_settings 
         SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        updateValues
      );

      if (result.affectedRows === 0) {
        throw new Error('Gateway configuration not found');
      }

      await connection.commit();

      const [updatedConfig] = await connection.query(
        `SELECT * FROM payment_gateway_settings WHERE id = UUID_TO_BIN(?)`,
        [id]
      );

      return updatedConfig[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async testGatewayConnection(gateway, environment = 'LIVE') {
    const connection = await pool.getConnection();
    try {
      const [config] = await connection.query(
        `SELECT * FROM payment_gateway_settings 
         WHERE gateway = ? AND environment = ?`,
        [gateway, environment]
      );

      if (!config.length) {
        throw new Error('Gateway configuration not found');
      }

      const gatewayConfig = config[0];
      let testResult;

      switch (gateway.toUpperCase()) {
        case 'STRIPE':
          testResult = await this.testStripeConnection(gatewayConfig.secret_key);
          break;
        case 'PAYPAL':
          testResult = await this.testPayPalConnection(gatewayConfig.client_id, gatewayConfig.client_secret, environment);
          break;
        case 'REVOLUT':
          testResult = await this.testRevolutConnection(gatewayConfig.api_key, environment);
          break;
        default:
          throw new Error('Unsupported gateway for testing');
      }

      await connection.query(
        `UPDATE payment_gateway_settings 
         SET last_test_status = ?, last_test_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [testResult.success ? 'SUCCESS' : 'FAILED', gatewayConfig.id]
      );

      return testResult;
    } catch (error) {
      throw error;
    } finally {
      connection.release();
    }
  }

  async testStripeConnection(secretKey) {
    try {
      const stripe = new Stripe(secretKey);
      const balance = await stripe.balance.retrieve();
      return {
        success: true,
        message: 'Stripe connection successful',
        data: {
          available: balance.available,
          pending: balance.pending
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Stripe connection failed: ${error.message}`,
        error: error.message
      };
    }
  }

  async testPayPalConnection(clientId, clientSecret, environment) {
    try {
      const env = environment === 'LIVE'
        ? new paypal.core.LiveEnvironment(clientId, clientSecret)
        : new paypal.core.SandboxEnvironment(clientId, clientSecret);

      const client = new paypal.core.PayPalHttpClient(env);
      const request = new paypal.orders.OrdersCreateRequest();
      request.requestBody({
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: "USD",
            value: "1.00"
          }
        }]
      });

      await client.execute(request);
      return {
        success: true,
        message: 'PayPal connection successful'
      };
    } catch (error) {
      return {
        success: false,
        message: `PayPal connection failed: ${error.message}`,
        error: error.message
      };
    }
  }

  async testRevolutConnection(apiKey, environment) {
    try {
      const baseURL = environment === 'LIVE'
        ? 'https://b2b.revolut.com/api/1.0'
        : 'https://sandbox-b2b.revolut.com/api/1.0';

      const response = await axios.get(`${baseURL}/accounts`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        message: 'Revolut connection successful',
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        message: `Revolut connection failed: ${error.response?.data?.message || error.message}`,
        error: error.message
      };
    }
  }

  async getPaymentSettings() {
    const connection = await pool.getConnection();
    try {
      const [settings] = await connection.query(
        `SELECT 
          BIN_TO_UUID(id) as id,
          setting_key,
          setting_value,
          setting_type,
          description,
          is_editable,
          created_at,
          updated_at
         FROM payment_system_settings
         ORDER BY setting_key`
      );

      const formattedSettings = {};
      settings.forEach(setting => {
        formattedSettings[setting.setting_key] = {
          ...setting,
          setting_value: this.parseSettingValue(setting.setting_value, setting.setting_type)
        };
      });

      return formattedSettings;
    } finally {
      connection.release();
    }
  }

  parseSettingValue(value, type) {
    switch (type) {
      case 'BOOLEAN':
        return value === 'true' || value === '1';
      case 'NUMBER':
        return parseFloat(value);
      case 'JSON':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      case 'ARRAY':
        try {
          return JSON.parse(value);
        } catch {
          return value.split(',').map(item => item.trim());
        }
      default:
        return value;
    }
  }

  async updatePaymentSettings(settings) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const [key, value] of Object.entries(settings)) {
        const [setting] = await connection.query(
          `SELECT setting_type FROM payment_system_settings WHERE setting_key = ?`,
          [key]
        );

        if (setting.length) {
          let formattedValue = value;
          if (setting[0].setting_type === 'JSON' || setting[0].setting_type === 'ARRAY') {
            formattedValue = JSON.stringify(value);
          } else if (setting[0].setting_type === 'BOOLEAN') {
            formattedValue = value ? 'true' : 'false';
          }

          await connection.query(
            `UPDATE payment_system_settings 
             SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
             WHERE setting_key = ?`,
            [formattedValue, key]
          );
        }
      }

      await connection.commit();
      return { success: true, message: 'Payment settings updated successfully' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== WEBHOOK HANDLERS ====================
  async handlePayPalWebhook(event) {
    return await this.processPayPalWebhook(event);
  }

  async handleStripeWebhook(event) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO stripe_webhook_logs 
         (id, webhook_id, event_type, event_body, processed)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, FALSE)`,
        [event.id, event.type, JSON.stringify(event)]
      );

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handleStripePaymentSuccess(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handleStripePaymentFailed(event.data.object);
          break;
        case 'charge.refunded':
          await this.handleStripeRefund(event.data.object);
          break;
      }

      await connection.query(
        `UPDATE stripe_webhook_logs SET processed = TRUE WHERE webhook_id = ?`,
        [event.id]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error('Stripe webhook processing error:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async handleRevolutWebhook(event) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO revolut_webhook_logs 
         (id, webhook_id, event_type, event_body, processed)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, FALSE)`,
        [event.id, event.event, JSON.stringify(event)]
      );

      switch (event.event) {
        case 'ORDER_COMPLETED':
          await this.handleRevolutOrderCompleted(event.data);
          break;
        case 'ORDER_AUTHORISED':
          await this.handleRevolutOrderAuthorised(event.data);
          break;
        case 'ORDER_FAILED':
          await this.handleRevolutOrderFailed(event.data);
          break;
      }

      await connection.query(
        `UPDATE revolut_webhook_logs SET processed = TRUE WHERE webhook_id = ?`,
        [event.id]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error('Revolut webhook processing error:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== PRIVATE METHODS ====================
  async createPayPalDeposit(email, amount, currency, returnUrl, cancelUrl, requestId) {
    await paymentGatewayService.validateGatewayAvailability('PAYPAL');
    const paypalClient = paymentGatewayService.getPayPal();

    try {
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: currency,
            value: amount.toFixed(2)
          },
          description: "Deposit to Community Fortune",
          custom_id: `DEPOSIT_${requestId}`
        }],
        application_context: {
          brand_name: "Community Fortune",
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
          shipping_preference: "NO_SHIPPING"
        }
      });

      const order = await paypalClient.execute(request);

      let checkoutUrl = '';
      for (const link of order.result.links) {
        if (link.rel === "approve") {
          checkoutUrl = link.href;
          break;
        }
      }

      if (!checkoutUrl) {
        throw new Error('No approval URL found in PayPal response');
      }

      return {
        orderId: order.result.id,
        checkoutUrl,
        gatewayResponse: order.result
      };
    } catch (error) {
      console.error('PayPal create order error:', error);
      throw new Error(`PayPal error: ${error.message}`);
    }
  }

  async createStripeDeposit(email, amount, currency, requestId, paymentMethodId = null) {
    await paymentGatewayService.validateGatewayAvailability('STRIPE');
    const stripe = paymentGatewayService.getStripe();

    try {
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          user_id: requestId,
          type: 'deposit'
        }
      });

      let paymentIntent;

      if (paymentMethodId) {
        paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          customer: customer.id,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          metadata: {
            request_id: requestId,
            type: 'deposit'
          }
        });
      } else {
        paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          customer: customer.id,
          setup_future_usage: 'off_session',
          metadata: {
            request_id: requestId,
            type: 'deposit'
          }
        });
      }

      return {
        paymentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        paymentIntent: paymentIntent,
        gatewayResponse: paymentIntent
      };
    } catch (error) {
      console.error('Stripe create payment error:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  async createRevolutDeposit(amount, currency, requestId) {
    await paymentGatewayService.validateGatewayAvailability('REVOLUT');
    const revolutApi = paymentGatewayService.getRevolut();

    try {
      const order = await revolutApi.post('/orders', {
        amount: Math.round(amount * 100),
        currency: currency,
        description: `Deposit to Community Fortune - Request ${requestId}`,
        metadata: {
          request_id: requestId,
          type: 'deposit'
        }
      });

      return {
        orderId: order.data.id,
        checkoutUrl: order.data.checkout_url,
        gatewayResponse: order.data
      };
    } catch (error) {
      console.error('Revolut create order error:', error);
      throw new Error(`Revolut error: ${error.response?.data?.message || error.message}`);
    }
  }

  async processPayPalWithdrawal(email, amount, currency, accountDetails) {
    await paymentGatewayService.validateGatewayAvailability('PAYPAL');
    const paypalClient = paymentGatewayService.getPayPal();

    try {
      // For PayPal, accountDetails should contain:
      // - receiver_email (PayPal email)
      // - receiver_id (Optional: PayPal Payer ID)
      // - note (Optional: Payment note)

      if (!accountDetails.receiver_email) {
        return { success: false, error: 'PayPal email is required' };
      }

      // Check if it's a business or personal account
      const isBusinessAccount = accountDetails.receiver_email.includes('@business.paypal.com') ||
        accountDetails.receiver_email.endsWith('@paypal.com');

      if (isBusinessAccount) {
        // Use PayPal Payouts API for business accounts
        const request = new paypal.payouts.PayoutsPostRequest();
        request.requestBody({
          sender_batch_header: {
            sender_batch_id: `WITHDRAWAL_${Date.now()}`,
            email_subject: "You have a payout from Community Fortune",
            email_message: "You have received a withdrawal payout from Community Fortune."
          },
          items: [{
            recipient_type: "EMAIL",
            amount: {
              value: amount.toFixed(2),
              currency: currency
            },
            receiver: accountDetails.receiver_email,
            note: accountDetails.note || "Withdrawal from Community Fortune",
            sender_item_id: `item_${Date.now()}`
          }]
        });

        const payout = await paypalClient.execute(request);

        return {
          success: true,
          reference: payout.result.batch_header.payout_batch_id,
          batch_status: payout.result.batch_header.batch_status,
          response: payout.result
        };
      } else {
        // For personal accounts, use PayPal Payments API
        const request = new paypal.payments.PayoutsPostRequest();
        request.requestBody({
          sender_batch_header: {
            sender_batch_id: `WITHDRAWAL_${Date.now()}`,
            email_subject: "You have money!",
            email_message: "You have received a withdrawal payout from Community Fortune."
          },
          items: [{
            recipient_type: "EMAIL",
            amount: {
              value: amount.toFixed(2),
              currency: currency
            },
            receiver: accountDetails.receiver_email,
            note: accountDetails.note || "Withdrawal from Community Fortune",
            sender_item_id: `item_${Date.now()}`
          }]
        });

        const payout = await paypalClient.execute(request);

        return {
          success: true,
          reference: payout.result.batch_header.payout_batch_id,
          batch_status: payout.result.batch_header.batch_status,
          response: payout.result
        };
      }
    } catch (error) {
      console.error('PayPal withdrawal error:', error);
      return {
        success: false,
        error: error.message,
        details: error.response?.body || error
      };
    }
  }

  async checkPayPalPayoutStatus(payoutBatchId) {
    await paymentGatewayService.validateGatewayAvailability('PAYPAL');
    const paypalClient = paymentGatewayService.getPayPal();

    try {
      const request = new paypal.payouts.PayoutsGetRequest(payoutBatchId);
      const payout = await paypalClient.execute(request);

      return {
        success: true,
        status: payout.result.batch_header.batch_status,
        details: payout.result
      };
    } catch (error) {
      console.error('Check PayPal payout status error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async processStripeWithdrawal(amount, currency, accountDetails) {
    await paymentGatewayService.validateGatewayAvailability('STRIPE');
    const stripe = paymentGatewayService.getStripe();

    try {
      // For Stripe, accountDetails should contain:
      // - stripe_account_id (Connected Stripe account ID for platform payouts)
      // OR
      // - destination (bank account ID or card ID for customer payouts)
      // - method: 'instant', 'standard', or 'ach' (default: 'standard')

      const method = accountDetails.method || 'standard';
      const description = accountDetails.description || 'Withdrawal from Community Fortune';

      let payout;

      // Check if we're paying to a connected Stripe account (for platform)
      if (accountDetails.stripe_account_id) {
        // Payout to connected account (for marketplace/platform)
        payout = await stripe.payouts.create({
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          method: method,
          description: description,
          statement_descriptor: "COMMUNITYFORTUNE",
        }, {
          stripeAccount: accountDetails.stripe_account_id
        });
      }
      // Check if we're paying to a customer's bank account
      else if (accountDetails.destination) {
        // Create transfer to customer's connected account
        payout = await stripe.transfers.create({
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          destination: accountDetails.destination,
          description: description,
          metadata: {
            type: 'withdrawal',
            platform: 'Community Fortune'
          }
        });
      }
      // Check if we need to pay to a bank account directly
      else if (accountDetails.bank_account) {
        // For direct bank transfers
        payout = await stripe.payouts.create({
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          method: method,
          destination: accountDetails.bank_account,
          description: description,
          metadata: {
            type: 'withdrawal',
            user_email: accountDetails.email || '',
            platform: 'Community Fortune'
          }
        });
      }
      // Pay to customer's default payout method
      else {
        // Get customer's default payout method
        payout = await stripe.payouts.create({
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          method: method,
          description: description,
          metadata: {
            type: 'withdrawal',
            platform: 'Community Fortune'
          }
        });
      }

      return {
        success: true,
        reference: payout.id,
        status: payout.status,
        arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
        method: payout.method,
        response: payout
      };
    } catch (error) {
      console.error('Stripe withdrawal error:', error);
      return {
        success: false,
        error: error.message,
        stripe_error: error.raw ? error.raw : error
      };
    }
  }

  async createStripeConnectAccount(userId, email, country = 'GB') {
    await paymentGatewayService.validateGatewayAvailability('STRIPE');
    const stripe = paymentGatewayService.getStripe();

    try {
      // Create a Stripe Connect account for the user
      const account = await stripe.accounts.create({
        type: 'express', // 'standard', 'express', or 'custom'
        country: country,
        email: email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        metadata: {
          user_id: userId,
          platform: 'Community Fortune'
        }
      });

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.FRONTEND_URL}/withdrawal/setup?status=failed`,
        return_url: `${process.env.FRONTEND_URL}/withdrawal/setup?status=success`,
        type: 'account_onboarding'
      });

      return {
        success: true,
        account_id: account.id,
        onboarding_url: accountLink.url,
        account: account
      };
    } catch (error) {
      console.error('Create Stripe Connect account error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async checkStripePayoutStatus(payoutId) {
    await paymentGatewayService.validateGatewayAvailability('STRIPE');
    const stripe = paymentGatewayService.getStripe();

    try {
      const payout = await stripe.payouts.retrieve(payoutId);

      return {
        success: true,
        status: payout.status,
        amount: payout.amount / 100,
        currency: payout.currency,
        arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
        method: payout.method,
        failure_code: payout.failure_code,
        failure_message: payout.failure_message,
        details: payout
      };
    } catch (error) {
      console.error('Check Stripe payout status error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async processRevolutWithdrawal(amount, currency, accountDetails) {
    await paymentGatewayService.validateGatewayAvailability('REVOLUT');
    const revolutApi = paymentGatewayService.getRevolut();

    try {
      // For Revolut, accountDetails should contain:
      // - counterparty_id (Revolut counterparty ID)
      // - account_id (Revolut account ID)
      // OR
      // - counterparty: { name, email, phone, profile_type: 'personal'/'business' }
      // - request_id (Optional: Custom request ID for idempotency)

      const requestId = accountDetails.request_id || `WITHDRAWAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      let counterpartyId = accountDetails.counterparty_id;

      // If no counterparty_id provided, check if we need to create one
      if (!counterpartyId && accountDetails.counterparty) {
        const counterpartyResult = await this.createRevolutCounterparty(accountDetails.counterparty);
        if (!counterpartyResult.success) {
          return counterpartyResult;
        }
        counterpartyId = counterpartyResult.counterparty_id;
      }

      if (!counterpartyId) {
        return { success: false, error: 'Counterparty ID is required for Revolut withdrawal' };
      }

      // Create payment/payout
      const payment = await revolutApi.post('/pay', {
        request_id: requestId,
        account_id: accountDetails.account_id || await this.getDefaultRevolutAccountId(),
        receiver: {
          counterparty_id: counterpartyId,
          account_id: accountDetails.receiver_account_id
        },
        amount: Math.round(amount * 100), // Convert to cents/pence
        currency: currency,
        reference: accountDetails.reference || `Withdrawal from Community Fortune`,
        schedule_for: accountDetails.schedule_for || null // For scheduled payments
      });

      // Check if payment needs approval
      if (payment.data.state === 'created' || payment.data.state === 'pending') {
        // For payments that need approval
        await revolutApi.post(`/pay/${payment.data.id}/approve`);
      }

      return {
        success: true,
        reference: payment.data.id,
        state: payment.data.state,
        leg_id: payment.data.leg_id,
        created_at: payment.data.created_at,
        completed_at: payment.data.completed_at,
        response: payment.data
      };
    } catch (error) {
      console.error('Revolut withdrawal error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data || error
      };
    }
  }

  async createRevolutCounterparty(counterpartyData) {
    await paymentGatewayService.validateGatewayAvailability('REVOLUT');
    const revolutApi = paymentGatewayService.getRevolut();

    try {
      // Create a new counterparty
      const counterparty = await revolutApi.post('/counterparty', {
        company_name: counterpartyData.name,
        email: counterpartyData.email,
        phone: counterpartyData.phone,
        profile_type: counterpartyData.profile_type || 'personal',
        country: counterpartyData.country || 'GB',
        state: counterpartyData.state,
        city: counterpartyData.city,
        postcode: counterpartyData.postcode,
        address_line_1: counterpartyData.address_line_1,
        address_line_2: counterpartyData.address_line_2,
        individual_name: {
          first_name: counterpartyData.first_name,
          last_name: counterpartyData.last_name
        }
      });

      return {
        success: true,
        counterparty_id: counterparty.data.id,
        counterparty: counterparty.data
      };
    } catch (error) {
      console.error('Create Revolut counterparty error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async getRevolutAccounts() {
    await paymentGatewayService.validateGatewayAvailability('REVOLUT');
    const revolutApi = paymentGatewayService.getRevolut();

    try {
      const accounts = await revolutApi.get('/accounts');

      // Filter for GBP accounts or find default
      const gbpAccounts = accounts.data.filter(acc => acc.currency === 'GBP');
      const defaultAccount = gbpAccounts.find(acc => acc.state === 'active') || accounts.data[0];

      return {
        success: true,
        accounts: accounts.data,
        default_account_id: defaultAccount ? defaultAccount.id : null
      };
    } catch (error) {
      console.error('Get Revolut accounts error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async getDefaultRevolutAccountId() {
    try {
      return await secretManager.getSecret(SECRET_KEYS.REVOLUT_DEFAULT_ACCOUNT_ID, {
        fallbackEnvVar: 'REVOLUT_DEFAULT_ACCOUNT_ID',
        optional: true
      });
    } catch (error) {
      console.warn('Revolut default account not configured:', error.message);
      return null;
    }
  }

  async checkRevolutPaymentStatus(paymentId) {
    await paymentGatewayService.validateGatewayAvailability('REVOLUT');
    const revolutApi = paymentGatewayService.getRevolut();

    try {
      const payment = await revolutApi.get(`/transaction/${paymentId}`);

      return {
        success: true,
        state: payment.data.state,
        amount: payment.data.amount / 100,
        currency: payment.data.currency,
        created_at: payment.data.created_at,
        completed_at: payment.data.completed_at,
        details: payment.data
      };
    } catch (error) {
      console.error('Check Revolut payment status error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async refundPayPalPayment(paymentId, amount) {
    await paymentGatewayService.validateGatewayAvailability('PAYPAL');
    const paypalClient = paymentGatewayService.getPayPal();

    try {
      const request = new paypal.payments.CapturesRefundRequest(paymentId);
      request.requestBody({
        amount: {
          value: amount.toFixed(2),
          currency_code: 'GBP'
        }
      });

      const refund = await paypalClient.execute(request);
      return {
        success: true,
        refundId: refund.result.id
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async refundStripePayment(paymentId, amount) {
    await paymentGatewayService.validateGatewayAvailability('STRIPE');
    const stripe = paymentGatewayService.getStripe();

    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentId,
        amount: Math.round(amount * 100)
      });

      return {
        success: true,
        refundId: refund.id
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async refundRevolutPayment(orderId, amount) {
    // Implement Revolut refund logic
    return {
      success: true,
      refundId: `REVOLUT_REFUND_${Date.now()}`
    };
  }

  async processPayPalWebhook(event) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO paypal_webhook_logs 
         (id, webhook_id, event_type, resource_id, event_body, processed)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, FALSE)`,
        [event.id, event.event_type, event.resource?.id, JSON.stringify(event)]
      );

      switch (event.event_type) {
        case 'PAYMENT.CAPTURE.COMPLETED':
          await this.handlePayPalPaymentComplete(event.resource);
          break;
        case 'PAYMENT.CAPTURE.REFUNDED':
          await this.handlePayPalPaymentRefund(event.resource);
          break;
        case 'PAYMENT.CAPTURE.DENIED':
          await this.handlePayPalPaymentDenied(event.resource);
          break;
      }

      await connection.query(
        `UPDATE paypal_webhook_logs SET processed = TRUE WHERE webhook_id = ?`,
        [event.id]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error('PayPal webhook processing error:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async handlePayPalPaymentComplete(resource) {
    const connection = await pool.getConnection();
    try {
      const customId = resource.custom_id;
      if (!customId || !customId.startsWith('DEPOSIT_')) {
        return;
      }

      const requestId = customId.replace('DEPOSIT_', '');

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'COMPLETED',
             gateway_payment_id = ?,
             gateway_capture_id = ?,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [resource.id, resource.id, requestId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'COMPLETED',
             gateway_capture_id = ?,
             completed_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [resource.id, requestId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );

      const [deposit] = await connection.query(
        `SELECT pr.user_id, pr.net_amount, pr.deposit_to_wallet 
         FROM payment_requests pr 
         WHERE pr.id = UUID_TO_BIN(?)`,
        [requestId]
      );

      if (deposit.length) {
        const { user_id, net_amount, deposit_to_wallet } = deposit[0];

        await connection.query(
          `UPDATE wallets 
           SET balance = balance + ? 
           WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
          [net_amount, user_id, deposit_to_wallet]
        );

        await connection.query(
          `INSERT INTO wallet_transactions 
           (id, wallet_id, amount, type, reference, description)
           SELECT 
             UUID_TO_BIN(UUID()),
             w.id,
             ?,
             'CREDIT',
             ?,
             'Deposit via PayPal'
           FROM wallets w 
           WHERE w.user_id = UUID_TO_BIN(?) AND w.type = ?`,
          [net_amount, `PAYPAL_${resource.id}`, user_id, deposit_to_wallet]
        );

        await connection.query(
          `UPDATE transaction_limits 
           SET daily_deposit_used = daily_deposit_used + ?,
               weekly_deposit_used = weekly_deposit_used + ?,
               monthly_deposit_used = monthly_deposit_used + ?
           WHERE user_id = UUID_TO_BIN(?)`,
          [net_amount, net_amount, net_amount, user_id]
        );
      }
    } finally {
      connection.release();
    }
  }

  async handlePayPalPaymentRefund(resource) {
    const connection = await pool.getConnection();
    try {
      const [payment] = await connection.query(
        `SELECT p.id, p.user_id, p.amount 
         FROM payments p 
         WHERE p.gateway_capture_id = ?`,
        [resource.id]
      );

      if (payment.length) {
        await connection.query(
          `INSERT INTO refunds 
           (id, payment_id, amount, currency, gateway_refund_id, status)
           VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, 'GBP', ?, 'COMPLETED')`,
          [payment[0].id, resource.amount.value, resource.id]
        );

        await connection.query(
          `UPDATE payments 
           SET status = 'REFUNDED', updated_at = CURRENT_TIMESTAMP
           WHERE id = UUID_TO_BIN(?)`,
          [payment[0].id]
        );

        await connection.query(
          `UPDATE transactions 
           SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
           WHERE payment_id = UUID_TO_BIN(?)`,
          [payment[0].id]
        );

        await connection.query(
          `UPDATE wallets 
           SET balance = balance - ? 
           WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
          [resource.amount.value, payment[0].user_id]
        );
      }
    } finally {
      connection.release();
    }
  }

  async handlePayPalPaymentDenied(resource) {
    const connection = await pool.getConnection();
    try {
      const customId = resource.custom_id;
      if (!customId || !customId.startsWith('DEPOSIT_')) {
        return;
      }

      const requestId = customId.replace('DEPOSIT_', '');

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [requestId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );
    } finally {
      connection.release();
    }
  }

  async handleStripePaymentSuccess(paymentIntent) {
    const connection = await pool.getConnection();
    try {
      const requestId = paymentIntent.metadata?.request_id;
      if (!requestId) return;

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'COMPLETED',
             gateway_payment_id = ?,
             gateway_capture_id = ?,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [paymentIntent.id, paymentIntent.id, requestId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'COMPLETED',
             gateway_capture_id = ?,
             completed_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [paymentIntent.id, requestId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );

      const [deposit] = await connection.query(
        `SELECT pr.user_id, pr.net_amount, pr.deposit_to_wallet 
         FROM payment_requests pr 
         WHERE pr.id = UUID_TO_BIN(?)`,
        [requestId]
      );

      if (deposit.length) {
        const { user_id, net_amount, deposit_to_wallet } = deposit[0];

        await connection.query(
          `UPDATE wallets 
           SET balance = balance + ? 
           WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
          [net_amount, user_id, deposit_to_wallet]
        );

        await connection.query(
          `INSERT INTO wallet_transactions 
           (id, wallet_id, amount, type, reference, description)
           SELECT 
             UUID_TO_BIN(UUID()),
             w.id,
             ?,
             'CREDIT',
             ?,
             'Deposit via Stripe'
           FROM wallets w 
           WHERE w.user_id = UUID_TO_BIN(?) AND w.type = ?`,
          [net_amount, `STRIPE_${paymentIntent.id}`, user_id, deposit_to_wallet]
        );
      }
    } finally {
      connection.release();
    }
  }

  async handleStripePaymentFailed(paymentIntent) {
    const connection = await pool.getConnection();
    try {
      const requestId = paymentIntent.metadata?.request_id;
      if (!requestId) return;

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [requestId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );
    } finally {
      connection.release();
    }
  }

  async handleStripeRefund(refund) {
    const connection = await pool.getConnection();
    try {
      const [payment] = await connection.query(
        `SELECT p.id, p.user_id, p.amount 
         FROM payments p 
         WHERE p.gateway_capture_id = ?`,
        [refund.payment_intent]
      );

      if (payment.length) {
        await connection.query(
          `INSERT INTO refunds 
           (id, payment_id, amount, currency, gateway_refund_id, status)
           VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, 'GBP', ?, 'COMPLETED')`,
          [payment[0].id, refund.amount / 100, refund.id]
        );

        await connection.query(
          `UPDATE payments 
           SET status = 'REFUNDED', updated_at = CURRENT_TIMESTAMP
           WHERE id = UUID_TO_BIN(?)`,
          [payment[0].id]
        );

        await connection.query(
          `UPDATE transactions 
           SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
           WHERE payment_id = UUID_TO_BIN(?)`,
          [payment[0].id]
        );

        await connection.query(
          `UPDATE wallets 
           SET balance = balance - ? 
           WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
          [refund.amount / 100, payment[0].user_id]
        );
      }
    } finally {
      connection.release();
    }
  }

  async handleRevolutOrderCompleted(orderData) {
    const connection = await pool.getConnection();
    try {
      const requestId = orderData.metadata?.request_id;
      if (!requestId) return;

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'COMPLETED',
             gateway_payment_id = ?,
             gateway_capture_id = ?,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [orderData.id, orderData.id, requestId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'COMPLETED',
             gateway_capture_id = ?,
             completed_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [orderData.id, requestId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );

      const [deposit] = await connection.query(
        `SELECT pr.user_id, pr.net_amount, pr.deposit_to_wallet 
         FROM payment_requests pr 
         WHERE pr.id = UUID_TO_BIN(?)`,
        [requestId]
      );

      if (deposit.length) {
        const { user_id, net_amount, deposit_to_wallet } = deposit[0];

        await connection.query(
          `UPDATE wallets 
           SET balance = balance + ? 
           WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
          [net_amount, user_id, deposit_to_wallet]
        );

        await connection.query(
          `INSERT INTO wallet_transactions 
           (id, wallet_id, amount, type, reference, description)
           SELECT 
             UUID_TO_BIN(UUID()),
             w.id,
             ?,
             'CREDIT',
             ?,
             'Deposit via Revolut'
           FROM wallets w 
           WHERE w.user_id = UUID_TO_BIN(?) AND w.type = ?`,
          [net_amount, `REVOLUT_${orderData.id}`, user_id, deposit_to_wallet]
        );
      }
    } finally {
      connection.release();
    }
  }

  async handleRevolutOrderAuthorised(orderData) {
    // Handle authorisation event
    // For deposits, we typically wait for completion
    // For withdrawals, we might process here
  }

  async handleRevolutOrderFailed(orderData) {
    const connection = await pool.getConnection();
    try {
      const requestId = orderData.metadata?.request_id;
      if (!requestId) return;

      await connection.query(
        `UPDATE payment_requests 
         SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [requestId]
      );

      await connection.query(
        `UPDATE payments 
         SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );

      await connection.query(
        `UPDATE transactions 
         SET status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = UUID_TO_BIN(?)`,
        [requestId]
      );
    } finally {
      connection.release();
    }
  }

  // ==================== REFUND PAYMENT ====================
  async refundPayment(adminId, requestId, amount, reason) {
    return await this.refundTransaction(adminId, requestId, amount, reason);
  }
}

export default new PaymentService();