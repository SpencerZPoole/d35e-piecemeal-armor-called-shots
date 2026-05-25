import { MODULE_ID } from "./constants.js";
import { calculatePiecemealArmor, previewArmorSync, restoreArmorComponents, syncArmorAggregate } from "./armor.js";
import { applyArmorProfile, clearArmorProfile, migrateLegacyArmorProfile, resolveArmorProfile, resumeArmorProfileAutomation, setArmorProfileBaseline, setArmorProfileSlot, suspendArmorProfileAutomation } from "./armor-profile.js";
import {
  applyCalledShotOutcome,
  calculateCalledShotSituationalPenalty,
  clearCalledShot,
  determineCalledShotSeverity,
  getCalledShotFeatState,
  getCalledShotOutcomeMode,
  getCalledShotOptions,
  getCalledShotProfiles,
  getPendingCalledShot,
  stageCalledShot
} from "./called-shots.js";
import { getCalledShotLedger, restoreAllCalledShotLedgerEntries, restoreCalledShotLedgerEntry } from "./effects.js";
import { getDefaultCalledShotProfiles, normalizeCalledShotProfiles } from "./profiles.js";

export function buildApi() {
  return {
    MODULE_ID,
    calculatePiecemealArmor,
    previewArmorSync,
    syncArmorAggregate,
    restoreArmorComponents,
    resolveArmorProfile,
    applyArmorProfile,
    suspendArmorProfileAutomation,
    resumeArmorProfileAutomation,
    clearArmorProfile,
    migrateLegacyArmorProfile,
    setArmorProfileBaseline,
    setArmorProfileSlot,
    getCalledShotProfiles,
    getCalledShotOptions,
    getCalledShotOutcomeMode,
    getDefaultCalledShotProfiles,
    normalizeCalledShotProfiles,
    stageCalledShot,
    clearCalledShot,
    getPendingCalledShot,
    getCalledShotFeatState,
    calculateCalledShotSituationalPenalty,
    determineCalledShotSeverity,
    applyCalledShotOutcome,
    getCalledShotLedger,
    restoreCalledShotLedgerEntry,
    restoreAllCalledShotLedgerEntries,
    getIntegrationStatus() {
      return {
        moduleId: MODULE_ID,
        system: globalThis.game?.system?.id ?? null,
        foundry: globalThis.game?.version ?? null,
        ready: globalThis.game?.ready === true
      };
    }
  };
}

export function exposeApi() {
  const api = buildApi();
  globalThis.d35ePiecemealCalledShots = api;
  if (globalThis.game) game.d35ePiecemealCalledShots = api;
  return api;
}
