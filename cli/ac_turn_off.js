const getAcClient = require("../src/lib-cli/_get-ac-client");
const { formatAc } = require("../src/lib-cli/_format");
const { handleCliError } = require("../src/lib-cli/_run");

async function main(options = {}) {
  const { ac, client } = await getAcClient(options);

  try {
    await ac.powerOff();
    console.log(`Turned off ${formatAc(ac)}`);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(handleCliError);
}

module.exports = { main };
