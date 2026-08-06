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
  const password2 = document.getElementById("su-password2")?.value || "";
  const referralCode = v("su-referral");

  const error = runValidations([
    [Validate.notEmpty(name), "Please enter your full name."],
    [Validate.clean(name), "Your name cannot contain special characters."],
    [Validate.mobile(mobile), "Please enter a valid 10-digit mobile number."],
    [Validate.email(email), "Please enter a valid email address."],
    [Validate.password(password), "Your password must be at least 8 characters and include both letters and numbers."],
    [password === password2, "The two passwords do not match."],
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

    // Referral code -> referrer id (signup se pehle)
    let referrerId = "";
    if (referralCode) {
      try {
        const { data: refId } = await supabaseClient.rpc("get_referrer_by_code", { code_input: referralCode });
        referrerId = refId || "";
      } catch (err) { console.warn("Referral lookup failed:", err.message); }
    }

    // Profile ki details metadata mein bhejte hain — database trigger inse profile bana deta hai
    const options = {
      data: {
        full_name: name,
        mobile: mobile,
        referred_by: referrerId,
      },
    };
    if (captchaToken) options.captchaToken = captchaToken;

    const { data, error: signUpError } = await supabaseClient.auth.signUp({ email, password, options });
    if (signUpError) {
      msg.textContent = signUpError.message;
      msg.classList.add("error"); enable(); return;
    }

    // Email confirmation on ho to session nahi milta
    if (!data.session) {
      msg.innerHTML = "Account created. Please open your email and click the confirmation link, then log in.";
      msg.classList.add("ok");
      enable();
      setTimeout(() => (window.location.href = "login.html"), 4000);
      return;
    }

    let customerId = "";
    try {
      const { data: profileRow } = await supabaseClient
        .from("profiles").select("customer_id").eq("id", data.user.id).single();
      customerId = profileRow?.customer_id || "";
    } catch (err) { /* trigger thodi der le sakta hai */ }

    msg.textContent = customerId
      ? `Registration successful! Your Customer ID: ${customerId}. Redirecting...`
      : "Registration successful! Redirecting...";
    msg.classList.add("ok");
    const pending = sessionStorage.getItem("abp-pending-project");
    setTimeout(() => {
      window.location.href = pending ? ("apply.html?project=" + pending) : "dashboard.html";
    }, 1600);
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
  const params = new URLSearchParams(window.location.search);
  const nextProject = params.get("project") || sessionStorage.getItem("abp-pending-project");
  window.location.href = nextProject ? ("apply.html?project=" + nextProject) : "dashboard.html";
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


// ---------- Password show / hide + match check ----------
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".pw-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.toggle);
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "Show" : "Hide";
    });
  });

  const pw1 = document.getElementById("su-password");
  const pw2 = document.getElementById("su-password2");
  const hint = document.getElementById("pw-match-hint");
  const check = () => {
    if (!pw2 || !pw2.value) { hint.textContent = ""; hint.style.color = ""; return; }
    const same = pw1.value === pw2.value;
    hint.textContent = same ? "Passwords match." : "Passwords do not match.";
    hint.style.color = same ? "var(--green-ok)" : "var(--red-ink)";
  };
  pw1?.addEventListener("input", check);
  pw2?.addEventListener("input", check);
});
