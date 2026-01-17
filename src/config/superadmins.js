import { uuidv4 } from "zod";

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
      if (!superadmin.email || !superadmin.password_hash) {
        console.error(
          `Skipping superadmin: Missing email or password for ${superadmin.username}`
        );
        continue;
      }

      // Check if superadmin already exists
      const [existing] = await pool.query(
        `SELECT id FROM users WHERE email = ? AND role = 'SUPERADMIN'`,
        [superadmin.email]
      );

      if (existing.length > 0) {
        console.log(
          `Superadmin already exists: ${superadmin.email} (skipping)`
        );
        continue;
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(superadmin.password_hash, salt);
       const Id = uuidv4();
      // Correct INSERT with all 8 columns
      await pool.query(
        `INSERT INTO users (
          id, email, username, password_hash, first_name, last_name,
          role, is_active,email_verified
        ) VALUES (
          UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, ?, ?,?
        )`,
        [
          superadmin.email,
          superadmin.username,
          hashedPassword,
          superadmin.first_name,
          superadmin.last_name,
          superadmin.role,
          superadmin.is_active,
          superadmin.email_verified
        ]
      );

      console.log(`Superadmin created: ${superadmin.email}`);
    }

    console.log("Superadmins initialization completed");
  } catch (error) {
    console.error("Error initializing superadmins:", error);
  }
}
