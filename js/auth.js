const supabaseClient = window.supabaseClient;

if (!supabaseClient) {
    throw new Error(
        "Supabase client is not initialized. Check your script loading order."
    );
}

// ==========================================
// FORM ELEMENTS
// ==========================================

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const message = document.getElementById("message");

const loginButton = document.getElementById("loginButton");
const signupButton = document.getElementById("signupButton");

// ==========================================
// FORM SWITCHING
// ==========================================

document.getElementById("showSignup").addEventListener("click", function(e) {
    e.preventDefault();

    loginForm.classList.add("hidden");
    signupForm.classList.remove("hidden");

    clearMessage();
});

document.getElementById("showLogin").addEventListener("click", function(e) {
    e.preventDefault();

    signupForm.classList.add("hidden");
    loginForm.classList.remove("hidden");

    clearMessage();
});

// ==========================================
// MESSAGE HANDLING
// ==========================================

function showMessage(text, type) {
    message.textContent = text;
    message.className = "message " + type;
}

function clearMessage() {
    message.textContent = "";
    message.className = "message hidden";
}

// ==========================================
// LOGIN
// ==========================================

loginForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    clearMessage();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";

    try {
        const { data, error } =
            await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

        if (error) throw error;

        const { data: profile, error: profileError } =
            await supabaseClient
                .from("profiles")
                .select("username, display_name, userlevel, account_status")
                .eq("id", data.user.id)
                .single();

        if (profileError) throw profileError;

        if (profile.account_status !== "active") {

            await supabaseClient.auth.signOut();

            if (profile.account_status === "pending") {
                throw new Error(
                    "Your account is awaiting administrator approval."
                );
            }

            throw new Error("Your account is suspended.");
        }

        showMessage("Login successful. Redirecting...", "success");

        window.location.href = "dashboard.html";

    } catch (error) {

        showMessage(error.message, "error");

    } finally {

        loginButton.disabled = false;
        loginButton.textContent = "Sign In";
    }
});

// ==========================================
// SIGN UP
// ==========================================

signupForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    clearMessage();

    const displayName =
        document.getElementById("signupName").value.trim();

    const username =
        document.getElementById("signupUsername").value.trim().toLowerCase();

    const email =
        document.getElementById("signupEmail").value.trim();

    const userlevel =
        document.getElementById("signupUserlevel").value;

    const password =
        document.getElementById("signupPassword").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;

    if (password !== confirmPassword) {
        showMessage("Passwords do not match.", "error");
        return;
    }

    if (password.length < 8) {
        showMessage(
            "Password must contain at least 8 characters.",
            "error"
        );
        return;
    }

    if (!/^[a-z0-9_]{3,50}$/.test(username)) {
        showMessage(
            "Username must contain 3-50 letters, numbers or underscores.",
            "error"
        );
        return;
    }

    signupButton.disabled = true;
    signupButton.textContent = "Creating account...";

    try {

        const { data, error } =
            await supabaseClient.auth.signUp({
                email: email,
                password: password,

                options: {
                    data: {
                        username: username,
                        display_name: displayName,
                        userlevel: userlevel
                    }
                }
            });

        if (error) throw error;

        showMessage(
            "Registration successful! Check your email if verification is required. Your account will remain pending until an administrator approves it.",
            "success"
        );

        signupForm.reset();

    } catch (error) {

        showMessage(error.message, "error");

    } finally {

        signupButton.disabled = false;
        signupButton.textContent = "Create Account";
    }
});

// ==========================================
// FORGOT PASSWORD
// ==========================================

document.getElementById("forgotPassword")
    .addEventListener("click", async function(e) {

        e.preventDefault();

        const email =
            document.getElementById("loginEmail").value.trim();

        if (!email) {
            showMessage(
                "Enter your email address first.",
                "error"
            );
            return;
        }

        try {

            const { error } =
                await supabaseClient.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + "/reset-password.html"
                });

            if (error) throw error;

            showMessage(
                "If an account exists for this address, password recovery instructions will be sent.",
                "success"
            );

        } catch (error) {

            showMessage(error.message, "error");

        }
    });