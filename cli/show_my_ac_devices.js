const getClient = require("./_get-client");

async function main(options = {}) {
  const client = await getClient(options);
  try {
    const airConditioners = await client.getAirConditioners();
    if (!airConditioners.length) {
      console.log("No air conditioners found.");
      return;
    }
    console.log("Available air conditioners:");
    for (const ac of airConditioners) {
      console.log(
        `- macAddress=${ac.macAddress} uniqueId=${ac.uniqueId} nickName=${ac.nickName}`,
      );
    }
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
