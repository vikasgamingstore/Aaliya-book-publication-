// ============================================================
// Reports & Analytics — Aaliya Book Publication admin panel
// ============================================================

let reportData = { registrations: [], customers: [] };
let reportRange = { from: null, to: null, label: "This Month" };
let reportTables = {};   // cached rows per report, used by the export buttons

const COLORS = {
  navy: "#1B2430", brass: "#C9A24B", red: "#9B3A3E",
  green: "#2f6b3a", blue: "#1a5a9c", purple: "#6a2fa8",
  muted: "#6B6350", line: "rgba(36,31,20,0.14)",
};

function rMoney(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function rDate(d) { return d ? new Date(d).toLocaleDateString("en-IN") : "—"; }
function titleCase(s) { return (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

// ------------------------------------------------------------
// Date range handling
// ------------------------------------------------------------
function setPresetRange(preset) {
  const now = new Date();
  let from = null;
  let label = "All Time";

  if (preset === "today") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    label = "Today";
  } else if (preset === "week") {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // week starts Monday
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    label = "This Week";
  } else if (preset === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    label = "This Month";
  } else if (preset === "year") {
    from = new Date(now.getFullYear(), 0, 1);
    label = "This Year";
  }

  reportRange = { from, to: null, label };
  renderAllReports();
}

function applyCustomRange() {
  const fromVal = document.getElementById("report-from").value;
  const toVal = document.getElementById("report-to").value;
  if (!fromVal && !toVal) return;

  const from = fromVal ? new Date(fromVal) : null;
  const to = toVal ? new Date(toVal + "T23:59:59") : null;
  reportRange = { from, to, label: `${fromVal || "Start"} → ${toVal || "Today"}` };

  document.querySelectorAll("[data-range]").forEach(b => b.classList.remove("active"));
  renderAllReports();
}

function inRange(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (reportRange.from && d < reportRange.from) return false;
  if (reportRange.to && d > reportRange.to) return false;
  return true;
}

// ------------------------------------------------------------
// Data loading
// ------------------------------------------------------------
async function loadReportData() {
  const [regsRes, custRes] = await Promise.all([
    supabaseClient.from("registrations")
      .select("*, profiles(full_name, customer_id, mobile, created_at), projects(project_name, registration_fee, advance_payment, final_payment)")
      .order("created_at", { ascending: false }),
    supabaseClient.from("profiles").select("*").eq("is_admin", false).order("created_at", { ascending: false }),
  ]);

  reportData.registrations = regsRes.data || [];
  reportData.customers = custRes.data || [];
  renderAllReports();
}

function renderAllReports() {
  const label = document.getElementById("report-range-label");
  if (label) label.textContent = "Showing: " + reportRange.label;

  const regs = reportData.registrations.filter(r => !reportRange.from || inRange(r.created_at));
  const customers = reportData.customers.filter(c => !reportRange.from || inRange(c.created_at));

  renderBusinessStats(regs, customers);
  renderCharts();
  renderCustomerReport(customers);
  renderProjectReport(regs);
  renderPaymentReport(regs);
  renderCourierReport(regs);
  renderQualityReport(regs);
}

// ------------------------------------------------------------
// Business overview stats
// ------------------------------------------------------------
function renderBusinessStats(regs, customers) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const newThisMonth = reportData.customers.filter(c => new Date(c.created_at) >= monthStart).length;

  const active = regs.filter(r => ["materials_sent", "in_progress", "submitted_for_pickup", "picked_up", "under_quality_check"].includes(r.project_status)).length;
  const completed = regs.filter(r => r.project_status === "completed").length;
  const pending = regs.filter(r => ["registered"].includes(r.project_status) || r.status === "submitted").length;
  const cancelled = regs.filter(r => r.project_status === "cancelled" || r.status === "rejected").length;

  let regFees = 0, advPaid = 0, finPaid = 0;
  regs.forEach(r => {
    const p = r.projects || {};
    if (r.registration_payment_status === "approved") regFees += Number(p.registration_fee || 0);
    if (r.advance_status === "approved") advPaid += Number(p.advance_payment || 0);
    if (r.final_status === "approved") finPaid += Number(p.final_payment || 0);
  });

  const stats = [
    { label: "Total Customers", value: reportData.customers.length },
    { label: "New This Month", value: newThisMonth },
    { label: "Active Projects", value: active },
    { label: "Completed Projects", value: completed },
    { label: "Pending Projects", value: pending },
    { label: "Cancelled / Rejected", value: cancelled },
    { label: "Registration Fees Collected", value: rMoney(regFees) },
    { label: "Advance Payments Released", value: rMoney(advPaid) },
    { label: "Final Payments Released", value: rMoney(finPaid) },
    { label: "Net Revenue (fees − payouts)", value: rMoney(regFees - advPaid - finPaid) },
  ];

  document.getElementById("report-stats").innerHTML = stats.map(s =>
    `<div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`
  ).join("");
}

// ------------------------------------------------------------
// Charts (pure SVG — no external library)
// ------------------------------------------------------------
function lastNMonths(n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-IN", { month: "short" }),
    });
  }
  return months;
}

function monthKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function barChart(containerId, months, values, color, formatter) {
  const container = document.getElementById(containerId);
  const max = Math.max(...values, 1);
  const W = 320, H = 160, pad = 26;
  const barW = (W - pad * 2) / months.length * 0.6;
  const gap = (W - pad * 2) / months.length;

  if (values.every(v => v === 0)) {
    container.innerHTML = '<div class="chart-empty">Is period mein koi data nahi.</div>';
    return;
  }

  const bars = months.map((m, i) => {
    const h = (values[i] / max) * (H - pad * 2);
    const x = pad + i * gap + (gap - barW) / 2;
    const y = H - pad - h;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, 1)}" rx="3" fill="${color}">
        <title>${m.label}: ${formatter(values[i])}</title>
      </rect>
      <text x="${x + barW / 2}" y="${H - pad + 13}" text-anchor="middle" font-size="9" fill="${COLORS.muted}" font-family="monospace">${m.label}</text>
      ${values[i] > 0 ? `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="8.5" fill="${COLORS.muted}" font-family="monospace">${formatter(values[i])}</text>` : ""}`;
  }).join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img">
      <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="${COLORS.line}" stroke-width="1"/>
      ${bars}
    </svg>`;
}

function breakdownChart(containerId, items) {
  const container = document.getElementById(containerId);
  const total = items.reduce((s, i) => s + i.value, 0);

  if (total === 0) {
    container.innerHTML = '<div class="chart-empty">Is period mein koi data nahi.</div>';
    return;
  }

  container.innerHTML = items.filter(i => i.value > 0).map(i => `
    <div class="bar-row">
      <div class="bar-row-top">
        <span>${i.label}</span>
        <strong>${i.value} <span style="color:var(--text-muted);font-weight:400">(${Math.round(i.value / total * 100)}%)</span></strong>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${i.value / total * 100}%;background:${i.color}"></div></div>
    </div>`).join("");
}

function renderCharts() {
  const months = lastNMonths(6);

  // Monthly registrations
  const regCounts = months.map(m =>
    reportData.registrations.filter(r => monthKey(r.created_at) === m.key).length
  );
  barChart("chart-registrations", months, regCounts, COLORS.brass, v => v);

  // Monthly revenue (registration fees collected)
  const revenue = months.map(m =>
    reportData.registrations
      .filter(r => r.registration_payment_status === "approved" && r.registration_payment_date && monthKey(r.registration_payment_date) === m.key)
      .reduce((s, r) => s + Number(r.projects?.registration_fee || 0), 0)
  );
  barChart("chart-revenue", months, revenue, COLORS.green, v => "₹" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v));

  // Filtered set for the breakdowns
  const regs = reportData.registrations.filter(r => !reportRange.from || inRange(r.created_at));

  breakdownChart("chart-projects", [
    { label: "Registered", value: regs.filter(r => r.project_status === "registered").length, color: COLORS.purple },
    { label: "Materials Sent", value: regs.filter(r => r.project_status === "materials_sent").length, color: COLORS.blue },
    { label: "In Progress", value: regs.filter(r => r.project_status === "in_progress").length, color: COLORS.brass },
    { label: "Under Quality Check", value: regs.filter(r => ["submitted_for_pickup", "picked_up", "under_quality_check"].includes(r.project_status)).length, color: COLORS.navy },
    { label: "Completed", value: regs.filter(r => r.project_status === "completed").length, color: COLORS.green },
    { label: "Cancelled", value: regs.filter(r => r.project_status === "cancelled").length, color: COLORS.red },
  ]);

  breakdownChart("chart-payments", [
    { label: "Registration Approved", value: regs.filter(r => r.registration_payment_status === "approved").length, color: COLORS.green },
    { label: "Under Verification", value: regs.filter(r => r.registration_payment_status === "under_verification").length, color: COLORS.blue },
    { label: "Pending", value: regs.filter(r => !r.registration_payment_status || r.registration_payment_status === "pending").length, color: COLORS.brass },
    { label: "Rejected", value: regs.filter(r => r.registration_payment_status === "rejected").length, color: COLORS.red },
    { label: "Advance Released", value: regs.filter(r => r.advance_status === "approved").length, color: COLORS.purple },
    { label: "Final Released", value: regs.filter(r => r.final_status === "approved").length, color: COLORS.navy },
  ]);
}

// ------------------------------------------------------------
// Report tables
// ------------------------------------------------------------
function renderCustomerReport(customers) {
  const rows = customers.map(c => {
    const custRegs = reportData.registrations.filter(r => r.customer_id === c.id);
    const hasActive = custRegs.some(r => !["completed", "cancelled"].includes(r.project_status));
    return {
      "Customer ID": c.customer_id || "—",
      "Name": c.full_name || "—",
      "Mobile": c.mobile || "—",
      "Registered On": rDate(c.created_at),
      "Projects": custRegs.length,
      "Status": c.is_blocked ? "Blocked" : hasActive ? "Active" : custRegs.length ? "Completed" : "No project",
    };
  });
  reportTables.customers = rows;

  document.getElementById("report-customers-body").innerHTML = rows.length
    ? rows.map(r => `<tr><td>${r["Customer ID"]}</td><td>${r.Name}</td><td>${r.Mobile}</td><td>${r["Registered On"]}</td><td>${r.Projects}</td><td>${r.Status}</td></tr>`).join("")
    : `<tr><td colspan="6">Is period mein koi customer nahi.</td></tr>`;
}

function renderProjectReport(regs) {
  const rows = regs.map(r => ({
    "Project": r.projects?.project_name || "—",
    "Customer": r.profiles?.full_name || "—",
    "Start Date": rDate(r.project_started_at),
    "Deadline": rDate(r.deadline),
    "Progress": (r.progress_percent || 0) + "%",
    "Status": titleCase(r.project_status),
  }));
  reportTables.projects = rows;

  document.getElementById("report-projects-body").innerHTML = rows.length
    ? regs.map(r => `<tr>
        <td>${r.projects?.project_name || "—"}</td>
        <td>${r.profiles?.full_name || "—"}</td>
        <td>${rDate(r.project_started_at)}</td>
        <td>${rDate(r.deadline)}</td>
        <td>${r.progress_percent || 0}%</td>
        <td><span class="status-badge status-${r.project_status}">${titleCase(r.project_status)}</span></td>
      </tr>`).join("")
    : `<tr><td colspan="6">Is period mein koi project nahi.</td></tr>`;
}

function renderPaymentReport(regs) {
  const rows = [];
  regs.forEach(r => {
    const p = r.projects || {};
    const cust = r.profiles?.full_name || "—";
    const proj = p.project_name || "—";

    rows.push({
      "Date": rDate(r.registration_payment_date || r.created_at),
      "Customer": cust, "Project": proj, "Type": "Registration Fee",
      "Amount": Number(p.registration_fee || 0),
      "Status": titleCase(r.registration_payment_status || "pending"),
    });
    if (r.advance_status === "approved" || r.status === "approved") {
      rows.push({
        "Date": rDate(r.advance_approved_at), "Customer": cust, "Project": proj, "Type": "Advance (50%)",
        "Amount": Number(p.advance_payment || 0), "Status": titleCase(r.advance_status),
      });
    }
    if (r.final_status === "approved" || r.quality_status === "approved") {
      rows.push({
        "Date": rDate(r.final_approved_at), "Customer": cust, "Project": proj, "Type": "Final (50%)",
        "Amount": Number(p.final_payment || 0), "Status": titleCase(r.final_status),
      });
    }
  });
  reportTables.payments = rows;

  document.getElementById("report-payments-body").innerHTML = rows.length
    ? rows.map(r => `<tr>
        <td>${r.Date}</td><td>${r.Customer}</td><td>${r.Project}</td><td>${r.Type}</td>
        <td>${rMoney(r.Amount)}</td>
        <td><span class="status-badge status-${r.Status.toLowerCase().replace(/ /g, "_")}">${r.Status}</span></td>
      </tr>`).join("")
    : `<tr><td colspan="6">Is period mein koi payment record nahi.</td></tr>`;
}

function renderCourierReport(regs) {
  const shipped = regs.filter(r => r.courier_out_status && r.courier_out_status !== "not_prepared");
  const rows = shipped.map(r => ({
    "Customer": r.profiles?.full_name || "—",
    "Tracking No.": r.courier_out_tracking || "—",
    "Dispatch Date": rDate(r.dispatch_date),
    "Delivery Status": titleCase(r.courier_out_status),
    "Return Pickup": titleCase(r.pickup_status),
  }));
  reportTables.courier = rows;

  document.getElementById("report-courier-body").innerHTML = rows.length
    ? shipped.map(r => `<tr>
        <td>${r.profiles?.full_name || "—"}</td>
        <td>${r.courier_out_tracking || "—"}</td>
        <td>${rDate(r.dispatch_date)}</td>
        <td><span class="status-badge status-${r.courier_out_status}">${titleCase(r.courier_out_status)}</span></td>
        <td><span class="status-badge status-${r.pickup_status}">${titleCase(r.pickup_status)}</span></td>
      </tr>`).join("")
    : `<tr><td colspan="5">Is period mein koi parcel dispatch nahi hua.</td></tr>`;
}

function renderQualityReport(regs) {
  const checked = regs.filter(r => r.quality_status && r.completion_marked_by_customer);

  document.getElementById("quality-summary").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${checked.filter(r => r.quality_status === "under_review").length}</div><div class="stat-label">Under Review</div></div>
      <div class="stat-card"><div class="stat-value">${checked.filter(r => r.quality_status === "approved").length}</div><div class="stat-label">Approved</div></div>
      <div class="stat-card"><div class="stat-value">${checked.filter(r => r.quality_status === "need_correction").length}</div><div class="stat-label">Correction Required</div></div>
      <div class="stat-card"><div class="stat-value">${checked.filter(r => r.quality_status === "rejected").length}</div><div class="stat-label">Rejected</div></div>
    </div>`;

  const rows = checked.map(r => ({
    "Customer": r.profiles?.full_name || "—",
    "Project": r.projects?.project_name || "—",
    "Pages Done": r.pages_completed ?? "—",
    "Handwriting": r.handwriting_quality || "—",
    "Quality Status": titleCase(r.quality_status),
  }));
  reportTables.quality = rows;

  document.getElementById("report-quality-body").innerHTML = rows.length
    ? checked.map(r => `<tr>
        <td>${r.profiles?.full_name || "—"}</td>
        <td>${r.projects?.project_name || "—"}</td>
        <td>${r.pages_completed ?? "—"}</td>
        <td>${r.handwriting_quality || "—"}</td>
        <td><span class="status-badge status-${r.quality_status}">${titleCase(r.quality_status)}</span></td>
      </tr>`).join("")
    : `<tr><td colspan="5">Is period mein koi quality check nahi hua.</td></tr>`;
}

// ------------------------------------------------------------
// Exports — CSV, Excel (.xls), PDF (print dialog)
// ------------------------------------------------------------
function exportReport(reportName, format) {
  const rows = reportTables[reportName];
  if (!rows || rows.length === 0) { alert("Is report mein export karne ke liye koi data nahi hai."); return; }

  const title = `Aaliya Book Publication — ${titleCase(reportName)} Report (${reportRange.label})`;
  const headers = Object.keys(rows[0]);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const csv = [
      headers.join(","),
      ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    downloadBlob(csv, `${reportName}-report-${stamp}.csv`, "text/csv;charset=utf-8;");

  } else if (format === "excel") {
    const table = `
      <table border="1">
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>`;
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head>
      <body><h3>${title}</h3>${table}</body></html>`;
    downloadBlob(html, `${reportName}-report-${stamp}.xls`, "application/vnd.ms-excel");

  } else if (format === "pdf") {
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><title>${title}</title>
      <style>
        body { font-family: Georgia, serif; padding: 28px; color: #241F14; }
        h2 { font-size: 18px; margin: 0 0 4px; }
        p.meta { font-size: 11px; color: #6B6350; margin: 0 0 18px; }
        table { border-collapse: collapse; width: 100%; font-size: 11px; }
        th { background: #1B2430; color: #FBF8EF; text-align: left; padding: 7px 9px; }
        td { padding: 6px 9px; border-bottom: 1px solid #ddd; }
        tr:nth-child(even) td { background: #F8F5EC; }
      </style></head>
      <body>
        <h2>${title}</h2>
        <p class="meta">Generated ${new Date().toLocaleString("en-IN")} · ${rows.length} records</p>
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
          <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
        <script>window.onload = () => window.print();<\/script>
      </body></html>`);
    w.document.close();
  }

  if (typeof logActivity === "function") logActivity("Report exported", `${reportName} (${format})`);
}

function downloadBlob(content, filename, mime) {
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
function initReports() {
  document.querySelectorAll("[data-range]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-range]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("report-from").value = "";
      document.getElementById("report-to").value = "";
      setPresetRange(btn.dataset.range);
    });
  });

  document.getElementById("apply-custom-range")?.addEventListener("click", applyCustomRange);

  setPresetRange("month");
  loadReportData();
}
