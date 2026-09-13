const $ = (id) => document.getElementById(id);

const input = $("input");
const inputType = $("inputType");
const checkBtn = $("checkBtn");
const clearBtn = $("clearBtn");
const optDeep = $("optDeep");
const result = $("result");
const layersList = $("layersList");
const scoreValue = $("scoreValue");
const ringFill = $("ringFill");
const gradeBadge = $("gradeBadge");
const resultInput = $("resultInput");
const resultType = $("resultType");
const duration = $("duration");

const RING_CIRC = 2 * Math.PI * 52;

input.addEventListener("input", () => {
  const t = window.Scorer.detectType(input.value);
  inputType.textContent = t === "unknown" ? "auto" : t;
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") run();
});

checkBtn.addEventListener("click", run);

clearBtn.addEventListener("click", () => {
  input.value = "";
  inputType.textContent = "auto";
  result.classList.add("hidden");
  input.focus();
});

async function run() {
  const value = input.value.trim();
  if (!value) { input.focus(); return; }

  checkBtn.disabled = true;
  const t0 = performance.now();

  const type = window.Scorer.detectType(value);
  let res;
  if (type === "email") {
    res = await window.Scorer.scoreEmail(value, { deep: optDeep.checked });
  } else if (type === "phone") {
    res = window.Scorer.scorePhone(value);
  } else {
    res = {
      score: 0, grade: "invalid", type: "unknown",
      layers: [{ name: "Определение типа", passed: false, score: 0, max: 0, reason: "не похоже ни на телефон, ни на email" }],
    };
  }

  const t1 = performance.now();
  render(res, value, t1 - t0);
  checkBtn.disabled = false;
}

function render(res, rawValue, ms) {
  result.classList.remove("hidden");

  // score
  animateScore(res.score);

  // ring color
  const colors = {
    verified: "#34d399",
    likely: "#fbbf24",
    risky: "#fb923c",
    suspicious: "#f87171",
    invalid: "#6b7280",
  };
  ringFill.style.stroke = colors[res.grade] || "#5b8cff";

  // badge
  gradeBadge.textContent = res.grade;
  gradeBadge.className = "grade-badge g-" + res.grade;

  // input echo
  resultInput.textContent = rawValue;
  resultType.textContent = res.type + " · " + res.layers.filter(l => l.passed).length + "/" + res.layers.length + " слоёв пройдено";

  // duration
  duration.textContent = Math.round(ms) + " ms";

  // layers
  layersList.innerHTML = "";
  for (const l of res.layers) {
    const el = document.createElement("div");
    const state = l.passed ? "passed" : (l.reason && l.reason.includes("выключено") || l.reason && l.reason.includes("недоступно") || l.reason && l.reason.includes("требуется") ? "skipped" : "failed");
    el.className = "layer " + state;

    const icon = state === "passed" ? "✓" : state === "skipped" ? "–" : "✕";

    el.innerHTML = `
      <span class="layer-icon">${icon}</span>
      <span class="layer-name">
        ${escapeHtml(l.name)}
        ${l.value ? `<span class="layer-value">${escapeHtml(String(l.value))}</span>` : ""}
        ${l.reason ? `<span class="layer-reason">· ${escapeHtml(l.reason)}</span>` : ""}
      </span>
      <span class="layer-score">${l.score}/${l.max}</span>
    `;
    layersList.appendChild(el);
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

    const offset = RING_CIRC - (RING_CIRC * cur) / 100;
    ringFill.style.strokeDasharray = RING_CIRC;
    ringFill.style.strokeDashoffset = offset;

    if (k < 1) scoreAnimId = requestAnimationFrame(step);
  }
  scoreAnimId = requestAnimationFrame(step);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}