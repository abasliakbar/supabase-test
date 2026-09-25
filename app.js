      const SUPABASE_URL = "https://htxzvxyzjajfrwcfbrgu.supabase.co";
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0eHp2eHl6amFqZnJ3Y2Zicmd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTQwNDEsImV4cCI6MjEwNTkzMDA0MX0.E2kkPd4XCxfWNr1Eid12cnyNJcwYg3q75L-RWb94a_g";
      const { createClient } = window.supabase;
      const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const elements = {
        authCard: document.querySelector("#auth-card"),
        authForm: document.querySelector("#auth-form"),
        authMessage: document.querySelector("#auth-message"),
        authSubmit: document.querySelector("#auth-submit"),
        dashboard: document.querySelector("#dashboard"),
        dashboardMessage: document.querySelector("#dashboard-message"),
        userEmail: document.querySelector("#user-email"),
        balance: document.querySelector("#balance"),
        amount: document.querySelector("#amount"),
        loginTab: document.querySelector("#login-tab"),
        signupTab: document.querySelector("#signup-tab"),
        logoutButton: document.querySelector("#logout-button"),
        addButton: document.querySelector("#add-button"),
        subtractButton: document.querySelector("#subtract-button")
      };
      let authMode = "login";
      let currentUser = null;
      let bankRow = null;
      let requestNumber = 0;
      let busy = false;

      function setMessage(element, message, kind = "") {
        element.textContent = message;
        element.dataset.kind = kind;
      }

      function setBusy(value) {
        busy = value;
        elements.authSubmit.disabled = value;
        elements.logoutButton.disabled = value;
        elements.addButton.disabled = value;
        elements.subtractButton.disabled = value;
      }

      function renderBalance() {
        elements.balance.replaceChildren();
        if (!bankRow) {
          elements.balance.append(document.createTextNode("— "));
        } else {
          elements.balance.append(document.createTextNode(`${Number(bankRow.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `));
        }
        const unit = document.createElement("span");
        unit.className = "unit";
        unit.textContent = "units";
        elements.balance.append(unit);
      }

      function setAuthMode(mode) {
        authMode = mode;
        const signingUp = mode === "signup";
        elements.loginTab.setAttribute("aria-selected", String(!signingUp));
        elements.signupTab.setAttribute("aria-selected", String(signingUp));
        elements.authSubmit.textContent = signingUp ? "Create account" : "Log in";
        document.querySelector("#password").autocomplete = signingUp ? "new-password" : "current-password";
        setMessage(elements.authMessage, "");
      }

      function applySession(session) {
        const user = session?.user ?? null;
        currentUser = user;
        bankRow = null;
        requestNumber += 1;
        const request = requestNumber;
        const authenticated = Boolean(user);
        elements.authCard.hidden = authenticated;
        elements.dashboard.classList.toggle("is-visible", authenticated);
        elements.userEmail.textContent = user?.email ?? "";
        renderBalance();
        setMessage(elements.dashboardMessage, authenticated ? "Loading your private row…" : "");
        if (authenticated) {
          void loadBankRow(user, request);
        }
      }

      async function loadBankRow(user, request) {
        try {
          const { data, error } = await supabaseClient
            .from("bank")
            .select("id, balance")
            .eq("user_id", user.id)
            .maybeSingle();
          if (error) throw error;
          if (request !== requestNumber || currentUser?.id !== user.id) return;

          if (data) {
            bankRow = data;
            renderBalance();
            setMessage(elements.dashboardMessage, "Your balance is loaded.");
            return;
          }

          const { data: inserted, error: insertError } = await supabaseClient
            .from("bank")
            .insert({ user_id: user.id, balance: 0 })
            .select("id, balance")
            .single();
          if (insertError) throw insertError;
          if (request !== requestNumber || currentUser?.id !== user.id) return;
          bankRow = inserted;
          renderBalance();
          setMessage(elements.dashboardMessage, "Your bank row was created with a zero balance.", "success");
        } catch (error) {
          if (request !== requestNumber || currentUser?.id !== user.id) return;
          setMessage(elements.dashboardMessage, `Could not load or create your bank row: ${error.message}. Check that RLS is enabled and the select/insert policies are in place.`, "error");
        }
      }

      elements.loginTab.addEventListener("click", () => setAuthMode("login"));
      elements.signupTab.addEventListener("click", () => setAuthMode("signup"));

      elements.authForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage(elements.authMessage, "");
        const form = new FormData(elements.authForm);
        const email = String(form.get("email")).trim();
        const password = String(form.get("password"));
        try {
          if (authMode === "signup") {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw error;
            if (data.session) {
              setMessage(elements.authMessage, "Account created. Loading your bank row…", "success");
            } else {
              setMessage(elements.authMessage, "Account created. Check your email to confirm it, then log in to create or load your bank row.", "success");
            }
          } else {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            setMessage(elements.authMessage, "You're signed in. Loading your bank row…", "success");
          }
        } catch (error) {
          setMessage(elements.authMessage, error.message, "error");
        } finally {
          setBusy(false);
        }
      });

      elements.logoutButton.addEventListener("click", async () => {
        if (busy) return;
        setBusy(true);
        setMessage(elements.dashboardMessage, "");
        try {
          const { error } = await supabaseClient.auth.signOut();
          if (error) throw error;
        } catch (error) {
          setMessage(elements.dashboardMessage, `Could not log out: ${error.message}`, "error");
        } finally {
          setBusy(false);
        }
      });

      async function changeBalance(direction) {
        if (!currentUser || !bankRow || busy) return;
        const amount = Number(elements.amount.value);
        if (!Number.isFinite(amount) || amount <= 0) {
          setMessage(elements.dashboardMessage, "Enter an amount greater than zero.", "error");
          return;
        }
        const nextBalance = Number((Number(bankRow.balance) + direction * amount).toFixed(2));
        if (nextBalance < 0) {
          setMessage(elements.dashboardMessage, "The balance cannot go below zero in this demo.", "error");
          return;
        }
        setBusy(true);
        setMessage(elements.dashboardMessage, "Saving your balance…");
        try {
          const { data, error } = await supabaseClient
            .from("bank")
            .update({ balance: nextBalance })
            .eq("id", bankRow.id)
            .eq("user_id", currentUser.id)
            .select("id, balance")
            .single();
          if (error) throw error;
          bankRow = data;
          renderBalance();
          setMessage(elements.dashboardMessage, "Balance updated. Your update policy allowed the change.", "success");
        } catch (error) {
          setMessage(elements.dashboardMessage, `Could not update the balance: ${error.message}. Check that the update policy is in place.`, "error");
        } finally {
          setBusy(false);
        }
      }

      elements.addButton.addEventListener("click", () => void changeBalance(1));
      elements.subtractButton.addEventListener("click", () => void changeBalance(-1));

      supabaseClient.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => applySession(session), 0);
      });
      supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) {
          setMessage(elements.authMessage, `Could not restore your session: ${error.message}`, "error");
          return;
        }
        applySession(data.session);
      }).catch((error) => {
        setMessage(elements.authMessage, `Could not restore your session: ${error.message}`, "error");
      });
