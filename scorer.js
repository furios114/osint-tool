// ---------- Утилиты ----------
function gradeOf(s) {
  if (s >= 90) return "verified";
  if (s >= 70) return "likely";
  if (s >= 40) return "risky";
  if (s >= 1)  return "suspicious";
  return "invalid";
}

// Коды стран (E.164) → ISO. Расширяемый список.
const CC = {
  "7":   { iso: "RU", len: 11, name: "Россия/Казахстан" },
  "375": { iso: "BY", len: 12, name: "Беларусь" },
  "380": { iso: "UA", len: 12, name: "Украина" },
  "373": { iso: "MD", len: 11, name: "Молдова" },
  "374": { iso: "AM", len: 11, name: "Армения" },
  "995": { iso: "GE", len: 12, name: "Грузия" },
  "994": { iso: "AZ", len: 12, name: "Азербайджан" },
  "998": { iso: "UZ", len: 12, name: "Узбекистан" },
  "996": { iso: "KG", len: 12, name: "Киргизия" },
  "992": { iso: "TJ", len: 12, name: "Таджикистан" },
  "993": { iso: "TM", len: 11, name: "Туркменистан" },
  "1":   { iso: "US", len: 11, name: "США/Канада" },
  "44":  { iso: "GB", len: 12, name: "Великобритания" },
  "49":  { iso: "DE", len: 12, name: "Германия" },
  "33":  { iso: "FR", len: 11, name: "Франция" },
  "39":  { iso: "IT", len: 12, name: "Италия" },
  "34":  { iso: "ES", len: 11, name: "Испания" },
  "48":  { iso: "PL", len: 11, name: "Польша" },
  "31":  { iso: "NL", len: 11, name: "Нидерланды" },
  "90":  { iso: "TR", len: 12, name: "Турция" },
  "86":  { iso: "CN", len: 13, name: "Китай" },
  "81":  { iso: "JP", len: 12, name: "Япония" },
  "82":  { iso: "KR", len: 12, name: "Корея" },
  "91":  { iso: "IN", len: 12, name: "Индия" },
  "55":  { iso: "BR", len: 13, name: "Бразилия" },
  "61":  { iso: "AU", len: 11, name: "Австралия" },
};

// Полные диапазоны мобильных префиксов РФ (DEF-коды)
const RU_MOBILE = {
  "901":"Tele2","902":"Tele2","903":"Билайн","904":"Tele2","905":"Билайн",
  "906":"Билайн","908":"Tele2","909":"Билайн","910":"МТС","911":"МТС",
  "912":"МТС","913":"МТС","914":"МТС","915":"МТС","916":"МТС","917":"МТС",
  "918":"МТС","919":"МТС","920":"МегаФон","921":"МегаФон","922":"МегаФон",
  "923":"МегаФон","924":"МегаФон","925":"МегаФон","926":"МегаФон",
  "927":"МегаФон","928":"МегаФон","929":"МегаФон","930":"МегаФон",
  "931":"МегаФон","932":"МегаФон","933":"МегаФон","934":"МегаФон",
  "936":"МегаФон","937":"МегаФон","938":"МегаФон","939":"МегаФон",
  "950":"Tele2","951":"Tele2","952":"Tele2","953":"Tele2","954":"Tele2",
  "955":"Tele2","956":"Tele2","957":"Tele2","958":"Tele2","960":"Билайн",
  "961":"Билайн","962":"Билайн","963":"Билайн","964":"Билайн","965":"Билайн",
  "966":"Билайн","967":"Билайн","968":"Билайн","969":"Билайн","977":"Tele2",
  "978":"Tele2","980":"Билайн","981":"Билайн","982":"Билайн","983":"Билайн",
  "984":"Билайн","985":"Билайн","986":"Билайн","987":"Билайн","988":"Билайн",
  "989":"Билайн","991":"Билайн","992":"Билайн","993":"Билайн","994":"Билайн",
  "995":"Билайн","996":"Билайн","997":"Билайн","999":"Билайн",
};

function parsePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // 8XXXXXXXXXX → 7XXXXXXXXXX (RU legacy)
  let norm = digits;
  if (norm.length === 11 && norm.startsWith("8")) norm = "7" + norm.slice(1);

  // Ищем подходящий код страны (от 3 к 1 цифре)
  for (const len of [3, 2, 1]) {
    const prefix = norm.slice(0, len);
    const meta = CC[prefix];
    if (meta && norm.length === meta.len) {
      return {
        ok: true,
        e164: "+" + norm,
        country: meta.iso,
        countryName: meta.name,
        cc: prefix,
        national: norm.slice(len),
      };
    }
  }
  return { ok: false, e164: "+" + norm, national: norm };
}

function detectLineType(parsed) {
  if (!parsed.ok) return "unknown";
  if (parsed.country === "RU") {
    const p3 = parsed.national.slice(0, 3);
    if (RU_MOBILE[p3]) return "mobile";
    if (parsed.national.startsWith("800")) return "toll-free";
    return "fixed";
  }
  if (parsed.country === "KZ") {
    const p3 = parsed.national.slice(0, 3);
    if (p3.startsWith("7") || p3.startsWith("70")) return "mobile";
    return "fixed";
  }
  // Общая эвристика
  if (parsed.national.length >= 9) return "mobile";
  return "fixed";
}

function lookupCarrier(parsed) {
  if (!parsed.ok || parsed.country !== "RU") return null;
  const p3 = parsed.national.slice(0, 3);
  return RU_MOBILE[p3] || null;
}

function scorePhone(input) {
  const layers = [];
  let total = 0;

  // 1. Парсинг (30)
  const parsed = parsePhone(input);
  if (!parsed || !parsed.ok) {
    return {
      score: 0, grade: "invalid", type: "phone",
      layers: [{ name: "Парсинг номера", passed: false, score: 0, max: 30, reason: "некорректный формат или неизвестный код страны" }],
    };
  }
  layers.push({ name: "Парсинг номера", passed: true, score: 30, max: 30 });
  total += 30;

  // 2. Код страны (20)
  layers.push({
    name: "Код страны",
    passed: true, score: 20, max: 20,
    value: parsed.country + " · " + parsed.countryName,
  });
  total += 20;

  // 3. Тип линии (20)
  const lineType = detectLineType(parsed);
  const typeLabels = { mobile: "мобильный", fixed: "стационарный", "toll-free": "бесплатный", unknown: "неизвестно" };
  const typeOk = lineType === "mobile" || lineType === "fixed" || lineType === "toll-free";
  layers.push({
    name: "Тип линии",
    passed: typeOk, score: typeOk ? 20 : 0, max: 20,
    value: typeLabels[lineType],
  });
  if (typeOk) total += 20;

  // 4. Оператор (15)
  const carrier = lookupCarrier(parsed);
  layers.push({
    name: "Оператор",
    passed: !!carrier, score: carrier ? 15 : 0, max: 15,
    value: carrier || undefined,
    reason: carrier ? undefined : "не определён (только РФ)",
  });
  if (carrier) total += 15;

  // 5. Длина и префикс (15) — проверка что номер не «мусорный»
  const nationalLen = parsed.national.length;
  const expectedLen = CC[parsed.cc].len - parsed.cc.length;
  const lenOk = nationalLen === expectedLen;
  layers.push({
    name: "Длина и структура",
    passed: lenOk, score: lenOk ? 15 : 0, max: 15,
    value: `${nationalLen} цифр`,
    reason: lenOk ? undefined : `ожидалось ${expectedLen}`,
  });
  if (lenOk) total += 15;

  return { score: total, grade: gradeOf(total), type: "phone", layers };
}

// Расширенный список одноразовых доменов
const DISPOSABLE = new Set([
  "mailinator.com","tempmail.com","10minutemail.com","guerrillamail.com",
  "throwawaymail.com","yopmail.com","trashmail.com","sharklasers.com",
  "getnada.com","temp-mail.org","fakeinbox.com","dispostable.com",
  "maildrop.cc","mailnesia.com","spam4.me","mintemail.com","tempinbox.com",
  "mohmal.com","emailondeck.com","throwaway.email","tempail.com",
  "getairmail.com","mailsac.com","mytemp.email","tempr.email",
  "discard.email","mailcatch.com","inboxbear.com","mailexpire.com",
  "spambog.com","trash-mail.com","wegwerfmail.de","trbvm.com",
  "kurzepost.de","objectmail.com","proxymail.eu","rcpt.at",
  "safe-mail.net","sofimail.com","tempemail.net","tempemail.co",
  "throwam.com","trashdevil.com","trashymail.com","tyldd.com",
  "uggsrock.com","venompen.com","veryrealemail.com","viditag.com",
  "viewcastmedia.com","viewcastmedia.net","viewcastmedia.org",
  "webemail.me","webm4il.info","wegwerfadresse.de","wegwerfemail.de",
  "wh4f.org","whyspam.me","willselfdestruct.com","winemaven.info",
  "wronghead.com","wuzup.net","xagloo.com","xemaps.com","xents.com",
  "xmaily.com","xoxy.net","yep.it","yogamaven.com","yopmail.fr",
  "yopmail.net","ypmail.webarnak.fr.eu.org","yuurok.com","zehnminuten.de",
  "zippymail.info","zoaxe.com","zoemail.org","mailtemp.info",
  "tempmail.net","tempmail.org","temp-mail.io","tempmailo.com",
  "tempmailaddress.com","tmpmail.net","tmpmail.org","throwawaymail.net",
  "guerrillamail.info","guerrillamail.net","guerrillamail.org",
  "guerrillamailblock.com","grr.la","pokemail.net","spam.la",
]);

const ROLE_PREFIXES = new Set([
  "admin","info","support","sales","contact","hello","help","noreply",
  "no-reply","donotreply","postmaster","webmaster","abuse","billing",
  "office","team","mail","jobs","careers","press","marketing","hr",
  "legal","security","privacy","feedback","service","customerservice",
]);

// Популярные домены для проверки опечаток
const POPULAR_DOMAINS = [
  "gmail.com","yandex.ru","mail.ru","outlook.com","hotmail.com","yahoo.com",
  "icloud.com","protonmail.com","proton.me","live.com","inbox.ru","list.ru",
  "bk.ru","rambler.ru","me.com","aol.com","zoho.com","gmx.com","fastmail.com",
];

// Расстояние Левенштейна (для typo-детекта)
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)
      );
  return dp[m][n];
}

function suggestDomain(domain) {
  let best = null, bestDist = 3;
  for (const d of POPULAR_DOMAINS) {
    const dist = lev(domain, d);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

// DNS-over-HTTPS — бесплатно, без ключей
async function resolveDoh(name, type) {
  const endpoints = [
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
  ];
  for (const url of endpoints) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, {
        headers: { accept: "application/dns-json" },
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.Answer) return data.Answer;
    } catch { /* пробуем следующий */ }
  }
  return null;
}

async function checkMx(domain) {
  const mx = await resolveDoh(domain, "MX");
  if (mx && mx.some(a => a.type === 15)) return { ok: true, records: mx.filter(a => a.type === 15).length };
  const a = await resolveDoh(domain, "A");
  if (a && a.some(r => r.type === 1)) return { ok: true, records: 0, fallback: true };
  return { ok: false };
}

async function scoreEmail(input, opts = {}) {
  const layers = [];
  let total = 0;
  const deep = opts.deep !== false;
  const email = input.trim();
  const lower = email.toLowerCase();

  // 1. Синтаксис (25)
  const parts = lower.split("@");
  const syntaxOk = parts.length === 2 && parts[0].length > 0 && parts[1].includes(".") &&
    /^[^\s@]+$/.test(parts[0]) && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parts[1]);
  if (!syntaxOk) {
    return {
      score: 0, grade: "invalid", type: "email",
      layers: [{ name: "Синтаксис (RFC 5322)", passed: false, score: 0, max: 25, reason: "некорректный формат" }],
    };
  }
  layers.push({ name: "Синтаксис (RFC 5322)", passed: true, score: 25, max: 25 });
  total += 25;

  const [local, domain] = parts;

  // 2. Структура домена (15)
  const domainParts = domain.split(".");
  const tld = domainParts[domainParts.length - 1];
  const structOk = tld.length >= 2 && domainParts.every(p => p.length > 0) &&
    !domain.includes("..") && !/^\d+$/.test(tld);
  layers.push({
    name: "Структура домена", passed: structOk, score: structOk ? 15 : 0, max: 15,
    reason: structOk ? undefined : "некорректные части домена",
  });
  if (structOk) total += 15;

  // 3. Typo-детект (10) — только если домен не в списке популярных
  let suggestion = null;
  if (!POPULAR_DOMAINS.includes(domain)) {
    suggestion = suggestDomain(domain);
  }
  const noTypo = !suggestion;
  layers.push({
    name: "Опечатки в домене", passed: noTypo, score: noTypo ? 10 : 0, max: 10,
    value: suggestion ? `→ ${suggestion}?` : undefined,
    reason: suggestion ? `похоже на ${suggestion}` : undefined,
  });
  if (noTypo) total += 10;

  // 4. DNS / MX (25, если включено)
  if (deep) {
    const mx = await checkMx(domain);
    layers.push({
      name: "DNS / MX-записи", passed: mx.ok, score: mx.ok ? 25 : 0, max: 25,
      value: mx.ok ? (mx.fallback ? "A-запись" : `${mx.records} MX`) : undefined,
      reason: mx.ok ? undefined : "домен не принимает почту",
    });
    if (mx.ok) total += 25;
    else return { score: total, grade: gradeOf(total), type: "email", layers, suggestion };
  } else {
    layers.push({ name: "DNS / MX-записи", passed: false, score: 0, max: 25, reason: "выключено" });
  }

  // 5. Одноразовый домен (15)
  const isDisp = DISPOSABLE.has(domain);
  layers.push({
    name: "Одноразовый домен", passed: !isDisp, score: isDisp ? 0 : 15, max: 15,
    value: isDisp ? domain : undefined,
    reason: isDisp ? "в списке disposable" : undefined,
  });
  if (!isDisp) total += 15;

  // 6. Роль-адрес (10)
  const isRole = ROLE_PREFIXES.has(local);
  layers.push({
    name: "Роль-адрес", passed: !isRole, score: isRole ? 0 : 10, max: 10,
    value: isRole ? local : undefined,
    reason: isRole ? "не личный адрес" : undefined,
  });
  if (!isRole) total += 10;

  return { score: total, grade: gradeOf(total), type: "email", layers, suggestion };
}
window.Scorer = {
  scoreEmail,
  scorePhone,
  detectType: (v) => {
    v = v.trim();
    if (!v) return "unknown";
    if (v.includes("@")) return "email";
    if (/^[+\d\s()\-]+$/.test(v)) return "phone";
    return "unknown";
  },
};