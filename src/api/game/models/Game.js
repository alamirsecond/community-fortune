// src/api/game/models/Game.js
import pool from "../../../../database.js";
import { v4 as uuidv4 } from "uuid";
import {
  getGameFiles,
  deleteGame,
  getGameUrl,
} from "../../../../middleware/upload.js";
import fs from "fs";
import path from "path";

class Game {
  static async create(gameData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Use caller-provided ID (so filesystem folder and DB stay in sync) or fall back to a new UUID
      const gameId = gameData.id || uuidv4();
      const binaryId = this.uuidToBinary(gameId);

      await connection.execute(
        `INSERT INTO games (
          id, name, description, category, difficulty, 
          min_players, max_players, estimated_duration,
          thumbnail_url, game_url, version, status,
          created_by, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          binaryId,
          gameData.name,
          gameData.description || null,
          gameData.category || "ARCADE",
          gameData.difficulty || "MEDIUM",
          gameData.min_players || 1,
          gameData.max_players || 1,
          gameData.estimated_duration || 300,
          gameData.thumbnail_url || null,
          gameData.game_url || null,
          gameData.version || "1.0.0",
          gameData.status || "DRAFT",
          gameData.created_by ? this.uuidToBinary(gameData.created_by) : null,
          gameData.tags ? JSON.stringify(gameData.tags) : null,
        ]
      );

      await connection.commit();
      return gameId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findById(gameId) {
    const [rows] = await pool.execute(
      `SELECT 
        BIN_TO_UUID(id) as id,
        name, description, category, difficulty,
        min_players, max_players, estimated_duration,
        thumbnail_url, game_url, version, status,
        BIN_TO_UUID(created_by) as created_by,
        tags, plays_count, avg_score,
        created_at, updated_at
       FROM games 
       WHERE id = UUID_TO_BIN(?)`,
      [gameId]
    );

    return rows[0] || null;
  }

  static async findGames(filters = {}) {
    // Consolidated implementation: supports both older and newer filter shapes,
    // pagination, filtering, and safe sorting.
    const {
      page = 1,
      limit = 20,
      sort_by = "created_at",
      sort_order = "DESC",
      category,
      difficulty,
      status,
      search,
      created_by,
    } = filters;

    const pageNum =
      Number.isFinite(parseInt(page)) && parseInt(page) > 0
        ? parseInt(page)
        : 1;
    const limitNum =
      Number.isFinite(parseInt(limit)) && parseInt(limit) > 0
        ? parseInt(limit)
        : 20;
    const offset = (pageNum - 1) * limitNum;

    // Allow-list sort columns to avoid SQL injection
    const allowedSortBy = ["created_at", "name", "plays_count", "avg_score"];
    const sortBy = allowedSortBy.includes(sort_by) ? sort_by : "created_at";
    const sortOrder =
      (sort_order || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

    let baseQuery = `
    FROM games g
    LEFT JOIN users u ON g.created_by = u.id
    WHERE 1=1
  `;

    const params = [];

    if (category) {
      baseQuery += " AND g.category = ?";
      params.push(category);
    }

    if (difficulty) {
      baseQuery += " AND g.difficulty = ?";
      params.push(difficulty);
    }

    if (status) {
      baseQuery += " AND g.status = ?";
      params.push(status);
    }

    if (search) {
      baseQuery +=
        " AND (g.name LIKE ? OR g.description LIKE ? OR g.tags LIKE ?)";
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (created_by) {
      baseQuery += " AND g.created_by = UUID_TO_BIN(?)";
      params.push(created_by);
    }

    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0]?.total || 0;

    const mainQuery = `
    SELECT 
      BIN_TO_UUID(g.id) as id,
      g.name, g.description, g.category, g.difficulty,
      g.thumbnail_url, g.game_url, g.version, g.status,
      g.plays_count, g.avg_score, g.created_at,
      BIN_TO_UUID(g.created_by) as created_by,
      u.username as creator_name
    ${baseQuery}
    ORDER BY ${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

    const mainParams = [...params, limitNum, offset];
    const [rows] = await pool.query(mainQuery, mainParams);

    return {
      games: rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / Math.max(limitNum, 1)),
    };
  }

  static async update(gameId, updateData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const fields = [];
      const values = [];

      Object.keys(updateData).forEach((key) => {
        if (key !== "id" && key !== "created_at") {
          fields.push(`${key} = ?`);
          if (key === "tags") {
            values.push(JSON.stringify(updateData[key]));
          } else if (key === "created_by") {
            values.push(this.uuidToBinary(updateData[key]));
          } else {
            values.push(updateData[key]);
          }
        }
      });

      values.push(this.uuidToBinary(gameId));

      const [result] = await connection.execute(
        `UPDATE games 
         SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        values
      );

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async delete(gameId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // First get game info to delete files
      const game = await this.findById(gameId);

      const [result] = await connection.execute(
        "DELETE FROM games WHERE id = UUID_TO_BIN(?)",
        [gameId]
      );

      // Delete game files from filesystem
      if (game && result.affectedRows > 0) {
        deleteGame(gameId);
      }

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async recordPlay(gameId, userId, score) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Insert play record
      await connection.execute(
        `INSERT INTO game_plays (id, game_id, user_id, score, played_at)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, CURRENT_TIMESTAMP)`,
        [gameId, userId, score]
      );

      // Update game stats
      await connection.execute(
        `UPDATE games 
         SET plays_count = plays_count + 1,
             avg_score = ((avg_score * plays_count) + ?) / (plays_count + 1)
         WHERE id = UUID_TO_BIN(?)`,
        [score, gameId]
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getGameFiles(gameId) {
    return getGameFiles(gameId);
  }

  static async getLeaderboard(gameId, limit = 50) {
    // Normalize and inline limit to avoid prepared statement issues and
    // support MySQL versions without window functions
    const safeLimit =
      Number.isFinite(parseInt(limit)) && parseInt(limit) > 0
        ? parseInt(limit)
        : 50;

    const query = `
      SELECT 
        (@rownum:=@rownum+1) AS position,
        t.user_id,
        t.username,
        t.profile_photo,
        t.score,
        t.played_at,
        t.total_plays
      FROM (
        SELECT 
          BIN_TO_UUID(u.id) AS user_id,
          u.username,
          u.profile_photo,
          gp.score,
          gp.played_at,
          COUNT(gp.id) AS total_plays
        FROM game_plays gp
        JOIN users u ON gp.user_id = u.id
        WHERE gp.game_id = UUID_TO_BIN(?)
        GROUP BY u.id, u.username, u.profile_photo, gp.score, gp.played_at
        ORDER BY gp.score DESC, gp.played_at ASC
        LIMIT ${safeLimit}
      ) t
      JOIN (SELECT @rownum:=0) r`;

    const [rows] = await pool.execute(query, [gameId]);

    return rows;
  }

  static async getLeaderboardWindow(gameId, days = 1, limit = 50) {
    const safeLimit =
      Number.isFinite(parseInt(limit)) && parseInt(limit) > 0
        ? Math.min(parseInt(limit), 500)
        : 50;
    const safeDays =
      Number.isFinite(parseInt(days)) && parseInt(days) > 0
        ? Math.min(parseInt(days), 365)
        : 1;

    // Best score per user within the window; ties broken by earliest time
    const query = `
      SELECT
        (@rownum:=@rownum+1) AS position,
        t.user_id,
        t.username,
        t.profile_photo,
        t.score,
        t.played_at,
        t.total_plays
      FROM (
        SELECT
          BIN_TO_UUID(u.id) AS user_id,
          u.username,
          u.profile_photo,
          b.best_score AS score,
          b.plays AS total_plays,
          MIN(gp.played_at) AS played_at
        FROM (
          SELECT user_id, MAX(score) AS best_score, COUNT(*) AS plays
          FROM game_plays
          WHERE game_id = UUID_TO_BIN(?)
            AND played_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
          GROUP BY user_id
        ) b
        JOIN users u ON b.user_id = u.id
        JOIN game_plays gp
          ON gp.user_id = b.user_id
         AND gp.game_id = UUID_TO_BIN(?)
         AND gp.score = b.best_score
         AND gp.played_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
        GROUP BY u.id, u.username, u.profile_photo, b.best_score, b.plays
        ORDER BY b.best_score DESC, played_at ASC
        LIMIT ${safeLimit}
      ) t
      JOIN (SELECT @rownum:=0) r;
    `;

    const [rows] = await pool.execute(query, [gameId, gameId]);
    return rows;
  }

  static async getWindowPlayerCount(gameId, days = 1) {
    const safeDays =
      Number.isFinite(parseInt(days)) && parseInt(days) > 0
        ? Math.min(parseInt(days), 365)
        : 1;
    const [rows] = await pool.execute(
      `SELECT COUNT(DISTINCT user_id) AS total_players
       FROM game_plays
       WHERE game_id = UUID_TO_BIN(?)
         AND played_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)`,
      [gameId]
    );
    return rows[0]?.total_players || 0;
  }

  static async getCategories() {
    const [rows] = await pool.execute(
      "SELECT DISTINCT category, COUNT(*) as game_count FROM games GROUP BY category ORDER BY category"
    );
    return rows;
  }

  static async getStats(gameId) {
    const [rows] = await pool.execute(
      `SELECT 
        COUNT(DISTINCT user_id) as unique_players,
        COUNT(*) as total_plays,
        AVG(score) as average_score,
        MAX(score) as high_score,
        MIN(score) as low_score
       FROM game_plays
       WHERE game_id = UUID_TO_BIN(?)`,
      [gameId]
    );

    return rows[0] || null;
  }

  static uuidToBinary(uuid) {
    return Buffer.from(uuid.replace(/-/g, ""), "hex");
  }
}

export default Game;
