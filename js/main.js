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
  document.querySelectorAll("[data-bank-account-name]").forEach(el => el.textContent = data.bank_account_name || "—");
  document.querySelectorAll("[data-bank-name]").forEach(el => el.textContent = data.bank_name || "—");
  document.querySelectorAll("[data-bank-account-number]").forEach(el => el.textContent = data.bank_account_number || "—");
  document.querySelectorAll("[data-bank-ifsc]").forEach(el => el.textContent = data.bank_ifsc || "—");

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

  // Social links
  const socials = { facebook: data.facebook_url, instagram: data.instagram_url, twitter: data.twitter_url, youtube: data.youtube_url };
  Object.entries(socials).forEach(([key, url]) => {
    document.querySelectorAll(`[data-social="${key}"]`).forEach(a => {
      if (url) { a.href = url; a.style.display = "inline"; }
      else a.style.display = "none";
    });
  });
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
