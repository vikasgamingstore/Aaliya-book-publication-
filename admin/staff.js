// ============================================================
// Staff & Team Management — Aaliya Book Publication
// ============================================================

const STAFF_ROLE_LABELS = {
  super_admin: "Super Admin",
  project_manager: "Project Manager",
  payment_manager: "Payment Manager",
  courier_manager: "Courier Manager",
  support_manager: "Customer Support Manager",
  quality_manager: "Quality Check Manager",
};

const PERM_KEYS = [
  "view_customers", "edit_customers", "manage_projects", "view_payments",
  "approve_payments", "manage_courier", "manage_quality", "access_reports",
];

const PERM_LABELS = {
  view_customers: "View Customers", edit_customers: "Edit Customers",
  manage_projects: "Manage Projects", view_payments: "View Payments",
  approve_payments: "Approve Payments", manage_courier: "Manage Courier",
  manage_quality: "Manage Quality", access_reports: "Access Reports",
};

// Recommended permission set per role
const ROLE_DEFAULT_PERMS = {
  super_admin: PERM_KEYS,
  project_manager: ["view_customers", "manage_projects", "manage_courier", "manage_quality", "access_reports"],
  payment_manager: ["view_customers", "view_payments", "approve_payments", "access_reports"],
  courier_manager: ["view_customers", "manage_courier"],
  support_manager: ["view_customers", "edit_customers"],
  quality_manager: ["view_customers", "manage_quality"],
};

const TASK_TYPE_LABELS = {
  verify_registration: "Verify Registration", check_payment: "Check Payment",
  update_courier: "Update Courier", review_quality: "Review Quality",
  customer_support: "Customer Support", general: "General",
};

let staffCache = [];
let tasksCache = [];
let taskFilter = "all";
let currentStaffId = null;
let currentIsSuperAdmin = false;

function sTitle(s) { return (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function sDate(d) { return d ? new Date(d).toLocaleDateString("en-IN") : "—"; }

// ------------------------------------------------------------
// Create staff
// ------------------------------------------------------------
function applyRoleDefaultPerms() {
  const role = document.getElementById("staff-role-select").value;
  const defaults = ROLE_DEFAULT_PERMS[role] || [];
  const form = document.getElementById("staff-form");
  PERM_KEYS.forEach(k => {
    if (form[k]) form[k].checked = defaults.includes(k);
  });
}

async function handleStaffCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("staff-msg");
  msg.textContent = "Staff account bana rahe hain..."; msg.className = "form-msg";

  const perms = {};
  PERM_KEYS.forEach(k => { perms[k] = f[k].checked; });

  const { error } = await supabaseClient.rpc("promote_to_staff", {
    target_email: f.email.value.trim(),
    new_role: f.role.value,
    perms: perms,
  });

  if (error) {
    msg.textContent = error.message;
    msg.className = "form-msg error";
    return;
  }

  msg.textContent = "Staff account ban gaya.";
  msg.className = "form-msg ok";
  f.reset();
  applyRoleDefaultPerms();
  if (typeof logActivity === "function") logActivity("Staff account created", f.email.value.trim());
  loadStaffTable();
  loadStaffPerformance();
  loadTaskAssignees();
}

// ------------------------------------------------------------
// Staff list
// ------------------------------------------------------------
async function loadStaffTable() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("id, full_name, mobile, admin_role, staff_status, " + PERM_KEYS.map(k => "perm_" + k).join(", "))
    .eq("is_admin", true)
    .order("admin_role");

  staffCache = data || [];
  const tbody = document.getElementById("staff-body");
  if (!tbody) return;

  if (staffCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Abhi koi staff member nahi hai.</td></tr>`;
    return;
  }

  tbody.innerHTML = staffCache.map(s => {
    const granted = PERM_KEYS.filter(k => s["perm_" + k]);
    const badges = s.admin_role === "super_admin"
      ? `<span class="perm-badge">All Access</span>`
      : granted.length
        ? granted.map(k => `<span class="perm-badge">${PERM_LABELS[k]}</span>`).join("")
        : `<span class="perm-badge">No permissions</span>`;

    return `
    <tr>
      <td>${s.full_name || "—"}</td>
      <td>${s.mobile || "—"}</td>
      <td>${STAFF_ROLE_LABELS[s.admin_role] || "—"}</td>
      <td><span class="status-badge status-${s.staff_status || "active"}">${sTitle(s.staff_status || "active")}</span></td>
      <td><div class="perm-badges">${badges}</div></td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="editStaff('${s.id}')">Edit</button>
        <button class="btn btn-outline btn-sm" onclick="toggleStaffStatus('${s.id}', '${s.staff_status === "inactive" ? "active" : "inactive"}')">${s.staff_status === "inactive" ? "Activate" : "Deactivate"}</button>
        <button class="btn btn-outline btn-sm" onclick="removeStaff('${s.id}')">Remove</button>
      </td>
    </tr>`;
  }).join("");
}

function editStaff(id) {
  const s = staffCache.find(x => x.id === id);
  if (!s) return;
  const box = document.getElementById("staff-edit-box");

  box.innerHTML = `
    <h3>Edit: ${s.full_name || "Staff"}</h3>
    <div class="form-grid">
      <div class="field">
        <label>Role</label>
        <select id="edit-role">
          ${Object.entries(STAFF_ROLE_LABELS).map(([k, v]) => `<option value="${k}" ${s.admin_role === k ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Status</label>
        <select id="edit-status">
          <option value="active" ${s.staff_status !== "inactive" ? "selected" : ""}>Active</option>
          <option value="inactive" ${s.staff_status === "inactive" ? "selected" : ""}>Inactive</option>
        </select>
      </div>
    </div>
    <div class="fieldset-title">Permissions</div>
    <div class="perm-grid">
      ${PERM_KEYS.map(k => `
        <label class="perm-item">
          <input type="checkbox" id="edit-${k}" ${s["perm_" + k] ? "checked" : ""}> ${PERM_LABELS[k]}
        </label>`).join("")}
    </div>
    <button class="btn btn-primary" onclick="saveStaffEdit('${s.id}')">Save Changes</button>
    <div id="staff-edit-msg" class="form-msg"></div>`;

  box.style.display = "block";
  box.scrollIntoView({ behavior: "smooth" });
}

async function saveStaffEdit(id) {
  const msg = document.getElementById("staff-edit-msg");
  const updates = {
    admin_role: document.getElementById("edit-role").value,
    staff_status: document.getElementById("edit-status").value,
  };
  PERM_KEYS.forEach(k => { updates["perm_" + k] = document.getElementById("edit-" + k).checked; });

  const { error } = await supabaseClient.from("profiles").update(updates).eq("id", id);
  msg.textContent = error ? error.message : "Changes save ho gaye.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) {
    if (typeof logActivity === "function") logActivity("Staff updated", `${id} → ${updates.admin_role}`);
    loadStaffTable();
    loadStaffPerformance();
  }
}

async function toggleStaffStatus(id, newStatus) {
  await supabaseClient.from("profiles").update({ staff_status: newStatus }).eq("id", id);
  if (typeof logActivity === "function") logActivity("Staff status changed", `${id} → ${newStatus}`);
  loadStaffTable();
}

async function removeStaff(id) {
  if (!confirm("Is staff member ka admin access hataana hai? (Unka customer account bana rahega.)")) return;
  const updates = { is_admin: false, admin_role: null, staff_status: "inactive" };
  PERM_KEYS.forEach(k => { updates["perm_" + k] = false; });
  await supabaseClient.from("profiles").update(updates).eq("id", id);
  if (typeof logActivity === "function") logActivity("Staff access removed", id);
  loadStaffTable();
  loadStaffPerformance();
  loadTaskAssignees();
}

// ------------------------------------------------------------
// Staff performance
// ------------------------------------------------------------
async function loadStaffPerformance() {
  const { data } = await supabaseClient.from("staff_performance").select("*");
  const tbody = document.getElementById("staff-performance-body");
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Abhi koi data nahi.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(s => `
    <tr>
      <td>${s.full_name || "—"}${s.staff_status === "inactive" ? ' <span class="status-badge status-inactive">Inactive</span>' : ""}</td>
      <td>${STAFF_ROLE_LABELS[s.admin_role] || "—"}</td>
      <td>${s.pending_tasks || 0}</td>
      <td>${s.in_progress_tasks || 0}</td>
      <td>${s.completed_tasks || 0}</td>
      <td><strong>${s.total_tasks || 0}</strong></td>
    </tr>`).join("");
}

// ------------------------------------------------------------
// Tasks
// ------------------------------------------------------------
async function loadTaskAssignees() {
  const select = document.getElementById("task-assignee");
  if (!select) return;
  const { data } = await supabaseClient
    .from("profiles").select("id, full_name, admin_role")
    .eq("is_admin", true).eq("staff_status", "active");

  select.innerHTML = (data || []).map(s =>
    `<option value="${s.id}">${s.full_name || "Staff"} — ${STAFF_ROLE_LABELS[s.admin_role] || ""}</option>`
  ).join("");
}

async function loadTaskRegistrations() {
  const select = document.getElementById("task-registration");
  if (!select) return;
  const { data } = await supabaseClient
    .from("registrations")
    .select("id, registration_number, profiles(full_name), projects(project_name)")
    .order("created_at", { ascending: false }).limit(50);

  select.innerHTML = '<option value="">— None —</option>' + (data || []).map(r =>
    `<option value="${r.id}">${r.registration_number || "New"} · ${r.profiles?.full_name || "—"} · ${r.projects?.project_name || ""}</option>`
  ).join("");
}

async function handleTaskCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("task-msg");

  const { data: { session } } = await supabaseClient.auth.getSession();
  const { error } = await supabaseClient.from("staff_tasks").insert({
    title: f.title.value.trim(),
    description: f.description.value.trim() || null,
    task_type: f.task_type.value,
    assigned_to: f.assigned_to.value,
    assigned_by: session?.user?.id,
    registration_id: f.registration_id.value || null,
    priority: f.priority.value,
    due_date: f.due_date.value || null,
  });

  msg.textContent = error ? error.message : "Task assign ho gaya — staff ko notification chala gaya.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) {
    f.reset();
    if (typeof logActivity === "function") logActivity("Task assigned", f.title.value.trim());
    loadTasks();
    loadStaffPerformance();
  }
}

async function loadTasks() {
  const { data } = await supabaseClient
    .from("staff_tasks")
    .select("*, assignee:assigned_to(full_name), registrations(registration_number)")
    .order("created_at", { ascending: false });

  tasksCache = data || [];
  renderTasks();
  renderTaskStats();
}

function renderTaskStats() {
  const box = document.getElementById("task-stats");
  if (!box) return;
  const stats = [
    { label: "Pending", value: tasksCache.filter(t => t.status === "pending").length },
    { label: "In Progress", value: tasksCache.filter(t => t.status === "in_progress").length },
    { label: "Completed", value: tasksCache.filter(t => t.status === "completed").length },
    { label: "Overdue", value: tasksCache.filter(t => t.status !== "completed" && t.due_date && new Date(t.due_date) < new Date()).length },
  ];
  box.innerHTML = stats.map(s =>
    `<div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`
  ).join("");
}

function renderTasks() {
  const tbody = document.getElementById("tasks-body");
  if (!tbody) return;

  const list = taskFilter === "all" ? tasksCache : tasksCache.filter(t => t.status === taskFilter);

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">Koi task nahi mila.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(t => {
    const overdue = t.status !== "completed" && t.due_date && new Date(t.due_date) < new Date();
    return `
    <tr>
      <td>
        <strong>${t.title}</strong>
        ${t.description ? `<br><small style="color:var(--text-muted)">${t.description}</small>` : ""}
        ${t.registrations?.registration_number ? `<br><small>Reg: ${t.registrations.registration_number}</small>` : ""}
        ${t.staff_comment ? `<br><small style="color:var(--red-ink)">Comment: ${t.staff_comment}</small>` : ""}
      </td>
      <td>${t.assignee?.full_name || "—"}</td>
      <td>${TASK_TYPE_LABELS[t.task_type] || sTitle(t.task_type)}</td>
      <td>${sDate(t.due_date)}${overdue ? ' <span class="status-badge status-rejected">Overdue</span>' : ""}</td>
      <td><span class="status-badge status-${t.priority}">${sTitle(t.priority)}</span></td>
      <td><span class="status-badge status-${t.status}">${sTitle(t.status)}</span></td>
      <td>
        <select onchange="updateTaskStatus('${t.id}', this.value)" style="font-size:0.78rem;padding:4px">
          <option value="">Change status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button class="btn btn-outline btn-sm" onclick="addTaskComment('${t.id}')">Comment</button>
      </td>
    </tr>`;
  }).join("");
}

async function updateTaskStatus(id, status) {
  if (!status) return;
  const { error } = await supabaseClient.from("staff_tasks").update({ status }).eq("id", id);
  if (error) { alert(error.message); return; }
  if (typeof logActivity === "function") logActivity("Task status updated", `${id} → ${status}`);
  loadTasks();
  loadStaffPerformance();
}

async function addTaskComment(id) {
  const comment = prompt("Task ke baare mein comment likhiye:");
  if (comment === null) return;
  await supabaseClient.from("staff_tasks").update({ staff_comment: comment.trim() || null }).eq("id", id);
  loadTasks();
}

// ------------------------------------------------------------
// Staff notifications (for the logged-in staff member)
// ------------------------------------------------------------
async function loadStaffNotifications() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;

  const { data } = await supabaseClient
    .from("staff_notifications").select("*")
    .eq("staff_id", session.user.id)
    .order("created_at", { ascending: false }).limit(20);

  const box = document.getElementById("staff-notifications-body");
  if (!box) return;

  if (!data || data.length === 0) {
    box.innerHTML = '<p class="field-hint">Abhi koi notification nahi hai.</p>';
    return;
  }

  box.innerHTML = data.map(n => `
    <div class="notif-item ${n.is_read ? "read" : "unread"}">
      <div class="notif-dot"></div>
      <div class="notif-body">
        <span class="notif-time">${sTitle(n.type)} · ${new Date(n.created_at).toLocaleString("en-IN")}</span>
        <p>${n.message}</p>
      </div>
    </div>`).join("");

  // Mark them read once viewed
  await supabaseClient.from("staff_notifications")
    .update({ is_read: true })
    .eq("staff_id", session.user.id).eq("is_read", false);
}

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
async function initStaffManagement(profile) {
  currentStaffId = profile?.id || null;
  currentIsSuperAdmin = profile?.admin_role === "super_admin";

  // Non-super-admins only see their own tasks + notifications
  if (!currentIsSuperAdmin) {
    document.getElementById("assign-task-card")?.style.setProperty("display", "none");
    const heading = document.getElementById("tasks-heading");
    if (heading) heading.textContent = "My Tasks";
  }

  document.getElementById("staff-form")?.addEventListener("submit", handleStaffCreate);
  document.getElementById("staff-role-select")?.addEventListener("change", applyRoleDefaultPerms);
  document.getElementById("task-form")?.addEventListener("submit", handleTaskCreate);

  document.querySelectorAll("[data-task-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-task-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      taskFilter = btn.dataset.taskFilter;
      renderTasks();
    });
  });

  applyRoleDefaultPerms();

  if (currentIsSuperAdmin) {
    loadStaffTable();
    loadStaffPerformance();
    loadTaskAssignees();
    loadTaskRegistrations();
  }
  loadTasks();
  loadStaffNotifications();
}
