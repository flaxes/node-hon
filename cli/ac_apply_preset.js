const path = require("node:path");
const getAcClient = require("../src/lib-cli/_get-ac-client");
const { formatAc } = require("../src/lib-cli/_format");
const { handleCliError } = require("../src/lib-cli/_run");

async function main(options = {}) {
  const baseDir = options.baseDir || path.resolve(__dirname, "..");
  const loadAcClient = options.getAcClient || getAcClient;
  const { ac, client } = await loadAcClient({ ...options, baseDir });

  try {
    const presetName = options.presetName || process.env.PRESET_NAME || "preset_fan";
    if (presetName === "off") {
      await ac.powerOff();
      console.log(`Powered off ${formatAc(ac)}`);
      return;
    }
    const presetFile = path.resolve(
      baseDir,
      "presets",
      `${presetName}.json`,
    );

    const preset = require(presetFile);
    await ac.applyPreset(preset, presetName);
    console.log(`Applied ${presetName} to ${formatAc(ac)}`);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(handleCliError);
}

module.exports = { main };
