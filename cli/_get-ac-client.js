const { ApplianceNotFoundError } = require("../src");
const getClient = require("./_get-client");

async function getAcClient() {
  const client = await getClient();
  const acId = process.env.AC_ID;
  if (!acId) {
    await printAvailable(client);
    throw new ApplianceNotFoundError(
      "Set AC_ID to one of the listed identifiers",
    );
  }

  const ac = await client.getAirConditionerByIdCached(acId);

  return { client, ac };
}

async function printAvailable(client) {
  const airConditioners = await client.getAirConditioners();
  console.log("Available air conditioners:");
  for (const ac of airConditioners) {
    console.log(
      `- macAddress=${ac.macAddress} uniqueId=${ac.uniqueId} nickName=${ac.nickName}`,
    );
  }
}

module.exports = getAcClient;
