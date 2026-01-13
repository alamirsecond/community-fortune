/* Winners Circle Management UI
 * Static shell; all data calls require Authorization: Bearer <token>
 */

const WINNERS_API_BASE = "/api/winners";
const GAMES_API_BASE = "/api/games";
const VOUCHERS_API_BASE = "/api/vouchers";
const INSTANT_WINS_API_BASE = "/api/instant-wins";
const TOKEN_KEY = "cf_admin_token";

const els = {
  tabWinners: document.getElementById("tabWinners"),
  tabLeaderboards: document.getElementById("tabLeaderboards"),
  tabVouchers: document.getElementById("tabVouchers"),
  tabInstantWins: document.getElementById("tabInstantWins"),
  winnersTop: document.getElementById("winnersTop"),
  leaderboardsTop: document.getElementById("leaderboardsTop"),
  vouchersTop: document.getElementById("vouchersTop"),
  instantTop: document.getElementById("instantTop"),
  winnersSection: document.getElementById("winnersSection"),
  leaderboardsSection: document.getElementById("leaderboardsSection"),
  vouchersSection: document.getElementById("vouchersSection"),
  instantSection: document.getElementById("instantSection"),

  kpiTotalWinners: document.getElementById("kpiTotalWinners"),
  kpiTotalPrize: document.getElementById("kpiTotalPrize"),
  kpiWonWeek: document.getElementById("kpiWonWeek"),
  tbody: document.getElementById("tbody"),
  status: document.getElementById("status"),
  metaSub: document.getElementById("metaSub"),
  pages: document.getElementById("pages"),
  prev: document.getElementById("prev"),
  next: document.getElementById("next"),

  q: document.getElementById("q"),
  source: document.getElementById("source"),
  category: document.getElementById("category"),
  from: document.getElementById("from"),
  to: document.getElementById("to"),
  perPage: document.getElementById("perPage"),
  sort: document.getElementById("sort"),

  btnApply: document.getElementById("btnApply"),
  btnReset: document.getElementById("btnReset"),
  btnExportWinners: document.getElementById("btnExportWinners"),
  btnExportInstantAll: document.getElementById("btnExportInstantAll"),
  btnInstantAnalytics: document.getElementById("btnInstantAnalytics"),
  btnRefreshLb: document.getElementById("btnRefreshLb"),
  btnExportLb: document.getElementById("btnExportLb"),
  btnToken: document.getElementById("btnToken"),

  tokenDlg: document.getElementById("tokenDlg"),
  tokenInput: document.getElementById("tokenInput"),
  btnSaveToken: document.getElementById("btnSaveToken"),
  btnClearToken: document.getElementById("btnClearToken"),

  // Leaderboards UI
  lbSub: document.getElementById("lbSub"),
  gameStrip: document.getElementById("gameStrip"),
  periodDaily: document.getElementById("periodDaily"),
  periodWeekly: document.getElementById("periodWeekly"),
  periodMonthly: document.getElementById("periodMonthly"),
  periodAll: document.getElementById("periodAll"),
  autoRefresh: document.getElementById("autoRefresh"),
  lbTitle: document.getElementById("lbTitle"),
  lbMeta: document.getElementById("lbMeta"),
  lbStatus: document.getElementById("lbStatus"),
  lbTbody: document.getElementById("lbTbody"),
  lbNote: document.getElementById("lbNote"),
  btnTop100: document.getElementById("btnTop100"),

  // Vouchers UI
  vStatus: document.getElementById("vStatus"),
  voucherForm: document.getElementById("voucherForm"),
  vCode: document.getElementById("vCode"),
  vCampaign: document.getElementById("vCampaign"),
  vType: document.getElementById("vType"),
  vRewardType: document.getElementById("vRewardType"),
  vRewardValue: document.getElementById("vRewardValue"),
  vStartDate: document.getElementById("vStartDate"),
  vExpiryDate: document.getElementById("vExpiryDate"),
  vUsageLimit: document.getElementById("vUsageLimit"),
  btnVoucherCancel: document.getElementById("btnVoucherCancel"),
  btnVoucherCreate: document.getElementById("btnVoucherCreate"),

  vMetaSub: document.getElementById("vMetaSub"),
  vQ: document.getElementById("vQ"),
  vActive: document.getElementById("vActive"),
  vPerPage: document.getElementById("vPerPage"),
  btnVRefresh: document.getElementById("btnVRefresh"),
  vTbody: document.getElementById("vTbody"),
  vPages: document.getElementById("vPages"),
  vPrev: document.getElementById("vPrev"),
  vNext: document.getElementById("vNext"),

  // Instant Wins UI
  iwStatus: document.getElementById("iwStatus"),
  iwStatus2: document.getElementById("iwStatus2"),
  iwQ: document.getElementById("iwQ"),
  iwStatusFilter: document.getElementById("iwStatusFilter"),
  btnIwRefresh: document.getElementById("btnIwRefresh"),
  iwCards: document.getElementById("iwCards"),
  iwPrev: document.getElementById("iwPrev"),
  iwNext: document.getElementById("iwNext"),
  iwPages: document.getElementById("iwPages"),

  instantDetailsDlg: document.getElementById("instantDetailsDlg"),
  iwDlgTitle: document.getElementById("iwDlgTitle"),
  iwDlgSub: document.getElementById("iwDlgSub"),
  btnIwExport: document.getElementById("btnIwExport"),
  iwKpiConfigured: document.getElementById("iwKpiConfigured"),
  iwKpiClaimed: document.getElementById("iwKpiClaimed"),
  iwKpiTotalWon: document.getElementById("iwKpiTotalWon"),
  iwConfiguredTbody: document.getElementById("iwConfiguredTbody"),
  iwWinnersTbody: document.getElementById("iwWinnersTbody"),

  instantAnalyticsDlg: document.getElementById("instantAnalyticsDlg"),
  iwChartEntries: document.getElementById("iwChartEntries"),
  iwChartTop: document.getElementById("iwChartTop"),
  iwChartStats: document.getElementById("iwChartStats"),
};

const state = {
  tab: "winners",

  page: 1,
  per_page: 20,
  total: 0,
  rows: [],
  loading: false,
  lastError: null,

  // Leaderboards
  games: [],
  selectedGameId: null,
  selectedGameName: null,
  period: "DAILY",
  lbLimit: 10,
  lbLoading: false,
  autoRefreshTimer: null,

  // Vouchers
  vPage: 1,
  vLimit: 20,
  vTotal: 0,
  vRows: [],
  vLoading: false,

  // Instant Wins
  iwPage: 1,
  iwLimit: 9,
  iwTotal: 0,
  iwRows: [],
  iwLoading: false,
  iwSelectedCompetitionId: null,
  iwSelectedCompetitionTitle: null,
  iwCharts: {
    entries: null,
    top: null,
    stats: null,
  },
};

function getToken() {
  return (localStorage.getItem(TOKEN_KEY) || "").trim();
}

function setToken(raw) {
  const v = (raw || "").trim();
  if (v) localStorage.setItem(TOKEN_KEY, v);
  else localStorage.removeItem(TOKEN_KEY);
}

function setStatus(msg) {
  els.status.textContent = msg || "";
}

function setVStatus(msg) {
  if (!els.vStatus) return;
  els.vStatus.textContent = msg || "";
}

function fmtGBP(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtGBP2(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(val) {
  if (!val) return "—";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function badgeForCategory(cat) {
  const c = (cat || "").toUpperCase();
  if (c === "FREE") return { cls: "cyan", label: "FREE COMPETITION" };
  if (c === "PAID") return { cls: "cyan", label: "PAID COMPETITION" };
  if (c === "SUBSCRIPTION") return { cls: "cyan", label: "SUBSCRIBERS" };
  if (c === "JACKPOT") return { cls: "pink", label: "JACKPOT" };
  if (c === "SPIN_WHEEL") return { cls: "cyan", label: "SPIN THE WHEEL" };
  if (c === "INSTANT_WIN") return { cls: "gold", label: "INSTANT WIN" };
  if (c === "MINI_GAME") return { cls: "gray", label: "MINI GAME" };
  return { cls: "gray", label: c || "—" };
}

function safeText(text) {
  const span = document.createElement("span");
  span.textContent = text ?? "";
  return span;
}

async function apiFetch(path, { method = "GET", headers = {}, body } = {}) {
  const token = getToken();
  const h = {
    Accept: "application/json",
    ...headers,
  };
  if (token) h["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers: h,
    body,
  });

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error("Unauthorized"), { code: res.status });
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) {
      throw Object.assign(
        new Error(data?.message || `Request failed (${res.status})`),
        { status: res.status, data }
      );
    }
    return data;
  }

  if (!res.ok) {
    throw Object.assign(new Error(`Request failed (${res.status})`), {
      status: res.status,
    });
  }

  return res;
}

function setLbStatus(msg) {
  if (!els.lbStatus) return;
  els.lbStatus.textContent = msg || "";
}

function setIwStatus(msg) {
  if (els.iwStatus) els.iwStatus.textContent = msg || "";
  if (els.iwStatus2) els.iwStatus2.textContent = msg || "";
}

function setActiveTab(tab) {
  state.tab = tab;

  const isWinners = tab === "winners";
  const isLeaderboards = tab === "leaderboards";
  const isVouchers = tab === "vouchers";
  const isInstant = tab === "instant";

  els.tabWinners.classList.toggle("active", isWinners);
  els.tabLeaderboards.classList.toggle("active", isLeaderboards);
  if (els.tabVouchers) els.tabVouchers.classList.toggle("active", isVouchers);
  if (els.tabInstantWins)
    els.tabInstantWins.classList.toggle("active", isInstant);

  els.winnersTop.hidden = !isWinners;
  els.leaderboardsTop.hidden = !isLeaderboards;
  if (els.vouchersTop) els.vouchersTop.hidden = !isVouchers;
  if (els.instantTop) els.instantTop.hidden = !isInstant;

  els.winnersSection.hidden = !isWinners;
  els.leaderboardsSection.hidden = !isLeaderboards;
  if (els.vouchersSection) els.vouchersSection.hidden = !isVouchers;
  if (els.instantSection) els.instantSection.hidden = !isInstant;

  // Action buttons
  els.btnExportWinners.hidden = !isWinners;
  els.btnRefreshLb.hidden = !isLeaderboards;
  els.btnExportLb.hidden = !isLeaderboards;
  if (els.btnExportInstantAll) els.btnExportInstantAll.hidden = !isInstant;
  if (els.btnInstantAnalytics) els.btnInstantAnalytics.hidden = !isInstant;
}

function voucherTypeLabel(voucherType) {
  const t = String(voucherType || "").toUpperCase();
  if (t === "SINGLE_USE") return "Single-use";
  if (t === "MULTI_USE") return "Multi-use";
  return t || "—";
}

function activeBadge(isActive) {
  if (isActive) return { cls: "good", label: "ACTIVE" };
  return { cls: "bad", label: "INACTIVE" };
}

function toISODateInput(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function syncVoucherFormForType() {
  if (!els.vType || !els.vUsageLimit) return;
  const t = String(els.vType.value || "SINGLE_USE").toUpperCase();
  if (t === "SINGLE_USE") {
    els.vUsageLimit.value = "1";
    els.vUsageLimit.disabled = true;
  } else {
    els.vUsageLimit.disabled = false;
    if (String(els.vUsageLimit.value || "").trim() === "1") {
      els.vUsageLimit.value = "0";
    }
  }
}

function resetVoucherForm() {
  if (!els.voucherForm) return;
  els.voucherForm.reset();
  if (els.vRewardValue) els.vRewardValue.value = "5";
  if (els.vType) els.vType.value = "SINGLE_USE";
  if (els.vUsageLimit) {
    els.vUsageLimit.value = "1";
    els.vUsageLimit.disabled = true;
  }

  const today = new Date();
  const in30 = new Date(today.getTime());
  in30.setDate(in30.getDate() + 30);

  if (els.vStartDate) els.vStartDate.value = toISODateInput(today);
  if (els.vExpiryDate) els.vExpiryDate.value = toISODateInput(in30);

  syncVoucherFormForType();
}

async function createVoucherFromForm() {
  setVStatus("");
  const code = (els.vCode?.value || "").trim();
  const campaign_name = (els.vCampaign?.value || "").trim();
  const voucher_type = String(els.vType?.value || "SINGLE_USE").toUpperCase();
  const reward_type = String(
    els.vRewardType?.value || "SITE_CREDIT"
  ).toUpperCase();
  const reward_value = Number(els.vRewardValue?.value || 0);
  const start_date = (els.vStartDate?.value || "").trim();
  const expiry_date = (els.vExpiryDate?.value || "").trim();
  const usage_limit = Number(els.vUsageLimit?.value || 0);

  const body = {
    campaign_name,
    voucher_type,
    reward_type,
    reward_value,
    start_date,
    expiry_date,
    usage_limit,
  };
  if (code) body.code = code;

  const data = await apiFetch(`${VOUCHERS_API_BASE}/admin/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const createdCode = data?.data?.code;
  setVStatus(
    createdCode ? `Created voucher ${createdCode}` : "Voucher created"
  );
  if (els.vCode && createdCode) els.vCode.value = createdCode;

  state.vPage = 1;
  await loadVouchers();
}

function renderVoucherPages() {
  if (!els.vPages || !els.vPrev || !els.vNext) return;

  const total = state.vTotal || 0;
  const limit = state.vLimit || 20;
  const page = state.vPage || 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  els.vPrev.disabled = page <= 1;
  els.vNext.disabled = page >= pages;

  els.vPages.innerHTML = "";
  const maxBtns = 7;
  const start = Math.max(1, page - Math.floor(maxBtns / 2));
  const end = Math.min(pages, start + maxBtns - 1);
  const start2 = Math.max(1, end - maxBtns + 1);

  const addBtn = (p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pageBtn${p === page ? " active" : ""}`;
    b.textContent = String(p);
    b.addEventListener("click", () => {
      state.vPage = p;
      loadVouchers();
    });
    els.vPages.appendChild(b);
  };

  if (start2 > 1) {
    addBtn(1);
    if (start2 > 2) {
      const dots = document.createElement("span");
      dots.className = "pageDots";
      dots.textContent = "…";
      els.vPages.appendChild(dots);
    }
  }

  for (let p = start2; p <= end; p += 1) addBtn(p);

  if (end < pages) {
    if (end < pages - 1) {
      const dots = document.createElement("span");
      dots.className = "pageDots";
      dots.textContent = "…";
      els.vPages.appendChild(dots);
    }
    addBtn(pages);
  }
}

function renderVouchers() {
  if (!els.vTbody) return;
  els.vTbody.innerHTML = "";

  if (state.vLoading) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "empty";
    td.textContent = "Loading…";
    tr.appendChild(td);
    els.vTbody.appendChild(tr);
    return;
  }

  if (!state.vRows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "empty";
    td.textContent = "No vouchers found";
    tr.appendChild(td);
    els.vTbody.appendChild(tr);
    return;
  }

  for (const row of state.vRows) {
    const tr = document.createElement("tr");

    const usageText =
      Number(row.usage_limit) === 0
        ? `${row.times_redeemed}/∞`
        : `${row.times_redeemed}/${row.usage_limit}`;

    const windowText = `${fmtDate(row.start_date)} → ${fmtDate(
      row.expiry_date
    )}`;
    const badge = activeBadge(Boolean(row.is_active));

    const tdCode = document.createElement("td");
    const codeWrap = document.createElement("div");
    codeWrap.className = "who";
    const codeText = document.createElement("div");
    codeText.className = "whoText";
    const codeMain = document.createElement("div");
    codeMain.className = "whoName";
    codeMain.textContent = row.code || "—";
    const codeMini = document.createElement("div");
    codeMini.className = "mini";
    codeMini.textContent = row.id ? `ID: ${row.id}` : "";
    codeText.appendChild(codeMain);
    codeText.appendChild(codeMini);
    codeWrap.appendChild(codeText);
    tdCode.appendChild(codeWrap);

    const tdCampaign = document.createElement("td");
    tdCampaign.appendChild(safeText(row.campaign_name || "—"));

    const tdType = document.createElement("td");
    tdType.appendChild(safeText(voucherTypeLabel(row.voucher_type)));

    const tdReward = document.createElement("td");
    tdReward.className = "num";
    tdReward.appendChild(safeText(fmtGBP2(row.reward_value)));

    const tdWindow = document.createElement("td");
    tdWindow.appendChild(safeText(windowText));

    const tdUsage = document.createElement("td");
    tdUsage.className = "num";
    tdUsage.appendChild(safeText(usageText));

    const tdStatus = document.createElement("td");
    const b = document.createElement("span");
    b.className = `badge ${badge.cls}`;
    b.textContent = badge.label;
    tdStatus.appendChild(b);

    const tdActions = document.createElement("td");
    tdActions.className = "num";
    const actions = document.createElement("div");
    actions.className = "miniActions";

    const btnCopy = document.createElement("button");
    btnCopy.type = "button";
    btnCopy.className = "miniBtn";
    btnCopy.textContent = "Copy";
    btnCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(row.code || ""));
        setVStatus(`Copied ${row.code}`);
        setTimeout(() => setVStatus(""), 1200);
      } catch {
        // ignore
      }
    });

    const btnToggle = document.createElement("button");
    btnToggle.type = "button";
    btnToggle.className = `miniBtn${row.is_active ? " danger" : ""}`;
    btnToggle.textContent = row.is_active ? "Deactivate" : "Activate";
    btnToggle.addEventListener("click", async () => {
      await apiFetch(`${VOUCHERS_API_BASE}/admin/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      await loadVouchers();
    });

    actions.appendChild(btnCopy);
    actions.appendChild(btnToggle);
    tdActions.appendChild(actions);

    tr.appendChild(tdCode);
    tr.appendChild(tdCampaign);
    tr.appendChild(tdType);
    tr.appendChild(tdReward);
    tr.appendChild(tdWindow);
    tr.appendChild(tdUsage);
    tr.appendChild(tdStatus);
    tr.appendChild(tdActions);

    els.vTbody.appendChild(tr);
  }
}

async function loadVouchers() {
  if (state.vLoading) return;
  state.vLoading = true;
  renderVouchers();
  setVStatus("");

  const q = (els.vQ?.value || "").trim();
  const activeRaw = els.vActive?.value || "ALL";
  state.vLimit = Number(els.vPerPage?.value || state.vLimit || 20);

  const params = new URLSearchParams();
  params.set("page", String(state.vPage));
  params.set("limit", String(state.vLimit));
  if (q) params.set("q", q);
  if (activeRaw === "true" || activeRaw === "false") {
    params.set("is_active", activeRaw);
  }

  try {
    const data = await apiFetch(
      `${VOUCHERS_API_BASE}/admin/list?${params.toString()}`
    );
    const list = data?.data?.vouchers || [];
    const pagination = data?.data?.pagination || {};

    state.vRows = list;
    state.vTotal = Number(pagination.total || 0);
    state.vPage = Number(pagination.page || state.vPage);
    state.vLimit = Number(pagination.limit || state.vLimit);

    if (els.vMetaSub) {
      els.vMetaSub.textContent = `${state.vTotal} total • page ${state.vPage}`;
    }

    renderVouchers();
    renderVoucherPages();
  } catch (err) {
    if (err?.code === 401 || err?.code === 403) {
      setVStatus("Unauthorized — set an admin token.");
    } else {
      setVStatus(err?.message || "Failed to load vouchers");
    }
  } finally {
    state.vLoading = false;
    renderVouchers();
  }
}

function periodToDays(period) {
  if (period === "DAILY") return 1;
  if (period === "WEEKLY") return 7;
  if (period === "MONTHLY") return 30;
  return 365;
}

function setPeriod(period) {
  state.period = period;
  els.periodDaily.classList.toggle("active", period === "DAILY");
  els.periodWeekly.classList.toggle("active", period === "WEEKLY");
  els.periodMonthly.classList.toggle("active", period === "MONTHLY");
  els.periodAll.classList.toggle("active", period === "ALL");
}

function getTrendKey(gameId, period) {
  return `cf_lb_prev_${gameId}_${period}`;
}

function getPreviousPositions(gameId, period) {
  try {
    const raw = localStorage.getItem(getTrendKey(gameId, period));
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCurrentPositions(gameId, period, leaderboard) {
  try {
    const map = {};
    for (const row of leaderboard || []) {
      if (row.user_id && row.position) map[row.user_id] = row.position;
    }
    localStorage.setItem(getTrendKey(gameId, period), JSON.stringify(map));
  } catch {
    // ignore
  }
}

function rewardForRank(rank) {
  // Frontend-only default scheme (can be aligned with backend later)
  if (rank === 1) return "£15 + 3 universal tickets + 100 pts";
  if (rank === 2) return "£10 + 2 universal tickets + 75 pts";
  if (rank === 3) return "£7 + 1 universal ticket + 50 pts";
  if (rank <= 10) return "£5 + 1 universal ticket + 25 pts";
  return "—";
}

function renderGames() {
  els.gameStrip.innerHTML = "";
  if (!state.games.length) {
    const d = document.createElement("div");
    d.className = "gameSkeleton";
    d.textContent = "No games found.";
    els.gameStrip.appendChild(d);
    return;
  }

  for (const g of state.games) {
    const card = document.createElement("div");
    card.className =
      "gameCard" + (g.id === state.selectedGameId ? " active" : "");
    card.setAttribute("role", "listitem");
    card.tabIndex = 0;

    const icon = document.createElement("div");
    icon.className = "gameIcon";
    if (g.thumbnail_url) {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.src = g.thumbnail_url;
      img.onerror = () => img.remove();
      icon.appendChild(img);
    } else {
      icon.textContent = "🎮";
    }

    const text = document.createElement("div");
    const nm = document.createElement("div");
    nm.className = "gameName";
    nm.textContent = g.name || "—";
    const meta = document.createElement("div");
    meta.className = "gameMeta";
    meta.textContent = `${g.category || ""}${
      g.difficulty ? ` • ${g.difficulty}` : ""
    }`.trim();
    text.appendChild(nm);
    text.appendChild(meta);

    card.appendChild(icon);
    card.appendChild(text);

    const select = async () => {
      state.selectedGameId = g.id;
      state.selectedGameName = g.name;
      renderGames();
      await loadLeaderboard();
    };
    card.addEventListener("click", select);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      }
    });

    els.gameStrip.appendChild(card);
  }
}

function renderLeaderboardEmpty(msg) {
  els.lbTbody.innerHTML = "";
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 7;
  td.className = "empty";
  td.textContent = msg;
  tr.appendChild(td);
  els.lbTbody.appendChild(tr);
}

function renderLeaderboardRows(leaderboard) {
  els.lbTbody.innerHTML = "";
  if (!leaderboard || leaderboard.length === 0) {
    renderLeaderboardEmpty("No leaderboard entries for this period.");
    return;
  }

  const prev = getPreviousPositions(state.selectedGameId, state.period);

  for (const row of leaderboard) {
    const tr = document.createElement("tr");

    // Rank
    {
      const td = document.createElement("td");
      td.className = "num";
      const pill = document.createElement("span");
      pill.className = "rankPill";
      pill.textContent = row.position;
      td.appendChild(pill);
      tr.appendChild(td);
    }

    // Player
    {
      const td = document.createElement("td");
      const who = document.createElement("div");
      who.className = "who";

      const av = document.createElement("div");
      av.className = "avatar";
      const img = document.createElement("img");
      img.alt = "";
      if (row.profile_photo) img.src = row.profile_photo;
      img.loading = "lazy";
      img.onerror = () => img.remove();
      av.appendChild(img);

      const wt = document.createElement("div");
      wt.className = "whoText";
      const nm = document.createElement("div");
      nm.className = "whoName";
      nm.textContent = row.username || "—";
      const id = document.createElement("div");
      id.className = "whoId";
      id.textContent = row.user_id ? `#${String(row.user_id).slice(0, 8)}` : "";
      wt.appendChild(nm);
      wt.appendChild(id);
      who.appendChild(av);
      who.appendChild(wt);
      td.appendChild(who);
      tr.appendChild(td);
    }

    // Score
    {
      const td = document.createElement("td");
      td.className = "num";
      td.textContent = new Intl.NumberFormat("en-GB").format(
        Number(row.score || 0)
      );
      tr.appendChild(td);
    }

    // Games played
    {
      const td = document.createElement("td");
      td.className = "num";
      td.textContent = `${Number(row.total_plays || 0)} plays`;
      tr.appendChild(td);
    }

    // Reward
    {
      const td = document.createElement("td");
      td.textContent = rewardForRank(Number(row.position));
      tr.appendChild(td);
    }

    // Trend
    {
      const td = document.createElement("td");
      td.className = "num";

      const prevPos = prev[row.user_id];
      const curPos = Number(row.position);
      if (!prevPos) {
        const s = document.createElement("span");
        s.className = "trendNew";
        s.textContent = `↑ New #${curPos}`;
        td.appendChild(s);
      } else {
        const delta = Number(prevPos) - curPos;
        if (delta === 0) {
          td.textContent = "— 0";
        } else if (delta > 0) {
          const s = document.createElement("span");
          s.className = "trendUp";
          s.textContent = `↑ +${delta}`;
          td.appendChild(s);
        } else {
          const s = document.createElement("span");
          s.className = "trendDown";
          s.textContent = `↓ ${delta}`;
          td.appendChild(s);
        }
      }
      tr.appendChild(td);
    }

    // Actions
    {
      const td = document.createElement("td");
      td.className = "num";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy";
      btn.textContent = "Copy ID";
      btn.disabled = !row.user_id;
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(String(row.user_id));
          setLbStatus("User ID copied.");
          setTimeout(() => setLbStatus(""), 1200);
        } catch {
          setLbStatus("Copy failed.");
          setTimeout(() => setLbStatus(""), 1200);
        }
      });
      td.appendChild(btn);
      tr.appendChild(td);
    }

    els.lbTbody.appendChild(tr);
  }

  saveCurrentPositions(state.selectedGameId, state.period, leaderboard);
}

async function loadGames() {
  try {
    els.gameStrip.innerHTML = '<div class="gameSkeleton">Loading games…</div>';
    const json = await apiFetch(
      `${GAMES_API_BASE}/admin/list?limit=12&status=ACTIVE`
    );
    const games = json?.data?.games || [];
    state.games = Array.isArray(games) ? games : [];
    renderGames();

    // Auto select the first game
    if (!state.selectedGameId && state.games.length) {
      state.selectedGameId = state.games[0].id;
      state.selectedGameName = state.games[0].name;
      renderGames();
      await loadLeaderboard();
    }
  } catch (e) {
    if (e?.code === 401 || e?.code === 403) {
      els.gameStrip.innerHTML =
        '<div class="gameSkeleton">Add an admin token to load games.</div>';
      return;
    }
    els.gameStrip.innerHTML =
      '<div class="gameSkeleton">Failed to load games.</div>';
  }
}

async function loadLeaderboard() {
  if (!state.selectedGameId) {
    renderLeaderboardEmpty("Pick a game to load leaderboard…");
    return;
  }
  if (state.lbLoading) return;
  state.lbLoading = true;
  setLbStatus("Loading leaderboard…");

  try {
    const period = state.period;
    const limit = state.lbLimit;
    const json = await apiFetch(
      `${GAMES_API_BASE}/admin/${
        state.selectedGameId
      }/leaderboard?period=${encodeURIComponent(
        period
      )}&limit=${encodeURIComponent(limit)}`
    );

    const d = json?.data || {};
    const leaderboard = d.leaderboard || [];
    const totalPlayers = d.total_players || leaderboard.length;

    els.lbTitle.textContent = `${
      d.game_name || state.selectedGameName || "Game"
    } • ${period.charAt(0) + period.slice(1).toLowerCase()} Leaderboard`;
    els.lbMeta.textContent = `Top ${limit} • ${new Intl.NumberFormat(
      "en-GB"
    ).format(totalPlayers)} players • Updated ${new Date(
      d.updated_at || Date.now()
    ).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    els.lbNote.textContent =
      limit >= 100 ? "Showing top 100" : "Showing top 10";

    renderLeaderboardRows(leaderboard);
    setLbStatus("");
  } catch (e) {
    if (e?.code === 401 || e?.code === 403) {
      renderLeaderboardEmpty(
        "Unauthorized. Click Token and paste an admin JWT."
      );
      setLbStatus("Unauthorized.");
      return;
    }
    renderLeaderboardEmpty(e?.message || "Failed to load leaderboard.");
    setLbStatus("Failed to load leaderboard.");
  } finally {
    state.lbLoading = false;
  }
}

function setupAutoRefresh(enabled) {
  if (state.autoRefreshTimer) {
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }
  if (!enabled) return;
  state.autoRefreshTimer = setInterval(() => {
    if (state.tab === "leaderboards") loadLeaderboard();
  }, 10000);
}

function buildQuery({ exportMode = false } = {}) {
  const q = els.q.value.trim();
  const source = els.source.value;
  const category = els.category.value;
  const from = els.from.value;
  const to = els.to.value;
  const sort = els.sort.value;

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (source) params.set("source", source);
  if (category) params.set("category", category);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (sort) params.set("sort", sort);

  if (!exportMode) {
    params.set("page", String(state.page));
    params.set("per_page", String(state.per_page));
  }

  return params;
}

function renderRows() {
  const rows = state.rows || [];
  els.tbody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "empty";
    td.textContent = state.loading
      ? "Loading…"
      : "No winners match your filters.";
    tr.appendChild(td);
    els.tbody.appendChild(tr);
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");

    // Name
    {
      const td = document.createElement("td");
      const who = document.createElement("div");
      who.className = "who";

      const av = document.createElement("div");
      av.className = "avatar";
      const img = document.createElement("img");
      img.alt = "";
      if (r.profile_photo) img.src = r.profile_photo;
      img.loading = "lazy";
      img.onerror = () => {
        img.remove();
      };
      av.appendChild(img);

      const wt = document.createElement("div");
      wt.className = "whoText";
      const nm = document.createElement("div");
      nm.className = "whoName";
      nm.textContent = r.username || "—";
      const id = document.createElement("div");
      id.className = "whoId";
      id.textContent = r.user_id ? `#${String(r.user_id).slice(0, 8)}` : "";
      wt.appendChild(nm);
      wt.appendChild(id);

      who.appendChild(av);
      who.appendChild(wt);
      td.appendChild(who);
      tr.appendChild(td);
    }

    // Competition name
    {
      const td = document.createElement("td");
      const title = document.createElement("div");
      title.textContent = r.competition_title || "—";
      const sub = document.createElement("div");
      sub.className = "mini";
      sub.textContent = r.competition_id
        ? `#${String(r.competition_id).slice(0, 12)}`
        : "";
      td.appendChild(title);
      td.appendChild(sub);
      tr.appendChild(td);
    }

    // Competition type
    {
      const td = document.createElement("td");
      const b = badgeForCategory(r.competition_category);
      const span = document.createElement("span");
      span.className = `badge ${b.cls}`;
      span.textContent = b.label;
      if (r.source === "INSTANT") {
        const s2 = document.createElement("span");
        s2.className = "badge gold";
        s2.textContent = "INSTANT";
        td.appendChild(s2);
        td.appendChild(document.createTextNode(" "));
      }
      td.appendChild(span);
      tr.appendChild(td);
    }

    // Reward
    {
      const td = document.createElement("td");
      td.className = "num";
      td.textContent = fmtGBP(r.reward_value);
      tr.appendChild(td);
    }

    // Entry
    {
      const td = document.createElement("td");
      td.className = "num";
      td.textContent = fmtGBP2(r.entry_price);
      tr.appendChild(td);
    }

    // Date ended
    {
      const td = document.createElement("td");
      td.textContent = fmtDate(r.date_ended);
      tr.appendChild(td);
    }

    // Ticket
    {
      const td = document.createElement("td");
      td.className = "num";
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.justifyContent = "flex-end";
      wrap.style.gap = "8px";
      wrap.style.alignItems = "center";

      const val = document.createElement("span");
      val.textContent = r.ticket_number ? `#${r.ticket_number}` : "—";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy";
      btn.textContent = "Copy";
      btn.disabled = !r.ticket_number;
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(String(r.ticket_number));
          setStatus("Ticket copied.");
          setTimeout(() => setStatus(""), 1200);
        } catch {
          setStatus("Copy failed.");
          setTimeout(() => setStatus(""), 1200);
        }
      });

      wrap.appendChild(val);
      wrap.appendChild(btn);
      td.appendChild(wrap);
      tr.appendChild(td);
    }

    els.tbody.appendChild(tr);
  }
}

function renderPager() {
  const totalPages = Math.max(
    1,
    Math.ceil((state.total || 0) / state.per_page)
  );
  els.prev.disabled = state.page <= 1;
  els.next.disabled = state.page >= totalPages;

  els.pages.innerHTML = "";

  const mkBtn = (p, label = String(p), active = false) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pageBtn${active ? " active" : ""}`;
    b.textContent = label;
    b.addEventListener("click", () => {
      state.page = p;
      loadList();
    });
    return b;
  };

  const mkDots = () => {
    const s = document.createElement("span");
    s.className = "pageDots";
    s.textContent = "…";
    return s;
  };

  const p = state.page;
  const windowSize = 2;
  const start = Math.max(2, p - windowSize);
  const end = Math.min(totalPages - 1, p + windowSize);

  els.pages.appendChild(mkBtn(1, "1", p === 1));

  if (start > 2) els.pages.appendChild(mkDots());

  for (let i = start; i <= end; i++) {
    els.pages.appendChild(mkBtn(i, String(i), i === p));
  }

  if (end < totalPages - 1) els.pages.appendChild(mkDots());

  if (totalPages > 1) {
    els.pages.appendChild(
      mkBtn(totalPages, String(totalPages), p === totalPages)
    );
  }
}

function updateMeta() {
  const totalPages = Math.max(
    1,
    Math.ceil((state.total || 0) / state.per_page)
  );
  const from = state.total ? (state.page - 1) * state.per_page + 1 : 0;
  const to = Math.min(state.total, state.page * state.per_page);
  els.metaSub.textContent = `${from}–${to} of ${state.total} results • Page ${state.page} / ${totalPages}`;
}

async function loadStats() {
  try {
    setStatus("Loading stats…");
    const json = await apiFetch(`${WINNERS_API_BASE}/admin/stats?days=7`);
    const d = json?.data || {};

    els.kpiTotalWinners.textContent = new Intl.NumberFormat("en-GB").format(
      Number(d.total_winners || 0)
    );
    els.kpiTotalPrize.textContent = fmtGBP(d.total_prize_value || 0);
    els.kpiWonWeek.textContent = fmtGBP(d.amount_won_recent || 0);

    setStatus("");
  } catch (e) {
    if (e?.code === 401 || e?.code === 403) {
      setStatus("Add an admin token to view stats.");
      els.kpiTotalWinners.textContent = "—";
      els.kpiTotalPrize.textContent = "—";
      els.kpiWonWeek.textContent = "—";
      return;
    }
    setStatus("Failed to load stats.");
  }
}

async function loadList() {
  if (state.loading) return;
  state.loading = true;
  renderRows();
  setStatus("Loading winners…");

  try {
    const params = buildQuery();
    const json = await apiFetch(
      `${WINNERS_API_BASE}/admin/list?${params.toString()}`
    );
    const d = json?.data || {};

    state.total = Number(d.total || 0);
    state.per_page = Number(d.per_page || state.per_page);
    state.rows = Array.isArray(d.rows) ? d.rows : [];

    updateMeta();
    renderRows();
    renderPager();
    setStatus("");
  } catch (e) {
    state.rows = [];
    state.total = 0;
    updateMeta();
    renderRows();
    renderPager();

    if (e?.code === 401 || e?.code === 403) {
      setStatus("Unauthorized. Click Token and paste an admin JWT.");
      return;
    }

    setStatus(e?.message || "Failed to load winners.");
  } finally {
    state.loading = false;
  }
}

function applyFromUI() {
  state.page = 1;
  state.per_page = Number(els.perPage.value || 20);
  loadList();
}

function resetUI() {
  els.q.value = "";
  els.source.value = "ALL";
  els.category.value = "ALL";
  els.from.value = "";
  els.to.value = "";
  els.perPage.value = "20";
  els.sort.value = "newest";
  state.page = 1;
  state.per_page = 20;
}

function openTokenDialog() {
  els.tokenInput.value = getToken();
  els.tokenDlg.showModal();
}

async function exportCSV() {
  try {
    setStatus("Preparing export…");
    const params = buildQuery({ exportMode: true });
    const token = getToken();
    const res = await fetch(
      `${WINNERS_API_BASE}/admin/export?${params.toString()}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );

    if (res.status === 401 || res.status === 403) {
      setStatus("Unauthorized. Add an admin token to export.");
      return;
    }

    if (!res.ok) {
      setStatus(`Export failed (${res.status}).`);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "winners_export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    setStatus("Export downloaded.");
    setTimeout(() => setStatus(""), 1500);
  } catch (e) {
    setStatus("Export failed.");
  }
}

async function exportLeaderboardCSV() {
  if (!state.selectedGameId) {
    setLbStatus("Pick a game first.");
    setTimeout(() => setLbStatus(""), 1200);
    return;
  }
  try {
    setLbStatus("Preparing export…");
    const token = getToken();
    const url = `${GAMES_API_BASE}/admin/${
      state.selectedGameId
    }/export?period=${encodeURIComponent(state.period)}&limit=1000`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401 || res.status === 403) {
      setLbStatus("Unauthorized. Add an admin token to export.");
      return;
    }
    if (!res.ok) {
      setLbStatus(`Export failed (${res.status}).`);
      return;
    }
    const blob = await res.blob();
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = "leaderboard_export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(dlUrl);
    setLbStatus("Export downloaded.");
    setTimeout(() => setLbStatus(""), 1500);
  } catch {
    setLbStatus("Export failed.");
  }
}

// ==================== INSTANT WINS (ADMIN UI) ====================

function compRef(id) {
  const s = String(id || "");
  if (!s) return "—";
  return `#COMP-${s.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderIwPagination() {
  if (!els.iwPages || !els.iwPrev || !els.iwNext) return;
  const total = state.iwTotal || 0;
  const limit = state.iwLimit || 9;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = state.iwPage || 1;

  els.iwPrev.disabled = page <= 1;
  els.iwNext.disabled = page >= totalPages;

  els.iwPages.innerHTML = "";
  const mkBtn = (p, label = String(p), active = false) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pageBtn${active ? " active" : ""}`;
    b.textContent = label;
    b.addEventListener("click", () => {
      state.iwPage = p;
      loadInstantReports();
    });
    return b;
  };

  const windowSize = 5;
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + windowSize - 1);

  if (start > 1) {
    els.iwPages.appendChild(mkBtn(1, "1", page === 1));
    if (start > 2) {
      const dots = document.createElement("span");
      dots.className = "pageDots";
      dots.textContent = "…";
      els.iwPages.appendChild(dots);
    }
  }

  for (let p = start; p <= end; p++) {
    els.iwPages.appendChild(mkBtn(p, String(p), p === page));
  }

  if (end < totalPages) {
    if (end < totalPages - 1) {
      const dots = document.createElement("span");
      dots.className = "pageDots";
      dots.textContent = "…";
      els.iwPages.appendChild(dots);
    }
    els.iwPages.appendChild(
      mkBtn(totalPages, String(totalPages), page === totalPages)
    );
  }
}

function renderIwCards(rows) {
  if (!els.iwCards) return;
  els.iwCards.innerHTML = "";

  if (!rows || rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No instant win competitions found.";
    els.iwCards.appendChild(empty);
    return;
  }

  for (const r of rows) {
    const compId = r.competition_id;
    const title = r.competition_title || "—";
    const configured = Number(r.configured_prizes || 0);
    const claimed = Number(r.claimed_prizes || 0);

    const card = document.createElement("article");
    card.className = "iwCard";

    const h = document.createElement("div");
    const t = document.createElement("div");
    t.className = "iwCardTitle";
    t.textContent = title;
    const code = document.createElement("div");
    code.className = "iwCardCode";
    code.textContent = compRef(compId);
    h.appendChild(t);
    h.appendChild(code);

    const stats = document.createElement("div");
    stats.className = "iwStatGrid";
    const s1 = document.createElement("div");
    s1.className = "iwStat";
    s1.innerHTML = `<div><div class="num">${configured}</div><div class="lbl">Configured Prizes</div></div>`;
    const s2 = document.createElement("div");
    s2.className = "iwStat";
    s2.innerHTML = `<div><div class="num">${claimed}</div><div class="lbl">Instant Wins Claimed</div></div>`;
    stats.appendChild(s1);
    stats.appendChild(s2);

    const actions = document.createElement("div");
    actions.className = "iwCardActions";
    const btnDetails = document.createElement("button");
    btnDetails.type = "button";
    btnDetails.className = "btn btnPrimary";
    btnDetails.textContent = "View Details";
    btnDetails.addEventListener("click", () => openIwDetails(compId, title));

    const btnExport = document.createElement("button");
    btnExport.type = "button";
    btnExport.className = "btn btnGhost";
    btnExport.textContent = "Export CSV";
    btnExport.addEventListener("click", () =>
      exportInstantCompetition(compId, title)
    );

    actions.appendChild(btnDetails);
    actions.appendChild(btnExport);

    card.appendChild(h);
    card.appendChild(stats);
    card.appendChild(actions);
    els.iwCards.appendChild(card);
  }
}

async function loadInstantReports() {
  if (state.iwLoading) return;
  state.iwLoading = true;
  setIwStatus("Loading…");
  try {
    const params = new URLSearchParams();
    params.set("page", String(state.iwPage));
    params.set("limit", String(state.iwLimit));
    const q = (els.iwQ?.value || "").trim();
    if (q) params.set("q", q);
    const status = String(els.iwStatusFilter?.value || "ACTIVE").trim();
    if (status) params.set("status", status);

    const data = await apiFetch(
      `${INSTANT_WINS_API_BASE}/admin/reports?${params.toString()}`
    );
    const rows = data?.rows || [];
    const pagination = data?.pagination || {};
    state.iwRows = rows;
    state.iwTotal = Number(pagination.total || 0);
    state.iwPage = Number(pagination.page || state.iwPage);
    state.iwLimit = Number(pagination.limit || state.iwLimit);
    renderIwCards(rows);
    renderIwPagination();
    setIwStatus(`${state.iwTotal} competition(s)`);
  } catch (e) {
    if (e?.code === 401 || e?.code === 403) {
      setIwStatus("Unauthorized — set an admin token.");
    } else {
      setIwStatus(e?.data?.message || e?.message || "Failed to load reports");
    }
  } finally {
    state.iwLoading = false;
  }
}

async function exportInstantAll() {
  try {
    setIwStatus("Preparing export…");
    const token = getToken();
    const res = await fetch(`${INSTANT_WINS_API_BASE}/admin/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401 || res.status === 403) {
      setIwStatus("Unauthorized — set an admin token.");
      return;
    }
    if (!res.ok) {
      setIwStatus(`Export failed (${res.status}).`);
      return;
    }
    const blob = await res.blob();
    downloadBlob(blob, "instant_wins_all.csv");
    setIwStatus("Export downloaded.");
    setTimeout(() => setIwStatus(""), 1500);
  } catch {
    setIwStatus("Export failed.");
  }
}

async function exportInstantCompetition(competitionId, title) {
  try {
    setIwStatus("Preparing export…");
    const token = getToken();
    const res = await fetch(
      `${INSTANT_WINS_API_BASE}/admin/competition/${encodeURIComponent(
        competitionId
      )}/export`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    if (res.status === 401 || res.status === 403) {
      setIwStatus("Unauthorized — set an admin token.");
      return;
    }
    if (!res.ok) {
      setIwStatus(`Export failed (${res.status}).`);
      return;
    }
    const blob = await res.blob();
    const safe = String(title || "instant_wins").replace(/[^a-z0-9-_]+/gi, "_");
    downloadBlob(blob, `${safe}_instant_wins.csv`);
    setIwStatus("Export downloaded.");
    setTimeout(() => setIwStatus(""), 1500);
  } catch {
    setIwStatus("Export failed.");
  }
}

async function openIwDetails(competitionId, title) {
  state.iwSelectedCompetitionId = competitionId;
  state.iwSelectedCompetitionTitle = title;
  if (els.iwDlgTitle)
    els.iwDlgTitle.textContent = `Instant Win: ${title || "—"}`;
  if (els.iwDlgSub) els.iwDlgSub.textContent = compRef(competitionId);
  if (els.iwConfiguredTbody) {
    els.iwConfiguredTbody.innerHTML = `<tr><td colspan="7" class="empty">Loading…</td></tr>`;
  }
  if (els.iwWinnersTbody) {
    els.iwWinnersTbody.innerHTML = `<tr><td colspan="6" class="empty">Loading…</td></tr>`;
  }
  if (els.iwKpiConfigured) els.iwKpiConfigured.textContent = "—";
  if (els.iwKpiClaimed) els.iwKpiClaimed.textContent = "—";
  if (els.iwKpiTotalWon) els.iwKpiTotalWon.textContent = "—";
  els.instantDetailsDlg?.showModal();
  await loadIwReport();
}

async function loadIwReport() {
  const competitionId = state.iwSelectedCompetitionId;
  if (!competitionId) return;
  try {
    const data = await apiFetch(
      `${INSTANT_WINS_API_BASE}/admin/competition/${encodeURIComponent(
        competitionId
      )}/report`
    );

    const k = data?.kpis || {};
    if (els.iwKpiConfigured)
      els.iwKpiConfigured.textContent = String(k.configured_prizes ?? "0");
    if (els.iwKpiClaimed)
      els.iwKpiClaimed.textContent = String(k.claimed_wins ?? "0");
    if (els.iwKpiTotalWon)
      els.iwKpiTotalWon.textContent = fmtGBP2(k.total_amount_won);

    // Configured prizes table
    if (els.iwConfiguredTbody) {
      const rows = data?.configured_prizes || [];
      els.iwConfiguredTbody.innerHTML = "";
      if (!rows.length) {
        els.iwConfiguredTbody.innerHTML = `<tr><td colspan="7" class="empty">No configured prizes.</td></tr>`;
      } else {
        for (const r of rows) {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${String(r.prize_name || "—")}</td>
            <td class="num">${fmtGBP2(r.prize_value)}</td>
            <td>${String(r.prize_type || "—")}</td>
            <td>${String(r.ticket_numbers || "—")}</td>
            <td class="num">${Number(r.max_claims || 0)}</td>
            <td class="num">${Number(r.current_claims || 0)}</td>
            <td>${String(r.status || "—")}</td>
          `;
          els.iwConfiguredTbody.appendChild(tr);
        }
      }
    }

    // Winners table
    if (els.iwWinnersTbody) {
      const winners = data?.winners || [];
      els.iwWinnersTbody.innerHTML = "";
      if (!winners.length) {
        els.iwWinnersTbody.innerHTML = `<tr><td colspan="6" class="empty">No winners yet.</td></tr>`;
      } else {
        for (const w of winners) {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${String(w.ticket_number || "—")}</td>
            <td>${String(w.winner || "—")}</td>
            <td>${String(w.email || "—")}</td>
            <td>${String(w.prize || "—")}</td>
            <td class="num">${fmtGBP2(w.amount)}</td>
            <td>${fmtDate(w.date_won)}</td>
          `;
          els.iwWinnersTbody.appendChild(tr);
        }
      }
    }
  } catch (e) {
    if (els.iwConfiguredTbody) {
      els.iwConfiguredTbody.innerHTML = `<tr><td colspan="7" class="empty">Failed to load.</td></tr>`;
    }
    if (els.iwWinnersTbody) {
      els.iwWinnersTbody.innerHTML = `<tr><td colspan="6" class="empty">Failed to load.</td></tr>`;
    }
  }
}

async function openInstantAnalytics() {
  if (!window.Chart) {
    setIwStatus("Chart.js not loaded.");
    return;
  }
  els.instantAnalyticsDlg?.showModal();
  await loadInstantAnalytics();
}

function destroyIwCharts() {
  for (const k of ["entries", "top", "stats"]) {
    const ch = state.iwCharts?.[k];
    if (ch && typeof ch.destroy === "function") ch.destroy();
    state.iwCharts[k] = null;
  }
}

function chartTheme() {
  return {
    text: "rgba(233,230,255,0.86)",
    grid: "rgba(233,230,255,0.12)",
    aqua: "rgba(57,247,255,0.95)",
    pink: "rgba(255,43,214,0.9)",
    gold: "rgba(255,176,0,0.9)",
  };
}

async function loadInstantAnalytics() {
  try {
    const data = await apiFetch(
      `${INSTANT_WINS_API_BASE}/admin/analytics?days=7&month_only=true`
    );
    const theme = chartTheme();
    destroyIwCharts();

    // Entries over time
    const entries = data?.entries_over_time || [];
    const labels1 = entries.map((r) => {
      const d = new Date(r.day);
      return d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
    });
    const vals1 = entries.map((r) => Number(r.entries || 0));

    if (els.iwChartEntries) {
      state.iwCharts.entries = new Chart(els.iwChartEntries.getContext("2d"), {
        type: "line",
        data: {
          labels: labels1,
          datasets: [
            {
              label: "Entries",
              data: vals1,
              borderColor: theme.aqua,
              backgroundColor: "rgba(57,247,255,0.15)",
              tension: 0.35,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: theme.text } },
          },
          scales: {
            x: { ticks: { color: theme.text }, grid: { color: theme.grid } },
            y: { ticks: { color: theme.text }, grid: { color: theme.grid } },
          },
        },
      });
    }

    // Top competitions
    const top = data?.top_competitions || [];
    const labels2 = top.map((r) => (r.competition_title || "—").slice(0, 14));
    const vals2 = top.map((r) => Number(r.entries || 0));
    if (els.iwChartTop) {
      state.iwCharts.top = new Chart(els.iwChartTop.getContext("2d"), {
        type: "bar",
        data: {
          labels: labels2,
          datasets: [
            {
              label: "Entries",
              data: vals2,
              backgroundColor: theme.pink,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { labels: { color: theme.text } } },
          scales: {
            x: { ticks: { color: theme.text }, grid: { color: theme.grid } },
            y: { ticks: { color: theme.text }, grid: { color: theme.grid } },
          },
        },
      });
    }

    // Donut stats
    const stats = data?.instant_win_statistics || [];
    const labels3 = stats.map((r) => String(r.label || "UNKNOWN"));
    const vals3 = stats.map((r) => Number(r.count || 0));
    if (els.iwChartStats) {
      const colors = [
        theme.aqua,
        theme.pink,
        theme.gold,
        "rgba(70,255,154,0.9)",
        "rgba(170,160,255,0.9)",
      ];
      state.iwCharts.stats = new Chart(els.iwChartStats.getContext("2d"), {
        type: "doughnut",
        data: {
          labels: labels3,
          datasets: [
            {
              data: vals3,
              backgroundColor: labels3.map((_, i) => colors[i % colors.length]),
              borderColor: "rgba(0,0,0,0)",
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { labels: { color: theme.text } } },
        },
      });
    }
  } catch (e) {
    setIwStatus(e?.data?.message || e?.message || "Failed to load analytics");
  }
}

// Events
els.btnApply.addEventListener("click", applyFromUI);
els.btnReset.addEventListener("click", () => {
  resetUI();
  applyFromUI();
});
els.prev.addEventListener("click", () => {
  state.page = Math.max(1, state.page - 1);
  loadList();
});
els.next.addEventListener("click", () => {
  const totalPages = Math.max(
    1,
    Math.ceil((state.total || 0) / state.per_page)
  );
  state.page = Math.min(totalPages, state.page + 1);
  loadList();
});
els.btnExportWinners.addEventListener("click", exportCSV);
els.btnToken.addEventListener("click", openTokenDialog);
els.btnSaveToken.addEventListener("click", () => {
  setToken(els.tokenInput.value);
  els.tokenDlg.close();
  loadStats();
  applyFromUI();
});
els.btnClearToken.addEventListener("click", () => {
  setToken("");
  els.tokenInput.value = "";
  setStatus("Token cleared.");
  setTimeout(() => setStatus(""), 1200);
});

let searchTimer = null;
els.q.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applyFromUI(), 350);
});

els.tabWinners.addEventListener("click", () => {
  setActiveTab("winners");
});
els.tabLeaderboards.addEventListener("click", () => {
  setActiveTab("leaderboards");
  loadGames();
});

els.tabVouchers?.addEventListener("click", () => {
  setActiveTab("vouchers");
  resetVoucherForm();
  loadVouchers();
});

els.tabInstantWins?.addEventListener("click", () => {
  setActiveTab("instant");
  state.iwPage = 1;
  loadInstantReports();
});

els.periodDaily.addEventListener("click", () => {
  setPeriod("DAILY");
  loadLeaderboard();
});
els.periodWeekly.addEventListener("click", () => {
  setPeriod("WEEKLY");
  loadLeaderboard();
});
els.periodMonthly.addEventListener("click", () => {
  setPeriod("MONTHLY");
  loadLeaderboard();
});
els.periodAll.addEventListener("click", () => {
  setPeriod("ALL");
  loadLeaderboard();
});

els.btnRefreshLb.addEventListener("click", () => {
  loadLeaderboard();
});
els.btnExportLb.addEventListener("click", () => {
  exportLeaderboardCSV();
});
els.btnTop100.addEventListener("click", () => {
  state.lbLimit = 100;
  loadLeaderboard();
});

els.autoRefresh.addEventListener("change", (e) => {
  setupAutoRefresh(Boolean(e.target.checked));
});

// Instant Wins
els.btnExportInstantAll?.addEventListener("click", () => {
  exportInstantAll();
});
els.btnInstantAnalytics?.addEventListener("click", () => {
  openInstantAnalytics();
});

let iwSearchTimer = null;
els.iwQ?.addEventListener("input", () => {
  clearTimeout(iwSearchTimer);
  iwSearchTimer = setTimeout(() => {
    state.iwPage = 1;
    loadInstantReports();
  }, 350);
});
els.iwStatusFilter?.addEventListener("change", () => {
  state.iwPage = 1;
  loadInstantReports();
});
els.btnIwRefresh?.addEventListener("click", () => {
  loadInstantReports();
});
els.iwPrev?.addEventListener("click", () => {
  state.iwPage = Math.max(1, state.iwPage - 1);
  loadInstantReports();
});
els.iwNext?.addEventListener("click", () => {
  state.iwPage = state.iwPage + 1;
  loadInstantReports();
});

els.btnIwExport?.addEventListener("click", () => {
  if (!state.iwSelectedCompetitionId) return;
  exportInstantCompetition(
    state.iwSelectedCompetitionId,
    state.iwSelectedCompetitionTitle
  );
});

// Voucher form
els.vType?.addEventListener("change", () => syncVoucherFormForType());
els.btnVoucherCancel?.addEventListener("click", () => {
  resetVoucherForm();
  setVStatus("");
});
els.voucherForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await createVoucherFromForm();
  } catch (err) {
    if (err?.code === 401 || err?.code === 403) {
      setVStatus("Unauthorized — set an admin token.");
    } else {
      setVStatus(
        err?.data?.message || err?.message || "Failed to create voucher"
      );
    }
  }
});

let vSearchTimer = null;
els.vQ?.addEventListener("input", () => {
  clearTimeout(vSearchTimer);
  vSearchTimer = setTimeout(() => {
    state.vPage = 1;
    loadVouchers();
  }, 350);
});
els.vActive?.addEventListener("change", () => {
  state.vPage = 1;
  loadVouchers();
});
els.vPerPage?.addEventListener("change", () => {
  state.vPage = 1;
  loadVouchers();
});
els.btnVRefresh?.addEventListener("click", () => {
  loadVouchers();
});
els.vPrev?.addEventListener("click", () => {
  state.vPage = Math.max(1, state.vPage - 1);
  loadVouchers();
});
els.vNext?.addEventListener("click", () => {
  state.vPage = state.vPage + 1;
  loadVouchers();
});

// Boot
(function init() {
  resetUI();
  loadStats();
  applyFromUI();

  setActiveTab("winners");
  setPeriod("DAILY");
  setupAutoRefresh(false);
})();
