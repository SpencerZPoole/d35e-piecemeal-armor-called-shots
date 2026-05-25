import { MODULE_ID, MODULE_TITLE } from "./constants.js";
import { exposeApi } from "./api.js";
import { registerArmorProfileHooks } from "./armor-profile.js";
import { patchD35EAttackRolls } from "./d35e-integration.js";
import { registerSettings } from "./settings.js";
import { registerUiHooks } from "./ui.js";

Hooks.once("init", () => {
  registerSettings();
  exposeApi();
  console.info(`${MODULE_TITLE} | Initializing.`);
});

Hooks.once("ready", async () => {
  exposeApi();
  if (game.system?.id !== "D35E") {
    console.warn(`${MODULE_ID} | This module is intended for the D35E system.`);
    return;
  }
  await patchD35EAttackRolls();
  registerArmorProfileHooks();
  registerUiHooks();
  console.info(`${MODULE_TITLE} | Ready.`);
});
