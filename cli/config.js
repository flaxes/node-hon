const fs = require("node:fs/promises");
const path = require("node:path");
const { stdout: output } = require("node:process");
const { askBoolean, askText, createAsk } = require("../src/lib-cli/_prompt");
const { handleCliError } = require("../src/lib-cli/_run");

async function main(options = {}) {
  const baseDir = options.baseDir || path.resolve(__dirname, "..");
  const configPath = options.configPath || path.resolve(baseDir, "config.js");
  const examplePath = path.resolve(baseDir, "config_example.js");
  const current = await loadConfigOrDefaults(configPath, examplePath);
  const ask = options.ask || createAsk();

  try {
    const config = {
      email: await askText(ask, "hOn email", current.email),
      password: await askText(ask, "hOn password", "", current.password),
      mobileId: await askText(ask, "Mobile ID", current.mobileId || "pyhOn-node"),
      sessionFile: await askText(ask, "Session file", current.sessionFile || "./cache/.hon-session.json"),
      applianceCacheFile: await askText(ask, "Appliance cache file", current.applianceCacheFile || "./cache/.hon-appliance-cache.json"),
      forceApplianceCacheRefresh: await askBoolean(ask, "Force appliance cache refresh", Boolean(current.forceApplianceCacheRefresh)),
      debug: await askBoolean(ask, "Debug logging", Boolean(current.debug))
    };
    await fs.writeFile(configPath, buildConfigText(config), "utf8");
    output.write(`Saved ${configPath}\n`);
  } finally {
    if (ask.close) {
      ask.close();
    }
  }
}

async function loadConfigOrDefaults(configPath, examplePath) {
  if (await exists(configPath)) {
    return requireFresh(configPath);
  }
  if (await exists(examplePath)) {
    return requireFresh(examplePath);
  }
  return {
    email: "user@example.com",
    password: "password",
    mobileId: "pyhOn-node",
    sessionFile: "./cache/.hon-session.json",
    applianceCacheFile: "./cache/.hon-appliance-cache.json",
    forceApplianceCacheRefresh: false,
    debug: false
  };
}

function requireFresh(filePath) {
  const resolved = require.resolve(path.resolve(filePath));
  delete require.cache[resolved];
  return require(resolved);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildConfigText(config) {
  return `/** @type {import("./types/global").ProjectConfig} */
module.exports = {
  email: ${JSON.stringify(config.email)},
  password: ${JSON.stringify(config.password)},
  mobileId: ${JSON.stringify(config.mobileId)},
  sessionFile: ${JSON.stringify(config.sessionFile)},
  applianceCacheFile: ${JSON.stringify(config.applianceCacheFile)},
  forceApplianceCacheRefresh: ${Boolean(config.forceApplianceCacheRefresh)},
  debug: ${Boolean(config.debug)}
};
`;
}

if (require.main === module) {
  main().catch(handleCliError);
}

module.exports = { buildConfigText, main };
