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

  renderPayableAmount();

  if (paymentRegistration.registration_payment_status === "under_verification" || paymentRegistration.registration_payment_status === "approved") {
    document.getElementById("payment-form").style.display = "none";
  }
}

// ---------- Coupons ----------
let appliedCoupon = null;   // { code, discount }

async function applyCoupon() {
  const msg = document.getElementById("coupon-msg");
  const code = document.getElementById("coupon-code").value.trim();
  msg.textContent = ""; msg.className = "form-msg";

  if (!code) { msg.textContent = "Coupon code daaliye."; msg.classList.add("error"); return; }
  if (!paymentRegistration) return;

  const baseAmount = Number(paymentRegistration.projects?.registration_fee || 0);

  const { data, error } = await supabaseClient.rpc("validate_coupon", {
    coupon_code_input: code, amount: baseAmount,
  });

  if (error) { msg.textContent = "Coupon check nahi ho paya, dobara try kariye."; msg.classList.add("error"); return; }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.valid) {
    appliedCoupon = null;
    msg.textContent = result?.message || "Ye coupon valid nahi hai.";
    msg.classList.add("error");
    renderPayableAmount();
    return;
  }

  appliedCoupon = { code: code.toUpperCase(), discount: Number(result.discount || 0) };
  msg.innerHTML = `<div class="coupon-applied"><span>${result.message}</span></div>`;
  renderPayableAmount();
}

function renderPayableAmount() {
  const box = document.getElementById("payable-amount");
  if (!box || !paymentRegistration) return;
  const base = Number(paymentRegistration.projects?.registration_fee || 0);
  const discount = appliedCoupon ? appliedCoupon.discount : 0;
  const payable = Math.max(base - discount, 0);

  box.innerHTML = discount > 0
    ? `<div class="invoice-box">
         <div class="invoice-row"><span>Registration Fee</span><span>₹${base}</span></div>
         <div class="invoice-row"><span>Coupon (${appliedCoupon.code})</span><span>− ₹${discount}</span></div>
         <div class="invoice-row"><span>Payable Now</span><span>₹${payable}</span></div>
       </div>`
    : `<div class="invoice-box"><div class="invoice-row"><span>Payable Now</span><span>₹${base}</span></div></div>`;
}

async function handlePaymentSubmit(e) {
  e.preventDefault();
  const utr = document.getElementById("pay-utr").value.trim();
  const file = document.getElementById("pay-screenshot").files[0];
  const msg = document.getElementById("payment-msg");
  msg.textContent = ""; msg.className = "form-msg";
  const restoreBtn = typeof lockSubmitButton === "function" ? lockSubmitButton(e.target, "Submit ho raha hai...") : () => {};

  if (!paymentRegistration) return;

  let screenshotUrl = null;
  if (file) {
    const fileError = validateUploadFile(file);
    if (fileError) { msg.textContent = fileError; msg.classList.add("error"); restoreBtn(); return; }

    const { data: { session } } = await supabaseClient.auth.getSession();
    const safeName = file.name.replace(/[^\w\-. ()]/g, "_");
    const path = `${session.user.id}/${paymentRegistration.id}/payment_screenshot/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabaseClient.storage.from("customer-uploads").upload(path, file);
    if (uploadError) { msg.textContent = "Screenshot upload fail: " + uploadError.message; msg.classList.add("error"); restoreBtn(); return; }
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
    coupon_code: appliedCoupon ? appliedCoupon.code : null,
    discount_amount: appliedCoupon ? appliedCoupon.discount : 0,
    updated_at: new Date().toISOString(),
  }).eq("id", paymentRegistration.id);

  if (error) { msg.textContent = error.message; msg.classList.add("error"); restoreBtn(); return; }

  msg.textContent = "Payment confirmation submit ho gaya! Admin verify karega 24 ghante ke andar.";
  msg.classList.add("ok");
  document.getElementById("payment-form").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  loadPaymentPage();
  document.getElementById("payment-form")?.addEventListener("submit", handlePaymentSubmit);
  document.getElementById("apply-coupon-btn")?.addEventListener("click", applyCoupon);
});
