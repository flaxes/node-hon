const { HonClient } = require("../src");
const { loadConfig } = require("../src/config");

async function getClient() {
  const config = loadConfig();
  const client = new HonClient(config);

  await client.create();

  return client;
}

module.exports = getClient;
