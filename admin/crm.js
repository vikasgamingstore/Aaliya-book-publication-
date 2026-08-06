// ============================================================
// Customer Support CRM — Aaliya Book Publication
// ============================================================

const ENQUIRY_STATUS_LABELS = {
  pending_followup: "Pending Follow-up", contacted: "Contacted", interested: "Interested",
  registration_completed: "Registration Completed", not_interested: "Not Interested", closed: "Closed",
};
const TICKET_CATEGORY_LABELS_ADMIN = {
  registration_issue: "Registration Issue", payment_issue: "Payment Issue",
  courier_issue: "Courier Issue", project_issue: "Project Issue",
  account_issue: "Account Issue", other: "Other Query",
};

let enquiriesCache = [];
let enquiryFilter = "all";
let ticketsCache = [];
let ticketFilterCrm = "all";

function cTitle(s) { return (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function cDate(d) { return d ? new Date(d).toLocaleDateString("en-IN") : "—"; }
function cDateTime(d) { return d ? new Date(d).toLocaleString("en-IN") : "—"; }

// ------------------------------------------------------------
// CRM stats
// ------------------------------------------------------------
async function loadCrmStats() {
  const { data } = await supabaseClient.from("crm_summary").select("*").single();
  const box = document.getElementById("crm-stats");
  if (!box || !data) return;

  const conversionRate = data.total_enquiries > 0
    ? Math.round((data.converted_enquiries / data.total_enquiries) * 100) + "%"
    : "—";

  const stats = [
    { label: "Total Enquiries", value: data.total_enquiries },
    { label: "Conversion Rate", value: conversionRate },
    { label: "Pending Follow-ups", value: data.due_followups },
    { label: "Open Tickets", value: data.open_tickets },
    { label: "Total Tickets", value: data.total_tickets },
  ];
  box.innerHTML = stats.map(s => `<div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`).join("");
}

// ------------------------------------------------------------
// WhatsApp settings
// ------------------------------------------------------------
async function loadWhatsappSettings() {
  const { data } = await supabaseClient.from("company_settings")
    .select("whatsapp_number, whatsapp_support_timing, whatsapp_welcome_message, whatsapp_auto_reply")
    .eq("id", 1).single();
  const f = document.getElementById("whatsapp-settings-form");
  if (!f || !data) return;
  f.whatsapp_number.value = data.whatsapp_number || "";
  f.whatsapp_support_timing.value = data.whatsapp_support_timing || "";
  f.whatsapp_welcome_message.value = data.whatsapp_welcome_message || "";
  f.whatsapp_auto_reply.value = data.whatsapp_auto_reply || "";
}

async function handleWhatsappSettingsSave(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("whatsapp-settings-msg");
  const { error } = await supabaseClient.from("company_settings").update({
    whatsapp_number: f.whatsapp_number.value.trim(),
    whatsapp_support_timing: f.whatsapp_support_timing.value.trim(),
    whatsapp_welcome_message: f.whatsapp_welcome_message.value.trim(),
    whatsapp_auto_reply: f.whatsapp_auto_reply.value.trim(),
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  msg.textContent = error ? error.message : "व्हाट्सएप सेटिंग्स सेव हो गईं।";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error && typeof logActivity === "function") logActivity("WhatsApp settings updated", "");
}

// ------------------------------------------------------------
// Enquiries
// ------------------------------------------------------------
async function loadEnquiries() {
  const { data } = await supabaseClient
    .from("enquiries").select("*, staff:assigned_to(full_name)")
    .order("created_at", { ascending: false });
  enquiriesCache = data || [];
  renderEnquiries();
}

function renderEnquiries() {
  const tbody = document.getElementById("enquiries-body");
  if (!tbody) return;
  const list = enquiryFilter === "all" ? enquiriesCache : enquiriesCache.filter(e => e.status === enquiryFilter);

  if (list.length === 0) { tbody.innerHTML = `<tr><td colspan="7">No enquiries match this filter.</td></tr>`; return; }

  tbody.innerHTML = list.map(en => `
    <tr>
      <td>${en.enquiry_number || "—"}</td>
      <td>${en.full_name}</td>
      <td>${en.mobile}</td>
      <td>${en.project_interest || "General"}</td>
      <td>${cDate(en.created_at)}</td>
      <td><span class="status-badge status-${en.status}">${ENQUIRY_STATUS_LABELS[en.status] || cTitle(en.status)}</span></td>
      <td><button class="btn btn-outline btn-sm" onclick="openEnquiryDetail('${en.id}')">Manage</button></td>
    </tr>`).join("");
}

function openEnquiryDetail(id) {
  const en = enquiriesCache.find(e => e.id === id);
  if (!en) return;
  const box = document.getElementById("enquiry-detail-box");

  box.innerHTML = `
    <h3>${en.enquiry_number} — ${en.full_name}</h3>
    <div class="info-grid" style="margin-bottom:16px">
      <div><span>Mobile</span><strong>${en.mobile}</strong></div>
      <div><span>Email</span><strong>${en.email || "—"}</strong></div>
      <div><span>Interested Project</span><strong>${en.project_interest || "General"}</strong></div>
      <div><span>Preferred Contact</span><strong>${cTitle(en.preferred_contact)}</strong></div>
      <div><span>Message</span><strong>${en.message || "—"}</strong></div>
    </div>

    <div class="fieldset-title">Follow-up Management</div>
    <div class="form-grid">
      <div class="field">
        <label>Status</label>
        <select id="enq-status">
          ${Object.entries(ENQUIRY_STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${en.status === k ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Assign To</label>
        <select id="enq-assignee"><option value="">— Unassigned —</option></select>
      </div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Follow-up Date</label><input type="date" id="enq-followup-date" value="${en.follow_up_date || ""}"></div>
      <div class="field"><label>Reminder Time</label><input type="time" id="enq-followup-time" value="${en.follow_up_time || ""}"></div>
    </div>
    <div class="field"><label>Follow-up Notes</label><textarea id="enq-notes" rows="2">${en.follow_up_notes || ""}</textarea></div>

    <div class="fieldset-title">Communication Log</div>
    <div id="enq-comm-log" style="margin-bottom:10px"></div>
    <div class="form-grid">
      <div class="field">
        <label>Channel</label>
        <select id="comm-channel">
          <option value="whatsapp">WhatsApp</option>
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="in_person">In Person</option>
        </select>
      </div>
      <div class="field"><label>Note</label><input type="text" id="comm-note" placeholder="Write a summary of the conversation..."></div>
    </div>
    <button class="btn btn-outline btn-sm" onclick="addCommunicationLog(null, '${en.id}')">Add Log</button>

    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="saveEnquiryDetail('${en.id}')">Save Changes</button>
      <a class="btn btn-outline" target="_blank" href="https://wa.me/${en.mobile.replace(/[^0-9]/g,"")}?text=${encodeURIComponent("Namaste " + en.full_name + ", Aaliya Book Publication se baat kar rahe hain.")}">WhatsApp</a>
    </div>
    <div id="enq-save-msg" class="form-msg"></div>`;

  box.style.display = "block";
  loadStaffAssigneeOptions("enq-assignee", en.assigned_to);
  loadCommunicationLog(null, en.id);
  box.scrollIntoView({ behavior: "smooth" });
}

async function loadStaffAssigneeOptions(selectId, selectedId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const { data } = await supabaseClient.from("profiles").select("id, full_name").eq("is_admin", true).eq("staff_status", "active");
  (data || []).forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.full_name || "Staff";
    if (s.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
}

async function saveEnquiryDetail(id) {
  const msg = document.getElementById("enq-save-msg");
  const updates = {
    status: document.getElementById("enq-status").value,
    assigned_to: document.getElementById("enq-assignee").value || null,
    follow_up_date: document.getElementById("enq-followup-date").value || null,
    follow_up_time: document.getElementById("enq-followup-time").value || null,
    follow_up_notes: document.getElementById("enq-notes").value.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseClient.from("enquiries").update(updates).eq("id", id);
  msg.textContent = error ? error.message : "बदलाव सेव हो गए।";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { if (typeof logActivity === "function") logActivity("Enquiry updated", updates.status); loadEnquiries(); loadCrmStats(); }
}

// ------------------------------------------------------------
// Communication log (shared by enquiries + customers)
// ------------------------------------------------------------
async function loadCommunicationLog(customerId, enquiryId) {
  const box = document.getElementById("enq-comm-log") || document.getElementById("cust-comm-log");
  if (!box) return;

  let query = supabaseClient.from("communication_log").select("*, staff:logged_by(full_name)").order("created_at", { ascending: false });
  query = customerId ? query.eq("customer_id", customerId) : query.eq("enquiry_id", enquiryId);

  const { data } = await query;
  if (!data || data.length === 0) { box.innerHTML = '<p class="field-hint">No communication log yet.</p>'; return; }

  box.innerHTML = data.map(l => `
    <div style="padding:8px 0;border-bottom:1px dotted var(--line);font-size:0.86rem">
      <span class="status-badge status-approved">${cTitle(l.channel)}</span>
      <span style="color:var(--text-muted)"> · ${cDateTime(l.created_at)} · ${l.staff?.full_name || "Staff"}</span>
      <p style="margin:4px 0 0">${l.notes}</p>
    </div>`).join("");
}

async function addCommunicationLog(customerId, enquiryId) {
  const channel = document.getElementById("comm-channel").value;
  const note = document.getElementById("comm-note").value.trim();
  if (!note) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  await supabaseClient.from("communication_log").insert({
    customer_id: customerId, enquiry_id: enquiryId, channel, notes: note, logged_by: session.user.id,
  });
  document.getElementById("comm-note").value = "";
  loadCommunicationLog(customerId, enquiryId);
}

// ------------------------------------------------------------
// Support tickets (admin side)
// ------------------------------------------------------------
async function loadTicketsAdmin() {
  const { data } = await supabaseClient
    .from("support_tickets")
    .select("*, profiles(full_name, mobile), staff:assigned_to(full_name)")
    .order("created_at", { ascending: false });
  ticketsCache = data || [];
  renderTicketsAdmin();
}

function renderTicketsAdmin() {
  const tbody = document.getElementById("tickets-admin-body");
  if (!tbody) return;
  const list = ticketFilterCrm === "all" ? ticketsCache : ticketsCache.filter(t => t.status === ticketFilterCrm);

  if (list.length === 0) { tbody.innerHTML = `<tr><td colspan="6">No tickets match this filter.</td></tr>`; return; }

  tbody.innerHTML = list.map(t => `
    <tr>
      <td>${t.ticket_number}</td>
      <td>${t.profiles?.full_name || "—"}<br><small>${t.profiles?.mobile || ""}</small></td>
      <td>${TICKET_CATEGORY_LABELS_ADMIN[t.category] || cTitle(t.category)}</td>
      <td>${t.subject}</td>
      <td><span class="status-badge status-${t.status}">${cTitle(t.status)}</span></td>
      <td><button class="btn btn-outline btn-sm" onclick="openTicketDetail('${t.id}')">Manage</button></td>
    </tr>`).join("");
}

async function openTicketDetail(id) {
  const t = ticketsCache.find(x => x.id === id);
  if (!t) return;
  const box = document.getElementById("ticket-detail-box");

  box.innerHTML = `
    <h3>${t.ticket_number} — ${t.subject}</h3>
    <div class="info-grid" style="margin-bottom:16px">
      <div><span>Customer</span><strong>${t.profiles?.full_name || "—"}</strong></div>
      <div><span>Mobile</span><strong>${t.profiles?.mobile || "—"}</strong></div>
      <div><span>Category</span><strong>${TICKET_CATEGORY_LABELS_ADMIN[t.category] || cTitle(t.category)}</strong></div>
      <div><span>Created</span><strong>${cDateTime(t.created_at)}</strong></div>
    </div>
    ${t.description ? `<p class="desc">${t.description}</p>` : ""}

    <div class="form-grid">
      <div class="field">
        <label>Status</label>
        <select id="ticket-status">
          <option value="open" ${t.status==='open'?'selected':''}>Open</option>
          <option value="in_progress" ${t.status==='in_progress'?'selected':''}>In Progress</option>
          <option value="resolved" ${t.status==='resolved'?'selected':''}>Resolved</option>
          <option value="closed" ${t.status==='closed'?'selected':''}>Closed</option>
        </select>
      </div>
      <div class="field">
        <label>Assign To</label>
        <select id="ticket-assignee"><option value="">— Unassigned —</option></select>
      </div>
    </div>
    <button class="btn btn-primary btn-sm" onclick="saveTicketDetail('${t.id}')">Save</button>
    <div id="ticket-save-msg" class="form-msg"></div>

    <div class="fieldset-title" style="margin-top:16px">Conversation</div>
    <div id="ticket-thread-admin" style="margin-bottom:10px"></div>
    <div class="form-grid">
      <div class="field"><label>Reply to customer</label><input type="text" id="ticket-reply-text" placeholder="Write a reply..."></div>
      <div class="field"><label>&nbsp;</label><label class="perm-item"><input type="checkbox" id="ticket-internal-note"> Internal note only</label></div>
    </div>
    <button class="btn btn-outline btn-sm" onclick="sendTicketReplyAdmin('${t.id}')">Send</button>`;

  box.style.display = "block";
  loadStaffAssigneeOptions("ticket-assignee", t.assigned_to);
  loadTicketThreadAdmin(t.id);
  box.scrollIntoView({ behavior: "smooth" });
}

async function saveTicketDetail(id) {
  const msg = document.getElementById("ticket-save-msg");
  const updates = {
    status: document.getElementById("ticket-status").value,
    assigned_to: document.getElementById("ticket-assignee").value || null,
  };
  const { error } = await supabaseClient.from("support_tickets").update(updates).eq("id", id);
  msg.textContent = error ? error.message : "सेव हो गया।";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { if (typeof logActivity === "function") logActivity("Ticket updated", updates.status); loadTicketsAdmin(); loadCrmStats(); }
}

async function loadTicketThreadAdmin(ticketId) {
  const box = document.getElementById("ticket-thread-admin");
  const { data } = await supabaseClient.from("ticket_replies").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
  if (!data || data.length === 0) { box.innerHTML = '<p class="field-hint">No messages.</p>'; return; }
  box.innerHTML = data.map(r => `
    <div style="padding:6px 0;border-top:1px dotted var(--line);font-size:0.88rem">
      <span class="status-badge ${r.is_internal_note ? "status-rejected" : "status-approved"}">${r.is_internal_note ? "Internal Note" : (r.sender_type === "staff" ? "Staff Reply" : "Customer")}</span>
      <span style="color:var(--text-muted)"> · ${cDateTime(r.created_at)}</span>
      <p style="margin:4px 0 0">${r.message}</p>
    </div>`).join("");
}

async function sendTicketReplyAdmin(ticketId) {
  const message = document.getElementById("ticket-reply-text").value.trim();
  const isInternal = document.getElementById("ticket-internal-note").checked;
  if (!message) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  await supabaseClient.from("ticket_replies").insert({
    ticket_id: ticketId, sender_id: session.user.id, sender_type: "staff",
    message, is_internal_note: isInternal,
  });
  document.getElementById("ticket-reply-text").value = "";
  loadTicketThreadAdmin(ticketId);
}

// ------------------------------------------------------------
// Customer segmentation
// ------------------------------------------------------------
async function loadSegment(segment) {
  const tbody = document.getElementById("segment-body");
  tbody.innerHTML = `<tr><td colspan="3">Loading...</td></tr>`;

  if (segment === "new_enquiries") {
    const { data } = await supabaseClient.from("enquiries").select("*").in("status", ["pending_followup", "contacted"]).order("created_at", { ascending: false });
    tbody.innerHTML = (data || []).map(e => `<tr><td>${e.full_name}</td><td>${e.mobile}</td><td>${ENQUIRY_STATUS_LABELS[e.status]}</td></tr>`).join("") || `<tr><td colspan="3">No records.</td></tr>`;
    return;
  }

  const { data: regs } = await supabaseClient
    .from("registrations")
    .select("*, profiles(full_name, mobile), projects(project_name)")
    .order("created_at", { ascending: false });

  let filtered = [];
  if (segment === "registered") filtered = regs || [];
  else if (segment === "active_projects") filtered = (regs || []).filter(r => !["completed", "cancelled"].includes(r.project_status));
  else if (segment === "completed_projects") filtered = (regs || []).filter(r => r.project_status === "completed");
  else if (segment === "pending_payments") filtered = (regs || []).filter(r => r.registration_payment_status !== "approved" || r.advance_status === "pending" || r.final_status === "pending");

  tbody.innerHTML = filtered.length
    ? filtered.map(r => `<tr><td>${r.profiles?.full_name || "—"}</td><td>${r.profiles?.mobile || "—"}</td><td>${r.projects?.project_name || "—"} — ${cTitle(r.project_status)}</td></tr>`).join("")
    : `<tr><td colspan="3">No records.</td></tr>`;
}

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
function initCrm() {
  document.getElementById("whatsapp-settings-form")?.addEventListener("submit", handleWhatsappSettingsSave);

  document.querySelectorAll("[data-enq-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-enq-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      enquiryFilter = btn.dataset.enqFilter;
      renderEnquiries();
    });
  });

  document.querySelectorAll("[data-ticket-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-ticket-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      ticketFilterCrm = btn.dataset.ticketFilter;
      renderTicketsAdmin();
    });
  });

  document.querySelectorAll("[data-segment]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-segment]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadSegment(btn.dataset.segment);
    });
  });

  loadCrmStats();
  loadWhatsappSettings();
  loadEnquiries();
  loadTicketsAdmin();
}
