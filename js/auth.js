// ============================================================
// Login / Signup — with validation, anti-spam and attempt logging
// ============================================================

async function handleSignup(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const btnLabel = btn ? btn.textContent : "";
  const msg = document.getElementById("su-msg");
  msg.textContent = ""; msg.className = "form-msg";

  const enable = () => { if (btn) { btn.disabled = false; btn.textContent = btnLabel; } };
  const busy = () => { if (btn) { btn.disabled = true; btn.textContent = "Please wait..."; } };

  const v = id => (document.getElementById(id)?.value || "").trim();
  const name = v("su-name"), mobile = v("su-mobile"), email = v("su-email");
  const password = document.getElementById("su-password").value;
  const address = v("su-address"), courierAddress = v("su-courier-address");
  const referralCode = v("su-referral");

  const error = runValidations([
    [Validate.notEmpty(name), "Apna poora naam likhiye."],
    [Validate.clean(name), "Naam mein special characters nahi chalenge."],
    [Validate.mobile(mobile), "Sahi 10-digit mobile number daaliye."],
    [Validate.email(email), "Sahi email address daaliye."],
    [Validate.password(password), "Password kam se kam 8 characters ka ho, jisme letters aur numbers dono hon."],
  ]);
  if (error) { msg.textContent = error; msg.classList.add("error"); enable(); return; }

  const captchaToken = getCaptchaToken();
  if (CAPTCHA_SITE_KEY && !captchaToken) {
    msg.textContent = "Pehle CAPTCHA complete kariye.";
    msg.classList.add("error"); enable(); return;
  }

  busy();

  try {
    if (await mobileAlreadyRegistered(mobile)) {
      msg.textContent = "Is mobile number se pehle se account bana hua hai. Login kariye ya password reset kariye.";
      msg.classList.add("error"); enable(); return;
    }

    const signUpOptions = captchaToken ? { captchaToken } : {};
    const { data, error: signUpError } = await supabaseClient.auth.signUp({ email, password, options: signUpOptions });
    if (signUpError) { msg.textContent = signUpError.message; msg.classList.add("error"); enable(); return; }

    let referrerId = null;
    if (referralCode) {
      try {
        const { data: refId } = await supabaseClient.rpc("get_referrer_by_code", { code_input: referralCode });
        referrerId = refId || null;
      } catch (err) { console.warn("Referral lookup failed:", err.message); }
    }

    let customerId = "";
    if (data.user) {
      const { data: profileRow } = await supabaseClient.from("profiles").insert({
        id: data.user.id,
        full_name: name,
        mobile: mobile,
        address: address || null,
        courier_address: courierAddress || address || null,
        referred_by: referrerId,
      }).select("customer_id").single();
      customerId = profileRow?.customer_id || "";
    }

    msg.textContent = `Registration successful! Aapka Customer ID: ${customerId || "generate ho raha hai"}. Redirecting...`;
    msg.classList.add("ok");
    setTimeout(() => (window.location.href = "dashboard.html"), 1600);
  } catch (err) {
    msg.textContent = "Kuch galat ho gaya: " + err.message;
    msg.classList.add("error");
    enable();
  }
}

async function resolveLoginEmail(identifier) {
  if (identifier.includes("@")) return identifier;
  const { data, error } = await supabaseClient.rpc("get_email_by_mobile", { mobile_input: identifier });
  if (error || !data) return null;
  return data;
}

async function handleLogin(e) {
  e.preventDefault();
  const restoreBtn = typeof lockSubmitButton === "function" ? lockSubmitButton(e.target, "Login ho raha hai...") : () => {};
  const identifier = document.getElementById("li-email").value.trim();
  const password = document.getElementById("li-password").value;
  const msg = document.getElementById("li-msg");
  msg.textContent = ""; msg.className = "form-msg";

  if (!Validate.notEmpty(identifier) || !Validate.notEmpty(password)) {
    msg.textContent = "Mobile/email aur password dono bhariye.";
    msg.classList.add("error");
    return;
  }

  const captchaToken = getCaptchaToken();
  if (CAPTCHA_SITE_KEY && !captchaToken) {
    msg.textContent = "Pehle CAPTCHA complete kariye.";
    msg.classList.add("error");
    return;
  }

  const email = await resolveLoginEmail(identifier);
  if (!email) {
    await recordLoginAttempt({ email: identifier, success: false });
    msg.textContent = "Login fail: details galat hain.";
    msg.classList.add("error");
    return;
  }

  const signInOptions = captchaToken ? { captchaToken } : {};
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password, options: signInOptions });

  if (error) {
    await recordLoginAttempt({ email, success: false });
    msg.textContent = "Login fail: details galat hain.";
    msg.classList.add("error");
    return;
  }

  // Blocked accounts cannot proceed
  const { data: profile } = await supabaseClient.from("profiles").select("is_blocked").eq("id", data.user.id).single();
  if (profile?.is_blocked) {
    await supabaseClient.auth.signOut();
    await recordLoginAttempt({ userId: data.user.id, email, success: false });
    msg.textContent = "Ye account block kar diya gaya hai. Support se sampark kariye.";
    msg.classList.add("error");
    return;
  }

  await recordLoginAttempt({ userId: data.user.id, email, success: true });
  window.location.href = "dashboard.html";
  restoreBtn();
}

async function handleForgotPasswordCustomer() {
  const email = prompt("Apna registered email likhiye:");
  if (!email) return;
  const msg = document.getElementById("li-msg");
  if (!Validate.email(email)) {
    if (msg) { msg.textContent = "Sahi email daaliye."; msg.className = "form-msg error"; }
    return;
  }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
  if (msg) {
    msg.textContent = error ? error.message : "Password reset link email par bhej diya.";
    msg.className = "form-msg " + (error ? "error" : "ok");
  }
}

function prefillReferralCode() {
  const input = document.getElementById("su-referral");
  if (!input) return;
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref) {
    input.value = ref;
    const hint = document.getElementById("referral-hint");
    if (hint) hint.textContent = "Referral code apply ho gaya.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  prefillReferralCode();
  document.getElementById("signup-form")?.addEventListener("submit", handleSignup);
  document.getElementById("login-form")?.addEventListener("submit", handleLogin);
  document.getElementById("forgot-password-link")?.addEventListener("click", (e) => { e.preventDefault(); handleForgotPasswordCustomer(); });
  loadCaptcha("captcha-box");
});
