// ============================================================
// Marketing Automation — banners, coupons, referrals,
// rewards, campaigns, newsletter
// ============================================================

let referralsCache = [];
let referralFilter = "all";

function mTitle(s) { return (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function mDate(d) { return d ? new Date(d).toLocaleDateString("en-IN") : "—"; }
function mMoney(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }

// ------------------------------------------------------------
// Marketing stats
// ------------------------------------------------------------
async function loadMarketingStats() {
  const { data } = await supabaseClient.from("marketing_summary").select("*").single();
  const box = document.getElementById("marketing-stats");
  if (!box || !data) return;

  const conversion = data.total_referrals > 0
    ? Math.round((data.successful_referrals / data.total_referrals) * 100) + "%"
    : "—";

  const stats = [
    { label: "Total Enquiries", value: data.total_enquiries },
    { label: "Newsletter Subscribers", value: data.newsletter_subscribers },
    { label: "Total Referrals", value: data.total_referrals },
    { label: "Referral Conversion", value: conversion },
    { label: "Coupon Uses", value: data.coupon_uses },
    { label: "Discount Given", value: mMoney(data.total_discount_given) },
    { label: "Campaigns Sent", value: data.campaigns_sent },
    { label: "Active Banners", value: data.active_banners },
  ];
  box.innerHTML = stats.map(s => `<div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`).join("");
}

// ------------------------------------------------------------
// Banners
// ------------------------------------------------------------
async function loadBanners() {
  const { data } = await supabaseClient.from("banners").select("*").order("display_order");
  const tbody = document.getElementById("banners-body");
  if (!tbody) return;
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No banners created yet.</td></tr>`; return; }

  tbody.innerHTML = data.map(b => `
    <tr>
      <td>${b.image_url ? `<img src="${b.image_url}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:8px">` : ""}${b.title}</td>
      <td>${b.discount_text ? b.discount_text + " OFF" : (b.badge_text || "—")}</td>
      <td>${mDate(b.start_date)} → ${mDate(b.end_date)}</td>
      <td>${b.is_active ? "Active" : "Hidden"}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="toggleBanner('${b.id}', ${!b.is_active})">${b.is_active ? "Hide" : "Show"}</button>
        <button class="btn btn-outline btn-sm" onclick="deleteBanner('${b.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

async function handleBannerCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("banner-msg");
  const { error } = await supabaseClient.from("banners").insert({
    title: f.title.value.trim(),
    description: f.description.value.trim() || null,
    badge_text: f.badge_text.value.trim() || null,
    discount_text: f.discount_text.value.trim() || null,
    coupon_code: f.coupon_code.value.trim().toUpperCase() || null,
    image_url: f.image_url.value.trim() || null,
    button_text: f.button_text.value.trim() || "Apply Now",
    button_link: f.button_link.value.trim() || "signup.html",
    start_date: f.start_date.value || null,
    end_date: f.end_date.value || null,
    display_order: parseInt(f.display_order.value || 0, 10),
  });
  msg.textContent = error ? error.message : "बैनर जुड़ गया — होमपेज पर दिखेगा।";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadBanners(); loadMarketingStats(); if (typeof logActivity === "function") logActivity("Banner added", f.title.value); }
}

async function toggleBanner(id, state) {
  await supabaseClient.from("banners").update({ is_active: state }).eq("id", id);
  loadBanners(); loadMarketingStats();
}
async function deleteBanner(id) {
  if (!confirm("Delete this banner?")) return;
  await supabaseClient.from("banners").delete().eq("id", id);
  loadBanners(); loadMarketingStats();
}

// ------------------------------------------------------------
// Coupons
// ------------------------------------------------------------
async function loadCoupons() {
  const { data } = await supabaseClient.from("coupons").select("*").order("created_at", { ascending: false });
  const tbody = document.getElementById("coupons-body");
  if (!tbody) return;
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="7">No coupons created yet.</td></tr>`; return; }

  tbody.innerHTML = data.map(c => `
    <tr>
      <td><strong>${c.code}</strong>${c.description ? `<br><small>${c.description}</small>` : ""}</td>
      <td>${c.discount_type === "percent" ? c.discount_value + "%" : mMoney(c.discount_value)}</td>
      <td>${mMoney(c.min_amount)}</td>
      <td>${c.used_count}${c.usage_limit ? " / " + c.usage_limit : ""}</td>
      <td>${mDate(c.expiry_date)}</td>
      <td>${c.is_active ? "Active" : "Inactive"}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="toggleCoupon('${c.id}', ${!c.is_active})">${c.is_active ? "Disable" : "Enable"}</button>
        <button class="btn btn-outline btn-sm" onclick="deleteCoupon('${c.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

async function handleCouponCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("coupon-admin-msg");
  const { error } = await supabaseClient.from("coupons").insert({
    code: f.code.value.trim().toUpperCase(),
    description: f.description.value.trim() || null,
    discount_type: f.discount_type.value,
    discount_value: parseFloat(f.discount_value.value || 0),
    min_amount: parseFloat(f.min_amount.value || 0),
    expiry_date: f.expiry_date.value || null,
    usage_limit: f.usage_limit.value ? parseInt(f.usage_limit.value, 10) : null,
  });
  msg.textContent = error
    ? (error.code === "23505" ? "This coupon code already exists." : error.message)
    : "कूपन बन गया।";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadCoupons(); loadMarketingStats(); if (typeof logActivity === "function") logActivity("Coupon created", f.code.value); }
}

async function toggleCoupon(id, state) {
  await supabaseClient.from("coupons").update({ is_active: state }).eq("id", id);
  loadCoupons();
}
async function deleteCoupon(id) {
  if (!confirm("Delete this coupon?")) return;
  await supabaseClient.from("coupons").delete().eq("id", id);
  loadCoupons(); loadMarketingStats();
}

// ------------------------------------------------------------
// Referrals
// ------------------------------------------------------------
async function loadReferrals() {
  const { data } = await supabaseClient
    .from("referrals")
    .select("*, referrer:referrer_id(full_name, mobile), referred:referred_id(full_name, mobile)")
    .order("created_at", { ascending: false });
  referralsCache = data || [];
  renderReferrals();
}

function renderReferrals() {
  const tbody = document.getElementById("referrals-body");
  if (!tbody) return;
  const list = referralFilter === "all" ? referralsCache : referralsCache.filter(r => r.status === referralFilter);

  if (list.length === 0) { tbody.innerHTML = `<tr><td colspan="6">No referrals match this filter.</td></tr>`; return; }

  tbody.innerHTML = list.map(r => `
    <tr>
      <td>${r.referrer?.full_name || "—"}<br><small>${r.referrer?.mobile || ""}</small></td>
      <td>${r.referred?.full_name || "—"}<br><small>${r.referred?.mobile || ""}</small></td>
      <td>${mDate(r.created_at)}</td>
      <td><span class="status-badge status-${r.status}">${mTitle(r.status)}</span></td>
      <td>${Number(r.reward_amount) > 0 ? mMoney(r.reward_amount) : "—"}</td>
      <td>
        ${r.status !== "rewarded" ? `<button class="btn btn-outline btn-sm" onclick="rewardReferral('${r.id}')">Reward</button>` : ""}
        ${r.status === "pending" ? `<button class="btn btn-outline btn-sm" onclick="updateReferralStatus('${r.id}','rejected')">Reject</button>` : ""}
      </td>
    </tr>`).join("");
}

async function rewardReferral(id) {
  const amountStr = prompt("Enter the reward amount (₹):", "100");
  if (amountStr === null) return;
  const amount = parseFloat(amountStr || 0);

  const { error } = await supabaseClient.from("referrals")
    .update({ status: "rewarded", reward_amount: amount }).eq("id", id);

  if (error) { alert(error.message); return; }
  if (typeof logActivity === "function") logActivity("Referral rewarded", `₹${amount}`);
  loadReferrals(); loadMarketingStats();
}

async function updateReferralStatus(id, status) {
  await supabaseClient.from("referrals").update({ status }).eq("id", id);
  loadReferrals();
}

// ------------------------------------------------------------
// Rewards
// ------------------------------------------------------------
async function loadRewardCustomerOptions() {
  const select = document.getElementById("reward-customer");
  if (!select) return;
  const { data } = await supabaseClient.from("profiles").select("id, full_name, customer_id").eq("is_admin", false);
  select.innerHTML = (data || []).map(c =>
    `<option value="${c.id}">${c.full_name || "Customer"} (${c.customer_id || "—"})</option>`
  ).join("");
}

async function handleRewardGrant(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("reward-msg");
  const { error } = await supabaseClient.from("rewards").insert({
    customer_id: f.customer_id.value,
    reward_type: f.reward_type.value,
    title: f.title.value.trim(),
    description: f.description.value.trim() || null,
    amount: parseFloat(f.amount.value || 0),
    expiry_date: f.expiry_date.value || null,
  });
  msg.textContent = error ? error.message : "रिवॉर्ड दे दिया गया — कस्टमर के डैशबोर्ड पर दिखेगा।";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); if (typeof logActivity === "function") logActivity("Reward granted", f.title.value); }
}

// ------------------------------------------------------------
// Campaigns
// ------------------------------------------------------------
async function loadCampaigns() {
  const { data } = await supabaseClient.from("campaigns").select("*").order("created_at", { ascending: false });
  const tbody = document.getElementById("campaigns-body");
  if (!tbody) return;
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No campaigns created yet.</td></tr>`; return; }

  tbody.innerHTML = data.map(c => `
    <tr>
      <td><strong>${c.name}</strong>${c.subject ? `<br><small>${c.subject}</small>` : ""}</td>
      <td>${mTitle(c.target_group)}</td>
      <td><span class="status-badge status-${c.status}">${mTitle(c.status)}</span></td>
      <td>${c.recipients_count || 0}</td>
      <td>
        ${c.status !== "sent" ? `<button class="btn btn-outline btn-sm" onclick="sendCampaign('${c.id}')">Send Now</button>` : ""}
        <button class="btn btn-outline btn-sm" onclick="deleteCampaign('${c.id}')">Delete</button>
      </td>
    </tr>`).join("");
}

async function handleCampaignCreate(e) {
  e.preventDefault();
  const f = e.target;
  const msg = document.getElementById("campaign-msg");
  const { data: { session } } = await supabaseClient.auth.getSession();

  const { error } = await supabaseClient.from("campaigns").insert({
    name: f.name.value.trim(),
    target_group: f.target_group.value,
    subject: f.subject.value.trim() || null,
    message: f.message.value.trim(),
    start_date: f.start_date.value || null,
    end_date: f.end_date.value || null,
    created_by: session?.user?.id,
  });
  msg.textContent = error ? error.message : "कैम्पेन सेव हो गया। भेजने के लिए 'Send Now' दबाइए।";
  msg.className = "form-msg " + (error ? "error" : "ok");
  if (!error) { f.reset(); loadCampaigns(); }
}

async function sendCampaign(id) {
  if (!confirm("Ye campaign ab bhej dein? Sabhi target customers ko notification jayega.")) return;
  const { data, error } = await supabaseClient.rpc("send_campaign", { campaign_id: id });
  if (error) { alert(error.message); return; }
  alert(`Campaign ${data ?? 0} customers ko bhej diya gaya.`);
  if (typeof logActivity === "function") logActivity("Campaign sent", `${data ?? 0} recipients`);
  loadCampaigns(); loadMarketingStats();
}

async function deleteCampaign(id) {
  if (!confirm("Delete this campaign?")) return;
  await supabaseClient.from("campaigns").delete().eq("id", id);
  loadCampaigns();
}

// ------------------------------------------------------------
// Newsletter subscribers
// ------------------------------------------------------------
let subscribersCache = [];

async function loadSubscribers() {
  const { data } = await supabaseClient.from("newsletter_subscribers").select("*").order("created_at", { ascending: false });
  subscribersCache = data || [];
  const tbody = document.getElementById("subscribers-body");
  if (!tbody) return;
  if (subscribersCache.length === 0) { tbody.innerHTML = `<tr><td colspan="4">No subscribers yet.</td></tr>`; return; }

  tbody.innerHTML = subscribersCache.map(s => `
    <tr>
      <td>${s.email}</td>
      <td>${s.name || "—"}</td>
      <td>${mDate(s.created_at)}</td>
      <td>${s.is_active ? "Active" : "Unsubscribed"}</td>
    </tr>`).join("");
}

function exportSubscribers() {
  if (subscribersCache.length === 0) { alert("There are no subscribers."); return; }
  const csv = ["Email,Name,Subscribed On,Status",
    ...subscribersCache.map(s => `"${s.email}","${s.name || ""}","${mDate(s.created_at)}","${s.is_active ? "Active" : "Unsubscribed"}"`)
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
function initMarketing() {
  document.getElementById("banner-form")?.addEventListener("submit", handleBannerCreate);
  document.getElementById("coupon-form")?.addEventListener("submit", handleCouponCreate);
  document.getElementById("reward-form")?.addEventListener("submit", handleRewardGrant);
  document.getElementById("campaign-form")?.addEventListener("submit", handleCampaignCreate);

  document.querySelectorAll("[data-ref-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-ref-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      referralFilter = btn.dataset.refFilter;
      renderReferrals();
    });
  });

  loadMarketingStats();
  loadBanners();
  loadCoupons();
  loadReferrals();
  loadRewardCustomerOptions();
  loadCampaigns();
  loadSubscribers();
}
