import { ARMOR_WORKFLOW_MODES, FLAGS, MODULE_ID, PIECE_CATEGORIES, RULES_MODES, SETTINGS } from "./constants.js";
import { applyCalledShotOutcome } from "./called-shots.js";
import { getFlagData, getItems, isAggregateArmorItem, isInternalArmorProfileItem, isPiecemealArmorPiece, previewArmorSync, RAW_ARMOR_PIECE_CATALOG, restoreArmorComponents, syncArmorAggregate } from "./armor.js";
import {
  applyArmorProfile,
  armorProfileStatusLabel,
  clearArmorProfile,
  getArmorWorkflowMode,
  migrateLegacyArmorProfile,
  readArmorProfile,
  resolveArmorProfile,
  setArmorProfileBaseline,
  setArmorProfileSlot
} from "./armor-profile.js";
import { getCalledShotLedger, restoreAllCalledShotLedgerEntries, restoreCalledShotLedgerEntry } from "./effects.js";
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

function applyCatalogPiece(item, root, form, catalogId) {
  const catalog = RAW_ARMOR_PIECE_CATALOG.find((entry) => entry.id === catalogId);
  if (!catalog) return;
  const base = `flags.${MODULE_ID}.${FLAGS.piecemeal}`;
  const update = {
    [`${base}.catalogId`]: catalog.id,
    [`${base}.pieceCategory`]: catalog.pieceCategory,
    [`${base}.coverageSlots`]: catalog.coverageSlots,
    [`${base}.armorFamily`]: catalog.armorFamily,
    [`${base}.equipmentSubtype`]: catalog.equipmentSubtype,
    [`${base}.armorBonus`]: catalog.armorBonus,
    [`${base}.maxDex`]: catalog.maxDex,
    [`${base}.acp`]: catalog.acp,
    [`${base}.spellFailure`]: catalog.spellFailure,
    [`${base}.weight`]: catalog.weight,
    [`${base}.cost`]: catalog.cost
  };
  void item.update(update).then(() => {
    ui.notifications?.info(`Applied ${catalog.label} piecemeal armor values.`);
    schedulePiecemealItemPanelRefresh(item, root, form);
  }).catch((error) => {
    console.error(`${MODULE_ID} | Failed to apply piecemeal armor catalog values`, error);
    ui.notifications?.error("Could not apply the piecemeal armor catalog values. Check the console for details.");
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
    ? `<p><strong>Profile:</strong> ${escapeHtml(payload.profileLabel)}. Outcomes are editable in module settings.</p>`
    : "";
  const severityLabels = {
    normal: "Normal",
    critical: "Critical",
    debilitating: "Debilitating"
  };
  const autoMode = payload.rulesMode === RULES_MODES.rawAdapted;
  const buttons = autoMode ? "" : Object.entries(severityLabels).map(([severity, label]) => (
    `<button type="button" data-d35e-pacs-apply="${severity}" aria-label="Apply ${label} called-shot outcome">${label}</button>`
  )).join("");
  const outcomeText = autoMode
    ? "<p><strong>Outcome:</strong> Use D35E's native Apply Damage button. If the attack hits and damage gets through, the module determines severity and records any automatic effects in the target's called-shot ledger.</p>"
    : "<p><strong>Outcome:</strong> GM confirmation required. Choose the severity after adjudicating the hit.</p>";
  const content = `
    <div class="d35e-pacs-chat-card">
      <h3>Called Shot: ${escapeHtml(payload.locationLabel)}</h3>
      <p><strong>Penalty:</strong> ${payload.penalty}</p>
      <p><strong>Target:</strong> ${escapeHtml(targetName)}</p>
      <p><strong>Attack total:</strong> ${attackTotal ?? "unknown"}${isCriticalThreat ? " (critical threat)" : ""}</p>
      ${coverageText}
      ${gmDetails}
      ${outcomeText}
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
    `<tr><td>${escapeHtml(piece.name)}</td><td>${escapeHtml(piece.pieceCategory)}</td><td>${escapeHtml(piece.coverageSlots)}</td><td>${piece.armorBonus}</td><td>${piece.acp}</td><td>${piece.spellFailure}%</td></tr>`
  )).join("");
  const notes = plan.summary.notes?.length
    ? `<ul>${plan.summary.notes.map((noteText) => `<li>${escapeHtml(noteText)}</li>`).join("")}</ul>`
    : "";
  const emptyGuidance = hasPieces
    ? ""
    : "<p><strong>No syncable pieces found.</strong> Mark at least one carried, unbroken equipment item as a piecemeal armor component before syncing.</p>";
  const content = `
    <div class="d35e-pacs-armor-preview">
      <p>This creates or updates one D35E aggregate armor item and neutralizes native armor math on the component pieces. Restore reverses backed-up fields.</p>
      ${emptyGuidance}
      <table>
        <thead><tr><th>Piece</th><th>Category</th><th>Coverage</th><th>Armor</th><th>ACP</th><th>ASF</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='6'>No syncable piecemeal armor pieces found.</td></tr>"}</tbody>
      </table>
      <p><strong>Total:</strong> armor ${plan.summary.armorBonus + plan.summary.enhancementBonus}, max Dex ${plan.summary.maxDex ?? "none"}, ACP ${plan.summary.acp}, ASF ${plan.summary.spellFailure}%, carried component weight ${plan.summary.weight}.</p>
      ${notes}
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

function actorEquipmentOptions(actor, { includeArmorOnly = false } = {}) {
  const items = actor?.items?.contents ?? (Array.isArray(actor?.items) ? actor.items : []);
  return [
    ["", "None"],
    ...items
      .filter((item) => item.type === "equipment")
      .filter((item) => !isAggregateArmorItem(item) && !isInternalArmorProfileItem(item))
      .filter((item) => includeArmorOnly ? item.system?.equipmentType === "armor" || getFlagData(item, FLAGS.nativeBackup)?.native?.equipmentType === "armor" : true)
      .map((item) => [item.id, item.name])
  ];
}

function appendSelectOption(select, value, label, selectedValue) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = value === selectedValue;
  select.appendChild(option);
}

function buildProfileSelect({ label, value, options, action, category }) {
  const wrapper = document.createElement("label");
  wrapper.classList.add("d35e-pacs-profile-slot");
  wrapper.dataset.d35ePacsDropSlot = category ?? action;
  wrapper.append(document.createElement("span"));
  wrapper.firstElementChild.textContent = label;
  const select = document.createElement("select");
  select.dataset.d35ePacsProfileAction = action;
  if (category) select.dataset.category = category;
  for (const [optionValue, optionLabel] of options) appendSelectOption(select, optionValue, optionLabel, value ?? "");
  wrapper.append(select);
  return wrapper;
}

function summaryValue(value, fallback = "none") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function hasLegacyArmorProfileData(actor, resolution) {
  const profile = readArmorProfile(actor);
  const hasProfileSlots = Object.values(profile.slots).some(Boolean);
  if (hasProfileSlots) return false;
  if (resolution.visibleLegacyAggregate) return true;
  return getItems(actor).some((item) => getFlagData(item, FLAGS.nativeBackup) || isPiecemealArmorPiece(item));
}

function renderArmorProfilePanel(actor) {
  const resolution = resolveArmorProfile(actor);
  const profile = readArmorProfile(actor);
  const root = document.createElement("section");
  root.classList.add("d35e-pacs-armor-profile");
  root.dataset.d35ePacsArmorProfile = "true";

  const header = document.createElement("header");
  const title = document.createElement("h3");
  title.textContent = "Piecemeal Armor Profile";
  const status = document.createElement("span");
  status.classList.add("d35e-pacs-chip", `d35e-pacs-status-${resolution.status}`);
  status.textContent = armorProfileStatusLabel(resolution.status);
  header.append(title, status);

  const help = document.createElement("p");
  help.classList.add("d35e-pacs-help");
  help.textContent = "Use the normal D35E armor slot as a baseline, then override Torso, Arms, or Legs only when this actor is mixing armor pieces.";

  const options = actorEquipmentOptions(actor);
  const baselineOptions = actorEquipmentOptions(actor, { includeArmorOnly: true });
  const controls = document.createElement("div");
  controls.classList.add("d35e-pacs-profile-controls");
  controls.append(
    buildProfileSelect({
      label: "Baseline armor",
      value: profile.baselineItemId ?? resolution.baselineItem?.id ?? "",
      options: baselineOptions,
      action: "baseline"
    }),
    ...[PIECE_CATEGORIES.torso, PIECE_CATEGORIES.arms, PIECE_CATEGORIES.legs].map((category) => buildProfileSelect({
      label: `${category.charAt(0).toUpperCase()}${category.slice(1)} override`,
      value: profile.slots[category] ?? "",
      options,
      action: "slot",
      category
    }))
  );

  const resolved = document.createElement("div");
  resolved.classList.add("d35e-pacs-profile-resolved");
  const resolvedTitle = document.createElement("strong");
  resolvedTitle.textContent = "Resolved pieces";
  const list = document.createElement("ul");
  for (const piece of resolution.pieces) {
    const item = document.createElement("li");
    item.textContent = `${piece.pieceCategory}: ${piece.sourceItemName ?? piece.name} (${piece.armorBonus} armor, ASF ${piece.spellFailure}%)`;
    list.appendChild(item);
  }
  if (!resolution.pieces.length) {
    const item = document.createElement("li");
    item.textContent = "No piecemeal profile pieces are active.";
    list.appendChild(item);
  }
  resolved.append(resolvedTitle, list);

  const totals = document.createElement("div");
  totals.classList.add("d35e-pacs-profile-totals");
  const totalRows = [
    ["Armor", resolution.summary.armorBonus + resolution.summary.enhancementBonus],
    ["Max Dex", summaryValue(resolution.summary.maxDex)],
    ["ACP", resolution.summary.acp],
    ["ASF", `${resolution.summary.spellFailure}%`],
    ["Weight", resolution.summary.weight],
    ["Suit", resolution.summary.completeSuit ? "+1 full suit" : "no"],
    ["Mixed ASF", resolution.summary.mixedSuit ? `+${resolution.summary.mixedSuitSpellFailurePenalty}%` : "no"]
  ];
  for (const [label, value] of totalRows) {
    const entry = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = `${label}:`;
    entry.append(name, document.createTextNode(` ${summaryValue(value)}`));
    totals.appendChild(entry);
  }

  if (resolution.unresolved.length) {
    const warning = document.createElement("p");
    warning.classList.add("d35e-pacs-warning");
    warning.textContent = "One or more selected armor items need piece values before the profile can update D35E armor math.";
    root.appendChild(warning);
  }

  const actions = document.createElement("div");
  actions.classList.add("d35e-pacs-profile-actions");
  const profileActions = [
    ["apply", "Apply Profile"],
    ["clear", "Clear Profile"]
  ];
  if (hasLegacyArmorProfileData(actor, resolution)) profileActions.push(["migrate", "Migrate Legacy"]);
  for (const [action, label] of profileActions) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.d35ePacsProfileAction = action;
    button.textContent = label;
    actions.appendChild(button);
  }

  root.append(header, help, controls, resolved, totals, actions);
  return root;
}

async function itemIdFromDrop(actor, event) {
  const raw = event.dataTransfer?.getData("text/plain") || event.dataTransfer?.getData("application/json") || "";
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_error) {
    return null;
  }
  if (data.itemId && actor.items?.get?.(data.itemId)) return data.itemId;
  if (data.uuid && globalThis.fromUuid) {
    const document = await fromUuid(data.uuid);
    if (!document || document.documentName !== "Item") return null;
    if (document.parent?.id === actor.id) return document.id;
    if (!actor.createEmbeddedDocuments) return null;
    const created = await actor.createEmbeddedDocuments("Item", [document.toObject()], { d35ePacsProfile: true });
    return created?.[0]?.id ?? null;
  }
  return null;
}

function injectArmorProfilePanel(app, root) {
  if (!isEnabled(SETTINGS.enableArmor, true)) return;
  if (getArmorWorkflowMode() !== ARMOR_WORKFLOW_MODES.nativeProfile) return;
  if (root.querySelector("[data-d35e-pacs-armor-profile]")) return;
  const actor = sheetDocument(app);
  if (!actor?.isOwner) return;
  const target = root.querySelector('.tab[data-tab="inventory"]') ??
    root.querySelector(".inventory-list")?.parentElement ??
    root.querySelector("form");
  if (!target) return;

  const panel = renderArmorProfilePanel(actor);
  target.prepend(panel);

  panel.addEventListener("change", async (event) => {
    const control = event.target.closest("[data-d35e-pacs-profile-action]");
    if (!control) return;
    event.preventDefault();
    try {
      if (control.dataset.d35ePacsProfileAction === "baseline") await setArmorProfileBaseline(actor, control.value);
      if (control.dataset.d35ePacsProfileAction === "slot") await setArmorProfileSlot(actor, control.dataset.category, control.value);
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to update armor profile.`, error);
      ui.notifications?.error(error.message ?? "Could not update the armor profile.");
    }
  });

  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-d35e-pacs-profile-action]");
    if (!button) return;
    event.preventDefault();
    try {
      if (button.dataset.d35ePacsProfileAction === "apply") {
        const result = await applyArmorProfile(actor);
        ui.notifications?.info(result.reason === "needsPieceValues" ? "Armor profile needs piece values before it can apply." : "Piecemeal armor profile applied.");
      }
      if (button.dataset.d35ePacsProfileAction === "clear") {
        await clearArmorProfile(actor);
        ui.notifications?.info("Piecemeal armor profile cleared.");
      }
      if (button.dataset.d35ePacsProfileAction === "migrate") {
        const result = await migrateLegacyArmorProfile(actor);
        ui.notifications?.info(result.migrated ? "Legacy piecemeal armor state migrated." : "No legacy piecemeal armor state found.");
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to apply armor profile action.`, error);
      ui.notifications?.error(error.message ?? "Could not update the armor profile.");
    }
  });

  for (const dropSlot of panel.querySelectorAll("[data-d35e-pacs-drop-slot]")) {
    dropSlot.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropSlot.classList.add("d35e-pacs-drop-hover");
    });
    dropSlot.addEventListener("dragleave", () => dropSlot.classList.remove("d35e-pacs-drop-hover"));
    dropSlot.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropSlot.classList.remove("d35e-pacs-drop-hover");
      const itemId = await itemIdFromDrop(actor, event);
      if (!itemId) return;
      const select = dropSlot.querySelector("select");
      if (dropSlot.dataset.d35ePacsDropSlot === "baseline") await setArmorProfileBaseline(actor, itemId);
      else await setArmorProfileSlot(actor, dropSlot.dataset.d35ePacsDropSlot, itemId);
      if (select) select.value = itemId;
    });
  }
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
    if (isInternalArmorProfileItem(item)) {
      row.hidden = true;
      row.style.display = "none";
      continue;
    }
    const controls = row.querySelector(".item-controls") ?? row.querySelector(".item-control")?.parentElement ?? row;
    if (!isAggregateArmorItem(item) && !row.querySelector("[data-d35e-pacs-configure-piece]")) {
      const configure = createIconAction({
        title: "Configure piecemeal armor values",
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
      chipText = `piece: ${flag.pieceCategory ?? flag.coverageSlots ?? flag.coverageSlot ?? flag.slot ?? "armor"}`;
      chipClass = "d35e-pacs-chip-piece";
    } else if (item.getFlag?.(MODULE_ID, FLAGS.armorProfile)?.role === "source") {
      chipText = "worn in profile";
      chipClass = "d35e-pacs-chip-synced";
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

export async function openCalledShotLedgerDialog(actor) {
  const ledger = getCalledShotLedger(actor);
  const activeEntries = ledger.filter((entry) => !entry.restoredAt);
  const rows = activeEntries.map((entry) => `
    <tr>
      <td>${escapeHtml(entry.locationLabel ?? entry.locationId ?? "Location")}</td>
      <td>${escapeHtml(entry.severity ?? "unknown")}</td>
      <td>${escapeHtml(entry.appliedAt ?? "")}</td>
      <td><button type="button" data-d35e-pacs-restore-ledger="${escapeHtml(entry.id)}">Restore</button></td>
    </tr>
  `).join("");
  const content = `
    <div class="d35e-pacs-ledger">
      <p>Restore reverses actor updates and removes ActiveEffect notes created by automatic called-shot outcomes.</p>
      <table>
        <thead><tr><th>Location</th><th>Severity</th><th>Applied</th><th></th></tr></thead>
        <tbody>${rows || "<tr><td colspan='4'>No active called-shot effects.</td></tr>"}</tbody>
      </table>
    </div>`;
  return new Promise((resolve) => {
    const dialog = new Dialog({
      title: "Called Shot Effects",
      content,
      buttons: {
        restoreAll: {
          label: "Restore All",
          callback: async () => {
            const result = await restoreAllCalledShotLedgerEntries(actor);
            ui.notifications.info(`Restored ${result.length} called-shot ledger entr${result.length === 1 ? "y" : "ies"}.`);
            resolve(result);
          }
        },
        close: {
          label: "Close",
          callback: () => resolve(null)
        }
      },
      render: (html) => {
        const root = htmlRoot(html);
        for (const button of root.querySelectorAll?.("[data-d35e-pacs-restore-ledger]") ?? []) {
          button.addEventListener("click", async (event) => {
            event.preventDefault();
            const result = await restoreCalledShotLedgerEntry(actor, button.dataset.d35ePacsRestoreLedger);
            ui.notifications.info("Called-shot effect restored.");
            dialog.close();
            resolve(result);
          });
        }
      }
    });
    dialog.render(true);
  });
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
  help.textContent = getArmorWorkflowMode() === ARMOR_WORKFLOW_MODES.legacyAggregate
    ? "Use this item as a module-managed armor component. RAW-adapted armor math uses the piece category, while coverage slot(s) map called-shot locations such as head; eyes; ears. After sync, the generated aggregate item is what contributes D35E armor AC."
    : "Use these fields for custom or unusual armor pieces that are not in the profile catalog. Piece category drives Torso/Arms/Legs math, while coverage slot(s) map called-shot locations such as head; eyes; ears.";
  const enabledLabel = document.createElement("label");
  enabledLabel.classList.add("d35e-pacs-checkbox");
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.name = `flags.${MODULE_ID}.${FLAGS.piecemeal}.enabled`;
  enabled.checked = flag.enabled === true;
  enabledLabel.append(enabled, document.createTextNode(getArmorWorkflowMode() === ARMOR_WORKFLOW_MODES.legacyAggregate ? " Include in piecemeal armor sync" : " Use explicit piecemeal armor values"));
  const grid = document.createElement("div");
  grid.classList.add("d35e-pacs-grid");
  const category = flag.equipmentSubtype ?? item.system?.equipmentSubtype ?? "lightArmor";
  const coverage = flag.coverageSlots ?? flag.coverageSlot ?? flag.slot ?? "torso";
  grid.append(
    buildLabeledSelect("Known piece ", `flags.${MODULE_ID}.${FLAGS.piecemeal}.catalogId`, flag.catalogId ?? "", [
      ["", "Manual values"],
      ...RAW_ARMOR_PIECE_CATALOG.map((entry) => [entry.id, entry.label])
    ]),
    buildLabeledSelect("Piece category ", `flags.${MODULE_ID}.${FLAGS.piecemeal}.pieceCategory`, flag.pieceCategory ?? "", [
      ["", "Infer from coverage"],
      ["torso", "Torso"],
      ["legs", "Legs"],
      ["arms", "Arms"]
    ]),
    buildLabeledInput("Coverage slot(s) ", "text", `flags.${MODULE_ID}.${FLAGS.piecemeal}.coverageSlots`, coverage, {
      placeholder: "head; eyes; ears"
    }),
    buildLabeledInput("Armor family ", "text", `flags.${MODULE_ID}.${FLAGS.piecemeal}.armorFamily`, flag.armorFamily ?? flag.family ?? "", {
      placeholder: "plate"
    }),
    buildLabeledInput("Material ", "text", `flags.${MODULE_ID}.${FLAGS.piecemeal}.material`, flag.material ?? "", {
      placeholder: "mithral"
    }),
    buildLabeledInput("Armor bonus ", "number", `flags.${MODULE_ID}.${FLAGS.piecemeal}.armorBonus`, flag.armorBonus ?? item.system?.armor?.value ?? 0),
    buildLabeledInput("Enhancement bonus ", "number", `flags.${MODULE_ID}.${FLAGS.piecemeal}.enhancementBonus`, flag.enhancementBonus ?? item.system?.armor?.enh ?? 0),
    buildLabeledInput("Max Dex ", "text", `flags.${MODULE_ID}.${FLAGS.piecemeal}.maxDex`, flag.maxDex ?? item.system?.armor?.dex ?? ""),
    buildLabeledInput("Armor check penalty ", "number", `flags.${MODULE_ID}.${FLAGS.piecemeal}.acp`, flag.acp ?? item.system?.armor?.acp ?? 0),
    buildLabeledInput("Arcane failure % ", "number", `flags.${MODULE_ID}.${FLAGS.piecemeal}.spellFailure`, flag.spellFailure ?? item.system?.spellFailure ?? 0),
    buildLabeledInput("Weight ", "number", `flags.${MODULE_ID}.${FLAGS.piecemeal}.weight`, flag.weight ?? item.system?.weight ?? 0),
    buildLabeledInput("Cost ", "number", `flags.${MODULE_ID}.${FLAGS.piecemeal}.cost`, flag.cost ?? item.system?.price ?? 0),
    buildLabeledSelect("Armor category ", `flags.${MODULE_ID}.${FLAGS.piecemeal}.equipmentSubtype`, category, [
      ["clothing", "Clothing"],
      ["lightArmor", "Light armor"],
      ["mediumArmor", "Medium armor"],
      ["heavyArmor", "Heavy armor"]
    ]),
    buildLabeledSelect("Magic mode ", `flags.${MODULE_ID}.${FLAGS.piecemeal}.magicMode`, flag.magicMode ?? "", [
      ["", "Infer"],
      ["none", "Not magical"],
      ["separatePiece", "Separate piece"],
      ["suit", "Part of enchanted suit"]
    ]),
    buildLabeledInput("Suit ID ", "text", `flags.${MODULE_ID}.${FLAGS.piecemeal}.suitId`, flag.suitId ?? "", {
      placeholder: "full-plate-a"
    }),
    buildLabeledSelect("Don state ", `flags.${MODULE_ID}.${FLAGS.piecemeal}.donState`, flag.donState ?? "normal", [
      ["normal", "Normal"],
      ["hasty", "Hasty"]
    ])
  );
  const masterworkLabel = document.createElement("label");
  masterworkLabel.classList.add("d35e-pacs-checkbox");
  const masterwork = document.createElement("input");
  masterwork.type = "checkbox";
  masterwork.name = `flags.${MODULE_ID}.${FLAGS.piecemeal}.masterwork`;
  masterwork.checked = flag.masterwork === true || item.system?.masterwork === true;
  masterworkLabel.append(masterwork, document.createTextNode(" Masterwork piece"));
  grid.append(masterworkLabel);
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
    if (control.name === `flags.${MODULE_ID}.${FLAGS.piecemeal}.catalogId`) {
      if (!control.value) {
        persistPiecemealPanelControl(item, root, form, control);
        return;
      }
      applyCatalogPiece(item, root, form, control.value);
      return;
    }
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

  if (item.type === "equipment" && !isAggregateArmorItem(item) && isEnabled(SETTINGS.enableArmor, true) && (getArmorWorkflowMode() === ARMOR_WORKFLOW_MODES.legacyAggregate || isPiecemealArmorPiece(item))) {
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
  injectArmorProfilePanel(app, root);
  if ((title || form) && !root.querySelector("[data-d35e-pacs-armor-sync]") && isEnabled(SETTINGS.enableArmor, true) && getArmorWorkflowMode() === ARMOR_WORKFLOW_MODES.legacyAggregate) {
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
  const activeLedgerEntries = game.user?.isGM ? getCalledShotLedger(actor).filter((entry) => !entry.restoredAt) : [];
  if ((title || form) && activeLedgerEntries.length && !root.querySelector("[data-d35e-pacs-called-shot-ledger]")) {
    const button = document.createElement("a");
    button.classList.add("d35e-pacs-header-button");
    button.dataset.d35ePacsCalledShotLedger = "true";
    appendIconText(button, "fas fa-history", `Called Shot Effects (${activeLedgerEntries.length})`);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      void openCalledShotLedgerDialog(actor);
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
      const item = actor.items.get(armorButton.dataset.itemId);
      if (item && getArmorWorkflowMode() === ARMOR_WORKFLOW_MODES.nativeProfile && !isPiecemealArmorPiece(item)) {
        void item.update({ [`flags.${MODULE_ID}.${FLAGS.piecemeal}.enabled`]: true }, { d35ePacsProfile: true }).then(() => item.sheet?.render(true));
      } else {
        item?.sheet?.render(true);
      }
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
