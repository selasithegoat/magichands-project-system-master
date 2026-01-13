const mongoose = require("mongoose");
const dotenv = require("dotenv");
// Adjust paths as this script is in server root
const User = require("./src/models/User");
const connectDB = require("./src/config/db");

dotenv.config();

const createAdmin = async () => {
  try {
    await connectDB();

    const adminEmail = "admin@magichands.com";
    const adminEmployeeId = "ADMIN001";
    const adminPassword = "adminpassword123";

    // Check if exists
    const userExists = await User.findOne({ employeeId: adminEmployeeId });

    if (userExists) {
      console.log("Admin user already exists.");
      // Update role just in case
      userExists.role = "admin";
      await userExists.save();
      console.log("Updated existing user role to admin.");
    } else {
      const user = await User.create({
        name: "Super Admin",
        firstName: "Super",
        lastName: "Admin",
        employeeId: adminEmployeeId,
        password: adminPassword,
        email: adminEmail,
        role: "admin",
        department: "Management",
        employeeType: "Staff",
        contact: "0000000000",
      });
      console.log("Admin user created successfully.");
    }

    console.log("Credentials:");
    console.log(`Employee ID: ${adminEmployeeId}`);
    console.log(`Password: ${adminPassword}`);

    process.exit();
  } catch (error) {
    console.error("Error creating admin:", error);
    process.exit(1);
  }
};

createAdmin();
