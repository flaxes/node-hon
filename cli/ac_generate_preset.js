const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const {
  buildPreset,
  defaultValueForField,
  getFieldDescriptors,
  getModeOptions,
  listAirConditioners,
  loadCapabilitiesFile,
  selectAirConditioner,
  selectPresetCommand
} = require("../src/preset-generator");

async function main() {
  const capabilitiesFile = path.resolve(process.cwd(), process.env.CAPABILITIES_FILE || "hon-devices-capabilities.json");
  const capabilities = loadCapabilitiesFile(capabilitiesFile);
  const rl = readline.createInterface({ input, output });
  try {
    const selectedAc = await promptAc(rl, capabilities);
    const selectedCommand = selectPresetCommand(selectedAc.capabilities);
    const generatorMode = await promptChoice(rl, "Generator mode", ["basic", "advanced"], "basic");
    const modeOptions = getModeOptions(selectedCommand.command);
    const presetMode = modeOptions.length ? await promptChoice(rl, "Preset mode", modeOptions, modeOptions[0]) : "";
    const { fields, skipped } = getFieldDescriptors(selectedCommand.command, generatorMode);
    const values = {};
    for (const field of fields) {
      values[field.name] = await promptField(rl, field);
    }
    const preset = buildPreset(selectedCommand.command, values, presetMode);
    const presetName = await promptPresetName(rl);
    const outputFile = path.resolve(__dirname, "..", "presets", `${presetName}.json`);
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, `${JSON.stringify(preset, null, 2)}\n`);
    console.log(`Generated ${path.relative(process.cwd(), outputFile)} for ${selectedAc.name}`);
    console.log(`Selected command: ${selectedCommand.name}${presetMode ? ` (${presetMode})` : ""}`);
    printSkipped(skipped);
  } finally {
    rl.close();
  }
}

async function promptAc(rl, capabilities) {
  if (process.env.AC_ID) {
    return selectAirConditioner(capabilities, process.env.AC_ID);
  }
  const names = listAirConditioners(capabilities);
  if (names.length === 1) {
    console.log(`Selected AC: ${names[0]}`);
    return selectAirConditioner(capabilities, names[0]);
  }
  const selected = await promptChoice(rl, "Air conditioner", names, names[0]);
  return selectAirConditioner(capabilities, selected);
}

async function promptPresetName(rl) {
  const fallback = process.env.PRESET_NAME || "preset_custom";
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
