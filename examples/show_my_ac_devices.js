const { HonClient } = require("../src");
const { loadConfig } = require("../src/config");

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
    console.log("Available air conditioners:");
    for (const ac of airConditioners) {
      console.log(`- macAddress=${ac.macAddress} uniqueId=${ac.uniqueId} nickName=${ac.nickName}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
