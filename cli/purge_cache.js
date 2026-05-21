const fs = require("node:fs/promises");
const path = require("node:path");
const { handleCliError } = require("../src/lib-cli/_run");

async function main(options = {}) {
  const baseDir = options.baseDir || path.resolve(__dirname, "..");
  const cacheDir = options.cacheDir || path.resolve(baseDir, "cache");
  await fs.rm(cacheDir, { recursive: true, force: true });
  console.log(`Purged cache: ${cacheDir}`);
}

if (require.main === module) {
  main().catch(handleCliError);
}

module.exports = { main };
