import { MODULE_ID, MODULE_TITLE } from "./constants.js";
import { exposeApi } from "./api.js";
import { registerArmorProfileHooks, syncPacsEquipmentSlots } from "./armor-profile.js";
import { patchD35EAttackRolls } from "./d35e-integration.js";
import { registerHelmetSkillPenaltyHook } from "./helmet.js";
import { registerSettings, registerSettingsConfigHooks } from "./settings.js";
import { registerUiHooks } from "./ui.js";

Hooks.once("init", () => {
  registerSettings();
  syncPacsEquipmentSlots();
  exposeApi();
  console.info(`${MODULE_TITLE} | Initializing.`);
});

Hooks.once("ready", async () => {
  exposeApi();
  if (game.system?.id !== "D35E") {
    console.warn(`${MODULE_ID} | This module is intended for the D35E system.`);
    return;
  }
  syncPacsEquipmentSlots();
  await patchD35EAttackRolls();
  registerHelmetSkillPenaltyHook();
  registerArmorProfileHooks();
  registerUiHooks();
  registerSettingsConfigHooks();
  console.info(`${MODULE_TITLE} | Ready.`);
});
