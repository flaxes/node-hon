"use strict";

const { ApplianceNotFoundError } = require("..");
const { formatAcIdentifiers } = require("./_format");

function handleCliError(error) {
  if (error instanceof ApplianceNotFoundError && error.details?.available) {
    console.error(error.message);
    for (const ac of error.details.available) {
      console.error(`- ${formatAcIdentifiers(ac)}`);
    }
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}

module.exports = { handleCliError };
