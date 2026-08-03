// ============================================================
// Shared security helpers
// ============================================================

// Paste your hCaptcha / Cloudflare Turnstile site key here after enabling
// CAPTCHA in Supabase Dashboard → Authentication → Attack Protection.
// Leave empty to skip CAPTCHA.
const CAPTCHA_SITE_KEY = "";

// ---------- Login attempt logging ----------
async function recordLoginAttempt({ userId = null, email = null, success, isAdmin = false }) {
  try {
    await supabaseClient.from("login_history").insert({
      user_id: userId,
      email_attempted: email,
      was_successful: success,
      is_admin_login: isAdmin,
      user_agent: navigator.userAgent.slice(0, 250),
    });
  } catch (err) {
    console.warn("Could not record login attempt:", err.message);
  }
}

// ---------- Form validation ----------
const Validate = {
  email(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((value || "").trim());
  },
  mobile(value) {
    const digits = (value || "").replace(/\D/g, "");
    return digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));
  },
  password(value) {
    // At least 8 chars, one letter and one number
    return (value || "").length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
  },
  ifsc(value) {
    return !value || /^[A-Z]{4}0[A-Z0-9]{6}$/.test((value || "").trim().toUpperCase());
  },
  accountNumber(value) {
    const digits = (value || "").replace(/\D/g, "");
    return !value || (digits.length >= 9 && digits.length <= 18);
  },
  notEmpty(value) {
    return (value || "").trim().length > 0;
  },
  // Basic anti-spam: reject obvious junk / script content
  clean(value) {
    return !/[<>]|javascript:/i.test(value || "");
  },
};

// Runs a set of checks, returns the first error message or null
function runValidations(checks) {
  for (const [ok, message] of checks) {
    if (!ok) return message;
  }
  return null;
}

// ---------- Prevent double-submit on forms ----------
// Usage: const restore = lockSubmitButton(form, "Submitting...");  ...  restore();
function lockSubmitButton(form, loadingText) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return () => {};
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = loadingText || "Please wait...";
  return () => {
    btn.disabled = false;
    btn.textContent = original;
  };
}

// ---------- Duplicate-account check ----------
async function mobileAlreadyRegistered(mobile) {
  try {
    const { data } = await supabaseClient.rpc("get_email_by_mobile", { mobile_input: mobile });
    return !!data;
  } catch {
    return false;
  }
}

// ---------- File upload security ----------
const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/gif", "application/pdf"];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

function validateUploadFile(file) {
  if (!file) return "Koi file select nahi hui.";
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    return "Sirf JPG, PNG, GIF ya PDF file upload kar sakte hain.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "File 5 MB se badi hai. Chhoti file upload kariye.";
  }
  if (!/^[\w\-. ()]+$/.test(file.name)) {
    return "File ka naam sirf letters, numbers, dash aur dot ke saath rakhiye.";
  }
  return null;
}

// Uploaded files are private — build a temporary signed link to view them
async function getSignedUploadUrl(path, expiresInSeconds = 3600) {
  const { data, error } = await supabaseClient.storage
    .from("customer-uploads")
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}

// Open a private upload in a new tab via a short-lived signed URL.
// Used by admin panel links: onclick="openSecureFile(event, '<storage path>')"
async function openSecureFile(event, pathOrUrl) {
  if (event) event.preventDefault();
  if (!pathOrUrl) return;

  // Older records stored a full public URL — open those directly
  if (pathOrUrl.startsWith("http")) {
    window.open(pathOrUrl, "_blank", "noopener");
    return;
  }

  const signed = await getSignedUploadUrl(pathOrUrl, 300);
  if (signed) window.open(signed, "_blank", "noopener");
  else alert("File open nahi ho payi — ho sakta hai file hata di gayi ho.");
}

// ---------- CAPTCHA ----------
function loadCaptcha(containerId) {
  if (!CAPTCHA_SITE_KEY) return;
  const container = document.getElementById(containerId);
  if (!container) return;

  const script = document.createElement("script");
  script.src = "https://js.hcaptcha.com/1/api.js";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);

  container.className = "h-captcha";
  container.dataset.sitekey = CAPTCHA_SITE_KEY;
}

function getCaptchaToken() {
  if (!CAPTCHA_SITE_KEY) return null;
  return window.hcaptcha?.getResponse() || null;
}

// ---------- Logout from all devices ----------
async function logoutEverywhere() {
  const { error } = await supabaseClient.auth.signOut({ scope: "global" });
  return error;
}
