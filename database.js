import "dotenv/config";
import mysql from "mysql2/promise";
 
//http://localhost:4000/admin-ui/winners-circle.html

//lexExtract values from Railway's variable references if needed
const getEnvValue = (value) => {
  if (value && value.startsWith("${{") && value.endsWith("}}")) {
    const key = value.replace("${{", "").replace("}}", "");
    return process.env[key] || value;
  }
  return value;
};

const pool = mysql.createPool({
  host:
    getEnvValue(process.env.MYSQLHOST) || process.env.DB_HOST || "localhost",
  user: getEnvValue(process.env.MYSQLUSER) || process.env.DB_USER || "root",
  password:
    getEnvValue(process.env.MYSQLPASSWORD) || process.env.DB_PASSWORD || "",
  database:
    getEnvValue(process.env.MYSQLDATABASE) ||
    process.env.DB_NAME ||
    "community_fortune",
  port: getEnvValue(process.env.MYSQLPORT) || process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_MAX) || 10,
  queueLimit: parseInt(process.env.DB_POOL_QUEUE) || 0,
  enableKeepAlive: true,
  decimalNumbers: true,
  keepAliveInitialDelay: 0,
  typeCast: function (field, next) {
    if (field.type === "VAR_STRING" || field.type === "BLOB") {
      return field.string();
    }
    return next();
  },
});

// Enhanced connection test with better logging
const testConnection = async () => {
  try {
    console.log("🔧 Testing database connection with:");
    console.log("Host:", process.env.MYSQLHOST);
    console.log("User:", process.env.MYSQLUSER);
    console.log("Database:", process.env.MYSQLDATABASE);
    console.log("Port:", process.env.MYSQLPORT);

    const connection = await pool.getConnection();
    console.log("✅ Connected to MySQL database successfully!");

    const [result] = await connection.execute("SELECT UUID() as uuid_test");
    console.log(`🔑 UUID test: ${result[0].uuid_test}`);

    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    console.error("Error details:", {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
    });
    return false;
  }
};

export { testConnection };
export default pool;
