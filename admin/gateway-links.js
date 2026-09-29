// ============================================================
// Admin: Payment Gateway Links (one link per project)
// Adds a card to the Projects tab. Leave a link empty to hide the
// gateway button for that project (customers then see UPI only).
// ============================================================
(function () {
  async function gwLoad() {
    const body = document.getElementById("gw-links-body");
    if (!body) return;
    const { data: projects, error } = await supabaseClient
      .from("projects").select("id, project_name, registration_fee, gateway_link")
      .order("created_at", { ascending: false });
    if (error) { body.innerHTML = `<tr><td colspan="4">${error.message}</td></tr>`; return; }
    if (!projects || !projects.length) { body.innerHTML = `<tr><td colspan="4">No projects yet.</td></tr>`; return; }
    body.innerHTML = projects.map(p => `
      <tr>
        <td>${p.project_name}</td>
        <td>₹${p.registration_fee}</td>
        <td><input type="url" id="gw-${p.id}" value="${(p.gateway_link || "").replace(/"/g, "&quot;")}" placeholder="https://..." style="width:100%;min-width:220px"></td>
        <td><button class="btn btn-outline btn-sm" onclick="gwSave('${p.id}')">Save</button></td>
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
    msg.textContent = error ? error.message : (link ? "Gateway link saved." : "Gateway link removed — UPI only.");
    msg.className = "form-msg " + (error ? "error" : "ok");
  };

  document.addEventListener("DOMContentLoaded", () => {
    const tab = document.getElementById("tab-projects");
    if (!tab) return;
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>Payment Gateway Links</h3>
      <p class="field-hint">Paste the gateway payment link for each project's registration fee. The customer's Pay button opens this link. Leave empty to show UPI only.</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Project</th><th>Reg. Fee</th><th>Gateway Link</th><th></th></tr></thead>
          <tbody id="gw-links-body"><tr><td colspan="4">Loading...</td></tr></tbody>
        </table>
      </div>
      <div id="gw-msg" class="form-msg"></div>`;
    tab.appendChild(card);
    gwLoad();
  });
})();
