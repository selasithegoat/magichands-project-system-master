const jwt = require("jsonwebtoken");

const generateToken = (id, sid = "") => {
  const payload = { id };
  if (sid) {
    payload.sid = sid;
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

module.exports = generateToken;
