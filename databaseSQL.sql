DROP DATABASE IF EXISTS community_fortune;
CREATE DATABASE community_fortune;
USE community_fortune;

-- ===========================================
-- USERS TABLE - BINARY(16) UUIDs
-- ===========================================

 CREATE TABLE users (
    id BINARY(16) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    username VARCHAR(50) NOT NULL UNIQUE,
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
    is_active BOOLEAN DEFAULT TRUE,
    created_by BINARY(16),
    
    -- Security fields
    password_reset_token VARCHAR(100),
    password_reset_expires TIMESTAMP NULL,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    login_attempts INT DEFAULT 0,
    account_locked_until TIMESTAMP NULL,
    last_login TIMESTAMP NULL,
    permissions JSON NULL,
    
    -- Verification fields
    age_verified BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    verification_token VARCHAR(100),
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
    
    -- For soft delete functionality
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at DATETIME DEFAULT NULL,
    
    -- For suspension functionality
    is_suspended BOOLEAN DEFAULT FALSE,
    suspended_at DATETIME DEFAULT NULL,
    suspension_reason TEXT DEFAULT NULL,
    suspension_ends_at DATETIME DEFAULT NULL,
    
    FOREIGN KEY (referred_by) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ===========================================
-- USERS Activities TABLE - BINARY(16) UUIDs
-- ===========================================

 CREATE TABLE user_activities (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16),
    action VARCHAR(255) NOT NULL,
    target_id VARCHAR(255),
    module VARCHAR(100),
    ip_address VARCHAR(50),
    user_agent VARCHAR(255),
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_activities_user (user_id),
    INDEX idx_user_activities_module (module),
    INDEX idx_user_activities_action (action)
);

-- ===========================================
-- USER ACCOUNT SETTINGS (NOTIFICATIONS + PRIVACY)
-- ===========================================
CREATE TABLE IF NOT EXISTS user_account_settings (
    user_id BINARY(16) PRIMARY KEY,
    notify_instant_wins BOOLEAN DEFAULT TRUE,
    notify_new_competitions BOOLEAN DEFAULT TRUE,
    notify_wins BOOLEAN DEFAULT TRUE,
    notify_withdrawals BOOLEAN DEFAULT TRUE,
    newsletter BOOLEAN DEFAULT TRUE,
    show_my_wins_publicly BOOLEAN DEFAULT TRUE,
    show_my_profile_publicly BOOLEAN DEFAULT TRUE,
    show_my_activity_publicly BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_account_settings_user (user_id)
);

-- ===========================================
-- EMAIL VERIFICATION TOKENS TABLE - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE email_verification_tokens (
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
);

-- ===========================================
-- PASSWORD RESETS - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE password_resets (
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
);

-- ===========================================
-- KYC DOCUMENTS TABLE - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE kyc_documents (
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
);

-- ===========================================
-- KYC ADMIN REVIEW TABLE - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE kyc_reviews (
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
);

-- ===========================================
-- WALLET TABLES - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE wallets (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16),
    type ENUM('CASH', 'CREDIT') NOT NULL,
    balance DECIMAL(12,2) DEFAULT 0,
    universal_tickets INT DEFAULT 0,
    is_frozen BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_wallet (user_id, type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_wallets_user_id (user_id)
);
ALTER TABLE wallets MODIFY COLUMN type ENUM('CASH', 'CREDIT', 'POINTS', 'SITE_CREDIT') NOT NULL;
CREATE TABLE wallet_transactions (
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
);

CREATE TABLE wallet_actions (
    id BINARY(16) PRIMARY KEY,
    wallet_id BINARY(16) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
    INDEX idx_wallet_actions_wallet (wallet_id)
);

-- ===========================================
-- SPENDING LIMITS FOR RESPONSIBLE GAMING
-- ===========================================
CREATE TABLE spending_limits (
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
);

-- ===========================================
-- UPDATED COMPETITIONS TABLE WITH ALL NEW TYPES - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE competitions (
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
    
    gallery_images JSON NULL,
    rules_and_restrictions JSON NULL,
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
);
ALTER TABLE competitions
MODIFY featured_image VARCHAR(255) NULL,
MODIFY featured_video VARCHAR(255) NULL;

-- ===========================================
-- COMPETITION TYPE CONFIG TABLE - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE competition_type_config (
    id BINARY(16) PRIMARY KEY,
    competition_type VARCHAR(50) NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT,
    config_type ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ARRAY') DEFAULT 'STRING',
    is_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_type_config (competition_type, config_key),
    INDEX idx_competition_type_config_type (competition_type)
);

-- ===========================================
-- COMPETITION AUDIT TABLE - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE competition_audit (
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
);

-- ===========================================
-- COMPETITION ENTRIES TABLE - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE competition_entries (
    id BINARY(16) PRIMARY KEY,
    competition_id BINARY(16) NOT NULL,
    user_id BINARY(16),
    entry_type ENUM('PAID_TICKET', 'FREE_ENTRY', 'PAID_ENTRY') NOT NULL,
    purchase_id BINARY(16) NULL,
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
);

-- ===========================================
-- PURCHASES - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE purchases (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16),
    competition_id BINARY(16),
    status ENUM('PENDING', 'PAID', 'FAILED', 'CANCELLED') DEFAULT 'PENDING',
    payment_method ENUM('CASH_WALLET', 'CREDIT_WALLET', 'MIXED', 'CASHFLOWS', 'MASTERCARD', 'VISA','WALLET'),
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
);
ALTER TABLE purchases ADD COLUMN ticket_type VARCHAR(20) DEFAULT 'COMPETITION';
ALTER TABLE purchases ADD COLUMN quantity INT DEFAULT 1;
ALTER TABLE purchases ADD COLUMN external_payment DECIMAL(12,2) DEFAULT 0;
-- ===========================================
-- CREDIT PURCHASES
-- ===========================================
CREATE TABLE credit_purchases (
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
);

-- ===========================================
-- TICKETS SYSTEM - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE universal_tickets (
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
);

CREATE TABLE tickets (
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
);
ALTER TABLE tickets
  ADD COLUMN status VARCHAR(50) DEFAULT 'ACTIVE',
  ADD COLUMN price_paid DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN generated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
-- ===========================================
-- INSTANT WINS - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE instant_wins (
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
    
    probability DECIMAL(5,2) DEFAULT 0.00,
    claimed_by BINARY(16),
    claimed_at DATETIME,
    user_details JSON,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_instant_win (competition_id, ticket_number),
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (claimed_by) REFERENCES users(id),
    INDEX idx_instant_wins_competition (competition_id),
    INDEX idx_instant_wins_claimed_by (claimed_by),
    INDEX idx_instant_wins_ticket (ticket_number), 
    INDEX idx_instant_wins_prize_type (prize_type), 
    INDEX idx_instant_wins_status (claimed_by, current_winners, max_winners)
);

-- ===========================================
-- PHYSICAL PRIZE CLAIMS
-- ===========================================
CREATE TABLE physical_prize_claims (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16) NOT NULL,
    instant_win_id BINARY(16) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (instant_win_id) REFERENCES instant_wins(id) ON DELETE CASCADE,
    INDEX idx_physical_claims_user (user_id)
);

-- ===========================================
-- SPIN WHEEL SYSTEM - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE spin_wheels (
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
);

-- SPIN WHEEL SEGMENTS (Linked to Spin Wheel)
CREATE TABLE spin_wheel_segments (
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
);

-- ===========================================
-- SPIN PRIZES - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE spin_prizes (
    id BINARY(16) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type ENUM('POINTS', 'SITE_CREDIT', 'CASH', 'FREE_TICKETS') NOT NULL,
    value DECIMAL(12,2),
    drop_rate DECIMAL(5,2),
    stock INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_spin_prizes_type (type)
);

-- ===========================================
-- SPIN HISTORY
-- ===========================================
 CREATE TABLE spin_history (
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
);

-- ===========================================
-- BONUS SPINS
-- ===========================================
CREATE TABLE bonus_spins (
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
);

-- ===========================================
-- WINNERS - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE winners (
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
);

CREATE TABLE IF NOT EXISTS prize_distributions (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    winner_id BINARY(16) NOT NULL,
    prize_type ENUM('CASH', 'CREDIT', 'TICKETS', 'PHYSICAL', 'OTHER') NOT NULL,
    prize_value DECIMAL(12,2) DEFAULT 0,
    status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
    distributed_at TIMESTAMP NULL,
    method ENUM('AUTO', 'MANUAL') DEFAULT 'AUTO',
    transaction_id BINARY(16) NULL,
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (winner_id) REFERENCES winners(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    INDEX idx_prize_distributions_winner (winner_id),
    INDEX idx_prize_distributions_status (status),
    INDEX idx_prize_distributions_created_at (created_at)
);

-- 2. Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    user_id BINARY(16) NOT NULL,
    type ENUM('WINNER', 'DEPOSIT', 'WITHDRAWAL', 'KYC', 'REFERRAL', 'SYSTEM', 'MARKETING', 'COMPETITION') NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSON,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    sent_via ENUM('EMAIL', 'PUSH', 'IN_APP', 'SMS') DEFAULT 'IN_APP',
    scheduled_for TIMESTAMP NULL,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notifications_user (user_id),
    INDEX idx_notifications_type (type),
    INDEX idx_notifications_is_read (is_read),
    INDEX idx_notifications_created_at (created_at)
);

-- 3. Add missing columns to winners table
ALTER TABLE winners 
ADD COLUMN  verification_status ENUM('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED') DEFAULT 'PENDING',
ADD COLUMN admin_notes TEXT,
ADD COLUMN  verified_at TIMESTAMP NULL,
ADD COLUMN  verified_by BINARY(16) NULL,
ADD COLUMN  prize_value DECIMAL(12,2) DEFAULT 0;

-- 4. Update draw_method enum in winners table
ALTER TABLE winners 
MODIFY COLUMN draw_method ENUM('MANUAL', 'AUTO', 'RANDOM_DRAW', 'MANUAL_SELECTION', 'SKILL_BASED', 'FIRST_ENTRY', 'WEIGHTED_DRAW') DEFAULT 'MANUAL';

-- 5. Add indexes
CREATE INDEX  idx_winners_verification_status ON winners(verification_status);
ALTER TABLE winners ADD FOREIGN KEY  (verified_by) REFERENCES users(id) ON DELETE SET NULL;
-- ===========================================
-- COMPETITION ACHIEVEMENTS
-- ===========================================
CREATE TABLE competition_achievements (
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
);

-- ===========================================
-- SUBSCRIPTION SYSTEM TABLES - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE subscription_tiers (
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
);

CREATE TABLE user_subscriptions (
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
);

-- ===========================================
-- MINI-GAMES TABLES - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE mini_games (
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
);

-- ===========================================
-- GAMES SYSTEM
-- ===========================================
CREATE TABLE games (
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
);

CREATE TABLE game_categories (
    id BINARY(16) PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE game_plays (
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
);

CREATE TABLE mini_game_scores (
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
);

CREATE TABLE game_scores (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16) NOT NULL,
    game_id VARCHAR(50) NOT NULL,
    score INT NOT NULL,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_game (user_id, game_id),
    INDEX idx_game_score (game_id, score DESC)
);

-- ===========================================
-- DAILY GAME STATS
-- ===========================================
CREATE TABLE daily_game_stats (
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
);

-- ===========================================
-- DAILY REWARDS SYSTEM - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE user_streaks (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16) NOT NULL UNIQUE,
    current_streak INT DEFAULT 0,
    longest_streak INT DEFAULT 0,
    last_login_date DATE,
    total_logins INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_streaks_user (user_id)
);

CREATE TABLE daily_rewards_config (
    id BINARY(16) PRIMARY KEY,
    day_number INT UNIQUE NOT NULL,
    reward_type ENUM('POINTS', 'SITE_CREDIT', 'CASH', 'FREE_TICKETS') NOT NULL,
    reward_value DECIMAL(12,2) NOT NULL,
    streak_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_daily_rewards_config_day (day_number)
);

CREATE TABLE daily_rewards_claimed (
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
);

CREATE TABLE daily_login_points (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16) NOT NULL,
    login_date DATE NOT NULL,
    points_awarded INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_date (user_id, login_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===========================================
-- POINTS SYSTEM - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE user_points (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16) NOT NULL UNIQUE,
    total_points INT DEFAULT 0,
    earned_points INT DEFAULT 0,
    spent_points INT DEFAULT 0,
    redeemed_points INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_points_user (user_id)
);

CREATE TABLE points_history (
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
);

-- ===========================================
-- MISSIONS SYSTEM
-- ===========================================
CREATE TABLE missions (
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
);

CREATE TABLE user_missions (
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
);

CREATE TABLE referral_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  total_referral_amount DECIMAL(10,2) DEFAULT 4000.00,
  reward_per_referral DECIMAL(10,2) DEFAULT 5.00,
  alternative_reward DECIMAL(10,2) DEFAULT 100.00,
  condition_min_spend DECIMAL(10,2) DEFAULT 10.00,
  total_new_user_amount DECIMAL(10,2) DEFAULT 4000.00,
  onboarding_reward DECIMAL(10,2) DEFAULT 5.00,
  alternative_onboarding_reward DECIMAL(10,2) DEFAULT 100.00,
  reward_type ENUM('SITE_CREDIT', 'POINTS') DEFAULT 'SITE_CREDIT',
  amount_left DECIMAL(10,2) DEFAULT 2000.00,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by BINARY(16) REFERENCES users(id)
);

-- Referral Tiers
CREATE TABLE referral_tiers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL, -- Bronze, Silver, Gold, Platinum
  min_referrals INT NOT NULL,
  max_referrals INT,
  cash_reward DECIMAL(10,2) NOT NULL,
  points_reward INT NOT NULL,
  color VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Referral Links
CREATE TABLE referral_links (
  id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
  user_id BINARY(16) NOT NULL REFERENCES users(id),
  referral_code VARCHAR(50) UNIQUE NOT NULL,
  total_clicks INT DEFAULT 0,
  total_signups INT DEFAULT 0,
  total_successful INT DEFAULT 0,
  total_earned DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_referral_code (referral_code)
);

-- Referral Events
CREATE TABLE referral_events (
  id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
  referrer_id BINARY(16) REFERENCES users(id),
  referred_user_id BINARY(16) REFERENCES users(id),
  referral_link_id BINARY(16) REFERENCES referral_links(id),
  event_type ENUM('CLICK', 'SIGNUP', 'KYC_VERIFIED', 'SPEND_REQUIRED', 'REWARD_PENDING', 'REWARD_PAID', 'REWARD_FAILED'),
  amount DECIMAL(10,2),
  reward_type ENUM('CASH', 'SITE_CREDIT', 'POINTS'),
  status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'),
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_referrer_id (referrer_id),
  INDEX idx_referred_user_id (referred_user_id),
  INDEX idx_event_type (event_type),
  INDEX idx_created_at (created_at)
);

-- User Referral Stats
CREATE TABLE user_referral_stats (
  user_id BINARY(16) PRIMARY KEY REFERENCES users(id),
  current_tier_id INT REFERENCES referral_tiers(id),
  total_referrals INT DEFAULT 0,
  successful_referrals INT DEFAULT 0,
  total_earned DECIMAL(10,2) DEFAULT 0.00,
  this_month_earned DECIMAL(10,2) DEFAULT 0.00,
  last_reward_date TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create user_notes table for internal admin notes
CREATE TABLE user_notes (
  id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
  user_id BINARY(16) NOT NULL REFERENCES users(id),
  note_content TEXT NOT NULL,
  note_type ENUM('GENERAL', 'SUPPORT', 'WARNING', 'FLAG') DEFAULT 'GENERAL',
  is_important BOOLEAN DEFAULT FALSE,
  created_by BINARY(16) REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);



 CREATE TABLE verifications (
  id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
  user_id BINARY(16) NOT NULL REFERENCES users(id),
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED') DEFAULT 'PENDING',
  verification_type ENUM('KYC', 'AGE', 'ADDRESS') DEFAULT 'KYC',
  
  -- Document info - Match users.government_id_type enum
  document_type ENUM('passport', 'drivers_license', 'national_id') DEFAULT 'passport',
  document_number VARCHAR(100),
  
  -- Document references
  government_id_doc_id BINARY(16) NULL,
  selfie_doc_id BINARY(16) NULL,
  additional_doc_ids JSON NULL,
  
  -- User info
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  date_of_birth DATE,
  
  -- Government ID info
  government_id_type ENUM('passport', 'drivers_license', 'national_id'),
  government_id_number VARCHAR(50),
  
  -- File URLs
  document_front_url VARCHAR(500),
  document_back_url VARCHAR(500),
  selfie_url VARCHAR(500),
  
  -- Admin fields
  verified_by BINARY(16) REFERENCES users(id),
  verified_at TIMESTAMP NULL,
  rejected_reason TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);

-- ===========================================
-- USER LEVELS
-- ===========================================
CREATE TABLE user_levels (
    level INT PRIMARY KEY,
    level_name VARCHAR(100) NOT NULL,
    xp_required INT NOT NULL,
    perks JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- SOCIAL SHARING MODULE - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE share_events (
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
);

CREATE TABLE share_limits (
    id BINARY(16) PRIMARY KEY,
    platform ENUM('FACEBOOK', 'TWITTER', 'WHATSAPP', 'TELEGRAM', 'INSTAGRAM') NOT NULL,
    points_per_share INT NOT NULL DEFAULT 5,
    daily_limit INT NOT NULL DEFAULT 3,
    weekly_limit INT NOT NULL DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_platform (platform)
);

-- ===========================================
-- LEGAL MODULE - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE IF NOT EXISTS legal_documents (
  id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
  title VARCHAR(100) NOT NULL,
  type ENUM('TERMS', 'PRIVACY', 'COOKIE', 'RESPONSIBLE_PLAY', 'WEBSITE_TERMS', 'OTHER') NOT NULL,
  content LONGTEXT NOT NULL,
  version VARCHAR(20) DEFAULT '1.0',
  is_active BOOLEAN DEFAULT TRUE,
  effective_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(100),
  INDEX idx_legal_documents_type (type),
  INDEX idx_legal_documents_active (type, is_active)
);

CREATE TABLE user_consents (
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
);

-- ===========================================
-- ADMIN ACTIVITY - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE admin_activities (
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
);

-- ===========================================
-- PARTNER APPLICATIONS - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE partner_applications (
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
);

-- ===========================================
-- WITHDRAWALS - BINARY(16) UUIDs
-- ===========================================
CREATE TABLE withdrawals (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16lo),
    amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('REVOLT', 'STRIPE', 'BANK_TRANSFER', 'PAYPAL') NOT NULL,
    account_details JSON NOT NULL,
    paypal_email VARCHAR(255),
    bank_account_last_four VARCHAR(8),
    bank_name VARCHAR(100),
    status ENUM('PENDING', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'CANCELLED') DEFAULT 'PENDING',
    reason TEXT,
    admin_notes TEXT,
    admin_id BINARY(16),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_payment_method BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (admin_id) REFERENCES users(id),
    INDEX idx_withdrawals_user_id (user_id),
    INDEX idx_withdrawals_status (status),
    INDEX idx_withdrawals_requested_at (requested_at)
);

-- ===========================================
-- System alerts
-- ===========================================
CREATE TABLE system_alerts (
  id BINARY(16) PRIMARY KEY,
  type ENUM('INFO', 'WARNING', 'ERROR', 'CRITICAL') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  source VARCHAR(100),              -- SYSTEM, MONITOR, BACKUP, SECURITY
  is_read BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  dismissed_at DATETIME NULL
);

-- Create index for alerts
CREATE INDEX idx_alert_dedupe ON system_alerts (type, title, created_at);

-- ===========================================
-- REVENUE TABLES
-- ===========================================

 CREATE TABLE IF NOT EXISTS revenue_summary (
    id BINARY(16) PRIMARY KEY,
    date DATE NOT NULL,
    total_revenue DECIMAL(15, 2) DEFAULT 0.00,
    total_deposits DECIMAL(15, 2) DEFAULT 0.00,
    total_withdrawals DECIMAL(15, 2) DEFAULT 0.00,
    total_fees DECIMAL(15, 2) DEFAULT 0.00,
    total_commission DECIMAL(15, 2) DEFAULT 0.00,
    competition_revenue DECIMAL(15, 2) DEFAULT 0.00,
    subscription_revenue DECIMAL(15, 2) DEFAULT 0.00,
    instant_win_payouts DECIMAL(15, 2) DEFAULT 0.00,
    transaction_count INT DEFAULT 0,
    user_count INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_date (date),
    INDEX idx_revenue_summary_date (date)
);

-- ===========================================
-- CONTACT MESSAGES
-- ===========================================
CREATE TABLE IF NOT EXISTS contact_messages (
  id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') DEFAULT 'NEW',
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'MEDIUM',
  category ENUM('GENERAL', 'SUPPORT', 'TECHNICAL', 'BILLING', 'FEEDBACK', 'COMPLAINT', 'OTHER') DEFAULT 'GENERAL',
  admin_notes TEXT,
  assigned_to VARCHAR(100),
  response_sent BOOLEAN DEFAULT FALSE,
  response_message TEXT,
  response_sent_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_contact_status (status),
  INDEX idx_contact_email (email),
  INDEX idx_contact_created (created_at)
);

CREATE TABLE IF NOT EXISTS contact_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value TEXT,
  description VARCHAR(200),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default contact settings
INSERT IGNORE INTO contact_settings (setting_key, setting_value, description) VALUES
('company_name', 'Community Fortune Limited', 'Company name'),
('contact_email', 'contact@community-fortune.com', 'Primary contact email'),
('website_url', 'www.community-fortune.com', 'Company website'),
('address_line1', '194 Harrington Road', 'Address line 1'),
('address_line2', 'Workington, Cumbria', 'Address line 2'),
('address_line3', 'United Kingdom, CA14 3UJ', 'Address line 3'),
('support_email', 'support@community-fortune.com', 'Support email'),
('business_hours', 'Mon-Fri: 9:00 AM - 6:00 PM GMT', 'Business hours'),
('phone_number', '+44 1234 567890', 'Phone number'),
('response_time', '24-48 hours', 'Expected response time');


CREATE TABLE IF NOT EXISTS transactions (
    id BINARY(16) PRIMARY KEY,
    user_id BINARY(16),
    type ENUM('deposit', 'withdrawal', 'transfer', 'commission', 'bonus', 'fee', 'purchase', 'subscription', 'competition_entry', 'instant_win', 'referral_payout') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    status ENUM('pending', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    description TEXT,
    reference_table VARCHAR(50), 
    reference_id BINARY(16), 
    gateway VARCHAR(100),
    fee DECIMAL(15, 2) DEFAULT 0.00,
    net_amount DECIMAL(15, 2),
    admin_notes TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_transactions_user (user_id),
    INDEX idx_transactions_type (type),
    INDEX idx_transactions_status (status),
    INDEX idx_transactions_created (created_at),
    INDEX idx_transactions_reference (reference_table, reference_id)
);

-- ===========================================
-- FAQS (HOME + SUBSCRIPTION)
-- ===========================================
CREATE TABLE faqs (
    id BINARY(16) PRIMARY KEY,
    scope ENUM('HOME', 'SUBSCRIPTION') NOT NULL,
    question VARCHAR(500) NOT NULL,
    answer TEXT NOT NULL,
    is_published BOOLEAN DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_faqs_scope (scope),
    INDEX idx_faqs_scope_published (scope, is_published),
    INDEX idx_faqs_scope_sort (scope, sort_order)
);


-- Vouchers table
CREATE TABLE vouchers (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    code VARCHAR(32) NOT NULL UNIQUE,
    campaign_name VARCHAR(255) NOT NULL,
    voucher_type ENUM('SINGLE_USE', 'MULTI_USE', 'BULK_CODES') NOT NULL DEFAULT 'SINGLE_USE',
    reward_type ENUM('SITE_CREDIT', 'FREE_ENTRY', 'DISCOUNT_PERCENT', 'DISCOUNT_FIXED', 'POINTS', 'RAFFLE_TICKETS') NOT NULL DEFAULT 'SITE_CREDIT',
    reward_value DECIMAL(12, 2) NOT NULL,
    start_date DATETIME NOT NULL,
    expiry_date DATETIME NOT NULL,
    usage_limit INT NOT NULL DEFAULT 1,
    usage_count INT NOT NULL DEFAULT 0,
    code_prefix VARCHAR(32) NULL,
    bulk_quantity INT DEFAULT 0,
    bulk_code_length INT DEFAULT 8,
    bulk_codes_generated BOOLEAN DEFAULT FALSE,
    status ENUM('ACTIVE', 'EXPIRED', 'DISABLED', 'DELETED', 'USED_UP') DEFAULT 'ACTIVE',
    created_by BINARY(16) NULL, -- Admin/Superadmin who created it
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_code (code),
    INDEX idx_campaign (campaign_name),
    INDEX idx_voucher_type (voucher_type),
    INDEX idx_status (status),
    INDEX idx_dates (start_date, expiry_date),
    INDEX idx_created_by (created_by),
    
    -- Foreign key to users table (optional, if tracking who created)
    CONSTRAINT fk_voucher_created_by FOREIGN KEY (created_by) 
        REFERENCES users(id) ON DELETE SET NULL
);

-- Voucher usage tracking table
CREATE TABLE voucher_usage (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    voucher_id BINARY(16) NOT NULL,
    user_id BINARY(16) NOT NULL,
    transaction_id BINARY(16) NULL, -- Links to purchase/transaction
    used_amount DECIMAL(12, 2) NOT NULL, -- Actual amount used (may be less than reward_value)
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    
    -- Indexes
    INDEX idx_voucher_id (voucher_id),
    INDEX idx_user_id (user_id),
    INDEX idx_used_at (used_at),
    INDEX idx_transaction (transaction_id),
    
    -- Foreign keys
    CONSTRAINT fk_voucher_usage_voucher FOREIGN KEY (voucher_id) 
        REFERENCES vouchers(id) ON DELETE CASCADE,
    CONSTRAINT fk_voucher_usage_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_voucher_usage_transaction FOREIGN KEY (transaction_id) 
        REFERENCES transactions(id) ON DELETE SET NULL
);

-- Bulk voucher codes table (for BULK_CODES type)
CREATE TABLE bulk_voucher_codes (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    parent_voucher_id BINARY(16) NOT NULL,
    code VARCHAR(32) NOT NULL UNIQUE,
    status ENUM('ACTIVE', 'USED', 'EXPIRED', 'DISABLED') DEFAULT 'ACTIVE',
    used_by BINARY(16) NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_parent_voucher (parent_voucher_id),
    INDEX idx_code (code),
    INDEX idx_status (status),
    UNIQUE INDEX idx_voucher_code (parent_voucher_id, code),
    
    -- Foreign keys
    CONSTRAINT fk_bulk_voucher_parent FOREIGN KEY (parent_voucher_id) 
        REFERENCES vouchers(id) ON DELETE CASCADE,
    CONSTRAINT fk_bulk_voucher_user FOREIGN KEY (used_by) 
        REFERENCES users(id) ON DELETE SET NULL
);

-- Voucher redemption rules table
CREATE TABLE voucher_redemption_rules (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    voucher_id BINARY(16) NOT NULL,
    rule_type ENUM('MIN_PURCHASE', 'COMPETITION_TYPE', 'USER_TIER', 'TIME_RESTRICTION', 'USAGE_PER_USER') NOT NULL,
    rule_value TEXT NOT NULL, -- JSON or text value
    comparator ENUM('GREATER_THAN', 'LESS_THAN', 'EQUALS', 'INCLUDES', 'EXCLUDES') DEFAULT 'EQUALS',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_voucher_id (voucher_id),
    INDEX idx_rule_type (rule_type),
    
    -- Foreign key
    CONSTRAINT fk_redemption_rule_voucher FOREIGN KEY (voucher_id) 
        REFERENCES vouchers(id) ON DELETE CASCADE
);

-- Archive table for deleted vouchers
CREATE TABLE vouchers_archive (
    id BINARY(16) NOT NULL,
    code VARCHAR(32) NOT NULL,
    campaign_name VARCHAR(255) NOT NULL,
    voucher_type ENUM('SINGLE_USE', 'MULTI_USE', 'BULK_CODES') NOT NULL,
    reward_type ENUM('SITE_CREDIT', 'FREE_ENTRY', 'DISCOUNT_PERCENT', 'DISCOUNT_FIXED', 'POINTS', 'RAFFLE_TICKETS') NOT NULL,
    reward_value DECIMAL(12, 2) NOT NULL,
    start_date DATETIME NOT NULL,
    expiry_date DATETIME NOT NULL,
    usage_limit INT NOT NULL,
    usage_count INT NOT NULL,
    code_prefix VARCHAR(32) NULL,
    bulk_quantity INT DEFAULT 0,
    bulk_code_length INT DEFAULT 8,
    bulk_codes_generated BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) NOT NULL,
    created_by BINARY(16) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_by BINARY(16) NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delete_reason TEXT NULL,
    
    INDEX idx_deleted_at (deleted_at),
    INDEX idx_original_id (id)
);


-- 1. PAYMENTS TABLE (UPDATED VERSION)
CREATE TABLE IF NOT EXISTS payments (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    user_id BINARY(16) NOT NULL,
    type ENUM('TICKET', 'WITHDRAWAL', 'PRODUCT', 'GENERAL', 'SUBSCRIPTION', 'DEPOSIT', 'SITE_CREDIT') NOT NULL,
    reference_id BINARY(16) NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'GBP',
    status ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED') DEFAULT 'PENDING',
    gateway ENUM('PAYPAL', 'STRIPE', 'CREDIT_WALLET', 'CASH_WALLET', 'BANK_TRANSFER') NOT NULL,
    gateway_reference VARCHAR(255),
    gateway_capture_id VARCHAR(255),
    gateway_response JSON,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_payments_user_id (user_id),
    INDEX idx_payments_status (status),
    INDEX idx_payments_gateway_reference (gateway_reference),
    INDEX idx_payments_type (type),
    INDEX idx_payments_created_at (created_at),
    
    -- Foreign key
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- Payment requests table (missing from your schema)
CREATE TABLE IF NOT EXISTS payment_requests (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    user_id BINARY(16) NOT NULL,
    type ENUM('DEPOSIT', 'WITHDRAWAL', 'SUBSCRIPTION', 'TICKET') NOT NULL,
    gateway VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'GBP',
    fee_amount DECIMAL(10,2) DEFAULT 0.00,
    net_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    deposit_to_wallet VARCHAR(50),
    withdrawal_id BINARY(16),
    payment_method_id BINARY(16),
    requires_admin_approval BOOLEAN DEFAULT FALSE,
    gateway_order_id VARCHAR(200),
    gateway_payment_id VARCHAR(200),
    gateway_capture_id VARCHAR(200),
    gateway_response JSON,
    payment_id BINARY(16),
    admin_notes TEXT,
    retry_of BINARY(16),
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (withdrawal_id) REFERENCES withdrawals(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_method_id) REFERENCES user_payment_methods(id) ON DELETE SET NULL,
    FOREIGN KEY (retry_of) REFERENCES payment_requests(id) ON DELETE SET NULL,
    INDEX idx_payment_requests_user (user_id),
    INDEX idx_payment_requests_status (status),
    INDEX idx_payment_requests_type (type)
);

-- User payment methods table (missing from your schema)
CREATE TABLE IF NOT EXISTS user_payment_methods (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    user_id BINARY(16) NOT NULL,
    gateway VARCHAR(50) NOT NULL,
    method_type VARCHAR(50) NOT NULL,
    gateway_account_id VARCHAR(200),
    display_name VARCHAR(100),
    last_four VARCHAR(4),
    expiry_month INT,
    expiry_year INT,
    card_brand VARCHAR(50),
    bank_name VARCHAR(100),
    account_name VARCHAR(100),
    email VARCHAR(255),
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_payment_methods_user (user_id),
    INDEX idx_user_payment_methods_gateway (gateway),
    INDEX idx_user_payment_methods_active (is_active)
);
-- 2. REFUNDS TABLE
CREATE TABLE IF NOT EXISTS refunds (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    payment_id BINARY(16) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'GBP',
    reason TEXT,
    gateway_refund_id VARCHAR(255),
    status ENUM('PENDING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    
    -- Indexes
    INDEX idx_refunds_payment_id (payment_id),
    INDEX idx_refunds_status (status),
    
    -- Foreign key
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);

-- 3. UPDATE EXISTING PURCHASES TABLE TO LINK WITH PAYMENTS
ALTER TABLE purchases
ADD COLUMN payment_id BINARY(16) NULL AFTER id,
ADD FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
ADD INDEX idx_purchases_payment (payment_id);

-- 4. UPDATE EXISTING CREDIT_PURCHASES TABLE TO LINK WITH PAYMENTS
ALTER TABLE credit_purchases
ADD COLUMN payment_id BINARY(16) NULL AFTER id,
ADD FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
ADD INDEX idx_credit_purchases_payment (payment_id);

-- 5. UPDATE EXISTING WITHDRAWALS TABLE TO LINK WITH PAYMENTS
ALTER TABLE withdrawals
ADD COLUMN payment_id BINARY(16) NULL AFTER id,
ADD FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
ADD INDEX idx_withdrawals_payment (payment_id);

-- 6. UPDATE EXISTING USER_SUBSCRIPTIONS TABLE FOR PAYMENT LINKING
ALTER TABLE user_subscriptions
ADD COLUMN payment_id BINARY(16) NULL AFTER id,
ADD FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
ADD INDEX idx_user_subscriptions_payment (payment_id);


-- ===========================================
-- SYSTEM SETTINGS TABLE (ADD THIS)
-- ===========================================

 CREATE TABLE IF NOT EXISTS system_settings (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    description VARCHAR(500),
    setting_type ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ARRAY') DEFAULT 'STRING',
    category ENUM('MAINTENANCE', 'SECURITY', 'PAYMENT', 'NOTIFICATION', 'LEGAL', 'GENERAL', 'EMAIL', 'SYSTEM') DEFAULT 'GENERAL',
    is_public BOOLEAN DEFAULT FALSE,
    updated_by BINARY(16),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_system_settings_key (setting_key),
    INDEX idx_system_settings_category (category),
    INDEX idx_system_settings_public (is_public),
    
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ===========================================
-- PAYMENT GATEWAY SETTINGS TABLE (ADD THIS)
-- ===========================================

 CREATE TABLE IF NOT EXISTS payment_gateway_settings (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    gateway ENUM('PAYPAL', 'STRIPE', 'REVOLUT') NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    environment ENUM('SANDBOX', 'LIVE') NOT NULL DEFAULT 'SANDBOX',
    is_enabled BOOLEAN DEFAULT FALSE,
    
    -- Gateway-specific credentials
    client_id VARCHAR(500),
    client_secret VARCHAR(500),
    api_key VARCHAR(500),
    webhook_secret VARCHAR(500),
    public_key VARCHAR(500),
    private_key VARCHAR(500),
    
    -- Transaction limits
    min_deposit DECIMAL(12,2) DEFAULT 1.00,
    max_deposit DECIMAL(12,2) DEFAULT 5000.00,
    min_withdrawal DECIMAL(12,2) DEFAULT 5.00,
    max_withdrawal DECIMAL(12,2) DEFAULT 10000.00,
    
    -- Processing settings
    processing_fee_percent DECIMAL(5,2) DEFAULT 0.00,
    fixed_fee DECIMAL(12,2) DEFAULT 0.00,
    settlement_days INT DEFAULT 2,
    allowed_countries JSON,
    restricted_countries JSON,
    
    -- Display settings
    logo_url VARCHAR(500),
    sort_order INT DEFAULT 0,
    is_default BOOLEAN DEFAULT FALSE,
    
    -- Status tracking
    last_test_success TIMESTAMP NULL,
    last_live_success TIMESTAMP NULL,
    error_message TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by BINARY(16),
    
    INDEX idx_gateway_settings_gateway (gateway),
    INDEX idx_gateway_settings_enabled (is_enabled),
    INDEX idx_gateway_settings_environment (environment),
    UNIQUE KEY unique_gateway_env (gateway, environment),
    
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ===========================================
-- FIX EXISTING TABLES
-- ===========================================
-- Fix withdrawals table typo
ALTER TABLE withdrawals 
CHANGE COLUMN user_id user_id BINARY(16) NOT NULL;

ALTER TABLE community_fortune.payment_gateway_settings
ADD COLUMN  secret_key VARCHAR(255) DEFAULT NULL;
-- ===========================================
-- INSERT DEFAULT SETTINGS
-- ===========================================
-- Insert initial system settings
INSERT IGNORE INTO system_settings (setting_key, setting_value, description, category) VALUES
-- Maintenance settings
('maintenance_mode', 'false', 'Maintenance mode status', 'MAINTENANCE'),
('maintenance_allowed_ips', '[]', 'Allowed IPs during maintenance', 'MAINTENANCE'),
('maintenance_message', 'System is under maintenance. Please try again later.', 'Maintenance message', 'MAINTENANCE'),
('maintenance_estimated_duration', '2 hours', 'Estimated maintenance duration', 'MAINTENANCE'),

-- Payment settings
('payment_enabled_methods', '["credit_debit_card", "paypal", "bank_transfer", "revolut"]', 'Enabled payment methods', 'PAYMENT'),

-- Transaction limits
('transaction_limit_min_deposit', '10.00', 'Minimum deposit amount', 'PAYMENT'),
('transaction_limit_max_deposit', '10000.00', 'Maximum deposit amount', 'PAYMENT'),
('transaction_limit_min_withdrawal', '20.00', 'Minimum withdrawal amount', 'PAYMENT'),
('transaction_limit_max_withdrawal', '5000.00', 'Maximum withdrawal amount', 'PAYMENT'),
('transaction_limit_daily_deposit_limit', '5000.00', 'Daily deposit limit', 'PAYMENT'),
('transaction_limit_daily_withdrawal_limit', '2000.00', 'Daily withdrawal limit', 'PAYMENT'),

-- Security settings
('security_admin_session_timeout', '30', 'Admin session timeout in minutes', 'SECURITY'),
('security_enable_captcha_failed_attempts', 'true', 'Enable CAPTCHA after failed attempts', 'SECURITY'),
('security_failed_attempts_threshold', '5', 'Failed login attempts threshold', 'SECURITY'),
('security_lock_account_minutes', '30', 'Account lock duration in minutes', 'SECURITY'),
('security_two_factor_enabled', 'false', 'Enable two-factor authentication', 'SECURITY'),
('security_password_min_length', '8', 'Minimum password length', 'SECURITY'),
('security_password_require_special', 'true', 'Require special characters in password', 'SECURITY'),

-- Notification settings
('notification_user_welcome_email', 'true', 'User notification: welcome email', 'NOTIFICATION'),
('notification_user_competition_entry_confirmation', 'true', 'User notification: competition entry confirmation', 'NOTIFICATION'),
('notification_user_winner_notification', 'true', 'User notification: winner notification', 'NOTIFICATION'),
('notification_user_marketing_emails', 'false', 'User notification: marketing emails', 'NOTIFICATION'),
('notification_user_deposit_notification', 'true', 'User notification: deposit notification', 'NOTIFICATION'),
('notification_user_withdrawal_notification', 'true', 'User notification: withdrawal notification', 'NOTIFICATION'),
('notification_user_kyc_status_update', 'true', 'User notification: KYC status update', 'NOTIFICATION'),
('notification_user_referral_reward', 'true', 'User notification: referral reward', 'NOTIFICATION'),
('notification_user_password_reset', 'true', 'User notification: password reset', 'NOTIFICATION'),
('notification_user_otp', 'true', 'User notification: otp', 'NOTIFICATION'),

-- Email templates
('email_template_welcome_subject', 'Welcome to Community Fortune!', 'Welcome email subject', 'EMAIL'),
('email_template_welcome_body', 'Welcome {{username}}! Thank you for joining our community.', 'Welcome email body', 'EMAIL'),
('email_template_winner_subject', 'Congratulations! You Won!', 'Winner email subject', 'EMAIL'),
('email_template_winner_body', 'Congratulations {{username}}! You won {{prize}} in {{competition}}.', 'Winner email body', 'EMAIL'),

-- Age verification
('age_verification_required', 'true', 'Require age verification (18+)', 'LEGAL'),

-- System settings
('site_name', 'Community Fortune', 'Site name', 'SYSTEM'),
('site_url', 'https://community-fortune.com', 'Site URL', 'SYSTEM'),
('support_email', 'support@community-fortune.com', 'Support email', 'SYSTEM'),
('default_currency', 'GBP', 'Default currency', 'SYSTEM'),
('timezone', 'UTC', 'System timezone', 'SYSTEM'),
('date_format', 'YYYY-MM-DD', 'Date format', 'SYSTEM'),
('items_per_page', '20', 'Items per page', 'SYSTEM'),
('enable_registration', 'true', 'Enable user registration', 'SYSTEM'),
('enable_email_verification', 'true', 'Enable email verification', 'SYSTEM'),
('enable_kyc_verification', 'true', 'Enable KYC verification', 'SYSTEM'),
('referral_enabled', 'true', 'Enable referral system', 'SYSTEM'),
('social_sharing_enabled', 'true', 'Enable social sharing', 'SYSTEM'),
('game_leaderboard_enabled', 'true', 'Enable game leaderboard', 'SYSTEM');

-- Insert default payment gateway settings
INSERT IGNORE INTO payment_gateway_settings 
(id, gateway, display_name, environment, is_enabled, sort_order, is_default, min_deposit, max_deposit, min_withdrawal, max_withdrawal) VALUES
-- PayPal
(UUID_TO_BIN(UUID()), 'PAYPAL', 'PayPal', 'SANDBOX', TRUE, 1, TRUE, 1.00, 5000.00, 5.00, 10000.00),
(UUID_TO_BIN(UUID()), 'PAYPAL', 'PayPal', 'LIVE', FALSE, 1, TRUE, 1.00, 5000.00, 5.00, 10000.00),
-- Stripe (Credit/Debit Cards)
(UUID_TO_BIN(UUID()), 'STRIPE', 'Credit/Debit Cards (Visa, Mastercard, Amex)', 'SANDBOX', TRUE, 2, FALSE, 1.00, 5000.00, 5.00, 10000.00),
(UUID_TO_BIN(UUID()), 'STRIPE', 'Credit/Debit Cards (Visa, Mastercard, Amex)', 'LIVE', FALSE, 2, FALSE, 1.00, 5000.00, 5.00, 10000.00),
-- Revolut
(UUID_TO_BIN(UUID()), 'REVOLUT', 'Revolut', 'SANDBOX', TRUE, 3, FALSE, 1.00, 5000.00, 5.00, 10000.00),
(UUID_TO_BIN(UUID()), 'REVOLUT', 'Revolut', 'LIVE', FALSE, 3, FALSE, 1.00, 5000.00, 5.00, 10000.00),
-- Bank Transfer
(UUID_TO_BIN(UUID()), 'BANK_TRANSFER', 'Bank Transfer', 'LIVE', TRUE, 4, FALSE, 10.00, 10000.00, 20.00, 5000.00);
-- 11. UPDATE TRANSACTIONS TABLE TO LINK WITH PAYMENTS
ALTER TABLE transactions
ADD COLUMN payment_id BINARY(16) NULL AFTER reference_id,
ADD FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
ADD INDEX idx_transactions_payment (payment_id);

ALTER TABLE admin_activities
ADD COLUMN details JSON NULL;


-- 12. ADD PAYMENT COLUMN TO VOUCHER_USAGE
ALTER TABLE voucher_usage
ADD COLUMN payment_id BINARY(16) NULL AFTER transaction_id,
ADD FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
ADD INDEX idx_voucher_usage_payment (payment_id);
-- Create triggers
DELIMITER //

-- Trigger to archive deleted vouchers
CREATE TRIGGER before_voucher_delete
BEFORE DELETE ON vouchers
FOR EACH ROW
BEGIN
    INSERT INTO vouchers_archive (
        id, code, campaign_name, voucher_type, reward_type, reward_value,
        start_date, expiry_date, usage_limit, usage_count, code_prefix,
        bulk_quantity, bulk_code_length, bulk_codes_generated, status,
        created_by, created_at, updated_at, deleted_by, delete_reason
    ) VALUES (
        OLD.id, OLD.code, OLD.campaign_name, OLD.voucher_type, OLD.reward_type, OLD.reward_value,
        OLD.start_date, OLD.expiry_date, OLD.usage_limit, OLD.usage_count, OLD.code_prefix,
        OLD.bulk_quantity, OLD.bulk_code_length, OLD.bulk_codes_generated, OLD.status,
        OLD.created_by, OLD.created_at, OLD.updated_at, 
        @current_user_id, -- Set this before delete
        @delete_reason    -- Set this before delete
    );
END //

-- Trigger to auto-generate bulk codes
CREATE TRIGGER after_voucher_insert
AFTER INSERT ON vouchers
FOR EACH ROW
BEGIN
    IF NEW.voucher_type = 'BULK_CODES' AND NEW.bulk_quantity > 0 AND NEW.bulk_codes_generated = FALSE THEN
        -- Call stored procedure to generate bulk codes
        CALL generate_bulk_voucher_codes(NEW.id, NEW.bulk_quantity, NEW.bulk_code_length, NEW.code_prefix);
        
        -- Update the flag
        UPDATE vouchers SET bulk_codes_generated = TRUE WHERE id = NEW.id;
    END IF;
END //

-- Trigger to update voucher status based on usage
CREATE TRIGGER after_voucher_usage_insert
AFTER INSERT ON voucher_usage
FOR EACH ROW
BEGIN
    UPDATE vouchers 
    SET usage_count = usage_count + 1
    WHERE id = NEW.voucher_id;
    
    -- Update status if usage limit reached
    UPDATE vouchers 
    SET status = 'USED_UP'
    WHERE id = NEW.voucher_id 
      AND usage_count >= usage_limit 
      AND status = 'ACTIVE';
END //



-- Stored procedure to generate bulk codes
DELIMITER //

CREATE PROCEDURE generate_bulk_voucher_codes(
    IN p_voucher_id BINARY(16),
    IN p_quantity INT,
    IN p_code_length INT,
    IN p_prefix VARCHAR(32)
)
BEGIN
    DECLARE counter INT DEFAULT 0;
    DECLARE generated_code VARCHAR(32);
    
    WHILE counter < p_quantity DO
        -- Generate random code
        SET generated_code = generate_voucher_code(p_code_length);
        
        -- Add prefix if provided
        IF p_prefix IS NOT NULL AND p_prefix != '' THEN
            SET generated_code = CONCAT(p_prefix, generated_code);
        END IF;
        
        -- Ensure unique code
        WHILE EXISTS (SELECT 1 FROM bulk_voucher_codes WHERE code = generated_code) 
              OR EXISTS (SELECT 1 FROM vouchers WHERE code = generated_code) DO
            SET generated_code = generate_voucher_code(p_code_length);
            IF p_prefix IS NOT NULL AND p_prefix != '' THEN
                SET generated_code = CONCAT(p_prefix, generated_code);
            END IF;
        END WHILE;
        
        -- Insert the bulk code
        INSERT INTO bulk_voucher_codes (parent_voucher_id, code)
        VALUES (p_voucher_id, generated_code);
        
        SET counter = counter + 1;
    END WHILE;
END //

-- Function to generate random voucher code
CREATE FUNCTION generate_voucher_code(length INT) RETURNS VARCHAR(32)
DETERMINISTIC
BEGIN
    DECLARE chars VARCHAR(62) DEFAULT 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz';
    DECLARE result VARCHAR(32) DEFAULT '';
    DECLARE i INT DEFAULT 0;
    
    WHILE i < length DO
        SET result = CONCAT(result, SUBSTRING(chars, FLOOR(1 + RAND() * 62), 1));
        SET i = i + 1;
    END WHILE;
    
    RETURN result;
END //

DELIMITER ;

-- Views for easier querying

-- Active vouchers view
CREATE VIEW active_vouchers AS
SELECT 
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
WHERE v.status = 'ACTIVE';

-- Voucher usage statistics view
CREATE VIEW voucher_statistics AS
SELECT 
    BIN_TO_UUID(v.id) as voucher_id,
    v.code,
    v.campaign_name,
    v.reward_type,
    v.reward_value,
    v.usage_limit,
    v.usage_count,
    COUNT(DISTINCT vu.user_id) as unique_users,
    COALESCE(SUM(vu.used_amount), 0) as total_redeemed_value,
    MIN(vu.used_at) as first_redemption,
    MAX(vu.used_at) as last_redemption
FROM vouchers v
LEFT JOIN voucher_usage vu ON v.id = vu.voucher_id
GROUP BY v.id;

-- Bulk codes availability view
CREATE VIEW bulk_codes_availability AS
SELECT 
    BIN_TO_UUID(bvc.parent_voucher_id) as voucher_id,
    v.campaign_name,
    COUNT(bvc.id) as total_codes,
    SUM(CASE WHEN bvc.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_codes,
    SUM(CASE WHEN bvc.status = 'USED' THEN 1 ELSE 0 END) as used_codes,
    BIN_TO_UUID(v.created_by) as created_by
FROM bulk_voucher_codes bvc
JOIN vouchers v ON bvc.parent_voucher_id = v.id
WHERE v.voucher_type = 'BULK_CODES'
GROUP BY bvc.parent_voucher_id;

CREATE TABLE voucher_codes (
    id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
    voucher_id BINARY(16) NOT NULL,
    code VARCHAR(32) NOT NULL UNIQUE,
    status ENUM('ACTIVE', 'USED', 'EXPIRED', 'DISABLED') DEFAULT 'ACTIVE',
    used_by BINARY(16) NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_voucher_id (voucher_id),
    INDEX idx_code (code),
    INDEX idx_status (status),
    
    CONSTRAINT fk_voucher_codes_voucher FOREIGN KEY (voucher_id) 
        REFERENCES vouchers(id) ON DELETE CASCADE
);
------
-- Update the kyc_reviews table ENUM values
ALTER TABLE kyc_reviews 
MODIFY COLUMN old_status ENUM('PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW'),
MODIFY COLUMN new_status ENUM('PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW');
-- ===========================================
-- GAME CATEGORIES (Moved to end to avoid reference issues)
-- ===========================================
-- Insert game categories (using static UUIDs for consistency)
INSERT IGNORE INTO game_categories (id, name, description, sort_order) VALUES
(UNHEX(REPLACE('11111111-1111-1111-1111-111111111111', '-', '')), 'ARCADE', 'Classic arcade-style games', 1),
(UNHEX(REPLACE('22222222-2222-2222-2222-222222222222', '-', '')), 'PUZZLE', 'Brain teasers and puzzles', 2),
(UNHEX(REPLACE('33333333-3333-3333-3333-333333333333', '-', '')), 'ACTION', 'Fast-paced action games', 3),
(UNHEX(REPLACE('44444444-4444-4444-4444-444444444444', '-', '')), 'STRATEGY', 'Strategic thinking games', 4),
(UNHEX(REPLACE('55555555-5555-5555-5555-555555555555', '-', '')), 'CASUAL', 'Simple and relaxing games', 5),
(UNHEX(REPLACE('66666666-6666-6666-6666-666666666666', '-', '')), 'MULTIPLAYER', 'Games for multiple players', 6),
(UNHEX(REPLACE('77777777-7777-7777-7777-777777777777', '-', '')), 'EDUCATIONAL', 'Learning and educational games', 7);

ALTER TABLE referral_settings ADD UNIQUE KEY (is_active);


DROP TRIGGER IF EXISTS before_legal_documents_insert;
DROP TRIGGER IF EXISTS before_legal_documents_update;
-- ===========================================
-- TRIGGERS AND PROCEDURES (Execute separately)
-- ===========================================

-- First, create the function
DELIMITER //

CREATE FUNCTION generate_referral_code(base_string VARCHAR(255))
RETURNS VARCHAR(50)
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE clean_string VARCHAR(255);
    DECLARE random_suffix VARCHAR(10);
    
    SET clean_string = UPPER(REGEXP_REPLACE(base_string, '[^a-zA-Z0-9]', ''));
    IF LENGTH(clean_string) = 0 THEN
        SET clean_string = 'USER';
    END IF;
    SET clean_string = SUBSTRING(clean_string, 1, 6);
    
    SET random_suffix = LPAD(FLOOR(RAND() * 10000), 4, '0');
    
    RETURN CONCAT(clean_string, random_suffix);
END //

DELIMITER ;

-- Now create the trigger
DELIMITER //

CREATE TRIGGER after_user_insert
AFTER INSERT ON users
FOR EACH ROW
BEGIN
    -- Create spending limits record
    INSERT INTO spending_limits (id, user_id) VALUES (UUID_TO_BIN(UUID()), NEW.id);
    
    -- Note: The referral code update and other record creations should be handled
    -- in your application code, not in triggers, to avoid circular dependencies
END //

DELIMITER ;

-- Create procedure for updating user referral code
DELIMITER //

CREATE PROCEDURE update_user_referral_code(
    IN p_user_id BINARY(16),
    IN p_referral_code VARCHAR(50)
)
BEGIN
    UPDATE users 
    SET referral_code = p_referral_code 
    WHERE id = p_user_id;
END //

DELIMITER ;

-- Now create the legal documents triggers separately
DELIMITER //

CREATE TRIGGER before_legal_documents_insert
BEFORE INSERT ON legal_documents
FOR EACH ROW
BEGIN
    IF NEW.is_active = TRUE THEN
        UPDATE legal_documents 
        SET is_active = FALSE 
        WHERE type = NEW.type AND is_active = TRUE;
    END IF;
END //

CREATE TRIGGER before_legal_documents_update
BEFORE UPDATE ON legal_documents
FOR EACH ROW
BEGIN
    IF NEW.is_active = TRUE AND OLD.is_active = FALSE THEN
        UPDATE legal_documents 
        SET is_active = FALSE 
        WHERE type = NEW.type AND is_active = TRUE AND id != NEW.id;
    END IF;
END //

DELIMITER ;

-- ===========================================
-- END SCHEMA
-- ===========================================