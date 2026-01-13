import pool from "../../../database.js";


class SystemAlertService {
  static async getRecentAlerts(limit = 10) {
    const [rows] = await pool.query(
      `
      SELECT 
        BIN_TO_UUID(id) AS id,
        type,
        title,
        message,
        is_dismissed,
        created_at
      FROM system_alerts
      WHERE is_dismissed = FALSE
      ORDER BY created_at DESC
      LIMIT ?
      `,
      [limit]
    );

    return rows;
  }

  static async dismissAlert(alertId) {
    const [result] = await pool.query(
      `
      UPDATE system_alerts
      SET is_dismissed = TRUE
      WHERE id = UUID_TO_BIN(?)
      `,
      [alertId]
    );

    return result.affectedRows > 0;
  }

  static async createAlert({ type, title, message }) {
    await pool.query(
      `
      INSERT INTO system_alerts (id, type, title, message)
      VALUES (UUID_TO_BIN(UUID()), ?, ?, ?)
      `,
      [type, title, message]
    );
  }
}

export default SystemAlertService;
