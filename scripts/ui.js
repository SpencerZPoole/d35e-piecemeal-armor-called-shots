import { FLAGS, MODULE_ID, SETTINGS } from "./constants.js";
import { applyCalledShotOutcome } from "./called-shots.js";
import { isAggregateArmorItem, isPiecemealArmorPiece, previewArmorSync, restoreArmorComponents, syncArmorAggregate } from "./armor.js";
import { extractCalledShotDamagePayloads, stageCalledShotDamageApplication } from "./local-armor.js";

function isEnabled(settingKey, fallback = true) {
  try {
    return game.settings.get(MODULE_ID, settingKey);
  } catch (_error) {
    return fallback;
  }
}

function htmlRoot(html) {
  if (typeof Element !== "undefined" && html instanceof Element) return html;
  if (typeof Document !== "undefined" && html instanceof Document) return html;
  if (typeof DocumentFragment !== "undefined" && html instanceof DocumentFragment) return html;
  return html?.[0] ?? html;
}

function sheetDocument(app) {
  return app?.item ?? app?.actor ?? app?.document ?? app?.object;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.innerText = value == null ? "" : String(value);
  return div.innerHTML;
}

function appendIconText(element, iconClass, text) {
  const icon = document.createElement("i");
  for (const className of iconClass.split(" ")) icon.classList.add(className);
  element.append(icon, document.createTextNode(` ${text}`));
}

function buildLabeledInput(labelText, type, name, value, attributes = {}) {
  const label = document.createElement("label");
  label.append(document.createTextNode(labelText));
  const input = document.createElement("input");
  input.type = type;
  input.name = name;
  input.value = value == null ? "" : String(value);
  for (const [key, attributeValue] of Object.entries(attributes)) input.setAttribute(key, attributeValue);
  label.append(input);
  return label;
}

function buildLabeledSelect(labelText, name, value, options) {
  const label = document.createElement("label");
  label.append(document.createTextNode(labelText));
  const select = document.createElement("select");
  select.name = name;
  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionLabel;
    option.selected = optionValue === value;
    select.appendChild(option);
  }
  label.append(select);
  return label;
}

function readPanelControlValue(control) {
  if (control.type === "checkbox") return control.checked;
  if (control.type === "number") {
    const value = Number(control.value);
    return Number.isFinite(value) ? value : 0;
  }
  return control.value;
}

function isPiecemealPanelControl(control) {
  return control instanceof HTMLInputElement || control instanceof HTMLSelectElement
    ? control.name?.startsWith(`flags.${MODULE_ID}.${FLAGS.piecemeal}.`)
    : false;
}

function persistPiecemealPanelControl(item, root, form, control) {
  void item.update({ [control.name]: readPanelControlValue(control) }).then(() => {
    schedulePiecemealItemPanelRefresh(item, root, form);
  }).catch((error) => {
    console.error(`${MODULE_ID} | Failed to save piecemeal armor field`, error);
    ui.notifications?.error("Could not save the piecemeal armor field. Check the console for details.");
  });
}

async function maybeConfirmSevereOutcome(severity) {
  if (severity !== "debilitating") return true;
  if (!globalThis.Dialog?.confirm) return window.confirm("Apply the debilitating called-shot outcome?");
  return Dialog.confirm({
    title: "Apply Debilitating Called Shot?",
    content: "<p>This may create severe or long-lived target effects. Confirm that the table has adjudicated the result.</p>",
    yes: () => true,
    no: () => false,
    defaultYes: false
  });
}

export async function createCalledShotChatCard({ payload, actor, item, attackTotal, isCriticalThreat }) {
  if (!globalThis.ChatMessage) return null;
  const targetDocument = payload.targetUuid && globalThis.fromUuid ? await fromUuid(payload.targetUuid).catch(() => null) : null;
  const targetName = targetDocument?.actor?.name ?? targetDocument?.name ?? "No target captured";
  const gmOnlyDetails = game.user?.isGM && isEnabled(SETTINGS.showGmOnlyDetails, true);
  const coverageText = isEnabled(SETTINGS.locationArmorOverlay, false) && payload.coverageSlot
    ? `<p><strong>Coverage slot(s):</strong> ${escapeHtml(payload.coverageSlot)}</p>`
    : "";
  const gmDetails = gmOnlyDetails
    ? `<p><strong>Profile:</strong> ${escapeHtml(payload.profileLabel)}. Outcomes are GM-confirmed and editable in module settings.</p>`
    : "";
  const severityLabels = {
    normal: "Normal",
    critical: "Critical",
    debilitating: "Debilitating"
  };
  const buttons = Object.entries(severityLabels).map(([severity, label]) => (
    `<button type="button" data-d35e-pacs-apply="${severity}" aria-label="Apply ${label} called-shot outcome">${label}</button>`
  )).join("");
  const content = `
    <div class="d35e-pacs-chat-card">
      <h3>Called Shot: ${escapeHtml(payload.locationLabel)}</h3>
      <p><strong>Penalty:</strong> ${payload.penalty}</p>
      <p><strong>Target:</strong> ${escapeHtml(targetName)}</p>
      <p><strong>Attack total:</strong> ${attackTotal ?? "unknown"}${isCriticalThreat ? " (critical threat)" : ""}</p>
      ${coverageText}
      ${gmDetails}
      <div class="d35e-pacs-chat-actions">${buttons}</div>
    </div>`;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: {
      [MODULE_ID]: {
        calledShot: {
          ...payload,
          actorUuid: actor?.uuid ?? null,
          itemUuid: item?.uuid ?? null
        }
      }
    }
  });
}

function getActorItems(actor) {
  if (actor?.items?.contents) return actor.items.contents;
  if (Array.isArray(actor?.items)) return actor.items;
  return [];
}

function hasRestorableArmorState(actor, plan) {
  if (plan.aggregateId) return true;
  return getActorItems(actor).some((item) => Boolean(item.getFlag?.(MODULE_ID, FLAGS.nativeBackup) ?? item.flags?.[MODULE_ID]?.[FLAGS.nativeBackup]));
}

export async function openArmorSyncDialog(actor) {
  const plan = previewArmorSync(actor);
  const hasPieces = plan.summary.pieces.length > 0;
  const canRestore = hasRestorableArmorState(actor, plan);
  const rows = plan.summary.pieces.map((piece) => (
    `<tr><td>${escapeHtml(piece.name)}</td><td>${escapeHtml(piece.slot)}</td><td>${piece.armorBonus}</td><td>${piece.acp}</td><td>${piece.spellFailure}%</td></tr>`
  )).join("");
  const emptyGuidance = hasPieces
    ? ""
    : "<p><strong>No syncable pieces found.</strong> Mark at least one carried, unbroken equipment item as a piecemeal armor component before syncing.</p>";
  const content = `
    <div class="d35e-pacs-armor-preview">
      <p>This creates or updates one D35E aggregate armor item and neutralizes native armor math on the component pieces. Restore reverses backed-up fields.</p>
      ${emptyGuidance}
      <table>
        <thead><tr><th>Piece</th><th>Slot</th><th>Armor</th><th>ACP</th><th>ASF</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='5'>No syncable piecemeal armor pieces found.</td></tr>"}</tbody>
      </table>
      <p><strong>Total:</strong> armor ${plan.summary.armorBonus + plan.summary.enhancementBonus}, max Dex ${plan.summary.maxDex ?? "none"}, ACP ${plan.summary.acp}, ASF ${plan.summary.spellFailure}%.</p>
    </div>`;
  return new Promise((resolve) => {
    const buttons = {};
    if (hasPieces) {
      buttons.sync = {
        label: "Sync",
        callback: async () => {
          const result = await syncArmorAggregate(actor);
          ui.notifications.info("Piecemeal armor aggregate synced.");
          resolve(result);
        }
      };
    }
    if (canRestore) {
      buttons.restore = {
        label: "Restore",
        callback: async () => {
          const result = await restoreArmorComponents(actor);
          ui.notifications.info("Piecemeal armor component fields restored.");
          resolve(result);
        }
      };
    }
    buttons.close = {
      label: "Close",
      callback: () => resolve(null)
    };
    new Dialog({
      title: "Sync Piecemeal Armor",
      content,
      buttons,
      default: hasPieces ? "sync" : "close"
    }).render(true);
  });
}

function createIconAction({ title, iconClass, dataset, className = "item-control" }) {
  const action = document.createElement("a");
  action.href = "#";
  action.title = title;
  action.className = className;
  for (const [key, value] of Object.entries(dataset)) action.dataset[key] = value;
  const icon = document.createElement("i");
  for (const classPart of iconClass.split(" ")) icon.classList.add(classPart);
  action.appendChild(icon);
  return action;
}

function appendInventoryIndicators(app, root) {
  if (!isEnabled(SETTINGS.enableArmor, true)) return;
  const actor = sheetDocument(app);
  if (!actor?.items) return;
  for (const row of root.querySelectorAll("[data-item-id]")) {
    const item = actor.items.get(row.dataset.itemId);
    if (item?.type !== "equipment") continue;
    const controls = row.querySelector(".item-controls") ?? row.querySelector(".item-control")?.parentElement ?? row;
    if (!isAggregateArmorItem(item) && !row.querySelector("[data-d35e-pacs-configure-piece]")) {
      const configure = createIconAction({
        title: "Configure piecemeal armor",
        iconClass: "fas fa-shield-alt",
        dataset: { d35ePacsConfigurePiece: "true", itemId: item.id }
      });
      controls.prepend(configure);
    }
    if (row.querySelector("[data-d35e-pacs-armor-chip]")) continue;
    const name = row.querySelector(".item-name") ?? row;
    const chip = document.createElement("span");
    chip.classList.add("d35e-pacs-chip");
    chip.dataset.d35ePacsArmorChip = "true";
    let chipText = "";
    let chipClass = "";
    if (isAggregateArmorItem(item)) {
      chipText = "aggregate";
      chipClass = "d35e-pacs-chip-aggregate";
    } else if (isPiecemealArmorPiece(item)) {
      const flag = item.getFlag?.(MODULE_ID, FLAGS.piecemeal) ?? {};
      chipText = `piece: ${flag.slot ?? "armor"}`;
      chipClass = "d35e-pacs-chip-piece";
    } else if (item.getFlag?.(MODULE_ID, FLAGS.nativeBackup)) {
      chipText = "synced component";
      chipClass = "d35e-pacs-chip-synced";
    }
    if (chipText) {
      chip.textContent = chipText;
      chip.classList.add(chipClass);
      name.appendChild(chip);
    }
  }
}

function injectPiecemealItemPanel(item, root, form) {
  if (root.querySelector("[data-d35e-pacs-piece-panel]")) return;
  const flag = item.getFlag?.(MODULE_ID, FLAGS.piecemeal) ?? {};
  const detailsTab = root.querySelector('.tab[data-tab="details"]') ?? root.querySelector(".tab.details");
  const insertTarget = detailsTab ?? form;
  const fieldset = document.createElement("fieldset");
  fieldset.classList.add("d35e-pacs-fieldset");
  fieldset.dataset.d35ePacsPiecePanel = "true";
  const legend = document.createElement("legend");
  legend.textContent = "Piecemeal Armor";
  const help = document.createElement("p");
  help.classList.add("d35e-pacs-help");
  help.textContent = "Use this item as a module-managed armor component. Coverage can name one or more locations, such as head; eyes; ears or torso, arms, legs. After sync, the generated aggregate item is what contributes D35E armor AC.";
  const enabledLabel = document.createElement("label");
  enabledLabel.classList.add("d35e-pacs-checkbox");
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.name = `flags.${MODULE_ID}.${FLAGS.piecemeal}.enabled`;
  enabled.checked = flag.enabled === true;
  enabledLabel.append(enabled, document.createTextNode(" Include in piecemeal armor sync"));
  const grid = document.createElement("div");
  grid.classList.add("d35e-pacs-grid");
  const category = flag.equipmentSubtype ?? item.system?.equipmentSubtype ?? "lightArmor";
  grid.append(
    buildLabeledInput("Coverage slot(s) ", "text", `flags.${MODULE_ID}.${FLAGS.piecemeal}.slot`, flag.slot ?? "torso", {
      placeholder: "head; eyes; ears"
    }),
    buildLabeledInput("Armor bonus ", "number", `flags.${MODULE_ID}.${FLAGS.piecemeal}.armorBonus`, flag.armorBonus ?? item.system?.armor?.value ?? 0),
    buildLabeledInput("Enhancement bonus ", "number", `flags.${MODULE_ID}.${FLAGS.piecemeal}.enhancementBonus`, flag.enhancementBonus ?? item.system?.armor?.enh ?? 0),
    buildLabeledInput("Max Dex ", "text", `flags.${MODULE_ID}.${FLAGS.piecemeal}.maxDex`, flag.maxDex ?? item.system?.armor?.dex ?? ""),
    buildLabeledInput("Armor check penalty ", "number", `flags.${MODULE_ID}.${FLAGS.piecemeal}.acp`, flag.acp ?? item.system?.armor?.acp ?? 0),
    buildLabeledInput("Arcane failure % ", "number", `flags.${MODULE_ID}.${FLAGS.piecemeal}.spellFailure`, flag.spellFailure ?? item.system?.spellFailure ?? 0),
    buildLabeledInput("Weight ", "number", `flags.${MODULE_ID}.${FLAGS.piecemeal}.weight`, flag.weight ?? item.system?.weight ?? 0),
    buildLabeledSelect("Armor category ", `flags.${MODULE_ID}.${FLAGS.piecemeal}.equipmentSubtype`, category, [
      ["clothing", "Clothing"],
      ["lightArmor", "Light armor"],
      ["mediumArmor", "Medium armor"],
      ["heavyArmor", "Heavy armor"]
    ])
  );
  fieldset.append(legend, help, enabledLabel, grid);
  fieldset.addEventListener("input", (event) => {
    const control = event.target;
    if (!isPiecemealPanelControl(control) || !["number", "text"].includes(control.type)) return;
    event.stopPropagation();
    window.clearTimeout(control._d35ePacsInputTimer);
    control._d35ePacsInputTimer = window.setTimeout(() => {
      persistPiecemealPanelControl(item, root, form, control);
    }, 250);
  });
  fieldset.addEventListener("change", (event) => {
    const control = event.target;
    if (!isPiecemealPanelControl(control)) return;
    event.stopPropagation();
    persistPiecemealPanelControl(item, root, form, control);
  });
  const detailsHeader = insertTarget.querySelector?.(".form-header");
  if (detailsHeader?.after) detailsHeader.after(fieldset);
  else insertTarget.prepend(fieldset);
}

function schedulePiecemealItemPanelRefresh(item, root, form) {
  for (const delay of [0, 100, 500]) {
    window.setTimeout(() => injectPiecemealItemPanel(item, root, form), delay);
  }
}

function appendItemSheetControls(app, html) {
  const item = sheetDocument(app);
  if (!item) return;
  const root = htmlRoot(html);
  const form = root?.querySelector?.("form");
  if (!form) return;

  if (item.type === "equipment" && !isAggregateArmorItem(item) && isEnabled(SETTINGS.enableArmor, true)) {
    injectPiecemealItemPanel(item, root, form);
    schedulePiecemealItemPanelRefresh(item, root, form);
    if (root.dataset?.d35ePacsPieceRefresh !== "true") {
      root.dataset.d35ePacsPieceRefresh = "true";
      root.addEventListener("click", (event) => {
        if (!event.target.closest?.('[data-tab="details"]')) return;
        schedulePiecemealItemPanelRefresh(item, root, form);
      });
    }
  }

}

function appendActorSheetControls(app, html) {
  const actor = sheetDocument(app);
  if (!actor?.isOwner) return;
  const root = htmlRoot(html);
  const title = root?.querySelector?.(".window-header .window-title");
  const form = root?.querySelector?.("form");
  if ((title || form) && !root.querySelector("[data-d35e-pacs-armor-sync]") && isEnabled(SETTINGS.enableArmor, true)) {
    const button = document.createElement("a");
    button.classList.add("d35e-pacs-header-button");
    button.dataset.d35ePacsArmorSync = "true";
    appendIconText(button, "fas fa-shield-alt", "Piecemeal Armor");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      void openArmorSyncDialog(actor);
    });
    if (title) title.after(button);
    else form.prepend(button);
  }
  appendInventoryIndicators(app, root);
  root.addEventListener("click", (event) => {
    const armorButton = event.target.closest("[data-d35e-pacs-configure-piece]");
    if (armorButton) {
      event.preventDefault();
      event.stopPropagation();
      actor.items.get(armorButton.dataset.itemId)?.sheet?.render(true);
    }
  });
}

function wireChatCard(message, html) {
    const root = htmlRoot(html);
    const payload = message.getFlag?.(MODULE_ID, "calledShot");
    if (!root?.querySelectorAll) return;
    if (payload) for (const button of root.querySelectorAll("[data-d35e-pacs-apply]")) {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        if (!game.user?.isGM) {
          ui.notifications.warn("Only the GM can apply called shot outcomes.");
          return;
        }
        const severity = button.dataset.d35ePacsApply;
        if (!await maybeConfirmSevereOutcome(severity)) return;
        const targetActor = payload.targetUuid ? await fromUuid(payload.targetUuid).then((doc) => doc?.actor ?? doc).catch(() => null) : null;
        await applyCalledShotOutcome({
          targetActor,
          targetUuid: payload.targetUuid,
          locationId: payload.locationId,
          profileId: payload.profileId,
          severity
        });
        ui.notifications.info(`Applied ${severity} called shot outcome.`);
      });
    }
    const chatTemplateData = message.getFlag?.("D35E", "chatTemplateData");
    const damagePayloads = extractCalledShotDamagePayloads(chatTemplateData);
    if (!damagePayloads.some(Boolean)) return;
    const buttons = [...root.querySelectorAll("button[data-action='applyDamage'], button[data-action='applyDamageHalf']")];
    buttons.forEach((button, index) => {
      const damagePayload = damagePayloads[index];
      if (!damagePayload) return;
      button.dataset.d35ePacsCalledShotLocation = damagePayload.locationLabel ?? damagePayload.locationId;
      button.addEventListener("click", () => {
        stageCalledShotDamageApplication(damagePayload, {
          messageId: message.id,
          touch: button.dataset.touch === "true" || button.dataset.touch === "1"
        });
      }, { capture: true });
    });
}

function registerChatActionListeners() {
  Hooks.on("renderChatMessageHTML", wireChatCard);
}

export function registerUiHooks() {
  Hooks.on("renderItemSheet", appendItemSheetControls);
  Hooks.on("renderActorSheet", appendActorSheetControls);
  registerChatActionListeners();
}
