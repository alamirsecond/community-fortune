// src/api/game/gameController.js
import Game from "./models/Game.js";
import {
  gameZipUpload,
  unzipGameFile,
  validateGameStructure,
  getGameUrl,
  getGameFiles,
  deleteGame,
  uploadGameToCloudinary
} from "../../../middleware/upload.js";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

// Validate request helper
const validateRequest = (schema, data) => {
  const validationResult = schema.safeParse(data);
  if (!validationResult.success) {
    return { success: false, errors: validationResult.error.errors };
  }
  return { success: true, data: validationResult.data };
};

// Upload and create game
export const uploadGame = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Game ZIP file is required",
      });
    }

    // Generate game ID
    const gameId = uuidv4();
    const zipPath = req.file.path;

    // Unzip the game
    const extractionResult = await unzipGameFile(zipPath, gameId);

    // Validate game structure
    validateGameStructure(extractionResult.gameDir);

    // Upload to Cloudinary
    await uploadGameToCloudinary(extractionResult.gameDir, gameId);

    // Get game URL
    const gameUrl = getGameUrl(gameId);

    // Clean up local extraction directory after successful upload
    if (fs.existsSync(extractionResult.gameDir)) {
      fs.rmSync(extractionResult.gameDir, { recursive: true, force: true });
    }

    // Create game record
    const gameData = {
      id: gameId,
      name: req.body.name || `Game ${Date.now()}`,
      description: req.body.description,
      category: req.body.category || "ARCADE",
      difficulty: req.body.difficulty || "MEDIUM",
      min_players: parseInt(req.body.min_players) || 1,
      max_players: parseInt(req.body.max_players) || 1,
      estimated_duration: parseInt(req.body.estimated_duration) || 300,
      thumbnail_url: req.body.thumbnail_url,
      game_url: gameUrl,
      version: req.body.version || "1.0.0",
      status: "DRAFT",
      created_by: req.user?.id,
      tags: req.body.tags ? JSON.parse(req.body.tags) : ["user_uploaded"],
    };

    const createdGameId = await Game.create(gameData);

    res.status(201).json({
      success: true,
      message: "Game uploaded successfully",
      data: {
        game_id: createdGameId,
        game_url: gameUrl,
        extraction: {
          files_extracted: extractionResult.files,
          game_directory: extractionResult.gameDir,
        },
        next_steps: [
          "Test the game by visiting the game URL",
          "Update game metadata if needed",
          "Change status to ACTIVE when ready",
        ],
      },
    });
  } catch (error) {
    console.error("Game upload error:", error);

    // Clean up on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: "Failed to upload game",
      error: error.message,
    });
  }
};

// Get game details
export const getGameDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const game = await Game.findById(id);

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    // Get game files
    const files = await Game.getGameFiles(id);

    // Get game stats
    const stats = await Game.getStats(id);

    // Get leaderboard
    const leaderboard = await Game.getLeaderboard(id, 10);

    res.json({
      success: true,
      data: {
        ...game,
        files: files || [],
        stats: stats || {},
        leaderboard: leaderboard || [],
        metadata: {
          total_files: files?.length || 0,
          has_index: files?.some((f) => f.name === "index.html") || false,
          file_types: files
            ? [...new Set(files.map((f) => f.extension).filter((e) => e))]
            : [],
        },
      },
    });
  } catch (error) {
    console.error("Get game details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch game details",
      error: error.message,
    });
  }
};

// Get all games
export const getGames = async (req, res) => {
  try {
    const filters = {
      category: req.query.category,
      difficulty: req.query.difficulty,
      // Only filter by status if explicitly requested; otherwise return all statuses
      status: req.query.status,
      search: req.query.search,
      created_by: req.query.created_by,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      sort_by: req.query.sort_by || "created_at",
      sort_order: req.query.sort_order || "DESC",
    };

    const result = await Game.findGames(filters);
    const categories = await Game.getCategories();

    res.json({
      success: true,
      data: {
        games: result.games,
        pagination: {
          total: result.total,
          page: filters.page,
          total_pages: result.totalPages,
          limit: filters.limit,
        },
        filters: {
          category: filters.category ?? null,
          difficulty: filters.difficulty ?? null,
          search: filters.search ?? null,
          status: filters.status ?? null,
          page: filters.page,
          limit: filters.limit,
          sort_by: filters.sort_by,
          sort_order: filters.sort_order,
        },
        categories: categories.map((c) => ({
          name: c.name || c.category,
          game_count: c.game_count,
        })),
      },
    });
  } catch (error) {
    console.error("Get games error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch games",
      error: error.message,
    });
  }
};

// Update game
export const updateGame = async (req, res) => {
  try {
    const { id } = req.params;

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    // Check permission
    if (req.user.role !== "admin" && game.created_by !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update this game",
      });
    }

    const updateData = { ...req.body };

    // Handle tags if provided
    if (req.body.tags) {
      try {
        updateData.tags = JSON.parse(req.body.tags);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid tags format. Must be valid JSON array.",
        });
      }
    }

    const updated = await Game.update(id, updateData);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Game not found or update failed",
      });
    }

    res.json({
      success: true,
      message: "Game updated successfully",
      data: {
        game_id: id,
        updated_fields: Object.keys(updateData),
      },
    });
  } catch (error) {
    console.error("Update game error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update game",
      error: error.message,
    });
  }
};

// Delete game
export const deleteGameById = async (req, res) => {
  try {
    const { id } = req.params;

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    // Check permission
    if (req.user.role !== "admin" && game.created_by !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete this game",
      });
    }

    const deleted = await Game.delete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Game not found or delete failed",
      });
    }

    res.json({
      success: true,
      message: "Game deleted successfully",
      data: {
        game_id: id,
        deleted_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Delete game error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete game",
      error: error.message,
    });
  }
};

// Record game play
export const recordGamePlay = async (req, res) => {
  try {
    const { game_id, score } = req.body;

    if (!game_id || !score) {
      return res.status(400).json({
        success: false,
        message: "Game ID and score are required",
      });
    }

    const game = await Game.findById(game_id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    if (game.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "Game is not active",
      });
    }

    await Game.recordPlay(game_id, req.user.id, score);

    // Get updated stats
    const stats = await Game.getStats(game_id);
    const leaderboard = await Game.getLeaderboard(game_id, 10);
    const userRank = leaderboard.find((entry) => entry.user_id === req.user.id);

    res.json({
      success: true,
      message: "Game play recorded successfully",
      data: {
        game_id,
        score,
        stats: stats || {},
        leaderboard_position: userRank ? userRank.rank : null,
        next_steps: [
          "Check your position on the leaderboard",
          "Try to beat your high score",
          "Share your achievement",
        ],
      },
    });
  } catch (error) {
    console.error("Record game play error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record game play",
      error: error.message,
    });
  }
};

// Get game leaderboard
export const getGameLeaderboard = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    const leaderboard = await Game.getLeaderboard(id, limit);

    res.json({
      success: true,
      data: {
        game_id: id,
        game_name: game.name,
        leaderboard: leaderboard,
        total_players: leaderboard.length,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Get game leaderboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch game leaderboard",
      error: error.message,
    });
  }
};

// Get game files
export const getGameFileList = async (req, res) => {
  try {
    const { id } = req.params;

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    const files = (await Game.getGameFiles(id)) || [];
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

    res.json({
      success: true,
      data: {
        game_id: id,
        game_name: game.name,
        files,
        total_files: files.length,
        total_size: humanFileSize(totalSize),
      },
    });
  } catch (error) {
    console.error("Get game files error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch game files",
      error: error.message,
    });
  }
};

// Lightweight human readable size formatter
const humanFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    sizes.length - 1
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
};

// Get game categories
export const getGameCategories = async (req, res) => {
  try {
    const categories = await Game.getCategories();

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Get game categories error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch game categories",
      error: error.message,
    });
  }
};

// Update game files (re-upload)
export const updateGameFiles = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Game ZIP file is required",
      });
    }

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    // Check permission
    if (req.user.role !== "admin" && game.created_by !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update this game",
      });
    }

    const zipPath = req.file.path;

    // Unzip the game (overwrites existing files locally temporarily)
    const extractionResult = await unzipGameFile(zipPath, id);

    // Validate game structure
    validateGameStructure(extractionResult.gameDir);

    // Upload new files to Cloudinary
    await uploadGameToCloudinary(extractionResult.gameDir, id);

    // Clean up local extraction directory
    if (fs.existsSync(extractionResult.gameDir)) {
      fs.rmSync(extractionResult.gameDir, { recursive: true, force: true });
    }

    // Update game record with new version
    const newVersion = game.version ? incrementVersion(game.version) : "1.0.0";


    await Game.update(id, {
      version: newVersion,
      updated_at: new Date(),
    });

    res.json({
      success: true,
      message: "Game files updated successfully",
      data: {
        game_id: id,
        new_version: newVersion,
        extraction: {
          files_extracted: extractionResult.files,
          game_directory: extractionResult.gameDir,
        },
      },
    });
  } catch (error) {
    console.error("Update game files error:", error);

    // Clean up on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: "Failed to update game files",
      error: error.message,
    });
  }
};

// Helper function to increment version
const incrementVersion = (version) => {
  const parts = version.split(".");
  if (parts.length === 3) {
    const minor = parseInt(parts[2]) + 1;
    return `${parts[0]}.${parts[1]}.${minor}`;
  }
  return version;
};

// ==================== ADMIN: LIST GAMES (for leaderboard picker) ====================
export const getAdminGamesList = async (req, res) => {
  try {
    const filters = {
      category: req.query.category,
      difficulty: req.query.difficulty,
      status: req.query.status || "ACTIVE",
      search: req.query.search,
      created_by: req.query.created_by,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 50),
      sort_by: req.query.sort_by || "created_at",
      sort_order: req.query.sort_order || "DESC",
    };

    const result = await Game.findGames(filters);

    res.json({
      success: true,
      data: {
        games: result.games,
        pagination: {
          total: result.total,
          page: filters.page,
          total_pages: result.totalPages,
          limit: filters.limit,
        },
      },
    });
  } catch (error) {
    console.error("Admin get games list error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch games list",
      error: error.message,
    });
  }
};

// ==================== ADMIN: PERIOD LEADERBOARD ====================
export const getAdminGameLeaderboard = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const period = String(req.query.period || "DAILY").toUpperCase();

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    const daysByPeriod = {
      DAILY: 1,
      WEEKLY: 7,
      MONTHLY: 30,
      ALL: 365,
    };

    const days = daysByPeriod[period] || 1;
    const leaderboard =
      period === "ALL"
        ? await Game.getLeaderboard(id, limit)
        : await Game.getLeaderboardWindow(id, days, limit);

    const totalPlayers =
      period === "ALL"
        ? leaderboard.length
        : await Game.getWindowPlayerCount(id, days);

    res.json({
      success: true,
      data: {
        game_id: id,
        game_name: game.name,
        period,
        window_days: days,
        leaderboard,
        total_players: totalPlayers,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Admin get game leaderboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin game leaderboard",
      error: error.message,
    });
  }
};

// ==================== ADMIN: EXPORT LEADERBOARD CSV ====================
export const exportAdminGameLeaderboard = async (req, res) => {
  try {
    const { id } = req.params;
    const period = String(req.query.period || "DAILY").toUpperCase();
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    const daysByPeriod = {
      DAILY: 1,
      WEEKLY: 7,
      MONTHLY: 30,
      ALL: 365,
    };
    const days = daysByPeriod[period] || 1;

    const rows =
      period === "ALL"
        ? await Game.getLeaderboard(id, limit)
        : await Game.getLeaderboardWindow(id, days, limit);

    const headers = [
      "position",
      "user_id",
      "username",
      "score",
      "total_plays",
      "played_at",
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (/[\n\r,\"]/g.test(str)) return `"${str.replace(/\"/g, '""')}"`;
      return str;
    };

    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(headers.map((h) => escapeCsv(r[h])).join(","));
    }

    const csv = lines.join("\n");
    const filename = `game_leaderboard_${game.name?.replace(/\s+/g, "_") || "game"
      }_${period.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("Admin export game leaderboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export leaderboard",
      error: error.message,
    });
  }
};
