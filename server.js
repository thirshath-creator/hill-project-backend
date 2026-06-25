
const cors = require("cors");
app.use(cors());


require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { initDatabase } = require("./db/database");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

const SESSION_SECRET =
  process.env.SESSION_SECRET || "hilfarm_local_dev_secret_change_this";

const frontendRoot = path.join(__dirname, "..");

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.json());

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    message: "Too many login attempts. Please try again later."
  }
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

/*
  Page routes are defined before static serving
  so index.html and admin.html can be protected.
*/

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendRoot, "login.html"));
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(frontendRoot, "login.html"));
});

app.get("/index.html", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect("/login.html");
  }

  if (req.session.user.status !== "approved") {
    return res.redirect("/login.html");
  }

  return res.sendFile(path.join(frontendRoot, "index.html"));
});

app.get("/admin.html", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect("/login.html");
  }

  if (req.session.user.role !== "admin") {
    return res.redirect("/index.html");
  }

  return res.sendFile(path.join(frontendRoot, "admin.html"));
});

/*
  Serve frontend assets:
  style.css, script.js, images, etc.
*/
app.use(express.static(frontendRoot));

async function startServer() {
  await initDatabase();

  const PORT = process.env.PORT || 4000;

  app.listen(PORT, () => {
    console.log(`HIL Farm backend running at http://localhost:${PORT}`);
    console.log(`Login page: http://localhost:${PORT}/login.html`);
  });
}

startServer();