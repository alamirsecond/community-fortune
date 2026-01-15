// src/api/wallet/walletController.js
import { v4 as uuidv4 } from "uuid";
import pool from "../../../database.js";

// Validation functions
const validateWalletType = (type) =>
  ["CASH", "CREDIT", "POINTS"].includes(type);
const validateTransactionType = (type) => ["CREDIT", "DEBIT"].includes(type);

// Helper functions
const handleDatabaseError = (
  error,
  res,
  customMessage = "Internal server error"
) => {
  console.error(`Database error: ${customMessage}`, error);
  res.status(500).json({
    success: false,
    message: customMessage,
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
};

const validateUUID = (id) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const walletController = {
    // Redeem points for site credit
    redeemPoints: async (req, res) => {
      const connection = await pool.getConnection();
      try {
        const userId = req.user.id;
        const { points } = req.body;
        // Example: 100 points = £1 site credit
        const POINTS_PER_CREDIT = 100;
        if (!validateUUID(userId)) {
          return res.status(400).json({ success: false, message: "Invalid user ID format" });
        }
        if (!Number.isInteger(points) || points <= 0) {
          return res.status(400).json({ success: false, message: "Points must be a positive integer" });
        }
        await connection.beginTransaction();
        // Get user's points wallet
        const [pointsWallet] = await connection.query(
          `SELECT id, balance FROM wallets WHERE user_id = UUID_TO_BIN(?) AND type = 'POINTS' FOR UPDATE`,
          [userId]
        );
        if (pointsWallet.length === 0 || pointsWallet[0].balance < points) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: "Insufficient points" });
        }
        // Calculate credit amount
        const creditAmount = Math.floor(points / POINTS_PER_CREDIT);
        if (creditAmount <= 0) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: `You need at least ${POINTS_PER_CREDIT} points to redeem for £1 credit` });
        }
        const pointsToDeduct = creditAmount * POINTS_PER_CREDIT;
        // Deduct points
        await connection.query(
          `UPDATE wallets SET balance = balance - ? WHERE id = ?`,
          [pointsToDeduct, pointsWallet[0].id]
        );
        // Credit site credit wallet
        const [creditWallet] = await connection.query(
          `SELECT id FROM wallets WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT' FOR UPDATE`,
          [userId]
        );
        if (creditWallet.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: "Credit wallet not found" });
        }
        await connection.query(
          `UPDATE wallets SET balance = balance + ? WHERE id = ?`,
          [creditAmount, creditWallet[0].id]
        );
        // Log transactions
        const txId1 = uuidv4();
        const txId2 = uuidv4();
        const refId = uuidv4();
        await connection.query(
          `INSERT INTO wallet_transactions (id, wallet_id, amount, type, reference, description) VALUES (UUID_TO_BIN(?), ?, ?, 'DEBIT', UUID_TO_BIN(?), ?)`,
          [txId1, pointsWallet[0].id, pointsToDeduct, refId, `Redeemed for £${creditAmount} site credit`]
        );
        await connection.query(
          `INSERT INTO wallet_transactions (id, wallet_id, amount, type, reference, description) VALUES (UUID_TO_BIN(?), ?, ?, 'CREDIT', UUID_TO_BIN(?), ?)`,
          [txId2, creditWallet[0].id, creditAmount, refId, `Points redemption`]
        );
        await connection.commit();
        // Optionally: send email notification (pseudo, replace with actual email logic)
        // await sendEmail(userId, 'points_redeemed', { amount: creditAmount, points: pointsToDeduct });
        res.json({ success: true, message: `Redeemed ${pointsToDeduct} points for £${creditAmount} site credit`, data: { creditAmount, pointsDeducted: pointsToDeduct } });
      } catch (error) {
        await connection.rollback();
        handleDatabaseError(error, res, "Failed to redeem points");
      } finally {
        connection.release();
      }
    },
  // Get user wallet balances
  getWalletBalances: async (req, res) => {
    try {
      const userId = req.user.id;

      if (!validateUUID(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
      }

      const [wallets] = await pool.query(
        `SELECT 
          type,
          balance,
          is_frozen as isFrozen,
          created_at as createdAt,
          updated_at as updatedAt
         FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type IN ('CASH', 'CREDIT', 'POINTS')`,
        [userId]
      );

      // Get wallet statistics
      const [stats] = await pool.query(
        `SELECT 
          COUNT(*) as totalTransactions,
          COALESCE(SUM(CASE WHEN wt.type = 'CREDIT' THEN amount END), 0) as totalCredits,
          COALESCE(SUM(CASE WHEN wt.type = 'DEBIT' THEN amount END), 0) as totalDebits
         FROM wallet_transactions wt
         JOIN wallets w ON wt.wallet_id = w.id
         WHERE w.user_id = UUID_TO_BIN(?)`,
        [userId]
      );

      // Get spending limits if any
      const [limits] = await pool.query(
        `SELECT 
          daily_limit as dailyLimit,
          weekly_limit as weeklyLimit,
          monthly_limit as monthlyLimit,
          daily_spent as dailySpent,
          weekly_spent as weeklySpent,
          monthly_spent as monthlySpent
         FROM spending_limits 
         WHERE user_id = UUID_TO_BIN(?)`,
        [userId]
      );

      res.json({
        success: true,
        data: {
          cashWallet: cashWallet || { type: 'CASH', balance: 0, isFrozen: false },
          creditWallet: creditWallet || { type: 'CREDIT', balance: 0, isFrozen: false },
          statistics: stats[0],
          spendingLimits: limits[0] || null
        }
      });
    } catch (error) {
      handleDatabaseError(error, res, "Failed to retrieve wallet balances");
    }
  },

  // Get wallet transaction history
  getWalletTransactions: async (req, res) => {
    try {
      const userId = req.user.id;
      const {
        walletType,
        page = 1,
        limit = 20,
        type,
        startDate,
        endDate,
      } = req.query;
      const offset = (page - 1) * limit;

      if (!validateUUID(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
      }

      // Validate pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({
          success: false,
          message: "Invalid pagination parameters",
        });
      }

      let query = `
        SELECT 
          BIN_TO_UUID(wt.id) as id,
          wt.amount,
          wt.type as transactionType,
          wt.reference,
          wt.description,
          wt.created_at as createdAt,
          w.type as walletType
        FROM wallet_transactions wt
        JOIN wallets w ON wt.wallet_id = w.id
        WHERE w.user_id = UUID_TO_BIN(?)
      `;
      const params = [userId];

      if (walletType && validateWalletType(walletType)) {
        query += " AND w.type = ?";
        params.push(walletType);
      }

      if (type && ['CREDIT', 'DEBIT', 'HOLD', 'REFUND'].includes(type)) {
        query += ' AND wt.type = ?';
        params.push(type);
      }

      if (startDate) {
        query += " AND DATE(wt.created_at) >= ?";
        params.push(startDate);
      }

      if (endDate) {
        query += " AND DATE(wt.created_at) <= ?";
        params.push(endDate);
      }

      query += " ORDER BY wt.created_at DESC LIMIT ? OFFSET ?";
      params.push(limitNum, offset);

      const [transactions] = await pool.query(query, params);

      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) as total
        FROM wallet_transactions wt
        JOIN wallets w ON wt.wallet_id = w.id
        WHERE w.user_id = UUID_TO_BIN(?)
      `;
      const countParams = [userId];

      if (walletType && validateWalletType(walletType)) {
        countQuery += " AND w.type = ?";
        countParams.push(walletType);
      }

      if (type && ['CREDIT', 'DEBIT', 'HOLD', 'REFUND'].includes(type)) {
        countQuery += ' AND wt.type = ?';
        countParams.push(type);
      }

      if (startDate) {
        countQuery += " AND DATE(wt.created_at) >= ?";
        countParams.push(startDate);
      }

      if (endDate) {
        countQuery += " AND DATE(wt.created_at) <= ?";
        countParams.push(endDate);
      }

      const [countResult] = await pool.query(countQuery, countParams);
      const total = countResult[0]?.total || 0;

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          },
        },
      });
    } catch (error) {
      handleDatabaseError(error, res, "Failed to retrieve wallet transactions");
    }
  },

  // Freeze/unfreeze credit wallet spending
  toggleCreditWalletFreeze: async (req, res) => {
    const connection = await pool.getConnection();

    try {
      const { isFrozen, reason = "User initiated" } = req.body;
      const userId = req.user.id;

      if (!validateUUID(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
      }

      if (typeof isFrozen !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isFrozen must be a boolean value",
        });
      }

      await connection.beginTransaction();

      // Check if credit wallet exists
      const [walletCheck] = await connection.query(
        `SELECT id, is_frozen as isFrozen FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
        [userId]
      );

      if (walletCheck.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Credit wallet not found",
        });
      }

      // Don't update if already in desired state
      if (walletCheck[0].isFrozen === isFrozen) {
        await connection.rollback();
        return res.json({
          success: true,
          message: `Wallet is already ${isFrozen ? "frozen" : "unfrozen"}`,
          data: {
            isFrozen,
            updatedAt: new Date().toISOString(),
          },
        });
      }

      // Update credit wallet freeze status
      const [result] = await connection.query(
        `UPDATE wallets 
         SET is_frozen = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
        [isFrozen, userId]
      );

      if (updateResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Credit wallet not found",
        });
      }

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Credit wallet not found'
        });
      }

      // Get the wallet ID for logging
      const [wallet] = await connection.query(
        `SELECT id FROM wallets WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
        [userId]
      );

      // Log the action to wallet_actions
      if (wallet[0]) {
        await connection.query(
          `INSERT INTO wallet_actions (id, wallet_id, action_type, details) 
           VALUES (UUID_TO_BIN(?), ?, ?, ?)`,
          [uuidv4(), wallet[0].id, isFrozen ? 'FREEZE' : 'UNFREEZE', JSON.stringify({ reason: 'User initiated', timestamp: new Date().toISOString() })]
        );
      }

      await connection.commit();

      // Get updated wallet info
      const [updatedWallet] = await pool.query(
        `SELECT 
          type,
          balance,
          is_frozen as isFrozen,
          updated_at as updatedAt
         FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
        [userId]
      );

      res.json({
        success: true,
        message: `Credit wallet ${
          isFrozen ? "frozen" : "unfrozen"
        } successfully`,
        data: updatedWallet[0],
      });
    } catch (error) {
      await connection.rollback();
      handleDatabaseError(error, res, "Failed to toggle wallet freeze status");
    } finally {
      connection.release();
    }
  },

  // Transfer between wallets (with business rule restrictions)
  transferBetweenWallets: async (req, res) => {
    const connection = await pool.getConnection();

    try {
      const { fromWallet, toWallet, amount, reason = "" } = req.body;
      const userId = req.user.id;

      if (!validateUUID(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
      }

      // Validate wallets
      if (!validateWalletType(fromWallet) || !validateWalletType(toWallet)) {
        return res.status(400).json({
          success: false,
          message: "Invalid wallet type. Must be CASH, CREDIT, or POINTS",
        });
      }

      if (fromWallet === toWallet) {
        return res.status(400).json({
          success: false,
          message: "Cannot transfer to the same wallet",
        });
      }

      // BUSINESS RULE: Credit wallet is non-withdrawable, so cannot transfer FROM credit TO cash
      if (fromWallet === 'CREDIT' && toWallet === 'CASH') {
        return res.status(400).json({
          success: false,
          message: 'Cannot transfer from Credit wallet to Cash wallet. Site credit is non-withdrawable.'
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be positive'
        });
      }

      await connection.beginTransaction();

      // Check source wallet
      const [sourceWallet] = await connection.query(
        `SELECT id, balance, is_frozen FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
        [userId, fromWallet]
      );

      if (sourceWallet.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Source wallet not found",
        });
      }

      if (sourceWallet[0].is_frozen) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Source wallet is frozen",
        });
      }

      if (sourceWallet[0].balance < amount) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Insufficient balance in source wallet",
        });
      }

      // Check destination wallet
      const [destWallet] = await connection.query(
        `SELECT id, is_frozen FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
        [userId, toWallet]
      );

      if (destWallet.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Destination wallet not found",
        });
      }

      if (destWallet[0].is_frozen) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Destination wallet is frozen",
        });
      }

      // Perform transfer
      const transferReference = uuidv4();

      // Deduct from source wallet
      await connection.query(
        `UPDATE wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
        [amount, userId, fromWallet]
      );

      // Add to destination wallet
      await connection.query(
        `UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
        [amount, userId, toWallet]
      );

      // Record transactions
      const debitTransactionId = uuidv4();
      const creditTransactionId = uuidv4();
      const referenceId = uuidv4();

      await connection.query(
        `INSERT INTO wallet_transactions (id, wallet_id, amount, type, reference, description) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'DEBIT', UUID_TO_BIN(?), ?)`,
        [debitTransactionId, sourceWallet[0].id, amount, referenceId, `Transfer to ${toWallet} wallet${reason ? `: ${reason}` : ''}`]
      );

      await connection.query(
        `INSERT INTO wallet_transactions (id, wallet_id, amount, type, reference, description) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'CREDIT', UUID_TO_BIN(?), ?)`,
        [creditTransactionId, destWallet[0].id, amount, referenceId, `Transfer from ${fromWallet} wallet${reason ? `: ${reason}` : ''}`]
      );

      // Log the transfer action
      await connection.query(
        `INSERT INTO wallet_actions (id, wallet_id, action_type, details) 
         VALUES (UUID_TO_BIN(?), ?, ?, ?)`,
        [uuidv4(), sourceWallet[0].id, 'TRANSFER_OUT', JSON.stringify({
          toWallet,
          amount,
          reason,
          destinationWalletId: destWallet[0].id,
          timestamp: new Date().toISOString()
        })]
      );

      await connection.query(
        `INSERT INTO wallet_actions (id, wallet_id, action_type, details) 
         VALUES (UUID_TO_BIN(?), ?, ?, ?)`,
        [uuidv4(), destWallet[0].id, 'TRANSFER_IN', JSON.stringify({
          fromWallet,
          amount,
          reason,
          sourceWalletId: sourceWallet[0].id,
          timestamp: new Date().toISOString()
        })]
      );

      await connection.commit();

      // Get updated balances
      const [updatedWallets] = await pool.query(
        `SELECT type, balance FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type IN (?, ?)`,
        [userId, fromWallet, toWallet]
      );

      res.json({
        success: true,
        message: "Transfer completed successfully",
        data: {
          transfer: {
            id: transferReference,
            fromWallet,
            toWallet,
            amount,
            reason,
            timestamp: new Date().toISOString()
          },
          updatedBalances: updatedWallets,
        },
      });
    } catch (error) {
      await connection.rollback();
      handleDatabaseError(error, res, "Failed to transfer between wallets");
    } finally {
      connection.release();
    }
  },

  // Buy site credit
  buySiteCredit: async (req, res) => {
    const connection = await pool.getConnection();

    try {
      const { amount, paymentMethod, paymentReference = "" } = req.body;
      const userId = req.user.id;

      if (!validateUUID(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
      }

      if (typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Amount must be a positive number",
        });
      }

      // Validate payment method
      const validPaymentMethods = ['CARD', 'BANK_TRANSFER', 'PAYPAL'];
      if (!validPaymentMethods.includes(paymentMethod)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment method'
        });
      }



      await connection.beginTransaction();

      // Check if credit wallet exists
      const [creditWallet] = await connection.query(
        `SELECT id, is_frozen FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT' FOR UPDATE`,
        [userId]
      );

      if (creditWallet.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Credit wallet not found",
        });
      }

      if (creditWallet[0].is_frozen) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Credit wallet is frozen",
        });
      }

      // Add credit to wallet
      await connection.query(
        `UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
        [amount, userId]
      );

      // Record transaction
      const transactionId = uuidv4();
      await connection.query(
        `INSERT INTO wallet_transactions 
         (id, wallet_id, amount, type, reference, description, created_at) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'CREDIT', UUID_TO_BIN(?), ?, CURRENT_TIMESTAMP)`,
        [
          transactionId,
          creditWallet[0].id,
          amount,
          uuidv4(),
          `Purchased site credit via ${paymentMethod}`,
        ]
      );

      // Record purchase in credit_purchases table
      await connection.query(
        `INSERT INTO credit_purchases (id, user_id, amount, payment_method, status, gateway_reference) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, 'COMPLETED', UUID_TO_BIN(?))`,
        [uuidv4(), userId, amount, paymentMethod, uuidv4()]
      );

      // Log the action
      await connection.query(
        `INSERT INTO wallet_actions (id, wallet_id, action_type, details) 
         VALUES (UUID_TO_BIN(?), ?, ?, ?)`,
        [uuidv4(), creditWallet[0].id, 'CREDIT_PURCHASE', JSON.stringify({
          amount,
          paymentMethod,
          timestamp: new Date().toISOString()
        })]
      );

      await connection.commit();

      // Get updated balance
      const [updatedWallet] = await connection.query(
        `SELECT balance FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
        [userId]
      );

      res.json({
        success: true,
        message: "Site credit purchased successfully",
        data: {
          purchaseId,
          transactionId,
          amount,
          paymentMethod,
          newBalance: updatedWallet[0].balance,
          transactionId,
          paymentMethod,
          purchaseDate: new Date().toISOString()
        }
      });
    } catch (error) {
      await connection.rollback();
      handleDatabaseError(error, res, "Failed to purchase site credit");
    } finally {
      connection.release();
    }
  },

  // Get spending history
  getSpendingHistory: async (req, res) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, startDate, endDate, category } = req.query;
      const offset = (page - 1) * limit;

      if (!validateUUID(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
      }

      // Validate pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({
          success: false,
          message: "Invalid pagination parameters",
        });
      }

      let query = `
        SELECT 
          wt.id,
          wt.created_at as date,
          wt.amount,
          wt.description,
          wt.type as transactionType,
          w.type as walletType,
          COALESCE(wt.category, 'Other') as category
        FROM wallet_transactions wt
        JOIN wallets w ON wt.wallet_id = w.id
        WHERE w.user_id = UUID_TO_BIN(?) AND wt.type = 'DEBIT'
      `;
      const params = [userId];

      if (startDate) {
        query += ' AND DATE(wt.created_at) >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND DATE(wt.created_at) <= ?';
        params.push(endDate);
      }

      if (category) {
        query += " AND wt.category = ?";
        params.push(category);
      }

      query += " ORDER BY wt.created_at DESC LIMIT ? OFFSET ?";
      params.push(limitNum, offset);

      const [spending] = await pool.query(query, params);

      // Get total spent
      let totalQuery = `
        SELECT COALESCE(SUM(wt.amount), 0) as totalSpent
        FROM wallet_transactions wt
        JOIN wallets w ON wt.wallet_id = w.id
        WHERE w.user_id = UUID_TO_BIN(?) AND wt.type = 'DEBIT'
      `;
      const totalParams = [userId];

      if (startDate) {
        totalQuery += ' AND DATE(wt.created_at) >= ?';
        totalParams.push(startDate);
      }

      if (endDate) {
        totalQuery += ' AND DATE(wt.created_at) <= ?';
        totalParams.push(endDate);
      }

      const [totalResult] = await pool.query(totalQuery, totalParams);

      // Get spending by category
      // Get spending by category
      const [categorySpending] = await pool.query(
        `SELECT 
          CASE 
            WHEN wt.description LIKE '%ticket%' OR wt.description LIKE '%competition%' THEN 'Competition Tickets'
            WHEN wt.description LIKE '%withdrawal%' OR wt.description LIKE '%cashout%' THEN 'Withdrawals'
            WHEN wt.description LIKE '%transfer%' THEN 'Wallet Transfers'
            WHEN wt.description LIKE '%subscription%' THEN 'Subscriptions'
            ELSE 'Other Purchases'
          END as category,
          SUM(wt.amount) as amount,
          COUNT(*) as count
         FROM wallet_transactions wt
         JOIN wallets w ON wt.wallet_id = w.id
         WHERE w.user_id = UUID_TO_BIN(?) AND wt.type = 'DEBIT'
         GROUP BY category
         ORDER BY amount DESC`,
        [userId]
      );

      // Get monthly spending trend
      const [monthlyTrend] = await pool.query(
        `SELECT 
          DATE_FORMAT(wt.created_at, '%Y-%m') as month,
          SUM(wt.amount) as total
         FROM wallet_transactions wt
         JOIN wallets w ON wt.wallet_id = w.id
         WHERE w.user_id = UUID_TO_BIN(?) AND wt.type = 'DEBIT'
         GROUP BY DATE_FORMAT(wt.created_at, '%Y-%m')
         ORDER BY month DESC
         LIMIT 6`,
        [userId]
      );

      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) as total
        FROM wallet_transactions wt
        JOIN wallets w ON wt.wallet_id = w.id
        WHERE w.user_id = UUID_TO_BIN(?) AND wt.type = 'DEBIT'
      `;
      const countParams = [userId];

      if (startDate) {
        countQuery += " AND DATE(wt.created_at) >= ?";
        countParams.push(startDate);
      }

      if (endDate) {
        countQuery += " AND DATE(wt.created_at) <= ?";
        countParams.push(endDate);
      }

      const [countResult] = await pool.query(countQuery, countParams);
      const total = countResult[0]?.total || 0;

      res.json({
        success: true,
        data: {
          spending,
          summary: {
            totalSpent: totalResult[0].totalSpent,
            categoryBreakdown: categorySpending,
            monthlyTrend: monthlyTrend
          },
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          },
        },
      });
    } catch (error) {
      handleDatabaseError(error, res, "Failed to retrieve spending history");
    }
  },

  // Admin: Get all wallets
  getAllWallets: async (req, res) => {
    try {
      // Check admin permissions
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin privileges required.",
        });
      }

      const {
        page = 1,
        limit = 20,
        walletType,
        userId,
        isFrozen,
        minBalance,
        maxBalance,
      } = req.query;
      const offset = (page - 1) * limit;

      // Validate pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({
          success: false,
          message: "Invalid pagination parameters",
        });
      }

      let query = `
        SELECT 
          BIN_TO_UUID(w.id) as walletId,
          w.type,
          w.balance,
          w.is_frozen as isFrozen,
          w.created_at as createdAt,
          w.updated_at as updatedAt,
          BIN_TO_UUID(u.id) as userId,
          u.username,
          u.email,
          u.role
        FROM wallets w
        JOIN users u ON w.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (walletType && validateWalletType(walletType)) {
        query += " AND w.type = ?";
        params.push(walletType);
      }

      if (userId) {
        if (!validateUUID(userId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user ID format",
          });
        }
        query += " AND w.user_id = UUID_TO_BIN(?)";
        params.push(userId);
      }

      if (isFrozen === "true" || isFrozen === "false") {
        query += " AND w.is_frozen = ?";
        params.push(isFrozen === "true");
      }

      if (minBalance !== undefined) {
        query += " AND w.balance >= ?";
        params.push(parseFloat(minBalance));
      }

      if (maxBalance !== undefined) {
        query += " AND w.balance <= ?";
        params.push(parseFloat(maxBalance));
      }

      query += " ORDER BY w.balance DESC LIMIT ? OFFSET ?";
      params.push(limitNum, offset);

      const [wallets] = await pool.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) as total
        FROM wallets w
        JOIN users u ON w.user_id = u.id
        WHERE 1=1
      `;
      const countParams = [];

      if (walletType && validateWalletType(walletType)) {
        countQuery += " AND w.type = ?";
        countParams.push(walletType);
      }

      if (userId) {
        countQuery += " AND w.user_id = UUID_TO_BIN(?)";
        countParams.push(userId);
      }

      if (isFrozen === "true" || isFrozen === "false") {
        countQuery += " AND w.is_frozen = ?";
        countParams.push(isFrozen === "true");
      }

      const [countResult] = await pool.query(countQuery, countParams);
      const total = countResult[0]?.total || 0;

      // Get statistics
      const [stats] = await pool.query(`
        SELECT 
          COUNT(*) as totalWallets,
          COUNT(CASE WHEN type = 'CASH' THEN 1 END) as cashWallets,
          COUNT(CASE WHEN type = 'CREDIT' THEN 1 END) as creditWallets,
          COUNT(CASE WHEN type = 'POINTS' THEN 1 END) as pointsWallets,
          COALESCE(SUM(balance), 0) as totalBalance,
          COALESCE(SUM(CASE WHEN type = 'CASH' THEN balance END), 0) as totalCash,
          COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN balance END), 0) as totalCredit,
          COUNT(CASE WHEN is_frozen = TRUE THEN 1 END) as frozenWallets,
          AVG(balance) as averageBalance,
          MAX(balance) as maxBalance,
          MIN(balance) as minBalance
        FROM wallets
      `);

      // Get recent wallet activity
      const [recentActivity] = await pool.query(`
        SELECT 
          COUNT(*) as recentTransactions,
          COUNT(DISTINCT user_id) as activeUsers
        FROM wallet_transactions wt
        JOIN wallets w ON wt.wallet_id = w.id
        WHERE wt.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      `);

      res.json({
        success: true,
        data: {
          wallets,
          statistics: {
            ...stats[0],
            ...recentActivity[0]
          },
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          },
        },
      });
    } catch (error) {
      handleDatabaseError(error, res, "Failed to retrieve all wallets");
    }
  },

  // Admin: Get wallet by ID
  getWalletById: async (req, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin privileges required.",
        });
      }

      const { walletId } = req.params;

      if (!validateUUID(walletId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid wallet ID format",
        });
      }

      const [wallet] = await pool.query(
        `SELECT 
          BIN_TO_UUID(w.id) as walletId,
          w.type,
          w.balance,
          w.is_frozen as isFrozen,
          w.created_at as createdAt,
          w.updated_at as updatedAt,
          BIN_TO_UUID(u.id) as userId,
          u.username,
          u.email,
          u.first_name as firstName,
          u.last_name as lastName
        FROM wallets w
        JOIN users u ON w.user_id = u.id
        WHERE w.id = UUID_TO_BIN(?)`,
        [walletId]
      );

      if (wallet.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Wallet not found",
        });
      }

      // Get recent transactions for this wallet
      const [transactions] = await pool.query(
        `SELECT 
          BIN_TO_UUID(id) as transactionId,
          amount,
          type as transactionType,
          reference,
          description,
          created_at as createdAt
        FROM wallet_transactions
        WHERE wallet_id = UUID_TO_BIN(?)
        ORDER BY created_at DESC
        LIMIT 10`,
        [walletId]
      );

      res.json({
        success: true,
        data: {
          ...wallet[0],
          recentTransactions: transactions,
        },
      });
    } catch (error) {
      handleDatabaseError(error, res, "Failed to retrieve wallet details");
    }
  },

  // Admin: Update wallet (freeze/unfreeze, adjust balance)
  updateWallet: async (req, res) => {
    const connection = await pool.getConnection();

    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin privileges required.",
        });
      }

      const { walletId } = req.params;
      const { isFrozen, balance, reason = "Admin adjustment" } = req.body;

      if (!validateUUID(walletId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid wallet ID format",
        });
      }

      await connection.beginTransaction();

      // Check if wallet exists
      const [wallet] = await connection.query(
        `SELECT 
          id,
          user_id,
          type,
          balance as currentBalance,
          is_frozen
        FROM wallets 
        WHERE id = UUID_TO_BIN(?) FOR UPDATE`,
        [walletId]
      );

      if (wallet.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Wallet not found",
        });
      }

      const updates = [];
      const params = [];

      if (typeof isFrozen === "boolean") {
        updates.push("is_frozen = ?");
        params.push(isFrozen);
      }

      if (typeof balance === "number") {
        updates.push("balance = ?");
        params.push(balance);
      }

      if (updates.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "No valid updates provided",
        });
      }

      params.push(walletId);

      await connection.query(
        `UPDATE wallets 
         SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP 
         WHERE id = UUID_TO_BIN(?)`,
        params
      );

      // Log admin action
      await connection.query(
        `INSERT INTO admin_actions 
         (id, admin_id, action_type, target_type, target_id, details, created_at) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, UUID_TO_BIN(?), ?, CURRENT_TIMESTAMP)`,
        [
          uuidv4(),
          req.user.id,
          "WALLET_UPDATE",
          "WALLET",
          walletId,
          JSON.stringify({
            previousState: {
              balance: wallet[0].currentBalance,
              isFrozen: wallet[0].is_frozen,
            },
            updates: {
              isFrozen: typeof isFrozen === "boolean" ? isFrozen : undefined,
              balance: typeof balance === "number" ? balance : undefined,
            },
            reason,
          }),
        ]
      );

      await connection.commit();

      // Get updated wallet
      const [updatedWallet] = await pool.query(
        `SELECT 
          BIN_TO_UUID(id) as walletId,
          type,
          balance,
          is_frozen as isFrozen,
          updated_at as updatedAt
        FROM wallets 
        WHERE id = UUID_TO_BIN(?)`,
        [walletId]
      );

      res.json({
        success: true,
        message: "Wallet updated successfully",
        data: updatedWallet[0],
      });
    } catch (error) {
      await connection.rollback();
      handleDatabaseError(error, res, "Failed to update wallet");
    } finally {
      connection.release();
    }
  },

  /////////////////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////////////////////

  static: {
    /**
     * Add site credit to user's wallet
     */
    async addSiteCredit(
      connection,
      user_id,
      amount,
      reference,
      walletType = "CREDIT"
    ) {
      if (!validateUUID(user_id)) {
        throw new Error("Invalid user ID format");
      }

      if (!validateWalletType(walletType)) {
        throw new Error(`Invalid wallet type: ${walletType}`);
      }

      if (typeof amount !== "number" || amount <= 0) {
        throw new Error("Amount must be a positive number");
      }

      // Get or create wallet
      const [wallet] = await connection.query(
        `SELECT id, is_frozen FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = ? FOR UPDATE`,
        [user_id, walletType]
      );

      let walletId;
      let isNewWallet = false;

      if (wallet.length === 0) {
        // Create wallet if it doesn't exist
        const walletUUID = uuidv4();
        await connection.query(
          `INSERT INTO wallets (id, user_id, type, balance, is_frozen, created_at, updated_at) 
           VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [walletUUID, user_id, walletType, amount]
        );

        walletId = walletUUID;
        isNewWallet = true;
      } else {
        walletId = wallet[0].id;

        // Check if wallet is frozen
        if (wallet[0].is_frozen) {
          throw new Error(`Wallet ${walletType} is frozen`);
        }

        // Update balance
        await connection.query(
          `UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP 
           WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
          [amount, user_id, walletType]
        );
      }

      // Record transaction
      const transactionId = uuidv4();
      await connection.query(
        `INSERT INTO wallet_transactions 
         (id, wallet_id, amount, type, reference, description, created_at) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'CREDIT', UUID_TO_BIN(?), ?, CURRENT_TIMESTAMP)`,
        [transactionId, walletId, amount, uuidv4(), `Awarded from ${reference}`]
      );

      // Get updated balance
      const [updatedWallet] = await connection.query(
        `SELECT balance FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
        [user_id, walletType]
      );

      return {
        success: true,
        walletType,
        amount,
        newBalance: updatedWallet[0].balance,
        transactionId,
        isNewWallet,
      };
    },

    /**
     * Deduct from user's wallet
     */
    async deductFromWallet(
      connection,
      user_id,
      amount,
      reference,
      walletType = "CREDIT"
    ) {
      if (!validateUUID(user_id)) {
        throw new Error("Invalid user ID format");
      }

      if (!validateWalletType(walletType)) {
        throw new Error(`Invalid wallet type: ${walletType}`);
      }

      if (typeof amount !== "number" || amount <= 0) {
        throw new Error("Amount must be a positive number");
      }

      // Check wallet balance and freeze status
      const [wallet] = await connection.query(
        `SELECT id, balance, is_frozen FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = ? FOR UPDATE`,
        [user_id, walletType]
      );

      if (wallet.length === 0) {
        throw new Error(`Wallet ${walletType} not found`);
      }

      if (wallet[0].is_frozen) {
        throw new Error(`Wallet ${walletType} is frozen`);
      }

      if (wallet[0].balance < amount) {
        throw new Error(`Insufficient balance in ${walletType} wallet`);
      }

      // Deduct from wallet
      await connection.query(
        `UPDATE wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
        [amount, user_id, walletType]
      );

      // Record transaction
      const transactionId = uuidv4();
      await connection.query(
        `INSERT INTO wallet_transactions 
         (id, wallet_id, amount, type, reference, description, created_at) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'DEBIT', UUID_TO_BIN(?), ?, CURRENT_TIMESTAMP)`,
        [
          transactionId,
          wallet[0].id,
          amount,
          uuidv4(),
          `Deducted for ${reference}`,
        ]
      );

      // Get updated balance
      const [updatedWallet] = await connection.query(
        `SELECT balance FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
        [user_id, walletType]
      );

      return {
        success: true,
        walletType,
        amount,
        newBalance: updatedWallet[0].balance,
        transactionId,
      };
    },

    /**
     * Get user's wallet balance
     */
    async getWalletBalance(connection, user_id, walletType = null) {
      if (!validateUUID(user_id)) {
        throw new Error("Invalid user ID format");
      }

      let query = `
        SELECT 
          type,
          balance,
          is_frozen as isFrozen,
          created_at as createdAt,
          updated_at as updatedAt
        FROM wallets 
        WHERE user_id = UUID_TO_BIN(?)
      `;

      const params = [user_id];

      if (walletType) {
        if (!validateWalletType(walletType)) {
          throw new Error(`Invalid wallet type: ${walletType}`);
        }
        query += " AND type = ?";
        params.push(walletType);
      }

      const [wallets] = await connection.query(query, params);

      if (walletType && wallets.length === 0) {
        return {
          success: false,
          error: `Wallet ${walletType} not found`,
        };
      }

      return {
        success: true,
        wallets: walletType ? wallets[0] : wallets,
      };
    },

    /**
     * Transfer between wallets
     */
    async transferBetweenWallets(
      connection,
      user_id,
      fromWallet,
      toWallet,
      amount,
      reason = ""
    ) {
      if (!validateUUID(user_id)) {
        throw new Error("Invalid user ID format");
      }

      if (!validateWalletType(fromWallet) || !validateWalletType(toWallet)) {
        throw new Error("Invalid wallet type");
      }

      if (fromWallet === toWallet) {
        throw new Error("Cannot transfer to the same wallet");
      }

      if (typeof amount !== "number" || amount <= 0) {
        throw new Error("Amount must be a positive number");
      }

      // Check source wallet
      const [sourceWallet] = await connection.query(
        `SELECT id, balance, is_frozen FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = ? FOR UPDATE`,
        [user_id, fromWallet]
      );

      if (sourceWallet.length === 0) {
        throw new Error("Source wallet not found");
      }

      if (sourceWallet[0].is_frozen) {
        throw new Error("Source wallet is frozen");
      }

      if (sourceWallet[0].balance < amount) {
        throw new Error("Insufficient balance in source wallet");
      }

      // Check destination wallet
      const [destWallet] = await connection.query(
        `SELECT id, is_frozen FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type = ? FOR UPDATE`,
        [user_id, toWallet]
      );

      if (destWallet.length === 0) {
        throw new Error("Destination wallet not found");
      }

      if (destWallet[0].is_frozen) {
        throw new Error("Destination wallet is frozen");
      }

      // Perform transfer
      const transferReference = uuidv4();

      // Deduct from source wallet
      await connection.query(
        `UPDATE wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
        [amount, user_id, fromWallet]
      );

      // Add to destination wallet
      await connection.query(
        `UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
        [amount, user_id, toWallet]
      );

      // Record transactions
      const debitTransactionId = uuidv4();
      const creditTransactionId = uuidv4();

      await connection.query(
        `INSERT INTO wallet_transactions 
         (id, wallet_id, amount, type, reference, description, created_at) 
         SELECT UUID_TO_BIN(?), id, ?, 'DEBIT', UUID_TO_BIN(?), ?, CURRENT_TIMESTAMP
         FROM wallets WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
        [
          debitTransactionId,
          amount,
          transferReference,
          `Transfer to ${toWallet} wallet${reason ? `: ${reason}` : ""}`,
          user_id,
          fromWallet,
        ]
      );

      await connection.query(
        `INSERT INTO wallet_transactions 
         (id, wallet_id, amount, type, reference, description, created_at) 
         SELECT UUID_TO_BIN(?), id, ?, 'CREDIT', UUID_TO_BIN(?), ?, CURRENT_TIMESTAMP
         FROM wallets WHERE user_id = UUID_TO_BIN(?) AND type = ?`,
        [
          creditTransactionId,
          amount,
          transferReference,
          `Transfer from ${fromWallet} wallet${reason ? `: ${reason}` : ""}`,
          user_id,
          toWallet,
        ]
      );

      // Get updated balances
      const [updatedWallets] = await connection.query(
        `SELECT type, balance FROM wallets 
         WHERE user_id = UUID_TO_BIN(?) AND type IN (?, ?)`,
        [user_id, fromWallet, toWallet]
      );

      return {
        success: true,
        fromWallet,
        toWallet,
        amount,
        reason,
        transferReference,
        updatedBalances: updatedWallets,
        debitTransactionId,
        creditTransactionId,
      };
    },
  },
};
export const { addSiteCredit, addPoints, deductFromWallet, getWalletBalance } =
  walletController;
export default walletController;
