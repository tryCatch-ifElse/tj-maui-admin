const SUPABASE_URL = "https://khcrqjouasxxhdzppafy.supabase.co";
const SUPABASE_KEY = "sb_publishable_1LR-CbtzpRPG0Vw7CVpOqg_R9DMkNKj";

async function testSupabaseConnection() {
    try {
        const response = await fetch(
            `${SUPABASE_URL}/auth/v1/settings`,
            {
                method: "GET",
                headers: {
                    "apikey": SUPABASE_KEY
                }
            }
        );

        const result = await response.text();

        console.log("HTTP Status:", response.status);
        console.log("Supabase Response:", result);

        if (response.ok) {
            console.log("SUCCESS: API key is accepted.");
        } else {
            console.error("FAILED: API key was rejected.");
        }
    } catch (error) {
        console.error("Connection error:", error);
    }
}

if (!window.supabase) {
    throw new Error("Supabase library was not loaded.");
}

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

testSupabaseConnection();