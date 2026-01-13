import pool from "../../../database.js";
import { v4 as uuidv4 } from "uuid";

function mapRow(row) {
  return {
    id: row.id,
    scope: row.scope,
    question: row.question,
    answer: row.answer,
    is_published: Boolean(row.is_published),
    sort_order: Number(row.sort_order ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listFaqs({ scope, publishedOnly } = {}) {
  const where = [];
  const params = [];

  if (scope) {
    where.push("scope = ?");
    params.push(scope);
  }

  if (publishedOnly) {
    where.push("is_published = TRUE");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT BIN_TO_UUID(id) as id, scope, question, answer, is_published, sort_order, created_at, updated_at
     FROM faqs
     ${whereSql}
     ORDER BY scope ASC, sort_order ASC, created_at ASC`,
    params
  );

  return rows.map(mapRow);
}

async function getFaqById(id) {
  const [rows] = await pool.query(
    `SELECT BIN_TO_UUID(id) as id, scope, question, answer, is_published, sort_order, created_at, updated_at
     FROM faqs
     WHERE id = UUID_TO_BIN(?)`,
    [id]
  );

  if (!rows.length) return null;
  return mapRow(rows[0]);
}

async function createFaq({
  scope,
  question,
  answer,
  is_published = true,
  sort_order,
}) {
  const id = uuidv4();

  let resolvedSort = sort_order;
  if (!resolvedSort) {
    const [maxRows] = await pool.query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM faqs WHERE scope = ?`,
      [scope]
    );
    resolvedSort = Number(maxRows?.[0]?.next_order ?? 1);
  }

  await pool.query(
    `INSERT INTO faqs (id, scope, question, answer, is_published, sort_order)
     VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?)`,
    [id, scope, question, answer, is_published ? 1 : 0, resolvedSort]
  );

  return await getFaqById(id);
}

async function updateFaq(id, patch) {
  const allowed = ["scope", "question", "answer", "is_published", "sort_order"];
  const sets = [];
  const params = [];

  for (const key of allowed) {
    if (patch[key] === undefined) continue;
    sets.push(`${key} = ?`);
    if (key === "is_published") params.push(patch[key] ? 1 : 0);
    else params.push(patch[key]);
  }

  if (!sets.length) return await getFaqById(id);

  params.push(id);

  const [result] = await pool.query(
    `UPDATE faqs SET ${sets.join(", ")}
     WHERE id = UUID_TO_BIN(?)`,
    params
  );

  if (result.affectedRows === 0) return null;
  return await getFaqById(id);
}

async function setPublish(id, is_published) {
  const [result] = await pool.query(
    `UPDATE faqs SET is_published = ? WHERE id = UUID_TO_BIN(?)`,
    [is_published ? 1 : 0, id]
  );
  if (result.affectedRows === 0) return null;
  return await getFaqById(id);
}

async function deleteFaq(id) {
  const [result] = await pool.query(
    `DELETE FROM faqs WHERE id = UUID_TO_BIN(?)`,
    [id]
  );
  return result.affectedRows > 0;
}

async function reorderFaqs(scope, ids) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (let i = 0; i < ids.length; i++) {
      const faqId = ids[i];
      const sortOrder = i + 1;
      await conn.query(
        `UPDATE faqs SET sort_order = ? WHERE id = UUID_TO_BIN(?) AND scope = ?`,
        [sortOrder, faqId, scope]
      );
    }

    await conn.commit();
    return await listFaqs({ scope, publishedOnly: false });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export default {
  listFaqs,
  getFaqById,
  createFaq,
  updateFaq,
  setPublish,
  deleteFaq,
  reorderFaqs,
};
