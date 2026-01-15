const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const User = require("./src/models/User");

// Load env vars
dotenv.config({ path: path.join(__dirname, ".env") });

const run = async () => {
  try {
    console.log("Connecting to DB...");
    // Use local URI or env
    const conn = await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/magichands"
    );
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    const employeeId = "ADMIN001";
    console.log(`Finding user: ${employeeId}`);
    const user = await User.findOne({ employeeId });

    if (!user) {
      console.log("User NOT found.");
    } else {
      console.log("User found:", user.username || user.name);
      console.log("Role:", user.role);

      // Test password match if hardcoded
      // const isMatch = await user.matchPassword('adminpassword123');
      // console.log("Password match:", isMatch);
    }

    console.log("Test Complete. Exiting.");
    process.exit(0);
  } catch (error) {
    console.error("Error encountered:", error);
    process.exit(1);
  }
};

run();
