import pool from "../../../database.js";
import { v4 as uuidv4 } from 'uuid';

const legalController = {
  // Get all legal documents with filtering
  getAll: async (req, res) => {
    try {
      const { type, is_active } = req.query;
      let query = `
        SELECT 
          BIN_TO_UUID(id) as id,
          title,
          type,
          content,
          version,
          is_active as isActive,
          effective_date as effectiveDate,
          created_at as createdAt,
          updated_at as updatedAt,
          updated_by as updatedBy
        FROM legal_documents
        WHERE 1=1
      `;
      const params = [];

      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }

      if (is_active !== undefined) {
        query += ' AND is_active = ?';
        params.push(is_active === 'true');
      }

      query += ' ORDER BY type, created_at DESC';

      const [rows] = await pool.query(query, params);
      
      res.status(200).json({ 
        success: true, 
        data: rows,
        count: rows.length
      });
    } catch (err) {
      console.error("Error fetching legal documents:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Get document by ID
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        `SELECT 
          BIN_TO_UUID(id) as id,
          title,
          type,
          content,
          version,
          is_active as isActive,
          effective_date as effectiveDate,
          created_at as createdAt,
          updated_at as updatedAt,
          updated_by as updatedBy
         FROM legal_documents 
         WHERE id = UUID_TO_BIN(?)`,
        [id]
      );
      
      if (!rows.length) {
        return res.status(404).json({ 
          success: false, 
          message: "Legal document not found" 
        });
      }
      
      res.status(200).json({ success: true, data: rows[0] });
    } catch (err) {
      console.error("Error fetching legal document:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Get active document by type
  getByType: async (req, res) => {
    try {
      const { type } = req.params;
      const validTypes = ['TERMS', 'PRIVACY', 'COOKIE', 'RESPONSIBLE_PLAY', 'WEBSITE_TERMS', 'OTHER'];
      
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid document type"
        });
      }

      const [rows] = await pool.query(
        `SELECT 
          BIN_TO_UUID(id) as id,
          title,
          type,
          content,
          version,
          is_active as isActive,
          effective_date as effectiveDate,
          created_at as createdAt,
          updated_at as updatedAt
         FROM legal_documents 
         WHERE type = ? AND is_active = TRUE
         ORDER BY updated_at DESC
         LIMIT 1`,
        [type]
      );
      
      if (!rows.length) {
        return res.status(404).json({ 
          success: false, 
          message: "Active document of this type not found" 
        });
      }
      
      res.status(200).json({ success: true, data: rows[0] });
    } catch (err) {
      console.error("Error fetching legal document by type:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Create new legal document
// Update createLegalDocument function
createLegalDocument: async (req, res) => {
  try {
    const { title, type, content, version = "1.0", isActive = true, effectiveDate } = req.body;
    const userEmail = req.user.email || req.user.username;
    
    // Validate required fields
    if (!title || !type || !content) {
      return res.status(400).json({
        success: false,
        message: "Title, type, and content are required"
      });
    }

    // Start transaction
    await pool.query("START TRANSACTION");

    try {
      // If creating new active document, deactivate old one of same type
      if (isActive) {
        await pool.query(
          "UPDATE legal_documents SET is_active = FALSE WHERE type = ? AND is_active = TRUE",
          [type]
        );
      }

      const [result] = await pool.query(
        `INSERT INTO legal_documents 
          (id, title, type, content, version, is_active, effective_date, updated_by) 
         VALUES 
          (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), title, type, content, version, isActive, effectiveDate || null, userEmail]
      );


      await pool.query("COMMIT");

      res.status(201).json({ 
        success: true, 
        message: "Legal document created successfully",
        data: { id: result.insertId, title, type, version, isActive, effectiveDate,
          result: result.json
        }
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (err) {
    console.error("Error creating legal document:", err);
    res.status(500).json({ success: false, error: err.message });
  }
},

// Update updateLegalDocument function
updateLegalDocument: async (req, res) => {
  try {
    const { id } = req.params;
    const { title, type, content, version, isActive, effectiveDate } = req.body;
    const userEmail = req.user.email || req.user.username;

    // Start transaction
    await pool.query("START TRANSACTION");

    try {
      // Check if document exists and get current type
      const [existing] = await pool.query(
        "SELECT type, is_active FROM legal_documents WHERE id = UUID_TO_BIN(?)",
        [id]
      );

      if (!existing.length) {
        await pool.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Legal document not found"
        });
      }

      const oldType = existing[0].type;
      const oldIsActive = existing[0].is_active;
      
      // If activating this document, deactivate others of same type
      if (isActive === true && oldIsActive === 0) {
        // If type is being changed, deactivate old type documents
        const deactivateType = type || oldType;
        await pool.query(
          "UPDATE legal_documents SET is_active = FALSE WHERE type = ? AND id != UUID_TO_BIN(?) AND is_active = TRUE",
          [deactivateType, id]
        );
      }

      // If type is being changed and document was active, deactivate old type documents
      if (type && type !== oldType && oldIsActive === 1) {
        // Deactivate old type if this document was active
        await pool.query(
          "UPDATE legal_documents SET is_active = FALSE WHERE type = ? AND is_active = TRUE",
          [oldType]
        );
        
        // Also deactivate new type if needed
        await pool.query(
          "UPDATE legal_documents SET is_active = FALSE WHERE type = ? AND id != UUID_TO_BIN(?) AND is_active = TRUE",
          [type, id]
        );
      }

      const updateFields = [];
      const updateParams = [];

      if (title) {
        updateFields.push("title = ?");
        updateParams.push(title);
      }

      if (type) {
        updateFields.push("type = ?");
        updateParams.push(type);
      }

      if (content) {
        updateFields.push("content = ?");
        updateParams.push(content);
      }

      if (version) {
        updateFields.push("version = ?");
        updateParams.push(version);
      }

      if (isActive !== undefined) {
        updateFields.push("is_active = ?");
        updateParams.push(isActive);
      }

      if (effectiveDate !== undefined) {
        updateFields.push("effective_date = ?");
        updateParams.push(effectiveDate);
      }

      updateFields.push("updated_by = ?");
      updateParams.push(userEmail);

      if (updateFields.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "No fields to update"
        });
      }

      updateParams.push(id);

      await pool.query(
        `UPDATE legal_documents 
         SET ${updateFields.join(", ")} 
         WHERE id = UUID_TO_BIN(?)`,
        updateParams
      );

      await pool.query("COMMIT");

      res.status(200).json({ 
        success: true, 
        message: "Legal document updated successfully" 
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (err) {
    console.error("Error updating legal document:", err);
    res.status(500).json({ success: false, error: err.message });
  }
},

// Update setActiveDocument function
setActiveDocument: async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email || req.user.username;

    // Start transaction
    await pool.query("START TRANSACTION");

    try {
      // Get document type
      const [doc] = await pool.query(
        "SELECT type FROM legal_documents WHERE id = UUID_TO_BIN(?)",
        [id]
      );

      if (!doc.length) {
        await pool.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Document not found"
        });
      }

      const docType = doc[0].type;

      // Deactivate all documents of this type
      await pool.query(
        "UPDATE legal_documents SET is_active = FALSE WHERE type = ?",
        [docType]
      );

      // Activate the selected document
      await pool.query(
        "UPDATE legal_documents SET is_active = TRUE, updated_by = ? WHERE id = UUID_TO_BIN(?)",
        [userEmail, id]
      );

      await pool.query("COMMIT");

      res.status(200).json({
        success: true,
        message: "Document activated successfully"
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (err) {
    console.error("Error setting active document:", err);
    res.status(500).json({ success: false, error: err.message });
  }
},

  // Update legal document
  updateLegalDocument: async (req, res) => {
    try {
      const { id } = req.params;
      const { title, type, content, version, isActive, effectiveDate } = req.body;
      const userEmail = req.user.email || req.user.username;

      // Check if document exists
      const [existing] = await pool.query(
        "SELECT * FROM legal_documents WHERE id = UUID_TO_BIN(?)",
        [id]
      );

      if (!existing.length) {
        return res.status(404).json({
          success: false,
          message: "Legal document not found"
        });
      }

      // If activating this document, deactivate others of same type
      if (isActive === true) {
        await pool.query(
          "UPDATE legal_documents SET is_active = FALSE WHERE type = ? AND id != UUID_TO_BIN(?) AND is_active = TRUE",
          [existing[0].type, id]
        );
      }

      const updateFields = [];
      const updateParams = [];

      if (title) {
        updateFields.push("title = ?");
        updateParams.push(title);
      }

      if (type) {
        updateFields.push("type = ?");
        updateParams.push(type);
      }

      if (content) {
        updateFields.push("content = ?");
        updateParams.push(content);
      }

      if (version) {
        updateFields.push("version = ?");
        updateParams.push(version);
      }

      if (isActive !== undefined) {
        updateFields.push("is_active = ?");
        updateParams.push(isActive);
      }

      if (effectiveDate !== undefined) {
        updateFields.push("effective_date = ?");
        updateParams.push(effectiveDate);
      }

      updateFields.push("updated_by = ?");
      updateParams.push(userEmail);

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No fields to update"
        });
      }

      updateParams.push(id);

      await pool.query(
        `UPDATE legal_documents 
         SET ${updateFields.join(", ")} 
         WHERE id = UUID_TO_BIN(?)`,
        updateParams
      );

      res.status(200).json({ 
        success: true, 
        message: "Legal document updated successfully" 
      });
    } catch (err) {
      console.error("Error updating legal document:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Delete legal document
  deleteLegalDocument: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if it's the only active document of its type
      const [document] = await pool.query(
        "SELECT type, is_active FROM legal_documents WHERE id = UUID_TO_BIN(?)",
        [id]
      );

      if (!document.length) {
        return res.status(404).json({
          success: false,
          message: "Legal document not found"
        });
      }

      // Check if this is the only active document of its type
      if (document[0].is_active) {
        const [otherActive] = await pool.query(
          "SELECT COUNT(*) as count FROM legal_documents WHERE type = ? AND is_active = TRUE AND id != UUID_TO_BIN(?)",
          [document[0].type, id]
        );

        if (otherActive[0].count === 0) {
          return res.status(400).json({
            success: false,
            message: "Cannot delete the only active document of this type. Please activate another document first."
          });
        }
      }

      await pool.query(
        "DELETE FROM legal_documents WHERE id = UUID_TO_BIN(?)",
        [id]
      );

      res.status(200).json({ 
        success: true, 
        message: "Legal document deleted successfully" 
      });
    } catch (err) {
      console.error("Error deleting legal document:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Get document types and their active versions
  getDocumentTypes: async (req, res) => {
    try {
      const [types] = await pool.query(`
        SELECT 
          type,
          COUNT(*) as totalVersions,
          MAX(updated_at) as latestUpdate,
          SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as activeCount
        FROM legal_documents
        GROUP BY type
        ORDER BY type
      `);

      // Get the active document for each type
      const typeDetails = await Promise.all(
        types.map(async (typeInfo) => {
          const [activeDoc] = await pool.query(
            `SELECT 
              BIN_TO_UUID(id) as id,
              title,
              version,
              updated_at as updatedAt
             FROM legal_documents 
             WHERE type = ? AND is_active = TRUE
             ORDER BY updated_at DESC
             LIMIT 1`,
            [typeInfo.type]
          );

          return {
            type: typeInfo.type,
            typeName: typeInfo.type.replace(/_/g, ' '),
            activeDocument: activeDoc[0] || null,
            totalVersions: typeInfo.totalVersions,
            latestUpdate: typeInfo.latestUpdate
          };
        })
      );

      res.status(200).json({
        success: true,
        data: typeDetails
      });
    } catch (err) {
      console.error("Error fetching document types:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // Set active document
  setActiveDocument: async (req, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.email || req.user.username;

      // Get document type
      const [doc] = await pool.query(
        "SELECT type FROM legal_documents WHERE id = UUID_TO_BIN(?)",
        [id]
      );

      if (!doc.length) {
        return res.status(404).json({
          success: false,
          message: "Document not found"
        });
      }

      // Deactivate all documents of this type
      await pool.query(
        "UPDATE legal_documents SET is_active = FALSE WHERE type = ?",
        [doc[0].type]
      );

      // Activate the selected document
      await pool.query(
        "UPDATE legal_documents SET is_active = TRUE, updated_by = ? WHERE id = UUID_TO_BIN(?)",
        [userEmail, id]
      );

      res.status(200).json({
        success: true,
        message: "Document activated successfully"
      });
    } catch (err) {
      console.error("Error setting active document:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
};

export default legalController;