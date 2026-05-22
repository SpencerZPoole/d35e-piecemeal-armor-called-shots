import assert from "node:assert/strict";

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: (Base) => Base
    }
  }
};
globalThis.game = {
  user: {
    targets: []
  },
  settings: {
    get(moduleId, key) {
      if (key === "calledShotProfiles") return activeProfiles;
      if (key === "enableCalledShots") return true;
      return false;
    }
  }
};

const { getDefaultCalledShotProfiles } = await import("../scripts/profiles.js");
const { buildProfileManagerContext, updateProfilesFromProfileManager } = await import("../scripts/settings.js");
const {
  CALLED_SHOT_QUEUE_NAME,
  CALLED_SHOT_SELECT_NAME,
  buildCalledShotControlHtml,
  buildExpectedFullAttackRows,
  normalizeCalledShotLocation,
  normalizeCalledShotQueue
} = await import("../scripts/attack-dialog.js");

const profiles = getDefaultCalledShotProfiles();
let activeProfiles = profiles;
const context = buildProfileManagerContext(profiles);
assert.equal(context.activeProfileId, "pf1e-uc-adapted");
assert.ok(context.locations.length >= 10);
assert.ok(context.locations[0].normalJson.includes("["));

const updated = updateProfilesFromProfileManager(profiles, {
  profileLabel: "Table Defaults",
  profileSource: "House profile",
  profileNotes: "Line one\nLine two",
  "location.arm.enabled": false,
  "location.arm.label": "Arm",
  "location.arm.penalty": "-4",
  "location.arm.coverageSlot": "arms",
  "location.arm.difficulty": "custom",
  "location.arm.normalJson": "[]",
  "location.arm.criticalJson": "[]",
  "location.arm.debilitatingJson": "[]"
}, "pf1e-uc-adapted");
activeProfiles = updated;
const arm = updated.profiles[0].locations.find((location) => location.id === "arm");
assert.equal(updated.profiles[0].label, "Table Defaults");
assert.equal(updated.profiles[0].notes.length, 2);
assert.equal(arm.enabled, false);
assert.equal(arm.penalty, -4);

const sampleLocations = activeProfiles.profiles[0].locations.filter((location) => ["ear", "eye"].includes(location.id));
const control = buildCalledShotControlHtml(sampleLocations, "eye");
assert.ok(control.includes(`name="${CALLED_SHOT_SELECT_NAME}"`));
assert.ok(control.includes(`name="${CALLED_SHOT_QUEUE_NAME}"`));
assert.ok(control.includes("None"));
assert.ok(control.includes("Eye (-10)"));
assert.equal(normalizeCalledShotLocation("none"), "");
assert.deepEqual(normalizeCalledShotQueue("[\"\", \"ear\", \"none\", {\"locationId\":\"eye\"}]"), ["", "ear", "", "eye"]);

const formLike = {
  matches: () => true,
  querySelector(selector) {
    const rapid = selector.includes("rapid-shot");
    const flurry = selector.includes("flurry-of-blows");
    const greater = selector.includes("greater-manyshot");
    const count = selector.includes("greater-manyshot-count");
    if (count) return { value: "2" };
    if (rapid || flurry || greater) return { checked: true };
    return null;
  }
};
const rows = buildExpectedFullAttackRows(formLike, { textContent: "Full Attack (2 attacks)" });
assert.deepEqual(rows.map((row) => row.label), ["Attack", "Attack 2", "Attack 3", "Attack 4", "Attack 5", "Attack 6", "Attack 7", "Attack 8"]);

console.log("test-ux-helpers: ok");
