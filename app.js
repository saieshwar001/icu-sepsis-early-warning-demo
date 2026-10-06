"use strict";

const $ = (selector) => document.querySelector(selector);
const fileInput = $("#file-input");
const dropZone = $("#drop-zone");
const message = $("#input-message");
const modelStatus = $("#model-status");
let model = null;

async function loadModel() {
  try {
    const response = await fetch("./model.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Model file returned ${response.status}`);
    const candidate = await response.json();
    if (!candidate.features || candidate.coefficients.length !== candidate.features.length + 1) {
      throw new Error("The model file is incomplete.");
    }
    model = candidate;
    modelStatus.innerHTML = '<span class="status-dot"></span> Model ready';
    modelStatus.classList.add("ready");
    $("#threshold-value").textContent = Number(model.threshold).toFixed(3);
  } catch (error) {
    modelStatus.innerHTML = '<span class="status-dot"></span> Model unavailable';
    modelStatus.classList.add("error");
    message.textContent = "Could not load the model file. Open this demo from the hosted site or a local web server.";
    console.error(error);
  }
}

function parseNumber(value) {
  if (typeof value !== "string" || value.trim() === "" || /^(nan|na|null)$/i.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) throw new Error("This file needs a header row and at least one hourly row.");
  const headers = lines[0].split("|").map((item) => item.trim());
  const required = ["HR", "O2Sat", "SBP", "MAP", "Resp", "Age", "Gender", "ICULOS"];
  const missing = required.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`This does not look like a PhysioNet patient file. Missing columns: ${missing.join(", ")}.`);
  return lines.slice(1).map((line, index) => {
    const values = line.split("|");
    const row = { sourceHour: index + 1 };
    headers.forEach((header, i) => {
      if (header === "SepsisLabel") row.SepsisLabel = parseNumber(values[i]);
      else row[header] = parseNumber(values[i]);
    });
    return row;
  });
}

function featureValue(name, records, index) {
  if (name.endsWith("_6h_mean")) {
    const base = name.slice(0, -8);
    const window = records.slice(Math.max(0, index - 5), index + 1)
      .map((row) => row[base]).filter((value) => value != null);
    return window.length ? window.reduce((sum, value) => sum + value, 0) / window.length : null;
  }
  if (name.endsWith("_change_vs_6h")) {
    const base = name.slice(0, -13);
    const current = records[index][base];
    const avg = featureValue(`${base}_6h_mean`, records, index);
    return current != null && avg != null ? current - avg : null;
  }
  return records[index][name] ?? null;
}

function inferOne(records, index) {
  const values = model.features.map((name, featureIndex) => {
    const raw = featureValue(name, records, index);
    const value = raw == null ? model.medians[featureIndex] : raw;
    return (value - model.means[featureIndex]) / (model.scales[featureIndex] || 1);
  });
  let logit = model.coefficients[0];
  for (let i = 0; i < values.length; i += 1) logit += model.coefficients[i + 1] * values[i];
  const clipped = Math.max(-30, Math.min(30, logit));
  return 1 / (1 + Math.exp(-clipped));
}

function showResults(records, fileName) {
  if (!model) throw new Error("The model has not finished loading. Please wait a moment and try again.");
  if (!records.length) throw new Error("No hourly data rows were found in that file.");
  const scored = records.map((row, index) => ({
    hour: row.ICULOS ?? row.sourceHour ?? index + 1,
    label: row.SepsisLabel,
    score: inferOne(records, index),
  }));
  const max = scored.reduce((best, row) => row.score > best.score ? row : best, scored[0]);
  const above = scored.filter((row) => row.score >= model.threshold).length;
  $("#empty-state").hidden = true;
  $("#result-content").hidden = false;
  $("#highest-score").textContent = max.score.toFixed(3);
  $("#score-description").textContent = max.score >= model.threshold
    ? `Hour ${max.hour}: above this project's research cutoff`
    : `Hour ${max.hour}: below this project's research cutoff`;
  $("#hour-count").textContent = scored.length.toLocaleString();
  $("#alert-count").textContent = above.toLocaleString();
  $("#patient-name").textContent = fileName;
  $("#table-caption").textContent = `Showing the latest ${Math.min(24, scored.length)} of ${scored.length.toLocaleString()} rows`;
  const body = $("#score-rows");
  body.replaceChildren();
  scored.slice(-24).reverse().forEach((row) => {
    const tr = document.createElement("tr");
    const cutoffClass = row.score >= model.threshold ? "table-badge above" : "table-badge";
    const labelText = row.label == null ? "—" : (row.label === 1 ? "1 · positive" : "0 · negative");
    const labelClass = row.label === 1 ? "label-positive" : "";
    tr.innerHTML = `<td>${escapeHtml(String(row.hour))}</td><td>${row.score.toFixed(3)}</td><td><span class="${cutoffClass}">${row.score >= model.threshold ? "Above" : "Below"}</span></td><td class="${labelClass}">${labelText}</td>`;
    body.appendChild(tr);
  });
  message.textContent = `Scored ${scored.length.toLocaleString()} hourly rows. Model cutoff: ${model.threshold.toFixed(3)}.`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

async function handleFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".psv")) {
    message.textContent = "Please choose a .psv patient file.";
    return;
  }
  try {
    const text = await file.text();
    const records = parsePsv(text);
    showResults(records, file.name);
    message.textContent = `${file.name} was processed locally. Its contents were not uploaded.`;
  } catch (error) {
    message.textContent = error.message;
  }
}

function makeSyntheticDemo() {
  const rows = [];
  for (let i = 0; i < 24; i += 1) {
    const pulse = i > 15 ? (i - 15) * 1.35 : 0;
    rows.push({
      HR: Math.round(82 + Math.sin(i / 3) * 5 + pulse),
      O2Sat: Math.round(97 - (i > 18 ? (i - 18) * 0.35 : 0)),
      SBP: Math.round(122 - pulse * 0.7), MAP: Math.round(86 - pulse * 0.45),
      Resp: Math.round(17 + pulse * 0.22), Age: 54, Gender: 0, ICULOS: i + 1,
      sourceHour: i + 1,
    });
  }
  showResults(rows, "synthetic-example.psv");
  message.textContent = "Synthetic example only: these made-up readings do not represent a real person.";
}

fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
$("#demo-button").addEventListener("click", () => {
  try { makeSyntheticDemo(); } catch (error) { message.textContent = error.message; }
});
dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("dragging"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault(); dropZone.classList.remove("dragging"); handleFile(event.dataTransfer.files[0]);
});

loadModel();
