import pool from "../../../../database.js";
import { LegalSchema } from "./legal_validator.js";

const legalController = {
  getTest: (req, res) => {
    res.status(200).json({ message: "Legal Module Test Endpoint" });
  },

  getAll: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM legal_cases");
      res.status(200).json({ success: true, data: rows });
    } catch (err) {
      console.error("Error fetching legal cases:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        "SELECT * FROM legal_cases WHERE id = UUID_TO_BIN(?)",
        [id]
      );
      if (!rows.length)
        return res
          .status(404)
          .json({ success: false, message: "Legal case not found" });
      res.status(200).json({ success: true, data: rows[0] });
    } catch (err) {
      console.error("Error fetching legal case:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  createLegalCase: async (req, res) => {
    try {
      const parsed = LegalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({
            success: false,
            errors: parsed.error.issues.map((e) => e.message),
          });
      }
      const { title, description, lawyer_id, status } = parsed.data;
      await pool.query(
        "INSERT INTO legal_cases (title, description, lawyer_id, status) VALUES (?, ?, UUID_TO_BIN(?), ?)",
        [title, description, lawyer_id, status]
      );
      res.status(201).json({ success: true, message: "Legal case created" });
    } catch (err) {
      console.error("Error creating legal case:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  updateLegalCase: async (req, res) => {
    try {
      const { id } = req.params;
      const parsed = LegalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({
            success: false,
            errors: parsed.error.issues.map((e) => e.message),
          });
      }
      const { title, description, lawyer_id, status } = parsed.data;
      await pool.query(
        "UPDATE legal_cases SET title = ?, description = ?, lawyer_id = UUID_TO_BIN(?), status = ? WHERE id = UUID_TO_BIN(?)",
        [title, description, lawyer_id, status, id]
      );
      res.status(200).json({ success: true, message: "Legal case updated" });
    } catch (err) {
      console.error("Error updating legal case:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  deleteLegalCase: async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM legal_cases WHERE id = UUID_TO_BIN(?)", [
        id,
      ]);
      res.status(200).json({ success: true, message: "Legal case deleted" });
    } catch (err) {
      console.error("Error deleting legal case:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },
};

export default legalController;
