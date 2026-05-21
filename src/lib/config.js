const path = require("node:path");

function loadConfig(configPath = path.resolve(__dirname, "..", "config.js")) {
  const resolved = path.resolve(configPath);
  const config = require(resolved);
  validateConfig(config, resolved);
  return config;
}

function validateConfig(config, source = "config") {
  if (!config || typeof config !== "object") {
    throw new TypeError(`${source} must export a config object`);
  }
  for (const key of ["email", "password", "sessionFile"]) {
    if (!config[key] || typeof config[key] !== "string") {
      throw new TypeError(`${source} must define string ${key}`);
    }
  }
  return true;
}

module.exports = { loadConfig, validateConfig };
