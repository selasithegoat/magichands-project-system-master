const { getSystemVersion } = require("../utils/systemVersion");

const getSystemVersionInfo = (_req, res) => {
  res.json(getSystemVersion());
};

module.exports = {
  getSystemVersionInfo,
};
