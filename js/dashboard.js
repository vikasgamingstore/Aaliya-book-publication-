// ============================================================
// Customer dashboard: auth guard, registrations, tracking,
// payments, courier, start/progress/complete, uploads, support
// ============================================================

let currentUser = null;
let currentProfile = null;

const CUSTOMER_STAGE_STEPS = [
  { label: "Registration Completed", done: r => r.status === "approved" },
  { label: "Advance Payment Approved", done: r => r.advance_status === "approved" },
  { label: "Parcel Delivered", done: r => r.courier_out_status === "delivered" },
  { label: "Project Started", done: r => !!r.project_started_at },
  { label: "In Progress", done: r => (r.progress_percent || 0) >= 25 || r.project_status === "in_progress" },
  { label: "Completed", done: r => r.completion_marked_by_customer },
  { label: "Under Quality Check", done: r => ["under_review","approved","need_correction","rejected"].includes(r.quality_status) && r.quality_status !== "under_review" },
  { label: "Approved", done: r => r.quality_status === "approved" },
  { label: "Payment Released", done: r => r.final_status === "approved" },
];

const COURIER_OUT_LABELS = {
  not_prepared: "Not Prepared", parcel_preparing: "Parcel Preparing", parcel_ready: "Parcel Ready",
  dispatched: "Dispatched", picked_up_by_courier: "Courier Picked Up", in_transit: "In Transit",
  out_for_delivery: "Out For Delivery", delivered: "Delivered",
};
const PICKUP_LABELS = {
  not_requested: "Not Requested", requested: "Pickup Requested", courier_assigned: "Courier Assigned",
  pickup_scheduled: "Pickup Scheduled", picked_up: "Picked Up", received_at_company: "Received at Company",
};

function fmtDate(d) { return d ? new Date(d).toLocaleDateString("en-IN") : "—"; }
function fmtDateTime(d) { return d ? new Date(d).toLocaleString("en-IN") : "—"; }
function fmtMoney(n) { return "₹" + (Number(n || 0)).toLocaleString("en-IN"); }
function daysRemaining(deadline) {
  const diff = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "Deadline passed";
  if (diff === 0) return "Due today";
  return diff + " days left";
}

async function guardAndLoad() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = "login.html"; return; }
  currentUser = session.user;

  const { data: profile } = await supabaseClient.from("profiles").select("*").eq("id", currentUser.id).single();
  currentProfile = profile;

  const name = profile?.full_name || currentUser.email;
  document.getElementById("welcome-name").textContent = name;
  document.getElementById("customer-id-display").textContent = profile?.customer_id || "—";
  const avatar = document.getElementById("app-avatar");
  if (avatar) avatar.textContent = (name || "A").trim().charAt(0).toUpperCase();

  renderProfileDetails();
  loadMyTickets();
  loadReferralSection();
  loadRewards();
  loadOnboarding();
  loadRegistrations();
  loadNotifications();
}

function renderProfileDetails() {
  const box = document.getElementById("profile-details");
  if (!box || !currentProfile) return;
  const p = currentProfile;
  box.innerHTML = `
    <h3>My Details</h3>
    <div class="info-grid">
      <div><span>Name</span><strong>${p.full_name || "—"}</strong></div>
      <div><span>Customer ID</span><strong>${p.customer_id || "—"}</strong></div>
      <div><span>Mobile</span><strong>${p.mobile || "—"}</strong></div>
      <div><span>Email</span><strong>${currentUser.email}</strong></div>
      <div><span>Address</span><strong>${p.address || "—"}</strong></div>
      <div><span>Courier Address</span><strong>${p.courier_address || "—"}</strong></div>
      <div><span>Bank</span><strong>${p.bank_name || "—"}</strong></div>
      <div><span>Account</span><strong>${p.bank_account_number ? "••••" + String(p.bank_account_number).slice(-4) : "—"}</strong></div>
    </div>
    <p class="field-hint" style="margin-top:12px">Details badalne ke liye support se sampark kariye.</p>`;
}

async function loadRegistrations() {
  const { data: regs, error } = await supabaseClient
    .from("registrations")
    .select("*, projects(project_name, description, num_pages, duration_days, instructions, registration_fee, advance_payment, final_payment)")
    .eq("customer_id", currentUser.id)
    .order("created_at", { ascending: false });

  const wrap = document.getElementById("registrations-wrap");
  registrationsCache = regs || [];
  renderStatusCards(regs || []);
  renderActionHint(regs || []);
  loadFeedbackSection(regs || []);
  renderPaymentsSection(regs || []);

  if (error || !regs || regs.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Abhi koi project registration nahi hai. <a href="index.html#projects">Project select kariye</a> aur apply kariye.</div>';
    return;
  }

  wrap.innerHTML = regs.map(r => renderRegistrationCard(r)).join("");

  regs.forEach(r => {
    document.getElementById(`confirm-delivery-btn-${r.id}`)?.addEventListener("click", () => confirmDelivery(r));
    document.getElementById(`progress-btn-${r.id}`)?.addEventListener("click", () => toggleProgressForm(r.id));
    document.getElementById(`progress-form-${r.id}`)?.addEventListener("submit", (e) => saveProgress(e, r.id));
    document.getElementById(`complete-btn-${r.id}`)?.addEventListener("click", () => markCompleted(r.id));
    document.getElementById(`resubmit-btn-${r.id}`)?.addEventListener("click", () => resubmitProject(r.id));
    document.getElementById(`support-form-${r.id}`)?.addEventListener("submit", (e) => sendSupport(e, r.id));
    document.getElementById(`invoice-btn-${r.id}`)?.addEventListener("click", () => downloadInvoice(r));
    ["required_document", "payment_screenshot", "completion_image"].forEach(docType => {
      document.getElementById(`upload-${docType}-${r.id}`)?.addEventListener("change", (e) => handleUpload(e, r.id, docType));
    });
    loadDocuments(r.id);
  });
}

// ---------- App-style status cards (Home tab) ----------
function renderStatusCards(regs) {
  const box = document.getElementById("app-status-cards");
  if (!box) return;

  const active = regs.find(r => !["completed", "cancelled"].includes(r.project_status)) || regs[0];
  if (!active) {
    box.innerHTML = `<div class="empty-state" style="grid-column:1/-1">Abhi koi active project nahi hai. <a href="index.html#projects">Naya project chuniye</a>.</div>`;
    return;
  }

  const paymentLabel = active.final_status === "approved" ? "Fully Paid"
    : active.advance_status === "approved" ? "Advance Paid"
    : active.registration_payment_status === "approved" ? "Registration Paid"
    : active.registration_payment_status === "under_verification" ? "Under Verification"
    : "Pending";

  const progress = active.progress_percent || 0;
  const deadlineText = active.deadline
    ? `${fmtDate(active.deadline)} · ${daysRemaining(active.deadline)}`
    : "Deadline abhi set nahi";

  box.innerHTML = `
    <div class="app-card card-project">
      <div class="card-label">Active Project</div>
      <div class="card-value">${active.projects?.project_name || "—"}</div>
      <div class="card-sub">${(active.project_status || "").replace(/_/g, " ")} · ID ${active.registration_number || "pending"}</div>
    </div>

    <div class="app-card card-payment">
      <div class="card-label">Payment Status</div>
      <div class="card-value">${paymentLabel}</div>
      <div class="card-sub">${fmtMoney(active.projects?.advance_payment)} advance · ${fmtMoney(active.projects?.final_payment)} final</div>
    </div>

    <div class="app-card card-courier">
      <div class="card-label">Courier Tracking</div>
      <div class="card-value">${COURIER_OUT_LABELS[active.courier_out_status] || "—"}</div>
      <div class="card-sub">${active.courier_out_tracking ? "Tracking: " + active.courier_out_tracking : (active.courier_company_name || "Tracking jald update hoga")}</div>
    </div>

    <div class="app-card">
      <div class="card-label">Project Progress</div>
      <div class="card-value">${progress}% Completed</div>
      <div class="card-sub">${deadlineText}</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
    </div>`;
}

// ---------- Payments tab ----------
function renderPaymentsSection(regs) {
  const box = document.getElementById("payments-wrap");
  if (!box) return;
  if (!regs || regs.length === 0) {
    box.innerHTML = '<div class="empty-state">Abhi koi payment record nahi hai.</div>';
    return;
  }

  box.innerHTML = regs.map(r => {
    const p = r.projects || {};
    return `
    <div class="card">
      <h3>${p.project_name || "Project"}</h3>
      <div class="info-grid" style="margin-bottom:12px">
        <div><span>Registration Fee</span><strong class="status-badge status-${r.registration_payment_status || 'pending'}">${(r.registration_payment_status || 'pending').replace(/_/g," ")} — ${fmtMoney(p.registration_fee)}</strong></div>
        <div><span>Advance (50%)</span><strong class="status-badge status-${r.advance_status}">${r.advance_status} — ${fmtMoney(p.advance_payment)}</strong></div>
        <div><span>Final (50%)</span><strong class="status-badge status-${r.final_status}">${r.final_status} — ${fmtMoney(p.final_payment)}</strong></div>
      </div>
      ${(r.registration_payment_status === 'pending' || r.registration_payment_status === 'rejected')
        ? `<a href="payment.html?reg=${r.id}" class="btn btn-brass btn-sm">Pay Registration Fee</a>` : ""}
      ${r.registration_number ? `<button class="btn btn-outline btn-sm" onclick="downloadInvoiceById('${r.id}')">Download Invoice</button>` : ""}
      <div class="fieldset-title" style="margin-top:16px">Payment History</div>
      <ul style="font-size:0.86rem;color:var(--text-muted);padding-left:18px;margin:0">
        ${r.registration_payment_status === 'approved' ? `<li>Registration fee approved ${fmtDate(r.registration_payment_date)} — UTR: ${r.registration_utr || "—"}${r.receipt_number ? " · Receipt: " + r.receipt_number : ""}</li>` : ""}
        ${r.registration_payment_status === 'under_verification' ? `<li>Registration fee submitted, under verification</li>` : ""}
        ${r.advance_status === 'approved' ? `<li>Advance payment approved ${fmtDate(r.advance_approved_at)}${r.advance_utr ? " — Ref: " + r.advance_utr : ""}</li>` : ""}
        ${r.final_status === 'approved' ? `<li>Final payment approved ${fmtDate(r.final_approved_at)}${r.final_utr ? " — Ref: " + r.final_utr : ""}</li>` : ""}
        ${(!r.registration_payment_status || r.registration_payment_status === 'pending') && r.advance_status !== 'approved' && r.final_status !== 'approved' ? `<li>Koi payment abhi record nahi hui</li>` : ""}
      </ul>
    </div>`;
  }).join("");
}

let registrationsCache = [];
async function downloadInvoiceById(id) {
  const r = registrationsCache.find(x => x.id === id);
  if (r) downloadInvoice(r);
}

function renderRegistrationCard(r) {
  const p = r.projects || {};

  let currentFound = false;
  const tracker = CUSTOMER_STAGE_STEPS.map(s => {
    const isDone = s.done(r);
    let cls = "";
    if (isDone) cls = "done";
    else if (!currentFound) { cls = "current"; currentFound = true; }
    return `<div class="tracker-step ${cls}"><div class="tracker-dot">${isDone ? "✓" : "•"}</div><div class="tracker-label">${s.label}</div></div>`;
  }).join("");

  return `
  <div class="card">
    <h3>${p.project_name || "Project"} <span class="status-badge status-${r.status}">${r.status}</span></h3>

    <div class="fieldset-title">My Project</div>
    <div class="info-grid" style="margin-bottom:16px">
      <div><span>Registration ID</span><strong>${r.registration_number || "Pending approval"}</strong></div>
      <div><span>Pages</span><strong>${p.num_pages || "—"} A4</strong></div>
      <div><span>Duration</span><strong>${p.duration_days || "—"} days</strong></div>
      <div><span>Start Date</span><strong>${fmtDate(r.project_started_at)}</strong></div>
      <div><span>Deadline</span><strong>${fmtDate(r.deadline)}</strong></div>
      ${r.deadline && !["completed","cancelled"].includes(r.project_status) ? `<div><span>Days Remaining</span><strong>${daysRemaining(r.deadline)}</strong></div>` : ""}
    </div>
    ${p.description ? `<p class="desc">${p.description}</p>` : ""}
    ${p.instructions ? `<p class="desc"><strong>Instructions:</strong> ${p.instructions}</p>` : ""}

    <div class="fieldset-title">Project Status</div>
    <div class="tracker">${tracker}</div>

    <div style="margin:14px 0;display:flex;gap:10px;flex-wrap:wrap">
      ${r.courier_out_status === "delivered" && !r.delivery_confirmed_by_customer ? `<button id="confirm-delivery-btn-${r.id}" class="btn btn-primary btn-sm">Confirm Parcel Received</button>` : ""}
      ${r.project_status === "in_progress" ? `<button id="progress-btn-${r.id}" class="btn btn-outline btn-sm">Update Progress</button>` : ""}
      ${r.project_status === "in_progress" && !r.completion_marked_by_customer ? `<button id="complete-btn-${r.id}" class="btn btn-primary btn-sm">Submit Completed Project</button>` : ""}
      ${r.quality_status === "need_correction" ? `<button id="resubmit-btn-${r.id}" class="btn btn-primary btn-sm">Mark Corrections Done — Resubmit</button>` : ""}
    </div>
    ${r.progress_percent ? `<p class="field-hint">Progress: ${r.progress_percent}% Completed</p>` : ""}
    <form id="progress-form-${r.id}" style="display:none;margin-bottom:10px" class="form-grid">
      <div class="field">
        <label>Progress</label>
        <select name="percent">
          <option value="0" ${!(r.progress_percent) ? 'selected' : ''}>Not Started</option>
          <option value="25" ${r.progress_percent==25?'selected':''}>25% Completed</option>
          <option value="50" ${r.progress_percent==50?'selected':''}>50% Completed</option>
          <option value="75" ${r.progress_percent==75?'selected':''}>75% Completed</option>
          <option value="100" ${r.progress_percent==100?'selected':''}>100% Completed</option>
        </select>
      </div>
      <div class="field"><label>Note (optional)</label><input type="text" name="note" value="${r.progress_note || ''}"></div>
      <button type="submit" class="btn btn-primary btn-sm" style="grid-column:1/-1">Save Progress</button>
    </form>
    ${r.quality_status === "need_correction" ? `<div class="form-msg error"><strong>Correction Requested:</strong> ${r.correction_message || r.quality_note || "Kuch pages mein correction chahiye — details ke liye WhatsApp par baat kariye."}</div>` : ""}
    ${r.quality_status === "rejected" ? `<p class="form-msg error">Quality check mein reject hua: ${r.quality_note || "Admin se WhatsApp par baat kariye."}</p>` : ""}

    <div class="fieldset-title">Payment</div>
    <div class="info-grid" style="margin-bottom:10px">
      <div><span>Registration Fee</span><strong class="status-badge status-${r.registration_payment_status || 'pending'}">${(r.registration_payment_status || 'pending').replace(/_/g," ")} — ${fmtMoney(p.registration_fee)}</strong></div>
      <div><span>Advance (50%)</span><strong class="status-badge status-${r.advance_status}">${r.advance_status} — ${fmtMoney(p.advance_payment)}</strong></div>
      <div><span>Final (50%)</span><strong class="status-badge status-${r.final_status}">${r.final_status} — ${fmtMoney(p.final_payment)}</strong></div>
    </div>
    ${(r.registration_payment_status === 'pending' || r.registration_payment_status === 'rejected') ? `<a href="payment.html?reg=${r.id}" class="btn btn-brass btn-sm" style="margin-bottom:10px">Pay Registration Fee</a>` : ""}
    ${r.registration_payment_status === 'rejected' && r.payment_remarks ? `<p class="form-msg error">Payment rejected: ${r.payment_remarks}</p>` : ""}
    <div class="fieldset-title">Payment History</div>
    <ul style="font-size:0.88rem;color:var(--text-muted);padding-left:18px;margin:0 0 12px">
      ${r.registration_payment_status === 'approved' ? `<li>Registration fee approved on ${fmtDateTime(r.registration_payment_date)} — UTR: ${r.registration_utr || "—"}</li>` : ""}
      ${r.registration_payment_status === 'under_verification' ? `<li>Registration fee submitted, under verification — UTR: ${r.registration_utr || "—"}</li>` : ""}
      ${r.advance_status === 'approved' ? `<li>Advance payment approved on ${fmtDateTime(r.advance_approved_at)}${r.advance_utr ? " — Ref: " + r.advance_utr : ""}</li>` : ""}
      ${r.final_status === 'approved' ? `<li>Final payment approved on ${fmtDateTime(r.final_approved_at)}${r.final_utr ? " — Ref: " + r.final_utr : ""}</li>` : ""}
      ${(!r.registration_payment_status || r.registration_payment_status === 'pending') && r.advance_status !== 'approved' && r.final_status !== 'approved' ? `<li>Koi payment abhi record nahi hui</li>` : ""}
    </ul>
    ${r.registration_number ? `<button id="invoice-btn-${r.id}" class="btn btn-outline btn-sm">Download Invoice</button>` : ""}

    <div class="fieldset-title" style="margin-top:18px">Courier Tracking</div>
    ${r.parcel_items ? `<p class="field-hint">Parcel contains: ${r.parcel_items}</p>` : ""}
    <div class="info-grid" style="margin-bottom:10px">
      <div><span>Delivery to You</span><strong class="status-badge status-${r.courier_out_status}">${COURIER_OUT_LABELS[r.courier_out_status] || r.courier_out_status}</strong></div>
      <div><span>Courier Company</span><strong>${r.courier_company_name || "—"}</strong></div>
      <div><span>Tracking No.</span><strong>${r.courier_out_tracking || "—"}</strong></div>
      <div><span>Expected Delivery</span><strong>${fmtDate(r.expected_delivery_date)}</strong></div>
      <div><span>Return Pickup</span><strong class="status-badge status-${r.pickup_status}">${PICKUP_LABELS[r.pickup_status] || r.pickup_status}</strong></div>
      <div><span>Return Tracking</span><strong>${r.pickup_tracking || "—"}</strong></div>
    </div>

    <div class="fieldset-title">Documents</div>
    <div class="form-grid" style="margin-bottom:8px">
      <div class="field"><label>Required Document</label><input type="file" id="upload-required_document-${r.id}"></div>
      <div class="field"><label>Payment Screenshot</label><input type="file" id="upload-payment_screenshot-${r.id}"></div>
    </div>
    <div class="field"><label>Completion Images (optional)</label><input type="file" id="upload-completion_image-${r.id}"></div>
    <div id="docs-list-${r.id}" style="font-size:0.85rem;color:var(--text-muted);margin-bottom:14px"></div>

    <div class="fieldset-title">Support</div>
    <form id="support-form-${r.id}" style="display:flex;gap:10px;flex-wrap:wrap">
      <input type="text" placeholder="Apna sawal likhiye..." required style="flex:1;min-width:200px;padding:9px 12px;border:1px solid var(--line);border-radius:6px">
      <button type="submit" class="btn btn-outline btn-sm">Bhejo</button>
    </form>
  </div>`;
}

// ---------- Project lifecycle ----------
async function confirmDelivery(r) {
  const durationDays = r.projects?.duration_days || 0;
  const startDate = new Date();
  const deadline = new Date(startDate);
  deadline.setDate(deadline.getDate() + durationDays);

  await supabaseClient.from("registrations").update({
    delivery_confirmed_by_customer: true,
    delivery_confirmed_at: startDate.toISOString(),
    project_status: "in_progress",
    project_started_at: startDate.toISOString(),
    deadline: deadline.toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
  }).eq("id", r.id);
  loadRegistrations();
}

function toggleProgressForm(id) {
  const form = document.getElementById(`progress-form-${id}`);
  form.style.display = form.style.display === "none" ? "grid" : "none";
}

async function saveProgress(e, id) {
  e.preventDefault();
  const f = e.target;
  await supabaseClient.from("registrations").update({
    progress_percent: parseInt(f.percent.value || 0, 10),
    progress_note: f.note.value.trim(),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  loadRegistrations();
}

async function markCompleted(registrationId) {
  await supabaseClient.from("registrations").update({
    completion_marked_by_customer: true,
    completion_submitted_at: new Date().toISOString(),
    project_status: "submitted_for_pickup",
    pickup_status: "requested",
    quality_status: "under_review",
    updated_at: new Date().toISOString(),
  }).eq("id", registrationId);
  loadRegistrations();
}

async function resubmitProject(registrationId) {
  await supabaseClient.from("registrations").update({
    quality_status: "under_review",
    correction_message: null,
    updated_at: new Date().toISOString(),
  }).eq("id", registrationId);
  loadRegistrations();
}

// ---------- Invoice ----------
async function downloadInvoice(r) {
  const p = r.projects || {};
  const total = Number(p.registration_fee || 0) + Number(p.advance_payment || 0) + Number(p.final_payment || 0);
  const { data: company } = await supabaseClient.from("company_settings").select("company_name, logo_url").eq("id", 1).single();

  const w = window.open("", "_blank");
  w.document.write(`
    <html><head><title>Invoice ${r.invoice_number || ""}</title></head>
    <body style="font-family:sans-serif;padding:30px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        ${company?.logo_url ? `<img src="${company.logo_url}" style="height:44px;width:44px;border-radius:50%;object-fit:cover">` : ""}
        <h2 style="margin:0">${company?.company_name || "Aaliya Book Publication"} — Invoice</h2>
      </div>
      <p><strong>Invoice No:</strong> ${r.invoice_number || "—"}</p>
      <p><strong>Registration ID:</strong> ${r.registration_number || "—"}</p>
      <p><strong>Customer Name:</strong> ${currentProfile?.full_name || "—"}</p>
      <p><strong>Customer ID:</strong> ${currentProfile?.customer_id || "—"}</p>
      <p><strong>Project:</strong> ${p.project_name || "—"}</p>
      <p><strong>Payment Status:</strong> ${(r.registration_payment_status || "pending").replace(/_/g," ")}</p>
      <p><strong>Payment Date:</strong> ${fmtDate(r.registration_payment_date)}</p>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-top:14px">
        <tr><td>Registration Fee</td><td>₹${p.registration_fee || 0}</td></tr>
        <tr><td>Advance Payment (50%)</td><td>₹${p.advance_payment || 0}</td></tr>
        <tr><td>Final Payment (50%)</td><td>₹${p.final_payment || 0}</td></tr>
        <tr><td><strong>Total</strong></td><td><strong>₹${total}</strong></td></tr>
      </table>
      <script>window.print();</script>
    </body></html>
  `);
  w.document.close();
}

// ---------- Documents ----------
async function handleUpload(e, registrationId, docType) {
  const file = e.target.files[0];
  if (!file) return;

  const fileError = validateUploadFile(file);
  if (fileError) { alert(fileError); e.target.value = ""; return; }

  const safeName = file.name.replace(/[^\w\-. ()]/g, "_");
  const path = `${currentUser.id}/${registrationId}/${docType}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabaseClient.storage.from("customer-uploads").upload(path, file);
  if (uploadError) { alert("Upload fail: " + uploadError.message); return; }

  await supabaseClient.from("documents").insert({
    customer_id: currentUser.id,
    registration_id: registrationId,
    doc_type: docType,
    file_url: path,   // store the storage path; signed URLs are generated on demand
    file_name: safeName,
  });

  e.target.value = "";
  loadDocuments(registrationId);
}

async function loadDocuments(registrationId) {
  const { data } = await supabaseClient.from("documents").select("*").eq("registration_id", registrationId).order("uploaded_at", { ascending: false });
  const box = document.getElementById(`docs-list-${registrationId}`);
  if (!box) return;
  if (!data || data.length === 0) { box.textContent = "Abhi koi document upload nahi hua."; return; }

  const links = await Promise.all(data.map(async d => {
    const url = d.file_url.startsWith("http") ? d.file_url : await getSignedUploadUrl(d.file_url);
    return url ? `<a href="${url}" target="_blank" rel="noopener">${d.file_name}</a>` : d.file_name;
  }));
  box.innerHTML = "Uploaded: " + links.join(", ");
}

// ---------- Support ----------
async function sendSupport(e, registrationId) {
  e.preventDefault();
  const input = e.target.querySelector("input");
  const message = input.value.trim();
  if (!message) return;
  await supabaseClient.from("support_messages").insert({ registration_id: registrationId, customer_id: currentUser.id, message });
  input.value = "";
  alert("Message bhej diya, admin jald reply karega.");
}

// ---------- Notifications ----------
// ---------- Notifications ----------
const NOTIF_LABELS = {
  registration_submitted: "Registration Submitted", registration_approved: "Registration Approved",
  registration_rejected: "Registration Rejected", invoice_generated: "Invoice Generated",
  payment_received: "Payment Received", payment_rejected: "Payment Rejected",
  payment_approved: "Payment Approved", advance_approved: "Advance Approved",
  final_approved: "Final Payment Approved", parcel_prepared: "Parcel Prepared",
  parcel_dispatched: "Parcel Dispatched", parcel_delivered: "Parcel Delivered",
  pickup_scheduled: "Pickup Scheduled", project_received: "Project Received",
  project_started: "Project Started", deadline_reminder: "Deadline Reminder",
  project_submitted: "Project Submitted", quality_approved: "Quality Approved",
  correction_required: "Correction Required", project_approved: "Project Approved",
  project_completed: "Project Completed", general: "Update",
};

async function loadNotifications() {
  const { data } = await supabaseClient
    .from("notifications").select("*").eq("customer_id", currentUser.id)
    .order("created_at", { ascending: false }).limit(50);

  const wrap = document.getElementById("notifications-wrap");
  const preview = document.getElementById("home-notifications-preview");
  const badge = document.getElementById("notif-badge");

  if (!data || data.length === 0) {
    if (wrap) wrap.innerHTML = '<div class="empty-state">Abhi koi notification nahi hai.</div>';
    if (preview) preview.innerHTML = '<h3>Recent Updates</h3><p class="field-hint">Abhi koi update nahi hai.</p>';
    if (badge) badge.style.display = "none";
    return;
  }

  const unread = data.filter(n => !n.is_read);
  if (badge) {
    badge.textContent = unread.length > 9 ? "9+" : unread.length;
    badge.style.display = unread.length ? "flex" : "none";
  }

  // Device notification for the newest unread item
  if (typeof showDeviceNotification === "function" && unread.length) {
    showDeviceNotification(unread[0]);
  }

  const renderItem = n => `
    <div class="notif-item ${n.is_read ? "read" : "unread"}">
      <div class="notif-dot"></div>
      <div class="notif-body">
        <span class="notif-time">${NOTIF_LABELS[n.type] || (n.type || "").replace(/_/g, " ")} · ${fmtDateTime(n.created_at)}</span>
        <p>${n.message}</p>
      </div>
    </div>`;

  if (wrap) wrap.innerHTML = data.map(renderItem).join("");
  if (preview) {
    preview.innerHTML = `
      <h3>Recent Updates ${unread.length ? `<span class="status-badge status-pending">${unread.length} new</span>` : ""}</h3>
      ${data.slice(0, 4).map(renderItem).join("")}
      <a href="#notifications" class="btn btn-outline btn-sm" style="margin-top:12px" onclick="switchAppTab('notifications')">Saare notifications dekhiye</a>`;
  }
}

async function markAllNotificationsRead() {
  await supabaseClient.from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("customer_id", currentUser.id).eq("is_read", false);
  loadNotifications();
}

// ---------- Bottom navigation (mobile app style) ----------
function switchAppTab(tab) {
  document.querySelectorAll(".app-section").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(tab === "profile" ? "app-profile-section" : "app-" + tab);
  if (target) target.classList.add("active");

  document.querySelectorAll("[data-app-tab]").forEach(a => {
    a.classList.toggle("active", a.dataset.appTab === tab);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  // Opening the alerts tab marks everything read
  if (tab === "notifications") markAllNotificationsRead();
}

function initBottomNav() {
  document.querySelectorAll("[data-app-tab]").forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      switchAppTab(a.dataset.appTab);
    });
  });

  // Support deep links like dashboard.html#payments
  const hash = (window.location.hash || "").replace("#", "");
  if (["home", "project", "payments", "notifications", "profile"].includes(hash)) {
    switchAppTab(hash);
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

async function handleLogoutAllDevices() {
  if (typeof logoutAllDevices === "function") {
    await logoutAllDevices();
  } else {
    await supabaseClient.auth.signOut({ scope: "global" });
  }
  window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  guardAndLoad();
  initBottomNav();
  document.getElementById("ticket-form")?.addEventListener("submit", handleTicketCreate);
  document.getElementById("logout-btn")?.addEventListener("click", handleLogout);
  document.getElementById("logout-btn-2")?.addEventListener("click", handleLogout);
  document.getElementById("logout-all-btn")?.addEventListener("click", handleLogoutAllDevices);
  document.getElementById("enquiry-form")?.addEventListener("submit", handleEnquiry);
  document.getElementById("mark-all-read-btn")?.addEventListener("click", markAllNotificationsRead);
  document.getElementById("enable-notifications-btn")?.addEventListener("click", async () => {
    if (typeof enableDeviceNotifications === "function") await enableDeviceNotifications();
  });

  // Refresh notifications periodically so updates arrive without a reload
  setInterval(() => { if (currentUser) loadNotifications(); }, 60000);
});

// ---------- Referrals & rewards ----------
async function loadReferralSection() {
  const wrap = document.getElementById("referral-wrap");
  if (!wrap || !currentProfile) return;

  const code = currentProfile.referral_code || "—";
  const link = `${window.location.origin}/signup.html?ref=${code}`;

  const { data: refs } = await supabaseClient
    .from("referrals").select("*, referred:referred_id(full_name)")
    .eq("referrer_id", currentUser.id).order("created_at", { ascending: false });

  const list = refs || [];
  const successful = list.filter(r => ["qualified", "rewarded"].includes(r.status)).length;
  const earned = list.filter(r => r.status === "rewarded").reduce((s, r) => s + Number(r.reward_amount || 0), 0);

  wrap.innerHTML = `
    <div class="referral-card">
      <h3>Refer &amp; Earn</h3>
      <p>Apna code doston ke saath share kariye. Jab wo registration complete karenge, aapko reward milega.</p>
      <div class="referral-code-box">
        <span class="referral-code">${code}</span>
        <button class="btn btn-brass btn-sm" onclick="copyReferral('${link}')">Copy Link</button>
        <a class="btn btn-outline btn-sm" style="border-color:var(--brass);color:var(--brass)" target="_blank"
           href="https://wa.me/?text=${encodeURIComponent("Aaliya Book Publication se handwriting work from home projects kar sakte hain. Mera referral code use kariye: " + code + " — " + link)}">Share on WhatsApp</a>
      </div>
      <div class="referral-stats">
        <div><span>Total Referrals</span><strong>${list.length}</strong></div>
        <div><span>Successful</span><strong>${successful}</strong></div>
        <div><span>Earned</span><strong>${fmtMoney(earned)}</strong></div>
      </div>
    </div>

    ${list.length ? `
    <div class="card">
      <h3>Referral History</h3>
      ${list.map(r => `
        <div class="reward-item">
          <div>
            <strong>${r.referred?.full_name || "New user"}</strong>
            <div class="field-hint">${fmtDate(r.created_at)}</div>
          </div>
          <div style="text-align:right">
            <span class="status-badge status-${r.status}">${(r.status || "").replace(/_/g," ")}</span>
            ${Number(r.reward_amount) > 0 ? `<div class="reward-amount">${fmtMoney(r.reward_amount)}</div>` : ""}
          </div>
        </div>`).join("")}
    </div>` : ""}`;
}

function copyReferral(link) {
  navigator.clipboard?.writeText(link)
    .then(() => alert("Referral link copy ho gaya!"))
    .catch(() => prompt("Ye link copy kariye:", link));
}

async function loadRewards() {
  const box = document.getElementById("rewards-card");
  if (!box) return;

  const { data } = await supabaseClient
    .from("rewards").select("*").eq("customer_id", currentUser.id)
    .order("created_at", { ascending: false });

  const list = data || [];
  const available = list.filter(r => r.status === "available");
  const totalAvailable = available.reduce((s, r) => s + Number(r.amount || 0), 0);

  box.innerHTML = `
    <h3>My Rewards ${totalAvailable > 0 ? `<span class="status-badge status-available">${fmtMoney(totalAvailable)} available</span>` : ""}</h3>
    ${list.length ? list.map(r => `
      <div class="reward-item">
        <div>
          <strong>${r.title}</strong>
          ${r.description ? `<div class="field-hint">${r.description}</div>` : ""}
          ${r.expiry_date ? `<div class="field-hint">Valid till ${fmtDate(r.expiry_date)}</div>` : ""}
        </div>
        <div style="text-align:right">
          <span class="status-badge status-${r.status}">${(r.status || "").replace(/_/g," ")}</span>
          ${Number(r.amount) > 0 ? `<div class="reward-amount">${fmtMoney(r.amount)}</div>` : ""}
        </div>
      </div>`).join("") : '<p class="field-hint">Abhi koi reward nahi hai. Refer karke rewards kamaiye!</p>'}`;
}

// ---------- Onboarding guide (first-time customers) ----------
async function loadOnboarding() {
  const wrap = document.getElementById("onboarding-wrap");
  if (!wrap || !currentProfile) return;

  // Hide once the customer has an active registration or has dismissed it
  if (currentProfile.onboarding_completed) { wrap.innerHTML = ""; return; }

  const { data: steps } = await supabaseClient
    .from("onboarding_steps").select("*").eq("is_active", true).order("step_number");

  if (!steps || steps.length === 0) { wrap.innerHTML = ""; return; }

  wrap.innerHTML = `
    <div class="onboarding-card">
      <h3>Shuruaat kaise kariye</h3>
      <p class="field-hint">Pehli baar aaye hain? Ye 6 step follow kariye — sab kuch aasaan ho jayega.</p>
      <ol class="onboarding-steps">
        ${steps.map(s => `<li><strong>${s.title}</strong><p>${s.description}</p></li>`).join("")}
      </ol>
      <button class="btn btn-outline btn-sm" style="margin-top:16px" id="dismiss-onboarding">Samajh gaya, chhupa dijiye</button>
    </div>`;

  document.getElementById("dismiss-onboarding")?.addEventListener("click", async () => {
    await supabaseClient.from("profiles").update({ onboarding_completed: true }).eq("id", currentUser.id);
    currentProfile.onboarding_completed = true;
    wrap.innerHTML = "";
  });
}

// ---------- Personalised recommended action ----------
function renderActionHint(regs) {
  const wrap = document.getElementById("action-hint-wrap");
  if (!wrap) return;

  const active = regs.find(r => !["completed", "cancelled"].includes(r.project_status));
  let hint = null;

  if (!regs.length) {
    hint = { title: "Apna pehla project chuniye", text: "Available projects dekhiye aur apni suvidha ke hisaab se apply kariye.", btn: "Projects Dekhiye", link: "index.html#projects" };
  } else if (active) {
    if (["pending", "rejected"].includes(active.registration_payment_status)) {
      hint = { title: "Registration fee pending hai", text: "Payment kar ke UTR aur screenshot submit kariye taaki aapka registration aage badhe.", btn: "Pay Now", link: `payment.html?reg=${active.id}` };
    } else if (active.registration_payment_status === "under_verification") {
      hint = { title: "Payment verification chal rahi hai", text: "Admin 24 ghante ke andar verify karega. Verification ke baad aapko notification milega." };
    } else if (active.courier_out_status === "delivered" && !active.delivery_confirmed_by_customer) {
      hint = { title: "Parcel mil gaya? Confirm kariye", text: 'Project tab par "Confirm Parcel Received" dabaiye — tabhi aapka project aur deadline shuru hoga.' };
    } else if (active.project_status === "in_progress" && active.deadline) {
      hint = { title: `Deadline: ${fmtDate(active.deadline)}`, text: `${daysRemaining(active.deadline)} — apna progress dashboard par update karte rahiye.` };
    } else if (active.quality_status === "need_correction") {
      hint = { title: "Correction chahiye", text: active.correction_message || "Admin ne kuch correction maange hain — Project tab par details dekhiye." };
    }
  }

  wrap.innerHTML = hint ? `
    <div class="action-hint">
      <div class="hint-text"><strong>${hint.title}</strong><span>${hint.text}</span></div>
      ${hint.btn ? `<a href="${hint.link}" class="btn btn-brass btn-sm">${hint.btn}</a>` : ""}
    </div>` : "";
}

// ---------- Post-completion feedback ----------
async function loadFeedbackSection(regs) {
  const wrap = document.getElementById("feedback-wrap");
  if (!wrap) return;

  const completed = (regs || []).filter(r => r.project_status === "completed");
  if (completed.length === 0) { wrap.innerHTML = ""; return; }

  const { data: existing } = await supabaseClient
    .from("feedback").select("registration_id, rating, status").eq("customer_id", currentUser.id);
  const done = new Set((existing || []).map(f => f.registration_id));

  const pending = completed.filter(r => !done.has(r.id));

  if (pending.length === 0) {
    const mine = existing || [];
    wrap.innerHTML = mine.length ? `
      <div class="card">
        <h3>Aapka Feedback</h3>
        ${mine.map(f => `<div class="reward-item">
          <div><strong>${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}</strong></div>
          <span class="status-badge status-${f.status}">${f.status}</span>
        </div>`).join("")}
      </div>` : "";
    return;
  }

  const r = pending[0];
  wrap.innerHTML = `
    <div class="card">
      <h3>Aapka experience kaisa raha?</h3>
      <p class="field-hint">${r.projects?.project_name || "Aapka project"} complete ho gaya. Apna feedback dijiye — approve hone par ye website par dikhega.</p>
      <form id="feedback-form">
        <div class="field">
          <label>Rating</label>
          <div class="star-input" id="star-input">
            ${[1,2,3,4,5].map(n => `<button type="button" data-star="${n}">★</button>`).join("")}
          </div>
        </div>
        <div class="field"><label>Review</label><textarea name="review" rows="3" placeholder="Apna experience likhiye..." required></textarea></div>
        <div class="field"><label>Suggestions (optional)</label><textarea name="suggestions" rows="2" placeholder="Hum aur behtar kaise kar sakte hain?"></textarea></div>
        <button type="submit" class="btn btn-primary">Feedback Bhejiye</button>
        <div id="feedback-msg" class="form-msg"></div>
      </form>
    </div>`;

  let selectedRating = 0;
  document.querySelectorAll("[data-star]").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRating = parseInt(btn.dataset.star, 10);
      document.querySelectorAll("[data-star]").forEach(b => {
        b.classList.toggle("on", parseInt(b.dataset.star, 10) <= selectedRating);
      });
    });
  });

  document.getElementById("feedback-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("feedback-msg");
    if (!selectedRating) { msg.textContent = "Pehle rating chuniye."; msg.className = "form-msg error"; return; }

    const { error } = await supabaseClient.from("feedback").insert({
      customer_id: currentUser.id,
      registration_id: r.id,
      rating: selectedRating,
      review: e.target.review.value.trim(),
      suggestions: e.target.suggestions.value.trim() || null,
    });

    msg.textContent = error ? error.message : "Dhanyavaad! Aapka feedback mil gaya — admin approve karne ke baad website par dikhega.";
    msg.className = "form-msg " + (error ? "error" : "ok");
    if (!error) setTimeout(() => loadRegistrations(), 1500);
  });
}

async function handleEnquiry(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("enquiry-msg");
  const { error } = await supabaseClient.from("support_messages").insert({
    customer_id: currentUser.id,
    message: f.message.value.trim(),
  });
  msg.textContent = error ? error.message : "Enquiry bhej di gayi, admin jald reply karega.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) f.reset();
}

// ---------- Support tickets ----------
const TICKET_CATEGORY_LABELS = {
  registration_issue: "Registration Issue", payment_issue: "Payment Issue",
  courier_issue: "Courier Issue", project_issue: "Project Issue",
  account_issue: "Account Issue", other: "Other Query",
};

async function handleTicketCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("ticket-msg");
  msg.textContent = ""; msg.className = "form-msg";
  const restoreBtn = typeof lockSubmitButton === "function" ? lockSubmitButton(f, "Ticket ban raha hai...") : () => {};

  const { error } = await supabaseClient.from("support_tickets").insert({
    customer_id: currentUser.id,
    category: f.category.value,
    subject: f.subject.value.trim(),
    description: f.description.value.trim() || null,
  });

  msg.textContent = error ? error.message : "Ticket ban gaya — admin jald response dega.";
  msg.className = "form-msg " + (error ? "error" : "ok");
  restoreBtn();
  if (!error) { f.reset(); loadMyTickets(); }
}

async function loadMyTickets() {
  const box = document.getElementById("tickets-list");
  if (!box) return;

  const { data } = await supabaseClient
    .from("support_tickets").select("*")
    .eq("customer_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (!data || data.length === 0) {
    box.innerHTML = '<p class="field-hint">Abhi koi ticket nahi hai.</p>';
    return;
  }

  box.innerHTML = data.map(t => `
    <div class="card" style="padding:16px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <strong>${t.ticket_number} — ${t.subject}</strong>
        <span class="status-badge status-${t.status}">${(t.status || "").replace(/_/g," ")}</span>
      </div>
      <p class="field-hint" style="margin:6px 0">${TICKET_CATEGORY_LABELS[t.category] || t.category}</p>
      ${t.description ? `<p style="margin:6px 0;font-size:0.9rem">${t.description}</p>` : ""}
      <div id="ticket-thread-${t.id}" style="margin-top:10px"></div>
      <form id="ticket-reply-form-${t.id}" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <input type="text" placeholder="Reply likhiye..." required style="flex:1;min-width:180px;padding:8px 10px;border:1px solid var(--line);border-radius:6px">
        <button type="submit" class="btn btn-outline btn-sm">Bhejo</button>
      </form>
    </div>`).join("");

  data.forEach(t => {
    loadTicketThread(t.id);
    document.getElementById(`ticket-reply-form-${t.id}`)?.addEventListener("submit", (e) => sendTicketReply(e, t.id));
  });
}

async function loadTicketThread(ticketId) {
  const box = document.getElementById(`ticket-thread-${ticketId}`);
  if (!box) return;
  const { data } = await supabaseClient
    .from("ticket_replies").select("*")
    .eq("ticket_id", ticketId).eq("is_internal_note", false)
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) { box.innerHTML = ""; return; }
  box.innerHTML = data.map(r => `
    <div style="padding:6px 0;border-top:1px dotted var(--line)">
      <small style="color:var(--text-muted)">${r.sender_type === "staff" ? "Support Team" : "Aap"} · ${new Date(r.created_at).toLocaleString("en-IN")}</small>
      <p style="margin:2px 0 0">${r.message}</p>
    </div>`).join("");
}

async function sendTicketReply(e, ticketId) {
  e.preventDefault();
  const input = e.target.querySelector("input");
  const message = input.value.trim();
  if (!message) return;
  await supabaseClient.from("ticket_replies").insert({
    ticket_id: ticketId, sender_id: currentUser.id, sender_type: "customer", message,
  });
  input.value = "";
  loadTicketThread(ticketId);
}
