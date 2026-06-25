const express = require("express");
const router = express.Router();

const { requireAdmin } = require("../middleware/auth");

const {
  getPendingUsers,
  getAllUsers,
  approveUser,
  rejectUser,
  deleteUser,
  handleEmailApprovalAction,
  getLoginAudit,
  getAdminAudit
} = require("../controllers/adminController");

// Email approve/reject links use secure one-time token.
// This route does not need admin session.
router.get("/email-action/:token", handleEmailApprovalAction);

router.get("/pending-users", requireAdmin, getPendingUsers);
router.get("/all-users", requireAdmin, getAllUsers);

router.post("/users/:id/approve", requireAdmin, approveUser);
router.post("/users/:id/reject", requireAdmin, rejectUser);
router.delete("/users/:id", requireAdmin, deleteUser);

router.get("/login-audit", requireAdmin, getLoginAudit);
router.get("/admin-audit", requireAdmin, getAdminAudit);

module.exports = router;