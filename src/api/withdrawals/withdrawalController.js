// controllers/withdrawalController.js - UPDATED WITH PDF REQUIREMENTS
import { v4 as uuidv4 } from 'uuid';
import pool from '../../../database.js';
import paymentService from '../Payments/payment_service.js';
import SubscriptionTicketService from '../Payments/SubscriptionTicketService.js';
import { validationResult } from 'express-validator';
import {
  sendWithdrawalRequestEmail,
  sendWithdrawalApprovalEmail,
  sendWithdrawalRejectionEmail,
  sendWithdrawalProcessingEmail,
  sendWithdrawalCompletionEmail,
  sendOTPEmail
} from '../../Utils/emailSender.js';
import withdrawalSchemas from './withdrawalSchemas.js';
import otpGenerator from '../../Utils/otpGenerator.js';

const withdrawalController = {
  // Create withdrawal request with comprehensive checks (PDF Section D)
  createWithdrawal: async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
      // Validate request body
      const { error, value } = withdrawalSchemas.createWithdrawalSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      const { amount, paymentMethod, accountDetails } = value;
      const userId = req.user.id;

      await connection.beginTransaction();

      // CHECK 1: Verify user KYC status (from SQL schema)
      const [users] = await connection.query(
        `SELECT 
          u.id, 
          u.username, 
          u.email, 
          u.kyc_status, 
          u.age_verified,
          sl.daily_limit,
          sl.daily_spent,
          sl.weekly_limit,
          sl.weekly_spent,
          sl.monthly_limit,
          sl.monthly_spent,
          sl.single_purchase_limit
         FROM users u
         LEFT JOIN spending_limits sl ON u.id = sl.user_id
         WHERE u.id = UUID_TO_BIN(?)`,
        [userId]
      );

      if (users.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const user = users[0];

      // KYC verification required for withdrawals (PDF requirement)
      if (user.kyc_status !== 'verified') {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: 'KYC verification required for withdrawals',
          kycStatus: user.kyc_status,
          requiredAction: 'Complete KYC verification in account settings'
        });
      }

      // Age verification check (
      if (!user.age_verified) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: 'Age verification required (must be 18+) for withdrawals'
        });
      }

      // CHECK 2: Check user's cash wallet balance (lock row to avoid race conditions)
      const [wallets] = await connection.query(
        `SELECT id, balance FROM wallets WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH' FOR UPDATE`,
        [userId]
      );

      if (wallets.length === 0 || wallets[0].balance < amount) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance in cash wallet',
          currentBalance: wallets[0]?.balance || 0,
          requestedAmount: amount,
          required: 'Add funds to cash wallet or use winnings from competitions'
        });
      }

      // CHECK 3: Check minimum withdrawal amount (PDF requirement)
      if (amount < 10) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Minimum withdrawal amount is £10'
        });
      }

      // CHECK 4: Check spending limits (PDF Section D - Responsible Gaming)
      if (user.daily_limit > 0 && (user.daily_spent + amount) > user.daily_limit) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Daily spending limit exceeded',
          dailyLimit: user.daily_limit,
          alreadySpent: user.daily_spent,
          requested: amount,
          remaining: user.daily_limit - user.daily_spent
        });
      }

      if (user.weekly_limit > 0 && (user.weekly_spent + amount) > user.weekly_limit) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Weekly spending limit exceeded',
          weeklyLimit: user.weekly_limit,
          alreadySpent: user.weekly_spent,
          requested: amount,
          remaining: user.weekly_limit - user.weekly_spent
        });
      }

      if (user.monthly_limit > 0 && (user.monthly_spent + amount) > user.monthly_limit) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Monthly spending limit exceeded',
          monthlyLimit: user.monthly_limit,
          alreadySpent: user.monthly_spent,
          requested: amount,
          remaining: user.monthly_limit - user.monthly_spent
        });
      }

      // CHECK 5: Check single purchase limit
      if (user.single_purchase_limit > 0 && amount > user.single_purchase_limit) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Single withdrawal amount exceeds limit',
          singleLimit: user.single_purchase_limit,
          requested: amount
        });
      }

      // CHECK 6: Check daily withdrawal limit
      const today = new Date().toISOString().split('T')[0];
      const [dailyWithdrawals] = await connection.query(
        `SELECT COALESCE(SUM(amount), 0) as dailyTotal 
         FROM withdrawals 
         WHERE user_id = ? AND DATE(requested_at) = ? AND status IN ('APPROVED', 'COMPLETED', 'PENDING', 'PROCESSING')`,
        [userId, today]
      );

      const dailyWithdrawalLimit = 50000; // £50,000 daily limit (adjustable)
      if (dailyWithdrawals[0].dailyTotal + amount > dailyWithdrawalLimit) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Daily withdrawal limit exceeded',
          dailyLimit: dailyWithdrawalLimit,
          alreadyWithdrawn: dailyWithdrawals[0].dailyTotal,
          requested: amount,
          remaining: dailyWithdrawalLimit - dailyWithdrawals[0].dailyTotal
        });
      }

      // CHECK 7: Check monthly withdrawal limit
      const currentMonth = new Date().toISOString().slice(0, 7);
      const [monthlyWithdrawals] = await connection.query(
        `SELECT COALESCE(SUM(amount), 0) as monthlyTotal 
         FROM withdrawals 
         WHERE user_id = ? AND DATE_FORMAT(requested_at, '%Y-%m') = ? AND status IN ('APPROVED', 'COMPLETED', 'PENDING', 'PROCESSING')`,
        [userId, currentMonth]
      );

      const monthlyWithdrawalLimit = 150000; // £150,000 monthly limit (adjustable)
      if (monthlyWithdrawals[0].monthlyTotal + amount > monthlyWithdrawalLimit) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Monthly withdrawal limit exceeded',
          monthlyLimit: monthlyWithdrawalLimit,
          alreadyWithdrawn: monthlyWithdrawals[0].monthlyTotal,
          requested: amount,
          remaining: monthlyWithdrawalLimit - monthlyWithdrawals[0].monthlyTotal
        });
      }

      // CHECK 8: Check if user has any pending withdrawals
      const [pendingWithdrawals] = await connection.query(
        `SELECT COUNT(*) as pendingCount FROM withdrawals 
         WHERE user_id = ? AND status IN ('PENDING', 'PROCESSING')`,
        [userId]
      );

      const maxPendingWithdrawals = 3; // Configurable
      if (pendingWithdrawals[0].pendingCount >= maxPendingWithdrawals) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Maximum of ${maxPendingWithdrawals} pending withdrawals allowed at a time`,
          currentPending: pendingWithdrawals[0].pendingCount
        });
      }

      // Generate withdrawalId early so ledger reference uses the same id
      const withdrawalId = uuidv4();

      // Deduct amount from cash wallet (reserve funds)
      await connection.query(
        `UPDATE wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
        [amount, userId]
      );

      // Record wallet transaction as a HOLD (reserved) using withdrawalId as reference
      const transactionId = uuidv4();
      await connection.query(
        `INSERT INTO wallet_transactions (id, wallet_id, amount, type, reference, description) 
         SELECT UUID_TO_BIN(?), id, ?, 'HOLD', ?, 'Withdrawal request - pending admin review' 
         FROM wallets WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
        [transactionId, amount, withdrawalId, userId]
      );

      // Update spending limits (PDF Section D)
      await connection.query(
        `INSERT INTO spending_limits (id, user_id, daily_spent, weekly_spent, monthly_spent, updated_at)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
         daily_spent = daily_spent + VALUES(daily_spent),
         weekly_spent = weekly_spent + VALUES(weekly_spent),
         monthly_spent = monthly_spent + VALUES(monthly_spent),
         updated_at = CURRENT_TIMESTAMP`,
        [userId, amount, amount, amount]
      );

      // Create withdrawal request (schema-aligned)
      const paypalEmail = accountDetails?.paypalEmail || null;
      const bankName = accountDetails?.bankName || null;
      const accountNumber = accountDetails?.accountNumber ? String(accountDetails.accountNumber) : '';
      const bankAccountLastFour = accountNumber ? accountNumber.slice(-4) : null;

      await connection.query(
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
          requested_at,
          updated_at,
          is_payment_method
        ) VALUES (
          UUID_TO_BIN(?),
          UUID_TO_BIN(?),
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          'PENDING',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          FALSE
        )`,
        [
          withdrawalId,
          userId,
          amount,
          paymentMethod,
          JSON.stringify(accountDetails),
          paypalEmail,
          bankAccountLastFour,
          bankName
        ]
      );

      // Log admin activity
      await connection.query(
        `INSERT INTO admin_activities (id, admin_id, action, target_id, module) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, UUID_TO_BIN(?), 'withdrawals')`,
        [uuidv4(), userId, `Created withdrawal request for £${amount}`, withdrawalId]
      );

      await connection.commit();

      // Send confirmation email
      try {
        await sendWithdrawalRequestEmail(
          user.email, 
          user.username, 
          amount, 
          withdrawalId
        );
      } catch (emailError) {
        console.error('Failed to send withdrawal confirmation email:', emailError);
        // Don't fail the request if email fails
      }

      res.status(201).json({
        success: true,
        message: 'Withdrawal request created successfully.',
        data: {
          withdrawalId,
          amount,
          status: 'PENDING',
          paymentMethod,
          requestedAt: new Date().toISOString(),
          estimatedProcessing: '24-72 hours after verification',
          limits: {
            daily: {
              used: dailyWithdrawals[0].dailyTotal + amount,
              limit: dailyWithdrawalLimit,
              remaining: dailyWithdrawalLimit - (dailyWithdrawals[0].dailyTotal + amount)
            },
            monthly: {
              used: monthlyWithdrawals[0].monthlyTotal + amount,
              limit: monthlyWithdrawalLimit,
              remaining: monthlyWithdrawalLimit - (monthlyWithdrawals[0].monthlyTotal + amount)
            },
            spending: {
              daily: {
                used: (user.daily_spent || 0) + amount,
                limit: user.daily_limit || 0,
                remaining: (user.daily_limit || 0) - ((user.daily_spent || 0) + amount)
              },
              monthly: {
                used: (user.monthly_spent || 0) + amount,
                limit: user.monthly_limit || 0,
                remaining: (user.monthly_limit || 0) - ((user.monthly_spent || 0) + amount)
              }
            }
          }
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('Create withdrawal error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    } finally {
      connection.release();
    }
  },

  // Verify OTP and confirm withdrawal
  verifyWithdrawalOTP: async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
      // Validate input using Joi schema
      const { error: otpError, value: otpValue } = withdrawalSchemas.otpVerificationSchema.validate(req.body);
      if (otpError) {
        return res.status(400).json({ success: false, message: otpError.details[0].message });
      }

      const { withdrawalId, otp } = otpValue;
      const userId = req.user.id;

      // Get withdrawal details
      const [withdrawals] = await connection.query(
        `SELECT * FROM withdrawals WHERE id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?)`,
        [withdrawalId, userId]
      );

      if (withdrawals.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Withdrawal not found'
        });
      }

      const withdrawal = withdrawals[0];

      if (withdrawal.status !== 'PENDING_VERIFICATION') {
        return res.status(400).json({
          success: false,
          message: 'Withdrawal does not require OTP verification'
        });
      }

      // Verify OTP
      const otpIdentifier = `withdrawal_${userId}_${withdrawalId}`;
      const otpVerification = otpGenerator.verifyOTP(otpIdentifier, otp);

      if (!otpVerification.valid) {
        return res.status(400).json({
          success: false,
          message: otpVerification.message || 'Invalid OTP',
          attemptsLeft: otpVerification.attemptsLeft
        });
      }

      await connection.beginTransaction();

      // Update withdrawal status to PENDING (OTP verified)
      await connection.query(
        `UPDATE withdrawals SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP WHERE id = UUID_TO_BIN(?)`,
        [withdrawalId]
      );

      // Update wallet transaction description for the HOLD entry
      await connection.query(
        `UPDATE wallet_transactions SET description = 'Withdrawal request - OTP verified' 
         WHERE reference = ? AND type = 'HOLD'`,
        [withdrawalId]
      );

      // Log admin activity
      await connection.query(
        `INSERT INTO admin_activities (id, admin_id, action, target_id, module) 
         VALUES (?, ?, ?, ?, 'withdrawals')`,
        [uuidv4(), userId, `Withdrawal OTP verified for £${withdrawal.amount}`, withdrawalId]
      );

      await connection.commit();

      res.json({
        success: true,
        message: 'OTP verified successfully. Withdrawal is now being processed.',
        data: {
          withdrawalId,
          reference_code: withdrawalId.slice(0, 8).toUpperCase(),
          status: 'PROCESSING',
          verifiedAt: new Date().toISOString(),
          estimated_arrival: '2-3 business days'
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('Verify withdrawal OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    } finally {
      connection.release();
    }
  },

  // Get user's withdrawal history with enhanced filtering
  getUserWithdrawals: async (req, res) => {
    try {
      const { error, value } = withdrawalSchemas.withdrawalQuerySchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      const { status, page, limit, startDate, endDate } = value;
      const userId = req.user.id;
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          BIN_TO_UUID(w.id) AS id,
          w.amount,
          w.status,
          w.payment_method as paymentMethod,
          w.account_details as accountDetails,
          w.reason,
          w.requested_at as requestedAt,
          w.updated_at as updatedAt,
          w.verification_required as verificationRequired,
          COUNT(wt.id) as transactionCount
        FROM withdrawals w
        LEFT JOIN wallet_transactions wt ON w.id = wt.reference
        WHERE w.user_id = UUID_TO_BIN(?)
      `;
      const params = [userId];

      if (status) {
        query += ' AND w.status = ?';
        params.push(status);
      }

      if (startDate) {
        query += ' AND w.requested_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND w.requested_at <= ?';
        params.push(endDate);
      }

      query += ' GROUP BY w.id ORDER BY w.requested_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [withdrawals] = await pool.query(query, params);

      // Get user verification and limit info
      const [userInfo] = await pool.query(
        `SELECT 
          u.kyc_status, 
          u.age_verified,
          sl.daily_limit,
          sl.weekly_limit,
          sl.monthly_limit,
          sl.single_purchase_limit
         FROM users u
         LEFT JOIN spending_limits sl ON u.id = sl.user_id
         WHERE u.id = ?`,
        [userId]
      );

      // Get total count for pagination
      let countQuery = `SELECT COUNT(*) as total FROM withdrawals WHERE user_id = UUID_TO_BIN(?)`;
      const countParams = [userId];

      if (status) {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }

      if (startDate) {
        countQuery += ' AND requested_at >= ?';
        countParams.push(startDate);
      }

      if (endDate) {
        countQuery += ' AND requested_at <= ?';
        countParams.push(endDate);
      }

      const [countResult] = await pool.query(countQuery, countParams);
      const total = countResult[0].total;

      // Get withdrawal statistics
      const today = new Date().toISOString().split('T')[0];
      const currentMonth = new Date().toISOString().slice(0, 7);
      
      const [stats] = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN DATE(requested_at) = ? AND status IN ('APPROVED','COMPLETED','PENDING','PROCESSING') THEN amount END), 0) as dailyWithdrawn,
          COALESCE(SUM(CASE WHEN DATE_FORMAT(requested_at, '%Y-%m') = ? AND status IN ('APPROVED','COMPLETED','PENDING','PROCESSING') THEN amount END), 0) as monthlyWithdrawn,
          COUNT(CASE WHEN status = 'PENDING' OR status = 'PENDING_VERIFICATION' OR status = 'PROCESSING' THEN 1 END) as pendingCount,
          COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completedCount,
          COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount END), 0) as totalWithdrawn
        FROM withdrawals
        WHERE user_id = UUID_TO_BIN(?)
      `, [today, currentMonth, userId]);

      res.json({
        success: true,
        data: {
          withdrawals,
          userVerification: {
            kycStatus: userInfo[0]?.kyc_status || 'pending',
            ageVerified: userInfo[0]?.age_verified || false,
            kycRequiredForWithdrawal: true
          },
          limits: {
            daily: {
              limit: 50000, // Default daily withdrawal limit
              remaining: 50000 - stats[0].dailyWithdrawn
            },
            monthly: {
              limit: 150000, // Default monthly withdrawal limit
              remaining: 150000 - stats[0].monthlyWithdrawn
            },
            spending: {
              daily: userInfo[0]?.daily_limit || 0,
              weekly: userInfo[0]?.weekly_limit || 0,
              monthly: userInfo[0]?.monthly_limit || 0,
              singlePurchase: userInfo[0]?.single_purchase_limit || 0
            }
          },
          statistics: {
            totalWithdrawals: total,
            pendingWithdrawals: stats[0].pendingCount,
            completedWithdrawals: stats[0].completedCount,
            totalWithdrawn: stats[0].totalWithdrawn,
            dailyWithdrawn: stats[0].dailyWithdrawn,
            monthlyWithdrawn: stats[0].monthlyWithdrawn
          },
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get user withdrawals error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  },

  // Get a single withdrawal by id (user only - their own withdrawal)
  getWithdrawalById: async (req, res) => {
    try {
      const { error, value } = withdrawalSchemas.withdrawalIdSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ success: false, message: error.details[0].message });
      }

      const { id } = value;
      const userId = req.user.id;

      const [rows] = await pool.query(
        `SELECT
          BIN_TO_UUID(w.id) AS id,
          BIN_TO_UUID(w.user_id) AS user_id,
          BIN_TO_UUID(w.admin_id) AS admin_id,
          w.amount,
          w.payment_method,
          w.account_details,
          w.paypal_email,
          w.bank_account_last_four,
          w.bank_name,
          w.status,
          w.reason,
          w.admin_notes,
          w.requested_at,
          w.updated_at,
          w.is_payment_method
         FROM withdrawals w
         WHERE w.id = UUID_TO_BIN(?) AND w.user_id = UUID_TO_BIN(?)`,
        [id, userId]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Withdrawal not found' });
      }

      res.json({ success: true, data: rows[0] });
    } catch (error) {
      console.error('Get withdrawal by id error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  // Admin: Get all withdrawals with filtering
getAllWithdrawals: async (req, res) => {
  try {
    const { error, value } = withdrawalSchemas.withdrawalQuerySchema.validate(req.query);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const { status, page, limit, startDate, endDate, minAmount, maxAmount, paymentMethod, userId, sortBy, sortOrder } = value;
    const offset = (page - 1) * limit;

    // Base query with JOIN to users table
    let query = `
      SELECT
        -- Withdrawal details
        BIN_TO_UUID(w.id) AS id,
        w.amount,
        w.payment_method,
        w.account_details,
        w.paypal_email,
        w.bank_account_last_four,
        w.bank_name,
        w.status,
        w.reason,
        w.admin_notes,
        BIN_TO_UUID(w.admin_id) AS admin_id,
        w.requested_at,
        w.updated_at,
        w.is_payment_method,
        
        -- User details
        BIN_TO_UUID(u.id) AS user_id,
        u.email AS user_email,
        u.username AS user_username,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name,
        u.profile_photo AS user_profile_photo,
        u.country AS user_country,
        u.kyc_status AS user_kyc_status,
        u.role AS user_role,
        u.is_active AS user_is_active
      FROM withdrawals w
      LEFT JOIN users u ON w.user_id = u.id
      WHERE 1=1
    `;

    // Count query
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM withdrawals w
      LEFT JOIN users u ON w.user_id = u.id
      WHERE 1=1
    `;

    const params = [];
    const countParams = [];

    // Add filters to both queries
    const addFilter = (condition, param) => {
      if (condition) {
        query += ' AND ' + condition;
        countQuery += ' AND ' + condition;
        params.push(param);
        countParams.push(param);
      }
    };

    if (status) addFilter('w.status = ?', status);
    if (startDate) addFilter('w.requested_at >= ?', startDate);
    if (endDate) addFilter('w.requested_at <= ?', endDate);
    if (minAmount) addFilter('w.amount >= ?', minAmount);
    if (maxAmount) addFilter('w.amount <= ?', maxAmount);
    if (paymentMethod) addFilter('w.payment_method = ?', paymentMethod);
    if (userId) addFilter('w.user_id = UUID_TO_BIN(?)', userId);

    // Sorting and pagination
    const validSortColumns = ['requested_at', 'updated_at', 'amount', 'status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'requested_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY w.${sortColumn} ${order} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // Execute both queries
    const [rows] = await pool.query(query, params);
    const [countRes] = await pool.query(countQuery, countParams);

    res.json({ 
      success: true, 
      data: { 
        withdrawals: rows, 
        total: countRes[0].total, 
        page, 
        limit,
        totalPages: Math.ceil(countRes[0].total / limit)
      } 
    });
  } catch (error) {
    console.error('Get all withdrawals error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
},

  // Admin: Export withdrawals as CSV
  exportWithdrawalsCsv: async (req, res) => {
    try {
      const { error, value } = withdrawalSchemas.withdrawalExportSchema.validate(req.query);
      if (error) return res.status(400).json({ success: false, message: error.details[0].message });

      const {
        status,
        startDate,
        endDate,
        minAmount,
        maxAmount,
        paymentMethod,
        userId,
        sortBy,
        sortOrder,
        thisWeekCompleted,
        firstTime,
        largeAmount,
        largeAmountMin,
        limit
      } = value;

      let query = `
        SELECT
          BIN_TO_UUID(w.id) AS id,
          w.amount,
          w.payment_method,
          w.account_details,
          w.paypal_email,
          w.bank_account_last_four,
          w.bank_name,
          w.status,
          w.reason,
          w.admin_notes,
          BIN_TO_UUID(w.admin_id) AS admin_id,
          w.requested_at,
          w.updated_at,
          w.is_payment_method,
          BIN_TO_UUID(u.id) AS user_id,
          u.email AS user_email,
          u.username AS user_username,
          u.first_name AS user_first_name,
          u.last_name AS user_last_name,
          u.country AS user_country,
          u.kyc_status AS user_kyc_status
        FROM withdrawals w
        LEFT JOIN users u ON w.user_id = u.id
        WHERE 1=1
      `;

      const params = [];

      const addFilter = (condition, param) => {
        if (condition) {
          query += ' AND ' + condition;
          if (param !== undefined) {
            params.push(param);
          }
        }
      };

      if (status) addFilter('w.status = ?', status);
      if (startDate) addFilter('w.requested_at >= ?', startDate);
      if (endDate) addFilter('w.requested_at <= ?', endDate);
      if (minAmount) addFilter('w.amount >= ?', minAmount);
      if (maxAmount) addFilter('w.amount <= ?', maxAmount);
      if (paymentMethod) addFilter('w.payment_method = ?', paymentMethod);
      if (userId) addFilter('w.user_id = UUID_TO_BIN(?)', userId);

      if (thisWeekCompleted) {
        addFilter("w.status = 'COMPLETED' AND YEARWEEK(w.requested_at, 1) = YEARWEEK(CURDATE(), 1)");
      }

      if (firstTime) {
        addFilter('w.requested_at = (SELECT MIN(w2.requested_at) FROM withdrawals w2 WHERE w2.user_id = w.user_id)');
      }

      if (largeAmount) {
        addFilter('w.amount >= ?', largeAmountMin);
      }

      const validSortColumns = ['requested_at', 'updated_at', 'amount', 'status'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'requested_at';
      const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
      query += ` ORDER BY w.${sortColumn} ${order} LIMIT ?`;
      params.push(limit);

      const [rows] = await pool.query(query, params);

      const headers = [
        'id',
        'amount',
        'payment_method',
        'paypal_email',
        'bank_account_last_four',
        'bank_name',
        'status',
        'reason',
        'admin_notes',
        'admin_id',
        'requested_at',
        'updated_at',
        'is_payment_method',
        'user_id',
        'user_email',
        'user_username',
        'user_first_name',
        'user_last_name',
        'user_country',
        'user_kyc_status'
      ];

      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (/[\n\r,"]/g.test(str)) return `"${str.replace(/"/g, '""')}"`;
        return str;
      };

      const lines = [headers.join(',')];
      for (const r of rows) {
        lines.push(headers.map((h) => escapeCsv(r[h])).join(','));
      }

      const csv = lines.join('\n');
      const filename = `withdrawals_export_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error('Export withdrawals error:', error);
      res.status(500).json({ success: false, message: 'Failed to export withdrawals', error: error.message });
    }
  },

  exportAllWithdrawalsCsv: (req, res) => {
    return withdrawalController.exportWithdrawalsCsv(req, res);
  },

  exportPendingWithdrawalsCsv: (req, res) => {
    req.query.status = 'PENDING';
    return withdrawalController.exportWithdrawalsCsv(req, res);
  },

  exportApprovedWithdrawalsCsv: (req, res) => {
    req.query.status = 'APPROVED';
    return withdrawalController.exportWithdrawalsCsv(req, res);
  },

  exportRejectedWithdrawalsCsv: (req, res) => {
    req.query.status = 'REJECTED';
    return withdrawalController.exportWithdrawalsCsv(req, res);
  },

  exportCompletedWithdrawalsCsv: (req, res) => {
    req.query.status = 'COMPLETED';
    return withdrawalController.exportWithdrawalsCsv(req, res);
  },

  exportWeeklyCompletedWithdrawalsCsv: (req, res) => {
    req.query.thisWeekCompleted = 'true';
    return withdrawalController.exportWithdrawalsCsv(req, res);
  },

  exportLargeAmountWithdrawalsCsv: (req, res) => {
    req.query.largeAmount = 'true';
    return withdrawalController.exportWithdrawalsCsv(req, res);
  },

  exportFirstTimeWithdrawalsCsv: (req, res) => {
    req.query.firstTime = 'true';
    return withdrawalController.exportWithdrawalsCsv(req, res);
  },
  // Webhook handler for external payment processors
  handleProcessingWebhook: async (req, res) => {
    try {
      const event = req.body?.event;
      const payload = req.body?.data || req.body;

      if (!event) return res.status(400).json({ success: false, message: 'Missing event type' });

      // Example: { event: 'withdrawal.processed', data: { withdrawalId, status, transactionId } }
      if (event === 'withdrawal.processed' && payload.withdrawalId) {
        await pool.query(`UPDATE withdrawals SET status = ?, transaction_id = ?, processed_at = CURRENT_TIMESTAMP WHERE id = UUID_TO_BIN(?)`,
          [payload.status || 'COMPLETED', payload.transactionId || null, payload.withdrawalId]);
        return res.json({ success: true });
      }

      res.json({ success: true, message: 'Event ignored' });
    } catch (error) {
      console.error('Processing webhook error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  // Admin: Update withdrawal status with enhanced features
  updateWithdrawalStatus: async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
      const { error: paramsError, value: paramsValue } = withdrawalSchemas.withdrawalIdSchema.validate(req.params);
      if (paramsError) {
        return res.status(400).json({
          success: false,
          message: paramsError.details[0].message
        });
      }

      const { error: bodyError, value: bodyValue } = withdrawalSchemas.updateWithdrawalSchema.validate(req.body);
      if (bodyError) {
        return res.status(400).json({
          success: false,
          message: bodyError.details[0].message
        });
      }

      const { id } = paramsValue;
      const { status, reason, adminNotes } = bodyValue;
      const adminId = req.user.id;

      await connection.beginTransaction();

      // Get withdrawal details with user info
      const [withdrawals] = await connection.query(
        `SELECT 
          w.*,
          u.id as userId,
          u.username,
          u.email,
          u.kyc_status as kycStatus,
          u.first_name,
          u.last_name,
          wl.balance as walletBalance
         FROM withdrawals w
         JOIN users u ON w.user_id = u.id
         LEFT JOIN wallets wl ON u.id = wl.user_id AND wl.type = 'CASH'
         WHERE w.id = UUID_TO_BIN(?)`,
        [id]
      );

      if (withdrawals.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Withdrawal not found'
        });
      }

      const withdrawal = withdrawals[0];

      // Check if withdrawal can be updated
      const allowedTransitions = {
        'PENDING': ['APPROVED', 'REJECTED', 'PROCESSING'],
        'PENDING_VERIFICATION': ['APPROVED', 'REJECTED', 'PROCESSING', 'CANCELLED'],
        'PROCESSING': ['COMPLETED', 'REJECTED'],
        'APPROVED': ['COMPLETED', 'REJECTED', 'PROCESSING']
      };

      if (!allowedTransitions[withdrawal.status] || !allowedTransitions[withdrawal.status].includes(status)) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Cannot transition from ${withdrawal.status} to ${status}`,
          allowedTransitions: allowedTransitions[withdrawal.status]
        });
      }

      // Update withdrawal status
      await connection.query(
        `UPDATE withdrawals 
         SET status = ?, 
             reason = ?, 
             admin_id = UUID_TO_BIN(?), 
             admin_notes = ?, 
             updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [status, reason, adminId, adminNotes, id]
      );

      // Handle different status updates
      if (status === 'REJECTED') {
        // Refund amount to user's cash wallet
        await connection.query(
          `UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP 
           WHERE user_id = ? AND type = 'CASH'`,
          [withdrawal.amount, withdrawal.userId]
        );

        // Record refund transaction
        const transactionId = uuidv4();
        await connection.query(
          `INSERT INTO wallet_transactions (id, wallet_id, amount, type, reference, description) 
           SELECT ?, id, ?, 'CREDIT', ?, 'Withdrawal refund - rejected' 
           FROM wallets WHERE user_id = ? AND type = 'CASH'`,
          [transactionId, withdrawal.amount, id, withdrawal.userId]
        );

        // Mark any existing HOLD transaction as released/cancelled
        await connection.query(
          `UPDATE wallet_transactions SET type = 'RELEASED', description = 'Withdrawal hold released - rejected' 
           WHERE reference = ? AND type = 'HOLD'`,
          [id]
        );

        // Update spending limits (refund)
        await connection.query(
          `UPDATE spending_limits 
           SET daily_spent = GREATEST(0, daily_spent - ?),
               weekly_spent = GREATEST(0, weekly_spent - ?),
               monthly_spent = GREATEST(0, monthly_spent - ?),
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [withdrawal.amount, withdrawal.amount, withdrawal.amount, withdrawal.userId]
        );

      } else if (status === 'COMPLETED') {
        // Finalise the HOLD transaction to DEBIT if present, otherwise insert a DEBIT
        const [updateResult] = await connection.query(
          `UPDATE wallet_transactions SET type = 'DEBIT', description = 'Withdrawal completed' 
           WHERE reference = ? AND type = 'HOLD'`,
          [id]
        );

        // If no HOLD row exists to convert, insert a DEBIT transaction as a fallback
        if (!updateResult.affectedRows || updateResult.affectedRows === 0) {
          const transactionId = uuidv4();
          await connection.query(
            `INSERT INTO wallet_transactions (id, wallet_id, amount, type, reference, description) 
             SELECT ?, id, ?, 'DEBIT', ?, 'Withdrawal completed' 
             FROM wallets WHERE user_id = ? AND type = 'CASH'`,
            [transactionId, withdrawal.amount, id, withdrawal.userId]
          );
        }
      }

      // Log admin activity
      await connection.query(
        `INSERT INTO admin_activities (id, admin_id, action, target_id, module, details) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, UUID_TO_BIN(?), 'withdrawals', ?)`,
        [uuidv4(), adminId, `Updated withdrawal status to ${status}`, id, 
         JSON.stringify({
           amount: withdrawal.amount,
           previousStatus: withdrawal.status,
           newStatus: status,
           reason: reason,
           userId: withdrawal.userId
         })]
      );

      // Log KYC action if relevant
      if (status === 'REJECTED' && reason && reason.toLowerCase().includes('kyc')) {
        await connection.query(
          `INSERT INTO kyc_reviews (id, user_id, admin_id, old_status, new_status, review_notes) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), withdrawal.userId, adminId, withdrawal.kycStatus, 'rejected', 
           `Withdrawal rejected: ${reason}`]
        );
      }

      await connection.commit();

      // Send email notification to user
      try {
        if (status === 'APPROVED') {
          await sendWithdrawalApprovalEmail(
            withdrawal.email, 
            withdrawal.username, 
            withdrawal.amount
          );
        } else if (status === 'REJECTED') {
          await sendWithdrawalRejectionEmail(
            withdrawal.email, 
            withdrawal.username, 
            withdrawal.amount, 
            reason || 'Please contact support for details'
          );
        } else if (status === 'COMPLETED') {
          await sendWithdrawalCompletionEmail(
            withdrawal.email,
            withdrawal.username,
            withdrawal.amount
          );
        } else if (status === 'PROCESSING') {
          await sendWithdrawalProcessingEmail(
            withdrawal.email,
            withdrawal.username,
            withdrawal.amount
          );
        }
      } catch (emailError) {
        console.error('Failed to send status update email:', emailError);
        // Don't fail the request if email fails
      }

      // Get updated withdrawal info
      const [updatedWithdrawal] = await pool.query(
        `SELECT
           BIN_TO_UUID(w.id) AS id,
           BIN_TO_UUID(w.user_id) AS user_id,
           BIN_TO_UUID(w.admin_id) AS admin_id,
           w.amount,
           w.payment_method,
           w.account_details,
           w.paypal_email,
           w.bank_account_last_four,
           w.bank_name,
           w.status,
           w.reason,
           w.admin_notes,
           w.requested_at,
           w.updated_at,
           w.is_payment_method
         FROM withdrawals w
         WHERE w.id = UUID_TO_BIN(?)`,
        [id]
      );

      res.json({
        success: true,
        message: `Withdrawal ${status.toLowerCase()} successfully`,
        data: {
          withdrawal: updatedWithdrawal[0],
          user: {
            id: withdrawal.userId,
            username: withdrawal.username,
            email: withdrawal.email,
            kycStatus: withdrawal.kycStatus
          },
          transaction: {
            amount: withdrawal.amount,
            previousBalance: withdrawal.walletBalance,
            newBalance: status === 'REJECTED' 
              ? (withdrawal.walletBalance + withdrawal.amount)
              : (withdrawal.walletBalance - withdrawal.amount)
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('Update withdrawal status error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    } finally {
      connection.release();
    }
  },

  // Get withdrawal statistics with enhanced metrics (PDF requirements)
  getWithdrawalStats: async (req, res) => {
    try {
      // Time periods for analysis
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const currentMonth = new Date().toISOString().slice(0, 7);
      const lastMonth = new Date(Date.now() - 2592000000).toISOString().slice(0, 7);
      const currentYear = new Date().getFullYear().toString();

      // Comprehensive withdrawal statistics
      const [stats] = await pool.query(`
        SELECT
          -- Total counts
          COUNT(*) as totalWithdrawals,
          COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pendingWithdrawals,
          COUNT(CASE WHEN status = 'PENDING_VERIFICATION' THEN 1 END) as pendingVerificationWithdrawals,
          COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) as approvedWithdrawals,
          COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejectedWithdrawals,
          COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completedWithdrawals,
          COUNT(CASE WHEN status = 'PROCESSING' THEN 1 END) as processingWithdrawals,
          
          -- Amounts
          COALESCE(SUM(CASE WHEN status IN ('APPROVED', 'COMPLETED', 'PROCESSING') THEN amount END), 0) as totalProcessedAmount,
          COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount END), 0) as pendingAmount,
          COALESCE(SUM(CASE WHEN status = 'PENDING_VERIFICATION' THEN amount END), 0) as pendingVerificationAmount,
          COALESCE(SUM(CASE WHEN status = 'PROCESSING' THEN amount END), 0) as processingAmount,
          COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount END), 0) as totalPaidOut,
          COALESCE(AVG(CASE WHEN status IN ('APPROVED', 'COMPLETED') THEN amount END), 0) as averageWithdrawal,
          
          -- Today's stats
          COUNT(CASE WHEN DATE(requested_at) = ? THEN 1 END) as todayWithdrawals,
          COALESCE(SUM(CASE WHEN DATE(requested_at) = ? THEN amount END), 0) as todayAmount,
          
          -- Yesterday's stats
          COUNT(CASE WHEN DATE(requested_at) = ? THEN 1 END) as yesterdayWithdrawals,
          COALESCE(SUM(CASE WHEN DATE(requested_at) = ? THEN amount END), 0) as yesterdayAmount,
          
          -- Current month
          COUNT(CASE WHEN DATE_FORMAT(requested_at, '%Y-%m') = ? THEN 1 END) as monthlyWithdrawals,
          COALESCE(SUM(CASE WHEN DATE_FORMAT(requested_at, '%Y-%m') = ? THEN amount END), 0) as monthlyAmount,
          
          -- Last month
          COUNT(CASE WHEN DATE_FORMAT(requested_at, '%Y-%m') = ? THEN 1 END) as lastMonthWithdrawals,
          COALESCE(SUM(CASE WHEN DATE_FORMAT(requested_at, '%Y-%m') = ? THEN amount END), 0) as lastMonthAmount,
          
          -- Current year
          COUNT(CASE WHEN YEAR(requested_at) = ? THEN 1 END) as yearlyWithdrawals,
          COALESCE(SUM(CASE WHEN YEAR(requested_at) = ? THEN amount END), 0) as yearlyAmount,
          
          -- Method breakdown
          COUNT(CASE WHEN payment_method = 'REVOLT' THEN 1 END) as revoltCount,
          COUNT(CASE WHEN payment_method = 'STRIPE' THEN 1 END) as stripeCount,
          COUNT(CASE WHEN payment_method = 'BANK_TRANSFER' THEN 1 END) as bankTransferCount,
          COUNT(CASE WHEN payment_method = 'PAYPAL' THEN 1 END) as paypalCount,
          
          -- Success rate
          ROUND(100.0 * COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) / NULLIF(COUNT(CASE WHEN status IN ('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED') THEN 1 END), 0), 2) as successRate,
          
          -- Average processing time (in hours)
          AVG(TIMESTAMPDIFF(HOUR, requested_at, COALESCE(updated_at, NOW()))) as avgProcessingHours
        FROM withdrawals
      `, [today, today, yesterday, yesterday, currentMonth, currentMonth, lastMonth, lastMonth, currentYear, currentYear]);

      // KYC statistics (PDF requirement)
      const [kycStats] = await pool.query(`
        SELECT 
          COUNT(*) as totalUsers,
          COUNT(CASE WHEN kyc_status = 'verified' THEN 1 END) as kycVerifiedUsers,
          COUNT(CASE WHEN kyc_status = 'pending' THEN 1 END) as kycPendingUsers,
          COUNT(CASE WHEN kyc_status = 'rejected' THEN 1 END) as kycRejectedUsers,
          COUNT(CASE WHEN kyc_status = 'under_review' THEN 1 END) as kycUnderReviewUsers,
          COUNT(CASE WHEN age_verified = TRUE THEN 1 END) as ageVerifiedUsers,
          
          -- KYC completion rate
          ROUND(100.0 * COUNT(CASE WHEN kyc_status = 'verified' THEN 1 END) / NULLIF(COUNT(*), 0), 2) as kycCompletionRate,
          
          -- Users eligible for withdrawal
          COUNT(CASE WHEN kyc_status = 'verified' AND age_verified = TRUE THEN 1 END) as eligibleForWithdrawal
        FROM users
        WHERE role = 'user'
      `);

      // Spending limits statistics (PDF Section D)
      const [spendingStats] = await pool.query(`
        SELECT
          COUNT(*) as usersWithLimits,
          AVG(daily_limit) as avgDailyLimit,
          AVG(weekly_limit) as avgWeeklyLimit,
          AVG(monthly_limit) as avgMonthlyLimit,
          AVG(single_purchase_limit) as avgSinglePurchaseLimit,
          COUNT(CASE WHEN daily_limit > 0 THEN 1 END) as usersWithDailyLimit,
          COUNT(CASE WHEN weekly_limit > 0 THEN 1 END) as usersWithWeeklyLimit,
          COUNT(CASE WHEN monthly_limit > 0 THEN 1 END) as usersWithMonthlyLimit
        FROM spending_limits
      `);

      // Recent high-value withdrawals
      const [recentLargeWithdrawals] = await pool.query(`
        SELECT 
          w.id,
          w.amount,
          w.status,
          w.requested_at as requestedAt,
          u.username,
          u.kyc_status as kycStatus,
          u.email,
          RANK() OVER (ORDER BY w.amount DESC) as amountRank
        FROM withdrawals w
        JOIN users u ON w.user_id = u.id
        WHERE w.amount >= 1000 AND w.status IN ('COMPLETED', 'APPROVED')
        ORDER BY w.amount DESC
        LIMIT 10
      `);

      // Recent activity (last 10 withdrawals)
      const [recentActivity] = await pool.query(`
        SELECT 
          w.id,
          w.amount,
          w.status,
          w.requested_at as requestedAt,
          w.updated_at as updatedAt,
          u.username,
          u.kyc_status as kycStatus,
          CASE 
            WHEN w.status = 'COMPLETED' THEN 'success'
            WHEN w.status = 'REJECTED' THEN 'danger'
            WHEN w.status IN ('PENDING', 'PENDING_VERIFICATION') THEN 'warning'
            WHEN w.status IN ('APPROVED', 'PROCESSING') THEN 'info'
            ELSE 'secondary'
          END as statusColor
        FROM withdrawals w
        JOIN users u ON w.user_id = u.id
        ORDER BY w.updated_at DESC
        LIMIT 10
      `);

      // User distribution by withdrawal count
      const [userDistribution] = await pool.query(`
        SELECT
          withdrawal_count_range,
          COUNT(*) as user_count
        FROM (
          SELECT
            u.id,
            CASE
              WHEN COUNT(w.id) = 0 THEN '0 withdrawals'
              WHEN COUNT(w.id) = 1 THEN '1 withdrawal'
              WHEN COUNT(w.id) BETWEEN 2 AND 5 THEN '2-5 withdrawals'
              WHEN COUNT(w.id) BETWEEN 6 AND 10 THEN '6-10 withdrawals'
              WHEN COUNT(w.id) BETWEEN 11 AND 20 THEN '11-20 withdrawals'
              ELSE '20+ withdrawals'
            END as withdrawal_count_range
          FROM users u
          LEFT JOIN withdrawals w ON u.id = w.user_id
          WHERE u.role = 'user'
          GROUP BY u.id
        ) as user_withdrawals
        GROUP BY withdrawal_count_range
        ORDER BY FIELD(withdrawal_count_range, '0 withdrawals', '1 withdrawal', '2-5 withdrawals', '6-10 withdrawals', '11-20 withdrawals', '20+ withdrawals')
      `);

      // Calculate growth metrics
      const todayGrowth = stats[0].todayAmount - stats[0].yesterdayAmount;
      const monthlyGrowth = stats[0].monthlyAmount - stats[0].lastMonthAmount;

      res.json({
        success: true,
        data: {
          overview: {
            totalWithdrawals: stats[0].totalWithdrawals,
            totalAmountProcessed: stats[0].totalProcessedAmount,
            totalAmountPaidOut: stats[0].totalPaidOut,
            averageWithdrawal: parseFloat(stats[0].averageWithdrawal).toFixed(2),
            successRate: parseFloat(stats[0].successRate).toFixed(2),
            averageProcessingTime: parseFloat(stats[0].avgProcessingHours).toFixed(1)
          },
          currentStatus: {
            pending: {
              count: stats[0].pendingWithdrawals,
              amount: stats[0].pendingAmount
            },
            pendingVerification: {
              count: stats[0].pendingVerificationWithdrawals,
              amount: stats[0].pendingVerificationAmount
            },
            processing: {
              count: stats[0].processingWithdrawals,
              amount: stats[0].processingAmount
            },
            completed: {
              count: stats[0].completedWithdrawals,
              amount: stats[0].totalPaidOut
            },
            rejected: {
              count: stats[0].rejectedWithdrawals,
              amount: 0
            }
          },
          timePeriods: {
            today: {
              count: stats[0].todayWithdrawals,
              amount: stats[0].todayAmount,
              growth: todayGrowth,
              growthPercentage: stats[0].yesterdayAmount > 0 
                ? ((todayGrowth / stats[0].yesterdayAmount) * 100).toFixed(2)
                : '0.00'
            },
            thisMonth: {
              count: stats[0].monthlyWithdrawals,
              amount: stats[0].monthlyAmount,
              growth: monthlyGrowth,
              growthPercentage: stats[0].lastMonthAmount > 0
                ? ((monthlyGrowth / stats[0].lastMonthAmount) * 100).toFixed(2)
                : '0.00'
            },
            thisYear: {
              count: stats[0].yearlyWithdrawals,
              amount: stats[0].yearlyAmount
            }
          },
          paymentMethods: {
            revolt: stats[0].revoltCount,
            stripe: stats[0].stripeCount,
            bankTransfer: stats[0].bankTransferCount,
            paypal: stats[0].paypalCount
          },
          userVerification: {
            totalUsers: kycStats[0].totalUsers,
            kycVerified: kycStats[0].kycVerifiedUsers,
            kycPending: kycStats[0].kycPendingUsers,
            kycRejected: kycStats[0].kycRejectedUsers,
            ageVerified: kycStats[0].ageVerifiedUsers,
            kycCompletionRate: parseFloat(kycStats[0].kycCompletionRate).toFixed(2),
            eligibleForWithdrawal: kycStats[0].eligibleForWithdrawal
          },
          responsibleGaming: {
            usersWithLimits: spendingStats[0].usersWithLimits,
            averageDailyLimit: parseFloat(spendingStats[0].avgDailyLimit).toFixed(2),
            averageWeeklyLimit: parseFloat(spendingStats[0].avgWeeklyLimit).toFixed(2),
            averageMonthlyLimit: parseFloat(spendingStats[0].avgMonthlyLimit).toFixed(2),
            usersWithDailyLimit: spendingStats[0].usersWithDailyLimit,
            usersWithWeeklyLimit: spendingStats[0].usersWithWeeklyLimit,
            usersWithMonthlyLimit: spendingStats[0].usersWithMonthlyLimit
          },
          userDistribution: userDistribution,
          recentLargeWithdrawals: recentLargeWithdrawals,
          recentActivity: recentActivity,
          insights: {
            totalEligibleUsers: kycStats[0].eligibleForWithdrawal,
            withdrawalParticipationRate: ((stats[0].totalWithdrawals / kycStats[0].eligibleForWithdrawal) * 100).toFixed(2),
            averageWithdrawalsPerUser: (stats[0].totalWithdrawals / kycStats[0].eligibleForWithdrawal).toFixed(2),
            estimatedMonthlyVolume: (stats[0].monthlyAmount * 1.1).toFixed(2) // 10% growth projection
          }
        }
      });

    } catch (error) {
      console.error('Get withdrawal stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  },

  // Enhanced KYC verification with levels (PDF requirement)
  verifyKycStatus: async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
      const { error, value } = withdrawalSchemas.kycVerificationSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      const { userId, kycStatus, verificationLevel } = value;
      const adminId = req.user.id;

      await connection.beginTransaction();

      // Get current user status
      const [users] = await connection.query(
        `SELECT * FROM users WHERE id = ?`,
        [userId]
      );

      if (users.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const user = users[0];
      const oldStatus = user.kyc_status;

      // Update KYC status
      await connection.query(
        `UPDATE users 
         SET kyc_status = ?, 
             kyc_verified_at = ?, 
             verification_level = ?,
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [kycStatus, kycStatus === 'verified' ? new Date() : null, verificationLevel || 'basic', userId]
      );

      // Log KYC review
      await connection.query(
        `INSERT INTO kyc_reviews (id, user_id, admin_id, old_status, new_status, verification_level, review_notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, adminId, oldStatus, kycStatus, verificationLevel || 'basic', 
         `KYC status updated from ${oldStatus} to ${kycStatus} by admin`]
      );

      // If verified, check if user needs age verification (UK requirement)
      if (kycStatus === 'verified') {
        const userAge = user.date_of_birth ? 
          Math.floor((new Date() - new Date(user.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
        
        if (userAge && userAge >= 18 && !user.age_verified) {
          await connection.query(
            `UPDATE users SET age_verified = TRUE WHERE id = ?`,
            [userId]
          );
        }
      }

      // Log admin activity
      await connection.query(
        `INSERT INTO admin_activities (id, admin_id, action, target_id, module, details) 
         VALUES (?, ?, ?, ?, 'kyc', ?)`,
        [uuidv4(), adminId, `Updated KYC status to ${kycStatus}`, userId,
         JSON.stringify({
           oldStatus,
           newStatus: kycStatus,
           verificationLevel,
           userId,
           username: user.username
         })]
      );

      await connection.commit();

      // Send appropriate email notification
      try {
        if (kycStatus === 'verified') {
          await emailSender.sendKycApproval(user.email, user.username);
          
          // Also send subscription perks if user has subscription (PDF Section 5)
          const [subscription] = await pool.query(
            `SELECT st.tier_name FROM user_subscriptions us
             JOIN subscription_tiers st ON us.tier_id = st.id
             WHERE us.user_id = ? AND us.status = 'ACTIVE'`,
            [userId]
          );
          
          if (subscription.length > 0) {
            const perks = {
              'Tier 1: Community Supporter': [
                { icon: '🎫', title: '3 Free Jackpot Tickets', description: 'Monthly', value: '£30 value' },
                { icon: '💰', title: '£5 Monthly Site Credit', description: 'For any competition' },
                { icon: '🛡️', title: 'Community Supporter Badge', description: 'Exclusive profile badge' }
              ],
              'Tier 2: Community Champion': [
                { icon: '🎫', title: '6 Free Jackpot Tickets', description: 'Monthly', value: '£60 value' },
                { icon: '💰', title: '£10 Monthly Site Credit', description: 'For any competition' },
                { icon: '🥈', title: 'Community Champion Badge', description: 'Silver badge' },
                { icon: '🏆', title: 'Exclusive Monthly Draw', description: 'Champion Sub Competition' }
              ],
              'Tier 3: Community Hero': [
                { icon: '🎫', title: '12 Free Jackpot Tickets', description: 'Monthly', value: '£120 value' },
                { icon: '💰', title: '£20 Monthly Site Credit', description: 'For any competition' },
                { icon: '🥇', title: 'Community Hero Badge', description: 'Gold badge' },
                { icon: '🏆', title: 'Exclusive Monthly Draw', description: 'Hero Sub Competition' }
              ]
            };
            
            const tierPerks = perks[subscription[0].tier_name] || [];
            await emailSender.sendSubscriptionPerks(user.email, user.username, subscription[0].tier_name, tierPerks);
          }
          
        } else if (kycStatus === 'rejected') {
          await emailSender.sendKycRejection(user.email, user.username);
        }
      } catch (emailError) {
        console.error('Failed to send KYC status email:', emailError);
        // Don't fail the request if email fails
      }

      // Get updated user info
      const [updatedUser] = await pool.query(
        `SELECT id, username, email, kyc_status, verification_level, age_verified FROM users WHERE id = ?`,
        [userId]
      );

      res.json({
        success: true,
        message: `KYC status updated to ${kycStatus} successfully`,
        data: {
          user: updatedUser[0],
          changes: {
            oldStatus,
            newStatus: kycStatus,
            verificationLevel: verificationLevel || 'basic',
            timestamp: new Date().toISOString()
          },
          nextSteps: kycStatus === 'verified' ? [
            'User can now make withdrawals',
            'User eligible for premium competitions',
            'Age verification completed if applicable'
          ] : [
            'User cannot make withdrawals',
            'Please resubmit documents for review'
          ]
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('KYC verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    } finally {
      connection.release();
    }
  },

  // Get withdrawal limits and settings (PDF Section D)
  getWithdrawalSettings: async (req, res) => {
    try {
      const userId = req.user.id;

      // Get user's current limits
      const [userLimits] = await pool.query(
        `SELECT 
          sl.*,
          u.kyc_status,
          u.age_verified,
          w.balance as cash_balance
         FROM users u
         LEFT JOIN spending_limits sl ON u.id = sl.user_id
         LEFT JOIN wallets w ON u.id = w.user_id AND w.type = 'CASH'
         WHERE u.id = ?`,
        [userId]
      );

      // System-wide withdrawal settings
      const systemSettings = {
        minimumWithdrawal: 10, // £10 minimum
        maximumWithdrawal: 10000, // £10,000 maximum
        dailyWithdrawalLimit: 50000, // £50,000 daily
        monthlyWithdrawalLimit: 150000, // £150,000 monthly
        processingTime: '24-72 hours',
        supportedMethods: ['REVOLT', 'STRIPE', 'BANK_TRANSFER', 'PAYPAL'],
        kycRequired: true,
        ageVerificationRequired: true,
        otpVerificationRequired: false,
        feeStructure: {
          revolt: { percentage: 0, fixed: 0 },
          stripe: { percentage: 0, fixed: 0 },
          bankTransfer: { percentage: 0, fixed: 1.0 },
          paypal: { percentage: 0, fixed: 0 }
        }
      };

      // Calculate available withdrawal amount
      const cashBalance = userLimits[0]?.cash_balance || 0;
      const availableWithdrawal = Math.min(
        cashBalance,
        systemSettings.maximumWithdrawal,
        systemSettings.dailyWithdrawalLimit - (userLimits[0]?.daily_spent || 0),
        systemSettings.monthlyWithdrawalLimit - (userLimits[0]?.monthly_spent || 0)
      );

      res.json({
        success: true,
        data: {
          userLimits: userLimits[0] || {
            daily_limit: 0,
            weekly_limit: 0,
            monthly_limit: 0,
            single_purchase_limit: 0,
            daily_spent: 0,
            weekly_spent: 0,
            monthly_spent: 0
          },
          systemSettings,
          verificationStatus: {
            kyc: userLimits[0]?.kyc_status || 'pending',
            age: userLimits[0]?.age_verified || false,
            email: true, // Assuming email is verified if they're logged in
            phone: false // Add phone verification if implemented
          },
          currentBalance: {
            cash: cashBalance,
            credit: 0, // Add credit balance if needed
            availableForWithdrawal: Math.max(0, availableWithdrawal)
          },
          restrictions: {
            canWithdraw: (userLimits[0]?.kyc_status === 'verified' && userLimits[0]?.age_verified && cashBalance >= systemSettings.minimumWithdrawal),
            reason: !userLimits[0]?.kyc_status === 'verified' ? 'KYC verification required' :
                   !userLimits[0]?.age_verified ? 'Age verification required' :
                   cashBalance < systemSettings.minimumWithdrawal ? `Minimum withdrawal is £${systemSettings.minimumWithdrawal}` :
                   'Eligible for withdrawal'
          },
          tips: [
            'Withdrawals are processed within 24-72 hours',
            'Ensure your payment method details are correct',
            'KYC verification is required for all withdrawals',
            'Check your spending limits before requesting withdrawal'
          ]
        }
      });

    } catch (error) {
      console.error('Get withdrawal settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  },

  // Update user spending limits (PDF Section D)
  updateSpendingLimits: async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
      const { dailyLimit, weeklyLimit, monthlyLimit, singlePurchaseLimit } = req.body;
      const userId = req.user.id;

      // Validate limits
      const maxLimits = {
        daily: 100000,
        weekly: 500000,
        monthly: 2000000,
        single: 50000
      };

      const validatedLimits = {
        daily_limit: Math.min(dailyLimit || 0, maxLimits.daily),
        weekly_limit: Math.min(weeklyLimit || 0, maxLimits.weekly),
        monthly_limit: Math.min(monthlyLimit || 0, maxLimits.monthly),
        single_purchase_limit: Math.min(singlePurchaseLimit || 0, maxLimits.single)
      };

      await connection.beginTransaction();

      // Update or insert spending limits
      await connection.query(
        `INSERT INTO spending_limits (
          user_id, 
          daily_limit, 
          weekly_limit, 
          monthly_limit, 
          single_purchase_limit,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          daily_limit = VALUES(daily_limit),
          weekly_limit = VALUES(weekly_limit),
          monthly_limit = VALUES(monthly_limit),
          single_purchase_limit = VALUES(single_purchase_limit),
          updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          validatedLimits.daily_limit,
          validatedLimits.weekly_limit,
          validatedLimits.monthly_limit,
          validatedLimits.single_purchase_limit
        ]
      );

      // Log the limit change
      await connection.query(
        `INSERT INTO admin_activities (id, admin_id, action, target_id, module, details) 
         VALUES (?, ?, ?, ?, 'spending_limits', ?)`,
        [uuidv4(), userId, 'Updated spending limits', userId,
         JSON.stringify(validatedLimits)]
      );

      await connection.commit();

      res.json({
        success: true,
        message: 'Spending limits updated successfully',
        data: {
          limits: validatedLimits,
          effective: {
            daily: 'Immediately for decreases, 24 hours for increases',
            weekly: 'Immediately',
            monthly: 'Immediately'
          },
          notes: [
            'Decreases take effect immediately',
            'Increases may take up to 24 hours',
            'You can adjust limits at any time',
            'Contact support if you need help'
          ]
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('Update spending limits error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    } finally {
      connection.release();
    }
  },

  // Payment webhooks
  handlePayPalWebhook: async (req, res) => {
    try {
      const event = req.body;
      await paymentService.handlePayPalWebhook(event);
      res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      console.error('PayPal webhook error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  handleStripeWebhook: async (req, res) => {
    try {
      const event = req.body;
      await paymentService.handleStripeWebhook(event);
      res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  handleRevolutWebhook: async (req, res) => {
    try {
      const event = req.body;
      await paymentService.handleRevolutWebhook(event);
      res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      console.error('Revolut webhook error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  // Gateways and payment methods
  getEnabledGateways: async (req, res) => {
    try {
      const { country = 'GB' } = req.query;
      const gateways = await paymentService.getEnabledGateways(country);
      res.status(200).json({ success: true, data: gateways });
    } catch (error) {
      console.error('Get enabled gateways error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getUserPaymentMethods: async (req, res) => {
    try {
      const userId = req.user.id;
      const methods = await paymentService.getUserPaymentMethods(userId);
      res.status(200).json({ success: true, data: methods });
    } catch (error) {
      console.error('Get user payment methods error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  addPaymentMethod: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const userId = req.user.id;
      const methodData = req.body;
      const method = await paymentService.addPaymentMethod(userId, methodData);
      res.status(201).json({ success: true, message: 'Payment method added successfully', data: method });
    } catch (error) {
      console.error('Add payment method error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  updatePaymentMethod: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const userId = req.user.id;
      const methodId = req.params.methodId;
      const updateData = req.body;
      const method = await paymentService.updatePaymentMethod(userId, methodId, updateData);
      res.status(200).json({ success: true, message: 'Payment method updated successfully', data: method });
    } catch (error) {
      console.error('Update payment method error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  removePaymentMethod: async (req, res) => {
    try {
      const userId = req.user.id;
      const methodId = req.params.methodId;
      const result = await paymentService.removePaymentMethod(userId, methodId);
      res.status(200).json({ success: true, message: 'Payment method removed successfully', data: result });
    } catch (error) {
      console.error('Remove payment method error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  setDefaultPaymentMethod: async (req, res) => {
    try {
      const userId = req.user.id;
      const methodId = req.params.methodId;
      const result = await paymentService.setDefaultPaymentMethod(userId, methodId);
      res.status(200).json({ success: true, message: 'Default payment method set successfully', data: result });
    } catch (error) {
      console.error('Set default payment method error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  // Deposits
  getUserDeposits: async (req, res) => {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0 } = req.query;
      const result = await paymentService.getUserDeposits(userId, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get user deposits error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  createDeposit: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const userId = req.user.id;
      const depositData = req.body;
      const result = await paymentService.createDeposit(userId, depositData);
      res.status(201).json({ success: true, message: 'Deposit initiated successfully', data: result });
    } catch (error) {
      console.error('Create deposit error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  getDepositDetails: async (req, res) => {
    try {
      const userId = req.user.id;
      const depositId = req.params.depositId;
      const deposit = await paymentService.getDepositDetails(userId, depositId);
      res.status(200).json({ success: true, data: deposit });
    } catch (error) {
      console.error('Get deposit details error:', error);
      res.status(404).json({ success: false, error: error.message });
    }
  },

  cancelDeposit: async (req, res) => {
    try {
      const userId = req.user.id;
      const depositId = req.params.depositId;
      const result = await paymentService.cancelDeposit(userId, depositId);
      res.status(200).json({ success: true, message: 'Deposit cancelled successfully', data: result });
    } catch (error) {
      console.error('Cancel deposit error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  retryDeposit: async (req, res) => {
    try {
      const userId = req.user.id;
      const depositId = req.params.depositId;
      const result = await paymentService.retryDeposit(userId, depositId);
      res.status(200).json({ success: true, message: 'Deposit retry initiated', data: result });
    } catch (error) {
      console.error('Retry deposit error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  // Withdrawals (payment service-related)
  getWithdrawalDetails: async (req, res) => {
    try {
      const userId = req.user.id;
      const withdrawalId = req.params.withdrawalId;
      const withdrawal = await paymentService.getWithdrawalDetails(userId, withdrawalId);
      res.status(200).json({ success: true, data: withdrawal });
    } catch (error) {
      console.error('Get withdrawal details error:', error);
      res.status(404).json({ success: false, error: error.message });
    }
  },

  cancelWithdrawal: async (req, res) => {
    try {
      const userId = req.user.id;
      const withdrawalId = req.params.withdrawalId;
      const result = await paymentService.cancelWithdrawal(userId, withdrawalId);
      res.status(200).json({ success: true, message: 'Withdrawal cancelled successfully', data: result });
    } catch (error) {
      console.error('Cancel withdrawal error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  // Transactions
  getUserTransactions: async (req, res) => {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0, ...filters } = req.query;
      const result = await paymentService.getUserTransactions(userId, filters, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get user transactions error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getTransactionDetails: async (req, res) => {
    try {
      const userId = req.user.id;
      const transactionId = req.params.transactionId;
      const transaction = await paymentService.getTransactionDetails(userId, transactionId);
      res.status(200).json({ success: true, data: transaction });
    } catch (error) {
      console.error('Get transaction details error:', error);
      res.status(404).json({ success: false, error: error.message });
    }
  },

  // Payment requests
  getUserPaymentRequests: async (req, res) => {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0 } = req.query;
      const result = await paymentService.getUserPaymentRequests(userId, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get user payment requests error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getPaymentRequestDetails: async (req, res) => {
    try {
      const userId = req.user.id;
      const requestId = req.params.requestId;
      const request = await paymentService.getPaymentRequestDetails(userId, requestId);
      res.status(200).json({ success: true, data: request });
    } catch (error) {
      console.error('Get payment request details error:', error);
      res.status(404).json({ success: false, error: error.message });
    }
  },

  getAllPaymentRequests: async (req, res) => {
    try {
      const { limit = 50, offset = 0, ...filters } = req.query;
      const result = await paymentService.getAllPaymentRequests(filters, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get all payment requests error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  approvePaymentRequest: async (req, res) => {
    try {
      const adminId = req.user.id;
      const requestId = req.params.requestId;
      const { notes = '' } = req.body;
      const result = await paymentService.approvePaymentRequest(adminId, requestId, notes);
      res.status(200).json({ success: true, message: 'Payment request approved successfully', data: result });
    } catch (error) {
      console.error('Approve payment request error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  rejectPaymentRequest: async (req, res) => {
    try {
      const adminId = req.user.id;
      const requestId = req.params.requestId;
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, error: 'Reason is required for rejection' });
      }
      const result = await paymentService.rejectPaymentRequest(adminId, requestId, reason);
      res.status(200).json({ success: true, message: 'Payment request rejected successfully', data: result });
    } catch (error) {
      console.error('Reject payment request error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  completePaymentRequest: async (req, res) => {
    try {
      const adminId = req.user.id;
      const requestId = req.params.requestId;
      const { gateway_reference } = req.body;
      const result = await paymentService.completePaymentRequest(adminId, requestId, gateway_reference);
      res.status(200).json({ success: true, message: 'Payment request completed successfully', data: result });
    } catch (error) {
      console.error('Complete payment request error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  // Admin transactions
  getAllTransactions: async (req, res) => {
    try {
      const { limit = 50, offset = 0, ...filters } = req.query;
      const result = await paymentService.getAllTransactions(filters, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get all transactions error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getTransactionAnalytics: async (req, res) => {
    try {
      const { period = 'this_week', startDate, endDate } = req.query;
      const result = await paymentService.getTransactionAnalytics(period, startDate, endDate);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get transaction analytics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  refundTransaction: async (req, res) => {
    try {
      const adminId = req.user.id;
      const transactionId = req.params.transactionId;
      const { amount, reason } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, error: 'Reason is required for refund' });
      }
      const result = await paymentService.refundTransaction(adminId, transactionId, amount, reason);
      res.status(200).json({ success: true, message: 'Transaction refunded successfully', data: result });
    } catch (error) {
      console.error('Refund transaction error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  // Admin withdrawals (payment service-related)
  processWithdrawal: async (req, res) => {
    try {
      const adminId = req.user.id;
      const withdrawalId = req.params.withdrawalId;
      const { transaction_reference } = req.body;
      const result = await paymentService.processWithdrawal(adminId, withdrawalId, transaction_reference);
      res.status(200).json({ success: true, message: 'Withdrawal processed successfully', data: result });
    } catch (error) {
      console.error('Process withdrawal error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  rejectWithdrawal: async (req, res) => {
    try {
      const adminId = req.user.id;
      const withdrawalId = req.params.withdrawalId;
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, error: 'Reason is required for rejection' });
      }
      const result = await paymentService.rejectWithdrawal(adminId, withdrawalId, reason);
      res.status(200).json({ success: true, message: 'Withdrawal rejected successfully', data: result });
    } catch (error) {
      console.error('Reject withdrawal error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  // Reports and gateway configuration
  getDailyReport: async (req, res) => {
    try {
      const { date } = req.query;
      const report = await paymentService.getDailyReport(date);
      res.status(200).json({ success: true, data: report });
    } catch (error) {
      console.error('Get daily report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getMonthlyReport: async (req, res) => {
    try {
      const { year, month } = req.query;
      const report = await paymentService.getMonthlyReport(year ? parseInt(year) : null, month ? parseInt(month) : null);
      res.status(200).json({ success: true, data: report });
    } catch (error) {
      console.error('Get monthly report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getGatewayReport: async (req, res) => {
    try {
      const { start_date, end_date } = req.query;
      const report = await paymentService.getGatewayReport(start_date, end_date);
      res.status(200).json({ success: true, data: report });
    } catch (error) {
      console.error('Get gateway report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getGatewayConfigurations: async (req, res) => {
    try {
      const configs = await paymentService.getGatewayConfigurations();
      res.status(200).json({ success: true, data: configs });
    } catch (error) {
      console.error('Get gateway configurations error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  updateGatewayConfiguration: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const configData = req.body;
      const updatedConfig = await paymentService.updateGatewayConfiguration(configData);
      res.status(200).json({ success: true, message: 'Gateway configuration updated successfully', data: updatedConfig });
    } catch (error) {
      console.error('Update gateway configuration error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  testGatewayConnection: async (req, res) => {
    try {
      const gateway = req.params.gateway;
      const { environment = 'LIVE' } = req.query;
      const result = await paymentService.testGatewayConnection(gateway, environment);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Test gateway connection error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  // Payment settings
  getPaymentSettings: async (req, res) => {
    try {
      const settings = await paymentService.getPaymentSettings();
      res.status(200).json({ success: true, data: settings });
    } catch (error) {
      console.error('Get payment settings error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  updatePaymentSettings: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const settings = req.body;
      const result = await paymentService.updatePaymentSettings(settings);
      res.status(200).json({ success: true, message: 'Payment settings updated successfully', data: result });
    } catch (error) {
      console.error('Update payment settings error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  refundPayment: async (req, res) => {
    try {
      const adminId = req.user.id;
      const requestId = req.params.requestId;
      const { amount, reason } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, error: 'Reason is required for refund' });
      }
      const result = await paymentService.refundPayment(adminId, requestId, amount, reason);
      res.status(200).json({ success: true, message: 'Payment refunded successfully', data: result });
    } catch (error) {
      console.error('Refund payment error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  // Subscription and tickets
  processSubscriptionPayment: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const userId = req.user.id;
      const { tier_id, payment_method_id } = req.body;

      const result = await SubscriptionTicketService.processSubscriptionPayment(
        userId, tier_id, payment_method_id
      );

      res.status(200).json({
        success: true,
        message: 'Subscription payment processed successfully',
        data: result
      });
    } catch (error) {
      console.error('Process subscription payment error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  cancelSubscription: async (req, res) => {
    try {
      const userId = req.user.id;
      const subscriptionId = req.params.subscriptionId;
      const { reason = '' } = req.body;

      const result = await SubscriptionTicketService.cancelSubscription(
        userId, subscriptionId, reason
      );

      res.status(200).json({
        success: true,
        message: 'Subscription cancelled successfully',
        data: result
      });
    } catch (error) {
      console.error('Cancel subscription error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  purchaseTickets: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const userId = req.user.id;
      const purchaseData = req.body;

      const result = await SubscriptionTicketService.purchaseTickets(userId, purchaseData);

      res.status(200).json({
        success: true,
        message: 'Tickets purchased successfully',
        data: result
      });
    } catch (error) {
      console.error('Purchase tickets error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  purchaseUniversalTickets: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const userId = req.user.id;
      const purchaseData = req.body;

      const result = await SubscriptionTicketService.purchaseUniversalTickets(userId, purchaseData);

      res.status(200).json({
        success: true,
        message: 'Universal tickets purchased successfully',
        data: result
      });
    } catch (error) {
      console.error('Purchase universal tickets error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  getUserSubscriptions: async (req, res) => {
    try {
      const userId = req.user.id;
      const subscriptions = await SubscriptionTicketService.getUserSubscriptions(userId);

      res.status(200).json({
        success: true,
        data: subscriptions
      });
    } catch (error) {
      console.error('Get user subscriptions error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getUserTickets: async (req, res) => {
    try {
      const userId = req.user.id;
      const filters = req.query;

      const tickets = await SubscriptionTicketService.getUserTickets(userId, filters);

      res.status(200).json({
        success: true,
        data: tickets
      });
    } catch (error) {
      console.error('Get user tickets error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getSubscriptionTiers: async (req, res) => {
    try {
      const tiers = await SubscriptionTicketService.getSubscriptionTiers();

      res.status(200).json({
        success: true,
        data: tiers
      });
    } catch (error) {
      console.error('Get subscription tiers error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

export default withdrawalController;