// ============================================================
// Login / Signup — with validation, anti-spam and attempt logging
// ============================================================


// ---------- Project context (customer came from a project's "Apply Now") ----------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authProject() {
  const p = new URLSearchParams(window.location.search).get("project") || sessionStorage.getItem("abp-pending-project") || "";
  return UUID_RE.test(p) ? p : "";
}
function authUrl(page) {
  const p = authProject();
  return page + (p ? "?project=" + encodeURIComponent(p) : "");
}

function setupAuthContext() {
  const proj = authProject();
  if (!proj) return;
  sessionStorage.setItem("abp-pending-project", proj);
  // keep the project when switching between Log In / Sign Up
  document.querySelectorAll(".auth-tabs a, .auth-links a, .auth-notice a").forEach(link => {
    const base = (link.getAttribute("href") || "").split("?")[0];
    if (base === "login.html" || base === "signup.html") link.setAttribute("href", authUrl(base));
  });
  const notice = document.getElementById("auth-context");
  if (notice) notice.style.display = "block";
}

// Only allow safe, same-site redirect targets from ?next=
function safeNextPage() {
  const next = new URLSearchParams(window.location.search).get("next") || "";
  return /^(apply|dashboard|payment)\.html(\?[A-Za-z0-9=&%_-]*)?$/.test(next) ? next : "";
}

async function handleSignup(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const btnLabel = btn ? btn.textContent : "";
  const msg = document.getElementById("su-msg");
  msg.textContent = ""; msg.className = "form-msg";

  const enable = () => { if (btn) { btn.disabled = false; btn.textContent = btnLabel; } resetCaptchaWidget(); };
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
      msg.innerHTML = 'An account already exists with this mobile number. <a href="' + authUrl("login.html") + '">Please log in instead</a>.';
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
      setTimeout(() => (window.location.href = authUrl("login.html")), 4000);
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

// CAPTCHA tokens are single-use: reset the widget after a failed attempt so the next try works
function resetCaptchaWidget() {
  try {
    if (window.turnstile && typeof window.turnstile.reset === "function") window.turnstile.reset();
    else if (window.hcaptcha && typeof window.hcaptcha.reset === "function") window.hcaptcha.reset();
    else if (window.grecaptcha && typeof window.grecaptcha.reset === "function") window.grecaptcha.reset();
  } catch (_) { /* ignore */ }
}

async function handleLogin(e) {
  e.preventDefault();
  const restoreBtn = typeof lockSubmitButton === "function" ? lockSubmitButton(e.target, "Logging in...") : () => {};
  let ok = false;
  try {
    ok = await doLogin();
  } catch (err) {
    const msg = document.getElementById("li-msg");
    if (msg) { msg.textContent = "Something went wrong. Please try again."; msg.className = "form-msg error"; }
    console.error(err);
  } finally {
    restoreBtn();                       // button is ALWAYS re-enabled, also after wrong details
    if (!ok) resetCaptchaWidget();
  }
}

async function doLogin() {
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
    msg.innerHTML = 'Login failed: those details are incorrect. New customer? <a href="' + authUrl("signup.html") + '">Sign Up here</a>.';
    msg.classList.add("error");
    return;
  }

  const signInOptions = captchaToken ? { captchaToken } : {};
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password, options: signInOptions });

  if (error) {
    await recordLoginAttempt({ email, success: false });
    msg.innerHTML = 'Login failed: those details are incorrect. New customer? <a href="' + authUrl("signup.html") + '">Sign Up here</a>.';
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
  const nextProject = authProject();
  const nextPage = safeNextPage();
  window.location.href = nextProject ? ("apply.html?project=" + encodeURIComponent(nextProject))
                       : (nextPage || "dashboard.html");
  return true;
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
  setupAuthContext();
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
