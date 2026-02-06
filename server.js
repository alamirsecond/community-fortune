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
import maintenanceGuard from "./middleware/maintenanceGuard.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize upload directories
const initUploadDirectories = () => {
  const directories = [
    process.env.KYC_UPLOAD_PATH || "./uploads/kyc_documents",
    process.env.COMPETITION_UPLOAD_PATH || "./uploads/competitions",
    process.env.USER_UPLOAD_PATH || "./uploads/users",
    process.env.GAMES_UPLOAD_PATH || "./uploads/games",
    process.env.SPIN_WHEEL_UPLOAD_PATH || "./uploads/spin_wheels",
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
//edghjfhgc
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

  // Serve spin wheel uploads
  app.use(
    "/uploads/spin_wheels",
    express.static(path.join(__dirname, "uploads/spin_wheels"), {
      setHeaders: (res, path) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
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

const initialize = async () => {
  try {
    await initializeSuperadmins(pool);
    console.log("Server initialization complete");
  } catch (error) {
    console.error("Server initialization failed:", error);
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
app.use("/api", maintenanceGuard, appRouter);

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
const PORT = process.env.PORT;
const HOST = process.env.HOST || "0.0.0.0";

const startServer = async () => {
  try {
    initUploadDirectories();
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
