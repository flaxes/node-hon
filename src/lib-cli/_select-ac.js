"use strict";

const { ApplianceNotFoundError } = require("..");
const { findApplianceIdentifierMatches } = require("../appliance-identity");
const { formatAc } = require("./_format");
const { promptChoice } = require("./_prompt");

async function selectAirConditioner(ask, airConditioners, acId = "") {
  const selectedId = acId || process.env.AC_ID;
  if (selectedId) {
    const matches = findApplianceIdentifierMatches(airConditioners, selectedId);
    if (matches.length === 1) {
      return matches[0].item;
    }
    if (matches.length > 1) {
      throw new ApplianceNotFoundError(`AC_ID matches multiple air conditioners: ${selectedId}`, {
        id: selectedId,
        matches: matches.map(({ item }) => item.identifiers)
      });
    }
    throw new ApplianceNotFoundError(`No air conditioner found for AC_ID: ${selectedId}`, {
      id: selectedId,
      available: airConditioners.map((ac) => ac.identifiers)
    });
  }
  if (airConditioners.length === 1) {
    const ac = airConditioners[0];
    console.log(`Selected AC: ${formatAc(ac)}`);
    return ac;
  }
  const choices = airConditioners.map(formatAc);
  const selected = await promptChoice(ask, "Air conditioner", choices, choices[0]);
  return airConditioners[choices.indexOf(selected)];
}

module.exports = { selectAirConditioner };
