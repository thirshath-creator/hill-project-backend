const argon2 = require("argon2");
const crypto = require("crypto");
const { getDatabase } = require("../db/database");
const { sendAdminLoginAttemptWebhook } = require("../services/zapierService");

// SIGNUP
async function signup(req, res) {
  try {
    const db = getDatabase();
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "Username, email and password are required"
      });
    }

    if (username.trim().length < 3) {
      return res.status(400).json({
        message: "Username must be at least 3 characters"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters"
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    const existingUser = await db.get(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [cleanUsername, cleanEmail]
    );

    if (existingUser) {
      return res.status(400).json({
        message: "Username or email already exists"
      });
    }

    const passwordHash = await argon2.hash(password);

    await db.run(
      `INSERT INTO users (username, email, password_hash, role, status)
       VALUES (?, ?, ?, 'user', 'pending')`,
      [cleanUsername, cleanEmail, passwordHash]
    );

    return res.status(201).json({
      message: "Signup successful. Please wait for admin approval."
    });
  } catch (error) {
    console.error("Signup error:", error);

    return res.status(500).json({
      message: "Server error during signup"
    });
  }
}

// LOGIN
async function login(req, res) {
  try {
    const db = getDatabase();
    const { loginId, password } = req.body;

    if (!loginId || !password) {
      return res.status(400).json({
        message: "Username/email and password are required"
      });
    }

    const cleanLoginId = loginId.trim();

    const user = await db.get(
      "SELECT * FROM users WHERE username = ? OR email = ?",
      [cleanLoginId, cleanLoginId.toLowerCase()]
    );

    if (!user) {
      await db.run(
        `INSERT INTO login_audit (username, email, success, reason, ip_address, user_agent)
         VALUES (?, ?, 0, ?, ?, ?)`,
        [
          cleanLoginId,
          cleanLoginId,
          "User not found",
          req.ip,
          req.headers["user-agent"] || ""
        ]
      );

      return res.status(401).json({
        message: "Invalid username/email or password"
      });
    }

    const isPasswordValid = await argon2.verify(user.password_hash, password);

    if (!isPasswordValid) {
      await db.run(
        "UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = ?",
        [user.id]
      );

      await db.run(
        `INSERT INTO login_audit (user_id, username, email, success, reason, ip_address, user_agent)
         VALUES (?, ?, ?, 0, ?, ?, ?)`,
        [
          user.id,
          user.username,
          user.email,
          "Wrong password",
          req.ip,
          req.headers["user-agent"] || ""
        ]
      );

      return res.status(401).json({
        message: "Invalid username/email or password"
      });
    }

    const loginTime = new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

    let approveLink = "";
    let rejectLink = "";

    if (user.status === "pending") {
      await db.run(
        `UPDATE approval_tokens
         SET used = 1
         WHERE user_id = ? AND used = 0`,
        [user.id]
      );

      const approveToken = crypto.randomBytes(32).toString("hex");
      const rejectToken = crypto.randomBytes(32).toString("hex");

      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();

      await db.run(
        `INSERT INTO approval_tokens (user_id, token, action, expires_at)
         VALUES (?, ?, 'approve', ?)`,
        [user.id, approveToken, expiresAt]
      );

      await db.run(
        `INSERT INTO approval_tokens (user_id, token, action, expires_at)
         VALUES (?, ?, 'reject', ?)`,
        [user.id, rejectToken, expiresAt]
      );

      const baseUrl = process.env.APP_BASE_URL || "http://localhost:4000";

      approveLink = `${baseUrl}/api/admin/email-action/${approveToken}`;
      rejectLink = `${baseUrl}/api/admin/email-action/${rejectToken}`;
    }

    try {
      await sendAdminLoginAttemptWebhook({
        username: user.username,
        email: user.email,
        status: user.status,
        loginTime,
        loginResult:
          user.status === "approved"
            ? "Approved user login attempt"
            : user.status === "pending"
              ? "Pending user login attempt"
              : "Rejected user login attempt",
        approveLink,
        rejectLink
      });
    } catch (zapierError) {
      console.error("Failed to send login attempt webhook to Zapier:", zapierError);
    }

    if (user.status === "pending") {
      await db.run(
        `INSERT INTO login_audit (user_id, username, email, success, reason, ip_address, user_agent)
         VALUES (?, ?, ?, 0, ?, ?, ?)`,
        [
          user.id,
          user.username,
          user.email,
          "Pending user attempted login",
          req.ip,
          req.headers["user-agent"] || ""
        ]
      );

      return res.status(403).json({
        message: "Your account is waiting for admin approval. Admin has been notified."
      });
    }

    if (user.status === "rejected") {
      await db.run(
        `INSERT INTO login_audit (user_id, username, email, success, reason, ip_address, user_agent)
         VALUES (?, ?, ?, 0, ?, ?, ?)`,
        [
          user.id,
          user.username,
          user.email,
          "Rejected user attempted login",
          req.ip,
          req.headers["user-agent"] || ""
        ]
      );

      return res.status(403).json({
        message: "Your account request was rejected by admin"
      });
    }

    if (user.status !== "approved") {
      return res.status(403).json({
        message: "Your account is not approved"
      });
    }

    await db.run(
      "UPDATE users SET last_login = CURRENT_TIMESTAMP, failed_login_count = 0 WHERE id = ?",
      [user.id]
    );

    await db.run(
      `INSERT INTO login_audit (user_id, username, email, success, reason, ip_address, user_agent)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [
        user.id,
        user.username,
        user.email,
        "Login success",
        req.ip,
        req.headers["user-agent"] || ""
      ]
    );

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status
    };

    return res.json({
      message: "Login successful",
      user: req.session.user
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Server error during login"
    });
  }
}

// CHECK CURRENT USER
async function me(req, res) {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        message: "Not logged in"
      });
    }

    const db = getDatabase();

    const user = await db.get(
      "SELECT id, username, email, role, status FROM users WHERE id = ?",
      [req.session.user.id]
    );

    if (!user) {
      req.session.destroy(() => {});

      return res.status(401).json({
        message: "User no longer exists"
      });
    }

    if (user.status !== "approved") {
      req.session.destroy(() => {});

      return res.status(403).json({
        message: "User is not approved"
      });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status
    };

    return res.json({
      user: req.session.user
    });
  } catch (error) {
    console.error("Me error:", error);

    return res.status(500).json({
      message: "Server error"
    });
  }
}

// LOGOUT
function logout(req, res) {
  if (!req.session) {
    return res.json({
      message: "Logged out"
    });
  }

  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        message: "Logout failed"
      });
    }

    res.clearCookie("connect.sid");

    return res.json({
      message: "Logout successful"
    });
  });
}

module.exports = {
  signup,
  login,
  me,
  logout
};