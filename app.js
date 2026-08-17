var SUPABASE_URL = "https://saqibtqcevgqhgnxxkoa.supabase.co"; 
var SUPABASE_KEY = "sb_publishable_TrJkvIfm8B8nv3FgrZ2rSQ_VLa7KokC"; 

var supabaseClient = null;
var currentUser = null;
var currentProfile = null;
var authMode = "login";
var state = { posts: [], events: [], partners: [], polls: [], notifications: [], announcements: [] };

if (SUPABASE_URL && SUPABASE_KEY && window.supabase && typeof window.supabase.createClient === "function") {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

document.addEventListener("DOMContentLoaded", function () {
  bindUI();
  initAnimations();
 if (supabaseClient) startApp();
  else showSetupMessage();
});

function showSetupMessage() {
  document.getElementById("authScreen").classList.remove("hidden");
  toast("Supabase connection could not be started. Check the CDN and project keys.");
}

async function startApp() {
  var result = await supabaseClient.auth.getSession();
  if (result.data.session) {
    currentUser = result.data.session.user;
    await loadProfile();
    showApp();
  }
  supabaseClient.auth.onAuthStateChange(async function (_event, session) {
    if (session) {
      currentUser = session.user;
      await loadProfile();
      showApp();
    } else {
      currentUser = null;
      currentProfile = null;
      document.getElementById("app").classList.add("hidden");
      document.getElementById("authScreen").classList.remove("hidden");
    }
  });
}

function bindUI() {
  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      authMode = btn.dataset.auth;
      document.getElementById("nameField").classList.toggle("hidden", authMode !== "signup");
      document.getElementById("authSubmit").textContent = authMode === "signup" ? "Create account" : "Login";
    });
  });

  document.getElementById("authForm").addEventListener("submit", handleAuth);
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("themeBtn").addEventListener("click", function () {
    document.body.classList.toggle("dark");
    localStorage.setItem("cc-theme", document.body.classList.contains("dark") ? "dark" : "light");
  });
  if (localStorage.getItem("cc-theme") === "dark") document.body.classList.add("dark");

  document.querySelectorAll("[data-page]").forEach(function (el) {
    el.addEventListener("click", function () { goTo(el.dataset.page); });
  });
  document.querySelectorAll("[data-modal]").forEach(function (el) {
    el.addEventListener("click", function () { openModal(el.dataset.modal); });
  });
  document.querySelectorAll(".modal-close").forEach(function (el) {
    el.addEventListener("click", function () { el.closest(".modal-wrap").classList.remove("open"); });
  });
  document.querySelectorAll(".modal-wrap").forEach(function (el) {
    el.addEventListener("click", function (e) { if (e.target === el) el.classList.remove("open"); });
  });

  document.getElementById("postForm").addEventListener("submit", createPost);
  document.getElementById("eventForm").addEventListener("submit", createEvent);
  document.getElementById("partnerForm").addEventListener("submit", createPartner);
  document.getElementById("pollForm").addEventListener("submit", createPoll);
  document.getElementById("profileForm").addEventListener("submit", updateProfile);
  document.getElementById("postSearch").addEventListener("input", loadPosts);
  document.getElementById("eventSearch").addEventListener("input", loadEvents);
  document.getElementById("eventFilter").addEventListener("change", loadEvents);
  document.getElementById("partnerFilterBtn").addEventListener("click", loadPartners);
  document.getElementById("readAllBtn").addEventListener("click", markAllRead);
  document.getElementById("mobileMenu").addEventListener("click", function () { document.querySelector(".sidebar").classList.toggle("open"); });
  document.getElementById("globalSearch").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { goTo("posts"); document.getElementById("postSearch").value = e.target.value; loadPosts(); }
  });
  document.querySelectorAll("[data-admin-tab]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("[data-admin-tab]").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      loadAdminTab(b.dataset.adminTab);
    });
  });
}

async function handleAuth(e) {
  e.preventDefault();
  if (!supabaseClient) return showSetupMessage();
  var email = document.getElementById("authEmail").value.trim();
  var password = document.getElementById("authPassword").value;
  var name = document.getElementById("authName").value.trim();

  if (authMode === "signup") {
    var sign = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: { data: { full_name: name } }
    });
    if (sign.error) return toast(sign.error.message);
    toast("Account created. Check your email if confirmation is enabled.");
  } else {
    var login = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
    if (login.error) return toast(login.error.message);
  }
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
}

async function loadProfile() {
  var res = await supabaseClient.from("profiles").select("*").eq("id", currentUser.id).single();
  if (res.data) currentProfile = res.data;
  else {
    var name = currentUser.user_metadata && currentUser.user_metadata.full_name ? currentUser.user_metadata.full_name : "Student";
    var insert = await supabaseClient.from("profiles").insert({ id: currentUser.id, full_name: name }).select().single();
    currentProfile = insert.data || { full_name: name, role: "user" };
  }
}

async function showApp() {
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  var name = currentProfile && currentProfile.full_name ? currentProfile.full_name : "Student";
  document.getElementById("welcomeName").textContent = name.split(" ")[0];
  document.getElementById("topUser").innerHTML = '<span>' + esc(name) + '</span><span class="avatar">' + initials(name) + '</span>';
  if (currentProfile.role === "admin") document.querySelector(".admin-link").classList.remove("hidden");
  await Promise.all([loadPosts(), loadEvents(), loadPartners(), loadPolls(), loadNotifications(), loadAnnouncements()]);
  updateStats();
  gsap.from(".page.active > *", { y: 20, opacity: 0, duration: .55, stagger: .06, ease: "power2.out" });
}

function goTo(page) {
  document.querySelectorAll(".page").forEach(function (p) { p.classList.remove("active"); });
  document.getElementById(page + "Page").classList.add("active");
  document.querySelectorAll(".nav-item[data-page]").forEach(function (n) { n.classList.toggle("active", n.dataset.page === page); });
  document.querySelector(".sidebar").classList.remove("open");
  if (page === "admin") { loadAdminStats(); loadAdminTab("users"); }
  gsap.from("#" + page + "Page > *", { y: 18, opacity: 0, duration: .4, stagger: .05 });
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
  gsap.from("#" + id + " .modal", { scale: .92, opacity: 0, duration: .25, ease: "back.out(1.5)" });
}

async function loadPosts() {
  var query = document.getElementById("postSearch") ? document.getElementById("postSearch").value.trim() : "";
  var q = supabaseClient.from("posts").select("*, profiles(full_name,avatar_url), comments(id,body,created_at,profiles(full_name))").order("created_at", { ascending: false });
  if (query) q = q.or("title.ilike.%" + query + "%,description.ilike.%" + query + "%");
  var res = await q;
  state.posts = res.data || [];
  renderPosts();
}

function renderPosts() {
  var html = state.posts.map(function (p) {
    var img = p.image_url ? '<img class="post-image" src="' + esc(p.image_url) + '">' : '<div class="post-image"></div>';
    var mine = currentUser && p.user_id === currentUser.id;
    var comments = (p.comments || []).slice(0, 3).map(function (c) { return '<div class="comment"><b>' + esc(c.profiles ? c.profiles.full_name : "Student") + '</b> ' + esc(c.body) + '</div>'; }).join("");
    return '<article class="post-card"><div>' + img + '</div><div class="post-body"><div class="post-meta"><span class="avatar">' + initials(p.profiles ? p.profiles.full_name : "Student") + '</span>' + esc(p.profiles ? p.profiles.full_name : "Student") + ' · ' + timeAgo(p.created_at) + '</div><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p><div class="post-actions"><button class="small-btn like-btn" data-id="' + p.id + '">♡ ' + (p.like_count || 0) + '</button><button class="small-btn comment-toggle" data-id="' + p.id + '">Comment</button>' + (mine ? '<button class="small-btn delete-post" data-id="' + p.id + '">Delete</button>' : '') + '</div><div class="comments">' + comments + '</div><div class="comment-box"><input id="comment-' + p.id + '" placeholder="Write a comment..."><button class="small-btn add-comment" data-id="' + p.id + '">Send</button></div></div></article>';
  }).join("");
  document.getElementById("postsList").innerHTML = html || '<div class="empty">No posts found. Be the first to share something.</div>';
  document.getElementById("dashboardPosts").innerHTML = state.posts.slice(0, 3).map(postMini).join("") || '<div class="empty">No posts yet.</div>';
  document.querySelectorAll(".like-btn").forEach(function (b) { b.onclick = function () { likePost(b.dataset.id); }; });
  document.querySelectorAll(".delete-post").forEach(function (b) { b.onclick = function () { deletePost(b.dataset.id); }; });
  document.querySelectorAll(".add-comment").forEach(function (b) { b.onclick = function () { addComment(b.dataset.id); }; });
}

function postMini(p) {
  return '<article class="post-card"><div class="post-body"><div class="post-meta">' + initials(p.profiles ? p.profiles.full_name : "Student") + ' · ' + timeAgo(p.created_at) + '</div><h3>' + esc(p.title) + '</h3><p>' + esc(p.description).slice(0,110) + '...</p></div></article>';
}

async function createPost(e) {
  e.preventDefault();
  var title = document.getElementById("postTitle").value.trim(), desc = document.getElementById("postDesc").value.trim();
  var imageUrl = await uploadFile(document.getElementById("postImage").files[0], "posts");
  var res = await supabaseClient.from("posts").insert({ user_id: currentUser.id, title: title, description: desc, image_url: imageUrl }).select().single();
  if (res.error) return toast(res.error.message);
  closeAllModals(); e.target.reset(); toast("Post published.");
  await loadPosts(); updateStats();
}

async function deletePost(id) {
  if (!confirm("Delete this post?")) return;
  var res = await supabaseClient.from("posts").delete().eq("id", id);
  if (res.error) return toast(res.error.message);
  toast("Post deleted."); await loadPosts(); updateStats();
}

async function likePost(postId) {
  var existing = await supabaseClient.from("likes").select("id").eq("post_id", postId).eq("user_id", currentUser.id).maybeSingle();
  if (existing.data) await supabaseClient.from("likes").delete().eq("id", existing.data.id);
  else {
    await supabaseClient.from("likes").insert({ post_id: postId, user_id: currentUser.id });
    var post = state.posts.find(function (x) { return x.id === postId; });
    if (post && post.user_id !== currentUser.id) notify(post.user_id, (currentProfile.full_name || "Someone") + " liked your post.");
  }
  await loadPosts();
}

async function addComment(postId) {
  var input = document.getElementById("comment-" + postId), body = input.value.trim();
  if (!body) return;
  var post = state.posts.find(function (x) { return x.id === postId; });
  var res = await supabaseClient.from("comments").insert({ post_id: postId, user_id: currentUser.id, body: body });
  if (res.error) return toast(res.error.message);
  if (post && post.user_id !== currentUser.id) notify(post.user_id, (currentProfile.full_name || "Someone") + " commented on your post.");
  input.value = ""; await loadPosts();
}

async function loadEvents() {
  var search = document.getElementById("eventSearch") ? document.getElementById("eventSearch").value.trim() : "";
  var filter = document.getElementById("eventFilter") ? document.getElementById("eventFilter").value : "all";
  var q = supabaseClient.from("events").select("*, profiles(full_name), event_registrations(id,user_id)").order("event_date", { ascending: true });
  if (search) q = q.or("title.ilike.%" + search + "%,description.ilike.%" + search + "%,location.ilike.%" + search + "%");
  if (filter === "approved") q = q.eq("status", "approved");
  if (filter === "mine") q = q.eq("user_id", currentUser.id);
  var res = await q; state.events = res.data || []; renderEvents();
}

function renderEvents() {
  document.getElementById("eventsList").innerHTML = state.events.map(function (e) {
    var joined = (e.event_registrations || []).some(function (r) { return r.user_id === currentUser.id; });
    return '<article class="event-card"><div class="event-date">' + formatDate(e.event_date) + ' · ' + esc(e.event_time || "") + '</div><h3>' + esc(e.title) + '</h3><p>' + esc(e.description) + '</p><div class="event-info">⌖ ' + esc(e.location) + '</div><div class="event-info">♟ ' + (e.event_registrations || []).length + ' registered</div><small class="eyebrow">' + esc(e.status || "pending") + '</small><button class="btn ' + (joined ? "dark" : "primary") + ' event-join" data-id="' + e.id + '">' + (joined ? "Cancel registration" : "Join event") + '</button></article>';
  }).join("") || '<div class="empty">No events match your search.</div>';
  document.querySelectorAll(".event-join").forEach(function (b) { b.onclick = function () { toggleEvent(b.dataset.id); }; });
}

async function createEvent(e) {
  e.preventDefault();
  var imageUrl = await uploadFile(document.getElementById("eventImage").files[0], "events");
  var res = await supabaseClient.from("events").insert({ user_id: currentUser.id, title: document.getElementById("eventTitle").value.trim(), description: document.getElementById("eventDesc").value.trim(), event_date: document.getElementById("eventDate").value, event_time: document.getElementById("eventTime").value, location: document.getElementById("eventLocation").value.trim(), image_url: imageUrl, status: currentProfile.role === "admin" ? "approved" : "pending" });
  if (res.error) return toast(res.error.message);
  closeAllModals(); e.target.reset(); toast("Event submitted."); await loadEvents(); updateStats();
}

async function toggleEvent(eventId) {
  var existing = await supabaseClient.from("event_registrations").select("id").eq("event_id", eventId).eq("user_id", currentUser.id).maybeSingle();
  if (existing.data) await supabaseClient.from("event_registrations").delete().eq("id", existing.data.id);
  else {
    await supabaseClient.from("event_registrations").insert({ event_id: eventId, user_id: currentUser.id });
    var event = state.events.find(function (x) { return x.id === eventId; });
    if (event && event.user_id !== currentUser.id) notify(event.user_id, (currentProfile.full_name || "Someone") + " joined your event.");
  }
  await loadEvents();
}

async function loadPartners() {
  var subject = document.getElementById("partnerSubject") ? document.getElementById("partnerSubject").value.trim() : "";
  var skill = document.getElementById("partnerSkill") ? document.getElementById("partnerSkill").value.trim() : "";
  var level = document.getElementById("partnerLevel") ? document.getElementById("partnerLevel").value : "";
  var q = supabaseClient.from("study_partners").select("*, profiles(full_name,avatar_url)").order("created_at", { ascending: false });
  if (subject) q = q.ilike("subjects", "%" + subject + "%");
  if (skill) q = q.ilike("skills", "%" + skill + "%");
  if (level) q = q.eq("experience_level", level);
  var res = await q; state.partners = res.data || []; renderPartners();
}

function renderPartners() {
  document.getElementById("partnersList").innerHTML = state.partners.map(function (p) {
    return '<article class="partner-card"><div class="partner-top"><span class="avatar">' + initials(p.name || (p.profiles && p.profiles.full_name) || "S") + '</span><div><h3>' + esc(p.name) + '</h3><small>' + esc(p.experience_level) + '</small></div></div><div class="tags">' + (p.subjects || "").split(",").map(function (x) { return '<span class="tag">' + esc(x.trim()) + '</span>'; }).join("") + '</div><p>' + esc(p.introduction) + '</p><small>Available: ' + esc(p.availability) + '</small></article>';
  }).join("") || '<div class="empty">No study partners found.</div>';
}

async function createPartner(e) {
  e.preventDefault();
  var data = { user_id: currentUser.id, name: document.getElementById("partnerName").value.trim(), subjects: document.getElementById("partnerSubjects").value.trim(), skills: document.getElementById("partnerSkills").value.trim(), experience_level: document.getElementById("partnerExperience").value, availability: document.getElementById("partnerAvailability").value.trim(), introduction: document.getElementById("partnerIntro").value.trim() };
  var res = await supabaseClient.from("study_partners").upsert(data, { onConflict: "user_id" });
  if (res.error) return toast(res.error.message);
  closeAllModals(); e.target.reset(); toast("Study profile saved."); await loadPartners(); updateStats();
}

async function loadPolls() {
  var res = await supabaseClient.from("polls").select("*, profiles(full_name), poll_options(*,poll_votes(user_id))").order("created_at", { ascending: false });
  state.polls = res.data || []; renderPolls();
}

function renderPolls() {
  document.getElementById("pollsList").innerHTML = state.polls.map(function (p) {
    var total = 0; (p.poll_options || []).forEach(function (o) { total += (o.poll_votes || []).length; });
    var options = (p.poll_options || []).map(function (o) {
      var votes = (o.poll_votes || []).length, pct = total ? Math.round(votes / total * 100) : 0;
      var voted = (o.poll_votes || []).some(function (v) { return v.user_id === currentUser.id; });
      return '<button class="poll-option-btn vote-btn" data-id="' + o.id + '" ' + (voted ? "disabled" : "") + '><div class="bar" style="--w:' + pct + '%"></div><span><b>' + esc(o.option_text) + '</b><small>' + pct + '%</small></span></button>';
    }).join("");
    return '<article class="poll-card"><div class="eyebrow">POLL · ' + total + ' votes</div><h3>' + esc(p.question) + '</h3>' + options + '</article>';
  }).join("") || '<div class="empty">No polls yet.</div>';
  document.querySelectorAll(".vote-btn").forEach(function (b) { b.onclick = function () { vote(b.dataset.id); }; });
}

async function createPoll(e) {
  e.preventDefault();
  var options = Array.from(document.querySelectorAll(".poll-option")).map(function (x) { return x.value.trim(); }).filter(Boolean);
  if (options.length < 2) return toast("Add at least two options.");
  var p = await supabaseClient.from("polls").insert({ user_id: currentUser.id, question: document.getElementById("pollQuestion").value.trim() }).select().single();
  if (p.error) return toast(p.error.message);
  var rows = options.map(function (x, i) { return { poll_id: p.data.id, option_text: x, position: i }; });
  var o = await supabaseClient.from("poll_options").insert(rows);
  if (o.error) return toast(o.error.message);
  closeAllModals(); e.target.reset(); toast("Poll published."); await loadPolls();
}

async function vote(optionId) {
  var res = await supabaseClient.from("poll_votes").insert({ option_id: optionId, user_id: currentUser.id });
  if (res.error) return toast(res.error.message.includes("duplicate") ? "You already voted in this poll." : res.error.message);
  await loadPolls();
}

async function loadNotifications() {
  var res = await supabaseClient.from("notifications").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(50);
  state.notifications = res.data || [];
  document.getElementById("notificationsList").innerHTML = state.notifications.map(function (n) {
    return '<div class="notification ' + (!n.is_read ? "unread" : "") + '"><span class="avatar">!</span><div><p>' + esc(n.message) + '</p><small>' + timeAgo(n.created_at) + '</small></div></div>';
  }).join("") || '<div class="empty">You are all caught up.</div>';
  updateStats();
}

async function notify(userId, message) {
  await supabaseClient.from("notifications").insert({ user_id: userId, message: message, type: "activity" });
}

async function markAllRead() {
  await supabaseClient.from("notifications").update({ is_read: true }).eq("user_id", currentUser.id);
  await loadNotifications();
}

async function loadAnnouncements() {
  var res = await supabaseClient.from("announcements").select("*, profiles(full_name)").order("created_at", { ascending: false }).limit(5);
  state.announcements = res.data || [];
  document.getElementById("announcementList").innerHTML = state.announcements.map(function (a) {
    return '<div class="announcement"><b>' + esc(a.title) + '</b><small>' + esc(a.body) + '</small></div>';
  }).join("") || '<div class="empty">No announcements yet.</div>';
}

async function updateStats() {
  if (!supabaseClient || !currentUser) return;
  var counts = await Promise.all([
    supabaseClient.from("posts").select("*", { count: "exact", head: true }),
    supabaseClient.from("events").select("*", { count: "exact", head: true }).gte("event_date", new Date().toISOString().slice(0,10)),
    supabaseClient.from("study_partners").select("*", { count: "exact", head: true }),
    supabaseClient.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", currentUser.id).eq("is_read", false)
  ]);
  document.getElementById("statPosts").textContent = counts[0].count || 0;
  document.getElementById("statEvents").textContent = counts[1].count || 0;
  document.getElementById("statPartners").textContent = counts[2].count || 0;
  document.getElementById("statNotifs").textContent = counts[3].count || 0;
  document.getElementById("notifCount").textContent = counts[3].count ? counts[3].count : "";
}

async function loadAdminStats() {
  if (!currentProfile || currentProfile.role !== "admin") return;
  var q = await Promise.all([
    supabaseClient.from("profiles").select("*", { count: "exact", head: true }),
    supabaseClient.from("posts").select("*", { count: "exact", head: true }),
    supabaseClient.from("events").select("*", { count: "exact", head: true }),
    supabaseClient.from("reports").select("*", { count: "exact", head: true })
  ]);
  document.getElementById("adminUsers").textContent = q[0].count || 0;
  document.getElementById("adminPosts").textContent = q[1].count || 0;
  document.getElementById("adminEvents").textContent = q[2].count || 0;
  document.getElementById("adminReports").textContent = q[3].count || 0;
}

async function loadAdminTab(tab) {
  if (!currentProfile || currentProfile.role !== "admin") return;
  var box = document.getElementById("adminContent");
  if (tab === "users") {
    var r = await supabaseClient.from("profiles").select("*").order("created_at", { ascending: false });
    box.innerHTML = (r.data || []).map(function (u) { return '<div class="admin-row"><span class="avatar">' + initials(u.full_name) + '</span><div><b>' + esc(u.full_name) + '</b><small>' + esc(u.email || "") + ' · ' + esc(u.role) + '</small></div><button class="small-btn block-user" data-id="' + u.id + '" data-block="' + (!u.is_blocked) + '">' + (u.is_blocked ? "Unblock" : "Block") + '</button></div>'; }).join("") || '<div class="empty">No users.</div>';
    document.querySelectorAll(".block-user").forEach(function (b) { b.onclick = function () { toggleBlock(b.dataset.id, b.dataset.block === "true"); }; });
  } else if (tab === "posts") {
    var p = await supabaseClient.from("posts").select("*,profiles(full_name)").order("created_at", { ascending: false });
    box.innerHTML = (p.data || []).map(function (x) { return '<div class="admin-row"><div><b>' + esc(x.title) + '</b><small>by ' + esc(x.profiles ? x.profiles.full_name : "") + '</small></div><button class="small-btn admin-delete-post" data-id="' + x.id + '">Delete</button></div>'; }).join("") || '<div class="empty">No posts.</div>';
    document.querySelectorAll(".admin-delete-post").forEach(function (b) { b.onclick = async function () { await supabaseClient.from("posts").delete().eq("id", b.dataset.id); toast("Post removed."); loadAdminTab("posts"); loadPosts(); loadAdminStats(); }; });
  } else if (tab === "events") {
    var ev = await supabaseClient.from("events").select("*,profiles(full_name)").order("event_date", { ascending: true });
    box.innerHTML = (ev.data || []).map(function (x) { return '<div class="admin-row"><div><b>' + esc(x.title) + '</b><small>' + esc(x.status) + ' · ' + esc(x.event_date) + '</small></div><button class="small-btn approve-event" data-id="' + x.id + '" data-status="' + (x.status === "approved" ? "rejected" : "approved") + '">' + (x.status === "approved" ? "Reject" : "Approve") + '</button><button class="small-btn admin-delete-event" data-id="' + x.id + '">Delete</button></div>'; }).join("") || '<div class="empty">No events.</div>';
    document.querySelectorAll(".approve-event").forEach(function (b) { b.onclick = async function () { await supabaseClient.from("events").update({ status: b.dataset.status }).eq("id", b.dataset.id); toast("Event updated."); loadAdminTab("events"); loadEvents(); }; });
    document.querySelectorAll(".admin-delete-event").forEach(function (b) { b.onclick = async function () { await supabaseClient.from("events").delete().eq("id", b.dataset.id); toast("Event deleted."); loadAdminTab("events"); loadEvents(); }; });
  } else {
    box.innerHTML = '<form id="announcementForm" class="form-row" style="grid-template-columns:1fr"><input id="annTitle" placeholder="Announcement title" required><textarea id="annBody" placeholder="Announcement text" required></textarea><button class="btn primary">Publish announcement</button></form>';
    document.getElementById("announcementForm").onsubmit = async function (e) {
      e.preventDefault();
      var r = await supabaseClient.from("announcements").insert({ admin_id: currentUser.id, title: document.getElementById("annTitle").value, body: document.getElementById("annBody").value });
      if (r.error) return toast(r.error.message);
      toast("Announcement published.");
      await loadAnnouncements();
      e.target.reset();
    };
  }
}

async function toggleBlock(id, value) {
  if (id === currentUser.id) return toast("You cannot block yourself.");
  var r = await supabaseClient.from("profiles").update({ is_blocked: value }).eq("id", id);
  if (r.error) return toast(r.error.message);
  toast(value ? "User blocked." : "User unblocked."); loadAdminTab("users");
}

async function updateProfile(e) {
  e.preventDefault();
  var avatarUrl = await uploadFile(document.getElementById("profileImage").files[0], "profiles");
  var data = { full_name: document.getElementById("profileName").value.trim(), course: document.getElementById("profileCourse").value.trim(), bio: document.getElementById("profileBio").value.trim() };
  if (avatarUrl) data.avatar_url = avatarUrl;
  var r = await supabaseClient.from("profiles").update(data).eq("id", currentUser.id);
  if (r.error) return toast(r.error.message);
  await loadProfile(); closeAllModals(); showApp(); toast("Profile updated.");
}

async function uploadFile(file, folder) {
  if (!file) return null;
  var safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  var path = folder + "/" + currentUser.id + "-" + Date.now() + "-" + safe;
  var r = await supabaseClient.storage.from("campus-images").upload(path, file, { upsert: false });
  if (r.error) { toast(r.error.message); return null; }
  return supabaseClient.storage.from("campus-images").getPublicUrl(path).data.publicUrl;
}

function closeAllModals() { document.querySelectorAll(".modal-wrap").forEach(function (m) { m.classList.remove("open"); }); }
function toast(message) { var t = document.getElementById("toast"); t.textContent = message; t.classList.add("show"); setTimeout(function(){ t.classList.remove("show"); }, 2800); }
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]; }); }
function initials(name) { return String(name || "S").split(" ").map(function(x){return x[0] || "";}).slice(0,2).join("").toUpperCase(); }
function timeAgo(date) { var sec = Math.floor((Date.now() - new Date(date).getTime()) / 1000); if(sec<60)return"just now"; if(sec<3600)return Math.floor(sec/60)+"m ago"; if(sec<86400)return Math.floor(sec/3600)+"h ago"; return Math.floor(sec/86400)+"d ago"; }
function formatDate(d) { return new Date(d + "T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }

function initAnimations() {
  gsap.registerPlugin(ScrollTrigger);
  gsap.from(".auth-card", { x: 60, opacity: 0, duration: .8, ease: "power3.out" });
  gsap.from(".auth-copy > *", { y: 25, opacity: 0, duration: .7, stagger: .12, ease: "power2.out" });
  gsap.utils.toArray(".stat-card").forEach(function(card){ card.addEventListener("mouseenter",function(){gsap.to(card,{y:-5,duration:.2})}); card.addEventListener("mouseleave",function(){gsap.to(card,{y:0,duration:.2})}); });
  gsap.utils.toArray(".panel").forEach(function(panel){ gsap.from(panel,{scrollTrigger:{trigger:panel,start:"top 90%"},y:25,opacity:0,duration:.5}); });
}
