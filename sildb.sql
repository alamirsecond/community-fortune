
-- USERS TABLE
CREATE TABLE users (
    id BINARY(16) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    tier VARCHAR(20) DEFAULT 'FREE', -- 'FREE', 'TIER1', 'TIER2', 'TIER3'
    subscription_end_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- WALLETS (Two types as per document)
CREATE TABLE wallets (
    id BINARY(16) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- 'SITE_CREDIT', 'CASH'
    balance DECIMAL(10,2) DEFAULT 0.00,
    is_withdrawable BOOLEAN DEFAULT FALSE, -- Site credit not withdrawable
    created_at TIMESTAMP DEFAULT NOW()
);

-- SPENDING LIMITS TABLE
CREATE TABLE spending_limits (
    id BINARY(16) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    limit_type VARCHAR(20) NOT NULL, -- 'DAILY', 'WEEKLY', 'MONTHLY', 'SINGLE_PURCHASE'
    amount DECIMAL(10,2) DEFAULT 0.00,
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, limit_type)
);

-- COMPETITIONS TABLE
CREATE TABLE competitions (
    id BINARY(16) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL, -- 'PAID', 'FREE', 'JACKPOT', 'MINI_GAME', 'SUBSCRIPTION', 'SPIN_WHEEL'
    
    -- Prize Configuration
    main_prize_value DECIMAL(15,2),
    main_prize_description TEXT,
    
    -- Ticket Configuration
    ticket_price DECIMAL(10,2) DEFAULT 0.00,
    total_tickets INTEGER NOT NULL,
    max_tickets_per_user INTEGER,
    
    -- Timing
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,
    
    -- UK Compliance
    has_skill_question BOOLEAN DEFAULT FALSE,
    skill_question TEXT,
    skill_answer TEXT,
    has_free_postal_entry BOOLEAN DEFAULT FALSE,
    postal_instructions TEXT,
    
    -- Jackpot Specific
    prize_option VARCHAR(20), -- 'SINGLE_WINNER', 'MULTIPLE_WINNERS', 'TIERED'
    ticket_model VARCHAR(20), -- 'MODEL_10PCT_FREE', 'MODEL_20PCT_FREE', 'CUSTOM'
    threshold_type VARCHAR(20), -- 'AUTOMATIC', 'MANUAL'
    threshold_value INTEGER,
    
    -- Subscription Specific
    allowed_tiers TEXT[], -- Array of allowed tiers
    auto_entry BOOLEAN DEFAULT FALSE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'DRAFT', -- 'DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- TICKETS TABLE (Enhanced with Universal/Competition distinction)
CREATE TABLE tickets (
    id BINARY(16) PRIMARY KEY,
    competition_id UUID REFERENCES competitions(id),
    user_id UUID REFERENCES users(id),
    
    -- Ticket Identification
    ticket_number INTEGER NOT NULL,
    ticket_type VARCHAR(20) NOT NULL, -- 'COMPETITION', 'UNIVERSAL'
    purchase_id UUID, -- For tracking purchases
    
    -- Universal Ticket Properties
    universal_ticket_id UUID, -- Reference to universal_tickets table if type=UNIVERSAL
    
    -- Status
    is_used BOOLEAN DEFAULT FALSE,
    is_instant_win BOOLEAN DEFAULT FALSE,
    instant_win_claimed BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(competition_id, ticket_number),
    INDEX idx_user_competition (user_id, competition_id)
);

-- UNIVERSAL TICKETS TABLE (For earned/free tickets)
CREATE TABLE universal_tickets (
    id BINARY(16) PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    source VARCHAR(50) NOT NULL, -- 'DAILY_LOGIN', 'MISSION', 'ACHIEVEMENT', 'POINTS_EXCHANGE', 'SUBSCRIPTION'
    quantity INTEGER DEFAULT 1,
    expires_at TIMESTAMP,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- INSTANT WINS TABLE
CREATE TABLE instant_wins (
    id BINARY(16) PRIMARY KEY,
    competition_id UUID REFERENCES competitions(id),
    ticket_number INTEGER NOT NULL,
    prize_name VARCHAR(100) NOT NULL,
    prize_value DECIMAL(10,2),
    prize_type VARCHAR(30) DEFAULT 'CASH', -- 'CASH', 'SITE_CREDIT', 'PHYSICAL_PRIZE'
    max_winners INTEGER DEFAULT 1,
    current_winners INTEGER DEFAULT 0,
    claimed_by UUID REFERENCES users(id),
    claimed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(competition_id, ticket_number)
);

-- ACHIEVEMENTS TABLE
CREATE TABLE achievements (
    id BINARY(16) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL, -- 'PURCHASE_X_TICKETS', 'SPEND_X_AMOUNT', 'FIRST_PURCHASE', etc.
    condition_value JSONB, -- Flexible condition storage
    reward_type VARCHAR(50), -- 'POINTS', 'SITE_CREDIT', 'UNIVERSAL_TICKET'
    reward_value DECIMAL(10,2),
    badge_image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- USER ACHIEVEMENTS TABLE
CREATE TABLE user_achievements (
    id BINARY(16) PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    achievement_id UUID REFERENCES achievements(id),
    unlocked_at TIMESTAMP DEFAULT NOW(),
    progress JSONB, -- For tracking progress towards achievements
    UNIQUE(user_id, achievement_id)
);

-- SPIN WHEELS TABLE
CREATE TABLE spin_wheels (
    id BINARY(16) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'DAILY', 'VIP', 'SUBSCRIBER_ONLY', 'EVENT'
    description TEXT,
    
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

-- SPIN WHEEL SEGMENTS TABLE
CREATE TABLE spin_wheel_segments (
    id BINARY(16) PRIMARY KEY,
    wheel_id UUID REFERENCES spin_wheels(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    
    -- Segment Properties
    color_hex VARCHAR(7) NOT NULL,
    prize_name VARCHAR(100) NOT NULL,
    prize_type VARCHAR(50) NOT NULL, -- 'SITE_CREDIT', 'POINTS', 'FREE_TICKET', 'NO_WIN', 'CASH', 'BONUS_SPIN'
    prize_value DECIMAL(10,2),
    probability DECIMAL(5,2) NOT NULL, -- Percentage 0-100
    
    -- Visual
    image_url TEXT,
    text_color VARCHAR(7) DEFAULT '#FFFFFF',
    
    -- Stock Control
    stock INTEGER, -- NULL for unlimited
    current_stock INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(wheel_id, position),
    CHECK (probability >= 0 AND probability <= 100)
);

-- SPIN HISTORY TABLE
CREATE TABLE spin_history (
    id BINARY(16) PRIMARY KEY,
    wheel_id UUID REFERENCES spin_wheels(id),
    user_id UUID REFERENCES users(id),
    segment_id UUID REFERENCES spin_wheel_segments(id),
    prize_type VARCHAR(50),
    prize_value DECIMAL(10,2),
    spin_result JSONB, -- Full result details
    created_at TIMESTAMP DEFAULT NOW()
);

-- POINT SYSTEM TABLES
CREATE TABLE user_points (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    total_points INTEGER DEFAULT 0,
    available_points INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW()
);

CREATE TABLE point_transactions (
    id BINARY(16) PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    points INTEGER NOT NULL,
    transaction_type VARCHAR(50), -- 'EARNED', 'REDEEMED', 'EXPIRED'
    source VARCHAR(100), -- 'DAILY_LOGIN', 'MINI_GAME', 'MISSION', 'ACHIEVEMENT'
    reference_id UUID, -- Link to source (competition_id, mission_id, etc.)
    created_at TIMESTAMP DEFAULT NOW()
);