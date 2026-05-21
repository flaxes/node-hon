const { HonClient } = require("../src");
const { loadConfig } = require("../src/config");
const path = require("node:path");

async function getClient(options = {}) {
  const baseDir = options.baseDir || path.resolve(__dirname, "..");
  const configPath = options.configPath || path.resolve(baseDir, "config.js");
  const config = loadConfig(configPath);
  if (config.sessionFile && !path.isAbsolute(config.sessionFile)) {
    config.sessionFile = path.resolve(baseDir, config.sessionFile);
  }
  if (config.applianceCacheFile && !path.isAbsolute(config.applianceCacheFile)) {
    config.applianceCacheFile = path.resolve(baseDir, config.applianceCacheFile);
  }
  if (!config.applianceCacheFile) {
    config.applianceCacheFile = path.resolve(baseDir, ".hon-appliance-cache.json");
  }
  const client = new HonClient(config);

  await client.create();

  return client;
}

module.exports = getClient;
