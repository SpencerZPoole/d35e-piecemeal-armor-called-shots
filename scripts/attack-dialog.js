import { FULL_ATTACK_MODES, MODULE_ID, SETTINGS } from "./constants.js";
import { getCalledShotOptions } from "./called-shots.js";

export const CALLED_SHOT_SELECT_NAME = "d35e-pacs-called-shot-location";
export const CALLED_SHOT_QUEUE_NAME = "d35e-pacs-called-shot-queue";

function htmlRoot(html) {
  if (typeof Element !== "undefined" && html instanceof Element) return html;
  if (typeof Document !== "undefined" && html instanceof Document) return html;
  if (typeof DocumentFragment !== "undefined" && html instanceof DocumentFragment) return html;
  return html?.[0] ?? html;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function findAttackForm(html) {
  const root = htmlRoot(html);
  if (root?.matches?.("form.attack-form")) return root;
  return root?.querySelector?.("form.attack-form") ?? null;
}

function getDialogRoot(form, html) {
  return form?.closest?.(".window-app, .application, .dialog") ?? htmlRoot(html);
}

export function getCalledShotFullAttackMode() {
  let mode = FULL_ATTACK_MODES.perAttack;
  try {
    mode = game.settings.get(MODULE_ID, SETTINGS.calledShotFullAttackMode);
  } catch (_error) {
    mode = FULL_ATTACK_MODES.perAttack;
  }
  return Object.values(FULL_ATTACK_MODES).includes(mode) ? mode : FULL_ATTACK_MODES.perAttack;
}

export function normalizeCalledShotLocation(value) {
  const locationId = String(value ?? "").trim();
  return locationId && locationId !== "none" ? locationId : "";
}

export function buildCalledShotSelectOptions(options, selected = "") {
  const selectedId = normalizeCalledShotLocation(selected);
  const rows = [
    `<option value=""${selectedId ? "" : " selected"}>None</option>`
  ];
  for (const location of options ?? []) {
    const label = `${location.label} (${location.penalty})`;
    const selectedText = location.id === selectedId ? " selected" : "";
    rows.push(`<option value="${escapeHtml(location.id)}"${selectedText}>${escapeHtml(label)}</option>`);
  }
  return rows.join("");
}

export function buildCalledShotControlHtml(options, selected = "") {
  return `
    <div class="form-group select d35e-pacs-called-shot-control" data-d35e-pacs-called-shot-control>
      <label>Called Shot</label>
      <select name="${CALLED_SHOT_SELECT_NAME}">
        ${buildCalledShotSelectOptions(options, selected)}
      </select>
      <input type="hidden" name="${CALLED_SHOT_QUEUE_NAME}" value="[]"/>
    </div>`;
}

function buildCalledShotControlElement(options) {
  const control = document.createElement("div");
  control.classList.add("form-group", "select", "d35e-pacs-called-shot-control");
  control.dataset.d35ePacsCalledShotControl = "true";

  const label = document.createElement("label");
  label.textContent = "Called Shot";

  const select = document.createElement("select");
  select.name = CALLED_SHOT_SELECT_NAME;
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "None";
  select.appendChild(none);
  for (const location of options ?? []) {
    const option = document.createElement("option");
    option.value = location.id;
    option.textContent = `${location.label} (${location.penalty})`;
    select.appendChild(option);
  }

  const queue = document.createElement("input");
  queue.type = "hidden";
  queue.name = CALLED_SHOT_QUEUE_NAME;
  queue.value = "[]";

  control.append(label, select, queue);
  return control;
}

export function normalizeCalledShotQueue(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (_error) {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => normalizeCalledShotLocation(typeof entry === "string" ? entry : entry?.locationId));
}

export function readCalledShotSelection(formLike) {
  const form = findAttackForm(formLike);
  return normalizeCalledShotLocation(form?.querySelector?.(`[name="${CALLED_SHOT_SELECT_NAME}"]`)?.value);
}

export function readCalledShotQueue(formLike) {
  const form = findAttackForm(formLike);
  return normalizeCalledShotQueue(form?.querySelector?.(`[name="${CALLED_SHOT_QUEUE_NAME}"]`)?.value);
}

export function writeCalledShotQueue(formLike, queue) {
  const form = findAttackForm(formLike);
  const input = form?.querySelector?.(`[name="${CALLED_SHOT_QUEUE_NAME}"]`);
  if (!input) return false;
  input.value = JSON.stringify(normalizeCalledShotQueue(queue));
  return true;
}

export function getExpectedFullAttackCount(formLike, buttonLike = null) {
  const form = findAttackForm(formLike);
  const buttonText = buttonLike?.textContent ?? "";
  const matchedCount = buttonText.match(/\((\d+)\s+attacks?\)/i);
  let count = matchedCount ? Number(matchedCount[1]) : 1;
  if (form?.querySelector?.("input[data-feat='rapid-shot']")?.checked) count += 1;
  if (form?.querySelector?.("input[data-feat='flurry-of-blows']")?.checked) count += 1;
  if (form?.querySelector?.("input[data-feat='greater-manyshot']")?.checked) {
    const arrows = Number(form.querySelector("input[name='greater-manyshot-count']")?.value) || 1;
    count *= Math.max(1, arrows);
  }
  return Math.max(1, count);
}

export function buildExpectedFullAttackRows(formLike, buttonLike = null) {
  return Array.from({ length: getExpectedFullAttackCount(formLike, buttonLike) }, (_entry, index) => ({
    id: `attack-${index + 1}`,
    label: index === 0 ? "Attack" : `Attack ${index + 1}`
  }));
}

function readPerAttackDialogQueue(root, attacks) {
  return attacks.map((_attack, index) => (
    normalizeCalledShotLocation(root.querySelector(`[name="calledShot.${index}"]`)?.value)
  ));
}

export async function openCalledShotPerAttackDialog({ attacks, options, defaultLocationId }) {
  if (!globalThis.Dialog) return [];
  const defaults = attacks.map((_attack, index) => (index === 0 ? defaultLocationId : ""));
  const rows = attacks.map((attack, index) => `
    <div class="form-group select">
      <label>${escapeHtml(attack.label)}</label>
      <select name="calledShot.${index}">
        ${buildCalledShotSelectOptions(options, defaults[index])}
      </select>
    </div>`).join("");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    new Dialog({
      title: "Called Shots: Full Attack",
      content: `<form class="d35e-pacs-form d35e-pacs-per-attack-form">${rows}</form>`,
      buttons: {
        continue: {
          label: "Continue",
          callback: (html) => finish(readPerAttackDialogQueue(htmlRoot(html), attacks))
        },
        none: {
          label: "No Called Shots",
          callback: () => finish([])
        }
      },
      default: "continue",
      close: () => finish([])
    }).render(true);
  });
}

export function injectCalledShotControls(html, {
  options = getCalledShotOptions(),
  openPerAttackPicker = openCalledShotPerAttackDialog
} = {}) {
  const form = findAttackForm(html);
  if (!form || form.querySelector(`[name="${CALLED_SHOT_SELECT_NAME}"]`)) return false;
  if (!form.querySelector("[name='attack-bonus']") || !options.length) return false;

  const control = buildCalledShotControlElement(options);
  const rollModeGroup = form.querySelector("select[name='rollMode']")?.closest?.(".form-group");
  if (rollModeGroup?.parentElement) rollModeGroup.before(control);
  else form.appendChild(control);

  const dialogRoot = getDialogRoot(form, html);
  const fullAttackButton = dialogRoot?.querySelector?.("button[data-button='multi']");
  if (fullAttackButton && !dialogRoot.dataset.d35ePacsCalledShotWired) {
    dialogRoot.dataset.d35ePacsCalledShotWired = "true";
    fullAttackButton.dataset.d35ePacsCalledShotWired = "true";
    fullAttackButton.addEventListener("click", async (event) => {
      const clickedButton = event.currentTarget;
      if (form.dataset.d35ePacsPerAttackReady === "true") return;
      if (getCalledShotFullAttackMode() !== FULL_ATTACK_MODES.perAttack) return;
      const locationId = readCalledShotSelection(form);
      if (!locationId) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const attacks = buildExpectedFullAttackRows(form, clickedButton);
      const queue = await openPerAttackPicker({ attacks, options, defaultLocationId: locationId });
      writeCalledShotQueue(form, queue ?? []);
      form.dataset.d35ePacsPerAttackReady = "true";
      clickedButton.click();
      setTimeout(() => {
        delete form.dataset.d35ePacsPerAttackReady;
      }, 250);
    }, { capture: true });
  }
  return true;
}
