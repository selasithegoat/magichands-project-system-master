const express = require("express");
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");
const updateRoutes = require("./routes/updateRoutes");
const adminRoutes = require("./routes/adminRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

// Trust proxy for ngrok/production (required for secure cookies behind proxy)
app.set("trust proxy", 1);

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      // Allow any origin
      callback(null, true);
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());

// External uploads folder (outside source)
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(__dirname, "../../../magichands-uploads");
app.use("/uploads", express.static(UPLOAD_DIR));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/updates", updateRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);

// Serve built frontends (Vite builds -> dist)
const clientDistPath = path.resolve(__dirname, "../../client/dist");
const adminDistPath = path.resolve(__dirname, "../../admin/dist");
const hasClientBuild = fs.existsSync(clientDistPath);
const hasAdminBuild = fs.existsSync(adminDistPath);

if (hasAdminBuild) {
  app.use("/admin", express.static(adminDistPath));
}

if (hasClientBuild) {
  app.use(express.static(clientDistPath));
}

// SPA fallbacks
if (hasAdminBuild) {
  app.get(/^\/admin(\/.*)?$/, (req, res) => {
    res.sendFile(path.join(adminDistPath, "index.html"));
  });
}

if (hasClientBuild) {
  app.get(/^\/(?!api|admin|uploads).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("MagicHands Server is Running");
  });
}

// Start Server
app.listen(PORT, HOST, () => {
  console.log(`Server is running at http://${HOST}:${PORT}`);
});
// Trigger restart to rebuild indexes
