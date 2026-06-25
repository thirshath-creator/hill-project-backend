require("dotenv").config();

const argon2 = require("argon2");
const { initDatabase, getDatabase } = require("../db/database");

async function createAdmin() {
  try {
    await initDatabase();

    const db = getDatabase();

    const username = "admin";
    const email = "admin@hilfarm.com";
    const password = "Admin@123";

    const existingAdmin = await db.get(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [username, email]
    );

    if (existingAdmin) {
      console.log("Admin already exists");
      process.exit(0);
    }

    const passwordHash = await argon2.hash(password);

    await db.run(
      `INSERT INTO users (username, email, password_hash, role, status)
       VALUES (?, ?, ?, 'admin', 'approved')`,
      [username, email, passwordHash]
    );

    console.log("Admin created successfully");
    console.log("Username: admin");
    console.log("Email: admin@hilfarm.com");
    console.log("Password: Admin@123");

    process.exit(0);
  } catch (error) {
    console.error("Create admin error:", error);
    process.exit(1);
  }
}

createAdmin();