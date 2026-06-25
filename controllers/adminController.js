const { getDatabase } = require("../db/database");

const {
  sendUserApprovalEmail,
  sendUserRejectionEmail
} = require("../services/emailService");

async function getPendingUsers(req, res) {
  try {
    const db = getDatabase();

    const users = await db.all(
      `SELECT id, username, email, role, status, created_at, approved_by, approved_at, last_login, failed_login_count
       FROM users
       WHERE status = 'pending'
       ORDER BY created_at ASC`
    );

    return res.json({ users });
  } catch (error) {
    console.error("Get pending users error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getAllUsers(req, res) {
  try {
    const db = getDatabase();

    const users = await db.all(
      `SELECT id, username, email, role, status, created_at, approved_by, approved_at, last_login, failed_login_count
       FROM users
       ORDER BY created_at DESC`
    );

    return res.json({ users });
  } catch (error) {
    console.error("Get all users error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function approveUser(req, res) {
  try {
    const db = getDatabase();
    const userId = req.params.id;
    const adminId = req.session.user.id;

    const user = await db.get("SELECT * FROM users WHERE id = ?", [userId]);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    await db.run(
      `UPDATE users
       SET status = 'approved',
           approved_by = ?,
           approved_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [adminId, userId]
    );

    await db.run(
      `INSERT INTO admin_audit (admin_id, target_user_id, action, remarks)
       VALUES (?, ?, ?, ?)`,
      [adminId, userId, "approve", "User approved by admin panel"]
    );

    try {
      await sendUserApprovalEmail(user);
    } catch (emailError) {
      console.error("Failed to send user approval email:", emailError);
    }

    return res.json({
      message: "User approved successfully"
    });
  } catch (error) {
    console.error("Approve user error:", error);
    return res.status(500).json({
      message: "Server error"
    });
  }
}

async function rejectUser(req, res) {
  try {
    const db = getDatabase();
    const userId = req.params.id;
    const adminId = req.session.user.id;

    const user = await db.get("SELECT * FROM users WHERE id = ?", [userId]);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    await db.run(
      `UPDATE users
       SET status = 'rejected',
           approved_by = ?,
           approved_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [adminId, userId]
    );

    await db.run(
      `INSERT INTO admin_audit (admin_id, target_user_id, action, remarks)
       VALUES (?, ?, ?, ?)`,
      [adminId, userId, "reject", "User rejected by admin panel"]
    );

    try {
      await sendUserRejectionEmail(user);
    } catch (emailError) {
      console.error("Failed to send user rejection email:", emailError);
    }

    return res.json({
      message: "User rejected successfully"
    });
  } catch (error) {
    console.error("Reject user error:", error);
    return res.status(500).json({
      message: "Server error"
    });
  }
}

async function deleteUser(req, res) {
  try {
    const db = getDatabase();
    const userId = req.params.id;
    const adminId = req.session.user.id;

    const user = await db.get("SELECT * FROM users WHERE id = ?", [userId]);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (user.role === "admin") {
      return res.status(403).json({
        message: "Admin user cannot be deleted"
      });
    }

    await db.run(
      `INSERT INTO admin_audit (admin_id, target_user_id, action, remarks)
       VALUES (?, ?, ?, ?)`,
      [adminId, userId, "delete", `User ${user.username} deleted by admin`]
    );

    await db.run("DELETE FROM login_audit WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM approval_tokens WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM users WHERE id = ?", [userId]);

    return res.json({
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({
      message: "Server error"
    });
  }
}

async function handleEmailApprovalAction(req, res) {
  try {
    const db = getDatabase();
    const token = req.params.token;

    const tokenRecord = await db.get(
      `SELECT approval_tokens.*, users.username, users.email, users.status
       FROM approval_tokens
       JOIN users ON users.id = approval_tokens.user_id
       WHERE approval_tokens.token = ?`,
      [token]
    );

    if (!tokenRecord) {
      return res.send(`
        <div style="font-family: Arial, sans-serif; padding: 30px;">
          <h2>Invalid approval link</h2>
          <p>This approval link is invalid.</p>
        </div>
      `);
    }

    if (tokenRecord.used === 1) {
      return res.send(`
        <div style="font-family: Arial, sans-serif; padding: 30px;">
          <h2>Link already used</h2>
          <p>This approval link has already been used.</p>
        </div>
      `);
    }

    const now = new Date();
    const expiresAt = new Date(tokenRecord.expires_at);

    if (now > expiresAt) {
      return res.send(`
        <div style="font-family: Arial, sans-serif; padding: 30px;">
          <h2>Link expired</h2>
          <p>This approval link has expired.</p>
        </div>
      `);
    }

    if (tokenRecord.status !== "pending") {
      return res.send(`
        <div style="font-family: Arial, sans-serif; padding: 30px;">
          <h2>User already processed</h2>
          <p>This user is already marked as <strong>${tokenRecord.status}</strong>.</p>
        </div>
      `);
    }

    const newStatus = tokenRecord.action === "approve" ? "approved" : "rejected";

    await db.run(
      `UPDATE users
       SET status = ?,
           approved_by = 0,
           approved_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newStatus, tokenRecord.user_id]
    );

    await db.run(
      `UPDATE approval_tokens
       SET used = 1
       WHERE user_id = ?`,
      [tokenRecord.user_id]
    );

    await db.run(
      `INSERT INTO admin_audit (admin_id, target_user_id, action, remarks)
       VALUES (?, ?, ?, ?)`,
      [
        0,
        tokenRecord.user_id,
        tokenRecord.action,
        `User ${tokenRecord.action}d through email link`
      ]
    );

    const user = {
      username: tokenRecord.username,
      email: tokenRecord.email
    };

    try {
      if (newStatus === "approved") {
        await sendUserApprovalEmail(user);
      } else {
        await sendUserRejectionEmail(user);
      }
    } catch (emailError) {
      console.error("Failed to send user result email:", emailError);
    }

    return res.send(`
      <div style="font-family: Arial, sans-serif; padding: 30px;">
        <h2>User ${newStatus} successfully</h2>
        <p><strong>Username:</strong> ${tokenRecord.username}</p>
        <p><strong>Email:</strong> ${tokenRecord.email}</p>
        <p>Status has been updated to <strong>${newStatus}</strong>.</p>
        <p>You can close this tab.</p>
      </div>
    `);
  } catch (error) {
    console.error("Email approval action error:", error);

    return res.status(500).send(`
      <div style="font-family: Arial, sans-serif; padding: 30px;">
        <h2>Server error</h2>
        <p>Something went wrong while processing this approval link.</p>
      </div>
    `);
  }
}

async function getLoginAudit(req, res) {
  try {
    const db = getDatabase();

    const logs = await db.all(
      `SELECT *
       FROM login_audit
       ORDER BY login_time DESC
       LIMIT 200`
    );

    return res.json({ logs });
  } catch (error) {
    console.error("Get login audit error:", error);
    return res.status(500).json({
      message: "Server error"
    });
  }
}

async function getAdminAudit(req, res) {
  try {
    const db = getDatabase();

    const logs = await db.all(
      `SELECT *
       FROM admin_audit
       ORDER BY timestamp DESC
       LIMIT 200`
    );

    return res.json({ logs });
  } catch (error) {
    console.error("Get admin audit error:", error);
    return res.status(500).json({
      message: "Server error"
    });
  }
}

module.exports = {
  getPendingUsers,
  getAllUsers,
  approveUser,
  rejectUser,
  deleteUser,
  handleEmailApprovalAction,
  getLoginAudit,
  getAdminAudit
};