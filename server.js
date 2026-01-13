import express from "express";
import cors from "cors";
import { initializeSuperadmins } from "./src/config/superadmins.js";
import "dotenv/config";
import appRouter from "./src/router/index.js";
import {
  kycDocumentsUpload,
  handleKycUploadError,
} from "./middleware/kycUpload.js";
import { handleUploadError } from "./middleware/upload.js";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./database.js";
import fs from "fs";
import trafficMonitor from "./middleware/trafficMonitor.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createTables = async () => {
  try {
    console.log("🔄 Checking/Creating database tables...");

    // Create a raw connection for database operations
    const connection = await pool.getConnection();
    console.log("📌 Connected to Railway database:", process.env.MYSQLDATABASE);

    try {
      // Define all tables
      const tables = [
        // USERS TABLE - BINARY(16) UUIDs - Merged version with proper ordering
        `CREATE TABLE IF NOT EXISTS users (
          id BINARY(16) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          phone VARCHAR(20) UNIQUE,
          username VARCHAR(255) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          profile_photo VARCHAR(255),
          first_name VARCHAR(50),
          last_name VARCHAR(50),
          date_of_birth DATE,
          country CHAR(2),
          government_id_type ENUM('passport', 'drivers_license', 'national_id'),
          government_id_number VARCHAR(50),
          kyc_status ENUM('pending', 'verified', 'rejected', 'under_review') DEFAULT 'pending',
          kyc_submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          kyc_verified_at TIMESTAMP NULL,
          kyc_rejection_reason TEXT,
          
          -- Enhanced role and status fields
          role ENUM('SUPERADMIN', 'ADMIN', 'USER') DEFAULT 'USER',
          age_verified BOOLEAN DEFAULT FALSE,
          email_verified BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          created_by BINARY(16) NULL,
          
          -- Security fields
          password_reset_token VARCHAR(100) NULL,
          password_reset_expires TIMESTAMP NULL,
          two_factor_enabled BOOLEAN DEFAULT FALSE,
          login_attempts INT DEFAULT 0,
          account_locked_until TIMESTAMP NULL,
          last_login TIMESTAMP NULL,
          permissions JSON NULL,
          
          -- Verification fields
          email_verification_token VARCHAR(255),
          verification_token VARCHAR(100) NULL,
          email_verification_sent_at TIMESTAMP NULL,
          
          -- Referral fields
          referral_code VARCHAR(20) UNIQUE,
          referred_by BINARY(16),
          
          -- XP and level fields
          xp_points INT DEFAULT 0,
          level INT DEFAULT 1,
          total_referrals INT DEFAULT 0,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          -- Indexes
          INDEX idx_users_email (email),
          INDEX idx_users_username (username),
          INDEX idx_users_kyc_status (kyc_status),
          INDEX idx_users_email_verified (email_verified),
          INDEX idx_users_referral_code (referral_code),
          INDEX idx_users_referred_by (referred_by),
          INDEX idx_users_level (level),
          INDEX idx_users_role (role),
          INDEX idx_users_is_active (is_active),
          INDEX idx_users_created_by (created_by),
          FOREIGN KEY (referred_by) REFERENCES users(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        )`,

        // OAUTH IDENTITIES TABLE - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS oauth_identities (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          provider VARCHAR(50) NOT NULL,
          provider_user_id VARCHAR(255) NOT NULL,
          access_token VARCHAR(512),
          refresh_token VARCHAR(512),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_provider_user (provider, provider_user_id),
          INDEX idx_oauth_user (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        // EMAIL VERIFICATION TOKENS TABLE - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS email_verification_tokens (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          token VARCHAR(6) NOT NULL UNIQUE COMMENT '6-digit OTP code',
          expires_at DATETIME NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_email_verification_token (token),
          INDEX idx_email_verification_user_id (user_id),
          INDEX idx_email_verification_expires_at (expires_at)
        )`,

        // KYC DOCUMENTS TABLE - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS kyc_documents (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          document_type ENUM('government_id', 'selfie_photo', 'additional_document') NOT NULL,
          file_path VARCHAR(500) NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          file_size INT NOT NULL,
          status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_kyc_documents_user_id (user_id),
          INDEX idx_kyc_documents_document_type (document_type),
          INDEX idx_kyc_documents_status (status)
        )`,

        // KYC ADMIN REVIEW TABLE - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS kyc_reviews (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          admin_id BINARY(16),
          old_status ENUM('pending', 'verified', 'rejected', 'under_review'),
          new_status ENUM('pending', 'verified', 'rejected', 'under_review'),
          review_notes TEXT,
          reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (admin_id) REFERENCES users(id),
          INDEX idx_kyc_reviews_user_id (user_id),
          INDEX idx_kyc_reviews_reviewed_at (reviewed_at)
        )`,

        // PASSWORD RESETS - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS password_resets (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          token VARCHAR(6) NOT NULL UNIQUE COMMENT '6-digit OTP code',
          expires_at DATETIME NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_password_resets_token (token),
          INDEX idx_password_resets_user_id (user_id),
          INDEX idx_password_resets_expires_at (expires_at)
        )`,

        // WALLET TABLES - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS wallets (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16),
          type ENUM('CASH', 'CREDIT') NOT NULL,
          balance DECIMAL(12,2) DEFAULT 0,
          is_frozen BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_wallet (user_id, type),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_wallets_user_id (user_id)
        )`,

        `CREATE TABLE IF NOT EXISTS wallet_transactions (
          id BINARY(16) PRIMARY KEY,
          wallet_id BINARY(16),
          amount DECIMAL(12,2) NOT NULL,
          type ENUM('CREDIT', 'DEBIT', 'HOLD', 'REFUND') NOT NULL,
          reference VARCHAR(255),
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
          INDEX idx_wallet_transactions_wallet_id (wallet_id),
          INDEX idx_wallet_transactions_created_at (created_at)
        )`,

        `CREATE TABLE IF NOT EXISTS wallet_actions (
          id BINARY(16) PRIMARY KEY,
          wallet_id BINARY(16) NOT NULL,
          action_type VARCHAR(50) NOT NULL,
          details JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
          INDEX idx_wallet_actions_wallet (wallet_id)
        )`,

        // SPENDING LIMITS FOR RESPONSIBLE GAMING
        `CREATE TABLE IF NOT EXISTS spending_limits (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL UNIQUE,
          daily_limit DECIMAL(12,2) DEFAULT 0,
          weekly_limit DECIMAL(12,2) DEFAULT 0,
          monthly_limit DECIMAL(12,2) DEFAULT 0,
          single_purchase_limit DECIMAL(12,2) DEFAULT 0,
          daily_spent DECIMAL(12,2) DEFAULT 0,
          weekly_spent DECIMAL(12,2) DEFAULT 0,
          monthly_spent DECIMAL(12,2) DEFAULT 0,
          limit_reset_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_spending_limits_user (user_id)
        )`,

        // UPDATED COMPETITIONS TABLE WITH ALL NEW TYPES - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS competitions (
          id BINARY(16) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          featured_image VARCHAR(255),
          featured_video VARCHAR(255),
          price DECIMAL(12,2) NOT NULL DEFAULT 0,
          total_tickets INT NOT NULL,
          sold_tickets INT DEFAULT 0,
          
          -- Updated category enum with all new types
          category ENUM('PAID', 'FREE', 'JACKPOT', 'MINI_GAME', 'SUBSCRIPTION', 'SPIN_WHEEL', 'VIP', 'INSTANT_WIN', 'ROLLING') NOT NULL,
          type ENUM('STANDARD', 'MANUAL_DRAW', 'AUTO_DRAW', 'SPIN_COMPETITION') NOT NULL,
          start_date DATETIME NOT NULL,
          end_date DATETIME,
          no_end_date BOOLEAN DEFAULT FALSE,
          is_free_competition BOOLEAN DEFAULT FALSE,
          points_per_pound INT DEFAULT 0,
          status ENUM('ACTIVE', 'COMPLETED', 'CANCELLED') DEFAULT 'ACTIVE',
          
          -- UK Compliance Fields
          competition_type ENUM('PAID', 'FREE') NOT NULL DEFAULT 'PAID',
          skill_question_enabled BOOLEAN DEFAULT FALSE,
          skill_question_text TEXT,
          skill_question_answer TEXT,
          free_entry_enabled BOOLEAN DEFAULT FALSE,
          free_entry_instructions TEXT,
          postal_address TEXT,
          max_entries_per_user INT DEFAULT 1,
          requires_address BOOLEAN DEFAULT FALSE,
          
          -- New Jackpot-specific fields
          prize_option ENUM('A', 'B', 'C', 'CUSTOM') NULL,
          ticket_model ENUM('MODEL_1', 'MODEL_2', 'CUSTOM') NULL,
          threshold_type ENUM('AUTOMATIC', 'MANUAL') NULL,
          threshold_value INT DEFAULT 1200,
          
          -- New Subscription-specific fields
          subscription_tier ENUM('TIER_1', 'TIER_2', 'TIER_3', 'CUSTOM') NULL,
          auto_entry_enabled BOOLEAN DEFAULT TRUE,
          subscriber_competition_type VARCHAR(50),
          
          -- New Wheel-specific fields
          wheel_type ENUM('DAILY', 'VIP', 'SUBSCRIBED') NULL,
          wheel_config JSON NULL,
          spins_per_user INT DEFAULT 1,
          
          -- New Mini-game specific fields
          game_id BINARY(16) NULL,
          game_type ENUM('FREE_TO_PLAY', 'PAY_TO_PLAY', 'REFER_A_FRIEND') NULL,
          game_name VARCHAR(100),
          game_code VARCHAR(50),
          points_per_play INT DEFAULT 0,
          leaderboard_type ENUM('DAILY', 'WEEKLY', 'MONTHLY') NULL,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          -- Indexes
          INDEX idx_competitions_status (status),
          INDEX idx_competitions_category (category),
          INDEX idx_competitions_start_date (start_date),
          INDEX idx_competitions_end_date (end_date),
          INDEX idx_competitions_competition_type (competition_type),
          INDEX idx_competitions_subscription_tier (subscription_tier),
          INDEX idx_competitions_wheel_type (wheel_type),
          INDEX idx_competitions_prize_option (prize_option),
          INDEX idx_competitions_game_type (game_type)
        )`,

        // COMPETITION TYPE CONFIG TABLE - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS competition_type_config (
          id BINARY(16) PRIMARY KEY,
          competition_type VARCHAR(50) NOT NULL,
          config_key VARCHAR(100) NOT NULL,
          config_value TEXT,
          config_type ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ARRAY') DEFAULT 'STRING',
          is_required BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_type_config (competition_type, config_key),
          INDEX idx_competition_type_config_type (competition_type)
        )`,

        // COMPETITION AUDIT TABLE - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS competition_audit (
          id BINARY(16) PRIMARY KEY,
          competition_id BINARY(16) NOT NULL,
          changed_by BINARY(16),
          change_type ENUM('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE') NOT NULL,
          old_values JSON,
          new_values JSON,
          change_reason TEXT,
          ip_address VARCHAR(50),
          user_agent VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
          FOREIGN KEY (changed_by) REFERENCES users(id),
          INDEX idx_competition_audit_competition (competition_id),
          INDEX idx_competition_audit_created_at (created_at)
        )`,

        // COMPETITION ENTRIES TABLE - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS competition_entries (
          id BINARY(16) PRIMARY KEY,
          competition_id BINARY(16) NOT NULL,
          user_id BINARY(16),
          entry_type ENUM('PAID_TICKET', 'FREE_ENTRY', 'PAID_ENTRY') NOT NULL,
          skill_question_answered BOOLEAN DEFAULT FALSE,
          skill_question_correct BOOLEAN DEFAULT FALSE,
          postal_entry_received BOOLEAN DEFAULT FALSE,
          user_address TEXT,
          postal_proof VARCHAR(255),
          status VARCHAR(50) DEFAULT 'ACTIVE',
          entry_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_competition_entries_competition (competition_id),
          INDEX idx_competition_entries_user (user_id),
          INDEX idx_competition_entries_type (entry_type)
        )`,

        // WHEEL SEGMENTS TABLE - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS wheel_segments (
          id BINARY(16) PRIMARY KEY,
          competition_id BINARY(16) NOT NULL,
          segment_index INT NOT NULL,
          label VARCHAR(255) NOT NULL,
          prize_type ENUM('POINTS', 'SITE_CREDIT', 'CASH', 'FREE_TICKETS', 'NO_WIN', 'BONUS_SPIN', 'FREE_ENTRY') NOT NULL,
          amount DECIMAL(12,2),
          color VARCHAR(7) DEFAULT '#FFFFFF',
          probability DECIMAL(5,2) NOT NULL,
          image_url VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
          UNIQUE KEY unique_segment (competition_id, segment_index),
          INDEX idx_wheel_segments_competition (competition_id)
        )`,

        // SPIN WHEEL SYSTEM - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS spin_wheels (
          id BINARY(16) PRIMARY KEY,
          wheel_name VARCHAR(100) NOT NULL,
          wheel_type VARCHAR(50) NOT NULL, -- 'DAILY', 'VIP', 'SUBSCRIBER_ONLY', 'EVENT'
          wheel_description TEXT,
          
          -- Access Control
          min_tier VARCHAR(20), -- Minimum subscription tier required
          spins_per_user_period VARCHAR(20), -- 'DAILY', 'WEEKLY', 'UNLIMITED'
          max_spins_per_period INTEGER,
          cooldown_hours INTEGER DEFAULT 24,
          
          -- Visual Settings
          background_image_url TEXT,
          animation_speed_ms INTEGER DEFAULT 4000,
          
          -- Status
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW()
        )`,

        // SPIN WHEEL SEGMENTS (Linked to Spin Wheel)
        `CREATE TABLE IF NOT EXISTS spin_wheel_segments (
          id BINARY(16) PRIMARY KEY,
          wheel_id BINARY(16) NOT NULL,
          position INT NOT NULL,
          color_hex VARCHAR(20),
          prize_name VARCHAR(255) NOT NULL,
          prize_type VARCHAR(50) NOT NULL,
          prize_value DECIMAL(12,2) DEFAULT 0,
          probability DECIMAL(10,4) NOT NULL,
          image_url VARCHAR(255),
          text_color VARCHAR(20),
          stock INT,
          current_stock INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (wheel_id) REFERENCES spin_wheels(id) ON DELETE CASCADE,
          INDEX idx_spin_wheel_segments_wheel (wheel_id)
        )`,

        // SPIN PRIZES - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS spin_prizes (
          id BINARY(16) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type ENUM('POINTS', 'SITE_CREDIT', 'CASH', 'FREE_TICKETS') NOT NULL,
          value DECIMAL(12,2),
          drop_rate DECIMAL(5,2),
          stock INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_spin_prizes_type (type)
        )`,

        // SPIN HISTORY
        `CREATE TABLE IF NOT EXISTS spin_history (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16),
          prize_id BINARY(16),
          competition_id BINARY(16),
          prize_value DECIMAL(12,2),
          wheel_id BINARY(16),
          segment_id BINARY(16),
          prize_type VARCHAR(50),
          segment_label VARCHAR(255),
          spin_result JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (prize_id) REFERENCES spin_prizes(id),
          FOREIGN KEY (competition_id) REFERENCES competitions(id),
          FOREIGN KEY (wheel_id) REFERENCES spin_wheels(id),
          FOREIGN KEY (segment_id) REFERENCES spin_wheel_segments(id),
          INDEX idx_spin_history_user_id (user_id),
          INDEX idx_spin_history_created_at (created_at)
        )`,

        // BONUS SPINS
        `CREATE TABLE IF NOT EXISTS bonus_spins (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          competition_id BINARY(16),
          expires_at DATETIME,
          is_used BOOLEAN DEFAULT FALSE,
          used_at DATETIME,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL,
          INDEX idx_bonus_spins_user (user_id)
        )`,

        // PURCHASES - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS purchases (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16),
          competition_id BINARY(16),
          status ENUM('PENDING', 'PAID', 'FAILED', 'CANCELLED') DEFAULT 'PENDING',
          payment_method ENUM('CASH_WALLET', 'CREDIT_WALLET', 'MIXED', 'CASHFLOWS', 'MASTERCARD', 'VISA'),
          total_amount DECIMAL(12,2),
          site_credit_used DECIMAL(12,2),
          cash_wallet_used DECIMAL(12,2),
          gateway_reference VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (competition_id) REFERENCES competitions(id),
          INDEX idx_purchases_user_id (user_id),
          INDEX idx_purchases_status (status)
        )`,

        // CREDIT PURCHASES
        `CREATE TABLE IF NOT EXISTS credit_purchases (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          amount DECIMAL(12,2) NOT NULL,
          payment_method VARCHAR(50) NOT NULL,
          status ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') DEFAULT 'PENDING',
          gateway_reference VARCHAR(255),
          gateway_response JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_credit_purchases_user (user_id),
          INDEX idx_credit_purchases_status (status)
        )`,

        // UNIVERSAL TICKETS SYSTEM - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS universal_tickets (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          ticket_type VARCHAR(50) DEFAULT 'STANDARD',
          source VARCHAR(50),
          is_used BOOLEAN DEFAULT FALSE,
          quantity INTEGER DEFAULT 1,
          used_at DATETIME,
          expires_at DATETIME,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_universal_tickets_user (user_id)
        )`,

        // TICKETS SYSTEM - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS tickets (
          id BINARY(16) PRIMARY KEY,
          competition_id BINARY(16),
          user_id BINARY(16),
          
          -- Ticket Identification
          ticket_number INTEGER NOT NULL,
          ticket_type VARCHAR(20) NOT NULL, -- 'COMPETITION', 'UNIVERSAL'
          purchase_id BINARY(16), -- For tracking purchases
          
          -- Universal Ticket Properties
          universal_ticket_id BINARY(16), -- Reference to universal_tickets table if type=UNIVERSAL
          
          -- Status
          is_used BOOLEAN DEFAULT FALSE,
          is_instant_win BOOLEAN DEFAULT FALSE,
          instant_win_claimed BOOLEAN DEFAULT FALSE,
          
          created_at TIMESTAMP DEFAULT NOW(),
          
          UNIQUE(competition_id, ticket_number),
          FOREIGN KEY (universal_ticket_id) REFERENCES universal_tickets(id) ON DELETE CASCADE,
          FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
          INDEX idx_user_competition (user_id, competition_id)
        )`,

        // INSTANT WINS - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS instant_wins (
          id BINARY(16) PRIMARY KEY,
          competition_id BINARY(16),
          ticket_number INT NOT NULL,
          
          -- Merged columns from different sources
          title VARCHAR(255),
          prize_name VARCHAR(255),
          image_url VARCHAR(255),
          
          prize_value DECIMAL(12,2) NOT NULL,
          
          payout_type VARCHAR(50),
          prize_type VARCHAR(50),
          
          max_winners INT DEFAULT 1,
          current_winners INT DEFAULT 0,
          
          claimed_by BINARY(16),
          claimed_at DATETIME,
          user_details JSON,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_instant_win (competition_id, ticket_number),
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
          FOREIGN KEY (claimed_by) REFERENCES users(id),
          INDEX idx_instant_wins_competition (competition_id),
          INDEX idx_instant_wins_claimed_by (claimed_by),
          INDEX idx_instant_wins_claimed_at (claimed_at)
        )`,

        // PHYSICAL PRIZE CLAIMS
        `CREATE TABLE IF NOT EXISTS physical_prize_claims (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          instant_win_id BINARY(16) NOT NULL,
          status VARCHAR(50) DEFAULT 'PENDING',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (instant_win_id) REFERENCES instant_wins(id) ON DELETE CASCADE,
          INDEX idx_physical_claims_user (user_id)
        )`,

        // WINNERS - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS winners (
          id BINARY(16) PRIMARY KEY,
          competition_id BINARY(16),
          ticket_id BINARY(16),
          user_id BINARY(16),
          prize_description TEXT,
          draw_method ENUM('MANUAL', 'AUTO'),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (competition_id) REFERENCES competitions(id),
          FOREIGN KEY (ticket_id) REFERENCES tickets(id),
          FOREIGN KEY (user_id) REFERENCES users(id),
          INDEX idx_winners_competition_id (competition_id),
          INDEX idx_winners_user_id (user_id)
        )`,

        // PRIZE DISTRIBUTIONS (referenced by winners module)
        `CREATE TABLE IF NOT EXISTS prize_distributions (
          id BINARY(16) PRIMARY KEY,
          winner_id BINARY(16) NOT NULL,
          prize_type ENUM('CASH', 'CREDIT', 'TICKETS', 'OTHER') DEFAULT 'OTHER',
          prize_value DECIMAL(12,2) DEFAULT 0,
          distributed_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (winner_id) REFERENCES winners(id) ON DELETE CASCADE,
          INDEX idx_prize_distributions_winner_id (winner_id),
          INDEX idx_prize_distributions_distributed_at (distributed_at)
        )`,

        // COMPETITION ACHIEVEMENTS
        `CREATE TABLE IF NOT EXISTS competition_achievements (
          id BINARY(16) PRIMARY KEY,
          competition_id BINARY(16) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          type VARCHAR(50) NOT NULL,
          condition_value INT,
          points_awarded INT DEFAULT 0,
          image_url VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
          INDEX idx_comp_achievements_comp (competition_id)
        )`,

        // VOUCHERS - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS vouchers (
          id BINARY(16) PRIMARY KEY,
          code VARCHAR(32) NOT NULL,
          code_prefix VARCHAR(32) NULL,
          campaign_name VARCHAR(255) NOT NULL,
          voucher_type ENUM('SINGLE_USE', 'MULTI_USE', 'BULK_CODES') NOT NULL DEFAULT 'SINGLE_USE',
          reward_type ENUM('SITE_CREDIT') NOT NULL DEFAULT 'SITE_CREDIT',
          reward_value DECIMAL(12,2) NOT NULL,
          start_date DATETIME NOT NULL,
          expiry_date DATETIME NOT NULL,
          usage_limit INT NOT NULL DEFAULT 1,
          times_redeemed INT NOT NULL DEFAULT 0,
          bulk_quantity INT NOT NULL DEFAULT 0,
          bulk_generated INT NOT NULL DEFAULT 0,
          bulk_code_length INT NOT NULL DEFAULT 8,
          is_active BOOLEAN DEFAULT TRUE,
          created_by BINARY(16) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_vouchers_code (code),
          INDEX idx_vouchers_campaign (campaign_name),
          INDEX idx_vouchers_active (is_active),
          INDEX idx_vouchers_dates (start_date, expiry_date),
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )`,

        `CREATE TABLE IF NOT EXISTS voucher_codes (
          id BINARY(16) PRIMARY KEY,
          voucher_id BINARY(16) NOT NULL,
          code VARCHAR(32) NOT NULL,
          status ENUM('AVAILABLE', 'REDEEMED', 'VOID') DEFAULT 'AVAILABLE',
          redeemed_by BINARY(16) NULL,
          redeemed_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_voucher_codes_code (code),
          INDEX idx_voucher_codes_voucher (voucher_id),
          INDEX idx_voucher_codes_status (status),
          FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
          FOREIGN KEY (redeemed_by) REFERENCES users(id) ON DELETE SET NULL
        )`,

        `CREATE TABLE IF NOT EXISTS voucher_redemptions (
          id BINARY(16) PRIMARY KEY,
          voucher_id BINARY(16) NOT NULL,
          voucher_code_id BINARY(16) NULL,
          user_id BINARY(16) NOT NULL,
          reward_type ENUM('SITE_CREDIT') NOT NULL,
          reward_value DECIMAL(12,2) NOT NULL,
          metadata JSON NULL,
          redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
          FOREIGN KEY (voucher_code_id) REFERENCES voucher_codes(id) ON DELETE SET NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE KEY uq_voucher_user (voucher_id, user_id),
          INDEX idx_voucher_redemptions_voucher (voucher_id),
          INDEX idx_voucher_redemptions_code (voucher_code_id),
          INDEX idx_voucher_redemptions_user (user_id),
          INDEX idx_voucher_redemptions_redeemed_at (redeemed_at)
        )`,

        // SUBSCRIPTION SYSTEM TABLES - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS subscription_tiers (
          id BINARY(16) PRIMARY KEY,
          tier_name VARCHAR(100) NOT NULL,
          tier_level INT UNIQUE NOT NULL,
          monthly_price DECIMAL(10,2) NOT NULL,
          price DECIMAL(10,2),
          benefits JSON,
          free_jackpot_tickets INT DEFAULT 0,
          monthly_site_credit DECIMAL(10,2) DEFAULT 0,
          badge_name VARCHAR(100),
          subscriber_competition_access BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_subscription_tiers_level (tier_level)
        )`,

        `CREATE TABLE IF NOT EXISTS user_subscriptions (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          tier_id BINARY(16) NOT NULL,
          status ENUM('ACTIVE', 'CANCELLED', 'EXPIRED', 'PENDING') DEFAULT 'ACTIVE',
          start_date DATE NOT NULL,
          end_date DATE,
          auto_renew BOOLEAN DEFAULT TRUE,
          last_payment_date DATE,
          next_payment_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (tier_id) REFERENCES subscription_tiers(id),
          INDEX idx_user_subscriptions_user (user_id),
          INDEX idx_user_subscriptions_status (status)
        )`,

        // MINI-GAMES TABLES - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS mini_games (
          id BINARY(16) PRIMARY KEY,
          game_name VARCHAR(255) NOT NULL,
          game_code VARCHAR(100) UNIQUE NOT NULL,
          game_type ENUM('PUZZLE', 'ARCADE', 'QUIZ', 'SKILL', 'LUCK') NOT NULL,
          description TEXT,
          thumbnail_url VARCHAR(500),
          game_url VARCHAR(500),
          is_active BOOLEAN DEFAULT TRUE,
          points_per_play INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_mini_games_active (is_active)
        )`,

        // GAMES SYSTEM
        `CREATE TABLE IF NOT EXISTS games (
          id BINARY(16) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          category VARCHAR(50) DEFAULT 'ARCADE',
          difficulty ENUM('EASY', 'MEDIUM', 'HARD') DEFAULT 'MEDIUM',
          min_players INT DEFAULT 1,
          max_players INT DEFAULT 1,
          estimated_duration INT DEFAULT 300,
          thumbnail_url VARCHAR(500),
          game_url VARCHAR(500) NOT NULL,
          version VARCHAR(20) DEFAULT '1.0.0',
          status ENUM('DRAFT', 'ACTIVE', 'ARCHIVED', 'MAINTENANCE') DEFAULT 'DRAFT',
          created_by BINARY(16),
          plays_count INT DEFAULT 0,
          avg_score DECIMAL(10,2) DEFAULT 0,
          tags JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
          INDEX idx_games_category (category),
          INDEX idx_games_difficulty (difficulty),
          INDEX idx_games_status (status),
          INDEX idx_games_created_by (created_by)
        )`,

        `CREATE TABLE IF NOT EXISTS game_categories (
          id BINARY(16) PRIMARY KEY,
          name VARCHAR(100) UNIQUE NOT NULL,
          description TEXT,
          icon_url VARCHAR(500),
          sort_order INT DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS game_plays (
          id BINARY(16) PRIMARY KEY,
          game_id BINARY(16) NOT NULL,
          user_id BINARY(16) NOT NULL,
          score INT NOT NULL,
          play_data JSON,
          played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_game_plays_game (game_id),
          INDEX idx_game_plays_user (user_id),
          INDEX idx_game_plays_played_at (played_at)
        )`,

        `CREATE TABLE IF NOT EXISTS mini_game_scores (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          game_id BINARY(16) NOT NULL,
          competition_id BINARY(16),
          score INT NOT NULL,
          time_taken INT,
          level_reached INT,
          session_data JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL,
          INDEX idx_mini_game_scores_user (user_id),
          INDEX idx_mini_game_scores_comp (competition_id)
        )`,

        `CREATE TABLE IF NOT EXISTS game_scores (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          game_id VARCHAR(50) NOT NULL,
          score INT NOT NULL,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_game (user_id, game_id),
          INDEX idx_game_score (game_id, score DESC)
        )`,

        // DAILY GAME STATS
        `CREATE TABLE IF NOT EXISTS daily_game_stats (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          game_id BINARY(16) NOT NULL,
          date DATE NOT NULL,
          plays_today INT DEFAULT 0,
          points_earned_today INT DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_daily_game_stat (user_id, game_id, date),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_daily_game_stats_date (date)
        )`,

        // DAILY REWARDS SYSTEM - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS user_streaks (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL UNIQUE,
          current_streak INT DEFAULT 0,
          longest_streak INT DEFAULT 0,
          last_login_date DATE,
          total_logins INT DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_streaks_user (user_id)
        )`,

        `CREATE TABLE IF NOT EXISTS daily_rewards_config (
          id BINARY(16) PRIMARY KEY,
          day_number INT UNIQUE NOT NULL,
          reward_type ENUM('POINTS', 'SITE_CREDIT', 'CASH', 'FREE_TICKETS') NOT NULL,
          reward_value DECIMAL(12,2) NOT NULL,
          streak_required BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_daily_rewards_config_day (day_number)
        )`,

        `CREATE TABLE IF NOT EXISTS daily_rewards_claimed (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          day_number INT NOT NULL,
          reward_type ENUM('POINTS', 'SITE_CREDIT', 'CASH', 'FREE_TICKETS') NOT NULL,
          reward_value DECIMAL(12,2) NOT NULL,
          reward_claimed BOOLEAN DEFAULT FALSE,
          claimed_date DATE NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_daily_reward (user_id, claimed_date),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_daily_rewards_user (user_id),
          INDEX idx_daily_rewards_claimed_date (claimed_date)
        )`,

        // POINTS SYSTEM - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS user_points (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL UNIQUE,
          total_points INT DEFAULT 0,
          earned_points INT DEFAULT 0,
          spent_points INT DEFAULT 0,
          redeemed_points INT DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_points_user (user_id)
        )`,

        `CREATE TABLE IF NOT EXISTS points_history (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          points INT NOT NULL,
          type ENUM('EARNED', 'REDEEMED', 'SPENT') NOT NULL,
          source ENUM('PURCHASE', 'REFERRAL', 'SOCIAL_SHARE', 'DAILY_REWARD', 'SPIN_WIN', 'WHEEL_SPIN', 'DAILY_LOGIN', 'MISSION', 'GAME', 'ADMIN_AWARD') NOT NULL,
          reference_id BINARY(16),
          description TEXT,
          game_id VARCHAR(50),
          mission_id BINARY(16),
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          INDEX idx_points_history_user (user_id),
          INDEX idx_points_history_created_at (created_at),
          INDEX idx_points_history_source (source),
          INDEX idx_points_history_type (type)
        )`,

        `CREATE TABLE IF NOT EXISTS daily_login_points (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          login_date DATE NOT NULL,
          points_awarded INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_date (user_id, login_date),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        // MISSIONS SYSTEM
        `CREATE TABLE IF NOT EXISTS missions (
          id BINARY(16) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          mission_type ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'SPECIAL', 'GAME', 'SOCIAL') NOT NULL,
          points INT NOT NULL,
          action VARCHAR(50) NOT NULL,
          target_value INT,
          game_id VARCHAR(50),
          reset_frequency ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'ONCE'),
          is_active BOOLEAN DEFAULT TRUE,
          start_date TIMESTAMP NULL,
          end_date TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_type_active (mission_type, is_active),
          INDEX idx_game (game_id)
        )`,

        `CREATE TABLE IF NOT EXISTS user_missions (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          mission_id BINARY(16) NOT NULL,
          progress INT DEFAULT 0,
          completed BOOLEAN DEFAULT FALSE,
          completed_at TIMESTAMP NULL,
          reset_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_mission (user_id, mission_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
          INDEX idx_user_completed (user_id, completed)
        )`,

        // REFERRAL SYSTEM - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS referral_tiers (
          id BINARY(16) PRIMARY KEY,
          tier_level INT UNIQUE NOT NULL,
          tier_name VARCHAR(100) NOT NULL,
          min_referrals INT NOT NULL,
          reward_type ENUM('TICKETS', 'CREDIT', 'CASH', 'PERCENTAGE') NOT NULL,
          reward_value DECIMAL(12,2) NOT NULL,
          perks JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_referral_tiers_level (tier_level)
        )`,

        `CREATE TABLE IF NOT EXISTS referrals (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL UNIQUE,
          code VARCHAR(50) UNIQUE NOT NULL,
          total_referrals INT DEFAULT 0,
          total_earned DECIMAL(12,2) DEFAULT 0,
          current_tier INT DEFAULT 1,
          status ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_referrals_user (user_id),
          INDEX idx_referrals_code (code)
        )`,

        `CREATE TABLE IF NOT EXISTS referral_history (
          id BINARY(16) PRIMARY KEY,
          referral_id BINARY(16) NOT NULL,
          referred_user_id BINARY(16) NOT NULL UNIQUE,
          reward_type ENUM('TICKETS', 'CREDIT', 'CASH') NOT NULL,
          reward_value DECIMAL(12,2) NOT NULL,
          tier_at_time INT NOT NULL,
          reward_given BOOLEAN DEFAULT FALSE,
          reward_claimed_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE,
          FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_referral_history_referral (referral_id),
          INDEX idx_referral_history_referred_user (referred_user_id),
          INDEX idx_referral_history_given (reward_given)
        )`,

        // USER LEVELS
        `CREATE TABLE IF NOT EXISTS user_levels (
          level INT PRIMARY KEY,
          level_name VARCHAR(100) NOT NULL,
          xp_required INT NOT NULL,
          perks JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        // SOCIAL SHARING MODULE - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS share_events (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          platform ENUM('FACEBOOK', 'TWITTER', 'WHATSAPP', 'TELEGRAM', 'INSTAGRAM'),
          competition_id BINARY(16) NOT NULL,
          points_earned INT,
          points_capped BOOLEAN DEFAULT FALSE,
          ip_address VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (competition_id) REFERENCES competitions(id),
          UNIQUE KEY unique_share_event (user_id, competition_id, platform),
          INDEX idx_share_events_user (user_id),
          INDEX idx_share_events_platform (platform)
        )`,

        `CREATE TABLE IF NOT EXISTS share_limits (
          id BINARY(16) PRIMARY KEY,
          platform ENUM('FACEBOOK', 'TWITTER', 'WHATSAPP', 'TELEGRAM', 'INSTAGRAM') NOT NULL,
          points_per_share INT NOT NULL DEFAULT 5,
          daily_limit INT NOT NULL DEFAULT 3,
          weekly_limit INT NOT NULL DEFAULT 10,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_platform (platform)
        )`,

        // LEGAL MODULE - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS legal_documents (
          id BINARY(16) PRIMARY KEY,
          type ENUM('TERMS', 'PRIVACY', 'RESPONSIBLE_PLAY') NOT NULL,
          content TEXT NOT NULL,
          version INT DEFAULT 1,
          effective_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_legal_documents_type (type)
        )`,

        `CREATE TABLE IF NOT EXISTS user_consents (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16) NOT NULL,
          document_id BINARY(16) NOT NULL,
          consented_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          revoked_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (document_id) REFERENCES legal_documents(id),
          INDEX idx_user_consents_user (user_id),
          INDEX idx_user_consents_doc (document_id)
        )`,

        // ADMIN ACTIVITY - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS admin_activities (
          id BINARY(16) PRIMARY KEY,
          admin_id BINARY(16),
          action VARCHAR(255),
          target_id VARCHAR(255),
          module VARCHAR(100),
          ip_address VARCHAR(50),
          user_agent VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (admin_id) REFERENCES users(id),
          INDEX idx_admin_activities_admin (admin_id),
          INDEX idx_admin_activities_module (module)
        )`,

        // PARTNER APPLICATIONS - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS partner_applications (
          id BINARY(16) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          social_link VARCHAR(255),
          audience_size INT,
          message TEXT,
          status ENUM('NEW', 'REVIEWED', 'APPROVED', 'REJECTED') DEFAULT 'NEW',
          assigned_admin_id BINARY(16) NULL,
          approved_at TIMESTAMP NULL,
          rejected_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (assigned_admin_id) REFERENCES users(id),
          INDEX idx_partner_status (status),
          INDEX idx_partner_created_at (created_at)
        )`,

        // WITHDRAWALS - BINARY(16) UUIDs
        `CREATE TABLE IF NOT EXISTS withdrawals (
          id BINARY(16) PRIMARY KEY,
          user_id BINARY(16),
          amount DECIMAL(12,2) NOT NULL,
          payment_method ENUM('MASTERCARD', 'VISA', 'BANK_TRANSFER') NOT NULL,
          account_details JSON NOT NULL,
          status ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED') DEFAULT 'PENDING',
          reason TEXT,
          admin_notes TEXT,
          admin_id BINARY(16),
          requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (admin_id) REFERENCES users(id),
          INDEX idx_withdrawals_user_id (user_id),
          INDEX idx_withdrawals_status (status),
          INDEX idx_withdrawals_requested_at (requested_at)
        )`,
      ];

      // Create tables using raw queries
      for (const sql of tables) {
        await connection.query(sql);
        console.log("✅ Table created/verified successfully");
      }

      // Lightweight schema migration: ensure instant_wins has the columns used by the API.
      try {
        const [cols] = await connection.query(
          `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'instant_wins'`
        );
        const existing = new Set(
          (cols || []).map((c) => String(c.COLUMN_NAME))
        );
        const alters = [];
        const add = (col, ddl) => {
          if (!existing.has(col)) alters.push(ddl);
        };

        add(
          "prize_name",
          "ALTER TABLE instant_wins ADD COLUMN prize_name VARCHAR(255) NULL"
        );
        add(
          "prize_type",
          "ALTER TABLE instant_wins ADD COLUMN prize_type VARCHAR(50) NULL"
        );
        add(
          "payout_type",
          "ALTER TABLE instant_wins ADD COLUMN payout_type VARCHAR(50) NULL"
        );
        add(
          "image_url",
          "ALTER TABLE instant_wins ADD COLUMN image_url VARCHAR(255) NULL"
        );
        add(
          "max_winners",
          "ALTER TABLE instant_wins ADD COLUMN max_winners INT NOT NULL DEFAULT 1"
        );
        add(
          "current_winners",
          "ALTER TABLE instant_wins ADD COLUMN current_winners INT NOT NULL DEFAULT 0"
        );
        add(
          "user_details",
          "ALTER TABLE instant_wins ADD COLUMN user_details JSON NULL"
        );
        add(
          "updated_at",
          "ALTER TABLE instant_wins ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        );

        for (const ddl of alters) {
          await connection.query(ddl);
          console.log("🛠️ Migrated instant_wins schema:", ddl);
        }
      } catch (e) {
        console.warn("⚠️ instant_wins schema migration skipped:", e?.message);
      }

      // Lightweight voucher schema migration compatible with older MySQL
      try {
        const [vCols] = await connection.query(
          `SELECT COLUMN_NAME, COLUMN_TYPE
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vouchers'`
        );
        const existingV = new Map(
          (vCols || []).map((c) => [
            String(c.COLUMN_NAME),
            String(c.COLUMN_TYPE),
          ])
        );

        const vAlters = [];

        // Ensure voucher_type enum contains BULK_CODES
        const vtType = existingV.get("voucher_type");
        if (vtType && !/BULK_CODES/.test(vtType)) {
          vAlters.push(
            "ALTER TABLE vouchers MODIFY voucher_type ENUM('SINGLE_USE','MULTI_USE','BULK_CODES') NOT NULL DEFAULT 'SINGLE_USE'"
          );
        }

        if (!existingV.has("code_prefix")) {
          vAlters.push(
            "ALTER TABLE vouchers ADD COLUMN code_prefix VARCHAR(32) NULL AFTER code"
          );
        }

        if (!existingV.has("bulk_quantity")) {
          vAlters.push(
            "ALTER TABLE vouchers ADD COLUMN bulk_quantity INT NOT NULL DEFAULT 0 AFTER times_redeemed"
          );
        }

        if (!existingV.has("bulk_generated")) {
          vAlters.push(
            "ALTER TABLE vouchers ADD COLUMN bulk_generated INT NOT NULL DEFAULT 0 AFTER bulk_quantity"
          );
        }

        if (!existingV.has("bulk_code_length")) {
          vAlters.push(
            "ALTER TABLE vouchers ADD COLUMN bulk_code_length INT NOT NULL DEFAULT 8 AFTER bulk_generated"
          );
        }

        for (const ddl of vAlters) {
          await connection.query(ddl);
          console.log("🛠️ Migrated vouchers schema:", ddl);
        }

        // voucher_redemptions migration: add voucher_code_id column and index if missing
        const [rCols] = await connection.query(
          `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'voucher_redemptions'`
        );
        const existingR = new Set(
          (rCols || []).map((c) => String(c.COLUMN_NAME))
        );

        if (!existingR.has("voucher_code_id")) {
          await connection.query(
            "ALTER TABLE voucher_redemptions ADD COLUMN voucher_code_id BINARY(16) NULL AFTER voucher_id"
          );
          console.log("🛠️ Added voucher_redemptions.voucher_code_id column");
        }

        // Ensure index exists on voucher_code_id
        const [stats] = await connection.query(
          `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'voucher_redemptions' AND INDEX_NAME = 'idx_voucher_redemptions_code'`
        );
        if (!stats || stats.length === 0) {
          await connection.query(
            "CREATE INDEX idx_voucher_redemptions_code ON voucher_redemptions (voucher_code_id)"
          );
          console.log("🛠️ Created index idx_voucher_redemptions_code");
        }
      } catch (e) {
        console.warn("⚠️ vouchers schema migration skipped:", e?.message);
      }

      connection.release();
      console.log("✅ All tables created successfully!");
    } finally {
      // Always release the connection
      connection.release();
    }
  } catch (error) {
    console.error("❌ Error creating tables:", error.message);
    throw error;
  }
};

// Initialize upload directories
const initUploadDirectories = () => {
  const directories = [
    process.env.KYC_UPLOAD_PATH || "./uploads/kyc_documents",
    process.env.COMPETITION_UPLOAD_PATH || "./uploads/competitions",
    process.env.USER_UPLOAD_PATH || "./uploads/users",
    process.env.GAMES_UPLOAD_PATH || "./uploads/games",
  ];

  directories.forEach((dir) => {
    const fullPath = path.resolve(dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(` Created upload directory: ${fullPath}`);
    }
  });
};

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      process.env.NODE_ENV === "development"
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "x-selected-branch",
    "x-selected-wallet",
    "x-requested-with",
    "x-file-type",
    "x-competition-id",
    "x-game-id",
  ],
  exposedHeaders: [
    "Content-Type",
    "Authorization",
    "x-selected-branch",
    "x-selected-wallet",
    "x-file-upload",
    "x-upload-limit",
    "x-game-version",
  ],
  optionsSuccessStatus: 200,
  maxAge: parseInt(process.env.CORS_MAX_AGE) || 86400,
};

app.use(cors(corsOptions));
app.use(trafficMonitor);

// Security headers
app.use((req, res, next) => {
  res.removeHeader("X-Powered-By");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );

  next();
});

// Body parsing
app.use(
  express.json({
    limit: process.env.BODY_LIMIT || "50mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(
  express.urlencoded({
    limit: process.env.BODY_LIMIT || "50mb",
    extended: true,
    parameterLimit: parseInt(process.env.BODY_PARAMETER_LIMIT) || 100000,
  })
);

// Serve static files in development
if (process.env.NODE_ENV === "development") {
  // Serve KYC documents
  app.use(
    "/uploads/kyc_documents",
    express.static(path.join(__dirname, "uploads/kyc_documents"), {
      setHeaders: (res, path) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Cache-Control", "private, max-age=86400");
      },
    })
  );

  // Serve competition uploads
  app.use(
    "/uploads/competitions",
    express.static(path.join(__dirname, "uploads/competitions"), {
      setHeaders: (res, path) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Cache-Control", "public, max-age=31536000");
      },
    })
  );

  // Serve user uploads
  app.use(
    "/uploads/users",
    express.static(path.join(__dirname, "uploads/users"), {
      setHeaders: (res, path) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Cache-Control", "public, max-age=31536000");
      },
    })
  );

  // Serve game uploads
  app.use(
    "/uploads/games",
    express.static(path.join(__dirname, "uploads/games"), {
      setHeaders: (res, path) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        // Content Security Policy for games
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; " +
            "font-src 'self' data:; " +
            "media-src 'self'"
        );
        res.setHeader("Cache-Control", "public, max-age=31536000");
      },
    })
  );
}

// Root endpoint
app.get("/", (req, res) => {
  res.redirect("/api");
});

// Admin UI (static shell; data endpoints remain protected by JWT)
app.use(
  "/admin-ui",
  express.static(path.join(__dirname, "admin-ui"), {
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-store");
      // No external resources; keep CSP strict but allow our inline SVG data URLs.
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"
      );
    },
  })
);

app.get("/admin/winners-circle", (req, res) => {
  res.redirect("/admin-ui/winners-circle.html");
});

app.get("/admin/faqs", (req, res) => {
  res.redirect("/admin-ui/faqs.html");
});

const initialize = async () => {
  try {
    await initializeSuperadmins(pool);
    console.log("✅ Server initialization complete");
  } catch (error) {
    console.error("❌ Server initialization failed:", error);
  }
};

// Health check endpoint
app.get("/health", async (req, res) => {
  const kycUploadPath = path.join(__dirname, "uploads/kyc_documents");
  const competitionUploadPath = path.join(__dirname, "uploads/competitions");
  const userUploadPath = path.join(__dirname, "uploads/users");
  const gamesUploadPath = path.join(__dirname, "uploads/games");

  let dbStatus = "unknown";
  try {
    const connection = await pool.getConnection();
    dbStatus = "connected";
    connection.release();
  } catch (error) {
    dbStatus = "disconnected";
  }

  const healthInfo = {
    success: true,
    message: "Server is running healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    appName: process.env.APP_NAME || "Community Fortune",
    version: process.env.APP_VERSION || "1.0.0",
    database: {
      status: dbStatus,
      name: process.env.DB_NAME || "community_fortune",
    },
    server: {
      uptime: `${process.uptime().toFixed(2)} seconds`,
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      uploads: {
        kyc: fs.existsSync(kycUploadPath) ? kycUploadPath : "Not configured",
        kyc: fs.existsSync(kycUploadPath) ? kycUploadPath : "Not configured",
        competitions: fs.existsSync(competitionUploadPath)
          ? competitionUploadPath
          : "Not configured",
        users: fs.existsSync(userUploadPath)
          ? userUploadPath
          : "Not configured",
        games: fs.existsSync(gamesUploadPath)
          ? gamesUploadPath
          : "Not configured",
      },
    },
    features: {
      kycUpload: true,
      competitionUpload: true,
      gameUpload: true,
      userUpload: true,
      maxFileSizes: {
        kyc: "5MB",
        competitionImages: "10MB",
        competitionVideos: "50MB",
        competitionDocuments: "20MB",
        userAvatars: "2MB",
        userAvatars: "2MB",
        gameZips: "100MB",
      },
      allowedFileTypes: {
        kyc: ["image/jpeg", "image/png", "application/pdf"],
        competitionImages: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
        ],
        competitionVideos: ["video/mp4", "video/mpeg", "video/quicktime"],
        competitionVideos: ["video/mp4", "video/mpeg", "video/quicktime"],
        competitionDocuments: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        games: ["application/zip", "application/x-zip-compressed"],
      },
      autoTableCreation: true,
      gameSystem: {
        zipExtraction: true,
        securityValidation: true,
        leaderboards: true,
        categories: true,
      },
    },
  };

  res.status(200).json(healthInfo);
});

// Development test endpoints
if (process.env.NODE_ENV === "development") {
  app.get("/kyc-upload-test", (req, res) => {
    res.json({
      success: true,
      message: "KYC upload endpoint is available",
      config: {
        maxFileSize: "5MB",
        allowedTypes: ["JPEG", "PNG", "PDF"],
        requiredFields: ["governmentId", "selfiePhoto"],
        endpoints: {
          register: "POST /api/users/register",
          verifyAge: "POST /api/users/verify-age",
        },
      },
    });
  });

  app.get("/competition-upload-test", (req, res) => {
    res.json({
      success: true,
      message: "Competition upload endpoints are available",
      config: {
        featuredUpload: {
          fields: ["featured_image", "featured_video", "banner_image"],
          maxImageSize: "10MB",
          maxVideoSize: "50MB",
          allowedImageTypes: ["JPEG", "PNG", "WebP", "GIF"],
          allowedVideoTypes: ["MP4", "MPEG", "MOV", "AVI", "WMV", "WebM"],
        },
        galleryUpload: {
          endpoint: "POST /api/competitions/:id/images",
          maxFiles: 10,
          maxFileSize: "10MB",
        },
        documentUpload: {
          endpoint: "POST /api/competitions/:id/documents",
          fields: [
            "terms_pdf",
            "rules_pdf",
            "winner_announcement_pdf",
            "prize_documentation",
          ],
          maxFileSize: "20MB",
        },
      },
    });
  });

  app.get("/game-upload-test", (req, res) => {
    res.json({
      success: true,
      message: "Game upload endpoints are available",
      config: {
        upload: {
          endpoint: "POST /api/games/upload",
          fieldName: "game_zip",
          maxFileSize: "100MB",
          allowedTypes: ["ZIP"],
          requiredFiles: ["index.html at root"],
          securityChecks: [
            "No external scripts",
            "No iframes",
            "No eval() calls",
            "No document.write",
          ],
        },
        categories: [
          "ARCADE",
          "PUZZLE",
          "ACTION",
          "STRATEGY",
          "CASUAL",
          "MULTIPLAYER",
          "EDUCATIONAL",
        ],
        difficultyLevels: ["EASY", "MEDIUM", "HARD"],
      },
      examples: {
        curlCommand:
          'curl -X POST http://localhost:4000/api/games/upload \\\n  -H "Authorization: Bearer YOUR_TOKEN" \\\n  -F "game_zip=@/path/to/game.zip" \\\n  -F "name=My Game" \\\n  -F "category=ARCADE"',
        embedding:
          '<iframe src="http://localhost:4000/uploads/games/game-id/index.html"></iframe>',
      },
    });
  });
}

// Error handling middleware
app.use(handleKycUploadError);
app.use(handleUploadError);

// API routes
app.use("/api", appRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      "GET /health - Server health check",
      "GET /api - API information",
      "GET /kyc-upload-test - KYC upload test (dev only)",
      "GET /competition-upload-test - Competition upload test (dev only)",
      "GET /game-upload-test - Game upload test (dev only)",
    ],
    note: "For full API endpoints, visit GET /api",
    gamesInfo: {
      playUrl: "/uploads/games/:game_id/index.html",
      requirements: "ZIP file with index.html at root",
    },
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("🚨 Server error:", {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
    files: req.files ? Object.keys(req.files) : "No files",
  });

  // CORS error
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS policy: Origin not allowed",
      allowedOrigins: allowedOrigins,
    });
  }

  // File upload errors
  if (err.code === "LIMIT_FILE_SIZE") {
    const maxSizes = {
      featured_image: "10MB",
      featured_video: "50MB",
      banner_image: "10MB",
      images: "10MB",
      terms_pdf: "20MB",
      rules_pdf: "20MB",
      governmentId: "5MB",
      selfiePhoto: "5MB",
      csv_file: "20MB",
      game_zip: "100MB",
    };

    const fieldName = err.field || "file";
    const maxSize = maxSizes[fieldName] || "5MB";

    return res.status(400).json({
      success: false,
      message: `File too large for field "${fieldName}". Maximum size allowed is ${maxSize}`,
      maxSize: maxSize,
      field: fieldName,
    });
  }

  if (err.code === "LIMIT_FILE_COUNT") {
    return res.status(400).json({
      success: false,
      message: "Too many files uploaded",
      maxFiles: err.field === "images" ? 10 : 1,
    });
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    const expectedFields = {
      kyc: ["governmentId", "selfiePhoto", "additionalDocuments"],
      competitionFeatured: ["featured_image", "featured_video", "banner_image"],
      competitionImages: ["images"],
      competitionDocuments: [
        "terms_pdf",
        "rules_pdf",
        "winner_announcement_pdf",
        "prize_documentation",
      ],
      games: ["game_zip"],
    };

    return res.status(400).json({
      success: false,
      message: "Unexpected field name for file upload",
      expectedFields: expectedFields,
      receivedField: err.field,
    });
  }

  // Game-specific errors
  if (err.message.includes("Game ZIP") || err.message.includes("index.html")) {
    return res.status(400).json({
      success: false,
      message: err.message,
      requirements: {
        format: "ZIP archive",
        requiredFile: "index.html at root",
        maxSize: "100MB",
        allowedTypes: "HTML, CSS, JS, images, fonts, audio",
      },
    });
  }

  if (err.message.includes("dangerous code")) {
    return res.status(400).json({
      success: false,
      message: "Game security validation failed",
      error: err.message,
      restrictions: [
        "No external scripts (must use relative paths)",
        "No iframes",
        "No eval() or document.write()",
        "No innerHTML/outerHTML assignments from user input",
      ],
    });
  }

  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      details: err.details || null,
    }),
  });
});

// Cleanup uploads on start if configured
if (
  process.env.NODE_ENV === "development" &&
  process.env.CLEANUP_UPLOADS_ON_START === "true"
) {
  const cleanupTempUploads = () => {
    const tempDirs = [
      path.join(__dirname, "uploads/kyc_documents/temp"),
      path.join(__dirname, "uploads/competitions/temp"),
      path.join(__dirname, "uploads/users/temp"),
      path.join(__dirname, "uploads/users/temp"),
      path.join(__dirname, "uploads/games/temp"),
    ];

    tempDirs.forEach((dir) => {
      if (fs.existsSync(dir)) {
        console.log(` Cleaning up temporary uploads: ${dir}`);
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  };

  cleanupTempUploads();
}

// Process handlers
process.on("SIGINT", async () => {
  console.log(" Server is shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log(" Server is shutting down gracefully...");
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start server
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";

const startServer = async () => {
  try {
    // Initialize upload directories
    initUploadDirectories();

    // Test database connection
    const connection = await pool.getConnection();
    console.log(" Database connected successfully");
    connection.release();

    // Create tables and insert initial data
    await createTables();

    // Check for required packages
    try {
      await import("jszip");
      console.log("✅ JSZip package available for game extraction");
    } catch (error) {
      console.warn(
        "⚠️ JSZip package not found. Install with: npm install jszip"
      );
    }
    // Start server
    app.listen(PORT, HOST, () => {
      console.log(`
       ${process.env.APP_NAME || "Community Fortune"} running successfully!
      Port: ${PORT}
      Host: ${HOST}
      Environment: ${process.env.NODE_ENV || "development"}
      Database: ${process.env.DB_NAME || "community_fortune"}
      Started: ${new Date().toISOString()}
      
      📡 Endpoints:
      Health check: http://${HOST}:${PORT}/health
      API Info: http://${HOST}:${PORT}/api
      📡 Endpoints:
      Health check: http://${HOST}:${PORT}/health
      API Info: http://${HOST}:${PORT}/api
      
      🎮 Game System:
      Upload: POST /api/games/upload
      Games URL: http://${HOST}:${PORT}/uploads/games/:game_id/index.html
      Max Game Size: 100MB
      
      📁 Upload Features:
      KYC: /uploads/kyc_documents/
      Competitions: /uploads/competitions/
      Games: /uploads/games/
      Users: /uploads/users/
      
      📏 File Limits:
      Competition Videos: ${
        parseInt(process.env.MAX_COMPETITION_VIDEO_SIZE) / (1024 * 1024)
      }MB
      Competition Images: ${
        parseInt(process.env.MAX_COMPETITION_IMAGE_SIZE) / (1024 * 1024)
      }MB
      Game ZIPs: 100MB
      `);
      initialize();
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

export default app;
