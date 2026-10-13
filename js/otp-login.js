// ============================================================
// One page for Login + Create Account (mobile number + OTP)
// OTP is sent/verified by phone.email. The Supabase Edge Function
// "phone-login" reads the verified number from phone.email's server,
// finds (or creates) the customer, and returns a one-time sign-in token.
// ============================================================
(function () {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const $ = id => document.getElementById(id);
  let ticket = null;

  // ---- context from the URL (?project=ID from "Apply Now", ?ref=CODE from a referral link) ----
  const qs = new URLSearchParams(window.location.search);
  const qProject = qs.get("project");
  if (qProject && UUID_RE.test(qProject)) sessionStorage.setItem("abp-pending-project", qProject);
  const qRef = qs.get("ref");
  if (qRef) sessionStorage.setItem("abp-pending-ref", qRef.slice(0, 30));

  function pendingProject() {
    const p = sessionStorage.getItem("abp-pending-project") || "";
    return UUID_RE.test(p) ? p : "";
  }
  function afterLoginUrl() {
    const p = pendingProject();
    return p ? "dashboard.html#project" : "dashboard.html";
  }

  function showStep(id) {
    ["otp-step-verify", "otp-step-name", "otp-step-done"].forEach(s => { $(s).style.display = (s === id) ? "block" : "none"; });
  }
  function msg(text, type) {
    const m = $("otp-msg");
    m.textContent = text || "";
    m.className = "form-msg" + (text ? " " + (type || "error") : "");
  }

  async function callLogin(payload) {
    const { data, error } = await supabaseClient.functions.invoke("phone-login", { body: payload });
    if (error) {
      let text = "Something went wrong. Please try again.";
      try { const j = await error.context.json(); if (j && j.error) text = j.error; } catch (_) {}
      throw new Error(text);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  async function finish(data, name) {
    const { data: s, error } = await supabaseClient.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
    if (error || !s || !s.session) throw new Error("Could not sign you in. Please try again.");
    sessionStorage.removeItem("abp-pending-ref");
    showStep("otp-step-done");
    $("otp-done-text").textContent = pendingProject() ? "Opening your profile..." : "Opening your profile...";
    msg("");
    setTimeout(() => { window.location.href = afterLoginUrl(); }, 700);
  }

  // phone.email calls this after the OTP was verified
  window.phoneEmailListener = async function (userObj) {
    msg("");
    const holder = $("pe-holder");
    if (holder) holder.style.opacity = ".5";
    try {
      const data = await callLogin({ user_json_url: userObj && userObj.user_json_url });
      if (data.status === "needs_name") {
        ticket = data.ticket;
        $("otp-masked").textContent = "+91 " + (data.mobile_masked || "");
        const ref = sessionStorage.getItem("abp-pending-ref");
        if (ref) { $("otp-referral").value = ref; $("ref-box").open = true; }
        showStep("otp-step-name");
        $("otp-name").focus();
      } else {
        await finish(data);
      }
    } catch (e) {
      msg(e.message, "error");
      if (holder) holder.style.opacity = "1";
    }
  };

  document.addEventListener("DOMContentLoaded", async () => {
    if (pendingProject()) { const n = $("auth-context"); if (n) n.style.display = "block"; }

    // already logged in -> go straight on
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data && data.session) { window.location.replace(afterLoginUrl()); return; }
    } catch (_) {}

    const form = $("otp-name-form");
    const btn = $("otp-name-btn");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("otp-name").value.replace(/\s+/g, " ").trim();
      if (name.length < 2) { msg("Please enter your full name.", "error"); return; }
      if (!ticket) { msg("Session expired. Please verify your number again.", "error"); showStep("otp-step-verify"); return; }
      btn.disabled = true; const old = btn.textContent; btn.textContent = "Please wait...";
      msg("");
      try {
        const data = await callLogin({ ticket, name, referral: $("otp-referral").value.trim() });
        await finish(data, name);
      } catch (err) {
        msg(err.message, "error");
        btn.disabled = false; btn.textContent = old;
      }
    });

    $("otp-change").addEventListener("click", (e) => {
      e.preventDefault();
      ticket = null; msg("");
      const holder = $("pe-holder"); if (holder) holder.style.opacity = "1";
      showStep("otp-step-verify");
    });
  });
})();
