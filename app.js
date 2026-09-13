const $ = (id) => document.getElementById(id);

const input       = $("input");
const inputType   = $("inputType");
const checkBtn    = $("checkBtn");
const clearBtn    = $("clearBtn");
const optDeep     = $("optDeep");
const optHistory  = $("optHistory");
const result      = $("result");
const layersList  = $("layersList");
const scoreValue  = $("scoreValue");
const ringFill    = $("ringFill");
const gradeBadge  = $("gradeBadge");
const resultInput = $("resultInput");
const resultType  = $("resultType");
const duration    = $("duration");
const copyBtn     = $("copyBtn");
const exportBtn   = $("exportBtn");
const extra       = $("extra");
const historySec  = $("historySection");
const historyList = $("historyList");
const clearHist   = $("clearHistory");
const toast       = $("toast");

const RING_CIRC = 2 * Math.PI * 52;
const HISTORY_KEY = "osint_validator_history";
const MAX_HISTORY = 15;

let lastResult = null;

// ---------- Ввод ----------
input.addEventListener("input", () => {
  const t = window.Scorer.detectType(input.value);
  inputType.textContent = t === "unknown" ? "auto" : t;
  inputType.classList.toggle("active", t !== "unknown");
});
input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault(); input.focus(); input.select();
  }
});

checkBtn.addEventListener("click", run);

clearBtn.addEventListener("click", () => {
  input.value = "";
  inputType.textContent = "auto";
  inputType.classList.remove("active");
  result.classList.add("hidden");
  lastResult = null;
  input.focus();
});

copyBtn.addEventListener("click", async () => {
  if (!lastResult) return;
  const text = formatResultText(lastResult);
  try {
    await navigator.clipboard.writeText(text);
    showToast("Скопировано");
  } catch { showToast("Не удалось скопировать"); }
});

exportBtn.addEventListener("click", () => {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `validator_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Экспортировано");
});

clearHist.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast("История очищена");
});

// ---------- Прогон ----------
async function run() {
  const value = input.value.trim();
  if (!value) { input.focus(); return; }

  checkBtn.disabled = true;
  const t0 = performance.now();

  const type = window.Scorer.detectType(value);
  let res;
  try {
    if (type === "email") {
      res = await window.Scorer.scoreEmail(value, { deep: optDeep.checked });
    } else if (type === "phone") {
      res = window.Scorer.scorePhone(value);
    } else {
      res = {
        score: 0, grade: "invalid", type: "unknown",
        layers: [{ name: "Определение типа", passed: false, score: 0, max: 0, reason: "не телефон и не email" }],
      };
    }
  } catch (e) {
    res = {
      score: 0, grade: "invalid", type: type,
      layers: [{ name: "Ошибка выполнения", passed: false, score: 0, max: 0, reason: String(e.message || e) }],
    };
  }

  const ms = performance.now() - t0;
  const full = { ...res, input: value, timestamp: new Date().toISOString(), duration_ms: Math.round(ms) };
  lastResult = full;

  render(full, value, ms);

  if (optHistory.checked && res.type !== "unknown") {
    saveHistory(full);
    renderHistory();
  }

  checkBtn.disabled = false;
}

// ---------- Рендер ----------
function render(res, rawValue, ms) {
  result.classList.remove("hidden");

  animateScore(res.score);

  const colors = {
    verified: "#34d399", likely: "#fbbf24",
    risky: "#fb923c", suspicious: "#f87171", invalid: "#6b7280",
  };
  ringFill.style.stroke = colors[res.grade] || "#5b8cff";

  gradeBadge.textContent = res.grade;
  gradeBadge.className = "grade-badge g-" + res.grade;

  resultInput.textContent = rawValue;
  const passed = res.layers.filter(l => l.passed).length;
  const total = res.layers.length;
  resultType.textContent = `${res.type} · ${passed}/${total} слоёв пройдено`;

  duration.textContent = Math.round(ms) + " ms";

  layersList.innerHTML = "";
  for (const l of res.layers) {
    const state = l.passed
      ? "passed"
      : (l.reason && /выключено|требуется|недоступно/i.test(l.reason) ? "skipped" : "failed");

    const icon = state === "passed" ? "✓" : state === "skipped" ? "–" : "✕";

    const el = document.createElement("div");
    el.className = "layer " + state;
    el.innerHTML = `
      <span class="layer-icon">${icon}</span>
      <span class="layer-name">
        ${esc(l.name)}
        ${l.value ? `<span class="layer-value">${esc(String(l.value))}</span>` : ""}
        ${l.reason ? `<span class="layer-reason">· ${esc(l.reason)}</span>` : ""}
      </span>
      <span class="layer-score">${l.score}/${l.max}</span>
    `;
    layersList.appendChild(el);
  }

  // Подсказка про typo
  if (res.suggestion) {
    extra.classList.remove("hidden");
    extra.innerHTML = `💡 Возможно, вы имели в виду <strong class="hint-accent">${esc(res.suggestion)}</strong>?`;
  } else {
    extra.classList.add("hidden");
  }
}

let scoreAnimId = null;
function animateScore(target) {
  if (scoreAnimId) cancelAnimationFrame(scoreAnimId);
  const from = parseInt(scoreValue.textContent, 10) || 0;
  const t0 = performance.now();
  const dur = 700;

  function step(t) {
    const k = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    const cur = Math.round(from + (target - from) * eased);
    scoreValue.textContent = cur;
    ringFill.style.strokeDasharray = RING_CIRC;
    ringFill.style.strokeDashoffset = RING_CIRC - (RING_CIRC * cur) / 100;
    if (k < 1) scoreAnimId = requestAnimationFrame(step);
  }
  scoreAnimId = requestAnimationFrame(step);
}

// ---------- История ----------
function saveHistory(item) {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch {}
  // убираем дубли по input
  arr = arr.filter(x => x.input !== item.input);
  arr.unshift({ input: item.input, score: item.score, grade: item.grade, type: item.type, timestamp: item.timestamp });
  if (arr.length > MAX_HISTORY) arr = arr.slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
}

function renderHistory() {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch {}
  if (!arr.length) { historySec.classList.add("hidden"); return; }

  historySec.classList.remove("hidden");
  historyList.innerHTML = "";
  for (const it of arr) {
    const el = document.createElement("div");
    el.className = "history-item";
    el.innerHTML = `
      <span class="history-score g-${it.grade}">${it.score}</span>
      <span class="history-value">${esc(it.input)}</span>
      <span class="history-time">${fmtTime(it.timestamp)}</span>
    `;
    el.addEventListener("click", () => {
      input.value = it.input;
      input.dispatchEvent(new Event("input"));
      run();
    });
    historyList.appendChild(el);
  }
}

function fmtTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "сейчас";
  if (diff < 3600) return Math.floor(diff / 60) + "м";
  if (diff < 86400) return Math.floor(diff / 3600) + "ч";
  return d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit" });
}

// ---------- Утилиты ----------
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function formatResultText(r) {
  const lines = [
    `Input: ${r.input}`,
    `Type: ${r.type}`,
    `Score: ${r.score}/100 (${r.grade})`,
    ``,
    `Layers:`,
    ...r.layers.map(l => `  ${l.passed ? "✓" : "✕"} ${l.name} — ${l.score}/${l.max}${l.value ? ` [${l.value}]` : ""}${l.reason ? ` (${l.reason})` : ""}`),
  ];
  return lines.join("\n");
}

let toastId = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastId);
  toastId = setTimeout(() => toast.classList.remove("show"), 2000);
}

// ---------- Init ----------
renderHistory();
input.focus();