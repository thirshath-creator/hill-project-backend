function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "Not logged in" });
  }

  next();
}

function requireApprovedUser(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "Not logged in" });
  }

  if (req.session.user.status !== "approved") {
    return res.status(403).json({ message: "User is not approved" });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "Not logged in" });
  }

  if (req.session.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access only" });
  }

  next();
}

module.exports = {
  requireLogin,
  requireApprovedUser,
  requireAdmin
};