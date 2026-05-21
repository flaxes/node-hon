function strToFloat(value) {
  if (typeof value === "number") {
    return value;
  }
  const text = String(value).replace(",", ".");
  const number = Number(text);
  if (!Number.isFinite(number)) {
    throw new ValueError(`Invalid number: ${value}`);
  }
  return Number.isInteger(number) ? Number.parseInt(text, 10) : number;
}

function cleanValue(value) {
  return String(value).trim().replace(/^\[/, "").replace(/\]$/, "").replaceAll("|", "_").toLowerCase();
}

class ValueError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValueError";
  }
}

class HonParameter {
  constructor(key, attributes = {}, group = "") {
    this.key = key;
    this.attributes = attributes;
    this.group = group;
    this.triggers = new Map();
    this.reset();
  }

  reset() {
    this.category = this.attributes.category || "";
    this.typology = this.attributes.typology || "";
    this.mandatory = this.attributes.mandatory || 0;
    this._value = "";
  }

  get value() {
    return this._value == null ? "0" : this._value;
  }

  set value(value) {
    this._value = value;
    this.checkTrigger(value);
  }

  get internValue() {
    return String(this.value);
  }

  get values() {
    return [String(this.value)];
  }

  set values(values) {
    this._values = values;
  }

  addTrigger(value, func, data) {
    const key = String(value).toLowerCase();
    if (String(this._value).toLowerCase() === key) {
      func(data);
    }
    if (!this.triggers.has(key)) {
      this.triggers.set(key, []);
    }
    this.triggers.get(key).push([func, data]);
  }

  checkTrigger(value) {
    const rules = this.triggers.get(String(value).toLowerCase()) || [];
    for (const [func, data] of rules) {
      func(data);
    }
  }
}

class HonParameterEnum extends HonParameter {
  reset() {
    super.reset();
    this.defaultValue = this.attributes.defaultValue || "";
    this._value = this.defaultValue || "0";
    this._values = this.attributes.enumValues || [];
    if (this.defaultValue && !this.values.includes(cleanValue(String(this.defaultValue).replace(/^\[/, "").replace(/\]$/, "")))) {
      this._values.push(this.defaultValue);
    }
  }

  get values() {
    return this._values.map(cleanValue);
  }

  set values(values) {
    this._values = values;
  }

  get internValue() {
    return this._value == null ? String(this.values[0]) : String(this._value);
  }

  get value() {
    return this._value == null ? this.values[0] : cleanValue(this._value);
  }

  set value(value) {
    const cleaned = cleanValue(value);
    if (this.values.includes(cleaned)) {
      this._value = value;
      this.checkTrigger(value);
      return;
    }
    throw new ValueError(`Allowed values: ${this.values.join(", ")}. But was: ${value}`);
  }
}

class HonParameterRange extends HonParameter {
  reset() {
    super.reset();
    this.min = strToFloat(this.attributes.minimumValue || 0);
    this.max = strToFloat(this.attributes.maximumValue || 0);
    this.step = strToFloat(this.attributes.incrementValue || 0) || 1;
    this.defaultValue = strToFloat(this.attributes.defaultValue ?? this.min);
    this._value = this.defaultValue;
  }

  get value() {
    return this._value == null ? this.min : this._value;
  }

  set value(value) {
    const number = strToFloat(value);
    const scaled = (number - this.min) * 100;
    const step = this.step * 100;
    if (this.min <= number && number <= this.max && Math.abs(scaled % step) < 1e-9) {
      this._value = number;
      this.checkTrigger(number);
      return;
    }
    throw new ValueError(`Allowed: min ${this.min} max ${this.max} step ${this.step}. But was: ${value}`);
  }

  get values() {
    const result = [];
    for (let value = this.min; value <= this.max; value += this.step) {
      result.push(String(value));
    }
    return result;
  }
}

class HonParameterFixed extends HonParameter {
  reset() {
    super.reset();
    this._value = this.attributes.fixedValue || "";
  }

  get value() {
    return this._value !== "" ? this._value : "0";
  }

  set value(value) {
    this._value = value;
    this.checkTrigger(value);
  }
}

class HonParameterProgram extends HonParameterEnum {
  constructor(key, command, group) {
    super(key, {}, group);
    this.command = command;
    this._value = command.categoryName.includes("PROGRAM") ? command.categoryName.split(".").pop().toLowerCase() : command.categoryName;
    this.programs = command.categories;
    this.typology = "enum";
  }

  get value() {
    return this._value;
  }

  set value(value) {
    if (!this.values.includes(value)) {
      throw new ValueError(`Allowed values: ${this.values.join(", ")}. But was: ${value}`);
    }
    this.command.category = value;
  }

  get values() {
    return Object.keys(this.programs || {})
      .filter((value) => !value.includes("iot_recipe") && !value.includes("iot_guided"))
      .sort();
  }

  set values(_values) {
    throw new ValueError("Cannot set program values");
  }

  get ids() {
    const values = {};
    for (const [name, command] of Object.entries(this.programs || {})) {
      if (name.includes("iot_") || !command.parameters.prCode) {
        continue;
      }
      if (command.parameters.favourite && command.parameters.favourite.value === "1") {
        continue;
      }
      values[Number(command.parameters.prCode.value)] = name;
    }
    return values;
  }

  setValue(value) {
    this._value = value;
  }
}

function createParameter(name, data, group) {
  switch (data.typology) {
    case "range":
      return new HonParameterRange(name, data, group);
    case "enum":
      return new HonParameterEnum(name, data, group);
    case "fixed":
      return new HonParameterFixed(name, data, group);
    default:
      return null;
  }
}

module.exports = {
  HonParameter,
  HonParameterEnum,
  HonParameterRange,
  HonParameterFixed,
  HonParameterProgram,
  ValueError,
  cleanValue,
  strToFloat,
  createParameter
};
