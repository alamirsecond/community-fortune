import { Router } from "express";
import checkoutRouter from "../api/CHECKOUT/checkout_route.js";
import winnersRouter from "../api/WINNERS/winners_route.js";
import ticketRouter from "../api/TICKETS/tickets_route.js";
import spinWheelRouter from "../api/SPIN WHEEL/spinWheel_route.js";
import userRoutes from "../api/User/userRoutes.js";
import withdrawalRoutes from "../api/withdrawals/withdrawalRoutes.js";
import walletRoutes from "../api/wallet/walletRoutes.js";
import referralRouter from "../api/Referrals/referrals_routes.js";
import competitionRouter from "../api/Competition/competitionRoutes.js";
import adminRouter from "../api/Admin/admin_routes.js";
import pointsRouter from "../api/Points/points_Routes.js";
import superAdminRouter from "../api/SuperAdmin/superAdminRoutes.js";
import gameRouter from "../api/game/gameRoutes.js";
import instantWinsRouter from "../api/INSTANT WINS/instantWins_route.js";
import voucherRouter from "../api/Vouchers/voucher_routes.js";
import faqRouter from "../api/FAQ/faq_routes.js";

const appRouter = Router();

appRouter.use("/checkout", checkoutRouter);
appRouter.use("/winners", winnersRouter);
appRouter.use("/tickets", ticketRouter);
appRouter.use("/instant-wins", instantWinsRouter);
appRouter.use("/spinWheel", spinWheelRouter);
appRouter.use("/users", userRoutes);
appRouter.use("/withdrawals", withdrawalRoutes);
appRouter.use("/wallet", walletRoutes);
appRouter.use("/referrals", referralRouter);
appRouter.use("/points", pointsRouter);
appRouter.use("/competitions", competitionRouter);
appRouter.use("/admin", adminRouter);
appRouter.use("/superAdmin", superAdminRouter);
appRouter.use("/games", gameRouter);
appRouter.use("/vouchers", voucherRouter);
appRouter.use("/faqs", faqRouter);


appRouter.get("/", (req, res) => {
  res.json({
    success: true,
    message: process.env.APP_NAME
      ? `${process.env.APP_NAME} API`
      : "🎰 Community Fortune API",
    version: process.env.APP_VERSION || "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    endpoints: {
      users: "/api/users",
      withdrawals: "/api/withdrawals",
      wallet: "/api/wallet",
      competitions: "/api/competitions",
      games: "/api/games",
      referrals: "/api/referrals",
      checkout: "/api/checkout",
      tickets: "/api/tickets",
      winners: "/api/winners",
      admin: "/api/admin",
    },
    features: {
      games: {
        upload: "POST /api/games/upload",
        play: "POST /api/games/play",
        leaderboard: "GET /api/games/:id/leaderboard",
        categories: "GET /api/games/categories",
      },
    },
  });
});

// Health check endpoint
appRouter.get("/health", async (req, res) => {
  try {
    const pool = await import("../../database.js").then(
      (module) => module.default
    );
    const [result] = await pool.execute("SELECT 1 as db_status");

    // Check game uploads directory
    const gamesUploadPath = process.env.GAMES_UPLOAD_PATH || "./uploads/games";
    const gamesDirExists = fs.existsSync(
      path.resolve(__dirname, "../../", gamesUploadPath)
    );

    res.json({
      success: true,
      message: "✅ API is healthy",
      timestamp: new Date().toISOString(),
      appName: process.env.APP_NAME || "Community Fortune",
      version: process.env.APP_VERSION || "1.0.0",
      services: {
        database:
          result[0].db_status === 1 ? "✅ Connected" : "❌ Disconnected",
        environment: process.env.NODE_ENV || "development",
        gamesSystem: gamesDirExists ? "✅ Ready" : "⚠️ Directory missing",
        uptime: `${process.uptime().toFixed(2)} seconds`,
      },
      uploads: {
        games: gamesDirExists ? "✅ Configured" : "⚠️ Not configured",
        maxGameSize: "100MB",
        allowedTypes: "ZIP files only",
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: "❌ API health check failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ✅ FIXED: Proper 404 handler for API routes
// Complete 404 handler with all available endpoints
appRouter.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `🔍 API endpoint ${req.originalUrl} not found`,
    availableEndpoints: {
      // AUTH & USER MANAGEMENT
      "Authentication & Users": [
        "POST /api/users/register",
        "POST /api/users/login",
        "POST /api/users/logout",
        "GET /api/users/profile",
        "PUT /api/users/profile",
        "PUT /api/users/password",
        "POST /api/users/verify-age",
        "POST /api/users/password-reset/request",
        "POST /api/users/password-reset/confirm",
        "POST /api/users/admin/create",
      ],

      // GAMES SYSTEM
      "Games System": [
        // Public Routes
        "GET /api/games - Get all games",
        "GET /api/games/categories - Get game categories",
        "GET /api/games/:id - Get game details",
        "GET /api/games/:id/leaderboard - Get game leaderboard",
        "GET /api/games/:id/files - Get game files list",

        // Protected User Routes
        "POST /api/games/play - Record game play",
        "POST /api/games/upload - Upload new game (ZIP)",

        // Creator/Admin Routes
        "PUT /api/games/:id - Update game metadata",
        "PUT /api/games/:id/files - Update game files (ZIP)",
        "DELETE /api/games/:id - Delete game",
      ],

      // WALLET SYSTEM (UPDATED)
      Wallet: [
        "GET /api/wallet/balances - Get cash & credit wallet balances",
        "GET /api/wallet/transactions - Get transaction history",
        "GET /api/wallet/spending-history - Get detailed spending history",
        "PUT /api/wallet/freeze-credit - Freeze/unfreeze credit wallet",
        "POST /api/wallet/transfer - Transfer between wallets",
        "POST /api/wallet/buy-credit - Purchase site credit",
        "GET /api/wallet/spending-limits - Get spending limits (Responsible Gaming)",
        "PUT /api/wallet/spending-limits - Update spending limits",
        "GET /api/wallet/admin/all - Admin: View all wallets",
        "POST /api/wallet/admin/reset-spending - Admin: Reset spending counts",
      ],

      // WITHDRAWALS
      Withdrawals: [
        // User Withdrawal Requests & Management
        "POST /api/withdrawals/request",
        "POST /api/withdrawals/verify-otp",
        "GET /api/withdrawals/my-withdrawals",
        "GET /api/withdrawals/my-withdrawals/:id",

        // Withdrawal Settings & Limits Management
        "GET /api/withdrawals/settings",
        "PUT /api/withdrawals/limits",

        // Admin Management Endpoints
        "GET /api/withdrawals/all",
        "PUT /api/withdrawals/:id/status",
        "GET /api/withdrawals/stats",

        // KYC Management (Admin)
        "POST /api/withdrawals/verify-kyc",

        // Webhook Integration
        "POST /api/withdrawals/webhook/processing",
      ],

      // COMPETITIONS
      Competitions: [
        // Public Routes
        "GET /api/competitions",
        "GET /api/competitions/types",
        "GET /api/competitions/templates",
        "GET /api/competitions/:id",
        "GET /api/competitions/:id/stats",
        "GET /api/competitions/:id/leaderboard",
        "GET /api/competitions/:id/analytics",
        "GET /api/competitions/:id/winners",
        "POST /api/competitions/validate-entry",

        // Protected User Routes
        "POST /api/competitions/skill-question",
        "POST /api/competitions/free-entry",
        "POST /api/competitions/mini-game/score",
        "POST /api/competitions/instant-win/claim",

        // Admin Routes
        "POST /api/competitions",
        "POST /api/competitions/bulk",
        "PUT /api/competitions/:id",
        "POST /api/competitions/:id/duplicate",
        "POST /api/competitions/:id/status",
        "POST /api/competitions/jackpot/start-countdown",
        "POST /api/competitions/winners/select",
        "POST /api/competitions/subscription/auto-subscribe",
        "GET /api/competitions/export/:id",

        // File Upload Routes
        "POST /api/competitions/:id/images",
        "POST /api/competitions/:id/documents",
      ],

      // REFERRALS
      Referrals: [
        "GET /api/referrals/my-referrals",
        "GET /api/referrals/stats",
        "POST /api/referrals/generate-code",
        "GET /api/referrals/rewards",
      ],

      // CHECKOUT
      Checkout: [
        "POST /api/checkout/create",
        "POST /api/checkout/confirm",
        "POST /api/checkout/cancel",
      ],

      // TICKETS
      Tickets: [
        "GET /api/tickets/my-tickets",
        "GET /api/tickets/universal",
        "POST /api/tickets/use-universal",
      ],

      // WINNERS
      Winners: [
        "GET /api/winners/recent",
        "GET /api/winners/my-wins",
        "GET /api/winners/:id",
      ],

      // ADMIN
      Admin: [
        "GET /api/admin/users",
        "GET /api/admin/competitions",
        "GET /api/admin/withdrawals",
        "GET /api/admin/analytics/overview",
        "GET /api/admin/analytics/revenue",
        "GET /api/admin/analytics/user-growth",
        "GET /api/admin/wallet-stats",
        "POST /api/admin/reset-spending",
      ],

      // SYSTEM ENDPOINTS
      System: ["GET /api/", "GET /api/health", "GET /health"],
    },
    note: "Most endpoints require authentication. Use Authorization: Bearer <token> header.",
    rateLimits: {
      "Game uploads": "5 requests/minute",
      "Game play recording": "60 requests/minute",
      "Wallet operations": "10 requests/minute (strict)",
      "Spending limits": "5 requests/minute",
      "Balance checks": "60 requests/minute",
      "Transaction history": "30 requests/minute",
      "Admin endpoints": "30 requests/minute",
    },
    gameRequirements: {
      fileFormat: "ZIP archive",
      maxSize: "100MB",
      requiredFile: "index.html at root",
      allowedFiles: "HTML, CSS, JS, images, fonts, audio",
      restrictions: "No external scripts, iframes, or eval()",
    },
  });
});

export default appRouter;
