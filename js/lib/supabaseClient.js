// Cliente Supabase compartilhado por toda a aplicação.
// Depende do UMD do @supabase/supabase-js (carregado via CDN no index.html) e de js/config.js.
var supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
