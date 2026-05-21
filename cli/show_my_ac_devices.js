const getClient = require("../src/lib-cli/_get-client");
const { printAcList } = require("../src/lib-cli/_format");
const { handleCliError } = require("../src/lib-cli/_run");

async function main(options = {}) {
  const client = await getClient(options);
  try {
    const airConditioners = await client.getAirConditioners();
    printAcList(airConditioners);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(handleCliError);
}

module.exports = { main };
