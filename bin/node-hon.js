#!/usr/bin/env node
"use strict";

const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..");

function usage() {
  return [
    "Usage:",
    "  node-hon apply <mac|name> <preset_name|off>",
    "  node-hon config",
    "  node-hon list",
    "  node-hon generate-preset",
    "  node-hon purge-cache"
  ].join("\n");
}

async function run(argv = process.argv.slice(2), options = {}) {
  const stderr = options.stderr || process.stderr;
  const commands = options.commands || defaultCommands();
  const baseDir = options.baseDir || packageRoot;
  const [command, ...args] = argv;

  if (command === "apply") {
    const [acId, presetName, ...rest] = args;
    if (!acId || !presetName || rest.length) {
      stderr.write(`${usage()}\n`);
      return 1;
    }
    await commands.apply({ acId, presetName, baseDir });
    return 0;
  }

  if (command === "generate-preset") {
    if (args.length) {
      stderr.write(`${usage()}\n`);
      return 1;
    }
    await commands.generatePreset({ baseDir });
    return 0;
  }

  if (command === "config") {
    if (args.length) {
      stderr.write(`${usage()}\n`);
      return 1;
    }
    await commands.config({ baseDir });
    return 0;
  }

  if (command === "list") {
    if (args.length) {
      stderr.write(`${usage()}\n`);
      return 1;
    }
    await commands.list({ baseDir });
    return 0;
  }

  if (command === "purge-cache") {
    if (args.length) {
      stderr.write(`${usage()}\n`);
      return 1;
    }
    await commands.purgeCache({ baseDir });
    return 0;
  }

  stderr.write(`${usage()}\n`);
  return 1;
}

function defaultCommands() {
  return {
    apply: require("../cli/ac_apply_preset").main,
    config: require("../cli/config").main,
    list: require("../cli/show_my_ac_devices").main,
    generatePreset: require("../cli/ac_generate_preset").main,
    purgeCache: require("../cli/purge_cache").main
  };
}

if (require.main === module) {
  run().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run, usage };
