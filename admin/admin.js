// ============================================================
// Admin panel — full management system
// ============================================================

// ---------- Auth ----------
async function handleAdminLogin(e) {
  e.preventDefault();
  const email = document.getElementById("ad-email").value.trim();
  const password = document.getElementById("ad-password").value;
  const msg = document.getElementById("ad-msg");
  msg.textContent = ""; msg.className = "form-msg";

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    await recordLoginAttempt({ email, success: false, isAdmin: true });
    msg.textContent = "Login fail hua.";
    msg.classList.add("error");
    return;
  }

  const { data: profile } = await supabaseClient.from("profiles").select("is_admin, is_blocked").eq("id", data.user.id).single();
  if (!profile?.is_admin || profile?.is_blocked) {
    await recordLoginAttempt({ userId: data.user.id, email, success: false, isAdmin: true });
    msg.textContent = "This account is not an admin account.";
    msg.classList.add("error");
    await supabaseClient.auth.signOut();
    return;
  }

  await recordLoginAttempt({ userId: data.user.id, email, success: true, isAdmin: true });
  window.location.href = "admin-dashboard.html";
}

async function handleForgotPassword() {
  const email = prompt("Enter your admin email:");
  if (!email) return;
  const redirectTo = new URL("reset-password.html", window.location.origin + window.location.pathname.replace(/admin\/.*$/, "")).href;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
  const msg = document.getElementById("ad-msg");
  if (msg) {
    msg.textContent = error ? error.message : "Password reset link email par bhej diya.";
    msg.className = "form-msg " + (error ? "error" : "ok");
  }
}

async function handleAdminPasswordReset() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const msg = document.getElementById("reset-msg");
  const redirectTo2 = new URL("reset-password.html", window.location.origin + window.location.pathname.replace(/admin\/.*$/, "")).href;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(session.user.email, { redirectTo: redirectTo2 });
  msg.textContent = error ? error.message : `Reset link ${session.user.email} par bhej diya.`;
  msg.className = "form-msg " + (error ? "error" : "ok");
}

async function adminGuard() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = "admin-login.html"; return; }
  const { data: profile } = await supabaseClient.from("profiles").select("is_admin, full_name, admin_role").eq("id", session.user.id).single();
  if (!profile?.is_admin) { window.location.href = "admin-login.html"; return; }

  currentAdminName = profile.full_name || session.user.email;
  currentAdminRole = profile.admin_role || "super_admin";
  document.getElementById("admin-name").textContent = currentAdminName + (profile.admin_role ? ` (${(typeof STAFF_ROLE_LABELS !== "undefined" && STAFF_ROLE_LABELS[profile.admin_role]) || profile.admin_role})` : "");
  initTabs();
  loadOverviewStats();
  loadSettingsForm();
  loadPopupForm();
  loadProjectsTable();
  loadRegistrationsTable();
  loadProjectHistory();
  loadPaymentsTab();
  loadCourierTab();
  loadCustomersTable();
  loadInvoicesTable();
  loadContentForm();
  loadNotifyCustomerOptions();
  loadNotificationsTable();
  if (typeof initStaffManagement === "function") initStaffManagement(profile);
  loadActivityLog();
  if (typeof initAutomation === "function") initAutomation();
  if (typeof initDataManager === "function") initDataManager();
  if (typeof initCrm === "function") initCrm();
  if (typeof initMarketing === "function") initMarketing();
  if (typeof initExperience === "function") initExperience();
  if (typeof initBI === "function") initBI();
  loadSeoForm();
  if (typeof initReports === "function") initReports();
  loadTestimonialsTable();
  loadFaqsTable();
  loadSecurityTab();
  applyRoleRestrictions();
}

// ---------- Role-based UI ----------
let currentAdminRole = "super_admin";

const ROLE_TABS = {
  super_admin: null, // null = all tabs
  project_manager: ["overview", "reports", "bi", "projects", "registrations", "courier", "customers", "tasks", "automation", "datamanager"],
  payment_manager: ["overview", "reports", "bi", "payments", "invoices", "registrations", "customers", "tasks", "datamanager"],
  courier_manager: ["overview", "courier", "registrations", "customers", "tasks", "datamanager"],
  support_manager: ["overview", "customers", "notifications", "registrations", "tasks", "datamanager", "crm", "marketing", "experience", "popup"],
  quality_manager: ["overview", "registrations", "customers", "tasks", "datamanager"],
};

function applyRoleRestrictions() {
  const allowed = ROLE_TABS[currentAdminRole];
  if (!allowed) return; // super admin sees everything

  document.querySelectorAll(".admin-tab").forEach(tab => {
    if (!allowed.includes(tab.dataset.tab)) tab.style.display = "none";
  });

  // If the active tab is now hidden, switch to the first allowed one
  const active = document.querySelector(".admin-tab.active");
  if (active && active.style.display === "none") {
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".admin-panel-section").forEach(s => s.classList.remove("active"));
    const first = document.querySelector(`.admin-tab[data-tab="${allowed[0]}"]`);
    first?.classList.add("active");
    document.getElementById("tab-" + allowed[0])?.classList.add("active");
  }
}

// ---------- Tabs ----------
function initTabs() {
  document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".admin-panel-section").forEach(s => s.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
    });
  });
}

// ---------- Overview ----------
async function loadOverviewStats() {
  const grid = document.getElementById("stats-grid");

  const [{ count: totalCustomers }, { data: regs }] = await Promise.all([
    supabaseClient.from("profiles").select("*", { count: "exact", head: true }).eq("is_admin", false),
    supabaseClient.from("registrations").select("status, project_status, advance_status, final_status, registration_payment_status, projects(registration_fee, advance_payment, final_payment)"),
  ]);

  const all = regs || [];
  const newApplications = all.filter(r => r.status === "submitted").length;
  const activeProjects = all.filter(r => ["materials_sent", "in_progress"].includes(r.project_status)).length;
  const completedProjects = all.filter(r => r.project_status === "completed").length;
  const pendingPayments = all.filter(r => ["pending","under_verification"].includes(r.registration_payment_status) || r.advance_status === "pending" || r.final_status === "pending").length;

  let revenue = 0;
  all.forEach(r => {
    const p = r.projects || {};
    if (r.registration_payment_status === "approved") revenue += Number(p.registration_fee || 0);
    if (r.advance_status === "approved") revenue += Number(p.advance_payment || 0);
    if (r.final_status === "approved") revenue += Number(p.final_payment || 0);
  });

  const stats = [
    { label: "Total Customers", value: totalCustomers ?? 0 },
    { label: "New Applications", value: newApplications },
    { label: "Active Projects", value: activeProjects },
    { label: "Completed Projects", value: completedProjects },
    { label: "Pending Payments", value: pendingPayments },
    { label: "Total Revenue", value: "₹" + revenue.toLocaleString("en-IN") },
  ];

  grid.innerHTML = stats.map(s => `<div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`).join("");
}

// ---------- Settings (profile + payment + bank + contact) ----------
async function loadSettingsForm() {
  const { data } = await supabaseClient.from("company_settings").select("*").eq("id", 1).single();
  if (!data) return;
  const profileForm = document.getElementById("profile-form");
  const settingsForm = document.getElementById("settings-form");
  Object.keys(data).forEach(key => {
    if (profileForm && profileForm[key] !== undefined) profileForm[key].value = data[key] || "";
    if (settingsForm && settingsForm[key] !== undefined) settingsForm[key].value = data[key] || "";
  });
}

async function handleProfileSave(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("profile-msg");
  const fields = ["company_name","logo_url","favicon_url","description","facebook_url","instagram_url","telegram_url","whatsapp_group_url"];
  const updates = { updated_at: new Date().toISOString() };
  fields.forEach(k => { if (f[k]) updates[k] = f[k].value.trim() || null; });

  const { error } = await supabaseClient.from("company_settings").update(updates).eq("id", 1);
  msg.textContent = error ? error.message : "Company profile saved.";
  msg.className = "form-msg " + (error ? "error" : "ok");
}

async function handleSettingsSave(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("settings-msg");
  const fields = ["address","whatsapp_number","phone_number","email","upi_id","payment_instructions"];
  const updates = { updated_at: new Date().toISOString() };
  fields.forEach(k => { if (f[k]) updates[k] = f[k].value.trim() || null; });

  const { error } = await supabaseClient.from("company_settings").update(updates).eq("id", 1);
  msg.textContent = error ? error.message : "Settings saved — they appear on the website immediately.";
  msg.className = "form-msg " + (error ? "error" : "ok");
}


// Image ko chhota kar ke data URI banata hai (koi storage/URL ki zaroorat nahi)
function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxSize || h > maxSize) {
          const scale = maxSize / Math.max(w, h);
          w = Math.round(w * scale); h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/webp", quality));
      };
      img.onerror = () => reject(new Error("Could not read the image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}


// ---------- Website popup / announcement ----------
const POPUP_FIELDS = ["popup_type","popup_badge","popup_title","popup_message","popup_button_text","popup_button_link","popup_image_url"];

async function loadPopupForm() {
  const f = document.getElementById("popup-form");
  if (!f) return;
  const { data } = await supabaseClient.from("company_settings").select("*").eq("id", 1).single();
  if (!data) return;

  POPUP_FIELDS.forEach(k => { if (f[k]) f[k].value = data[k] || ""; });
  if (f.popup_enabled) f.popup_enabled.checked = !!data.popup_enabled;
  if (f.popup_show_once) f.popup_show_once.checked = data.popup_show_once !== false;

  const prev = document.getElementById("popup-image-preview");
  if (prev && data.popup_image_url) { prev.src = data.popup_image_url; prev.style.display = "block"; }
}

async function handlePopupSave(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("popup-msg");
  const updates = { updated_at: new Date().toISOString() };
  POPUP_FIELDS.forEach(k => { updates[k] = (f[k]?.value || "").trim() || null; });
  updates.popup_enabled = f.popup_enabled.checked;
  updates.popup_show_once = f.popup_show_once.checked;

  const { error } = await supabaseClient.from("company_settings").update(updates).eq("id", 1);
  msg.textContent = error ? error.message : "Popup saved — it appears on the website immediately.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error && typeof logActivity === "function") logActivity("Popup updated", updates.popup_title || "");
}

async function handlePopupImage(e) {
  const file = e.target.files[0];
  const msg = document.getElementById("popup-msg");
  if (!file) return;
  msg.textContent = "Preparing image..."; msg.className = "form-msg";
  try {
    const uri = await compressImage(file, 620, 0.8);
    const f = document.getElementById("popup-form");
    if (f && f.popup_image_url) f.popup_image_url.value = uri;
    const prev = document.getElementById("popup-image-preview");
    if (prev) { prev.src = uri; prev.style.display = "block"; }
    msg.textContent = "Image added — now tap Save Popup.";
    msg.className = "form-msg ok";
  } catch (err) {
    msg.textContent = "Could not load image: " + err.message;
    msg.className = "form-msg error";
  }
}


// ---------- Admin: customer ka password badlein ----------
async function adminChangePassword(userId, name) {
  const pw = prompt(`${name || "Customer"} — enter a new password (at least 8 characters):`);
  if (pw === null) return;
  if (pw.trim().length < 8) { alert("Password must be at least 8 characters."); return; }

  const { data, error } = await supabaseClient.rpc("admin_set_password", {
    target_user: userId, new_password: pw.trim(),
  });
  if (error) { alert("Password was not changed: " + error.message); return; }
  alert(`Password has been changed.\nLogin email: ${data}\nNew password: ${pw.trim()}\n\nPlease share these details with the customer.`);
  if (typeof logActivity === "function") logActivity("Customer password changed", name || userId);
}

// ---------- Projects ----------
async function loadProjectsTable() {
  const { data: projects } = await supabaseClient.from("projects").select("*").order("created_at", { ascending: false });
  const tbody = document.getElementById("projects-body");
  if (!projects || projects.length === 0) { tbody.innerHTML = `<tr><td colspan="7">No projects created yet.</td></tr>`; return; }
  tbody.innerHTML = projects.map(p => `
    <tr>
      <td>${p.image_url ? `<img src="${p.image_url}" style="width:44px;height:44px;object-fit:cover;border-radius:4px">` : "—"}</td>
      <td>${p.project_name}</td>
      <td>${p.num_pages}</td>
      <td>${p.duration_days}d</td>
      <td>₹${p.registration_fee}</td>
      <td>${p.is_active ? "Active" : "Hidden"}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="toggleProject('${p.id}', ${!p.is_active})">${p.is_active ? "Hide" : "Show"}</button>
        <button class="btn btn-outline btn-sm" onclick="deleteProject('${p.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

async function handleProjectCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("project-msg");
  const projectValue = parseFloat(f.project_value.value || 0);
  const advancePercent = parseFloat(f.advance_percent.value || 50);
  const advanceAmount = Math.round(projectValue * advancePercent) / 100;

  const { error } = await supabaseClient.from("projects").insert({
    project_name: f.project_name.value.trim(),
    description: f.description.value.trim(),
    num_pages: parseInt(f.num_pages.value, 10),
    duration_days: parseInt(f.duration_days.value, 10),
    registration_fee: parseFloat(f.registration_fee.value || 0),
    project_value: projectValue,
    advance_percent: advancePercent,
    advance_payment: advanceAmount,
    final_payment: projectValue - advanceAmount,
    instructions: f.instructions.value.trim(),
    image_url: f.image_url.value.trim() || null,
  });
  msg.textContent = error ? error.message : "Project added.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadProjectsTable(); loadOverviewStats(); logActivity("Project added", f.project_name.value.trim()); }
}

async function toggleProject(id, newState) {
  await supabaseClient.from("projects").update({ is_active: newState }).eq("id", id);
  loadProjectsTable();
}
async function deleteProject(id) {
  if (!confirm("Delete this project?")) return;
  await supabaseClient.from("projects").delete().eq("id", id);
  loadProjectsTable();
}

// ---------- Registrations ----------
let allRegistrationsCache = [];

async function loadRegistrationsTable() {
  const { data: regs } = await supabaseClient
    .from("registrations")
    .select("*, profiles(full_name, mobile, address, courier_address, bank_account_name, bank_account_number, bank_ifsc, bank_name), projects(project_name, duration_days, registration_fee, advance_payment, final_payment)")
    .order("created_at", { ascending: false });

  allRegistrationsCache = regs || [];
  renderRegistrationsTable(allRegistrationsCache);
}

function renderRegistrationsTable(regs) {
  const tbody = document.getElementById("registrations-body");
  if (!regs || regs.length === 0) { tbody.innerHTML = `<tr><td colspan="6">No registrations matched.</td></tr>`; return; }
  tbody.innerHTML = regs.map(r => `
    <tr>
      <td><strong>${r.profiles?.full_name || "—"}</strong><br><small>${r.profiles?.mobile || ""}</small><br><small>${r.registration_number || "No ID yet"}</small></td>
      <td>${r.projects?.project_name || "—"}</td>
      <td><span class="status-badge status-${r.status}">${r.status}</span></td>
      <td><span class="status-badge status-${r.project_status}">${r.project_status.replace(/_/g," ")}</span></td>
      <td>${r.deadline || "—"}</td>
      <td><button class="btn btn-outline btn-sm" onclick="openRegDetail('${r.id}')">Manage</button></td>
    </tr>`).join("");
}

function filterRegistrationsTable() {
  const statusFilter = document.getElementById("reg-status-filter").value;
  const searchTerm = document.getElementById("reg-search").value.toLowerCase();
  const filtered = allRegistrationsCache.filter(r => {
    const matchesStatus = !statusFilter || r.project_status === statusFilter;
    const matchesSearch = !searchTerm || (r.profiles?.full_name || "").toLowerCase().includes(searchTerm);
    return matchesStatus && matchesSearch;
  });
  renderRegistrationsTable(filtered);
}

async function openRegDetail(id) {
  const { data: r } = await supabaseClient
    .from("registrations")
    .select("*, profiles(id, full_name, mobile, address, courier_address, bank_account_name, bank_account_number, bank_ifsc, bank_name), projects(project_name, duration_days)")
    .eq("id", id).single();
  if (!r) return;
  const cust = r.profiles || {};
  const proj = r.projects || {};
  const box = document.getElementById("reg-detail-box");

  box.innerHTML = `
    <h3>${cust.full_name || "—"} — ${proj.project_name || ""}</h3>
    <div class="info-grid" style="margin-bottom:16px">
      <div><span>Mobile</span><strong>${cust.mobile || "—"}</strong></div>
      <div><span>Address</span><strong>${cust.address || "—"}</strong></div>
      <div><span>Courier Address</span><strong>${cust.courier_address || "—"}</strong></div>
      <div><span>Bank</span><strong>${cust.bank_name || "—"} / ${cust.bank_account_number || "—"} / ${cust.bank_ifsc || "—"}</strong></div>
      <div><span>Registration UTR</span><strong>${r.registration_utr || "—"}</strong></div>
    </div>

    <div class="fieldset-title">1. Registration Approval</div>
    <div class="field">
      <select id="f-status">
        <option value="submitted" ${r.status==='submitted'?'selected':''}>Submitted</option>
        <option value="approved" ${r.status==='approved'?'selected':''}>Approved</option>
        <option value="rejected" ${r.status==='rejected'?'selected':''}>Rejected</option>
      </select>
    </div>
    <p class="field-hint">Approve karne par Registration ID aur Invoice No. automatically generate ho jayega.</p>

    <div class="fieldset-title">2. Registration Fee Payment Verification</div>
    <div class="info-grid" style="margin-bottom:10px">
      <div><span>Expected Amount</span><strong style="font-size:1.1rem;color:var(--green-ok)">₹${proj.registration_fee ?? "—"}</strong></div>
      <div><span>UTR / Reference</span><strong>${r.registration_utr || "—"}</strong></div>
    </div>
    <p class="field-hint">The screenshot must show <strong>₹${proj.registration_fee ?? "—"}</strong> exactly. If it is more or less, reject it and add a remark.</p>
    ${r.payment_screenshot_url ? `<p><a href="#" onclick="openSecureFile(event, '${r.payment_screenshot_url}')">View Payment Screenshot</a></p>` : `<p class="field-hint">The customer has not uploaded a screenshot yet.</p>`}
    <div class="form-grid">
      <div class="field">
        <select id="f-payment-status">
          <option value="pending" ${r.registration_payment_status==='pending'?'selected':''}>Pending</option>
          <option value="under_verification" ${r.registration_payment_status==='under_verification'?'selected':''}>Under Verification</option>
          <option value="approved" ${r.registration_payment_status==='approved'?'selected':''}>Approved</option>
          <option value="rejected" ${r.registration_payment_status==='rejected'?'selected':''}>Rejected</option>
        </select>
      </div>
      <div class="field"><input type="text" id="f-payment-remarks" placeholder="Remarks (agar reject kiya)" value="${r.payment_remarks || ''}"></div>
    </div>

    <div class="fieldset-title">3. Advance Payment (50%)</div>
    <div class="field">
      <select id="f-advance">
        <option value="pending" ${r.advance_status==='pending'?'selected':''}>Pending</option>
        <option value="approved" ${r.advance_status==='approved'?'selected':''}>Approved</option>
      </select>
    </div>

    <div class="fieldset-title">4. Deadline</div>
    <div class="field"><input type="date" id="f-deadline" value="${r.deadline || ''}"></div>

    <div class="fieldset-title">5. Parcel Preparation &amp; Outbound Courier</div>
    <div class="field"><label>Parcel Items (comma-separated)</label><input type="text" id="f-parcel-items" placeholder="Novel Books, A4 Sheets, Writing Pens, Project Instructions" value="${r.parcel_items || ''}"></div>
    <div class="form-grid">
      <div class="field"><label>Courier Company</label><input type="text" id="f-courier-company" value="${r.courier_company_name || ''}"></div>
      <div class="field"><label>Courier Contact</label><input type="text" id="f-courier-contact" value="${r.courier_contact || ''}"></div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Dispatch Date</label><input type="date" id="f-dispatch-date" value="${r.dispatch_date || ''}"></div>
      <div class="field"><label>Expected Delivery Date</label><input type="date" id="f-expected-delivery" value="${r.expected_delivery_date || ''}"></div>
    </div>
    <div class="form-grid">
      <div class="field">
        <select id="f-courier-out">
          <option value="not_prepared" ${r.courier_out_status==='not_prepared'?'selected':''}>Not Prepared</option>
          <option value="parcel_preparing" ${r.courier_out_status==='parcel_preparing'?'selected':''}>Parcel Preparing</option>
          <option value="parcel_ready" ${r.courier_out_status==='parcel_ready'?'selected':''}>Parcel Ready</option>
          <option value="dispatched" ${r.courier_out_status==='dispatched'?'selected':''}>Dispatched</option>
          <option value="picked_up_by_courier" ${r.courier_out_status==='picked_up_by_courier'?'selected':''}>Courier Picked Up</option>
          <option value="in_transit" ${r.courier_out_status==='in_transit'?'selected':''}>In Transit</option>
          <option value="out_for_delivery" ${r.courier_out_status==='out_for_delivery'?'selected':''}>Out For Delivery</option>
          <option value="delivered" ${r.courier_out_status==='delivered'?'selected':''}>Delivered</option>
        </select>
      </div>
      <div class="field"><input type="text" id="f-courier-out-track" placeholder="Tracking number" value="${r.courier_out_tracking || ''}"></div>
    </div>
    <p class="field-hint">${r.delivery_confirmed_by_customer ? `Customer ne delivery confirm kar di (${r.delivery_confirmed_at ? new Date(r.delivery_confirmed_at).toLocaleDateString('en-IN') : ''}) — project auto-started.` : "The customer has not confirmed delivery yet."}</p>

    <div class="fieldset-title">6. Project Status</div>
    <div class="field">
      <select id="f-project-status">
        <option value="registered" ${r.project_status==='registered'?'selected':''}>Registered</option>
        <option value="materials_sent" ${r.project_status==='materials_sent'?'selected':''}>Materials Sent</option>
        <option value="in_progress" ${r.project_status==='in_progress'?'selected':''}>Writing In Progress</option>
        <option value="submitted_for_pickup" ${r.project_status==='submitted_for_pickup'?'selected':''}>Pickup Requested</option>
        <option value="picked_up" ${r.project_status==='picked_up'?'selected':''}>Picked Up</option>
        <option value="under_quality_check" ${r.project_status==='under_quality_check'?'selected':''}>Under Quality Check</option>
        <option value="rework_needed" ${r.project_status==='rework_needed'?'selected':''}>Rework Needed</option>
        <option value="completed" ${r.project_status==='completed'?'selected':''}>Completed</option>
        <option value="cancelled" ${r.project_status==='cancelled'?'selected':''}>Cancelled</option>
      </select>
    </div>

    <div class="fieldset-title">7. Return Pickup Courier</div>
    <div class="form-grid">
      <div class="field">
        <select id="f-pickup">
          <option value="not_requested" ${r.pickup_status==='not_requested'?'selected':''}>Not Requested</option>
          <option value="requested" ${r.pickup_status==='requested'?'selected':''}>Pickup Requested</option>
          <option value="courier_assigned" ${r.pickup_status==='courier_assigned'?'selected':''}>Courier Assigned</option>
          <option value="pickup_scheduled" ${r.pickup_status==='pickup_scheduled'?'selected':''}>Pickup Scheduled</option>
          <option value="picked_up" ${r.pickup_status==='picked_up'?'selected':''}>Picked Up</option>
          <option value="received_at_company" ${r.pickup_status==='received_at_company'?'selected':''}>Received at Company</option>
        </select>
      </div>
      <div class="field"><input type="text" id="f-pickup-track" placeholder="Return tracking number" value="${r.pickup_tracking || ''}"></div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Return Courier Name</label><input type="text" id="f-return-courier" value="${r.return_courier_name || ''}"></div>
      <div class="field"><label>Received Date</label><input type="date" id="f-return-received-date" value="${r.return_received_date || ''}"></div>
    </div>

    <div class="fieldset-title">8. Quality Check</div>
    <div class="form-grid">
      <div class="field"><label>Pages Completed</label><input type="number" id="f-pages-completed" value="${r.pages_completed ?? ''}"></div>
      <div class="field">
        <label>Handwriting Quality</label>
        <select id="f-handwriting-quality">
          <option value="">-- Select --</option>
          <option value="Excellent" ${r.handwriting_quality==='Excellent'?'selected':''}>Excellent</option>
          <option value="Good" ${r.handwriting_quality==='Good'?'selected':''}>Good</option>
          <option value="Needs Improvement" ${r.handwriting_quality==='Needs Improvement'?'selected':''}>Needs Improvement</option>
        </select>
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label>Correct Format Followed?</label>
        <select id="f-format-followed">
          <option value="">-- Select --</option>
          <option value="true" ${r.format_followed===true?'selected':''}>Yes</option>
          <option value="false" ${r.format_followed===false?'selected':''}>No</option>
        </select>
      </div>
      <div class="field">
        <label>Instructions Followed?</label>
        <select id="f-instructions-followed">
          <option value="">-- Select --</option>
          <option value="true" ${r.instructions_followed===true?'selected':''}>Yes</option>
          <option value="false" ${r.instructions_followed===false?'selected':''}>No</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Missing Pages (if any)</label><input type="text" id="f-missing-pages" value="${r.missing_pages || ''}"></div>
    <div class="field">
      <label>Quality Status</label>
      <select id="f-quality">
        <option value="under_review" ${r.quality_status==='under_review'?'selected':''}>Under Review</option>
        <option value="approved" ${r.quality_status==='approved'?'selected':''}>Approved</option>
        <option value="need_correction" ${r.quality_status==='need_correction'?'selected':''}>Need Correction</option>
        <option value="rejected" ${r.quality_status==='rejected'?'selected':''}>Rejected</option>
      </select>
    </div>
    <div class="field"><label>Correction Message / Required Updates (shown to customer)</label><textarea id="f-correction-message" rows="2">${r.correction_message || ''}</textarea></div>
    <div class="field"><label>Internal Note</label><input type="text" id="f-quality-note" placeholder="Internal note" value="${r.quality_note || ''}"></div>

    <div class="fieldset-title">9. Final Payment (50%) — release after Quality Approved</div>
    <div class="field">
      <select id="f-final">
        <option value="pending" ${r.final_status==='pending'?'selected':''}>Pending</option>
        <option value="approved" ${r.final_status==='approved'?'selected':''}>Approved</option>
      </select>
    </div>

    <button class="btn btn-primary" onclick="saveRegDetail('${r.id}')">Save Changes</button>
    <a class="btn btn-outline" href="https://wa.me/?text=${encodeURIComponent('Your project status has been updated - Aaliya Book Publication')}" target="_blank">WhatsApp Customer</a>
    <div id="reg-save-msg" class="form-msg"></div>
  `;
  box.style.display = "block";
  box.scrollIntoView({ behavior: "smooth" });
}

async function saveRegDetail(id) {
  const msg = document.getElementById("reg-save-msg");
  const paymentStatus = document.getElementById("f-payment-status").value;
  const updates = {
    status: document.getElementById("f-status").value,
    registration_payment_status: paymentStatus,
    registration_fee_paid: paymentStatus === "approved",
    payment_remarks: document.getElementById("f-payment-remarks").value.trim() || null,
    advance_status: document.getElementById("f-advance").value,
    deadline: document.getElementById("f-deadline").value || null,
    parcel_items: document.getElementById("f-parcel-items").value.trim() || null,
    courier_company_name: document.getElementById("f-courier-company").value.trim() || null,
    courier_contact: document.getElementById("f-courier-contact").value.trim() || null,
    dispatch_date: document.getElementById("f-dispatch-date").value || null,
    expected_delivery_date: document.getElementById("f-expected-delivery").value || null,
    courier_out_status: document.getElementById("f-courier-out").value,
    courier_out_tracking: document.getElementById("f-courier-out-track").value.trim() || null,
    project_status: document.getElementById("f-project-status").value,
    pickup_status: document.getElementById("f-pickup").value,
    pickup_tracking: document.getElementById("f-pickup-track").value.trim() || null,
    return_courier_name: document.getElementById("f-return-courier").value.trim() || null,
    return_received_date: document.getElementById("f-return-received-date").value || null,
    quality_status: document.getElementById("f-quality").value,
    quality_note: document.getElementById("f-quality-note").value.trim() || null,
    pages_completed: document.getElementById("f-pages-completed").value ? parseInt(document.getElementById("f-pages-completed").value, 10) : null,
    handwriting_quality: document.getElementById("f-handwriting-quality").value || null,
    format_followed: document.getElementById("f-format-followed").value === "" ? null : document.getElementById("f-format-followed").value === "true",
    instructions_followed: document.getElementById("f-instructions-followed").value === "" ? null : document.getElementById("f-instructions-followed").value === "true",
    missing_pages: document.getElementById("f-missing-pages").value.trim() || null,
    correction_message: document.getElementById("f-correction-message").value.trim() || null,
    final_status: document.getElementById("f-final").value,
    updated_at: new Date().toISOString(),
  };
  if (paymentStatus === "approved") updates.registration_payment_date = new Date().toISOString();
  if (updates.advance_status === "approved") updates.advance_approved_at = new Date().toISOString();
  if (updates.final_status === "approved") updates.final_approved_at = new Date().toISOString();

  const { error } = await supabaseClient.from("registrations").update(updates).eq("id", id);
  msg.textContent = error ? error.message : "Changes saved.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { logActivity("Registration updated", `${updates.status} / ${updates.project_status}`); loadRegistrationsTable(); loadOverviewStats(); loadInvoicesTable(); loadPaymentsTab(); loadCourierTab(); loadProjectHistory(); }
}

// ---------- Courier tab ----------
async function loadCourierTab() {
  const { data: regs } = await supabaseClient
    .from("registrations")
    .select("id, courier_out_status, courier_out_tracking, courier_company_name, parcel_items, delivery_confirmed_by_customer, delivery_confirmed_at, pickup_status, pickup_tracking, return_courier_name, return_received_date, profiles(full_name), projects(project_name)")
    .order("created_at", { ascending: false });

  const all = regs || [];

  // Outgoing (not yet delivered)
  const outgoing = all.filter(r => r.courier_out_status !== "delivered" && r.courier_out_status !== "not_prepared");
  document.getElementById("courier-outgoing-body").innerHTML = outgoing.length ? outgoing.map(r => `
    <tr>
      <td>${r.profiles?.full_name || "—"}</td>
      <td>${r.projects?.project_name || "—"}</td>
      <td>${r.parcel_items || "—"}</td>
      <td>${r.courier_company_name || "—"}</td>
      <td>${r.courier_out_tracking || "—"}</td>
      <td><span class="status-badge status-${r.courier_out_status}">${r.courier_out_status.replace(/_/g," ")}</span></td>
      <td><button class="btn btn-outline btn-sm" onclick="openRegDetail('${r.id}')">Manage</button></td>
    </tr>`).join("") : `<tr><td colspan="7">No outgoing parcels.</td></tr>`;

  // Delivered
  const delivered = all.filter(r => r.courier_out_status === "delivered");
  document.getElementById("courier-delivered-body").innerHTML = delivered.length ? delivered.map(r => `
    <tr>
      <td>${r.profiles?.full_name || "—"}</td>
      <td>${r.projects?.project_name || "—"}</td>
      <td>${r.delivery_confirmed_at ? new Date(r.delivery_confirmed_at).toLocaleDateString("en-IN") : "—"}</td>
      <td>${r.delivery_confirmed_by_customer ? "Yes" : "Awaiting confirmation"}</td>
    </tr>`).join("") : `<tr><td colspan="4">No delivered parcels.</td></tr>`;

  // Pickup requests (active)
  const pickups = all.filter(r => !["not_requested", "received_at_company"].includes(r.pickup_status));
  document.getElementById("courier-pickup-body").innerHTML = pickups.length ? pickups.map(r => `
    <tr>
      <td>${r.profiles?.full_name || "—"}</td>
      <td>${r.projects?.project_name || "—"}</td>
      <td><span class="status-badge status-${r.pickup_status}">${r.pickup_status.replace(/_/g," ")}</span></td>
      <td>${r.pickup_tracking || "—"}</td>
      <td><button class="btn btn-outline btn-sm" onclick="openRegDetail('${r.id}')">Manage</button></td>
    </tr>`).join("") : `<tr><td colspan="5">No active pickup requests.</td></tr>`;

  // Returned / received
  const returned = all.filter(r => r.pickup_status === "received_at_company");
  document.getElementById("courier-returned-body").innerHTML = returned.length ? returned.map(r => `
    <tr>
      <td>${r.profiles?.full_name || "—"}</td>
      <td>${r.projects?.project_name || "—"}</td>
      <td>${r.return_courier_name || "—"}</td>
      <td>${r.return_received_date ? new Date(r.return_received_date).toLocaleDateString("en-IN") : "—"}</td>
    </tr>`).join("") : `<tr><td colspan="4">No projects returned yet.</td></tr>`;
}

// ---------- Payments tab ----------
async function loadPaymentsTab() {
  await Promise.all([loadPaymentStats(), loadPaymentQueue(), loadProjectPaymentReport(), loadCustomerPaymentHistory()]);
}

async function loadPaymentStats() {
  const { data: regs } = await supabaseClient
    .from("registrations")
    .select("registration_payment_status, advance_status, final_status, projects(registration_fee, advance_payment, final_payment)");

  const all = regs || [];
  let received = 0, pending = 0, approved = 0;
  all.forEach(r => {
    const p = r.projects || {};
    if (r.registration_payment_status === "approved") { received += Number(p.registration_fee || 0); approved++; }
    if (r.registration_payment_status === "under_verification" || r.registration_payment_status === "pending") pending++;
    if (r.advance_status === "approved") received += Number(p.advance_payment || 0);
    if (r.final_status === "approved") received += Number(p.final_payment || 0);
  });

  const stats = [
    { label: "Total Received", value: "₹" + received.toLocaleString("en-IN") },
    { label: "Pending Verification", value: pending },
    { label: "Approved Payments", value: approved },
  ];
  document.getElementById("payment-stats-grid").innerHTML = stats.map(s => `<div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`).join("");
}

async function loadPaymentQueue() {
  const { data: regs } = await supabaseClient
    .from("registrations")
    .select("id, registration_utr, payment_screenshot_url, registration_payment_status, profiles(full_name), projects(project_name, registration_fee)")
    .in("registration_payment_status", ["under_verification", "pending", "rejected"])
    .order("created_at", { ascending: false });

  const tbody = document.getElementById("payment-queue-body");
  if (!regs || regs.length === 0) { tbody.innerHTML = `<tr><td colspan="7">No payments pending verification.</td></tr>`; return; }
  tbody.innerHTML = regs.map(r => `
    <tr>
      <td>${r.profiles?.full_name || "—"}</td>
      <td>${r.projects?.project_name || "—"}</td>
      <td><strong>₹${r.projects?.registration_fee || 0}</strong><br><small style="color:var(--text-muted)">expected</small></td>
      <td>${r.registration_utr || "—"}</td>
      <td>${r.payment_screenshot_url ? `<a href="#" onclick="openSecureFile(event, '${r.payment_screenshot_url}')">View</a>` : "—"}</td>
      <td><span class="status-badge status-${r.registration_payment_status}">${r.registration_payment_status.replace(/_/g," ")}</span></td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="quickPaymentAction('${r.id}','approved')">Approve</button>
        <button class="btn btn-outline btn-sm" onclick="quickPaymentAction('${r.id}','rejected')">Reject</button>
      </td>
    </tr>`).join("");
}

async function quickPaymentAction(id, status) {
  let remarks = null;
  if (status === "rejected") remarks = prompt("Enter the reason for rejection:") || "Payment could not be verified";
  const updates = { registration_payment_status: status, registration_fee_paid: status === "approved", updated_at: new Date().toISOString() };
  if (status === "approved") updates.registration_payment_date = new Date().toISOString();
  if (remarks) updates.payment_remarks = remarks;
  await supabaseClient.from("registrations").update(updates).eq("id", id);
  logActivity(status === "approved" ? "Payment approved" : "Payment rejected", id);
  loadPaymentsTab();
  loadRegistrationsTable();
  loadOverviewStats();
}

async function loadProjectPaymentReport() {
  const { data: regs } = await supabaseClient
    .from("registrations")
    .select("registration_payment_status, advance_status, final_status, projects(project_name, registration_fee, advance_payment, final_payment)");

  const byProject = {};
  (regs || []).forEach(r => {
    const name = r.projects?.project_name || "—";
    if (!byProject[name]) byProject[name] = { count: 0, reg: 0, adv: 0, fin: 0 };
    byProject[name].count++;
    if (r.registration_payment_status === "approved") byProject[name].reg += Number(r.projects?.registration_fee || 0);
    if (r.advance_status === "approved") byProject[name].adv += Number(r.projects?.advance_payment || 0);
    if (r.final_status === "approved") byProject[name].fin += Number(r.projects?.final_payment || 0);
  });

  const tbody = document.getElementById("project-payment-report-body");
  const rows = Object.entries(byProject);
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No data.</td></tr>`; return; }
  tbody.innerHTML = rows.map(([name, d]) => `
    <tr><td>${name}</td><td>${d.count}</td><td>₹${d.reg}</td><td>₹${d.adv}</td><td>₹${d.fin}</td></tr>`).join("");
}

async function loadCustomerPaymentHistory() {
  const { data: regs } = await supabaseClient
    .from("registrations")
    .select("registration_payment_status, advance_status, final_status, profiles(full_name), projects(project_name, registration_fee, advance_payment, final_payment)")
    .order("created_at", { ascending: false });

  const tbody = document.getElementById("customer-payment-history-body");
  if (!regs || regs.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No data.</td></tr>`; return; }
  tbody.innerHTML = regs.map(r => `
    <tr>
      <td>${r.profiles?.full_name || "—"}</td>
      <td>${r.projects?.project_name || "—"}</td>
      <td><span class="status-badge status-${r.registration_payment_status || 'pending'}">${(r.registration_payment_status || 'pending').replace(/_/g," ")}</span></td>
      <td><span class="status-badge status-${r.advance_status}">${r.advance_status}</span></td>
      <td><span class="status-badge status-${r.final_status}">${r.final_status}</span></td>
    </tr>`).join("");
}

async function loadProjectHistory() {
  const { data: regs } = await supabaseClient
    .from("registrations")
    .select("pages_completed, handwriting_quality, quality_status, final_status, profiles(full_name), projects(project_name)")
    .eq("project_status", "completed")
    .order("updated_at", { ascending: false });

  const tbody = document.getElementById("project-history-body");
  if (!regs || regs.length === 0) { tbody.innerHTML = `<tr><td colspan="6">No projects completed yet.</td></tr>`; return; }
  tbody.innerHTML = regs.map(r => `
    <tr>
      <td>${r.profiles?.full_name || "—"}</td>
      <td>${r.projects?.project_name || "—"}</td>
      <td>${r.pages_completed ?? "—"}</td>
      <td>${r.handwriting_quality || "—"}</td>
      <td><span class="status-badge status-${r.quality_status}">${(r.quality_status || "").replace(/_/g," ")}</span></td>
      <td><span class="status-badge status-${r.final_status}">${r.final_status}</span></td>
    </tr>`).join("");
}

// ---------- Customers ----------
let allCustomersCache = [];

async function loadCustomersTable() {
  const { data: customers } = await supabaseClient.from("profiles").select("*").eq("is_admin", false).order("created_at", { ascending: false });
  const { data: regs } = await supabaseClient.from("registrations").select("customer_id");
  const regCounts = {};
  (regs || []).forEach(r => { regCounts[r.customer_id] = (regCounts[r.customer_id] || 0) + 1; });

  allCustomersCache = (customers || []).map(c => ({ ...c, reg_count: regCounts[c.id] || 0 }));
  renderCustomersTable(allCustomersCache);
}

function renderCustomersTable(list) {
  const tbody = document.getElementById("customers-body");
  if (!list || list.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No customers found.</td></tr>`; return; }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${c.full_name || "—"}<br><small>${c.customer_id || ""}</small></td>
      <td>${c.mobile || "—"}</td>
      <td>${(c.address || "—").slice(0, 40)}</td>
      <td>${c.reg_count} <button class="btn btn-outline btn-sm" onclick="viewCustomer('${c.id}')" style="margin-left:8px">View</button></td>
      <td>
        <span class="status-badge ${c.is_blocked ? 'status-rejected' : 'status-approved'}">${c.is_blocked ? "Blocked" : "Active"}</span>
        <button class="btn btn-outline btn-sm" onclick="toggleBlockCustomer('${c.id}', ${!c.is_blocked})" style="margin-left:6px">${c.is_blocked ? "Unblock" : "Block"}</button>
      </td>
    </tr>`).join("");
}

async function toggleBlockCustomer(id, block) {
  if (!confirm(block ? "Block this customer's account?" : "Unblock this customer's account?")) return;
  await supabaseClient.from("profiles").update({ is_blocked: block }).eq("id", id);
  logActivity(block ? "Customer blocked" : "Customer unblocked", id);
  loadCustomersTable();
}

function searchCustomers() {
  const q = document.getElementById("customer-search").value.toLowerCase();
  const filtered = allCustomersCache.filter(c =>
    (c.full_name || "").toLowerCase().includes(q) ||
    (c.mobile || "").toLowerCase().includes(q) ||
    (c.address || "").toLowerCase().includes(q)
  );
  renderCustomersTable(filtered);
}

async function viewCustomer(id) {
  const { data: c } = await supabaseClient.from("profiles").select("*").eq("id", id).single();
  const { data: regs } = await supabaseClient.from("registrations").select("*, projects(project_name)").eq("customer_id", id);
  const box = document.getElementById("customer-detail-box");
  box.innerHTML = `
    <h3>${c.full_name || "—"}</h3>
    <div class="info-grid" style="margin-bottom:16px">
      <div><span>Mobile</span><strong>${c.mobile || "—"}</strong></div>
      <div><span>Address</span><strong>${c.address || "—"}</strong></div>
      <div><span>Courier Address</span><strong>${c.courier_address || "—"}</strong></div>
      <div><span>Bank</span><strong>${c.bank_name || "—"} / ${c.bank_account_number || "—"}</strong></div>
    </div>
    <div class="fieldset-title">Registrations</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Project</th><th>Registration ID</th><th>Status</th></tr></thead>
        <tbody>
          ${(regs || []).map(r => `<tr><td>${r.projects?.project_name || "—"}</td><td>${r.registration_number || "—"}</td><td><span class="status-badge status-${r.project_status}">${r.project_status.replace(/_/g," ")}</span></td></tr>`).join("") || '<tr><td colspan="3">No registrations</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  box.style.display = "block";
  box.scrollIntoView({ behavior: "smooth" });
}

// ---------- Activity log ----------
let currentAdminName = "";

async function logActivity(action, details) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;
  await supabaseClient.from("activity_logs").insert({
    admin_id: session.user.id,
    action: action,
    details: details ? String(details) : null,
  });
}

async function loadActivityLog() {
  const { data } = await supabaseClient
    .from("activity_logs")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const tbody = document.getElementById("activity-log-body");
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="4">No activity recorded yet.</td></tr>`; return; }
  tbody.innerHTML = data.map(l => `
    <tr>
      <td>${l.profiles?.full_name || "—"}</td>
      <td>${l.action}</td>
      <td>${l.details || "—"}</td>
      <td>${new Date(l.created_at).toLocaleString("en-IN")}</td>
    </tr>`).join("");
}

// ---------- Landing page: SEO ----------
async function loadSeoForm() {
  const { data } = await supabaseClient.from("company_settings").select("seo_title, seo_description, seo_keywords").eq("id", 1).single();
  if (!data) return;
  const f = document.getElementById("seo-form");
  if (!f) return;
  f.seo_title.value = data.seo_title || "";
  f.seo_description.value = data.seo_description || "";
  f.seo_keywords.value = data.seo_keywords || "";
}

async function handleSeoSave(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("seo-msg");
  const { error } = await supabaseClient.from("company_settings").update({
    seo_title: f.seo_title.value.trim(),
    seo_description: f.seo_description.value.trim(),
    seo_keywords: f.seo_keywords.value.trim(),
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  msg.textContent = error ? error.message : "SEO settings saved.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) logActivity("SEO settings updated", f.seo_title.value.trim());
}

// ---------- Landing page: testimonials ----------
async function loadTestimonialsTable() {
  const { data } = await supabaseClient.from("testimonials").select("*").order("display_order", { ascending: true });
  const tbody = document.getElementById("testimonials-body");
  if (!tbody) return;
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No reviews added yet.</td></tr>`; return; }
  tbody.innerHTML = data.map(t => `
    <tr>
      <td>${t.customer_name}<br><small>${t.location || ""}</small></td>
      <td>${(t.review || "").slice(0, 70)}${(t.review || "").length > 70 ? "…" : ""}</td>
      <td>${"★".repeat(t.rating || 5)}</td>
      <td>${t.is_active ? "Visible" : "Hidden"}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="toggleTestimonial('${t.id}', ${!t.is_active})">${t.is_active ? "Hide" : "Show"}</button>
        <button class="btn btn-outline btn-sm" onclick="deleteTestimonial('${t.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

async function handleTestimonialCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("testimonial-msg");
  const { error } = await supabaseClient.from("testimonials").insert({
    customer_name: f.customer_name.value.trim(),
    location: f.location.value.trim() || null,
    project_name: f.project_name.value.trim() || null,
    review: f.review.value.trim(),
    rating: parseInt(f.rating.value, 10),
    display_order: parseInt(f.display_order.value || 0, 10),
  });
  msg.textContent = error ? error.message : "Review added.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadTestimonialsTable(); logActivity("Review added", f.customer_name.value); }
}

async function toggleTestimonial(id, state) {
  await supabaseClient.from("testimonials").update({ is_active: state }).eq("id", id);
  loadTestimonialsTable();
}
async function deleteTestimonial(id) {
  if (!confirm("Delete this review?")) return;
  await supabaseClient.from("testimonials").delete().eq("id", id);
  loadTestimonialsTable();
}

// ---------- Landing page: FAQ ----------
async function loadFaqsTable() {
  const { data } = await supabaseClient.from("faq_items").select("*").order("display_order", { ascending: true });
  const tbody = document.getElementById("faqs-body");
  if (!tbody) return;
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="4">No FAQs added yet.</td></tr>`; return; }
  tbody.innerHTML = data.map(f => `
    <tr>
      <td>${f.question}</td>
      <td>${(f.answer || "").slice(0, 60)}${(f.answer || "").length > 60 ? "…" : ""}</td>
      <td>${f.is_active ? "Visible" : "Hidden"}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="toggleFaq('${f.id}', ${!f.is_active})">${f.is_active ? "Hide" : "Show"}</button>
        <button class="btn btn-outline btn-sm" onclick="deleteFaq('${f.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

async function handleFaqCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("faq-msg");
  const { error } = await supabaseClient.from("faq_items").insert({
    question: f.question.value.trim(),
    answer: f.answer.value.trim(),
    display_order: parseInt(f.display_order.value || 0, 10),
  });
  msg.textContent = error ? error.message : "FAQ added.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadFaqsTable(); }
}

async function toggleFaq(id, state) {
  await supabaseClient.from("faq_items").update({ is_active: state }).eq("id", id);
  loadFaqsTable();
}
async function deleteFaq(id) {
  if (!confirm("Delete this FAQ?")) return;
  await supabaseClient.from("faq_items").delete().eq("id", id);
  loadFaqsTable();
}

// Uploaded files are private — open them through a short-lived signed link
async function openSecureFile(event, pathOrUrl) {
  event.preventDefault();
  if (pathOrUrl.startsWith("http")) { window.open(pathOrUrl, "_blank"); return; }
  const url = await getSignedUploadUrl(pathOrUrl);
  if (url) window.open(url, "_blank");
  else alert("Could not open the file.");
}

// ---------- Security & Backup ----------
async function loadSecurityTab() {
  loadSecurityAlerts();
  loadLoginHistory();
  loadBackupHistory();
}

async function loadSecurityAlerts() {
  const { data } = await supabaseClient.from("security_alerts").select("*")
    .order("created_at", { ascending: false }).limit(50);
  const tbody = document.getElementById("security-alerts-body");
  if (!tbody) return;
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No security alerts — everything looks fine.</td></tr>`; return; }
  tbody.innerHTML = data.map(a => `
    <tr style="${a.is_resolved ? "opacity:0.55" : ""}">
      <td>${(a.alert_type || "").replace(/_/g, " ")}</td>
      <td><span class="status-badge ${a.severity === "high" ? "status-rejected" : "status-pending"}">${a.severity}</span></td>
      <td>${a.message}</td>
      <td>${new Date(a.created_at).toLocaleString("en-IN")}</td>
      <td>${a.is_resolved ? "Resolved" : `<button class="btn btn-outline btn-sm" onclick="resolveAlert('${a.id}')">Mark Resolved</button>`}</td>
    </tr>`).join("");
}

async function resolveAlert(id) {
  await supabaseClient.from("security_alerts").update({ is_resolved: true }).eq("id", id);
  logActivity("Security alert resolved", id);
  loadSecurityAlerts();
}

async function loadLoginHistory() {
  const { data } = await supabaseClient.from("login_history").select("*")
    .order("created_at", { ascending: false }).limit(100);
  const tbody = document.getElementById("login-history-body");
  if (!tbody) return;
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No login records yet.</td></tr>`; return; }
  tbody.innerHTML = data.map(l => `
    <tr>
      <td>${l.email_attempted || "—"}</td>
      <td><span class="status-badge ${l.was_successful ? "status-approved" : "status-rejected"}">${l.was_successful ? "Success" : "Failed"}</span></td>
      <td>${l.is_admin_login ? "Admin" : "Customer"}</td>
      <td><small>${(l.user_agent || "—").slice(0, 45)}</small></td>
      <td>${new Date(l.created_at).toLocaleString("en-IN")}</td>
    </tr>`).join("");
}

async function createBackup() {
  const msg = document.getElementById("backup-msg");
  const note = document.getElementById("backup-note").value.trim();
  msg.textContent = "Creating backup..."; msg.className = "form-msg";

  const tables = ["profiles", "projects", "registrations", "documents", "testimonials",
                  "faq_items", "site_content", "company_settings", "notifications", "support_messages"];
  const backup = { generated_at: new Date().toISOString(), tables: {} };
  let total = 0;

  for (const t of tables) {
    const { data, error } = await supabaseClient.from(t).select("*");
    if (error) { console.warn(`Skipping ${t}:`, error.message); continue; }
    backup.tables[t] = data;
    total += (data || []).length;
  }

  // Download as JSON
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `aaliya-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);

  const { data: { session } } = await supabaseClient.auth.getSession();
  await supabaseClient.from("backup_history").insert({
    created_by: session.user.id,
    backup_type: "manual_export",
    tables_included: tables.join(", "),
    record_count: total,
    note: note || null,
  });

  msg.textContent = `Backup download ho gaya — ${total} records.`;
  msg.className = "form-msg ok";
  document.getElementById("backup-note").value = "";
  logActivity("Backup created", `${total} records`);
  loadBackupHistory();
}

async function loadBackupHistory() {
  const { data } = await supabaseClient.from("backup_history")
    .select("*, profiles(full_name)").order("created_at", { ascending: false }).limit(30);
  const tbody = document.getElementById("backup-history-body");
  if (!tbody) return;
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No backups created yet.</td></tr>`; return; }
  tbody.innerHTML = data.map(b => `
    <tr>
      <td>${b.profiles?.full_name || "—"}</td>
      <td>${b.backup_type}</td>
      <td>${b.record_count ?? "—"}</td>
      <td>${b.note || "—"}</td>
      <td>${new Date(b.created_at).toLocaleString("en-IN")}</td>
    </tr>`).join("");
}

async function handleLogoutEverywhere() {
  const msg = document.getElementById("logout-all-msg");
  const error = await logoutEverywhere();
  if (error) { msg.textContent = error.message; msg.className = "form-msg error"; return; }
  window.location.href = "admin-login.html";
}

// ---------- Invoices ----------
async function loadInvoicesTable() {
  const { data: regs } = await supabaseClient
    .from("registrations")
    .select("id, registration_number, invoice_number, registration_payment_status, registration_payment_date, profiles(full_name, customer_id), projects(project_name, registration_fee, advance_payment, final_payment)")
    .not("invoice_number", "is", null)
    .order("created_at", { ascending: false });

  const tbody = document.getElementById("invoices-body");
  if (!regs || regs.length === 0) { tbody.innerHTML = `<tr><td colspan="6">No invoices generated yet.</td></tr>`; return; }
  tbody.innerHTML = regs.map(r => {
    const p = r.projects || {};
    const total = Number(p.registration_fee || 0) + Number(p.advance_payment || 0) + Number(p.final_payment || 0);
    return `
    <tr>
      <td>${r.invoice_number}</td>
      <td>${r.registration_number}</td>
      <td>${r.profiles?.full_name || "—"}</td>
      <td>${p.project_name || "—"}</td>
      <td>₹${total.toLocaleString("en-IN")}</td>
      <td><button class="btn btn-outline btn-sm" onclick='printInvoice(${JSON.stringify({ inv: r.invoice_number, reg: r.registration_number, name: r.profiles?.full_name, custId: r.profiles?.customer_id, project: p.project_name, reg_fee: p.registration_fee, adv: p.advance_payment, fin: p.final_payment, status: r.registration_payment_status, date: r.registration_payment_date })})'>View / Print</button></td>
    </tr>`;
  }).join("");
}

function printInvoice(data) {
  const box = document.getElementById("invoice-print-box");
  const total = Number(data.reg_fee || 0) + Number(data.adv || 0) + Number(data.fin || 0);
  box.innerHTML = `
    <div class="card" style="max-width:520px">
      <h3>Invoice ${data.inv}</h3>
      <div class="invoice-box">
        <div class="invoice-row"><span>Registration ID</span><span>${data.reg}</span></div>
        <div class="invoice-row"><span>Customer</span><span>${data.name || "—"}</span></div>
        <div class="invoice-row"><span>Customer ID</span><span>${data.custId || "—"}</span></div>
        <div class="invoice-row"><span>Project</span><span>${data.project || "—"}</span></div>
        <div class="invoice-row"><span>Payment Status</span><span>${(data.status || "pending").replace(/_/g," ")}</span></div>
        <div class="invoice-row"><span>Payment Date</span><span>${data.date ? new Date(data.date).toLocaleDateString("en-IN") : "—"}</span></div>
        <div class="invoice-row"><span>Registration Fee</span><span>₹${data.reg_fee}</span></div>
        <div class="invoice-row"><span>Advance (50%)</span><span>₹${data.adv}</span></div>
        <div class="invoice-row"><span>Final (50%)</span><span>₹${data.fin}</span></div>
        <div class="invoice-row"><span>Total</span><span>₹${total}</span></div>
      </div>
      <button class="btn btn-primary" style="margin-top:14px" onclick="window.print()">Print / Save as PDF</button>
    </div>`;
  box.style.display = "block";
  box.scrollIntoView({ behavior: "smooth" });
}

// ---------- Content (CMS) ----------
async function loadContentForm() {
  const { data } = await supabaseClient.from("site_content").select("*");
  if (!data) return;
  const f = document.getElementById("content-form");
  data.forEach(row => { if (f[row.content_key]) f[row.content_key].value = row.content_value || ""; });
}

async function handleContentSave(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("content-msg");
  const keys = ["homepage_hero_text", "about_us", "work_process", "faq", "terms_conditions", "privacy_policy", "refund_policy", "contact_page", "data_protection_policy"];
  const rows = keys.map(k => ({ content_key: k, content_value: f[k].value, updated_at: new Date().toISOString() }));
  const { error } = await supabaseClient.from("site_content").upsert(rows);
  msg.textContent = error ? error.message : "Content saved — it appears on the website immediately.";
  msg.className = "form-msg " + (error ? "error" : "ok");
}

// ---------- Notifications ----------
async function loadNotifyCustomerOptions() {
  const { data: customers } = await supabaseClient.from("profiles").select("id, full_name").eq("is_admin", false);
  const select = document.getElementById("notify-customer");
  select.innerHTML = (customers || []).map(c => `<option value="${c.id}">${c.full_name || c.id}</option>`).join("");
}

async function handleNotifySend(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("notify-msg");
  const { error } = await supabaseClient.from("notifications").insert({
    customer_id: f.customer_id.value,
    type: f.type.value,
    message: f.message.value.trim(),
  });
  msg.textContent = error ? error.message : "Notification bhej diya.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadNotificationsTable(); }
}

async function loadNotificationsTable() {
  const { data } = await supabaseClient
    .from("notifications")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(30);
  const tbody = document.getElementById("notifications-body");
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="4">No notifications sent yet.</td></tr>`; return; }
  tbody.innerHTML = data.map(n => `
    <tr>
      <td>${n.profiles?.full_name || "—"}</td>
      <td><span class="status-badge status-approved">${(n.type || "").replace(/_/g," ")}</span></td>
      <td>${n.message}</td>
      <td>${new Date(n.created_at).toLocaleString("en-IN")}</td>
    </tr>`).join("");
}


// ---------- Automatic reminders ----------
async function sendDueReminders() {
  const msg = document.getElementById("reminders-msg");
  msg.textContent = "Sending reminders..."; msg.className = "form-msg";
  const { data, error } = await supabaseClient.rpc("send_due_reminders");
  if (error) {
    msg.textContent = error.message;
    msg.className = "form-msg error";
    return;
  }
  msg.textContent = `${data ?? 0} reminders bhej diye gaye.`;
  msg.className = "form-msg ok";
  logActivity("Reminders sent", `${data ?? 0} notifications`);
  loadNotificationsTable();
}

// ---------- Logout ----------
async function handleAdminLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = "admin-login.html";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("admin-login-form")?.addEventListener("submit", handleAdminLogin);
  document.getElementById("forgot-password-link")?.addEventListener("click", (e) => { e.preventDefault(); handleForgotPassword(); });
  document.getElementById("send-reset-btn")?.addEventListener("click", handleAdminPasswordReset);
  document.getElementById("settings-form")?.addEventListener("submit", handleSettingsSave);
  document.getElementById("popup-form")?.addEventListener("submit", handlePopupSave);
  document.getElementById("popup-image-file")?.addEventListener("change", handlePopupImage);
  document.getElementById("project-form")?.addEventListener("submit", handleProjectCreate);
  document.getElementById("content-form")?.addEventListener("submit", handleContentSave);
  document.getElementById("notify-form")?.addEventListener("submit", handleNotifySend);
  document.getElementById("send-reminders-btn")?.addEventListener("click", sendDueReminders);
  document.getElementById("customer-search")?.addEventListener("input", searchCustomers);
  document.getElementById("reg-status-filter")?.addEventListener("change", filterRegistrationsTable);
  document.getElementById("reg-search")?.addEventListener("input", filterRegistrationsTable);
  document.getElementById("profile-form")?.addEventListener("submit", handleProfileSave);
  document.getElementById("seo-form")?.addEventListener("submit", handleSeoSave);
  document.getElementById("create-backup-btn")?.addEventListener("click", createBackup);
  document.getElementById("logout-everywhere-btn")?.addEventListener("click", handleLogoutEverywhere);
  document.getElementById("testimonial-form")?.addEventListener("submit", handleTestimonialCreate);
  document.getElementById("faq-form")?.addEventListener("submit", handleFaqCreate);
  document.getElementById("logout-btn")?.addEventListener("click", handleAdminLogout);
  if (document.getElementById("admin-name")) adminGuard();
});
