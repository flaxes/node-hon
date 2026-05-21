"use strict";

const IDENTIFIER_FIELDS = ["macAddress", "uniqueId", "nickName"];
const NAME_FIELDS = ["nickName", "applianceName", "applianceNickName", "applianceNickname", "name"];

/**
 * @param {any} item
 */
function applianceIdentifiers(item) {
  const info = item?.info && typeof item.info === "object" ? item.info : {};
  const nickNames = uniqueStrings([
    item?.nickName,
    ...NAME_FIELDS.map((field) => item?.[field]),
    ...NAME_FIELDS.map((field) => info[field])
  ]);
  return {
    macAddress: String(item?.macAddress || ""),
    uniqueId: String(item?.uniqueId || ""),
    nickName: nickNames[0] || "",
    nickNames
  };
}

/**
 * @param {any} item
 * @param {string} id
 */
function applianceIdentifierMatch(item, id) {
  const identifiers = applianceIdentifiers(item);
  for (const field of IDENTIFIER_FIELDS) {
    if (identifiers[field] && identifiers[field] === id) {
      return { matched: true, field };
    }
  }
  if (identifiers.nickNames.some((name) => name === id)) {
    return { matched: true, field: "nickName" };
  }
  if (identifiers.nickNames.some((name) => name.toLowerCase() === String(id).toLowerCase())) {
    return { matched: true, field: "nickName", caseInsensitive: true };
  }
  return { matched: false, field: "" };
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => value != null).map((value) => String(value)).filter(Boolean))];
}

/**
 * @template T
 * @param {T[]} items
 * @param {string} id
 * @returns {{ item: T, field: string, caseInsensitive: boolean }[]}
 */
function findApplianceIdentifierMatches(items, id) {
  if (!id) {
    return [];
  }
  return items
    .map((item) => {
      const match = applianceIdentifierMatch(/** @type {any} */ (item), id);
      return { item, field: match.field, caseInsensitive: Boolean(match.caseInsensitive), matched: match.matched };
    })
    .filter((match) => match.matched)
    .map(({ item, field, caseInsensitive }) => ({ item, field, caseInsensitive }));
}

module.exports = {
  applianceIdentifierMatch,
  applianceIdentifiers,
  findApplianceIdentifierMatches
};
