const path = require("path");

module.exports = {
  apps: [
    {
      name: "magichands-project-server",
      cwd: path.join(__dirname, "server"),
      script: "src/server.js",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
      kill_timeout: 10000,
      time: true,
    },
  ],
};
