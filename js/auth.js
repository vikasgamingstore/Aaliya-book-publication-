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
    [Validate.notEmpty(name), "Please enter your full name."],
    [Validate.clean(name), "Your name cannot contain special characters."],
    [Validate.mobile(mobile), "Please enter a valid 10-digit mobile number."],
    [Validate.email(email), "Please enter a valid email address."],
    [Validate.password(password), "Your password must be at least 8 characters and include both letters and numbers."],
  ]);
  if (error) { msg.textContent = error; msg.classList.add("error"); enable(); return; }

  const captchaToken = getCaptchaToken();
  if (CAPTCHA_SITE_KEY && !captchaToken) {
    msg.textContent = "Please complete the CAPTCHA first.";
    msg.classList.add("error"); enable(); return;
  }

  busy();

  try {
    if (await mobileAlreadyRegistered(mobile)) {
      msg.textContent = "An account already exists with this mobile number. Please log in instead.";
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
    msg.textContent = "Something went wrong: " + err.message;
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
  const restoreBtn = typeof lockSubmitButton === "function" ? lockSubmitButton(e.target, "Logging in...") : () => {};
  const identifier = document.getElementById("li-email").value.trim();
  const password = document.getElementById("li-password").value;
  const msg = document.getElementById("li-msg");
  msg.textContent = ""; msg.className = "form-msg";

  if (!Validate.notEmpty(identifier) || !Validate.notEmpty(password)) {
    msg.textContent = "Please enter both your mobile/email and password.";
    msg.classList.add("error");
    return;
  }

  const captchaToken = getCaptchaToken();
  if (CAPTCHA_SITE_KEY && !captchaToken) {
    msg.textContent = "Please complete the CAPTCHA first.";
    msg.classList.add("error");
    return;
  }

  const email = await resolveLoginEmail(identifier);
  if (!email) {
    await recordLoginAttempt({ email: identifier, success: false });
    msg.textContent = "Login failed: those details are incorrect.";
    msg.classList.add("error");
    return;
  }

  const signInOptions = captchaToken ? { captchaToken } : {};
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password, options: signInOptions });

  if (error) {
    await recordLoginAttempt({ email, success: false });
    msg.textContent = "Login failed: those details are incorrect.";
    msg.classList.add("error");
    return;
  }

  // Blocked accounts cannot proceed
  const { data: profile } = await supabaseClient.from("profiles").select("is_blocked").eq("id", data.user.id).single();
  if (profile?.is_blocked) {
    await supabaseClient.auth.signOut();
    await recordLoginAttempt({ userId: data.user.id, email, success: false });
    msg.textContent = "This account has been blocked. Please contact support.";
    msg.classList.add("error");
    return;
  }

  await recordLoginAttempt({ userId: data.user.id, email, success: true });
  window.location.href = "dashboard.html";
  restoreBtn();
}


function prefillReferralCode() {
  const input = document.getElementById("su-referral");
  if (!input) return;
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref) {
    input.value = ref;
    const hint = document.getElementById("referral-hint");
    if (hint) hint.textContent = "Referral code applied.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  prefillReferralCode();
  document.getElementById("signup-form")?.addEventListener("submit", handleSignup);
  document.getElementById("login-form")?.addEventListener("submit", handleLogin);
  loadCaptcha("captcha-box");
});
