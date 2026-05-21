const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { main } = require("../cli/purge_cache");

test("purge-cache removes cache directory", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "node-hon-cache-"));
  const cacheDir = path.join(baseDir, "cache");
  await fs.mkdir(cacheDir);
  await fs.writeFile(path.join(cacheDir, ".hon-session.json"), "{}", "utf8");

  await main({ baseDir });

  await assert.rejects(() => fs.stat(cacheDir));
});
