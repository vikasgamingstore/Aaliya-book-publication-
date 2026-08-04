// ============================================================
// Shared across all pages: nav toggle, company info, WA float
// ============================================================

function initNavToggle() {
  const btn = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (btn && links) btn.addEventListener("click", () => links.classList.toggle("open"));
}

async function loadCompanySettings() {
  try {
    const { data, error } = await supabaseClient.from("company_settings").select("*").eq("id", 1).single();
    if (error) throw error;
    applyCompanySettings(data);
    return data;
  } catch (err) {
    console.error("Could not load company settings:", err.message);
    return null;
  }
}

function applyCompanySettings(data) {
  if (!data) return;
  document.querySelectorAll("[data-company-name]").forEach(el => el.textContent = data.company_name || "Aaliya Book Publication");

  document.querySelectorAll("[data-company-logo]").forEach(img => {
    if (data.logo_url) {
      img.src = data.logo_url;
      img.style.display = "block";
      const fallback = img.parentElement.querySelector(".brand-fallback");
      if (fallback) fallback.style.display = "none";
    }
  });

  document.querySelectorAll("[data-address]").forEach(el => el.textContent = data.address || "Address coming soon");
  document.querySelectorAll("[data-phone]").forEach(el => {
    el.textContent = data.phone_number || "-";
    if (el.tagName === "A") el.href = `tel:${data.phone_number || ""}`;
  });
  document.querySelectorAll("[data-email]").forEach(el => {
    el.textContent = data.email || "-";
    if (el.tagName === "A") el.href = `mailto:${data.email || ""}`;
  });
  document.querySelectorAll("[data-upi-id]").forEach(el => el.textContent = data.upi_id || "Not set yet");
  document.querySelectorAll("[data-upi-qr]").forEach(img => { if (data.upi_qr_url) img.src = data.upi_qr_url; });
  document.querySelectorAll("[data-support-timing]").forEach(el => {
    if (data.whatsapp_support_timing) el.textContent = "Support timing: " + data.whatsapp_support_timing;
  });




  const waNumber = (data.whatsapp_number || "").replace(/[^0-9]/g, "");
  const waMessage = data.whatsapp_support_message || data.whatsapp_welcome_message || "Hi, I have a query about a handwriting project.";
  document.querySelectorAll("[data-whatsapp-link]").forEach(a => {
    if (waNumber) a.href = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`;
  });

  // Favicon
  if (data.favicon_url) {
    let link = document.querySelector("link[rel='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = data.favicon_url;
  }

  // Company description
  document.querySelectorAll("[data-company-description]").forEach(el => {
    if (data.description) el.textContent = data.description;
  });

  // Social links — Instagram, Facebook, Telegram, WhatsApp group
  const socials = {
    instagram: data.instagram_url,
    facebook: data.facebook_url,
    telegram: data.telegram_url,
    whatsappgroup: data.whatsapp_group_url,
  };
  Object.entries(socials).forEach(([key, url]) => {
    document.querySelectorAll(`[data-social="${key}"]`).forEach(a => {
      if (url) { a.href = url; a.style.display = "flex"; }
      else a.style.display = "none";
    });
  });

  // Announcement popup
  showAnnouncementPopup(data);
}

// ---------- Announcement popup (admin-controlled) ----------
function showAnnouncementPopup(s) {
  if (!s || !s.popup_enabled || !s.popup_title) return;
  if (document.getElementById("abp-popup")) return;

  const key = "abp-popup-seen-" + (s.updated_at || "");
  if (s.popup_show_once && sessionStorage.getItem(key)) return;

  const wrap = document.createElement("div");
  wrap.id = "abp-popup";
  wrap.className = "popup-overlay";
  const type = s.popup_type || "warning";
  const warnIcon = type === "warning" ? `
        <div class="popup-warn-icon">
          <svg viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2zm0 4.5 7.5 12.9h-15L12 6.5zM11 10v5h2v-5h-2zm0 6.5v2h2v-2h-2z"/></svg>
        </div>` : "";

  wrap.innerHTML = `
    <div class="popup-card popup-${type}" role="dialog" aria-modal="true">
      <button class="popup-close" aria-label="Close">&times;</button>
      <div class="popup-head">
        ${warnIcon}
        ${s.popup_badge ? `<div class="popup-badge">${s.popup_badge}</div>` : ""}
        <h3>${s.popup_title}</h3>
      </div>
      <div class="popup-body">
        ${s.popup_image_url ? `<img src="${s.popup_image_url}" alt="">` : ""}
        ${s.popup_message ? `<p>${s.popup_message}</p>` : ""}
        ${type === "warning" && s.whatsapp_number ? `
          <div class="popup-safety">
            <strong>Official contact:</strong> sirf ${s.whatsapp_number} par hi confirm kariye.
            ${s.upi_id ? `<br><strong>Official UPI:</strong> ${s.upi_id}` : ""}
          </div>` : ""}
        ${s.popup_button_text ? `<a href="${s.popup_button_link || "#"}" class="btn btn-brass btn-block" data-popup-ok>${s.popup_button_text}</a>` : ""}
        <button class="popup-dismiss">Close</button>
      </div>
    </div>`;

  document.body.appendChild(wrap);
  document.body.style.overflow = "hidden";

  const close = () => {
    sessionStorage.setItem(key, "1");
    wrap.remove();
    document.body.style.overflow = "";
  };
  wrap.querySelector(".popup-close").addEventListener("click", close);
  wrap.querySelector(".popup-dismiss").addEventListener("click", close);
  const okBtn = wrap.querySelector("[data-popup-ok]");
  if (okBtn && (okBtn.getAttribute("href") === "#" || !okBtn.getAttribute("href"))) {
    okBtn.addEventListener("click", e => { e.preventDefault(); close(); });
  }
  wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); }, { once: true });
}

async function loadSiteContent() {
  try {
    const { data, error } = await supabaseClient.from("site_content").select("*");
    if (error) throw error;
    (data || []).forEach(row => {
      document.querySelectorAll(`[data-content="${row.content_key}"]`).forEach(el => {
        if (row.content_value) el.textContent = row.content_value;
      });
    });
  } catch (err) {
    console.error("Could not load site content:", err.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initNavToggle();
  if (typeof supabaseClient !== "undefined") {
    loadCompanySettings();
    loadSiteContent();
  }
});
