require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");

const { initDatabase } = require("./db/database");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express(); // ✅ CREATE APP FIRST
app.set("trust proxy", 1);
// ✅ Middleware
app.use(
  cors({
    origin: "https://vocal-lolly-58a230.netlify.app",
    credentials: true
  })
); // IMPORTANT for Netlify ↔ Render
app.use(express.json());

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

// ✅ Session config
const SESSION_SECRET =
  process.env.SESSION_SECRET || "hilfarm_local_dev_secret_change_this";


app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);


// ✅ Rate limiter (login protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    message: "Too many login attempts. Please try again later."
  }
});

// ✅ Routes
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

// ✅ Frontend root (served if needed)
const frontendRoot = path.join(__dirname, "..");

// ✅ Page routes
app.get("/", (req, res) => {
  res.send("Backend is running ✅"); // simple test response
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

// ✅ Static files
app.use(express.static(frontendRoot));

// ✅ Start server
async function startServer() {
  try {
    await initDatabase();

    const PORT = process.env.PORT || 5001; // ✅ IMPORTANT FIX

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1); // stop crash loop properly
  }
}

startServer();