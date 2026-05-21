const fs = require("node:fs");
const getClient = require("../src/lib-cli/_get-client");

async function main(options = {}) {
  const client = await getClient(options);

  try {
    const airConditioners = await client.getAirConditioners();
    if (!airConditioners.length) {
      console.log("No air conditioners found.");
      return;
    }

    const filename = "./hon-devices-capabilities.json";
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

if (require.main === module) {
  main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  });
}

module.exports = { main };
