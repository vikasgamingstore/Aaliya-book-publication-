// ============================================================
// Business Intelligence & Database Management
// ============================================================

let biPeriod = "monthly";
let biReportRows = [];
let biProjectRows = [];
let importRows = [];

const BI_COLORS = { navy: "#1B2430", brass: "#C9A24B", red: "#9B3A3E", green: "#2f6b3a", blue: "#1a5a9c", purple: "#6a2fa8", muted: "#6B6350", line: "rgba(36,31,20,0.14)" };

function biMoney(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }

// ------------------------------------------------------------
// Period business report
// ------------------------------------------------------------
async function loadBusinessReport() {
  const { data, error } = await supabaseClient.rpc("business_report", { period: biPeriod });
  const box = document.getElementById("bi-report-stats");
  if (!box) return;
  if (error) { box.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${error.message}</div>`; return; }

  biReportRows = data || [];
  const moneyMetrics = ["Registration Revenue", "Payouts Released"];

  box.innerHTML = biReportRows.map(r => `
    <div class="stat-card">
      <div class="stat-value">${moneyMetrics.includes(r.metric) ? biMoney(r.value) : Number(r.value).toLocaleString("en-IN")}</div>
      <div class="stat-label">${r.metric}</div>
    </div>`).join("");
}

function exportBusinessReport() {
  if (!biReportRows.length) { alert("Please let the report load first."); return; }
  const csv = ["Metric,Value,Detail",
    ...biReportRows.map(r => `"${r.metric}","${r.value}","${r.detail || ""}"`)].join("\n");
  biDownload(csv, `business-report-${biPeriod}-${new Date().toISOString().slice(0,10)}.csv`, "text/csv;charset=utf-8;");
}

// ------------------------------------------------------------
// Charts (reuse the SVG approach from reports.js)
// ------------------------------------------------------------
function biLineChart(containerId, labels, series, formatter) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const allValues = series.flatMap(s => s.values);
  const max = Math.max(...allValues, 1);
  const W = 320, H = 165, pad = 30;

  if (!labels.length || allValues.every(v => v === 0)) {
    container.innerHTML = '<div class="chart-empty">No data yet.</div>';
    return;
  }

  const xStep = labels.length > 1 ? (W - pad * 2) / (labels.length - 1) : 0;

  const paths = series.map(s => {
    const points = s.values.map((v, i) => {
      const x = pad + i * xStep;
      const y = H - pad - (v / max) * (H - pad * 2);
      return `${x},${y}`;
    }).join(" ");
    const dots = s.values.map((v, i) => {
      const x = pad + i * xStep;
      const y = H - pad - (v / max) * (H - pad * 2);
      return `<circle cx="${x}" cy="${y}" r="3" fill="${s.color}"><title>${labels[i]}: ${formatter(v)}</title></circle>`;
    }).join("");
    return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>${dots}`;
  }).join("");

  const xLabels = labels.map((l, i) =>
    `<text x="${pad + i * xStep}" y="${H - pad + 14}" text-anchor="middle" font-size="8.5" fill="${BI_COLORS.muted}" font-family="monospace">${l}</text>`
  ).join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img">
      <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="${BI_COLORS.line}"/>
      ${paths}${xLabels}
    </svg>
    <div class="chart-legend">
      ${series.map(s => `<span><i class="legend-dot" style="background:${s.color}"></i>${s.name}</span>`).join("")}
    </div>`;
}

function biBarBreakdown(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) { container.innerHTML = '<div class="chart-empty">No data yet.</div>'; return; }

  container.innerHTML = items.slice(0, 8).map(i => `
    <div class="bar-row">
      <div class="bar-row-top"><span>${i.label}</span><strong>${i.value}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${i.value / total * 100}%;background:${BI_COLORS.brass}"></div></div>
    </div>`).join("");
}

function shortMonth(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", { month: "short" });
}

async function loadBiCharts() {
  const [growthRes, metricsRes, locRes] = await Promise.all([
    supabaseClient.from("bi_customer_growth").select("*").limit(12),
    supabaseClient.from("bi_monthly_metrics").select("*").limit(12),
    supabaseClient.from("bi_location_distribution").select("*").limit(8),
  ]);

  const growth = growthRes.data || [];
  biLineChart("bi-chart-growth",
    growth.map(g => shortMonth(g.month)),
    [{ name: "Total Customers", color: BI_COLORS.brass, values: growth.map(g => Number(g.cumulative_customers)) }],
    v => v);

  const metrics = metricsRes.data || [];
  biLineChart("bi-chart-registrations",
    metrics.map(m => shortMonth(m.month)),
    [
      { name: "Registrations", color: BI_COLORS.blue, values: metrics.map(m => Number(m.registrations)) },
      { name: "Completed", color: BI_COLORS.green, values: metrics.map(m => Number(m.completed)) },
    ],
    v => v);

  biLineChart("bi-chart-revenue",
    metrics.map(m => shortMonth(m.month)),
    [
      { name: "Registration Revenue", color: BI_COLORS.green, values: metrics.map(m => Number(m.registration_revenue)) },
      { name: "Payouts", color: BI_COLORS.red, values: metrics.map(m => Number(m.advance_paid) + Number(m.final_paid)) },
    ],
    v => biMoney(v));

  biBarBreakdown("bi-chart-location",
    (locRes.data || []).map(l => ({ label: l.state, value: Number(l.customers) })));
}

// ------------------------------------------------------------
// Project performance
// ------------------------------------------------------------
async function loadBiProjectPerformance() {
  const { data } = await supabaseClient.from("bi_project_performance").select("*").order("total_registrations", { ascending: false });
  biProjectRows = data || [];
  const tbody = document.getElementById("bi-project-body");
  if (!tbody) return;

  if (biProjectRows.length === 0) { tbody.innerHTML = `<tr><td colspan="7">No project data yet.</td></tr>`; return; }

  tbody.innerHTML = biProjectRows.map(p => `
    <tr>
      <td>${p.project_name}</td>
      <td>${p.num_pages}</td>
      <td>${p.total_registrations}</td>
      <td>${p.completed}</td>
      <td>${p.in_progress}</td>
      <td><strong>${p.completion_rate}%</strong></td>
      <td>${p.avg_days_to_complete ?? "—"}</td>
    </tr>`).join("");
}

function exportBiTable() {
  if (!biProjectRows.length) { alert("There is no data to export."); return; }
  const cols = ["project_name","num_pages","total_registrations","completed","in_progress","completion_rate","avg_days_to_complete"];
  const csv = [cols.join(","), ...biProjectRows.map(r => cols.map(c => `"${r[c] ?? ""}"`).join(","))].join("\n");
  biDownload(csv, `project-performance-${new Date().toISOString().slice(0,10)}.csv`, "text/csv;charset=utf-8;");
}

// ------------------------------------------------------------
// Snapshot + integrity
// ------------------------------------------------------------
async function loadDatabaseSnapshot() {
  const { data } = await supabaseClient.rpc("database_snapshot");
  const box = document.getElementById("bi-snapshot");
  if (!box) return;
  box.innerHTML = (data || []).map(r => `
    <div class="stat-card">
      <div class="stat-value">${Number(r.row_count).toLocaleString("en-IN")}</div>
      <div class="stat-label">${r.table_name.replace(/_/g, " ")}</div>
    </div>`).join("");
}

async function loadIntegrityCheck() {
  const { data } = await supabaseClient.rpc("data_integrity_check");
  const tbody = document.getElementById("bi-integrity-body");
  if (!tbody) return;

  tbody.innerHTML = (data || []).map(r => `
    <tr>
      <td>${r.issue}</td>
      <td>${r.count}</td>
      <td><span class="status-badge status-${Number(r.count) === 0 ? "approved" : "pending"}">${Number(r.count) === 0 ? "OK" : "Needs attention"}</span></td>
    </tr>`).join("") || `<tr><td colspan="3">The check could not run.</td></tr>`;
}

// ------------------------------------------------------------
// CSV import
// ------------------------------------------------------------
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    // handles simple quoted values
    const values = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || [];
    const row = {};
    headers.forEach((h, i) => {
      let v = (values[i] || "").replace(/,$/, "").trim().replace(/^"|"$/g, "").replace(/""/g, '"');
      row[h] = v;
    });
    return row;
  });
}

function handleImportFile(e) {
  const file = e.target.files[0];
  const preview = document.getElementById("import-preview");
  const btn = document.getElementById("run-import-btn");
  if (!file) { preview.innerHTML = ""; btn.disabled = true; return; }

  const reader = new FileReader();
  reader.onload = () => {
    importRows = parseCsv(reader.result);
    if (importRows.length === 0) {
      preview.innerHTML = '<p class="form-msg error">The CSV could not be read or is empty.</p>';
      btn.disabled = true;
      return;
    }
    const cols = Object.keys(importRows[0]);
    preview.innerHTML = `
      <p class="field-hint">${importRows.length} rows mile. Pehli 3 rows ka preview:</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>
          <tbody>${importRows.slice(0, 3).map(r => `<tr>${cols.map(c => `<td>${r[c] || ""}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>`;
    btn.disabled = false;
  };
  reader.readAsText(file);
}

async function runImport() {
  const type = document.getElementById("import-type").value;
  const msg = document.getElementById("import-msg");
  const fileName = document.getElementById("import-file").files[0]?.name || "import.csv";
  msg.textContent = "Import in progress..."; msg.className = "form-msg";

  if (!importRows.length) { msg.textContent = "Please choose a CSV file first."; msg.className = "form-msg error"; return; }
  if (!confirm(`${importRows.length} rows import karni hain?`)) { msg.textContent = ""; return; }

  const rpc = type === "projects" ? "import_projects" : "import_customer_updates";
  const { data, error } = await supabaseClient.rpc(rpc, { rows_json: importRows });

  if (error) { msg.textContent = error.message; msg.className = "form-msg error"; return; }

  const result = Array.isArray(data) ? data[0] : data;
  const ok = result?.imported ?? result?.updated ?? 0;
  const bad = result?.failed ?? result?.skipped ?? 0;

  msg.innerHTML = `${ok} rows successful, ${bad} skipped.` + (result?.errors ? `<br><small>${result.errors.replace(/\n/g, "<br>")}</small>` : "");
  msg.className = "form-msg " + (bad > 0 ? "error" : "ok");

  const { data: { session } } = await supabaseClient.auth.getSession();
  await supabaseClient.from("import_log").insert({
    import_type: type === "projects" ? "projects" : "customers",
    file_name: fileName,
    total_rows: importRows.length,
    success_rows: ok,
    failed_rows: bad,
    errors: result?.errors || null,
    imported_by: session?.user?.id,
  });

  if (typeof logActivity === "function") logActivity("Data imported", `${type}: ${ok} rows`);
  loadImportHistory();
  loadDatabaseSnapshot();
  if (type === "projects" && typeof loadProjectsTable === "function") loadProjectsTable();
}

async function loadImportHistory() {
  const { data } = await supabaseClient.from("import_log").select("*").order("created_at", { ascending: false }).limit(20);
  const tbody = document.getElementById("import-history-body");
  if (!tbody) return;
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No imports yet.</td></tr>`; return; }

  tbody.innerHTML = data.map(l => `
    <tr>
      <td>${new Date(l.created_at).toLocaleString("en-IN")}</td>
      <td>${l.import_type}</td>
      <td>${l.file_name || "—"}</td>
      <td>${l.success_rows}</td>
      <td>${l.failed_rows}</td>
    </tr>`).join("");
}

function downloadImportTemplate() {
  const type = document.getElementById("import-type").value;
  const csv = type === "projects"
    ? 'project_name,description,num_pages,duration_days,registration_fee,advance_payment,final_payment,instructions\n"Novel Writing 200","200 page novel handwriting",200,45,500,2500,2500,"Blue pen only"'
    : 'mobile,full_name,address,courier_address,state,city\n"9876543210","Test Customer","Full address here","Courier address here","Maharashtra","Pune"';
  biDownload(csv, `${type}-import-template.csv`, "text/csv;charset=utf-8;");
}

// ------------------------------------------------------------
// Backup
// ------------------------------------------------------------
async function loadBackupSettings() {
  const { data } = await supabaseClient.from("automation_settings")
    .select("auto_backup_enabled, backup_frequency, last_backup_at").eq("id", 1).single();
  const f = document.getElementById("backup-settings-form");
  if (!f || !data) return;
  f.auto_backup_enabled.checked = !!data.auto_backup_enabled;
  f.backup_frequency.value = data.backup_frequency || "weekly";

  const info = document.getElementById("last-backup-info");
  if (info) {
    info.textContent = data.last_backup_at
      ? "Last backup: " + new Date(data.last_backup_at).toLocaleString("en-IN")
      : "No backup has been taken yet.";
  }
}

async function handleBackupSettingsSave(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("backup-settings-msg");
  const { error } = await supabaseClient.from("automation_settings").update({
    auto_backup_enabled: f.auto_backup_enabled.checked,
    backup_frequency: f.backup_frequency.value,
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  msg.textContent = error ? error.message : "बैकअप सेटिंग्स सेव हो गईं।";
  msg.className = "form-msg " + (error ? "error" : "ok");
}

async function createFullBackup() {
  const msg = document.getElementById("backup-settings-msg");
  msg.textContent = "Creating backup..."; msg.className = "form-msg";

  const tables = ["profiles", "projects", "registrations", "documents", "notifications",
    "enquiries", "support_tickets", "ticket_replies", "communication_log", "testimonials",
    "feedback", "referrals", "rewards", "coupons", "campaigns", "banners",
    "newsletter_subscribers", "staff_tasks", "company_settings", "site_content",
    "faq_items", "help_articles", "chat_faqs", "onboarding_steps", "translations", "languages"];

  const backup = { generated_at: new Date().toISOString(), tables: {} };
  let total = 0;

  for (const t of tables) {
    try {
      const { data } = await supabaseClient.from(t).select("*");
      backup.tables[t] = data || [];
      total += (data || []).length;
    } catch (err) {
      backup.tables[t] = { error: err.message };
    }
  }

  const json = JSON.stringify(backup, null, 2);
  biDownload(json, `abp-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");

  const { data: { session } } = await supabaseClient.auth.getSession();
  await supabaseClient.from("backup_history").insert({
    created_by: session?.user?.id,
    backup_type: "manual",
    tables_included: tables.join(", "),
    record_count: total,
    note: "Full JSON export from BI tab",
  });
  await supabaseClient.from("automation_settings").update({ last_backup_at: new Date().toISOString() }).eq("id", 1);

  msg.textContent = `Backup download ho gaya — ${total} records, ${tables.length} tables.`;
  msg.className = "form-msg ok";
  if (typeof logActivity === "function") logActivity("Full backup created", `${total} records`);
  loadBackupSettings();
}

function biDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
function initBI() {
  document.querySelectorAll("[data-bi-period]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-bi-period]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      biPeriod = btn.dataset.biPeriod;
      loadBusinessReport();
    });
  });

  document.getElementById("import-file")?.addEventListener("change", handleImportFile);
  document.getElementById("run-import-btn")?.addEventListener("click", runImport);
  document.getElementById("backup-settings-form")?.addEventListener("submit", handleBackupSettingsSave);

  loadBusinessReport();
  loadBiCharts();
  loadBiProjectPerformance();
  loadDatabaseSnapshot();
  loadIntegrityCheck();
  loadImportHistory();
  loadBackupSettings();
}
