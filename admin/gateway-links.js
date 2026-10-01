// ============================================================
// Admin extras
//  1) Payment Options: ON/OFF switches for Payment Gateway and UPI
//  2) Payment Gateway Links: one link per project
//  3) Popup Notice: "Delete Image" button
// ============================================================
(function () {
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  // ---------- 1) Payment options (ON / OFF) ----------
  async function loadPayOptions() {
    const { data } = await supabaseClient.from("company_settings")
      .select("payment_gateway_enabled, payment_upi_enabled").eq("id", 1).single();
    const g = document.getElementById("opt-gateway");
    const u = document.getElementById("opt-upi");
    if (!g || !u || !data) return;
    g.checked = data.payment_gateway_enabled !== false;
    u.checked = data.payment_upi_enabled !== false;
  }

  async function savePayOption(which) {
    const g = document.getElementById("opt-gateway");
    const u = document.getElementById("opt-upi");
    const msg = document.getElementById("opt-msg");
    if (!g.checked && !u.checked) {            // at least one method must stay ON
      (which === "gateway" ? g : u).checked = true;
      msg.textContent = "At least one payment method must stay ON, otherwise customers cannot pay.";
      msg.className = "form-msg error";
      return;
    }
    const { error } = await supabaseClient.from("company_settings")
      .update({ payment_gateway_enabled: g.checked, payment_upi_enabled: u.checked, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) { msg.textContent = error.message; msg.className = "form-msg error"; return; }
    const mode = g.checked && u.checked ? "Customers see BOTH Gateway and UPI."
               : g.checked ? "Customers see ONLY Payment Gateway."
               : "Customers see ONLY UPI.";
    msg.textContent = "Saved. " + mode;
    msg.className = "form-msg ok";
  }

  // ---------- 2) Gateway links per project ----------
  async function gwLoad() {
    const body = document.getElementById("gw-links-body");
    if (!body) return;
    const { data: projects, error } = await supabaseClient
      .from("projects").select("id, project_name, registration_fee, gateway_link")
      .order("created_at", { ascending: false });
    if (error) { body.innerHTML = `<tr><td colspan="4">${esc(error.message)}</td></tr>`; return; }
    if (!projects || !projects.length) { body.innerHTML = `<tr><td colspan="4">No projects yet.</td></tr>`; return; }
    body.innerHTML = projects.map(p => `
      <tr>
        <td>${esc(p.project_name)}</td>
        <td>₹${esc(p.registration_fee)}</td>
        <td><input type="url" id="gw-${p.id}" value="${esc(p.gateway_link)}" placeholder="https://..." style="width:100%;min-width:220px"></td>
        <td><button type="button" class="btn btn-outline btn-sm" onclick="gwSave('${p.id}')">Save</button></td>
      </tr>`).join("");
  }

  window.gwSave = async function (id) {
    const input = document.getElementById("gw-" + id);
    const msg = document.getElementById("gw-msg");
    const link = input.value.trim();
    if (link && !/^https:\/\//i.test(link)) {
      msg.textContent = "Link must start with https://"; msg.className = "form-msg error"; return;
    }
    const { error } = await supabaseClient.from("projects")
      .update({ gateway_link: link || null }).eq("id", id);
    msg.textContent = error ? error.message : (link ? "Gateway link saved." : "Gateway link removed for this project.");
    msg.className = "form-msg " + (error ? "error" : "ok");
  };

  // ---------- 3) Popup image delete ----------
  function setupPopupImageDelete() {
    const prev = document.getElementById("popup-image-preview");
    const fileInput = document.getElementById("popup-image-file");
    const form = document.getElementById("popup-form");
    if (!prev || !fileInput || !form) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "popup-image-delete";
    btn.className = "btn btn-outline btn-sm";
    btn.style.cssText = "display:none;margin-top:10px;color:#b42318;border-color:#b42318";
    btn.textContent = "Delete Image";
    prev.insertAdjacentElement("afterend", btn);

    const sync = () => { btn.style.display = (prev.style.display !== "none" && prev.getAttribute("src")) ? "inline-block" : "none"; };
    new MutationObserver(sync).observe(prev, { attributes: true, attributeFilter: ["src", "style"] });
    sync();

    btn.addEventListener("click", async () => {
      if (!confirm("Delete the popup image? You can upload a new one anytime.")) return;
      const msg = document.getElementById("popup-msg");
      const { error } = await supabaseClient.from("company_settings")
        .update({ popup_image_url: null, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) { msg.textContent = error.message; msg.className = "form-msg error"; return; }
      if (form.popup_image_url) form.popup_image_url.value = "";
      prev.removeAttribute("src");
      prev.style.display = "none";
      fileInput.value = "";
      sync();
      msg.textContent = "Popup image deleted.";
      msg.className = "form-msg ok";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const tab = document.getElementById("tab-projects");
    if (tab) {
      const opts = document.createElement("div");
      opts.className = "card";
      opts.innerHTML = `
        <h3>Payment Options (ON / OFF)</h3>
        <p class="field-hint">Choose what customers see on the payment page. Keep both ON to show both, or switch one OFF to show only the other.</p>
        <label class="perm-item"><input type="checkbox" id="opt-gateway" checked> Payment Gateway (Pay Now button)</label>
        <label class="perm-item"><input type="checkbox" id="opt-upi" checked> UPI (QR code + Pay via UPI app)</label>
        <div id="opt-msg" class="form-msg"></div>`;
      tab.appendChild(opts);
      document.getElementById("opt-gateway").addEventListener("change", () => savePayOption("gateway"));
      document.getElementById("opt-upi").addEventListener("change", () => savePayOption("upi"));
      loadPayOptions();

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <h3>Payment Gateway Links</h3>
        <p class="field-hint">Paste the gateway payment link for each project's registration fee. Leave empty to show UPI only for that project.</p>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Project</th><th>Reg. Fee</th><th>Gateway Link</th><th></th></tr></thead>
            <tbody id="gw-links-body"><tr><td colspan="4">Loading...</td></tr></tbody>
          </table>
        </div>
        <div id="gw-msg" class="form-msg"></div>`;
      tab.appendChild(card);
      gwLoad();
    }
    setupPopupImageDelete();
  });
})();
