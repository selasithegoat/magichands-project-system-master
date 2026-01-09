const express = require("express");
const authRoutes = require("./routes/authRoutes");
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

// Middleware
app.use(
  cors({
    origin: "http://localhost:5173", // Enable CORS for client
    credentials: true, // Allow cookies
  })
);
app.use(cookieParser());
app.use(express.json());

// Base Route
// Routes
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("MagicHands Server is Running");
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
