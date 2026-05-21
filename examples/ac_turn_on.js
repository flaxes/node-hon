"use strict";

const { HonClient, ApplianceNotFoundError } = require("../src");
const { loadConfig } = require("../src/config");

async function main() {
  const config = loadConfig();
  const client = new HonClient(config);
  try {
    await client.create();
    const acId = process.env.AC_ID;
    if (!acId) {
      await printAvailable(client);
      throw new ApplianceNotFoundError("Set AC_ID to one of the listed identifiers");
    }
    const ac = await client.getAirConditionerById(acId);
    await ac.powerOn();
    console.log(`Turned on ${ac.nickName} (${ac.macAddress})`);
  } finally {
    await client.close();
  }
}

async function printAvailable(client) {
  const airConditioners = await client.getAirConditioners();
  console.log("Available air conditioners:");
  for (const ac of airConditioners) {
    console.log(`- macAddress=${ac.macAddress} uniqueId=${ac.uniqueId} nickName=${ac.nickName}`);
  }
}

main().catch((error) => {
  if (error instanceof ApplianceNotFoundError && error.details?.available) {
    console.error(error.message);
    for (const ac of error.details.available) {
      console.error(`- macAddress=${ac.macAddress} uniqueId=${ac.uniqueId} nickName=${ac.nickName}`);
    }
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
