// ============================================================
// Registration fee payment page
// ============================================================

let paymentRegistration = null;

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function loadPaymentPage() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = "login.html?next=payment.html" + window.location.search; return; }

  const regId = getQueryParam("reg");
  const box = document.getElementById("payment-project-box");

  let query = supabaseClient
    .from("registrations")
    .select("*, projects(project_name, registration_fee)")
    .eq("customer_id", session.user.id);

  if (regId) query = query.eq("id", regId);
  else query = query.in("registration_payment_status", ["pending", "rejected"]);

  const { data: regs } = await query.order("created_at", { ascending: false }).limit(1);
  paymentRegistration = regs && regs[0];

  if (!paymentRegistration) {
    box.innerHTML = '<p>Koi pending payment nahi mila. <a href="index.html#projects">Project select kariye</a> pehle.</p>';
    document.getElementById("payment-form").style.display = "none";
    return;
  }

  const p = paymentRegistration.projects || {};
  box.innerHTML = `
    <h3 class="mt-0">${p.project_name || "Project"}</h3>
    <div class="info-grid">
      <div><span>Registration ID</span><strong>${paymentRegistration.registration_number || "Pending approval"}</strong></div>
      <div><span>Registration Fee</span><strong>₹${p.registration_fee || 0}</strong></div>
      <div><span>Payment Status</span><strong class="status-badge status-${paymentRegistration.registration_payment_status}">${(paymentRegistration.registration_payment_status || "pending").replace(/_/g," ")}</strong></div>
    </div>
    ${paymentRegistration.payment_remarks ? `<p class="form-msg error">Admin remark: ${paymentRegistration.payment_remarks}</p>` : ""}
  `;

  renderDynamicQr();

  if (paymentRegistration.registration_payment_status === "under_verification" || paymentRegistration.registration_payment_status === "approved") {
    document.getElementById("payment-form").style.display = "none";
  }
}


// ---------- Dynamic UPI QR (project ki fee ke hisaab se) ----------
function buildUpiLink(upiId, payeeName, amount, note) {
  const p = new URLSearchParams();
  p.set("pa", upiId);                       // payee UPI ID
  p.set("pn", payeeName || "Aaliya Book Publication");
  p.set("am", Number(amount).toFixed(2));   // exact amount — app me pehle se bhar jaata hai
  p.set("cu", "INR");
  if (note) p.set("tn", note);
  return "upi://pay?" + p.toString();
}

async function renderDynamicQr() {
  if (!paymentRegistration) return;

  const fee = Number(paymentRegistration.projects?.registration_fee || 0);
  const amountBox = document.getElementById("pay-amount-display");
  if (amountBox) amountBox.textContent = "₹" + fee.toLocaleString("en-IN");

  const { data: cs } = await supabaseClient.from("company_settings")
    .select("upi_id, company_name").eq("id", 1).single();

  const holder = document.getElementById("dynamic-qr");
  const payBtn = document.getElementById("upi-pay-btn");
  if (!holder) return;
  holder.innerHTML = "";

  if (!cs?.upi_id) {
    // UPI ID set nahi hai — admin ki uploaded static QR dikha dete hain
    holder.innerHTML = '<p class="field-hint">UPI details are not set up yet. Please contact us on WhatsApp.</p>';
    if (payBtn) payBtn.style.display = "none";
    return;
  }

  const note = "ABP " + (paymentRegistration.registration_number || "Registration Fee");
  const link = buildUpiLink(cs.upi_id, cs.company_name, fee, note);

  if (payBtn) payBtn.href = link;

  if (typeof QRCode !== "undefined") {
    new QRCode(holder, {
      text: link,
      width: 190,
      height: 190,
      colorDark: "#12284C",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  }
}

async function handlePaymentSubmit(e) {
  e.preventDefault();
  const utr = document.getElementById("pay-utr").value.trim();
  const file = document.getElementById("pay-screenshot").files[0];
  const msg = document.getElementById("payment-msg");
  msg.textContent = ""; msg.className = "form-msg";
  const restoreBtn = typeof lockSubmitButton === "function" ? lockSubmitButton(e.target, "Submitting...") : () => {};

  if (!paymentRegistration) return;

  let screenshotUrl = null;
  if (file) {
    const fileError = validateUploadFile(file);
    if (fileError) { msg.textContent = fileError; msg.classList.add("error"); restoreBtn(); return; }

    const { data: { session } } = await supabaseClient.auth.getSession();
    const safeName = file.name.replace(/[^\w\-. ()]/g, "_");
    const path = `${session.user.id}/${paymentRegistration.id}/payment_screenshot/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabaseClient.storage.from("customer-uploads").upload(path, file);
    if (uploadError) { msg.textContent = "Screenshot upload failed: " + uploadError.message; msg.classList.add("error"); restoreBtn(); return; }
    screenshotUrl = path;   // private path; admins view it through a signed URL

    await supabaseClient.from("documents").insert({
      customer_id: session.user.id,
      registration_id: paymentRegistration.id,
      doc_type: "payment_screenshot",
      file_url: path,
      file_name: safeName,
    });
  }

  const { error } = await supabaseClient.from("registrations").update({
    registration_utr: utr,
    payment_screenshot_url: screenshotUrl,
    registration_payment_status: "under_verification",
    updated_at: new Date().toISOString(),
  }).eq("id", paymentRegistration.id);

  if (error) { msg.textContent = error.message; msg.classList.add("error"); restoreBtn(); return; }

  msg.textContent = "Payment confirmation submitted! Our admin will verify it within 24 hours.";
  msg.classList.add("ok");
  document.getElementById("payment-form").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  loadPaymentPage();
  document.getElementById("payment-form")?.addEventListener("submit", handlePaymentSubmit);
});
