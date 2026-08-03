// ============================================================
// Smart Automation — settings, history, manual run
// ============================================================

const AUTOMATION_FLAGS = [
  "auto_customer_alerts", "auto_admin_alerts", "auto_invoice_generation",
  "auto_status_updates", "auto_reminders", "auto_email_notifications",
];

let automationLogCache = [];
let automationFilter = "all";

function aTitle(s) { return (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------
async function loadAutomationSettings() {
  const { data, error } = await supabaseClient.from("automation_settings").select("*").eq("id", 1).single();
  const form = document.getElementById("automation-form");
  if (!form || error || !data) return;

  AUTOMATION_FLAGS.forEach(k => { if (form[k]) form[k].checked = !!data[k]; });
  if (form.reminder_days_before) form.reminder_days_before.value = data.reminder_days_before ?? 3;
}

async function handleAutomationSave(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("automation-msg");

  const updates = { updated_at: new Date().toISOString() };
  AUTOMATION_FLAGS.forEach(k => { updates[k] = f[k].checked; });
  updates.reminder_days_before = parseInt(f.reminder_days_before.value || 3, 10);

  const { error } = await supabaseClient.from("automation_settings").update(updates).eq("id", 1);
  msg.textContent = error ? error.message : "Automation settings save ho gaye.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error && typeof logActivity === "function") logActivity("Automation settings updated", "");
}

async function runRemindersNow() {
  const msg = document.getElementById("automation-msg");
  msg.textContent = "Reminders chal rahe hain..."; msg.className = "form-msg";

  const { data, error } = await supabaseClient.rpc("send_due_reminders");
  msg.textContent = error ? error.message : `${data ?? 0} reminders bhej diye gaye.`;
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) {
    if (typeof logActivity === "function") logActivity("Reminders run manually", `${data ?? 0} sent`);
    loadAutomationLog();
    loadAutomationStats();
  }
}

// ------------------------------------------------------------
// History
// ------------------------------------------------------------
async function loadAutomationLog() {
  const { data } = await supabaseClient
    .from("automation_log")
    .select("*, profiles(full_name), registrations(registration_number)")
    .order("created_at", { ascending: false })
    .limit(200);

  automationLogCache = data || [];
  renderAutomationLog();
}

function renderAutomationLog() {
  const tbody = document.getElementById("automation-log-body");
  if (!tbody) return;

  const list = automationFilter === "all"
    ? automationLogCache
    : automationLogCache.filter(l => l.category === automationFilter);

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">Is category mein koi automated action record nahi hua.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(l => `
    <tr>
      <td>${new Date(l.created_at).toLocaleString("en-IN")}</td>
      <td><span class="status-badge status-${l.category === "reminder" ? "pending" : "approved"}">${aTitle(l.category)}</span></td>
      <td>${aTitle(l.event_type)}</td>
      <td>
        ${l.description || "—"}
        ${l.profiles?.full_name ? `<br><small style="color:var(--text-muted)">${l.profiles.full_name}</small>` : ""}
        ${l.registrations?.registration_number ? `<small style="color:var(--text-muted)"> · ${l.registrations.registration_number}</small>` : ""}
      </td>
    </tr>`).join("");
}

async function loadAutomationStats() {
  const box = document.getElementById("automation-stats");
  if (!box) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [{ count: total }, { count: todayCount }, { count: notifCount }, { count: reminderCount }] = await Promise.all([
    supabaseClient.from("automation_log").select("*", { count: "exact", head: true }),
    supabaseClient.from("automation_log").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString()),
    supabaseClient.from("notifications").select("*", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
    supabaseClient.from("automation_log").select("*", { count: "exact", head: true }).eq("category", "reminder").gte("created_at", weekAgo.toISOString()),
  ]);

  const stats = [
    { label: "Total Automated Actions", value: total ?? 0 },
    { label: "Actions Today", value: todayCount ?? 0 },
    { label: "Notifications (7 days)", value: notifCount ?? 0 },
    { label: "Reminders (7 days)", value: reminderCount ?? 0 },
  ];

  box.innerHTML = stats.map(s =>
    `<div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`
  ).join("");
}

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
function initAutomation() {
  document.getElementById("automation-form")?.addEventListener("submit", handleAutomationSave);
  document.getElementById("run-automation-btn")?.addEventListener("click", runRemindersNow);

  document.querySelectorAll("[data-auto-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-auto-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      automationFilter = btn.dataset.autoFilter;
      renderAutomationLog();
    });
  });

  loadAutomationSettings();
  loadAutomationLog();
  loadAutomationStats();
}
