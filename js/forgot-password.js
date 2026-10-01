// ============================================================
// Forgot password via mobile OTP (phone.email) + Supabase Edge Function
// The browser never decides who is verified: it only forwards the
// user_json_url, and the Edge Function reads the verified number
// from phone.email's server.
// ============================================================
let verifiedJsonUrl = null;

// Called by the phone.email button after a successful OTP
function phoneEmailListener(userObj) {
  verifiedJsonUrl = userObj && userObj.user_json_url;
  if (!verifiedJsonUrl) { showFpMsg("Verification failed. Please try again.", true); return; }
  document.getElementById("fp-step1").style.display = "none";
  document.getElementById("fp-step2").style.display = "block";
  showFpMsg("", false);
  document.getElementById("fp-pass").focus();
}
window.phoneEmailListener = phoneEmailListener;

function showFpMsg(text, isError) {
  const m = document.getElementById("fp-msg");
  if (!m) return;
  m.textContent = text;
  m.className = "form-msg" + (text ? (isError ? " error" : " ok") : "");
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("fp-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const p1 = document.getElementById("fp-pass").value;
    const p2 = document.getElementById("fp-pass2").value;
    const btn = document.getElementById("fp-submit");

    if (p1.length < 8 || !/[A-Za-z]/.test(p1) || !/[0-9]/.test(p1)) {
      showFpMsg("Password must be at least 8 characters with letters and numbers.", true); return;
    }
    if (p1 !== p2) { showFpMsg("Passwords do not match.", true); return; }
    if (!verifiedJsonUrl) { showFpMsg("Please verify your mobile number first.", true); return; }

    btn.disabled = true; const old = btn.textContent; btn.textContent = "Please wait...";
    showFpMsg("", false);
    try {
      const { data, error } = await supabaseClient.functions.invoke("phone-reset-password", {
        body: { user_json_url: verifiedJsonUrl, new_password: p1 },
      });
      if (error) {
        let text = "Could not change password. Please try again.";
        try { const j = await error.context.json(); if (j && j.error) text = j.error; } catch (_) {}
        throw new Error(text);
      }
      if (data && data.error) throw new Error(data.error);

      verifiedJsonUrl = null;
      document.getElementById("fp-step2").style.display = "none";
      document.getElementById("fp-done").style.display = "block";
      showFpMsg("", false);
    } catch (err) {
      showFpMsg(err.message, true);
      btn.disabled = false; btn.textContent = old;
    }
  });
});
