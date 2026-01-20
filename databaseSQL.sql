CREATE DATABASE IF NOT EXISTS community_fortune;
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
);

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
    
    -- Statusz
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);


-- CREATE TABLE wheel_segments (
--     id BINARY(16) PRIMARY KEY,
--     competition_id BINARY(16) NOT NULL,
--     segment_index INT NOT NULL,
--     label VARCHAR(255) NOT NULL,
--     prize_type ENUM('POINTS', 'SITE_CREDIT', 'CASH', 'FREE_TICKETS', 'NO_WIN', 'BONUS_SPIN', 'FREE_ENTRY') NOT NULL,
--     amount DECIMAL(12,2),
--     color VARCHAR(7) DEFAULT '#FFFFFF',
--     probability DECIMAL(5,2) NOT NULL,
--     image_url VARCHAR(500),
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
--     UNIQUE KEY unique_segment (competition_id, segment_index),
--     INDEX idx_wheel_segments_competition (competition_id)
-- );

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

-- Create verifications table
CREATE TABLE verifications (
  id BINARY(16) PRIMARY KEY DEFAULT (UUID_TO_BIN(UUID())),
  user_id BINARY(16) NOT NULL REFERENCES users(id),
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED') DEFAULT 'PENDING',
  verification_type ENUM('KYC', 'AGE', 'ADDRESS') DEFAULT 'KYC',
  document_type ENUM('PASSPORT', 'DRIVING_LICENSE', 'ID_CARD', 'UTILITY_BILL') DEFAULT 'PASSPORT',
  document_number VARCHAR(100),
  document_front_url VARCHAR(500),
  document_back_url VARCHAR(500),
  selfie_url VARCHAR(500),
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
-- First, backup your data if needed
-- Final table structure
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

-- Triggers for managing active documents
DELIMITER $$

DROP TRIGGER IF EXISTS before_legal_documents_insert;
CREATE TRIGGER before_legal_documents_insert
BEFORE INSERT ON legal_documents
FOR EACH ROW
BEGIN
    IF NEW.is_active = TRUE THEN
        UPDATE legal_documents 
        SET is_active = FALSE 
        WHERE type = NEW.type AND is_active = TRUE;
    END IF;
END$$

DROP TRIGGER IF EXISTS before_legal_documents_update;
CREATE TRIGGER before_legal_documents_update
BEFORE UPDATE ON legal_documents
FOR EACH ROW
BEGIN
    IF NEW.is_active = TRUE AND OLD.is_active = FALSE THEN
        UPDATE legal_documents 
        SET is_active = FALSE 
        WHERE type = NEW.type AND is_active = TRUE AND id != NEW.id;
    END IF;
END$$

DELIMITER ;

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
    user_id BINARY(16),
    amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('MASTERCARD', 'VISA', 'BANK_TRANSFER', 'PAYPAL') NOT NULL,
    account_details JSON NOT NULL,
    paypal_email VARCHAR(255),
    bank_account_last_four VARCHAR(8),
    bank_name VARCHAR(100),
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
);

-- ===========================================
-- KYC ADMIN REVIEW TABLE - BINARY(16) UUIDs
-- ===========================================

-- ===========================================
-- System alts
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


-- Check if we need to add any missing revenue-related tables

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
-- Update contact_messages table (remove subject column)
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
INSERT INTO contact_settings (setting_key, setting_value, description) VALUES
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
-- Add a transactions table for better revenue tracking
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

ALTER TABLE withdrawals ADD COLUMN is_payment_method BOOLEAN DEFAULT FALSE;


CREATE INDEX idx_alert_dedupe 
ON system_alerts (type, title, created_at);

-- For soft delete functionality
ALTER TABLE users 
ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN deleted_at DATETIME DEFAULT NULL;

-- For suspension functionality
ALTER TABLE users 
ADD COLUMN is_suspended BOOLEAN DEFAULT FALSE,
ADD COLUMN suspended_at DATETIME DEFAULT NULL,
ADD COLUMN suspension_reason TEXT DEFAULT NULL,
ADD COLUMN suspension_ends_at DATETIME DEFAULT NULL;



-- Insert referral tiers
-- INSERT IGNORE INTO referral_tiers (id, tier_level, tier_name, min_referrals, reward_type, reward_value, perks) VALUES
-- (UUID_TO_BIN(UUID()), 1, 'Starter', 0, 'CREDIT', 10.00, '{"bonus": "10% extra credit on referrals"}'),
-- (UUID_TO_BIN(UUID()), 2, 'Ambassador', 5, 'CREDIT', 25.00, '{"bonus": "15% extra credit on referrals", "badge": "Ambassador"}'),
-- (UUID_TO_BIN(UUID()), 3, 'Champion', 15, 'CASH', 50.00, '{"bonus": "20% extra credit on referrals", "badge": "Champion", "priority_support": true}'),
-- (UUID_TO_BIN(UUID()), 4, 'Elite', 30, 'CASH', 100.00, '{"bonus": "25% extra credit on referrals", "badge": "Elite", "priority_support": true, "early_access": true}');

-- Insert user levels
-- INSERT IGNORE INTO user_levels (level, level_name, xp_required, perks) VALUES
-- (1, 'Beginner', 0, '{"credit": 0, "discount": 0, "tickets": 0, "description": "Welcome to Community Fortune!"}'),
-- (2, 'Explorer', 1000, '{"credit": 25, "discount": 5, "tickets": 1, "description": "5% discount on all purchases"}'),
-- (3, 'Regular', 5000, '{"credit": 50, "discount": 10, "tickets": 2, "description": "10% discount + extra tickets"}'),
-- (4, 'Enthusiast', 15000, '{"credit": 100, "discount": 15, "tickets": 5, "description": "15% discount + bonus credits"}'),
-- (5, 'VIP', 30000, '{"credit": 200, "discount": 20, "tickets": 10, "description": "20% discount + VIP rewards"}'),
-- (6, 'Elite', 60000, '{"credit": 500, "discount": 25, "tickets": 20, "description": "25% discount + Elite status"}');

-- Insert daily rewards config
-- INSERT IGNORE INTO daily_rewards_config (id, day_number, reward_type, reward_value, streak_required) VALUES
-- (UUID_TO_BIN(UUID()), 1, 'POINTS', 10, FALSE),
-- (UUID_TO_BIN(UUID()), 2, 'POINTS', 15, FALSE),
-- (UUID_TO_BIN(UUID()), 3, 'SITE_CREDIT', 5.00, FALSE),
-- (UUID_TO_BIN(UUID()), 4, 'POINTS', 20, FALSE),
-- (UUID_TO_BIN(UUID()), 5, 'FREE_TICKETS', 1, FALSE),
-- (UUID_TO_BIN(UUID()), 6, 'SITE_CREDIT', 10.00, FALSE),
-- (UUID_TO_BIN(UUID()), 7, 'CASH', 2.00, TRUE);

-- Insert share limits
-- INSERT IGNORE INTO share_limits (id, platform, points_per_share, daily_limit, weekly_limit) VALUES
-- (UUID_TO_BIN(UUID()), 'FACEBOOK', 5, 3, 10),
-- (UUID_TO_BIN(UUID()), 'TWITTER', 5, 3, 10),
-- (UUID_TO_BIN(UUID()), 'WHATSAPP', 5, 3, 10),
-- (UUID_TO_BIN(UUID()), 'TELEGRAM', 5, 3, 10),
-- (UUID_TO_BIN(UUID()), 'INSTAGRAM', 5, 3, 10);

-- Insert legal documents
-- INSERT IGNORE INTO legal_documents (id, type, content, version, effective_date) VALUES
-- (UUID_TO_BIN(UUID()), 'TERMS', 'Terms and conditions content...', 1, CURDATE()),
-- (UUID_TO_BIN(UUID()), 'PRIVACY', 'Privacy policy content...', 1, CURDATE()),
-- (UUID_TO_BIN(UUID()), 'RESPONSIBLE_PLAY', 'Responsible play guidelines...', 1, CURDATE());

-- Insert spin prizes
-- INSERT IGNORE INTO spin_prizes (id, name, type, value, drop_rate, stock) VALUES
-- (UUID_TO_BIN(UUID()), '10 Points', 'POINTS', 10, 30.00, NULL),
-- (UUID_TO_BIN(UUID()), '25 Points', 'POINTS', 25, 20.00, NULL),
-- (UUID_TO_BIN(UUID()), '£2 Credit', 'SITE_CREDIT', 2.00, 15.00, NULL),
-- (UUID_TO_BIN(UUID()), '£5 Credit', 'SITE_CREDIT', 5.00, 10.00, NULL),
-- (UUID_TO_BIN(UUID()), 'Free Ticket', 'FREE_TICKETS', 1.00, 15.00, 100),
-- (UUID_TO_BIN(UUID()), '£1 Cash', 'CASH', 1.00, 5.00, NULL),
-- (UUID_TO_BIN(UUID()), '£10 Cash', 'CASH', 10.00, 2.00, NULL),
-- (UUID_TO_BIN(UUID()), 'Jackpot £50', 'CASH', 50.00, 0.50, NULL);

-- Insert game categories
-- INSERT IGNORE INTO game_categories (id, name, description, sort_order) VALUES
-- (UUID_TO_BIN(UUID()), 'ARCADE', 'Classic arcade-style games', 1),
-- (UUID_TO_BIN(UUID()), 'PUZZLE', 'Brain teasers and puzzles', 2),
-- (UUID_TO_BIN(UUID()), 'ACTION', 'Fast-paced action games', 3),
-- (UUID_TO_BIN(UUID()), 'STRATEGY', 'Strategic thinking games', 4),
-- (UUID_TO_BIN(UUID()), 'CASUAL', 'Simple and relaxing games', 5),
-- (UUID_TO_BIN(UUID()), 'MULTIPLAYER', 'Games for multiple players', 6),
-- (UUID_TO_BIN(UUID()), 'EDUCATIONAL', 'Learning and educational games', 7);

-- ===========================================
-- FIXED TRIGGER WITHOUT TABLE UPDATE CONFLICT
-- ===========================================
DELIMITER //

-- Function to generate referral code
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

-- Trigger to automatically create associated records when user is created
-- NOTE: We cannot update the users table from within this trigger
CREATE TRIGGER after_user_insert
AFTER INSERT ON users
FOR EACH ROW
BEGIN
    DECLARE user_referral_code VARCHAR(50);
    DECLARE counter INT DEFAULT 0;
    DECLARE user_uuid CHAR(36);
    DECLARE new_referral_code VARCHAR(50);
    
    -- Convert BINARY(16) to CHAR(36) for UUID functions
    SET user_uuid = LOWER(CONCAT(
        HEX(SUBSTRING(NEW.id, 1, 4)), '-',
        HEX(SUBSTRING(NEW.id, 5, 2)), '-',
        HEX(SUBSTRING(NEW.id, 7, 2)), '-',
        HEX(SUBSTRING(NEW.id, 9, 2)), '-',
        HEX(SUBSTRING(NEW.id, 11, 6))
    ));
    
    -- Generate unique referral code from username
    SET new_referral_code = generate_referral_code(NEW.username);
    
    -- Ensure uniqueness with a safety counter
    WHILE EXISTS (SELECT 1 FROM referrals WHERE code = new_referral_code) AND counter < 10 DO
        SET new_referral_code = generate_referral_code(CONCAT(NEW.username, FLOOR(RAND() * 1000)));
        SET counter = counter + 1;
    END WHILE;
    
    -- If still not unique, use UUID part
    IF counter >= 10 THEN
        SET new_referral_code = UPPER(SUBSTRING(REPLACE(user_uuid, '-', ''), 1, 10));
    END IF;
    
    -- Store the generated referral code in a variable (we can't update users table here)
    SET user_referral_code = new_referral_code;
    
    -- Update the users table with the generated referral code
    -- This must be done outside the trigger in the application code
    -- We'll create all other records but skip updating users table
    
    -- Create referral record
    -- INSERT INTO referrals (id, user_id, code, current_tier, status)
    -- VALUES (UUID_TO_BIN(UUID()), NEW.id, user_referral_code, 1, 'ACTIVE');
    
    -- -- Create user points record
    -- INSERT INTO user_points (id, user_id, total_points, earned_points)
    -- VALUES (UUID_TO_BIN(UUID()), NEW.id, 0, 0);
    
    -- -- Create user streaks record
    -- INSERT INTO user_streaks (id, user_id, current_streak, longest_streak, last_login_date)
    -- VALUES (UUID_TO_BIN(UUID()), NEW.id, 0, 0, NULL);
    
    -- -- Create wallet records
    -- INSERT INTO wallets (id, user_id, type, balance) VALUES
    -- (UUID_TO_BIN(UUID()), NEW.id, 'CASH', 0),
    -- (UUID_TO_BIN(UUID()), NEW.id, 'CREDIT', 0);
    
    -- Create spending limits record
    INSERT INTO spending_limits (id, user_id) VALUES (UUID_TO_BIN(UUID()), NEW.id);
END //

DELIMITER ;

-- ===========================================
-- ADDITIONAL PROCEDURE FOR UPDATING USER REFERRAL CODE
-- ===========================================
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

-- ===========================================
-- END SCHEMA
-- ===========================================
