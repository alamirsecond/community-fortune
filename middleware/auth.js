// middleware/auth.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import pool from "../database.js";

dotenv.config();
const SECRET_KEY = process.env.JWT_SECRET;

const authenticate = (roles = []) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          message: "Authorization header missing",
        });
      }

      const tokenParts = authHeader.split(" ");
      if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
        return res.status(401).json({
          success: false,
          message: "Invalid token format. Expected: 'Bearer <token>'",
        });
      }

      const token = tokenParts[1];

      if (!token || token === "null" || token === "undefined") {
        return res.status(401).json({
          success: false,
          message: "No token provided",
        });
      }

      const decoded = jwt.verify(token, SECRET_KEY);

      // Verify user exists and get latest data from database
      const [users] = await pool.query(
        `SELECT BIN_TO_UUID(id) as id, email, username, role, age_verified, profile_photo 
         FROM users WHERE id = UUID_TO_BIN(?)`,
        [decoded.userId]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      const currentUser = users[0];

      // Check role permissions
      if (roles.length && !roles.includes(currentUser.role)) {
        return res.status(403).json({
          success: false,
          message: "Insufficient permissions",
        });
      }

      // ✅ ENHANCEMENT: Handle wallet selection for mixed payments
      const selectedWallet = req.headers["x-selected-wallet"];
      
      if (selectedWallet && ["CASH", "CREDIT", "MIXED"].includes(selectedWallet)) {
        // Validate that user has sufficient balance in selected wallet(s)
        const [wallets] = await pool.query(
          `SELECT type, balance FROM wallets 
           WHERE user_id = UUID_TO_BIN(?) AND type IN ('CASH', 'CREDIT')`,
          [currentUser.id]
        );
        
        const cashWallet = wallets.find(w => w.type === 'CASH');
        const creditWallet = wallets.find(w => w.type === 'CREDIT');
        
        if (selectedWallet === 'CASH' && (!cashWallet || cashWallet.balance <= 0)) {
          return res.status(400).json({
            success: false,
            message: "Insufficient cash wallet balance",
          });
        }
        
        if (selectedWallet === 'CREDIT' && (!creditWallet || creditWallet.balance <= 0)) {
          return res.status(400).json({
            success: false,
            message: "Insufficient credit wallet balance",
          });
        }
        
        if (selectedWallet === 'MIXED' && ((!cashWallet || cashWallet.balance <= 0) && (!creditWallet || creditWallet.balance <= 0))) {
          return res.status(400).json({
            success: false,
            message: "Insufficient balance in both wallets",
          });
        }

        // Add wallet selection to user object
        req.user = {
          ...currentUser,
          selectedWallet: selectedWallet,
          walletBalances: {
            cash: cashWallet ? cashWallet.balance : 0,
            credit: creditWallet ? creditWallet.balance : 0
          }
        };
        console.log(`🔄 User ${currentUser.username} using selected wallet: ${selectedWallet}`);
      } else {
        // No wallet selected, include wallet balances for reference
        const [wallets] = await pool.query(
          `SELECT type, balance FROM wallets 
           WHERE user_id = UUID_TO_BIN(?) AND type IN ('CASH', 'CREDIT')`,
          [currentUser.id]
        );
        
        const cashWallet = wallets.find(w => w.type === 'CASH');
        const creditWallet = wallets.find(w => w.type === 'CREDIT');
        
        req.user = {
          ...currentUser,
          walletBalances: {
            cash: cashWallet ? cashWallet.balance : 0,
            credit: creditWallet ? creditWallet.balance : 0
          }
        };
      }
      
      next();
    } catch (err) {
      console.error("JWT Error:", err.message);

      const errorResponse = {
        success: false,
        message: "Authentication failed",
      };

      if (err.name === "JsonWebTokenError") {
        errorResponse.message = "Invalid token";
      } else if (err.name === "TokenExpiredError") {
        errorResponse.message = "Token expired";
      }

      return res.status(401).json(errorResponse);
    }
  };
};

export default authenticate;