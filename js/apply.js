// ============================================================
// Apply / Registration form
// ============================================================

let selectedProjectId = null;
let allProjects = [];

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function guardApply() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "login.html?next=apply.html" + window.location.search;
    return;
  }
  await loadProjectsIntoSelect();

  const preselect = getQueryParam("project");
  if (preselect) {
    document.getElementById("apply-project").value = preselect;
    onProjectChange();
  }

  // Prefill profile info if already saved
  const { data: profile } = await supabaseClient.from("profiles").select("*").eq("id", session.user.id).single();
  if (profile) {
    const f = document.getElementById("apply-form");
    if (profile.full_name) f.full_name.value = profile.full_name;
    if (profile.mobile) f.mobile.value = profile.mobile;
    if (profile.address) f.address.value = profile.address;
    if (profile.courier_address) f.courier_address.value = profile.courier_address;
  }
  f_email(session.user.email);
}

function f_email(email) {
  const el = document.getElementById("apply-email-display");
  if (el) el.textContent = email;
}

async function loadProjectsIntoSelect() {
  const { data: projects } = await supabaseClient.from("projects").select("*").eq("is_active", true).order("created_at", { ascending: false });
  allProjects = projects || [];
  const select = document.getElementById("apply-project");
  select.innerHTML = '<option value="">-- Project chuniye --</option>';
  allProjects.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.project_name} — ${p.num_pages} pages — Registration ₹${p.registration_fee}`;
    select.appendChild(opt);
  });
}

function onProjectChange() {
  selectedProjectId = document.getElementById("apply-project").value;
  const box = document.getElementById("apply-project-details");
  if (!selectedProjectId) { box.innerHTML = ""; return; }
  const p = allProjects.find(pl => pl.id === selectedProjectId);
  if (!p) return;
  box.innerHTML = `
    <div class="plan-meta">
      <div><span>Pages</span><strong>${p.num_pages} A4</strong></div>
      <div><span>Duration</span><strong>${p.duration_days} days</strong></div>
      <div><span>Registration Fee</span><strong>₹${p.registration_fee}</strong></div>
      <div><span>Advance (50%)</span><strong>₹${p.advance_payment}</strong></div>
      <div><span>Final (50%)</span><strong>₹${p.final_payment}</strong></div>
    </div>
    <p class="desc">${p.description || ""}</p>
  `;
}

async function handleApplySubmit(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("apply-msg");
  msg.textContent = ""; msg.className = "form-msg";
  const restoreBtn = typeof lockSubmitButton === "function" ? lockSubmitButton(f, "Submitting...") : () => {};

  if (!selectedProjectId) {
    msg.textContent = "Please choose a project first.";
    msg.classList.add("error");
    restoreBtn();
    return;
  }

  if (typeof runValidations === "function") {
    const validationError = runValidations([
      [Validate.notEmpty(f.full_name.value), "Please enter your full name."],
      [Validate.mobile(f.mobile.value), "Please enter a valid 10-digit mobile number."],
      [Validate.notEmpty(f.address.value), "Please enter your address."],
      [Validate.notEmpty(f.courier_address.value), "Please enter your courier address."],
    ]);
    if (validationError) {
      msg.textContent = validationError;
      msg.classList.add("error");
      restoreBtn();
      return;
    }
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  const uid = session.user.id;

  // Save/update profile details
  await supabaseClient.from("profiles").upsert({
    id: uid,
    full_name: f.full_name.value.trim(),
    mobile: f.mobile.value.trim(),
    address: f.address.value.trim(),
    courier_address: f.courier_address.value.trim(),
  });

  // Create registration
  const { data: newReg, error } = await supabaseClient.from("registrations").insert({
    customer_id: uid,
    project_id: selectedProjectId,
  }).select("id").single();

  if (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
    restoreBtn();
    return;
  }

  msg.textContent = "Application submitted! Now please pay the registration fee.";
  msg.classList.add("ok");
  setTimeout(() => (window.location.href = "payment.html?reg=" + newReg.id), 1200);
}

document.addEventListener("DOMContentLoaded", () => {
  guardApply();
  document.getElementById("apply-project")?.addEventListener("change", onProjectChange);
  document.getElementById("apply-form")?.addEventListener("submit", handleApplySubmit);
});
