import pool from "../../../database.js";
import { v4 as uuidv4 } from "uuid";
import walletController from "../wallet/walletController.js";
import {
  AdminListVouchersSchema,
  CreateVoucherSchema,
  RedeemVoucherSchema,
  UpdateVoucherSchema,
  ValidateVoucherSchema,
} from "./voucher_validation.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(length = 8) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function parseDateInputToMysql(dateStr) {
  // Accept YYYY-MM-DD or DD/MM/YYYY. Return "YYYY-MM-DD 00:00:00"
  const trimmed = String(dateStr).trim();

  let year;
  let month;
  let day;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-");
    year = Number(y);
    month = Number(m);
    day = Number(d);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split("/");
    year = Number(y);
    month = Number(m);
    day = Number(d);
  } else {
    throw new Error("Invalid date format");
  }

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error("Invalid date value");
  }

  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} 00:00:00`;
}

function computeVoucherStatus(row) {
  const now = Date.now();
  const start = new Date(row.start_date).getTime();
  const expiry = new Date(row.expiry_date).getTime();

  if (!row.is_active) return "inactive";
  if (Number.isNaN(start) || Number.isNaN(expiry)) return "inactive";
  if (now < start) return "scheduled";
  if (now > expiry) return "expired";
  return "active";
}

async function findVoucherByCode(client, code, { forUpdate = false } = {}) {
  const lock = forUpdate ? "FOR UPDATE" : "";

  const [codeRows] = await client.query(
    `SELECT
      BIN_TO_UUID(vc.id) AS id,
      BIN_TO_UUID(vc.voucher_id) AS voucher_id,
      vc.code,
      vc.status,
      BIN_TO_UUID(vc.redeemed_by) AS redeemed_by,
      vc.redeemed_at
     FROM voucher_codes vc
     WHERE vc.code = ?
     LIMIT 1 ${lock}`,
    [code]
  );

  if (codeRows[0]) {
    const voucherId = codeRows[0].voucher_id;
    const [voucherRows] = await client.query(
      `SELECT
        BIN_TO_UUID(v.id) AS id,
        v.code,
        v.code_prefix,
        v.campaign_name,
        v.voucher_type,
        v.reward_type,
        v.reward_value,
        v.start_date,
        v.expiry_date,
        v.usage_limit,
        v.times_redeemed,
        v.bulk_quantity,
        v.bulk_generated,
        v.bulk_code_length,
        v.is_active
       FROM vouchers v
       WHERE v.id = UUID_TO_BIN(?)
       LIMIT 1 ${lock}`,
      [voucherId]
    );

    return { voucher: voucherRows[0] || null, voucherCode: codeRows[0] };
  }

  const [voucherRows] = await client.query(
    `SELECT
      BIN_TO_UUID(v.id) AS id,
      v.code,
      v.code_prefix,
      v.campaign_name,
      v.voucher_type,
      v.reward_type,
      v.reward_value,
      v.start_date,
      v.expiry_date,
      v.usage_limit,
      v.times_redeemed,
      v.bulk_quantity,
      v.bulk_generated,
      v.bulk_code_length,
      v.is_active
     FROM vouchers v
     WHERE v.code = ?
     LIMIT 1 ${lock}`,
    [code]
  );

  return { voucher: voucherRows[0] || null, voucherCode: null };
}

const voucherController = {
  // ADMIN: Create voucher (supports auto-code generation)
  createVoucher: async (req, res) => {
    const parsed = CreateVoucherSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        campaign_name,
        voucher_type,
        reward_type,
        reward_value,
        start_date,
        expiry_date,
        usage_limit,
        code_prefix,
        bulk_quantity,
        bulk_code_length,
      } = parsed.data;

      const startMysql = parseDateInputToMysql(start_date);
      const expiryMysql = parseDateInputToMysql(expiry_date);

      let usageLimit = usage_limit;
      let bulkQuantity = voucher_type === "BULK_CODES" ? bulk_quantity : 0;
      let bulkGenerated = 0;

      // If code blank => auto-generate. Try a few times to avoid collisions.
      let code = parsed.data.code;
      if (!code) {
        for (let i = 0; i < 10; i += 1) {
          const candidate = generateCode(8);
          const [exists] = await connection.query(
            `SELECT 1 FROM vouchers WHERE code = ? LIMIT 1`,
            [candidate]
          );
          if (exists.length === 0) {
            code = candidate;
            break;
          }
        }
      }

      if (!code) {
        throw new Error("Failed to generate unique voucher code");
      }

      const voucherId = uuidv4();
      const createdBy = req.user?.id || null;

      let bulkCodes = [];
      if (voucher_type === "BULK_CODES") {
        usageLimit = bulkQuantity;
        const prefix = code_prefix || "";
        const targetLength = Math.min(32, Math.max(4, bulk_code_length));
        const suffixLength = Math.max(4, targetLength - prefix.length);
        const maxAttempts = Math.max(bulkQuantity * 8, 16);
        const unique = new Set();
        let attempts = 0;

        while (unique.size < bulkQuantity && attempts < maxAttempts) {
          attempts += 1;
          const candidate = `${prefix}${generateCode(suffixLength)}`
            .slice(0, targetLength)
            .toUpperCase();
          unique.add(candidate);
        }

        if (unique.size !== bulkQuantity) {
          throw new Error("Failed to generate bulk voucher codes");
        }

        bulkCodes = Array.from(unique);
        bulkGenerated = bulkCodes.length;
      }

      await connection.query(
        `INSERT INTO vouchers (
          id, code, code_prefix, campaign_name, voucher_type, reward_type, reward_value,
          start_date, expiry_date, usage_limit, times_redeemed, bulk_quantity, bulk_generated,
          bulk_code_length, is_active, created_by
        ) VALUES (
          UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, TRUE, ${
            createdBy ? "UUID_TO_BIN(?)" : "NULL"
          }
        )`,
        createdBy
          ? [
              voucherId,
              code,
              code_prefix || null,
              campaign_name,
              voucher_type,
              reward_type,
              reward_value,
              startMysql,
              expiryMysql,
              usageLimit,
              bulkQuantity,
              bulkGenerated,
              bulk_code_length,
              createdBy,
            ]
          : [
              voucherId,
              code,
              code_prefix || null,
              campaign_name,
              voucher_type,
              reward_type,
              reward_value,
              startMysql,
              expiryMysql,
              usageLimit,
              bulkQuantity,
              bulkGenerated,
              bulk_code_length,
            ]
      );

      if (voucher_type === "BULK_CODES" && bulkCodes.length > 0) {
        const valuesSql = bulkCodes
          .map(() => "(UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'AVAILABLE')")
          .join(", ");
        const valueParams = bulkCodes.flatMap((c) => [uuidv4(), voucherId, c]);
        await connection.query(
          `INSERT INTO voucher_codes (id, voucher_id, code, status) VALUES ${valuesSql}`,
          valueParams
        );
      }

      await connection.commit();
      return res.status(201).json({
        success: true,
        message: "Voucher created",
        data: {
          id: voucherId,
          code,
          campaign_name,
          voucher_type,
          reward_type,
          reward_value,
          start_date: startMysql,
          expiry_date: expiryMysql,
          usage_limit: usageLimit,
          code_prefix: code_prefix || null,
          bulk_quantity: bulkQuantity,
          bulk_generated: bulkGenerated,
          bulk_code_length,
        },
      });
    } catch (error) {
      await connection.rollback();

      // Duplicate code
      if (error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "Voucher code already exists",
        });
      }

      console.error("createVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create voucher",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    } finally {
      connection.release();
    }
  },

  // ADMIN: List vouchers
  listVouchers: async (req, res) => {
    const parsed = AdminListVouchersSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid query params",
        details: parsed.error.errors,
      });
    }

    const { page, limit, q, is_active, status, type, sort } = parsed.data;
    const offset = (page - 1) * limit;

    try {
      const where = [];
      const params = [];

      if (q) {
        where.push("(v.code LIKE ? OR v.campaign_name LIKE ?)");
        params.push(`%${q}%`, `%${q}%`);
      }

      if (typeof is_active === "boolean") {
        where.push("v.is_active = ?");
        params.push(is_active);
      }

      if (type) {
        where.push("v.voucher_type = ?");
        params.push(type);
      }

      if (status) {
        if (status === "active") {
          where.push(
            "v.is_active = TRUE AND NOW() BETWEEN v.start_date AND v.expiry_date"
          );
        } else if (status === "expired") {
          where.push("NOW() > v.expiry_date");
        } else if (status === "scheduled") {
          where.push("v.is_active = TRUE AND NOW() < v.start_date");
        } else if (status === "inactive") {
          where.push("v.is_active = FALSE");
        }
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      let orderSql = "v.created_at DESC";
      if (sort === "value_desc") {
        orderSql = "v.reward_value DESC";
      } else if (sort === "expiry_asc") {
        orderSql = "v.expiry_date ASC";
      } else if (sort === "usage_desc") {
        orderSql =
          "CASE WHEN v.usage_limit = 0 THEN 0 ELSE (v.times_redeemed / v.usage_limit) END DESC, v.times_redeemed DESC";
      } else if (sort === "usage_asc") {
        orderSql =
          "CASE WHEN v.usage_limit = 0 THEN 0 ELSE (v.times_redeemed / NULLIF(v.usage_limit, 0)) END ASC, v.times_redeemed ASC";
      }

      const [rows] = await pool.query(
        `SELECT
          BIN_TO_UUID(v.id) AS id,
          v.code,
          v.code_prefix,
          v.campaign_name,
          v.voucher_type,
          v.reward_type,
          v.reward_value,
          v.start_date,
          v.expiry_date,
          v.usage_limit,
          v.times_redeemed,
          v.bulk_quantity,
          v.bulk_generated,
          v.bulk_code_length,
          v.is_active,
          v.created_at,
          v.updated_at,
          CASE
            WHEN v.is_active = FALSE THEN 'inactive'
            WHEN NOW() < v.start_date THEN 'scheduled'
            WHEN NOW() > v.expiry_date THEN 'expired'
            ELSE 'active'
          END AS status,
          CASE WHEN v.usage_limit = 0 THEN NULL ELSE GREATEST(v.usage_limit - v.times_redeemed, 0) END AS usage_remaining,
          CASE WHEN v.usage_limit = 0 THEN NULL ELSE ROUND((v.times_redeemed / v.usage_limit) * 100, 2) END AS usage_percent
         FROM vouchers v
         ${whereSql}
         ORDER BY ${orderSql}
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM vouchers v
         ${whereSql}`,
        params
      );

      const total = Number(countRows?.[0]?.total || 0);

      const [statusCountsRows] = await pool.query(
        `SELECT
          COUNT(*) AS total,
          SUM(v.is_active = TRUE AND NOW() BETWEEN v.start_date AND v.expiry_date) AS active,
          SUM(NOW() > v.expiry_date) AS expired,
          SUM(v.is_active = FALSE) AS inactive,
          SUM(v.is_active = TRUE AND NOW() < v.start_date) AS scheduled
         FROM vouchers v`
      );

      const counts = {
        total: Number(statusCountsRows?.[0]?.total || 0),
        active: Number(statusCountsRows?.[0]?.active || 0),
        expired: Number(statusCountsRows?.[0]?.expired || 0),
        inactive: Number(statusCountsRows?.[0]?.inactive || 0),
        scheduled: Number(statusCountsRows?.[0]?.scheduled || 0),
      };

      return res.json({
        success: true,
        data: {
          vouchers: rows,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit) || 1,
          },
          counts,
        },
      });
    } catch (error) {
      console.error("listVouchers error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to list vouchers",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // ADMIN: Overview cards / stats for dashboard
  getOverview: async (_req, res) => {
    try {
      const [overviewRows] = await pool.query(
        `SELECT
          COUNT(*) AS total,
          SUM(v.is_active = TRUE AND NOW() BETWEEN v.start_date AND v.expiry_date) AS active,
          SUM(NOW() > v.expiry_date) AS expired,
          SUM(CASE WHEN v.is_active = TRUE AND NOW() BETWEEN v.start_date AND v.expiry_date THEN
            CASE WHEN v.usage_limit = 0 THEN 0 ELSE GREATEST(v.usage_limit - v.times_redeemed, 0) * v.reward_value END
          END) AS active_value
         FROM vouchers v`
      );

      const [todayRows] = await pool.query(
        `SELECT COUNT(*) AS redeemed_today FROM voucher_redemptions WHERE DATE(redeemed_at) = CURDATE()`
      );
      const [yesterdayRows] = await pool.query(
        `SELECT COUNT(*) AS redeemed_yesterday FROM voucher_redemptions WHERE DATE(redeemed_at) = CURDATE() - INTERVAL 1 DAY`
      );
      const today = Number(todayRows?.[0]?.redeemed_today || 0);
      const yesterday = Number(yesterdayRows?.[0]?.redeemed_yesterday || 0);
      const changePct =
        yesterday === 0
          ? today > 0
            ? 100
            : 0
          : ((today - yesterday) / yesterday) * 100;

      const [creditRows] = await pool.query(
        `SELECT COALESCE(SUM(reward_value), 0) AS total_credit FROM voucher_redemptions`
      );

      const [recentRedemptionRows] = await pool.query(
        `SELECT COUNT(*) AS redemptions_30d FROM voucher_redemptions WHERE redeemed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
      );
      const [recentSupplyRows] = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN v.usage_limit = 0 THEN NULL ELSE v.usage_limit END), 0) AS supply_30d
         FROM vouchers v
         WHERE v.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
      );

      const redemptions30d = Number(
        recentRedemptionRows?.[0]?.redemptions_30d || 0
      );
      const supply30d = Number(recentSupplyRows?.[0]?.supply_30d || 0);
      const redemptionRate30d =
        supply30d > 0 ? (redemptions30d / supply30d) * 100 : 0;

      const overview = overviewRows?.[0] || {};

      return res.json({
        success: true,
        data: {
          total_vouchers: Number(overview.total || 0),
          expired: Number(overview.expired || 0),
          active: Number(overview.active || 0),
          active_value: Number(overview.active_value || 0),
          redeemed_today: today,
          redeemed_change_pct: Number(changePct.toFixed(2)),
          total_credit_distributed: Number(creditRows?.[0]?.total_credit || 0),
          redemption_rate_30d: Number(redemptionRate30d.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("getOverview error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch voucher overview",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // ADMIN: Export vouchers as CSV (applies same filters as list)
  exportVouchers: async (req, res) => {
    const parsed = AdminListVouchersSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid query params",
        details: parsed.error.errors,
      });
    }

    const { q, is_active, status, type, sort } = parsed.data;

    try {
      const where = [];
      const params = [];

      if (q) {
        where.push("(v.code LIKE ? OR v.campaign_name LIKE ?)");
        params.push(`%${q}%`, `%${q}%`);
      }

      if (typeof is_active === "boolean") {
        where.push("v.is_active = ?");
        params.push(is_active);
      }

      if (type) {
        where.push("v.voucher_type = ?");
        params.push(type);
      }

      if (status) {
        if (status === "active") {
          where.push(
            "v.is_active = TRUE AND NOW() BETWEEN v.start_date AND v.expiry_date"
          );
        } else if (status === "expired") {
          where.push("NOW() > v.expiry_date");
        } else if (status === "scheduled") {
          where.push("v.is_active = TRUE AND NOW() < v.start_date");
        } else if (status === "inactive") {
          where.push("v.is_active = FALSE");
        }
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      let orderSql = "v.created_at DESC";
      if (sort === "value_desc") {
        orderSql = "v.reward_value DESC";
      } else if (sort === "expiry_asc") {
        orderSql = "v.expiry_date ASC";
      } else if (sort === "usage_desc") {
        orderSql =
          "CASE WHEN v.usage_limit = 0 THEN 0 ELSE (v.times_redeemed / v.usage_limit) END DESC, v.times_redeemed DESC";
      } else if (sort === "usage_asc") {
        orderSql =
          "CASE WHEN v.usage_limit = 0 THEN 0 ELSE (v.times_redeemed / NULLIF(v.usage_limit, 0)) END ASC, v.times_redeemed ASC";
      }

      const [rows] = await pool.query(
        `SELECT
          BIN_TO_UUID(v.id) AS id,
          v.code,
          v.code_prefix,
          v.campaign_name,
          v.voucher_type,
          v.reward_type,
          v.reward_value,
          v.start_date,
          v.expiry_date,
          v.usage_limit,
          v.times_redeemed,
          v.bulk_quantity,
          v.bulk_generated,
          v.bulk_code_length,
          v.is_active,
          v.created_at,
          v.updated_at,
          CASE
            WHEN v.is_active = FALSE THEN 'inactive'
            WHEN NOW() < v.start_date THEN 'scheduled'
            WHEN NOW() > v.expiry_date THEN 'expired'
            ELSE 'active'
          END AS status,
          CASE WHEN v.usage_limit = 0 THEN NULL ELSE GREATEST(v.usage_limit - v.times_redeemed, 0) END AS usage_remaining,
          CASE WHEN v.usage_limit = 0 THEN NULL ELSE ROUND((v.times_redeemed / v.usage_limit) * 100, 2) END AS usage_percent
         FROM vouchers v
         ${whereSql}
         ORDER BY ${orderSql}`,
        params
      );

      const headers = [
        "Voucher ID",
        "Code",
        "Campaign",
        "Type",
        "Reward Type",
        "Reward Value",
        "Usage Limit",
        "Times Redeemed",
        "Usage Remaining",
        "Usage %",
        "Status",
        "Active",
        "Start Date",
        "Expiry Date",
        "Created At",
        "Updated At",
      ];

      const toCsvValue = (value) => {
        if (value === null || value === undefined) return "";
        const str = String(value);
        if (/[",\n]/.test(str)) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvBody = rows
        .map((row) =>
          [
            row.id,
            row.code,
            row.campaign_name,
            row.voucher_type,
            row.reward_type,
            row.reward_value,
            row.usage_limit,
            row.times_redeemed,
            row.usage_remaining,
            row.usage_percent,
            row.status,
            row.is_active ? "TRUE" : "FALSE",
            row.start_date,
            row.expiry_date,
            row.created_at,
            row.updated_at,
          ]
            .map(toCsvValue)
            .join(",")
        )
        .join("\n");

      const csv = `${headers.join(",")}\n${csvBody}`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="vouchers.csv"'
      );
      return res.status(200).send(csv);
    } catch (error) {
      console.error("exportVouchers error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to export vouchers",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // ADMIN: Toggle active flag
  toggleVoucher: async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body || {};

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_active flag is required",
      });
    }

    try {
      const [result] = await pool.query(
        `UPDATE vouchers SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = UUID_TO_BIN(?)`,
        [is_active, id]
      );

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Voucher not found" });
      }

      return res.json({ success: true, message: "Voucher status updated" });
    } catch (error) {
      console.error("toggleVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update voucher",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // ADMIN: Delete a voucher
  deleteVoucher: async (req, res) => {
    const { id } = req.params;

    try {
      const [result] = await pool.query(
        `DELETE FROM vouchers WHERE id = UUID_TO_BIN(?)`,
        [id]
      );

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Voucher not found" });
      }

      return res.json({ success: true, message: "Voucher deleted" });
    } catch (error) {
      console.error("deleteVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete voucher",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // ADMIN: Get voucher
  getVoucher: async (req, res) => {
    const { id } = req.params;
    try {
      const [rows] = await pool.query(
        `SELECT
          BIN_TO_UUID(v.id) AS id,
          v.code,
          v.code_prefix,
          v.campaign_name,
          v.voucher_type,
          v.reward_type,
          v.reward_value,
          v.start_date,
          v.expiry_date,
          v.usage_limit,
          v.times_redeemed,
          v.bulk_quantity,
          v.bulk_generated,
          v.bulk_code_length,
          v.is_active,
          v.created_at,
          v.updated_at,
          CASE
            WHEN v.is_active = FALSE THEN 'inactive'
            WHEN NOW() < v.start_date THEN 'scheduled'
            WHEN NOW() > v.expiry_date THEN 'expired'
            ELSE 'active'
          END AS status,
          CASE WHEN v.usage_limit = 0 THEN NULL ELSE GREATEST(v.usage_limit - v.times_redeemed, 0) END AS usage_remaining,
          CASE WHEN v.usage_limit = 0 THEN NULL ELSE ROUND((v.times_redeemed / v.usage_limit) * 100, 2) END AS usage_percent
         FROM vouchers v
         WHERE v.id = UUID_TO_BIN(?)
         LIMIT 1`,
        [id]
      );

      if (!rows[0]) {
        return res
          .status(404)
          .json({ success: false, message: "Voucher not found" });
      }

      return res.json({ success: true, data: rows[0] });
    } catch (error) {
      console.error("getVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get voucher",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // ADMIN: Update voucher
  updateVoucher: async (req, res) => {
    const { id } = req.params;
    const parsed = UpdateVoucherSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const updates = parsed.data;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No updates provided",
      });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [existingRows] = await connection.query(
        `SELECT BIN_TO_UUID(id) AS id, voucher_type, bulk_quantity FROM vouchers WHERE id = UUID_TO_BIN(?) LIMIT 1 FOR UPDATE`,
        [id]
      );
      if (!existingRows[0]) {
        await connection.rollback();
        return res
          .status(404)
          .json({ success: false, message: "Voucher not found" });
      }

      const currentType = existingRows[0].voucher_type;

      const sqlParts = [];
      const params = [];

      let nextUsageLimit = updates.usage_limit;

      if (updates.campaign_name !== undefined) {
        sqlParts.push("campaign_name = ?");
        params.push(updates.campaign_name);
      }
      if (updates.voucher_type !== undefined) {
        sqlParts.push("voucher_type = ?");
        params.push(updates.voucher_type);
      }
      if (updates.reward_type !== undefined) {
        sqlParts.push("reward_type = ?");
        params.push(updates.reward_type);
      }
      if (updates.reward_value !== undefined) {
        sqlParts.push("reward_value = ?");
        params.push(updates.reward_value);
      }
      if (updates.start_date !== undefined) {
        sqlParts.push("start_date = ?");
        params.push(parseDateInputToMysql(updates.start_date));
      }
      if (updates.expiry_date !== undefined) {
        sqlParts.push("expiry_date = ?");
        params.push(parseDateInputToMysql(updates.expiry_date));
      }
      if (updates.usage_limit !== undefined) {
        sqlParts.push("usage_limit = ?");
        params.push(updates.usage_limit);
      }
      if (updates.is_active !== undefined) {
        sqlParts.push("is_active = ?");
        params.push(updates.is_active);
      }

      if (updates.code_prefix !== undefined) {
        sqlParts.push("code_prefix = ?");
        params.push(updates.code_prefix || null);
      }

      if (updates.bulk_quantity !== undefined) {
        sqlParts.push("bulk_quantity = ?");
        params.push(updates.bulk_quantity);

        if (
          nextUsageLimit === undefined &&
          (updates.voucher_type === "BULK_CODES" ||
            currentType === "BULK_CODES")
        ) {
          sqlParts.push("usage_limit = ?");
          params.push(updates.bulk_quantity);
        }
      }

      if (updates.bulk_code_length !== undefined) {
        sqlParts.push("bulk_code_length = ?");
        params.push(updates.bulk_code_length);
      }

      await connection.query(
        `UPDATE vouchers SET ${sqlParts.join(
          ", "
        )}, updated_at = CURRENT_TIMESTAMP WHERE id = UUID_TO_BIN(?)`,
        [...params, id]
      );

      await connection.commit();
      return res.json({ success: true, message: "Voucher updated" });
    } catch (error) {
      await connection.rollback();
      console.error("updateVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update voucher",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    } finally {
      connection.release();
    }
  },

  // USER: Validate a code (does not redeem)
  validateVoucher: async (req, res) => {
    const parsed = ValidateVoucherSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const code = parsed.data.code;
    const userId = req.user?.id;

    try {
      const { voucher, voucherCode } = await findVoucherByCode(pool, code);

      if (!voucher) {
        return res
          .status(404)
          .json({ success: false, message: "Voucher not found" });
      }

      const status = computeVoucherStatus(voucher);

      let alreadyRedeemed = false;
      if (voucherCode && voucherCode.redeemed_by) {
        alreadyRedeemed = Boolean(userId) && voucherCode.redeemed_by === userId;
      }

      if (!alreadyRedeemed && userId) {
        const [redeemRows] = await pool.query(
          `SELECT 1 FROM voucher_redemptions vr
           WHERE vr.voucher_id = UUID_TO_BIN(?) AND vr.user_id = UUID_TO_BIN(?)
           LIMIT 1`,
          [voucher.id, userId]
        );
        alreadyRedeemed = redeemRows.length > 0;
      }

      const hasUses =
        voucher.usage_limit === 0 ||
        voucher.times_redeemed < voucher.usage_limit;
      const isCodeAvailable = voucherCode
        ? voucherCode.status === "AVAILABLE"
        : true;
      const ok = Boolean(
        voucher.is_active &&
          status === "active" &&
          hasUses &&
          isCodeAvailable &&
          !alreadyRedeemed
      );

      return res.json({
        success: true,
        data: {
          ok,
          alreadyRedeemed,
          voucher: {
            id: voucher.id,
            code: voucherCode?.code || voucher.code,
            campaign_name: voucher.campaign_name,
            voucher_type: voucher.voucher_type,
            reward_type: voucher.reward_type,
            reward_value: voucher.reward_value,
            start_date: voucher.start_date,
            expiry_date: voucher.expiry_date,
            usage_limit: voucher.usage_limit,
            times_redeemed: voucher.times_redeemed,
            is_active: voucher.is_active,
            status,
            code_status: voucherCode?.status || null,
          },
        },
      });
    } catch (error) {
      console.error("validateVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to validate voucher",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // USER: Redeem a voucher, apply reward
  redeemVoucher: async (req, res) => {
    const parsed = RedeemVoucherSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const code = parsed.data.code;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { voucher, voucherCode } = await findVoucherByCode(
        connection,
        code,
        {
          forUpdate: true,
        }
      );

      if (!voucher) {
        await connection.rollback();
        return res
          .status(404)
          .json({ success: false, message: "Voucher not found" });
      }

      if (!voucher.is_active) {
        await connection.rollback();
        return res
          .status(400)
          .json({ success: false, message: "Voucher is inactive" });
      }

      const now = new Date();
      const start = new Date(voucher.start_date);
      const expiry = new Date(voucher.expiry_date);

      if (!(now >= start && now <= expiry)) {
        await connection.rollback();
        return res
          .status(400)
          .json({ success: false, message: "Voucher is not currently valid" });
      }

      if (
        voucher.usage_limit > 0 &&
        voucher.times_redeemed >= voucher.usage_limit
      ) {
        await connection.rollback();
        return res
          .status(400)
          .json({ success: false, message: "Voucher usage limit reached" });
      }

      if (voucherCode && voucherCode.status !== "AVAILABLE") {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "Voucher code has already been redeemed",
        });
      }

      if (voucher.reward_type !== "SITE_CREDIT") {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Unsupported reward type: ${voucher.reward_type}`,
        });
      }

      // Insert redemption (unique per voucher/user)
      const redemptionId = uuidv4();
      await connection.query(
        `INSERT INTO voucher_redemptions (
          id, voucher_id, voucher_code_id, user_id, reward_type, reward_value, metadata
        ) VALUES (
          UUID_TO_BIN(?), UUID_TO_BIN(?), ${
            voucherCode ? "UUID_TO_BIN(?)" : "NULL"
          }, UUID_TO_BIN(?), ?, ?, ?
        )`,
        voucherCode
          ? [
              redemptionId,
              voucher.id,
              voucherCode.id,
              userId,
              voucher.reward_type,
              voucher.reward_value,
              JSON.stringify({
                code: voucherCode.code,
                campaign_name: voucher.campaign_name,
              }),
            ]
          : [
              redemptionId,
              voucher.id,
              userId,
              voucher.reward_type,
              voucher.reward_value,
              JSON.stringify({
                code: voucher.code,
                campaign_name: voucher.campaign_name,
              }),
            ]
      );

      if (voucherCode) {
        await connection.query(
          `UPDATE voucher_codes
           SET status = 'REDEEMED', redeemed_by = UUID_TO_BIN(?), redeemed_at = CURRENT_TIMESTAMP
           WHERE id = UUID_TO_BIN(?)`,
          [userId, voucherCode.id]
        );
      }

      // Update usage counter
      await connection.query(
        `UPDATE vouchers SET times_redeemed = times_redeemed + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = UUID_TO_BIN(?)`,
        [voucher.id]
      );

      const rewardResult = await walletController.static.addSiteCredit(
        connection,
        userId,
        Number(voucher.reward_value),
        `Voucher ${voucherCode?.code || voucher.code}`,
        "CREDIT"
      );

      await connection.commit();

      return res.json({
        success: true,
        message: "Voucher redeemed",
        data: {
          redemptionId,
          voucher: {
            id: voucher.id,
            code: voucherCode?.code || voucher.code,
            campaign_name: voucher.campaign_name,
            reward_type: voucher.reward_type,
            reward_value: voucher.reward_value,
          },
          wallet: rewardResult,
        },
      });
    } catch (error) {
      await connection.rollback();

      if (error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "You have already redeemed this voucher",
        });
      }

      console.error("redeemVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to redeem voucher",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    } finally {
      connection.release();
    }
  },
};

export default voucherController;
