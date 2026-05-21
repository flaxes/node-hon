# hOn NodeJS AC controls

CommonJS Node.js module for hOn authentication and air conditioner controls.

## About This Project

This project is a **NodeJS port** of the [Andre0512/pyhOn](https://github.com/Andre0512/pyhOn), which was originally developed by Andre0512 under the MIT License.

All credit for the original implementation goes to the Andre0512. This version reimplements the library in NodeJS and may have differences in API and functionality to suit the JavaScript ecosystem.

## Setup

```bash
cp config_example.js config.js
node examples/show_my_ac_devices.js
```

## Usage

Use `show_my_ac_devices.js` to find identifiers for manual tests. Use the AC `macAddress` as `AC_ID` when possible. If `AC_ID` is omitted, the turn on/off examples print available air conditioners with `macAddress`, `uniqueId`, and `nickName`.

`ac_apply_preset.js` reads `PRESET_NAME`, defaulting to `preset_fan`, and loads presets from `presets/`. Use `show_my_ac_capabilities.js` to inspect real command keys and values when a preset needs another alias.

Example:

```js
process.env.AC_ID = "xx-xx-xx-xx-xx-xx";
process.env.PRESET_NAME = "preset_cool";

require("./examples/ac_apply_preset");
```

## Tests

```bash
npm test
```

### License

This project is released under the MIT License.  
The original Python library is also MIT-licensed. See the `LICENSE` file for details and attribution.
