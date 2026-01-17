import { v4 as uuidv4 } from "uuid"; // <-- standard uuid library

export const HARDCODED_SUPERADMINS = [
  {
    email: "superadmin@communityfortune.com",
    username: "superadmin",
    password_hash: "SuperAdmin@123!",
    first_name: "System",
    last_name: "Superadmin",
    role: "SUPERADMIN",
    is_active: true,
    email_verified: 1,
  },
];

export async function initializeSuperadmins(pool) {
  try {
    const bcrypt = await import("bcryptjs");

    for (const superadmin of HARDCODED_SUPERADMINS) {
      if (!superadmin.email || !superadmin.password_hash) continue;

      // Check if superadmin exists
      const [existing] = await pool.query(
        `SELECT id FROM users WHERE email = ? AND role = 'SUPERADMIN'`,
        [superadmin.email]
      );
      if (existing.length > 0) continue;

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(superadmin.password_hash, salt);

      // Generate UUID in JS
      const id = uuidv4();

      // Insert superadmin
      await pool.query(
        `INSERT INTO users (
          id, email, username, password_hash, first_name, last_name,
          role, is_active, email_verified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          superadmin.email,
          superadmin.username,
          hashedPassword,
          superadmin.first_name,
          superadmin.last_name,
          superadmin.role,
          superadmin.is_active,
          superadmin.email_verified,
        ]
      );

      console.log(`Superadmin created: ${superadmin.email}`);
    }

    console.log("Superadmins initialization completed");
  } catch (error) {
    console.error("Error initializing superadmins:", error);
  }
}
