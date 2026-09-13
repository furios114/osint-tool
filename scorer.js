// ---------- Утилиты ----------
const DISPOSABLE_URL = "data/disposable.json"; // опционально
let _disposableSet = null;

async function loadDisposable() {
  if (_disposableSet) return _disposableSet;
  try {
    const res = await fetch(DISPOSABLE_URL);
    const arr = await res.json();
    _disposableSet = new Set(arr.map(d => d.toLowerCase()));
  } catch {
    _disposableSet = new Set([
      "mailinator.com","tempmail.com","10minutemail.com","guerrillamail.com",
      "throwawaymail.com","yopmail.com","trashmail.com","sharklasers.com",
      "getnada.com","temp-mail.org","fakeinbox.com","dispostable.com",
    ]);
  }
  return _disposableSet;
}

const ROLE_PREFIXES = new Set([
  "admin","info","support","sales","contact","hello","help","noreply","no-reply",
  "postmaster","webmaster","abuse","billing","office","team","mail","jobs",
  "careers","press","marketing","hr","legal","security",
]);

function gradeOf(s) {
  if (s >= 90) return "verified";
  if (s >= 70) return "likely";
  if (s >= 40) return "risky";
  if (s >= 1)  return "suspicious";
  return "invalid";
}

// ---------- DNS-over-HTTPS ----------
async function resolveDoh(name, type) {
  const endpoints = [
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { accept: "application/dns-json" } });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.Answer) return data.Answer;
    } catch { /* пробуем следующий */ }
  }
  return null;
}

async function hasMx(domain) {
  const ans = await resolveDoh(domain, "MX");
  if (ans && ans.some(a => a.type === 15)) return true;
  // fallback: A-запись (некоторые домены принимают почту без MX)
  const a = await resolveDoh(domain, "A");
  return !!(a && a.some(r => r.type === 1));
}

// ---------- Email ----------
async function scoreEmail(input, opts = {}) {
  const layers = [];
  let total = 0;
  const deep = !!opts.deep;

  const email = input.trim();
  const syntaxOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!syntaxOk) {
    return {
      score: 0, grade: "invalid", type: "email",
      layers: [{ name: "Синтаксис", passed: false, score: 0, max: 30, reason: "некорректный формат" }],
    };
  }
  layers.push({ name: "Синтаксис (RFC 5322)", passed: true, score: 30, max: 30 });
  total += 30;

  const [local, domain] = email.split("@");
  const domainLc = domain.toLowerCase();

  if (deep) {
    const mxOk = await hasMx(domainLc);
    layers.push({
      name: "DNS / MX-записи",
      passed: mxOk,
      score: mxOk ? 25 : 0,
      max: 25,
      reason: mxOk ? undefined : "домен не принимает почту",
    });
    if (mxOk) total += 25;
    else return { score: total, grade: gradeOf(total), type: "email", layers };

    const dispSet = await loadDisposable();
    const isDisp = dispSet.has(domainLc);
    layers.push({
      name: "Одноразовый домен",
      passed: !isDisp,
      score: isDisp ? 0 : 20,
      max: 20,
      value: isDisp ? domainLc : undefined,
      reason: isDisp ? "в списке disposable" : undefined,
    });
    if (!isDisp) total += 20;
  } else {
    layers.push({ name: "DNS / MX-записи", passed: false, score: 0, max: 25, reason: "выключено (глубокая проверка)" });
    layers.push({ name: "Одноразовый домен", passed: false, score: 0, max: 20, reason: "выключено (глубокая проверка)" });
  }

  const isRole = ROLE_PREFIXES.has(local.toLowerCase());
  layers.push({
    name: "Роль-адрес",
    passed: !isRole,
    score: isRole ? 0 : 10,
    max: 10,
    value: isRole ? local : undefined,
    reason: isRole ? "не личный адрес" : undefined,
  });
  if (!isRole) total += 10;

  layers.push({ name: "SMTP-проба", passed: false, score: 0, max: 15, reason: "недоступно на статике" });

  return { score: total, grade: gradeOf(total), type: "email", layers };
}

// ---------- Phone ----------
// Упрощённый парсер: страна по префиксу, тип по длине/диапазону.
// Для продакшена — libphonenumber-js.

const COUNTRY_PREFIXES = [
  { code: "RU", prefixes: ["7"], len: 11 },
  { code: "KZ", prefixes: ["7"], len: 11 },
  { code: "BY", prefixes: ["375"], len: 12 },
  { code: "UA", prefixes: ["380"], len: 12 },
  { code: "US", prefixes: ["1"], len: 11 },
  { code: "GB", prefixes: ["44"], len: 12 },
  { code: "DE", prefixes: ["49"], len: 12 },
  { code: "FR", prefixes: ["33"], len: 11 },
  { code: "CN", prefixes: ["86"], len: 13 },
  { code: "IN", prefixes: ["91"], len: 12 },
];

const RU_MOBILE_PREFIXES = ["91","92","93","94","95","96","97","98","99","90","80"];
const CARRIERS_RU = {
  "91":"МТС","92":"МегаФон","93":"МегаФон","94":"МегаФон",
  "95":"Билайн","96":"Билайн","97":"МТС","98":"МегаФон","99":"МТС",
  "90":"Билайн","80":"Билайн",
};

function parsePhone(raw) {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;

  // нормализуем 8XXXXXXXXXX → 7XXXXXXXXXX
  let norm = digits;
  if (norm.length === 11 && norm.startsWith("8")) norm = "7" + norm.slice(1);

  for (const c of COUNTRY_PREFIXES) {
    for (const p of c.prefixes) {
      if (norm.startsWith(p) && norm.length === c.len) {
        return {
          country: c.code,
          cc: p,
          national: norm.slice(p.length),
          e164: "+" + norm,
        };
      }
    }
  }
  return { country: null, e164: "+" + norm, national: norm };
}

function detectLineType(parsed) {
  if (!parsed.country) return "unknown";
  if (parsed.country === "RU" || parsed.country === "KZ") {
    const p2 = parsed.national.slice(0, 2);
    if (RU_MOBILE_PREFIXES.includes(p2)) return "mobile";
    return "fixed";
  }
  return "unknown";
}

function lookupCarrier(parsed) {
  if (parsed.country === "RU") {
    const p2 = parsed.national.slice(0, 2);
    return CARRIERS_RU[p2] || null;
  }
  return null;
}

function scorePhone(input) {
  const layers = [];
  let total = 0;

  const parsed = parsePhone(input);
  if (!parsed || parsed.national.length < 7) {
    return {
      score: 0, grade: "invalid", type: "phone",
      layers: [{ name: "Парсинг", passed: false, score: 0, max: 30, reason: "не удалось распарсить" }],
    };
  }
  layers.push({ name: "Парсинг номера", passed: true, score: 30, max: 30 });
  total += 30;

  const countryOk = !!parsed.country;
  layers.push({
    name: "Код страны",
    passed: countryOk,
    score: countryOk ? 20 : 0,
    max: 20,
    value: countryOk ? parsed.country : undefined,
    reason: countryOk ? undefined : "страна не определена",
  });
  if (countryOk) total += 20;

  const lineType = detectLineType(parsed);
  const typeOk = lineType === "mobile" || lineType === "fixed";
  layers.push({
    name: "Тип линии",
    passed: typeOk,
    score: typeOk ? 20 : 0,
    max: 20,
    value: lineType,
  });
  if (typeOk) total += 20;

  const carrier = lookupCarrier(parsed);
  layers.push({
    name: "Оператор",
    passed: !!carrier,
    score: carrier ? 15 : 0,
    max: 15,
    value: carrier || undefined,
    reason: carrier ? undefined : "не определён",
  });
  if (carrier) total += 15;

  layers.push({ name: "Live-проверка (HLS)", passed: false, score: 0, max: 15, reason: "требуется внешний API" });

  return { score: total, grade: gradeOf(total), type: "phone", layers };
}

// ---------- Экспорт в window ----------
window.Scorer = { scoreEmail, scorePhone, detectType: (v) => {
  v = v.trim();
  if (!v) return "unknown";
  if (v.includes("@")) return "email";
  if (/^[+\d\s()\-]+$/.test(v)) return "phone";
  return "unknown";
}};