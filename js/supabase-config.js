// ============================================================
// Supabase connection config — Aaliya Book Publication
// Project: aaliya-book-publication (ap-south-1 / Mumbai)
// ============================================================
const SUPABASE_URL = "https://cgjweorszkxoabslqfnr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnandlb3Jzemt4b2Fic2xxZm5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2Nzg0NzgsImV4cCI6MjEwMTI1NDQ3OH0.fN74Hm6RIMCI3ppCTfM-xEU1U3gF60czN4gTekU5dtM";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
