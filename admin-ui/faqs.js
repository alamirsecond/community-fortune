/* FAQ Management UI
 * Static shell; admin endpoints require Authorization: Bearer <token>
 */

const FAQ_API_BASE = "/api/faqs";
const TOKEN_KEY = "cf_admin_token";

const els = {
  tabHome: document.getElementById("tabHome"),
  tabSub: document.getElementById("tabSub"),
  metaTitle: document.getElementById("metaTitle"),
  metaSub: document.getElementById("metaSub"),
  status: document.getElementById("status"),
  list: document.getElementById("list"),

  btnCreate: document.getElementById("btnCreate"),
  btnAddBottom: document.getElementById("btnAddBottom"),
  btnToken: document.getElementById("btnToken"),

  tokenDlg: document.getElementById("tokenDlg"),
  tokenInput: document.getElementById("tokenInput"),
  btnSaveToken: document.getElementById("btnSaveToken"),
  btnClearToken: document.getElementById("btnClearToken"),

  editDlg: document.getElementById("editDlg"),
  editTitle: document.getElementById("editTitle"),
  editSub: document.getElementById("editSub"),
  editScope: document.getElementById("editScope"),
  editPublished: document.getElementById("editPublished"),
  editQuestion: document.getElementById("editQuestion"),
  editAnswer: document.getElementById("editAnswer"),
  btnSave: document.getElementById("btnSave"),
  btnDelete: document.getElementById("btnDelete"),
};

const state = {
  scope: "HOME",
  loading: false,
  rows: [],
  editingId: null,
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

function safeText(s) {
  const span = document.createElement("span");
  span.textContent = s ?? "";
  return span;
}

async function apiFetch(path, { method = "GET", headers = {}, body } = {}) {
  const token = getToken();
  const h = {
    Accept: "application/json",
    ...headers,
  };
  if (token) h.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers: h,
    body,
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = data?.message || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function setActiveTab(scope) {
  state.scope = scope;
  els.tabHome.classList.toggle("active", scope === "HOME");
  els.tabSub.classList.toggle("active", scope === "SUBSCRIPTION");

  if (scope === "HOME") {
    els.metaTitle.textContent = "Home Page FAQ";
    els.metaSub.textContent = "Questions shown on the homepage.";
  } else {
    els.metaTitle.textContent = "Subscription Page FAQ";
    els.metaSub.textContent = "Questions shown on the subscription page.";
  }
}

function render() {
  els.list.innerHTML = "";

  if (!state.rows.length) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.appendChild(safeText("No FAQs yet. Click ‘Create New FAQ’."));
    els.list.appendChild(empty);
    return;
  }

  state.rows.forEach((row, idx) => {
    const card = document.createElement("article");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "cardHead";

    const left = document.createElement("div");
    left.className = "cardTitle";

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = String(idx + 1);

    const title = document.createElement("div");
    title.className = "cardTitleTxt";
    title.textContent = `Question ${idx + 1}`;

    left.appendChild(badge);
    left.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "cardActions";

    const pill = document.createElement("span");
    pill.className = `pill ${row.is_published ? "on" : "off"}`;
    pill.textContent = row.is_published ? "Published" : "Hidden";

    const publishToggle = document.createElement("button");
    publishToggle.className = "btn smallBtn";
    publishToggle.type = "button";
    publishToggle.textContent = row.is_published ? "Unpublish" : "Publish";
    publishToggle.addEventListener("click", () => onTogglePublish(row));

    const reorder = document.createElement("div");
    reorder.className = "reorder";

    const up = document.createElement("button");
    up.className = "btn smallBtn";
    up.type = "button";
    up.textContent = "↑";
    up.disabled = idx === 0;
    up.addEventListener("click", () => onMove(idx, -1));

    const down = document.createElement("button");
    down.className = "btn smallBtn";
    down.type = "button";
    down.textContent = "↓";
    down.disabled = idx === state.rows.length - 1;
    down.addEventListener("click", () => onMove(idx, +1));

    reorder.appendChild(up);
    reorder.appendChild(down);

    const btnRemove = document.createElement("button");
    btnRemove.className = "btn btnDanger smallBtn";
    btnRemove.type = "button";
    btnRemove.textContent = "Remove";
    btnRemove.addEventListener("click", () => onRemove(row));

    const btnEdit = document.createElement("button");
    btnEdit.className = "btn smallBtn";
    btnEdit.type = "button";
    btnEdit.textContent = "Edit";
    btnEdit.addEventListener("click", () => openEdit(row));

    actions.appendChild(pill);
    actions.appendChild(publishToggle);
    actions.appendChild(reorder);
    actions.appendChild(btnRemove);
    actions.appendChild(btnEdit);

    head.appendChild(left);
    head.appendChild(actions);

    const qWrap = document.createElement("div");
    qWrap.className = "kv";
    const qLbl = document.createElement("div");
    qLbl.className = "kLbl";
    qLbl.textContent = "Question *";
    const q = document.createElement("input");
    q.className = "input";
    q.disabled = true;
    q.value = row.question || "";
    qWrap.appendChild(qLbl);
    qWrap.appendChild(q);

    const aWrap = document.createElement("div");
    aWrap.className = "kv";
    const aLbl = document.createElement("div");
    aLbl.className = "kLbl";
    aLbl.textContent = "Answer *";
    const a = document.createElement("textarea");
    a.className = "input";
    a.disabled = true;
    a.rows = 3;
    a.value = row.answer || "";
    aWrap.appendChild(aLbl);
    aWrap.appendChild(a);

    card.appendChild(head);
    card.appendChild(qWrap);
    card.appendChild(aWrap);

    els.list.appendChild(card);
  });
}

async function load() {
  if (state.loading) return;
  state.loading = true;
  setStatus("Loading…");

  try {
    const data = await apiFetch(
      `${FAQ_API_BASE}/admin?scope=${encodeURIComponent(state.scope)}`
    );
    state.rows = data?.data || [];
    setStatus(state.rows.length ? "" : "No FAQs found.");
    render();
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      setStatus("Unauthorized. Click Token and paste an admin JWT.");
    } else {
      setStatus(err.message || "Failed to load FAQs");
    }
    state.rows = [];
    render();
  } finally {
    state.loading = false;
  }
}

function resetEditForm() {
  state.editingId = null;
  els.editScope.value = state.scope;
  els.editPublished.checked = true;
  els.editQuestion.value = "";
  els.editAnswer.value = "";
  els.btnDelete.hidden = true;
}

function openCreate() {
  resetEditForm();
  els.editTitle.textContent = "Create FAQ";
  els.editSub.textContent = "Add a new FAQ item.";
  els.editDlg.showModal();
}

function openEdit(row) {
  state.editingId = row.id;
  els.editTitle.textContent = "Edit FAQ";
  els.editSub.textContent = `Editing ${row.scope} item.`;
  els.editScope.value = row.scope;
  els.editPublished.checked = Boolean(row.is_published);
  els.editQuestion.value = row.question || "";
  els.editAnswer.value = row.answer || "";
  els.btnDelete.hidden = false;
  els.editDlg.showModal();
}

async function saveEdit() {
  const scope = String(els.editScope.value || "").toUpperCase();
  const payload = {
    scope,
    question: String(els.editQuestion.value || "").trim(),
    answer: String(els.editAnswer.value || "").trim(),
    is_published: Boolean(els.editPublished.checked),
  };

  if (!payload.question) {
    setStatus("Question is required.");
    return;
  }
  if (!payload.answer) {
    setStatus("Answer is required.");
    return;
  }

  try {
    setStatus("Saving…");

    if (state.editingId) {
      await apiFetch(`${FAQ_API_BASE}/${state.editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch(`${FAQ_API_BASE}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    els.editDlg.close();

    // If scope changed, switch tab to show it immediately.
    setActiveTab(scope);
    await load();
    setStatus("Saved.");
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      setStatus("Unauthorized. Click Token and paste an admin JWT.");
      return;
    }
    const errors = err.data?.errors;
    if (Array.isArray(errors) && errors.length) {
      setStatus(errors.join(" | "));
    } else {
      setStatus(err.message || "Save failed");
    }
  }
}

async function onRemove(row) {
  const ok = confirm("Remove this FAQ? This cannot be undone.");
  if (!ok) return;

  try {
    setStatus("Deleting…");
    await apiFetch(`${FAQ_API_BASE}/${row.id}`, { method: "DELETE" });
    await load();
    setStatus("Deleted.");
  } catch (err) {
    setStatus(err.message || "Delete failed");
  }
}

async function deleteFromDialog() {
  if (!state.editingId) return;
  const ok = confirm("Delete this FAQ? This cannot be undone.");
  if (!ok) return;

  try {
    setStatus("Deleting…");
    await apiFetch(`${FAQ_API_BASE}/${state.editingId}`, { method: "DELETE" });
    els.editDlg.close();
    await load();
    setStatus("Deleted.");
  } catch (err) {
    setStatus(err.message || "Delete failed");
  }
}

async function onTogglePublish(row) {
  try {
    setStatus("Updating…");
    await apiFetch(`${FAQ_API_BASE}/${row.id}/publish`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_published: !row.is_published }),
    });
    await load();
    setStatus("");
  } catch (err) {
    setStatus(err.message || "Publish update failed");
  }
}

async function onMove(index, delta) {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= state.rows.length) return;

  const clone = state.rows.slice();
  const tmp = clone[index];
  clone[index] = clone[nextIndex];
  clone[nextIndex] = tmp;
  state.rows = clone;
  render();

  try {
    setStatus("Reordering…");
    await apiFetch(`${FAQ_API_BASE}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: state.scope,
        ids: state.rows.map((r) => r.id),
      }),
    });
    await load();
    setStatus("");
  } catch (err) {
    setStatus(err.message || "Reorder failed");
    await load();
  }
}

function openToken() {
  els.tokenInput.value = getToken();
  els.tokenDlg.showModal();
}

function saveToken() {
  setToken(els.tokenInput.value);
  els.tokenDlg.close();
  load();
}

function clearToken() {
  setToken("");
  els.tokenInput.value = "";
  setStatus("Token cleared.");
  load();
}

// Wire events
els.tabHome.addEventListener("click", () => {
  setActiveTab("HOME");
  load();
});
els.tabSub.addEventListener("click", () => {
  setActiveTab("SUBSCRIPTION");
  load();
});

els.btnCreate.addEventListener("click", openCreate);
els.btnAddBottom.addEventListener("click", openCreate);

els.btnToken.addEventListener("click", openToken);
els.btnSaveToken.addEventListener("click", saveToken);
els.btnClearToken.addEventListener("click", clearToken);

els.btnSave.addEventListener("click", saveEdit);
els.btnDelete.addEventListener("click", deleteFromDialog);

// Boot
setActiveTab("HOME");
load();
