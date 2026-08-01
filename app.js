const els = {
  fileInput: document.querySelector("#fileInput"),
  loadSampleButton: document.querySelector("#loadSampleButton"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  exportJsonButton: document.querySelector("#exportJsonButton"),
  datasetSummary: document.querySelector("#datasetSummary"),
  totalCount: document.querySelector("#totalCount"),
  doneCount: document.querySelector("#doneCount"),
  leftCount: document.querySelector("#leftCount"),
  progressBar: document.querySelector("#progressBar"),
  taskFilter: document.querySelector("#taskFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  userFilter: document.querySelector("#userFilter"),
  queueList: document.querySelector("#queueList"),
  recordMeta: document.querySelector("#recordMeta"),
  recordTitle: document.querySelector("#recordTitle"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  problemText: document.querySelector("#problemText"),
  promptText: document.querySelector("#promptText"),
  responseText: document.querySelector("#responseText"),
  studentMessageText: document.querySelector("#studentMessageText"),
  autoBanner: document.querySelector("#autoBanner"),
  autoReason: document.querySelector("#autoReason"),
  unlockAutoButton: document.querySelector("#unlockAutoButton"),
  icapButtons: document.querySelector("#icapButtons"),
  initiationButtons: document.querySelector("#initiationButtons"),
  icapPanel: document.querySelector("#icapPanel"),
  initiationPanel: document.querySelector("#initiationPanel"),
};

const state = {
  rows: [],
  labels: {},
  currentIndex: 0,
  datasetName: "empty",
};

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values, index) => {
    const item = {};
    headers.forEach((h, i) => {
      item[h] = values[i] ?? "";
    });
    item.id ||= `row_${index + 1}`;
    return item;
  });
}

function normalizeRow(row, index) {
  const taskType = (row.task_type || row.task || "").toLowerCase();
  return {
    id: String(row.id || row.question_id || row.attempt_id || `row_${index + 1}`),
    task_type: taskType || "icap",
    username: row.username || row.participant || row.user || "",
    user_id: row.user_id || "",
    question_id: row.question_id || "",
    attempt_id: row.attempt_id || "",
    phase: row.phase || "",
    asked_at: row.asked_at || row.created_at || "",
    problem_context: row.problem_context || row.display_problem || row.original_problem || "",
    prompt_context: row.prompt_context || row.question || row.source_question || "",
    assistant_response: row.assistant_response || row.response || "",
    student_message: row.student_message || row.message || row.content || "",
    auto_initiation_score: row.auto_initiation_score ?? row.auto_initiation ?? "",
    auto_reason: row.auto_reason || "",
  };
}

function storageKey() {
  return `message-labeler:${state.datasetName}`;
}

function saveLabels() {
  localStorage.setItem(storageKey(), JSON.stringify(state.labels));
}

function loadLabels() {
  try {
    state.labels = JSON.parse(localStorage.getItem(storageKey()) || "{}");
  } catch {
    state.labels = {};
  }
}

function labelFor(row) {
  if (!state.labels[row.id]) {
    const autoZero = String(row.auto_initiation_score) === "0";
    state.labels[row.id] = {
      id: row.id,
      icap_label: "",
      icap_score: "",
      initiation_label: autoZero ? "not_independent" : "",
      initiation_category: autoZero ? "answer_or_gave_up" : "",
      initiation_score: autoZero ? "0" : "",
      initiation_locked: autoZero,
    };
  }
  if (state.labels[row.id].initiation_score === "0" && !state.labels[row.id].initiation_category) {
    state.labels[row.id].initiation_category = "answer_or_gave_up";
  }
  return state.labels[row.id];
}

function isDone(row) {
  const label = labelFor(row);
  const task = row.task_type;
  const needsIcap = task === "icap" || task === "both";
  const needsInitiation = task === "initiation" || task === "both";
  return (!needsIcap || label.icap_label) && (!needsInitiation || label.initiation_label);
}

function filteredRows() {
  const task = els.taskFilter.value;
  const status = els.statusFilter.value;
  const user = els.userFilter.value;
  return state.rows.filter((row) => {
    const label = labelFor(row);
    const matchesTask = task === "all" || row.task_type === task || row.task_type === "both";
    const matchesUser = user === "all" || row.username === user;
    const done = isDone(row);
    const autoZero = String(row.auto_initiation_score) === "0";
    const matchesStatus =
      status === "all" ||
      (status === "needs_review" && !done) ||
      (status === "done" && done) ||
      (status === "auto_zero" && autoZero);
    return matchesTask && matchesUser && matchesStatus && label;
  });
}

function setText(el, value, emptyText) {
  el.textContent = value || emptyText;
  el.classList.toggle("emptyText", !value);
}

function renderUsers() {
  const current = els.userFilter.value;
  const users = [...new Set(state.rows.map((row) => row.username).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  els.userFilter.innerHTML = `<option value="all">All</option>${users.map((u) => `<option value="${u}">${u}</option>`).join("")}`;
  els.userFilter.value = users.includes(current) ? current : "all";
}

function renderStats() {
  const total = state.rows.length;
  const done = state.rows.filter(isDone).length;
  els.totalCount.textContent = total;
  els.doneCount.textContent = done;
  els.leftCount.textContent = Math.max(total - done, 0);
  els.progressBar.max = total || 1;
  els.progressBar.value = done;
  els.datasetSummary.textContent = total ? `${state.datasetName} · ${done}/${total} labeled` : "No dataset loaded";
}

function renderQueue() {
  const rows = filteredRows();
  if (state.currentIndex >= rows.length) state.currentIndex = Math.max(rows.length - 1, 0);
  els.queueList.innerHTML = "";
  rows.forEach((row, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "queueItem";
    if (index === state.currentIndex) button.classList.add("selected");
    if (isDone(row)) button.classList.add("done");
    if (String(row.auto_initiation_score) === "0") button.classList.add("auto");
    button.innerHTML = `
      <strong>${row.username || "Unknown"} · ${row.task_type}</strong>
      <span>${row.phase || "no phase"} · ${row.student_message || "No message"}</span>
    `;
    button.addEventListener("click", () => {
      state.currentIndex = index;
      render();
    });
    els.queueList.appendChild(button);
  });
}

function setActiveButtons(group, activeLabel) {
  group.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.label === activeLabel);
  });
}

function renderCurrent() {
  const rows = filteredRows();
  const row = rows[state.currentIndex];
  if (!row) {
    els.recordMeta.textContent = "No record selected";
    els.recordTitle.textContent = "No records match the current filters";
    setText(els.problemText, "", "No problem context");
    setText(els.promptText, "", "No prompt context");
    setText(els.responseText, "", "No assistant response");
    els.studentMessageText.textContent = "No message selected";
    els.autoBanner.classList.add("hidden");
    return;
  }

  const label = labelFor(row);
  els.recordMeta.textContent = `${row.phase || "no phase"} · ${row.asked_at || "no timestamp"} · ${row.id}`;
  els.recordTitle.textContent = `${row.username || "Unknown"} · ${row.task_type}`;
  setText(els.problemText, row.problem_context, "No problem context");
  setText(els.promptText, row.prompt_context, "No prompt context");
  setText(els.responseText, row.assistant_response, "No assistant response");
  els.studentMessageText.textContent = row.student_message || "No message selected";
  setActiveButtons(els.icapButtons, label.icap_label);
  setActiveButtons(els.initiationButtons, label.initiation_category || label.initiation_label);

  const needsIcap = row.task_type === "icap" || row.task_type === "both";
  const needsInitiation = row.task_type === "initiation" || row.task_type === "both";
  els.icapPanel.style.display = needsIcap ? "" : "none";
  els.initiationPanel.style.display = needsInitiation ? "" : "none";

  const autoZero = String(row.auto_initiation_score) === "0" && label.initiation_locked;
  els.autoBanner.classList.toggle("hidden", !autoZero);
  els.autoReason.textContent = row.auto_reason || "Obvious passive/help-seeking/minimal initiation.";
  els.initiationButtons.querySelectorAll("button").forEach((button) => {
    button.disabled = autoZero;
    button.classList.toggle("locked", autoZero && button.dataset.score === "0");
  });
}

function render() {
  renderUsers();
  renderStats();
  renderQueue();
  renderCurrent();
}

function selectLabel(groupName, button) {
  const rows = filteredRows();
  const row = rows[state.currentIndex];
  if (!row) return;
  const label = labelFor(row);
  if (groupName === "initiation") {
    label.initiation_category = button.dataset.label;
    label.initiation_label = button.dataset.score === "0" ? "not_independent" : "graded";
  } else {
    label[`${groupName}_label`] = button.dataset.label;
  }
  label[`${groupName}_score`] = button.dataset.score;
  if (groupName === "initiation") label.initiation_locked = false;
  saveLabels();
  const queue = filteredRows();
  if (isDone(row) && state.currentIndex < queue.length - 1) state.currentIndex += 1;
  render();
}

function exportRows() {
  return state.rows.map((row) => ({ ...row, ...labelFor(row) }));
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const rows = exportRows();
  if (!rows.length) return;
  const headers = [
    "id", "task_type", "username", "user_id", "question_id", "attempt_id", "phase", "asked_at",
    "problem_context", "prompt_context", "student_message", "assistant_response",
    "icap_label", "icap_score", "initiation_category", "initiation_label", "initiation_score",
  ];
  const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(","))].join("\n");
  download(`${state.datasetName}_labels.csv`, csv, "text/csv");
}

function exportJson() {
  download(`${state.datasetName}_labels.json`, JSON.stringify(exportRows(), null, 2), "application/json");
}

async function loadRows(rows, name) {
  state.rows = rows.map(normalizeRow).filter((row) => row.student_message || row.problem_context);
  state.datasetName = name.replace(/\.[^.]+$/, "") || "labeling_queue";
  state.currentIndex = 0;
  loadLabels();
  state.rows.forEach(labelFor);
  saveLabels();
  render();
}

async function loadSample() {
  const response = await fetch("./data/labeling_queue.json").catch(() => null);
  const source = response && response.ok ? response : await fetch("./data/sample_queue.json");
  const name = response && response.ok ? "labeling_queue" : "sample_queue";
  const rows = await source.json();
  await loadRows(rows, name);
}

els.fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : parseCsv(text);
  await loadRows(rows, file.name);
  event.target.value = "";
});

els.loadSampleButton.addEventListener("click", loadSample);
els.exportCsvButton.addEventListener("click", exportCsv);
els.exportJsonButton.addEventListener("click", exportJson);
els.taskFilter.addEventListener("change", () => { state.currentIndex = 0; render(); });
els.statusFilter.addEventListener("change", () => { state.currentIndex = 0; render(); });
els.userFilter.addEventListener("change", () => { state.currentIndex = 0; render(); });
els.prevButton.addEventListener("click", () => { state.currentIndex = Math.max(state.currentIndex - 1, 0); render(); });
els.nextButton.addEventListener("click", () => {
  const rows = filteredRows();
  state.currentIndex = Math.min(state.currentIndex + 1, Math.max(rows.length - 1, 0));
  render();
});
els.icapButtons.addEventListener("click", (event) => {
  if (event.target.matches("button")) selectLabel("icap", event.target);
});
els.initiationButtons.addEventListener("click", (event) => {
  if (event.target.matches("button")) selectLabel("initiation", event.target);
});
els.unlockAutoButton.addEventListener("click", () => {
  const row = filteredRows()[state.currentIndex];
  if (!row) return;
  labelFor(row).initiation_locked = false;
  saveLabels();
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.target.matches("textarea,input,select")) return;
  if (event.key === "ArrowLeft") els.prevButton.click();
  if (event.key === "ArrowRight") els.nextButton.click();
});

loadSample();
