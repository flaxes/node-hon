const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { buildConfigText, main } = require("../cli/config");

test("config CLI writes first config from answers", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "node-hon-config-"));
  await fs.writeFile(path.join(baseDir, "config_example.js"), buildConfigText({
    email: "user@example.com",
    password: "password",
    mobileId: "pyhOn-node",
    sessionFile: "./cache/.hon-session.json",
    applianceCacheFile: "./cache/.hon-appliance-cache.json",
    forceApplianceCacheRefresh: false,
    debug: false
  }), "utf8");

  await main({
    baseDir,
    ask: fakeAsk([
      "me@example.com",
      "secret",
      "",
      "",
      "",
      "no",
      "yes"
    ])
  });

  const config = requireFresh(path.join(baseDir, "config.js"));
  assert.equal(config.email, "me@example.com");
  assert.equal(config.password, "secret");
  assert.equal(config.mobileId, "pyhOn-node");
  assert.equal(config.sessionFile, "./cache/.hon-session.json");
  assert.equal(config.applianceCacheFile, "./cache/.hon-appliance-cache.json");
  assert.equal(config.forceApplianceCacheRefresh, false);
  assert.equal(config.debug, true);
});

test("config CLI keeps existing password when left blank", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "node-hon-config-"));
  await fs.writeFile(path.join(baseDir, "config.js"), buildConfigText({
    email: "old@example.com",
    password: "old-secret",
    mobileId: "old-mobile",
    sessionFile: "./old-session.json",
    applianceCacheFile: "./old-cache.json",
    forceApplianceCacheRefresh: true,
    debug: false
  }), "utf8");

  await main({
    baseDir,
    ask: fakeAsk([
      "new@example.com",
      "",
      "",
      "",
      "",
      "",
      ""
    ])
  });

  const config = requireFresh(path.join(baseDir, "config.js"));
  assert.equal(config.email, "new@example.com");
  assert.equal(config.password, "old-secret");
  assert.equal(config.mobileId, "old-mobile");
  assert.equal(config.forceApplianceCacheRefresh, true);
  assert.equal(config.debug, false);
});

function fakeAsk(answers) {
  return {
    question: async () => answers.shift() || "",
    close: () => {}
  };
}

function requireFresh(filePath) {
  const resolved = require.resolve(filePath);
  delete require.cache[resolved];
  return require(resolved);
}
