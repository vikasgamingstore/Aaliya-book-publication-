// ============================================================
// Global Search + Data Manager
// Advanced search, filters, pagination, bulk actions, exports
// ============================================================

const PAGE_SIZE = 25;

let dmModule = "projects";
let dmRows = [];          // full filtered result set
let dmPage = 1;
let dmSelected = new Set();
let dmFilters = {};
let savedFiltersCache = [];

function dTitle(s) { return (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function dDate(d) { return d ? new Date(d).toLocaleDateString("en-IN") : "—"; }
function dMoney(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }

// ============================================================
// GLOBAL SEARCH
// ============================================================
const SEARCH_GROUP_LABELS = {
  customer: "Customers", registration: "Registrations",
  invoice: "Invoices & Receipts", payment: "Payments", courier: "Courier",
};

async function runGlobalSearch() {
  const q = document.getElementById("global-search-input").value.trim();
  const box = document.getElementById("global-search-results");

  if (q.length < 2) {
    box.style.display = "none";
    return;
  }

  box.style.display = "block";
  box.innerHTML = '<div class="search-empty">Searching...</div>';

  const { data, error } = await supabaseClient.rpc("global_search", { q: q, max_results: 40 });

  if (error) {
    box.innerHTML = `<div class="search-empty">${error.message}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    box.innerHTML = `<div class="search-empty">"${q}" ke liye koi record nahi mila.</div>`;
    return;
  }

  // Group by result type
  const groups = {};
  data.forEach(r => {
    if (!groups[r.result_type]) groups[r.result_type] = [];
    groups[r.result_type].push(r);
  });

  box.innerHTML = Object.entries(groups).map(([type, rows]) => `
    <div class="search-group-title">${SEARCH_GROUP_LABELS[type] || dTitle(type)} (${rows.length})</div>
    ${rows.map(r => `
      <div class="search-result" onclick="openSearchResult('${type}', '${r.record_id}')">
        <div class="search-result-main">
          <strong>${r.title}</strong>
          <span>${r.subtitle || ""}${r.detail ? " · " + r.detail : ""}</span>
        </div>
        <span class="search-match">${r.matched_on}</span>
      </div>`).join("")}
  `).join("");
}

function openSearchResult(type, id) {
  document.getElementById("global-search-results").style.display = "none";

  if (type === "customer") {
    switchAdminTab("datamanager");
    showCustomerProfile(id);
  } else {
    // registration / invoice / payment / courier all point at a registration
    switchAdminTab("registrations");
    if (typeof openRegDetail === "function") openRegDetail(id);
  }
}

function switchAdminTab(tabName) {
  document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".admin-panel-section").forEach(s => s.classList.remove("active"));
  document.querySelector(`.admin-tab[data-tab="${tabName}"]`)?.classList.add("active");
  document.getElementById("tab-" + tabName)?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
// DATA MANAGER — filter definitions per module
// ============================================================
const MODULE_FILTERS = {
  customers: [
    { key: "search", label: "Name / Mobile / ID", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "account_status", label: "Account", type: "select", options: [["", "All"], ["active", "Active"], ["blocked", "Blocked"]] },
    { key: "from", label: "Registered From", type: "date" },
    { key: "to", label: "Registered To", type: "date" },
  ],
  projects: [
    { key: "search", label: "Customer / Registration ID", type: "text" },
    { key: "project_id", label: "Project", type: "select", options: [["", "All Projects"]] },
    { key: "project_status", label: "Project Status", type: "select", options: [
      ["", "All"], ["registered", "Registration Completed"], ["materials_sent", "Parcel Dispatched"],
      ["in_progress", "In Progress"], ["submitted_for_pickup", "Submitted"],
      ["picked_up", "Picked Up"], ["under_quality_check", "Quality Check"],
      ["rework_needed", "Correction Required"], ["completed", "Completed"], ["cancelled", "Cancelled"],
    ]},
    { key: "overdue", label: "Overdue Only", type: "select", options: [["", "No"], ["yes", "Yes"]] },
    { key: "from", label: "Start Date From", type: "date" },
    { key: "to", label: "Deadline Before", type: "date" },
  ],
  payments: [
    { key: "search", label: "Customer / Invoice / UTR", type: "text" },
    { key: "payment_status", label: "Payment Status", type: "select", options: [
      ["", "All"], ["pending", "Pending"], ["under_verification", "Under Verification"],
      ["approved", "Approved"], ["rejected", "Rejected"],
    ]},
    { key: "payment_type", label: "Payment Type", type: "select", options: [
      ["", "All"], ["registration", "Registration Fee"], ["advance", "Advance (50%)"], ["final", "Final (50%)"],
    ]},
    { key: "from", label: "From Date", type: "date" },
    { key: "to", label: "To Date", type: "date" },
  ],
  courier: [
    { key: "search", label: "Tracking / Customer / Mobile", type: "text" },
    { key: "courier_company", label: "Courier Company", type: "text" },
    { key: "courier_status", label: "Delivery Status", type: "select", options: [
      ["", "All"], ["parcel_preparing", "Preparing"], ["parcel_ready", "Prepared"],
      ["dispatched", "Dispatched"], ["in_transit", "In Transit"],
      ["out_for_delivery", "Out For Delivery"], ["delivered", "Delivered"],
    ]},
    { key: "pickup_status", label: "Pickup Status", type: "select", options: [
      ["", "All"], ["requested", "Pickup Pending"], ["courier_assigned", "Courier Assigned"],
      ["pickup_scheduled", "Scheduled"], ["picked_up", "Picked Up"], ["received_at_company", "Received"],
    ]},
    { key: "from", label: "Dispatch From", type: "date" },
    { key: "to", label: "Dispatch To", type: "date" },
  ],
  invoices: [
    { key: "search", label: "Invoice No. / Customer / Project", type: "text" },
    { key: "from", label: "From Date", type: "date" },
    { key: "to", label: "To Date", type: "date" },
  ],
};

const MODULE_TITLES = {
  customers: "Customers", projects: "Projects / Registrations",
  payments: "Payments", courier: "Courier Records", invoices: "Invoices",
};

function renderFilterBar() {
  const bar = document.getElementById("dm-filters");
  const defs = MODULE_FILTERS[dmModule] || [];

  bar.innerHTML = defs.map(f => {
    if (f.type === "select") {
      return `<div class="field" style="margin-bottom:0;min-width:160px">
        <label>${f.label}</label>
        <select data-filter="${f.key}">
          ${(f.options || []).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
        </select>
      </div>`;
    }
    return `<div class="field" style="margin-bottom:0;min-width:160px">
      <label>${f.label}</label>
      <input type="${f.type}" data-filter="${f.key}" placeholder="${f.type === "text" ? "Type to search..." : ""}">
    </div>`;
  }).join("") + `
    <button class="btn btn-primary btn-sm" id="dm-apply">Apply Filters</button>
    <button class="btn btn-outline btn-sm" id="dm-reset">Reset</button>`;

  // Populate the project dropdown for the projects module
  if (dmModule === "projects") populateProjectFilter();

  bar.querySelectorAll("[data-filter]").forEach(el => {
    el.addEventListener("keyup", e => { if (e.key === "Enter") applyDmFilters(); });
  });
  document.getElementById("dm-apply")?.addEventListener("click", applyDmFilters);
  document.getElementById("dm-reset")?.addEventListener("click", () => {
    bar.querySelectorAll("[data-filter]").forEach(el => { el.value = ""; });
    applyDmFilters();
  });
}

async function populateProjectFilter() {
  const select = document.querySelector('[data-filter="project_id"]');
  if (!select) return;
  const { data } = await supabaseClient.from("projects").select("id, project_name").order("project_name");
  (data || []).forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.project_name;
    select.appendChild(opt);
  });
}

function collectFilters() {
  const f = {};
  document.querySelectorAll("#dm-filters [data-filter]").forEach(el => {
    if (el.value) f[el.dataset.filter] = el.value;
  });
  return f;
}

function applyDmFilters() {
  dmFilters = collectFilters();
  dmPage = 1;
  dmSelected.clear();
  loadDmData();
}

// ============================================================
// Data loading per module
// ============================================================
async function loadDmData() {
  const tbody = document.getElementById("dm-tbody");
  tbody.innerHTML = `<tr><td colspan="9">Loading...</td></tr>`;

  if (dmModule === "customers") await loadCustomersModule();
  else await loadRegistrationsModule();

  renderDmTable();
}

async function loadCustomersModule() {
  let query = supabaseClient.from("profiles").select("*").eq("is_admin", false);

  if (dmFilters.state) query = query.ilike("state", `%${dmFilters.state}%`);
  if (dmFilters.account_status === "active") query = query.eq("is_blocked", false);
  if (dmFilters.account_status === "blocked") query = query.eq("is_blocked", true);
  if (dmFilters.from) query = query.gte("created_at", dmFilters.from);
  if (dmFilters.to) query = query.lte("created_at", dmFilters.to + "T23:59:59");

  const { data } = await query.order("created_at", { ascending: false }).limit(2000);
  let rows = data || [];

  if (dmFilters.search) {
    const s = dmFilters.search.toLowerCase();
    rows = rows.filter(c =>
      (c.full_name || "").toLowerCase().includes(s) ||
      (c.mobile || "").toLowerCase().includes(s) ||
      (c.customer_id || "").toLowerCase().includes(s)
    );
  }

  // attach registration counts
  const { data: regs } = await supabaseClient.from("registrations").select("customer_id, project_status");
  const counts = {};
  (regs || []).forEach(r => {
    if (!counts[r.customer_id]) counts[r.customer_id] = { total: 0, active: 0 };
    counts[r.customer_id].total++;
    if (!["completed", "cancelled"].includes(r.project_status)) counts[r.customer_id].active++;
  });
  dmRows = rows.map(c => ({ ...c, _counts: counts[c.id] || { total: 0, active: 0 } }));
}

async function loadRegistrationsModule() {
  let query = supabaseClient
    .from("registrations")
    .select("*, profiles(full_name, customer_id, mobile, state), projects(project_name, registration_fee, advance_payment, final_payment)");

  if (dmModule === "projects") {
    if (dmFilters.project_status) query = query.eq("project_status", dmFilters.project_status);
    if (dmFilters.project_id) query = query.eq("project_id", dmFilters.project_id);
    if (dmFilters.from) query = query.gte("project_started_at", dmFilters.from);
    if (dmFilters.to) query = query.lte("deadline", dmFilters.to);
  }
  if (dmModule === "payments") {
    if (dmFilters.payment_status) query = query.eq("registration_payment_status", dmFilters.payment_status);
    if (dmFilters.from) query = query.gte("created_at", dmFilters.from);
    if (dmFilters.to) query = query.lte("created_at", dmFilters.to + "T23:59:59");
  }
  if (dmModule === "courier") {
    if (dmFilters.courier_status) query = query.eq("courier_out_status", dmFilters.courier_status);
    if (dmFilters.pickup_status) query = query.eq("pickup_status", dmFilters.pickup_status);
    if (dmFilters.courier_company) query = query.ilike("courier_company_name", `%${dmFilters.courier_company}%`);
    if (dmFilters.from) query = query.gte("dispatch_date", dmFilters.from);
    if (dmFilters.to) query = query.lte("dispatch_date", dmFilters.to);
  }
  if (dmModule === "invoices") {
    query = query.not("invoice_number", "is", null);
    if (dmFilters.from) query = query.gte("created_at", dmFilters.from);
    if (dmFilters.to) query = query.lte("created_at", dmFilters.to + "T23:59:59");
  }

  const { data } = await query.order("created_at", { ascending: false }).limit(2000);
  let rows = data || [];

  // Free-text search across the useful identifier fields
  if (dmFilters.search) {
    const s = dmFilters.search.toLowerCase();
    rows = rows.filter(r =>
      (r.profiles?.full_name || "").toLowerCase().includes(s) ||
      (r.profiles?.mobile || "").toLowerCase().includes(s) ||
      (r.profiles?.customer_id || "").toLowerCase().includes(s) ||
      (r.registration_number || "").toLowerCase().includes(s) ||
      (r.invoice_number || "").toLowerCase().includes(s) ||
      (r.receipt_number || "").toLowerCase().includes(s) ||
      (r.registration_utr || "").toLowerCase().includes(s) ||
      (r.advance_utr || "").toLowerCase().includes(s) ||
      (r.final_utr || "").toLowerCase().includes(s) ||
      (r.courier_out_tracking || "").toLowerCase().includes(s) ||
      (r.pickup_tracking || "").toLowerCase().includes(s) ||
      (r.projects?.project_name || "").toLowerCase().includes(s)
    );
  }

  if (dmFilters.overdue === "yes") {
    rows = rows.filter(r => r.deadline && new Date(r.deadline) < new Date() && r.project_status !== "completed");
  }

  if (dmModule === "payments" && dmFilters.payment_type) {
    if (dmFilters.payment_type === "advance") rows = rows.filter(r => r.advance_status === "approved" || r.status === "approved");
    if (dmFilters.payment_type === "final") rows = rows.filter(r => r.final_status === "approved" || r.quality_status === "approved");
  }

  dmRows = rows;
}

// ============================================================
// Table rendering + pagination
// ============================================================
const MODULE_COLUMNS = {
  customers: ["Customer ID", "Name", "Mobile", "State", "Registered", "Projects", "Account"],
  projects: ["Registration ID", "Customer", "Project", "Start", "Deadline", "Progress", "Status"],
  payments: ["Customer", "Project", "Invoice / Receipt", "Reg. Fee", "Advance", "Final"],
  courier: ["Customer", "Tracking No.", "Courier", "Dispatch", "Delivery", "Pickup"],
  invoices: ["Invoice No.", "Receipt No.", "Customer", "Project", "Amount", "Date"],
};

function dmRowCells(r) {
  if (dmModule === "customers") {
    return [
      r.customer_id || "—", r.full_name || "—", r.mobile || "—",
      r.state || "—", dDate(r.created_at),
      `${r._counts.total} (${r._counts.active} active)`,
      `<span class="status-badge ${r.is_blocked ? "status-rejected" : "status-approved"}">${r.is_blocked ? "Blocked" : "Active"}</span>`,
    ];
  }
  if (dmModule === "projects") {
    const overdue = r.deadline && new Date(r.deadline) < new Date() && r.project_status !== "completed";
    return [
      r.registration_number || "—",
      `${r.profiles?.full_name || "—"}<br><small>${r.profiles?.customer_id || ""}</small>`,
      r.projects?.project_name || "—",
      dDate(r.project_started_at),
      dDate(r.deadline) + (overdue ? ' <span class="status-badge status-rejected">Overdue</span>' : ""),
      (r.progress_percent || 0) + "%",
      `<span class="status-badge status-${r.project_status}">${dTitle(r.project_status)}</span>`,
    ];
  }
  if (dmModule === "payments") {
    return [
      r.profiles?.full_name || "—", r.projects?.project_name || "—",
      `${r.invoice_number || "—"}<br><small>${r.receipt_number || ""}</small>`,
      `<span class="status-badge status-${r.registration_payment_status || "pending"}">${dTitle(r.registration_payment_status || "pending")}</span><br><small>${dMoney(r.projects?.registration_fee)}</small>`,
      `<span class="status-badge status-${r.advance_status}">${dTitle(r.advance_status)}</span><br><small>${dMoney(r.projects?.advance_payment)}</small>`,
      `<span class="status-badge status-${r.final_status}">${dTitle(r.final_status)}</span><br><small>${dMoney(r.projects?.final_payment)}</small>`,
    ];
  }
  if (dmModule === "courier") {
    return [
      `${r.profiles?.full_name || "—"}<br><small>${r.profiles?.mobile || ""}</small>`,
      `${r.courier_out_tracking || "—"}<br><small>${r.pickup_tracking || ""}</small>`,
      r.courier_company_name || "—", dDate(r.dispatch_date),
      `<span class="status-badge status-${r.courier_out_status}">${dTitle(r.courier_out_status)}</span>`,
      `<span class="status-badge status-${r.pickup_status}">${dTitle(r.pickup_status)}</span>`,
    ];
  }
  // invoices
  const total = Number(r.projects?.registration_fee || 0) + Number(r.projects?.advance_payment || 0) + Number(r.projects?.final_payment || 0);
  return [
    r.invoice_number || "—", r.receipt_number || "—",
    r.profiles?.full_name || "—", r.projects?.project_name || "—",
    dMoney(total), dDate(r.created_at),
  ];
}

function renderDmTable() {
  const thead = document.getElementById("dm-thead");
  const tbody = document.getElementById("dm-tbody");
  const cols = MODULE_COLUMNS[dmModule];

  document.getElementById("dm-title").textContent = MODULE_TITLES[dmModule];
  document.getElementById("dm-count").textContent =
    `${dmRows.length} records mile${dmRows.length > PAGE_SIZE ? ` — page ${dmPage} of ${Math.ceil(dmRows.length / PAGE_SIZE)}` : ""}`;

  thead.innerHTML = `<tr>
    <th style="width:34px"><input type="checkbox" class="row-check" id="dm-check-all"></th>
    ${cols.map(c => `<th>${c}</th>`).join("")}
    <th>Action</th>
  </tr>`;

  if (dmRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${cols.length + 2}">Koi record nahi mila. Filter badal kar dekhiye.</td></tr>`;
    document.getElementById("dm-pagination").innerHTML = "";
    updateBulkBar();
    return;
  }

  const start = (dmPage - 1) * PAGE_SIZE;
  const pageRows = dmRows.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageRows.map(r => `
    <tr>
      <td><input type="checkbox" class="row-check dm-row" data-id="${r.id}" ${dmSelected.has(r.id) ? "checked" : ""}></td>
      ${dmRowCells(r).map(c => `<td>${c}</td>`).join("")}
      <td>${dmModule === "customers"
        ? `<button class="btn btn-outline btn-sm" onclick="showCustomerProfile('${r.id}')">Profile</button>`
        : dmModule === "invoices"
          ? `<button class="btn btn-outline btn-sm" onclick='printInvoice(${JSON.stringify({ inv: r.invoice_number, reg: r.registration_number, name: r.profiles?.full_name, custId: r.profiles?.customer_id, project: r.projects?.project_name, reg_fee: r.projects?.registration_fee, adv: r.projects?.advance_payment, fin: r.projects?.final_payment, status: r.registration_payment_status, date: r.registration_payment_date })})'>View / Print</button>`
          : `<button class="btn btn-outline btn-sm" onclick="switchAdminTab('registrations'); openRegDetail('${r.id}')">Manage</button>`
      }</td>
    </tr>`).join("");

  // Wire checkboxes
  document.getElementById("dm-check-all").addEventListener("change", e => {
    pageRows.forEach(r => e.target.checked ? dmSelected.add(r.id) : dmSelected.delete(r.id));
    renderDmTable();
  });
  tbody.querySelectorAll(".dm-row").forEach(cb => {
    cb.addEventListener("change", () => {
      cb.checked ? dmSelected.add(cb.dataset.id) : dmSelected.delete(cb.dataset.id);
      updateBulkBar();
    });
  });

  renderPagination();
  updateBulkBar();
}

function renderPagination() {
  const box = document.getElementById("dm-pagination");
  const totalPages = Math.ceil(dmRows.length / PAGE_SIZE);
  if (totalPages <= 1) { box.innerHTML = ""; return; }

  let buttons = `<button class="page-btn" ${dmPage === 1 ? "disabled" : ""} onclick="goToPage(${dmPage - 1})">‹ Prev</button>`;

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - dmPage) <= 2) pages.push(i);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  pages.forEach(p => {
    buttons += p === "…"
      ? `<span class="page-btn" style="border:none;background:none">…</span>`
      : `<button class="page-btn ${p === dmPage ? "active" : ""}" onclick="goToPage(${p})">${p}</button>`;
  });

  buttons += `<button class="page-btn" ${dmPage === totalPages ? "disabled" : ""} onclick="goToPage(${dmPage + 1})">Next ›</button>`;
  box.innerHTML = buttons;
}

function goToPage(p) {
  dmPage = p;
  renderDmTable();
  document.getElementById("dm-title").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ============================================================
// Bulk actions
// ============================================================
function updateBulkBar() {
  const bar = document.getElementById("dm-bulk-bar");
  document.getElementById("dm-selected-count").textContent = dmSelected.size;
  bar.style.display = dmSelected.size ? "flex" : "none";
}

async function runBulkAction() {
  const action = document.getElementById("dm-bulk-action").value;
  if (!action || dmSelected.size === 0) return;

  const ids = Array.from(dmSelected);
  const selectedRows = dmRows.filter(r => dmSelected.has(r.id));

  if (action === "export") {
    exportRows(selectedRows, "csv", `${dmModule}-selected`);
    return;
  }

  if (action === "notify") {
    const message = prompt("Notification message likhiye:");
    if (!message) return;
    const customerIds = dmModule === "customers" ? ids : selectedRows.map(r => r.customer_id).filter(Boolean);
    const { data, error } = await supabaseClient.rpc("bulk_notify_customers", {
      customer_ids: customerIds, notif_type: "general", notif_message: message,
    });
    alert(error ? error.message : `${data} notifications bhej diye gaye.`);
    if (!error && typeof logActivity === "function") logActivity("Bulk notification sent", `${data} customers`);
    return;
  }

  if (action === "status") {
    if (dmModule === "customers") { alert("Status update sirf projects/payments/courier modules par kaam karta hai."); return; }
    const field = prompt("Kaunsa field update karna hai?\n\nproject_status / registration_payment_status / advance_status / final_status / courier_out_status / pickup_status / quality_status", "project_status");
    if (!field) return;
    const value = prompt(`"${field}" ki nayi value kya rakhein?`);
    if (!value) return;
    const { data, error } = await supabaseClient.rpc("bulk_update_registrations", {
      ids: ids, field_name: field.trim(), new_value: value.trim(),
    });
    alert(error ? error.message : `${data} records update ho gaye.`);
    if (!error) {
      if (typeof logActivity === "function") logActivity("Bulk status update", `${data} records: ${field} → ${value}`);
      dmSelected.clear();
      loadDmData();
    }
    return;
  }

  if (action === "assign") {
    const { data: staff } = await supabaseClient
      .from("profiles").select("id, full_name").eq("is_admin", true).eq("staff_status", "active");
    if (!staff || staff.length === 0) { alert("Koi active staff member nahi hai."); return; }

    const list = staff.map((s, i) => `${i + 1}. ${s.full_name || "Staff"}`).join("\n");
    const pick = prompt(`Kis staff ko assign karein?\n\n${list}\n\nNumber likhiye:`);
    const idx = parseInt(pick, 10) - 1;
    if (isNaN(idx) || !staff[idx]) return;

    const title = prompt("Task ka title likhiye:", "Review selected records");
    if (!title) return;

    const { data: { session } } = await supabaseClient.auth.getSession();
    const tasks = selectedRows.map(r => ({
      title: title,
      task_type: "general",
      assigned_to: staff[idx].id,
      assigned_by: session?.user?.id,
      registration_id: dmModule === "customers" ? null : r.id,
    }));

    const { error } = await supabaseClient.from("staff_tasks").insert(tasks);
    alert(error ? error.message : `${tasks.length} tasks assign ho gaye.`);
    if (!error && typeof logActivity === "function") logActivity("Bulk task assignment", `${tasks.length} tasks`);
  }
}

// ============================================================
// Customer 360 profile
// ============================================================
async function showCustomerProfile(id) {
  const box = document.getElementById("dm-detail-box");
  box.style.display = "block";
  box.innerHTML = "<p>Loading profile...</p>";

  const [{ data: c }, { data: regs }, { data: notifs }, { data: msgs }] = await Promise.all([
    supabaseClient.from("profiles").select("*").eq("id", id).single(),
    supabaseClient.from("registrations").select("*, projects(project_name, registration_fee, advance_payment, final_payment)").eq("customer_id", id).order("created_at", { ascending: false }),
    supabaseClient.from("notifications").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(15),
    supabaseClient.from("support_messages").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(15),
  ]);

  if (!c) { box.innerHTML = "<p>Customer nahi mila.</p>"; return; }

  const rows = regs || [];

  box.innerHTML = `
    <h3>${c.full_name || "Customer"} <span class="status-badge ${c.is_blocked ? "status-rejected" : "status-approved"}">${c.is_blocked ? "Blocked" : "Active"}</span></h3>

    <div class="fieldset-title">Personal Details</div>
    <div class="info-grid" style="margin-bottom:18px">
      <div><span>Customer ID</span><strong>${c.customer_id || "—"}</strong></div>
      <div><span>Mobile</span><strong>${c.mobile || "—"}</strong></div>
      <div><span>State / City</span><strong>${[c.city, c.state].filter(Boolean).join(", ") || "—"}</strong></div>
      <div><span>Registered On</span><strong>${dDate(c.created_at)}</strong></div>
      <div><span>Address</span><strong>${c.address || "—"}</strong></div>
      <div><span>Courier Address</span><strong>${c.courier_address || "—"}</strong></div>
      <div><span>Bank</span><strong>${c.bank_name || "—"} · ${c.bank_account_number ? "••••" + String(c.bank_account_number).slice(-4) : "—"}</strong></div>
      <div><span>IFSC</span><strong>${c.bank_ifsc || "—"}</strong></div>
    </div>

    <div class="fieldset-title">Project History (${rows.length})</div>
    <div class="table-wrap" style="margin-bottom:18px">
      <table class="data-table">
        <thead><tr><th>Registration ID</th><th>Project</th><th>Start</th><th>Deadline</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `
          <tr>
            <td>${r.registration_number || "—"}</td>
            <td>${r.projects?.project_name || "—"}</td>
            <td>${dDate(r.project_started_at)}</td>
            <td>${dDate(r.deadline)}</td>
            <td><span class="status-badge status-${r.project_status}">${dTitle(r.project_status)}</span></td>
            <td><button class="btn btn-outline btn-sm" onclick="switchAdminTab('registrations'); openRegDetail('${r.id}')">Manage</button></td>
          </tr>`).join("") : '<tr><td colspan="6">Koi project nahi</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="fieldset-title">Payment &amp; Invoice History</div>
    <div class="table-wrap" style="margin-bottom:18px">
      <table class="data-table">
        <thead><tr><th>Invoice</th><th>Receipt</th><th>Reg. Fee</th><th>Advance</th><th>Final</th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `
          <tr>
            <td>${r.invoice_number || "—"}</td>
            <td>${r.receipt_number || "—"}</td>
            <td><span class="status-badge status-${r.registration_payment_status || "pending"}">${dTitle(r.registration_payment_status || "pending")}</span> ${dMoney(r.projects?.registration_fee)}</td>
            <td><span class="status-badge status-${r.advance_status}">${dTitle(r.advance_status)}</span> ${dMoney(r.projects?.advance_payment)}</td>
            <td><span class="status-badge status-${r.final_status}">${dTitle(r.final_status)}</span> ${dMoney(r.projects?.final_payment)}</td>
          </tr>`).join("") : '<tr><td colspan="5">Koi payment record nahi</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="fieldset-title">Courier History</div>
    <div class="table-wrap" style="margin-bottom:18px">
      <table class="data-table">
        <thead><tr><th>Tracking</th><th>Courier</th><th>Dispatch</th><th>Delivery</th><th>Pickup</th></tr></thead>
        <tbody>${rows.filter(r => r.courier_out_tracking || r.pickup_tracking).length
          ? rows.filter(r => r.courier_out_tracking || r.pickup_tracking).map(r => `
          <tr>
            <td>${r.courier_out_tracking || "—"}${r.pickup_tracking ? `<br><small>Return: ${r.pickup_tracking}</small>` : ""}</td>
            <td>${r.courier_company_name || "—"}</td>
            <td>${dDate(r.dispatch_date)}</td>
            <td><span class="status-badge status-${r.courier_out_status}">${dTitle(r.courier_out_status)}</span></td>
            <td><span class="status-badge status-${r.pickup_status}">${dTitle(r.pickup_status)}</span></td>
          </tr>`).join("") : '<tr><td colspan="5">Koi courier record nahi</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="fieldset-title">Communication History</div>
    <div id="cust-comm-log" style="max-height:220px;overflow-y:auto;margin-bottom:10px"></div>
    <div class="form-grid" style="margin-bottom:6px">
      <div class="field">
        <label>Channel</label>
        <select id="comm-channel">
          <option value="whatsapp">WhatsApp</option>
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="in_person">In Person</option>
        </select>
      </div>
      <div class="field"><label>Note</label><input type="text" id="comm-note" placeholder="Baat cheet ka summary likhiye..."></div>
    </div>
    <button class="btn btn-outline btn-sm" onclick="addCommunicationLog('${c.id}', null)">Add Log</button>

    <div style="max-height:260px;overflow-y:auto;margin-top:14px">
      ${(msgs || []).length ? (msgs || []).map(m => `
        <div class="notif-item read">
          <div class="notif-dot"></div>
          <div class="notif-body">
            <span class="notif-time">Enquiry · ${new Date(m.created_at).toLocaleString("en-IN")}</span>
            <p>${m.message}</p>
            ${m.admin_reply ? `<p style="color:var(--green-ok)"><strong>Reply:</strong> ${m.admin_reply}</p>` : ""}
          </div>
        </div>`).join("") : ""}
      ${(notifs || []).map(n => `
        <div class="notif-item read">
          <div class="notif-dot"></div>
          <div class="notif-body">
            <span class="notif-time">${dTitle(n.type)} · ${new Date(n.created_at).toLocaleString("en-IN")}</span>
            <p>${n.message}</p>
          </div>
        </div>`).join("")}
      ${!(msgs || []).length && !(notifs || []).length ? '<p class="field-hint">Koi communication record nahi.</p>' : ""}
    </div>

    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
      <a class="btn btn-brass btn-sm" target="_blank" href="https://wa.me/${(c.mobile || "").replace(/[^0-9]/g, "")}">WhatsApp Customer</a>
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('dm-detail-box').style.display='none'">Close</button>
    </div>`;

  box.scrollIntoView({ behavior: "smooth" });
  if (typeof loadCommunicationLog === "function") loadCommunicationLog(c.id, null);
}

// ============================================================
// Saved filters
// ============================================================
async function loadSavedFilters() {
  const { data } = await supabaseClient.from("saved_filters").select("*").order("name");
  savedFiltersCache = data || [];
  renderSavedFilterOptions();
}

function renderSavedFilterOptions() {
  const select = document.getElementById("dm-saved-filter");
  if (!select) return;
  const forModule = savedFiltersCache.filter(f => f.module === dmModule);
  select.innerHTML = '<option value="">— None —</option>' +
    forModule.map(f => `<option value="${f.id}">${f.name}${f.is_shared ? " (shared)" : ""}</option>`).join("");
}

function applySavedFilter() {
  const id = document.getElementById("dm-saved-filter").value;
  if (!id) return;
  const f = savedFiltersCache.find(x => x.id === id);
  if (!f) return;

  document.querySelectorAll("#dm-filters [data-filter]").forEach(el => { el.value = ""; });
  Object.entries(f.filter_json || {}).forEach(([k, v]) => {
    const el = document.querySelector(`#dm-filters [data-filter="${k}"]`);
    if (el) el.value = v;
  });
  applyDmFilters();
}

async function saveCurrentFilter() {
  const name = prompt("Is filter ka naam kya rakhein?");
  if (!name) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  const { error } = await supabaseClient.from("saved_filters").insert({
    owner_id: session.user.id,
    name: name.trim(),
    module: dmModule,
    filter_json: collectFilters(),
  });

  alert(error ? error.message : "Filter save ho gaya.");
  if (!error) loadSavedFilters();
}

// ============================================================
// Export
// ============================================================
function dmExport(format) {
  exportRows(dmRows, format, dmModule);
}

function exportRows(rows, format, name) {
  if (!rows || rows.length === 0) { alert("Export karne ke liye koi data nahi hai."); return; }

  const cols = MODULE_COLUMNS[dmModule];
  const stamp = new Date().toISOString().slice(0, 10);
  const title = `Aaliya Book Publication — ${MODULE_TITLES[dmModule]} (${rows.length} records)`;

  // Strip HTML from the rendered cells for a clean export
  const plain = rows.map(r => {
    const cells = dmRowCells(r).map(v => String(v).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
    const obj = {};
    cols.forEach((c, i) => { obj[c] = cells[i]; });
    return obj;
  });

  if (format === "csv") {
    const csv = [cols.join(","), ...plain.map(r => cols.map(c => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    dmDownload(csv, `${name}-${stamp}.csv`, "text/csv;charset=utf-8;");

  } else if (format === "excel") {
    const table = `<table border="1"><thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>${plain.map(r => `<tr>${cols.map(c => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    dmDownload(`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><h3>${title}</h3>${table}</body></html>`,
      `${name}-${stamp}.xls`, "application/vnd.ms-excel");

  } else if (format === "pdf") {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${title}</title>
      <style>
        body{font-family:Georgia,serif;padding:26px;color:#241F14}
        h2{font-size:17px;margin:0 0 4px} p.meta{font-size:11px;color:#6B6350;margin:0 0 16px}
        table{border-collapse:collapse;width:100%;font-size:10.5px}
        th{background:#1B2430;color:#FBF8EF;text-align:left;padding:6px 8px}
        td{padding:5px 8px;border-bottom:1px solid #ddd}
        tr:nth-child(even) td{background:#F8F5EC}
      </style></head><body>
      <h2>${title}</h2>
      <p class="meta">Generated ${new Date().toLocaleString("en-IN")}</p>
      <table><thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>${plain.map(r => `<tr>${cols.map(c => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>
      <script>window.onload=()=>window.print();<\/script></body></html>`);
    w.document.close();
  }

  if (typeof logActivity === "function") logActivity("Data exported", `${dmModule} (${format}, ${rows.length} rows)`);
}

function dmDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ============================================================
// Init
// ============================================================
function initDataManager() {
  // Global search
  const input = document.getElementById("global-search-input");
  let debounce;
  input?.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(runGlobalSearch, 350);
  });
  input?.addEventListener("keyup", e => { if (e.key === "Enter") runGlobalSearch(); });
  document.getElementById("global-search-btn")?.addEventListener("click", runGlobalSearch);
  document.getElementById("global-search-clear")?.addEventListener("click", () => {
    input.value = "";
    document.getElementById("global-search-results").style.display = "none";
  });

  // Data manager
  document.getElementById("dm-module")?.addEventListener("change", e => {
    dmModule = e.target.value;
    dmFilters = {};
    dmPage = 1;
    dmSelected.clear();
    renderFilterBar();
    renderSavedFilterOptions();
    loadDmData();
  });

  document.getElementById("dm-saved-filter")?.addEventListener("change", applySavedFilter);
  document.getElementById("dm-save-filter")?.addEventListener("click", saveCurrentFilter);
  document.getElementById("dm-bulk-run")?.addEventListener("click", runBulkAction);
  document.getElementById("dm-clear-selection")?.addEventListener("click", () => {
    dmSelected.clear();
    renderDmTable();
  });

  renderFilterBar();
  loadSavedFilters();
  loadDmData();
}
