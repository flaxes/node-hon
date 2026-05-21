const { ApplianceNotFoundError } = require("../src");
const getAcClient = require("./_get-ac-client");

async function main() {
  const { ac, client } = await getAcClient();

  try {
    await ac.powerOff();
    console.log(`Turned off ${ac.nickName} (${ac.macAddress})`);
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

