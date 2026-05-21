const fs = require("node:fs/promises");
const path = require("node:path");
const getClient = require("../src/lib-cli/_get-client");
const { createAsk, promptChoice } = require("../src/lib-cli/_prompt");
const { formatAc, printSkipped } = require("../src/lib-cli/_format");
const { handleCliError } = require("../src/lib-cli/_run");
const { selectAirConditioner } = require("../src/lib-cli/_select-ac");
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
  const ask = options.ask || createAsk();
  try {
    const airConditioners = await client.getAirConditioners();
    if (!airConditioners.length) {
      console.log("No air conditioners found.");
      return;
    }
    const selectedAc = await selectAirConditioner(ask, airConditioners, options.acId);
    const selectedCommand = selectPresetCommand(selectedAc.capabilities());
    const generatorMode = await promptChoice(ask, "Generator mode", ["basic", "advanced"], "basic");
    const modeOptions = getModeOptions(selectedCommand.command);
    const presetMode = modeOptions.length ? await promptChoice(ask, "Preset mode", modeOptions, modeOptions[0]) : "";
    const { fields, skipped } = getFieldDescriptors(selectedCommand.command, generatorMode);
    const values = {};
    for (const field of fields) {
      values[field.name] = await promptField(ask, field);
    }
    const preset = buildPreset(selectedCommand.command, values, presetMode);
    const presetName = await promptPresetName(ask, options.presetName);
    const outputFile = path.resolve(baseDir, "presets", `${presetName}.json`);
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, `${JSON.stringify(preset, null, 2)}\n`);
    console.log(`Generated ${path.relative(process.cwd(), outputFile)} for ${formatAc(selectedAc)}`);
    console.log(`Selected command: ${selectedCommand.name}${presetMode ? ` (${presetMode})` : ""}`);
    printSkipped(skipped);
  } finally {
    if (ask.close) {
      ask.close();
    }
    await client.close();
  }
}

async function promptPresetName(ask, presetName = "") {
  const fallback = presetName || process.env.PRESET_NAME || "preset_custom";
  for (;;) {
    const answer = (await ask.question(`Preset filename [${fallback}]: `)).trim() || fallback;
    const safe = answer.replace(/\.json$/i, "");
    if (/^[a-zA-Z0-9_.-]+$/.test(safe)) {
      return safe;
    }
    console.log("Use only letters, numbers, dot, underscore, and dash.");
  }
}

async function promptField(ask, field) {
  const fallback = defaultValueForField(field);
  for (;;) {
    const suffix = field.values.length ? ` (${field.values.join(", ")})` : "";
    const answer = (await ask.question(`${field.name}${suffix} [${fallback}]: `)).trim() || fallback;
    if (field.values.includes(String(answer))) {
      return String(answer);
    }
    console.log(`Allowed values: ${field.values.join(", ")}`);
  }
}

if (require.main === module) {
  main().catch(handleCliError);
}

module.exports = { main };
