const express = require("express");
const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes"); // [NEW]
const cookieParser = require("cookie-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

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
  })
);
app.use(cookieParser());
app.use(express.json());

// Base Route
// Routes
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes); // [NEW]

app.get("/", (req, res) => {
  res.send("MagicHands Server is Running");
});

// Start Server
// Restart trigger
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
