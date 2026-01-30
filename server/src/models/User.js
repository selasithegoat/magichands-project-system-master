const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: {
    type: String,
    unique: true, // partial index
    sparse: true, // allow null/undefined
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      "Please add a valid email",
    ],
  },
  employeeId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },

  department: {
    type: [String], // Array of strings
    enum: [
      "Administration",
      "Front Desk",
      "Production",
      "Graphics/Design",
      "Photography",
      "Stores",
      "IT Department",
    ],
    default: [],
  },
  position: {
    type: String,
    enum: ["Leader", "Member"],
    default: "Member",
  },
  employeeType: {
    type: String,
    enum: ["Staff", "NSP", "Intern", "Trainee"],
  },
  contact: String,
  bio: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  notificationSettings: {
    email: { type: Boolean, default: false },
    push: { type: Boolean, default: true },
  },
});

// Encrypt password using bcrypt
UserSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
