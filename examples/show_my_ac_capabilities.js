"use strict";

const { HonClient } = require("../src");
const { loadConfig } = require("../src/config");
const fs = require('node:fs');

async function main() {
  const config = loadConfig();
  const client = new HonClient(config);
  try {
    await client.create();
    const airConditioners = await client.getAirConditioners();
    if (!airConditioners.length) {
      console.log("No air conditioners found.");
      return;
    }

    const filename = './hon-devices-capabilities.json';
    const mapping = {};
    for (const ac of airConditioners) {
      const naming = `${ac.nickName}_${ac.macAddress}`;
      console.log(naming);

      mapping[naming] = ac.capabilities();
    }

    fs.writeFileSync(filename, JSON.stringify(mapping, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
