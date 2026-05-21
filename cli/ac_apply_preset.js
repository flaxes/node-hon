const path = require("node:path");
const { ApplianceNotFoundError } = require("../src");
const getAcClient = require("./_get-ac-client");

async function main() {
  const { ac, client } = await getAcClient();

  try {
    const presetName = process.env.PRESET_NAME || "preset_fan";
    const presetFile = path.resolve(
      __dirname,
      "..",
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

main().catch((error) => {
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
});

