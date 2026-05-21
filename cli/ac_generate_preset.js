const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { ApplianceNotFoundError } = require("../src");
const getClient = require("./_get-client");
const {
  buildPreset,
  defaultValueForField,
  getFieldDescriptors,
  getModeOptions,
  selectPresetCommand
} = require("../src/preset-generator");

async function main(options = {}) {
  const baseDir = options.baseDir || path.resolve(__dirname, "..");
  const client = await getClient({ ...options, baseDir });
  const rl = readline.createInterface({ input, output });
  try {
    const airConditioners = await client.getAirConditioners();
    if (!airConditioners.length) {
      console.log("No air conditioners found.");
      return;
    }
    const selectedAc = await promptAc(rl, airConditioners, options.acId);
    const selectedCommand = selectPresetCommand(selectedAc.capabilities());
    const generatorMode = await promptChoice(rl, "Generator mode", ["basic", "advanced"], "basic");
    const modeOptions = getModeOptions(selectedCommand.command);
    const presetMode = modeOptions.length ? await promptChoice(rl, "Preset mode", modeOptions, modeOptions[0]) : "";
    const { fields, skipped } = getFieldDescriptors(selectedCommand.command, generatorMode);
    const values = {};
    for (const field of fields) {
      values[field.name] = await promptField(rl, field);
    }
    const preset = buildPreset(selectedCommand.command, values, presetMode);
    const presetName = await promptPresetName(rl, options.presetName);
    const outputFile = path.resolve(baseDir, "presets", `${presetName}.json`);
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, `${JSON.stringify(preset, null, 2)}\n`);
    console.log(`Generated ${path.relative(process.cwd(), outputFile)} for ${selectedAc.nickName} (${selectedAc.macAddress})`);
    console.log(`Selected command: ${selectedCommand.name}${presetMode ? ` (${presetMode})` : ""}`);
    printSkipped(skipped);
  } finally {
    rl.close();
    await client.close();
  }
}

async function promptAc(rl, airConditioners, acId = "") {
  const selectedId = acId || process.env.AC_ID;
  if (selectedId) {
    const matches = airConditioners.filter((ac) => {
      return (
        ac.macAddress === selectedId ||
        ac.uniqueId === selectedId ||
        ac.nickName === selectedId ||
        ac.nickName.toLowerCase() === selectedId.toLowerCase()
      );
    });
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      throw new ApplianceNotFoundError(`AC_ID matches multiple air conditioners: ${selectedId}`, {
        id: selectedId,
        matches: matches.map((ac) => ac.identifiers)
      });
    }
    throw new ApplianceNotFoundError(`No air conditioner found for AC_ID: ${selectedId}`, {
      id: selectedId,
      available: airConditioners.map((ac) => ac.identifiers)
    });
  }
  if (airConditioners.length === 1) {
    const ac = airConditioners[0];
    console.log(`Selected AC: ${ac.nickName} (${ac.macAddress})`);
    return ac;
  }
  const choices = airConditioners.map((ac) => `${ac.nickName} (${ac.macAddress})`);
  const selected = await promptChoice(rl, "Air conditioner", choices, choices[0]);
  return airConditioners[choices.indexOf(selected)];
}

async function promptPresetName(rl, presetName = "") {
  const fallback = presetName || process.env.PRESET_NAME || "preset_custom";
  for (;;) {
    const answer = (await rl.question(`Preset filename [${fallback}]: `)).trim() || fallback;
    const safe = answer.replace(/\.json$/i, "");
    if (/^[a-zA-Z0-9_.-]+$/.test(safe)) {
      return safe;
    }
    console.log("Use only letters, numbers, dot, underscore, and dash.");
  }
}

async function promptChoice(rl, label, choices, fallback) {
  for (;;) {
    console.log(`${label}:`);
    choices.forEach((choice, index) => {
      console.log(`  ${index + 1}. ${choice}`);
    });
    const answer = (await rl.question(`${label} [${fallback}]: `)).trim();
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
    console.log(`Choose a number from 1 to ${choices.length}, or enter an exact value.`);
  }
}

async function promptField(rl, field) {
  const fallback = defaultValueForField(field);
  for (;;) {
    const suffix = field.values.length ? ` (${field.values.join(", ")})` : "";
    const answer = (await rl.question(`${field.name}${suffix} [${fallback}]: `)).trim() || fallback;
    if (field.values.includes(String(answer))) {
      return String(answer);
    }
    console.log(`Allowed values: ${field.values.join(", ")}`);
  }
}

function printSkipped(skipped) {
  if (!skipped.length) {
    return;
  }
  console.log("Skipped fields:");
  for (const item of skipped) {
    console.log(`- ${item.name}: ${item.reason}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  });
}

module.exports = { main };
