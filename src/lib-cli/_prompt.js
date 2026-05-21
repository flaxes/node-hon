"use strict";

const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

function createAsk() {
  const rl = readline.createInterface({ input, output });
  return {
    question: (text) => rl.question(text),
    close: () => rl.close()
  };
}

async function askText(ask, label, fallback, existingSecret = "") {
  const suffix = fallback ? ` [${fallback}]` : existingSecret ? " [keep existing]" : "";
  const answer = (await ask.question(`${label}${suffix}: `)).trim();
  if (answer) {
    return answer;
  }
  return existingSecret || fallback;
}

async function askBoolean(ask, label, fallback, writer = output.write.bind(output)) {
  const suffix = fallback ? "Y/n" : "y/N";
  for (;;) {
    const answer = (await ask.question(`${label} [${suffix}]: `)).trim().toLowerCase();
    if (!answer) {
      return fallback;
    }
    if (["y", "yes", "true", "1"].includes(answer)) {
      return true;
    }
    if (["n", "no", "false", "0"].includes(answer)) {
      return false;
    }
    writer("Enter yes or no.\n");
  }
}

async function promptChoice(ask, label, choices, fallback, writer = console.log) {
  for (;;) {
    writer(`${label}:`);
    choices.forEach((choice, index) => {
      writer(`  ${index + 1}. ${choice}`);
    });
    const answer = (await ask.question(`${label} [${fallback}]: `)).trim();
    if (!answer) {
      return fallback;
    }
    const index = Number(answer);
    if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
      return choices[index - 1];
    }
    if (choices.includes(answer)) {
      return answer;
    }
    writer(`Choose a number from 1 to ${choices.length}, or enter an exact value.`);
  }
}

module.exports = { askBoolean, askText, createAsk, promptChoice };
