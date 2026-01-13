const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const User = require("./src/models/User");
const connectDB = require("./src/config/db");

dotenv.config();

const verifyAdmin = async () => {
  try {
    await connectDB();
    console.log("Connected to DB");

    const employeeId = "ADMIN001";
    const password = "adminpassword123";

    const user = await User.findOne({ employeeId });

    if (!user) {
      console.log("User NOT found with employeeId:", employeeId);
      process.exit();
    }

    console.log("User found:", user.name, user.email, user.role);
    console.log("Stored Hashed Password:", user.password);

    const isMatch = await bcrypt.compare(password, user.password);
    console.log(`Password match result for '${password}':`, isMatch);

    if (!isMatch) {
      console.log("Attempting to re-hash and update password...");
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt); // Manually hash
      // user.password = password; // If we rely on pre-save, but let's be explicit or try simple save
      // Actually, if we set user.password = plain and save(), the pre-save hook SHOULD catch it.
      // Let's rely on the pre-save hook to ensure the hook logic is working.
      user.password = password;
      await user.save();
      console.log("Password updated via save(). Now verifying again...");

      const updatedUser = await User.findOne({ employeeId });
      const isMatchNow = await bcrypt.compare(password, updatedUser.password);
      console.log(`Password match result after update:`, isMatchNow);
    }

    process.exit();
  } catch (error) {
    console.error("Error verifying admin:", error);
    process.exit(1);
  }
};

verifyAdmin();
