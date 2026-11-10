/* TJ & MAUI STUDIO dashboard
   Requires js/supabase.js to expose window.supabaseClient. */
(() => {
  "use strict";

  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error("Supabase client not found. Check the script order in dashboard.html.");
    alert("The Supabase client could not be initialized. Please check js/supabase.js.");
    return;
  }

  const PAGE_SIZE = 10;
  const state = {
    user: null, profile: null, clients: [], events: [],
    clientPage: 0, clientSearch: "", clientStatus: "all",
    eventSearch: "", eventStatus: "all", weddingSearch: "", weddingDirectoryDetails: {}, deploymentEventId: "",
    growthChart: null, statusChart: null,
    weddingEventId: "", weddingDetails: null, venues: [], colors: [], groups: [], members: []
  };
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
  const formatDate = (value) => {
    if (!value) return "—";
    const d = new Date(value + (String(value).length === 10 ? "T00:00:00" : ""));
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PH", {month:"short", day:"numeric", year:"numeric"});
  };
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase();
  const showToast = (message) => {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2800);
  };
  const setButtonBusy = (button, busy, label) => {
    button.disabled = busy;
    button.textContent = busy ? "Saving..." : label;
  };
  const statusBadge = (status) => `<span class="status-pill status-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
  const emptyRow = (columns, message) => `<tr><td class="empty-cell" colspan="${columns}">${escapeHtml(message)}</td></tr>`;

  async function initialize() {
    $("todayLabel").textContent = new Date().toLocaleDateString("en-PH", {weekday:"short", month:"short", day:"numeric", year:"numeric"});
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      window.location.replace("index.html");
      return;
    }
    state.user = session.user;
    const { data: profile, error } = await supabase.from("profiles")
      .select("id, username, display_name, userlevel, account_status")
      .eq("id", session.user.id).single();
    if (error || !profile || profile.account_status !== "active" ||
        !["owner", "admin", "staff"].includes(profile.userlevel)) {
      await supabase.auth.signOut();
      alert("Your account is not authorized to access the studio dashboard. Contact the owner.");
      window.location.replace("index.html");
      return;
    }
    state.profile = profile;
    $("userName").textContent = profile.display_name || profile.username || session.user.email;
    $("userRole").textContent = profile.userlevel;
    $("userAvatar").textContent = initials(profile.display_name || profile.username || "T");
    bindUI();
    await refreshData();
  }

  function bindUI() {
    mountWeddingForms();
    document.querySelectorAll("[data-view]").forEach(link => link.addEventListener("click", e => {
      e.preventDefault(); switchView(link.dataset.view);
    }));
    document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.go)));
    $("mobileMenu").addEventListener("click", () => $("sidebar").classList.toggle("open"));
    $("logoutButton").addEventListener("click", async () => {
      const { error } = await supabase.auth.signOut();
      if (error) return showToast(error.message);
      window.location.replace("index.html");
    });
    $("overviewAddClient").addEventListener("click", () => openClientModal());
    $("addClientButton").addEventListener("click", () => openClientModal());
    $("addEventButton").addEventListener("click", () => openEventModal());
    $("clientSearch").addEventListener("input", e => { state.clientSearch = e.target.value.toLowerCase().trim(); state.clientPage = 0; renderClients(); });
    $("clientStatusFilter").addEventListener("change", e => { state.clientStatus = e.target.value; state.clientPage = 0; renderClients(); });
    $("eventSearch").addEventListener("input", e => { state.eventSearch = e.target.value.toLowerCase().trim(); renderEvents(); });
    $("eventStatusFilter").addEventListener("change", e => { state.eventStatus = e.target.value; renderEvents(); });
    $("eventsTableBody").addEventListener("click", e => { const row = e.target.closest("tr[data-event-id]"); if (row) openDeploymentModal(row.dataset.eventId); });
    $("eventsTableBody").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { const row = e.target.closest("tr[data-event-id]"); if (row) { e.preventDefault(); openDeploymentModal(row.dataset.eventId); } } });
    $("saveDeploymentButton").addEventListener("click", saveDeployment);
    $("publishWebsiteButton").addEventListener("click", () => changeDeploymentStatus("published"));
    $("unpublishWebsiteButton").addEventListener("click", () => changeDeploymentStatus("unpublished"));
    $("previewWebsiteButton").addEventListener("click", previewWebsite);
    $("copyWebsiteUrlButton").addEventListener("click", copyWebsiteUrl);
    $("prevClients").addEventListener("click", () => { if (state.clientPage > 0) { state.clientPage--; renderClients(); } });
    $("nextClients").addEventListener("click", () => { state.clientPage++; renderClients(); });
    $("clientForm").addEventListener("submit", saveClient);
    $("eventForm").addEventListener("submit", saveEvent);
    $("weddingSearch").addEventListener("input", e => { state.weddingSearch = e.target.value.toLowerCase().trim(); renderWeddingDirectory(); });
    $("weddingTableBody").addEventListener("click", e => { const row = e.target.closest("tr[data-wedding-event]"); if (row) openWeddingRecord(row.dataset.weddingEvent); });
    $("weddingTableBody").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { const row = e.target.closest("tr[data-wedding-event]"); if (row) { e.preventDefault(); openWeddingRecord(row.dataset.weddingEvent); } } });
    $("weddingDetailsForm").addEventListener("submit", saveWeddingDetails);
    $("editCoupleButton").addEventListener("click", openCoupleModal);
    $("addVenueButton").addEventListener("click", () => openWeddingModal("venueForm"));
    $("addColorButton").addEventListener("click", () => openWeddingModal("colorForm"));
    $("addGroupButton").addEventListener("click", () => openWeddingModal("groupForm"));
    $("addMemberButton").addEventListener("click", () => openWeddingModal("memberForm"));
    $("venueForm").addEventListener("submit", saveVenue);
    $("colorForm").addEventListener("submit", saveColor);
    $("groupForm").addEventListener("submit", saveGroup);
    $("memberForm").addEventListener("submit", saveMember);
    $("venuesList").addEventListener("click", handleWeddingDelete);
    $("colorsList").addEventListener("click", handleWeddingDelete);
    $("groupsList").addEventListener("click", handleWeddingDelete);
    $("membersList").addEventListener("click", handleWeddingDelete);
    document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
    document.querySelectorAll("[data-wedding-back]").forEach(button => button.addEventListener("click", showWeddingWorkspace));
    document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", e => {
      if (e.target === backdrop) closeModal(backdrop.id);
    }));
    $("clientsTableBody").addEventListener("click", handleClientAction);
  }

  function switchView(view) {
    const valid = ["overview", "clients", "events", "wedding-details"].includes(view) ? view : "overview";
    document.querySelectorAll(".view").forEach(el => el.classList.remove("active-view"));
    $(valid + "View").classList.add("active-view");
    document.querySelectorAll("[data-view]").forEach(el => el.classList.toggle("active", el.dataset.view === valid));
    $("breadcrumbCurrent").textContent = valid.charAt(0).toUpperCase() + valid.slice(1);
    $("sidebar").classList.remove("open");
    if (valid === "clients") renderClients();
    if (valid === "events") renderEvents();
    if (valid === "wedding-details") renderWeddingDirectory();
    history.replaceState(null, "", "#" + valid);
  }

  async function refreshData() {
    const [clientsResult, eventsResult] = await Promise.all([
      supabase.from("clients").select("*").order("created_at", {ascending:false}),
      supabase.from("events").select("*").order("created_at", {ascending:false})
    ]);
    if (clientsResult.error) {
      console.error(clientsResult.error);
      showToast("Could not load clients: " + clientsResult.error.message);
      state.clients = [];
    } else state.clients = clientsResult.data || [];
    if (eventsResult.error) {
      console.error(eventsResult.error);
      showToast("Could not load events: " + eventsResult.error.message);
      state.events = [];
    } else state.events = eventsResult.data || [];
    renderAll();
  }

  function renderAll() {
    renderStats(); renderRecentClients(); renderClients(); renderEvents(); populateEventClients(); renderCharts();
  }

  function renderStats() {
    const now = new Date(); now.setHours(0,0,0,0);
    $("totalClients").textContent = state.clients.length;
    $("activeClients").textContent = state.clients.filter(c => c.client_status === "active").length;
    $("totalEvents").textContent = state.events.length;
    $("upcomingEvents").textContent = state.events.filter(e =>
      e.event_date && new Date(e.event_date + "T00:00:00") >= now &&
      ["planning", "confirmed"].includes(e.event_status)
    ).length;
    $("navClientCount").textContent = state.clients.length;
  }

  function clientCell(client) {
    return `<div class="client-cell"><span class="client-avatar">${escapeHtml(initials(client.client_name))}</span><span><span class="client-name">${escapeHtml(client.client_name)}</span><span class="client-code">${escapeHtml(client.client_code || "")}</span></span></div>`;
  }

  function renderRecentClients() {
    const rows = state.clients.slice(0,5);
    $("recentClientsBody").innerHTML = rows.length ? rows.map(c => `<tr>
      <td>${clientCell(c)}</td><td>${escapeHtml(c.email || "—")}</td>
      <td>${formatDate(c.created_at)}</td><td>${statusBadge(c.client_status)}</td></tr>`).join("") : emptyRow(4, "No clients yet. Add your first client to get started.");
  }

  function getFilteredClients() {
    return state.clients.filter(c => {
      const haystack = [c.client_name,c.client_code,c.email,c.contact_number].join(" ").toLowerCase();
      return (!state.clientSearch || haystack.includes(state.clientSearch)) &&
        (state.clientStatus === "all" || c.client_status === state.clientStatus);
    });
  }

  function renderClients() {
    if (!$("clientsTableBody")) return;
    const filtered = getFilteredClients();
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.clientPage = Math.min(state.clientPage, pages - 1);
    const start = state.clientPage * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);
    $("clientCountText").textContent = `${filtered.length} client record${filtered.length === 1 ? "" : "s"}`;
    $("clientPaginationText").textContent = filtered.length ? `Showing ${start+1}–${Math.min(start+PAGE_SIZE,filtered.length)} of ${filtered.length}` : "Showing 0 clients";
    $("prevClients").disabled = state.clientPage === 0;
    $("nextClients").disabled = state.clientPage >= pages - 1;
    $("clientsTableBody").innerHTML = pageRows.length ? pageRows.map(c => `<tr>
      <td>${clientCell(c)}</td><td>${escapeHtml(c.email || "—")}</td><td>${escapeHtml(c.contact_number || "—")}</td>
      <td>${formatDate(c.created_at)}</td><td>${statusBadge(c.client_status)}</td>
      <td><button class="row-action" data-edit="${escapeHtml(c.id)}" type="button">Edit</button></td></tr>`).join("") : emptyRow(6, "No matching clients found.");
  }

  function renderEvents() {
    if (!$("eventsTableBody")) return;
    const clientMap = new Map(state.clients.map(c => [c.id,c.client_name]));
    const rows = state.events.filter(e => {
      const haystack = [e.event_name,e.event_type,clientMap.get(e.client_id)].join(" ").toLowerCase();
      return (!state.eventSearch || haystack.includes(state.eventSearch)) &&
        (state.eventStatus === "all" || e.event_status === state.eventStatus);
    });
    $("eventCountText").textContent = `${rows.length} event record${rows.length === 1 ? "" : "s"}`;
    $("eventsTableBody").innerHTML = rows.length ? rows.map(e => `<tr class="event-directory-row" data-event-id="${escapeHtml(e.id)}" tabindex="0" role="button" aria-label="Manage website deployment for ${escapeHtml(e.event_name)}">
      <td><strong>${escapeHtml(e.event_name)}</strong><span class="client-code">${escapeHtml(e.event_code || e.event_type || "")}</span></td>
      <td>${escapeHtml(clientMap.get(e.client_id) || "Client unavailable")}</td>
      <td>${formatDate(e.event_date)}</td><td>${escapeHtml(e.venue || "—")}</td><td>${statusBadge(e.event_status)}</td><td>${deploymentBadge(e.website_deployment_status)}</td></tr>`).join("") : emptyRow(6, "No matching events found.");
  }

  const deploymentBadge = (status) => {
    const value = status || "not_deployed";
    const label = value === "not_deployed" ? "Not deployed" : value;
    return `<span class="status-pill deployment-${escapeHtml(value)}">${escapeHtml(label)}</span>`;
  };

  function openDeploymentModal(eventId) {
    const event = state.events.find(item => item.id === eventId);
    if (!event) return;
    state.deploymentEventId = event.id;
    $("deploymentEventTitle").textContent = event.event_name;
    $("deploymentEventCode").textContent = event.event_code || "Event";
    $("websiteUrl").value = event.website_url || "";
    $("customDomain").value = event.custom_domain || "";
    $("deploymentStatusDisplay").innerHTML = deploymentBadge(event.website_deployment_status);
    $("deploymentPublishedAt").textContent = event.website_published_at ? `Last published: ${new Date(event.website_published_at).toLocaleString("en-PH")}` : "Not published yet";
    $("deploymentUnpublishedAt").textContent = event.website_unpublished_at ? `Last unpublished: ${new Date(event.website_unpublished_at).toLocaleString("en-PH")}` : "";
    const published = event.website_deployment_status === "published";
    $("publishWebsiteButton").classList.toggle("hidden", published);
    $("unpublishWebsiteButton").classList.toggle("hidden", !published);
    $("previewWebsiteButton").disabled = !event.website_url;
    $("copyWebsiteUrlButton").disabled = !event.website_url;
    $("deploymentModalBackdrop").classList.remove("hidden");
  }

  async function saveDeployment() {
    const event = state.events.find(item => item.id === state.deploymentEventId);
    if (!event) return;
    const websiteUrl = $("websiteUrl").value.trim();
    const customDomain = $("customDomain").value.trim();
    if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) return showToast("Website URL must start with http:// or https://.");
    if (customDomain && /\s/.test(customDomain)) return showToast("Enter a valid custom domain without spaces.");
    const button = $("saveDeploymentButton");
    setButtonBusy(button, true, "Save website details");
    const { error } = await supabase.from("events").update({ website_url: websiteUrl || null, custom_domain: customDomain || null }).eq("id", event.id);
    setButtonBusy(button, false, "Save website details");
    if (error) { console.error(error); return showToast("Unable to save website details: " + error.message); }
    showToast("Website details saved. Deployment status was not changed.");
    await refreshData();
    openDeploymentModal(event.id);
  }

  async function changeDeploymentStatus(nextStatus) {
    const event = state.events.find(item => item.id === state.deploymentEventId);
    if (!event) return;
    if (!event.website_url) return showToast("Save a website URL before changing deployment status.");
    const action = nextStatus === "published" ? "publish" : "unpublish";
    const message = nextStatus === "published"
      ? "Mark this event website as published? This updates the dashboard status only; it does not deploy the website to your hosting provider."
      : "Mark this event website as unpublished? This updates the dashboard status only; it does not take the website offline at your hosting provider.";
    if (!window.confirm(message)) return;
    const timestamp = new Date().toISOString();
    const payload = { website_deployment_status: nextStatus };
    if (nextStatus === "published") payload.website_published_at = timestamp;
    else payload.website_unpublished_at = timestamp;
    const { error } = await supabase.from("events").update(payload).eq("id", event.id);
    if (error) { console.error(error); return showToast(`Unable to ${action} website status: ` + error.message); }
    showToast(`Website marked as ${nextStatus}.`);
    await refreshData();
    openDeploymentModal(event.id);
  }

  function previewWebsite() {
    const url = $("websiteUrl").value.trim();
    if (!url) return showToast("Save a website URL first.");
    if (!/^https?:\/\//i.test(url)) return showToast("Enter a valid URL beginning with http:// or https://.");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copyWebsiteUrl() {
    const url = $("websiteUrl").value.trim();
    if (!url) return showToast("Save a website URL first.");
    try { await navigator.clipboard.writeText(url); showToast("Website URL copied."); }
    catch (_) { showToast("Unable to copy the URL. Please copy it manually."); }
  }

  function renderCharts() {
    if (typeof Chart === "undefined") return;
    const labels = [];
    const counts = [];
    for (let i=5;i>=0;i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
      labels.push(d.toLocaleDateString("en-PH",{month:"short"}));
      counts.push(state.clients.filter(c => {
        const created = new Date(c.created_at);
        return created.getFullYear() === d.getFullYear() && created.getMonth() === d.getMonth();
      }).length);
    }
    $("growthEmpty").classList.toggle("hidden", state.clients.length > 0);
    if (state.growthChart) state.growthChart.destroy();
    state.growthChart = new Chart($("clientGrowthChart"), {
      type:"bar",
      data:{labels,datasets:[{data:counts,backgroundColor:"#9eaf98",hoverBackgroundColor:"#496b55",borderRadius:6,maxBarThickness:32}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{displayColors:false}},scales:{
        x:{grid:{display:false},ticks:{color:"#89958c",font:{family:"DM Sans",size:10}}},
        y:{beginAtZero:true,ticks:{precision:0,color:"#9aa49b",font:{size:9}},grid:{color:"#edf0e9"}}
      }}
    });
    const statuses = ["inquiry","planning","confirmed","completed","cancelled"];
    const colors = ["#c7b27f","#8da4b8","#789b7d","#a5b79a","#c98c7d"];
    const values = statuses.map(s => state.events.filter(e => e.event_status === s).length);
    $("eventEmpty").classList.toggle("hidden", state.events.length > 0);
    $("eventLegend").innerHTML = statuses.map((s,i) => `<span class="legend-item"><i class="legend-dot" style="background:${colors[i]}"></i>${s} <strong>${values[i]}</strong></span>`).join("");
    if (state.statusChart) state.statusChart.destroy();
    state.statusChart = new Chart($("eventStatusChart"), {
      type:"doughnut",
      data:{labels:statuses,datasets:[{data:values,backgroundColor:colors,borderWidth:3,borderColor:"#fffefa",hoverOffset:4}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:"70%",plugins:{legend:{display:false},tooltip:{displayColors:true}}}
    });
  }

  function populateEventClients(selectedId) {
    const select = $("eventClient");
    const current = selectedId || select.value;
    select.innerHTML = '<option value="">Select a client</option>' + state.clients
      .filter(c => c.client_status !== "archived")
      .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.client_name)}</option>`).join("");
    if (current) select.value = current;
  }

  function openClientModal(client) {
    $("clientForm").reset();
    $("clientId").value = client?.id || "";
    $("clientModalTitle").textContent = client ? "Edit client" : "Add new client";
    $("clientName").value = client?.client_name || "";
    $("clientEmail").value = client?.email || "";
    $("clientPhone").value = client?.contact_number || "";
    $("clientAddress").value = client?.address || "";
    $("clientStatus").value = client?.client_status || "active";
    $("clientNotes").value = client?.notes || "";
    $("clientModalBackdrop").classList.remove("hidden");
    $("clientName").focus();
  }

  function openEventModal() {
    if (!state.clients.some(c => c.client_status !== "archived")) {
      showToast("Add a client before creating an event.");
      switchView("clients");
      return;
    }
    $("eventForm").reset(); populateEventClients();
    $("eventModalBackdrop").classList.remove("hidden");
  }

  function closeModal(id) { $(id).classList.add("hidden"); }

  async function handleClientAction(event) {
    const button = event.target.closest("[data-edit]");
    if (!button) return;
    const client = state.clients.find(c => c.id === button.dataset.edit);
    if (client) openClientModal(client);
  }

  async function saveClient(event) {
    event.preventDefault();
    const button = $("saveClientButton");
    const id = $("clientId").value;
    const payload = {
      client_name: $("clientName").value.trim(),
      email: $("clientEmail").value.trim() || null,
      contact_number: $("clientPhone").value.trim() || null,
      address: $("clientAddress").value.trim() || null,
      client_status: $("clientStatus").value,
      notes: $("clientNotes").value.trim() || null
    };
    if (!payload.client_name) return showToast("Client name is required.");
    setButtonBusy(button,true,"Save client");
    let result;
    if (id) result = await supabase.from("clients").update(payload).eq("id",id);
    else result = await supabase.from("clients").insert({...payload,client_code:makeCode("CL"),created_by:state.user.id});
    setButtonBusy(button,false,"Save client");
    if (result.error) { console.error(result.error); return showToast("Unable to save client: " + result.error.message); }
    closeModal("clientModalBackdrop"); showToast(id ? "Client updated." : "Client added.");
    await refreshData();
  }

  async function saveEvent(event) {
    event.preventDefault();
    const button = $("saveEventButton");
    const payload = {
      client_id: $("eventClient").value,
      event_name: $("eventName").value.trim(),
      event_type: $("eventType").value,
      event_date: $("eventDate").value || null,
      venue: $("eventVenue").value.trim() || null,
      event_status: $("eventStatus").value,
      notes: $("eventNotes").value.trim() || null,
      created_by: state.user.id
    };
    if (!payload.client_id || !payload.event_name) return showToast("Select a client and enter an event name.");
    setButtonBusy(button,true,"Save event");
    const result = await supabase.from("events").insert({...payload,event_code:makeCode("EV")});
    setButtonBusy(button,false,"Save event");
    if (result.error) { console.error(result.error); return showToast("Unable to save event: " + result.error.message); }
    closeModal("eventModalBackdrop"); showToast("Event added.");
    await refreshData();
  }


  // ============================================================
  // WEDDING DETAILS MODULE
  // ============================================================

  async function renderWeddingDirectory() {
    const tbody = $("weddingTableBody");
    if (!tbody) return;
    const weddings = state.events.filter(e => String(e.event_type || "").toLowerCase() === "wedding");
    if (!weddings.length) {
      $("weddingCountText").textContent = "0 wedding records";
      $("weddingPaginationText").textContent = "Showing 0 weddings";
      tbody.innerHTML = emptyRow(6, "No Wedding events found. Add a Wedding event in the Events section first.");
      return;
    }
    const ids = weddings.map(e => e.id);
    const { data, error } = await supabase.from("event_wedding_details").select("event_id, bride_full_name, groom_full_name, wedding_theme, wedding_hashtag").in("event_id", ids);
    if (error) {
      console.error("Unable to load wedding directory details:", error);
      showToast("Unable to load wedding directory: " + error.message);
      return;
    }
    state.weddingDirectoryDetails = Object.fromEntries((data || []).map(d => [d.event_id, d]));
    const clientMap = new Map(state.clients.map(c => [c.id, c.client_name]));
    const venueResult = await supabase.from("event_venues").select("event_id, venue_name").in("event_id", ids);
    if (venueResult.error) console.warn("Unable to load wedding venue labels:", venueResult.error);
    const venueMap = {};
    (venueResult.data || []).forEach(v => { (venueMap[v.event_id] ||= []).push(v.venue_name); });
    const filtered = weddings.filter(e => {
      const d = state.weddingDirectoryDetails[e.id] || {};
      const haystack = [e.event_name, e.event_code, clientMap.get(e.client_id), d.bride_full_name, d.groom_full_name, d.wedding_theme, d.wedding_hashtag, ...(venueMap[e.id] || [])].join(" ").toLowerCase();
      return !state.weddingSearch || haystack.includes(state.weddingSearch);
    });
    $("weddingCountText").textContent = `${filtered.length} wedding record${filtered.length === 1 ? "" : "s"}`;
    $("weddingPaginationText").textContent = `Showing ${filtered.length} wedding${filtered.length === 1 ? "" : "s"}`;
    tbody.innerHTML = filtered.length ? filtered.map(e => {
      const d = state.weddingDirectoryDetails[e.id] || {};
      const bride = d.bride_full_name || "Bride not added";
      const groom = d.groom_full_name || "Groom not added";
      const couple = d.bride_full_name || d.groom_full_name ? `${bride} & ${groom}` : (e.event_name || "Wedding details pending");
      return `<tr class="wedding-directory-row" data-wedding-event="${escapeHtml(e.id)}" tabindex="0" role="button" aria-label="Open wedding details for ${escapeHtml(couple)}"><td><div class="client-cell"><span class="client-avatar">${escapeHtml(initials(couple))}</span><span><span class="client-name">${escapeHtml(couple)}</span><span class="client-code">${escapeHtml(e.event_code || "Wedding")}</span></span></div></td><td>${escapeHtml(e.event_name || "Wedding")}</td><td>${formatDate(e.event_date)}</td><td>${escapeHtml(d.wedding_theme || "—")}</td><td>${escapeHtml((venueMap[e.id] || []).join(", ") || "—")}</td><td>${escapeHtml(d.wedding_hashtag || "—")}</td></tr>`;
    }).join("") : emptyRow(6, "No matching wedding records found.");
  }

  async function openWeddingRecord(eventId) {
    const wedding = state.events.find(e => e.id === eventId);
    if (!wedding) return;
    state.weddingEventId = eventId;
    $("weddingRecordModalTitle").textContent = wedding.event_name || "Wedding details";
    $("weddingRecordModalSubtitle").textContent = `${formatDate(wedding.event_date)}${wedding.event_status ? " · " + wedding.event_status : ""}`;
    collapseWeddingSections();
    $("weddingRecordModalBackdrop").classList.remove("hidden");
    await loadWeddingWorkspace(eventId);
    showWeddingWorkspace();
  }

  async function loadWeddingWorkspace(eventId) {
    state.weddingEventId = eventId || "";
    if (!eventId) {
      return;
    }


    const requests = await Promise.all([
      supabase.from("event_wedding_details").select("*").eq("event_id", eventId).maybeSingle(),
      supabase.from("event_venues").select("*").eq("event_id", eventId).order("display_order"),
      supabase.from("event_color_palette").select("*").eq("event_id", eventId).order("display_order"),
      supabase.from("wedding_entourage_groups").select("*").eq("event_id", eventId).order("display_order"),
    ]);
    const labels = ["couple information", "venues", "color palette", "entourage groups"];
    const failed = requests.findIndex(r => r.error);
    if (failed >= 0) {
      console.error("Wedding details load failed:", requests[failed].error);
      showToast(`Unable to load ${labels[failed]}: ${requests[failed].error.message}`);
      return;
    }

    state.weddingDetails = requests[0].data || null;
    state.venues = requests[1].data || [];
    state.colors = requests[2].data || [];
    state.groups = requests[3].data || [];

    const groupIds = state.groups.map(g => g.id);
    if (groupIds.length) {
      const membersResult = await supabase.from("wedding_entourage_members")
        .select("*").in("group_id", groupIds).order("display_order");
      if (membersResult.error) {
        console.error(membersResult.error);
        showToast("Unable to load entourage members: " + membersResult.error.message);
        state.members = [];
      } else state.members = membersResult.data || [];
    } else state.members = [];

    fillWeddingDetailsForm();
    renderWeddingRecords();
  }

  function fillWeddingDetailsForm() {
    const d = state.weddingDetails || {};
    const fields = {
      wdBride:"bride_full_name", wdGroom:"groom_full_name",
      wdBrideParents:"bride_parents", wdGroomParents:"groom_parents",
      wdTheme:"wedding_theme", wdVerseReference:"bible_verse_reference",
      wdVerseText:"bible_verse_text", wdInvitation:"invitation_message",
      wdCoupleMessage:"couple_message", wdDressTitle:"dress_code_title",
      wdDressDescription:"dress_code_description", wdHashtag:"wedding_hashtag",
      wdNotes:"additional_notes"
    };
    Object.entries(fields).forEach(([id,key]) => { $(id).value = d[key] || ""; });
    renderCoupleSummary();
  }

  function mountWeddingForms() {
    const placements = {
      weddingDetailsFormPanel: "coupleSummary",
      venueFormPanel: "venuesList",
      colorFormPanel: "colorsList",
      groupFormPanel: "groupsList",
      memberFormPanel: "membersList"
    };
    Object.entries(placements).forEach(([panelId, targetId]) => {
      const target = $(targetId);
      const panel = $(panelId);
      const section = target?.closest(".wedding-section");
      if (section && panel) section.append(panel);
    });

    // Turn every wedding information panel into a collapsed accordion.
    document.querySelectorAll("#weddingWorkspace .wedding-section").forEach(section => {
      if (section.dataset.accordionReady === "true") return;
      const heading = section.querySelector(":scope > .panel-heading");
      if (!heading) return;
      const titleBlock = heading.querySelector(":scope > div");
      const actionButton = heading.querySelector(":scope > button");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "wedding-accordion-toggle";
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = `<span class="wedding-accordion-title"></span><span class="wedding-accordion-chevron" aria-hidden="true">⌄</span>`;
      if (titleBlock) toggle.querySelector(".wedding-accordion-title").append(titleBlock);

      const content = document.createElement("div");
      content.className = "wedding-accordion-content hidden";
      const remaining = Array.from(section.childNodes).filter(node => node !== heading);
      section.replaceChildren(toggle, content);
      if (actionButton) content.append(actionButton);
      remaining.forEach(node => content.append(node));
      section.dataset.accordionReady = "true";
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        content.classList.toggle("hidden", expanded);
        section.classList.toggle("is-open", !expanded);
      });
    });
  }

  function collapseWeddingSections() {
    document.querySelectorAll("#weddingWorkspace .wedding-section").forEach(section => {
      const toggle = section.querySelector(":scope > .wedding-accordion-toggle");
      const content = section.querySelector(":scope > .wedding-accordion-content");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      if (content) content.classList.add("hidden");
      section.classList.remove("is-open");
    });
  }

  function showWeddingWorkspace() {
    document.querySelectorAll(".wedding-inline-form").forEach(panel => {
      panel.classList.add("hidden");
      panel.classList.remove("is-expanded");
    });
    $("weddingWorkspace").classList.remove("hidden");
  }

  function showWeddingInlineForm(formId) {
    document.querySelectorAll(".wedding-inline-form").forEach(panel => {
      panel.classList.add("hidden");
      panel.classList.remove("is-expanded");
    });
    const panel = $(formId + "Panel");
    panel.classList.remove("hidden");
    panel.classList.add("is-expanded");
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const form = $(formId);
    const first = form.querySelector("input, select, textarea");
    if (first) first.focus({ preventScroll: true });
  }

  function openCoupleModal() {
    if (!state.weddingEventId) return showToast("Select a wedding event first.");
    fillWeddingDetailsForm();
    showWeddingInlineForm("weddingDetailsForm");
  }

  function openWeddingModal(formId) {
    if (!state.weddingEventId) return showToast("Select a wedding event first.");
    const form = $(formId);
    form.reset();
    if (formId === "venueForm") $("venueOrder").value = "0";
    if (formId === "colorForm") { $("colorOrder").value = "0"; $("colorRole").value = "secondary"; }
    if (formId === "groupForm") $("groupOrder").value = "0";
    if (formId === "memberForm") { $("memberOrder").value = "0"; }
    renderWeddingRecords();
    showWeddingInlineForm(formId);
  }

  function renderCoupleSummary() {
    const d = state.weddingDetails || {};
    const rows = [
      ["Bride", d.bride_full_name], ["Groom", d.groom_full_name],
      ["Bride's parents", d.bride_parents], ["Groom's parents", d.groom_parents],
      ["Wedding theme", d.wedding_theme], ["Bible verse", d.bible_verse_reference],
      ["Wedding hashtag", d.wedding_hashtag], ["Dress code", d.dress_code_title]
    ].filter(row => row[1]);
    const extra = [d.bible_verse_text, d.invitation_message, d.couple_message, d.dress_code_description, d.additional_notes].filter(Boolean);
    $("coupleSummary").innerHTML = rows.length || extra.length ? `
      <div class="couple-summary-grid">${rows.map(([label,value]) => `<div class="summary-item"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
      ${extra.map(value => `<p class="summary-note">${escapeHtml(value)}</p>`).join("")}` : '<p class="wedding-hint">No couple information saved yet. Click “Add information” to get started.</p>';
    $("editCoupleButton").innerHTML = d.event_id ? "Edit information" : "＋ Add information";
  }

  async function saveWeddingDetails(event) {
    event.preventDefault();
    if (!state.weddingEventId) return showToast("Select a wedding event first.");
    const button = $("saveWeddingDetailsButton");
    const payload = {
      event_id: state.weddingEventId,
      bride_full_name: $("wdBride").value.trim() || null,
      groom_full_name: $("wdGroom").value.trim() || null,
      bride_parents: $("wdBrideParents").value.trim() || null,
      groom_parents: $("wdGroomParents").value.trim() || null,
      wedding_theme: $("wdTheme").value.trim() || null,
      bible_verse_reference: $("wdVerseReference").value.trim() || null,
      bible_verse_text: $("wdVerseText").value.trim() || null,
      invitation_message: $("wdInvitation").value.trim() || null,
      couple_message: $("wdCoupleMessage").value.trim() || null,
      dress_code_title: $("wdDressTitle").value.trim() || null,
      dress_code_description: $("wdDressDescription").value.trim() || null,
      wedding_hashtag: $("wdHashtag").value.trim() || null,
      additional_notes: $("wdNotes").value.trim() || null
    };
    setButtonBusy(button, true, "Save couple information");
    const { data, error } = await supabase.from("event_wedding_details")
      .upsert(payload, { onConflict: "event_id" }).select().single();
    setButtonBusy(button, false, "Save couple information");
    if (error) {
      console.error(error);
      return showToast("Unable to save couple information: " + error.message);
    }
    state.weddingDetails = data;
    showWeddingWorkspace();
    fillWeddingDetailsForm();
    showToast("Couple information saved.");
    await renderWeddingDirectory();
  }

  async function saveVenue(event) {
    event.preventDefault();
    if (!state.weddingEventId) return showToast("Select a wedding event first.");
    const payload = {
      event_id: state.weddingEventId, venue_type: $("venueType").value,
      venue_name: $("venueName").value.trim(), venue_address: $("venueAddress").value.trim() || null,
      start_time: $("venueStart").value || null, end_time: $("venueEnd").value || null,
      map_url: $("venueMap").value.trim() || null, contact_person: $("venueContactPerson").value.trim() || null,
      contact_number: $("venueContactNumber").value.trim() || null, notes: $("venueNotes").value.trim() || null,
      display_order: Number($("venueOrder").value) || 0
    };
    const { error } = await supabase.from("event_venues").insert(payload);
    if (error) return showToast("Unable to add venue: " + error.message);
    showWeddingWorkspace(); $("venueForm").reset(); $("venueOrder").value = "0";
    showToast("Venue added."); await loadWeddingWorkspace(state.weddingEventId); await renderWeddingDirectory();
  }

  async function saveColor(event) {
    event.preventDefault();
    if (!state.weddingEventId) return showToast("Select a wedding event first.");
    const payload = {
      event_id: state.weddingEventId, color_name: $("colorName").value.trim(),
      color_role: $("colorRole").value, hex_code: $("colorHex").value.trim().toUpperCase(),
      display_order: Number($("colorOrder").value) || 0
    };
    const { error } = await supabase.from("event_color_palette").insert(payload);
    if (error) return showToast("Unable to add color: " + error.message);
    showWeddingWorkspace(); $("colorForm").reset(); $("colorOrder").value = "0"; $("colorRole").value = "secondary";
    showToast("Color added."); await loadWeddingWorkspace(state.weddingEventId); await renderWeddingDirectory();
  }

  async function saveGroup(event) {
    event.preventDefault();
    if (!state.weddingEventId) return showToast("Select a wedding event first.");
    const payload = {
      event_id: state.weddingEventId, group_name: $("groupName").value.trim(),
      group_type: $("groupType").value, display_order: Number($("groupOrder").value) || 0,
      notes: $("groupNotes").value.trim() || null
    };
    const { error } = await supabase.from("wedding_entourage_groups").insert(payload);
    if (error) return showToast("Unable to add group: " + error.message);
    showWeddingWorkspace(); $("groupForm").reset(); $("groupOrder").value = "0";
    showToast("Entourage group added."); await loadWeddingWorkspace(state.weddingEventId); await renderWeddingDirectory();
  }

  async function saveMember(event) {
    event.preventDefault();
    const groupId = $("memberGroup").value;
    if (!groupId) return showToast("Select an entourage group first.");
    const payload = {
      group_id: groupId, member_name: $("memberName").value.trim(),
      role_title: $("memberRole").value.trim() || null, partner_name: $("memberPartner").value.trim() || null,
      display_order: Number($("memberOrder").value) || 0, notes: $("memberNotes").value.trim() || null
    };
    const { error } = await supabase.from("wedding_entourage_members").insert(payload);
    if (error) return showToast("Unable to add member: " + error.message);
    showWeddingWorkspace(); $("memberForm").reset(); $("memberOrder").value = "0";
    showToast("Entourage member added."); await loadWeddingWorkspace(state.weddingEventId); await renderWeddingDirectory();
  }

  function renderWeddingRecords() {
    const canDelete = ["owner", "admin"].includes(state.profile?.userlevel);
    const removeButton = (table, id) => canDelete
      ? `<button type="button" class="row-action wedding-delete" data-table="${table}" data-id="${escapeHtml(id)}">Delete</button>` : "";
    $("venuesList").innerHTML = state.venues.length ? state.venues.map(v => `
      <div class="wedding-record"><div><strong>${escapeHtml(v.venue_name)}</strong><small>${escapeHtml(v.venue_type)}${v.start_time ? " · " + escapeHtml(v.start_time.slice(0,5)) : ""}${v.end_time ? "–" + escapeHtml(v.end_time.slice(0,5)) : ""}</small><p>${escapeHtml(v.venue_address || "")}</p></div>${removeButton("event_venues",v.id)}</div>`).join("") : '<p class="wedding-hint">No venues added yet.</p>';

    $("colorsList").innerHTML = state.colors.length ? state.colors.map(c => `
      <div class="wedding-record"><div class="color-record-swatch" style="background:${escapeHtml(c.hex_code)}"></div><div class="wedding-color-copy"><strong>${escapeHtml(c.color_name)}</strong><small>${escapeHtml(c.color_role)} · ${escapeHtml(c.hex_code)}</small></div>${removeButton("event_color_palette",c.id)}</div>`).join("") : '<p class="wedding-hint">No colors added yet.</p>';

    $("groupsList").innerHTML = state.groups.length ? state.groups.map(g => `
      <div class="wedding-record"><div><strong>${escapeHtml(g.group_name)}</strong><small>${escapeHtml(g.group_type.replaceAll("_"," "))} · ${state.members.filter(m => m.group_id === g.id).length} member(s)</small></div>${removeButton("wedding_entourage_groups",g.id)}</div>`).join("") : '<p class="wedding-hint">No entourage groups added yet.</p>';

    $("memberGroup").innerHTML = '<option value="">Select a group</option>' + state.groups.map(g =>
      `<option value="${escapeHtml(g.id)}">${escapeHtml(g.group_name)}</option>`).join("");
    $("membersList").innerHTML = state.members.length ? state.members.map(m => {
      const group = state.groups.find(g => g.id === m.group_id);
      return `<div class="wedding-record"><div><strong>${escapeHtml(m.member_name)}</strong><small>${escapeHtml(group?.group_name || "Group unavailable")}${m.role_title ? " · " + escapeHtml(m.role_title) : ""}</small>${m.partner_name ? `<p>Partner: ${escapeHtml(m.partner_name)}</p>` : ""}</div>${removeButton("wedding_entourage_members",m.id)}</div>`;
    }).join("") : '<p class="wedding-hint">No entourage members added yet.</p>';
  }

  async function handleWeddingDelete(event) {
    const button = event.target.closest(".wedding-delete");
    if (!button) return;
    if (!["owner", "admin"].includes(state.profile?.userlevel)) return showToast("Only an owner or admin can delete wedding records.");
    if (!window.confirm("Delete this record? This action cannot be undone.")) return;
    const table = button.dataset.table;
    const { error } = await supabase.from(table).delete().eq("id", button.dataset.id);
    if (error) return showToast("Unable to delete record: " + error.message);
    showToast("Record deleted."); await loadWeddingWorkspace(state.weddingEventId); await renderWeddingDirectory();
  }

  function makeCode(prefix) {
    const stamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2,6).toUpperCase();
    return `${prefix}-${stamp}-${random}`;
  }

  initialize().catch(error => {
    console.error("Dashboard initialization failed:", error);
    showToast("Dashboard could not be initialized. Check the browser console.");
  });
})();
