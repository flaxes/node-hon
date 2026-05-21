"use strict";

function formatAc(ac) {
  return `${ac.nickName} (${ac.macAddress})`;
}

function formatAcIdentifiers(ac) {
  return `macAddress=${ac.macAddress} uniqueId=${ac.uniqueId} nickName=${ac.nickName}`;
}

function printAcList(airConditioners, writer = console.log) {
  if (!airConditioners.length) {
    writer("No air conditioners found.");
    return false;
  }
  writer("Available air conditioners:");
  for (const ac of airConditioners) {
    writer(`- ${formatAcIdentifiers(ac)}`);
  }
  return true;
}

function printSkipped(skipped, writer = console.log) {
  if (!skipped.length) {
    return;
  }
  writer("Skipped fields:");
  for (const item of skipped) {
    writer(`- ${item.name}: ${item.reason}`);
  }
}

module.exports = { formatAc, formatAcIdentifiers, printAcList, printSkipped };
