const path = require("node:path");
const { ApplianceNotFoundError } = require("../src");
const getAcClient = require("./_get-ac-client");

async function main(options = {}) {
  const baseDir = options.baseDir || path.resolve(__dirname, "..");
  const loadAcClient = options.getAcClient || getAcClient;
  const { ac, client } = await loadAcClient({ ...options, baseDir });

  try {
    const presetName = options.presetName || process.env.PRESET_NAME || "preset_fan";
    if (presetName === "off") {
      await ac.powerOff();
      console.log(`Powered off ${ac.nickName} (${ac.macAddress})`);
      return;
    }
    const presetFile = path.resolve(
      baseDir,
      "presets",
      `${presetName}.json`,
    );

    const preset = require(presetFile);
    await ac.applyPreset(preset, presetName);
    console.log(`Applied ${presetName} to ${ac.nickName} (${ac.macAddress})`);
  } finally {
    await client.close();
  }
}

function handleError(error) {
  if (error instanceof ApplianceNotFoundError && error.details?.available) {
    console.error(error.message);
    for (const ac of error.details.available) {
      console.error(
        `- macAddress=${ac.macAddress} uniqueId=${ac.uniqueId} nickName=${ac.nickName}`,
      );
    }
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}

if (require.main === module) {
  main().catch(handleError);
}

module.exports = { main, handleError };
