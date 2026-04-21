// Configuration
const STUDENT_ID = "M01036102"; // Match server configuration
const BASE_URL = `http://localhost:8080/${STUDENT_ID}`; // Base URL for all API requests

// Map sections to pretty paths for the address bar
const sectionPaths = {
  "auth-section": `/${STUDENT_ID}/auth`,
  "post-section": `/${STUDENT_ID}/post`,
  "feed-section": `/${STUDENT_ID}/feed`,
  "search-section": `/${STUDENT_ID}/search`,
  "profile-section": `/${STUDENT_ID}/profile`,
  "map-section": `/${STUDENT_ID}/map`,
  "inspo-section": `/${STUDENT_ID}/inspiration`,
};

const pathToSection = Object.fromEntries(
  Object.entries(sectionPaths).map(([section, path]) => [path, section])
);

const loginRequiredSections = new Set([
  "post-section",
  "feed-section",
  "search-section",
  "profile-section",
  "map-section",
  "inspo-section",
]);

// Display messages to users (errors, success, info)
// id: element ID, text: message content, type: "error" or "success"
function setMessage(id, text, type = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove("error", "success");
  if (type) el.classList.add(type);
}

// Switch between page sections (navigation)
// sectionId: the ID of the section to show
function switchSection(sectionId) {
  // Hide all sections
  document.querySelectorAll(".page-section").forEach(sec => {
    sec.classList.add("hidden");
  });
  // Show the selected section
  const active = document.getElementById(sectionId);
  if (active) active.classList.remove("hidden");
}

// Navigate to a section and sync the address bar using History API
async function navigateToSection(sectionId, { replace = false } = {}) {
  // Gate sections that require login
  if (loginRequiredSections.has(sectionId)) {
    const status = await apiGet("/login");
    if (!status.loggedIn) {
      setMessage("global-message", "Please log in first.", "error");
      switchSection("auth-section");
      history.replaceState({}, "", sectionPaths["auth-section"]);
      return;
    }
  }

  const path = sectionPaths[sectionId] || `/${STUDENT_ID}`;
  if (replace) {
    history.replaceState({ sectionId }, "", path);
  } else {
    history.pushState({ sectionId }, "", path);
  }

  switchSection(sectionId);

  // Lazy-load section-specific data
  if (sectionId === "profile-section" && typeof loadProfile === "function") {
    await loadProfile();
  }
  if (sectionId === "feed-section" && typeof loadFeed === "function") {
    await loadFeed();
  }
  if (sectionId === "inspo-section" && typeof loadInspiration === "function") {
    await loadInspiration();
  }
}

// Update the UI to reflect login status
// info: user login information from server
function updateCurrentUser(info) {
  const el = document.getElementById("current-user");
  const topLogout = document.getElementById("top-logout-btn");

  const loggedIn = !!(info && info.loggedIn);
  // Show/hide navigation buttons based on login status
  document.querySelectorAll(".top-nav .nav-btn").forEach((btn) => {
    const sec = btn.getAttribute("data-section");
    if (sec === "auth-section") return; // Auth always visible
    btn.classList.toggle("hidden", !loggedIn);
  });

  if (loggedIn) {
    if (el) el.textContent = `Logged in as: ${info.username}`;
    if (topLogout) topLogout.classList.remove("hidden");
  } else {
    if (el) el.textContent = "Not logged in";
    if (topLogout) topLogout.classList.add("hidden");
  }
}

// These functions handle HTTP requests to the backend server
// All requests include credentials for session authentication

// Make GET request to server API
async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include" // Include cookies for session management
  });
  return res.json();
}

// Make POST request to server API
async function apiPost(path, bodyObj) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(bodyObj)
  });
  return res.json();
}

// Make DELETE request to server API
async function apiDelete(path, bodyObj = null) {
  const options = {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include"
  };
  if (bodyObj) options.body = JSON.stringify(bodyObj);
  const res = await fetch(`${BASE_URL}${path}`, options);
  return res.json();
}

// Register a new user account
async function handleRegister() {
  const username = document.getElementById("reg-username").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value.trim();
  const bio = document.getElementById("reg-bio").value.trim();

  if (!username || !email || !password) {
    setMessage("register-message", "Please fill username, email and password.", "error");
    return;
  }

  try {
    const data = await apiPost("/users", { username, email, password, bio });
  if (data.success) {
  setMessage("register-message", "Registration successful! You can now log in.", "success");

  // OPTIONAL: auto-fill login fields
  document.getElementById("login-username").value = username;
  document.getElementById("login-password").value = password;

  // Switch to login page
  switchSection("auth-section");

  // Show the login form
  if (document.getElementById("show-login-link")) {
    document.getElementById("show-login-link").click();
  }

} else {
      setMessage("register-message", data.message || "Registration failed.", "error");
    }
  } catch (err) {
    console.error(err);
    setMessage("register-message", "Error contacting server.", "error");
  }
}

async function loadProfile() {
  const msgEl = document.getElementById("profile-message");
  const cardEl = document.getElementById("profile-card");
  const artsEl = document.getElementById("profile-artworks");

  if (msgEl) msgEl.textContent = "";
  if (cardEl) cardEl.innerHTML = "";
  if (artsEl) artsEl.innerHTML = "";

  try {
    const data = await apiGet("/profile");

    if (!data.success) {
      if (msgEl) {
        msgEl.classList.add("error");
        msgEl.textContent = data.message || "Could not load profile.";
      }
      return;
    }

    const p = data.profile;
    const created = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "";

    if (cardEl) {
      cardEl.innerHTML = `
        <h3>@${p.username}</h3>
        <p><strong>Email:</strong> ${p.email}</p>
        <p><strong>Bio:</strong> ${p.bio || "No bio yet."}</p>
        <p><strong>Member since:</strong> ${created}</p>
        <p><strong>Artworks posted:</strong> ${p.artworkCount}</p>
      `;
    }

    if (Array.isArray(data.artworks) && data.artworks.length > 0) {
      data.artworks.forEach(a => {
        artsEl.appendChild(renderArtworkCard(a));
      });
    } else {
      if (artsEl) {
        artsEl.innerHTML = `<div class="hint">You haven't posted any artworks yet.</div>`;
      }
    }
  } catch (err) {
    console.error(err);
    if (msgEl) {
      msgEl.classList.add("error");
      msgEl.textContent = "Error contacting server.";
    }
  }
}

// Log user into their account
async function handleLogin() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();

  if (!username || !password) {
    setMessage("login-message", "Please enter username and password.", "error");
    return;
  }

  try {
    const data = await apiPost("/login", { username, password });
    if (data.success) {
      setMessage("login-message", "Login successful.", "success");

      // Refresh session status and load feed content
      await refreshLoginStatus();
      await loadFeed();

      // Redirect user to feed section after successful login
      switchSection("feed-section");
    } else {
      setMessage("login-message", data.message || "Login failed.", "error");
    }
  } catch (err) {
    console.error(err);
    setMessage("login-message", "Error contacting server.", "error");
  }
}

async function handleLogout() {
  try {
    await apiDelete("/login");
    setMessage("login-message", "Logged out.", "success");
    updateCurrentUser(null);
    switchSection("auth-section");
    document.getElementById("feed-container").innerHTML = "";
  } catch (err) {
    console.error(err);
  }
}

async function refreshLoginStatus() {
  try {
    const data = await apiGet("/login");
    updateCurrentUser(data);
  } catch (err) {
    console.error(err);
  }
}

// Post a new artwork with optional image
// Process: 1. Create artwork record, 2. Upload image if provided
async function handlePostArtwork() {
  const title = document.getElementById("art-title").value.trim();
  const description = document.getElementById("art-description").value.trim();
  const tagsRaw = document.getElementById("art-tags").value.trim();
  const fileInput = document.getElementById("art-image");
  const file =
    fileInput && fileInput.files.length > 0 ? fileInput.files[0] : null;

  if (!title || !description) {
    setMessage(
      "post-message",
      "Title and description are required.",
      "error"
    );
    return;
  }

  // Parse tags from comma-separated string
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  try {
    // Step 1: Create the artwork document (metadata only, no image yet)
    const createRes = await apiPost("/contents", {
      title,
      description,
      tags,
    });

    if (!createRes.success) {
      setMessage(
        "post-message",
        createRes.message || "Could not post artwork.",
        "error"
      );
      return;
    }

    const artworkId = createRes.artworkId;

    // 2) if an image is selected, upload it and attach to that artwork
    if (file && artworkId) {
      const formData = new FormData();
      // MUST match upload.single("artImage") in server.js
      formData.append("artImage", file);
      formData.append("artworkId", artworkId);

      const uploadRes = await fetch(`${BASE_URL}/upload/artwork`, {
        method: "POST",
        credentials: "include",
        body: formData, // no Content-Type header here, browser sets it
      });

      const uploadJson = await uploadRes.json();

      if (!uploadJson.success) {
        console.error("Image upload error:", uploadJson);
        setMessage(
          "post-message",
          uploadJson.message || "Artwork saved but image upload failed.",
          "error"
        );
        return; // artwork exists, but we stop here
      }
    }

    // everything OK
    setMessage("post-message", "Artwork posted!", "success");
    document.getElementById("art-title").value = "";
    document.getElementById("art-description").value = "";
    document.getElementById("art-tags").value = "";
    if (fileInput) fileInput.value = "";

    await loadFeed();
  } catch (err) {
    console.error(err);
    setMessage("post-message", "Error contacting server.", "error");
  }
}


// feed
function renderArtworkCard(art) {
  const div = document.createElement("div");
  div.className = "card";

  const artworkId = art.id || art._id || art.artworkId;
  if (artworkId) {
    div.setAttribute("data-artwork-id", artworkId);
  }

  const createdDate = art.createdAt
    ? new Date(art.createdAt).toLocaleString()
    : "";

  const likeCount = art.likeCount || 0;

  // Include image HTML if artwork has an image
  const imageHtml = art.imagePath
    ? `
      <div class="art-card-img-wrapper">
        <img src="${art.imagePath}" alt="${art.title || "Artwork"}" class="art-card-img" />
      </div>
    `
    : "";

  // Create artwork card HTML with like and comment buttons
  div.innerHTML = `
    <div class="art-card-title">${art.title || "Untitled"}</div>
    <div class="art-card-meta">
      by ${art.authorUsername || "Unknown"} · ${createdDate}
    </div>
    ${imageHtml}
    <div class="art-card-desc">${art.description || ""}</div>

    <div class="row space-between" style="margin-top:0.6rem;">
      <button class="secondary-btn like-btn"
              data-artwork-id="${artworkId}">
        ♥ Like (${likeCount})
      </button>
      <button class="secondary-btn show-comments-btn"
              data-artwork-id="${artworkId}">
        Comments
      </button>
    </div>

    <div class="comments-area"
         data-artwork-id="${artworkId}"
         style="display:none; margin-top:0.5rem;">
      <div class="comments-list"></div>
      <div class="row" style="margin-top:0.4rem;">
        <input type="text" class="comment-input" placeholder="Add a comment..." />
        <button class="secondary-btn comment-submit-btn"
                data-artwork-id="${artworkId}">
          Post
        </button>
      </div>
    </div>
  `;
  return div;
}

// Load and display the user's feed (artworks from followed users)
async function loadFeed() {
  try {
    const data = await apiGet("/feed");
    const container = document.getElementById("feed-container");

    if (!data.success) {
      setMessage("feed-message", data.message || "Could not load feed.", "error");
      container.innerHTML = "";
      return;
    }

    // Show message if feed is empty
    if (!data.feed || data.feed.length === 0) {
      setMessage("feed-message", "Your feed is empty. Follow artists and ask them to post!", "success");
      container.innerHTML = "";
      return;
    }

    // Clear previous feed and add new artwork cards
    setMessage("feed-message", "", "");
    container.innerHTML = "";

    data.feed.forEach(art => {
      container.appendChild(renderArtworkCard(art));
    });
  } catch (err) {
    console.error(err);
    setMessage("feed-message", "Error contacting server.", "error");
  }
}

// like toggle
async function toggleLike(artworkId, button) {
  try {
    const res = await fetch(`${BASE_URL}/contents/${artworkId}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });

    const data = await res.json();

    if (!data.success) {
      setMessage("global-message", data.message || "Could not like artwork.", "error");
      return;
    }

    const likeCount = data.likeCount ?? 0;
    const prefix = data.liked ? "♥ Liked" : "♥ Like";
    button.textContent = `${prefix} (${likeCount})`;
  } catch (err) {
    console.error(err);
    setMessage("global-message", "Error contacting server.", "error");
  }
}

// load comments for one artwork
async function loadComments(artworkId, commentsListElem) {
  try {
    const res = await fetch(`${BASE_URL}/contents/${artworkId}/comments`, {
      method: "GET",
      credentials: "include",
    });

    const data = await res.json();

    if (!data.success) {
      commentsListElem.innerHTML = `<div class="hint">Could not load comments.</div>`;
      return;
    }

    const comments = data.comments || [];
    if (comments.length === 0) {
      commentsListElem.innerHTML = `<div class="hint">No comments yet.</div>`;
      return;
    }

    commentsListElem.innerHTML = "";
    comments.forEach((c) => {
      const item = document.createElement("div");
      item.className = "list-item";
      const dateStr = c.createdAt ? new Date(c.createdAt).toLocaleString() : "";
      item.innerHTML = `<strong>@${c.username}</strong>: ${c.text} <span class="hint">· ${dateStr}</span>`;
      commentsListElem.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    commentsListElem.innerHTML = `<div class="hint">Error loading comments.</div>`;
  }
}

// submit a comment
async function submitComment(artworkId, inputElem, commentsListElem) {
  const text = inputElem.value.trim();
  if (!text) return;

  try {
    const res = await fetch(`${BASE_URL}/contents/${artworkId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ text }),
    });

    const data = await res.json();

    if (!data.success) {
      setMessage("global-message", data.message || "Could not add comment.", "error");
      return;
    }

    inputElem.value = "";

    // reload comments after posting
    await loadComments(artworkId, commentsListElem);
  } catch (err) {
    console.error(err);
    setMessage("global-message", "Error contacting server.", "error");
  }
}

// search users/ follow
async function handleUserSearch() {
  const q = document.getElementById("user-search-input").value.trim();
  if (!q) {
    setMessage("user-search-message", "Enter a username to search.", "error");
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/users?q=${encodeURIComponent(q)}`, {
      method: "GET",
      credentials: "include"
    });
    const data = await res.json();

    const container = document.getElementById("user-search-results");
    container.innerHTML = "";

    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      setMessage("user-search-message", "No users found.", "error");
      return;
    }

    setMessage("user-search-message", "", "");
    data.results.forEach(user => {
      const item = document.createElement("div");
      item.className = "list-item row space-between";
      item.innerHTML = `
        <span>@${user.username}</span>
        <button class="secondary-btn follow-btn" data-username="${user.username}">
          Follow
        </button>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    setMessage("user-search-message", "Error contacting server.", "error");
  }
}

async function handleFollowClick(username) {
  try {
    const data = await apiPost("/follow", { targetUsername: username });
    setMessage("global-message", data.message || "Follow request sent.", data.success ? "success" : "error");
    if (data.success) {
      await loadFeed();
    }
  } catch (err) {
    console.error(err);
    setMessage("global-message", "Error contacting server.", "error");
  }
}

async function loadInspiration() {
  const list = document.getElementById("inspo-list");
  if (list) list.innerHTML = "";
  setMessage("inspo-message", "Loading inspiration...", "");

  try {
    const data = await apiGet("/inspiration");

    if (!data.success || !Array.isArray(data.items)) {
      setMessage("inspo-message", data.message || "Could not load inspiration.", "error");
      return;
    }

    if (data.items.length === 0) {
      setMessage("inspo-message", "No inspiration items found.", "error");
      return;
    }

    setMessage("inspo-message", "", "");

    data.items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "list-item";
      div.textContent = item.text;
      if (list) list.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    setMessage("inspo-message", "Error contacting server for inspiration.", "error");
  }
}


// search artworks
async function handleArtSearch() {
  const q = document.getElementById("art-search-input").value.trim();
  if (!q) {
    setMessage("art-search-message", "Enter a search term.", "error");
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/contents?q=${encodeURIComponent(q)}`, {
      method: "GET",
      credentials: "include"
    });
    const data = await res.json();

    const container = document.getElementById("art-search-results");
    container.innerHTML = "";

    if (!data.success || !Array.isArray(data.results) || data.results.length === 0) {
      setMessage("art-search-message", "No artworks found.", "error");
      return;
    }

    setMessage("art-search-message", "", "");
    data.results.forEach(art => container.appendChild(renderArtworkCard(art)));
  } catch (err) {
    console.error(err);
    setMessage("art-search-message", "Error contacting server.", "error");
  }
}

// Use event delegation to handle clicks on dynamically created artwork cards
// This avoids needing to re-bind events after adding new cards to the DOM
function attachArtworkEvents(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Single event listener on container handles all card interactions
  container.addEventListener("click", async (e) => {
    // Handle like/unlike button clicks
    const likeBtn = e.target.closest(".like-btn");
    if (likeBtn) {
      const artworkId = likeBtn.getAttribute("data-artwork-id");
      if (artworkId) {
        await toggleLike(artworkId, likeBtn);
      }
      return;
    }

    // Handle show/hide comments toggle
    const showBtn = e.target.closest(".show-comments-btn");
    if (showBtn) {
      const artworkId = showBtn.getAttribute("data-artwork-id");
      if (!artworkId) return;

      const card = showBtn.closest(".card");
      if (!card) return;

      const commentsArea = card.querySelector(".comments-area");
      const commentsList = card.querySelector(".comments-list");
      const input = card.querySelector(".comment-input");

      if (!commentsArea || !commentsList || !input) return;

      if (commentsArea.style.display === "none" || commentsArea.style.display === "") {
        commentsArea.style.display = "block";
        await loadComments(artworkId, commentsList);
      } else {
        commentsArea.style.display = "none";
      }
      return;
    }

    // submit comment
    const commentBtn = e.target.closest(".comment-submit-btn");
    if (commentBtn) {
      const artworkId = commentBtn.getAttribute("data-artwork-id");
      if (!artworkId) return;

      const card = commentBtn.closest(".card");
      if (!card) return;

      const commentsList = card.querySelector(".comments-list");
      const input = card.querySelector(".comment-input");

      if (!commentsList || !input) return;

      await submitComment(artworkId, input, commentsList);
      return;
    }
  });
}

// Set up event listeners and initialize the application when DOM is ready

window.addEventListener("DOMContentLoaded", async () => {
  // Get references to all interactive buttons
  const registerBtn = document.getElementById("register-btn");
  const loginBtn = document.getElementById("login-btn");
  const topLogoutBtn = document.getElementById("top-logout-btn");
  const postBtn = document.getElementById("post-art-btn");
  const refreshFeedBtn = document.getElementById("refresh-feed-btn");
  const refreshInspoBtn = document.getElementById("refresh-inspo-btn");
  const userSearchBtn = document.getElementById("user-search-btn");
  const artSearchBtn = document.getElementById("art-search-btn");

  // Attach click handlers to main action buttons
  if (registerBtn) registerBtn.addEventListener("click", handleRegister);
  if (loginBtn) loginBtn.addEventListener("click", handleLogin);
  if (topLogoutBtn) topLogoutBtn.addEventListener("click", handleLogout);
  if (postBtn) postBtn.addEventListener("click", handlePostArtwork);
  if (refreshFeedBtn) refreshFeedBtn.addEventListener("click", loadFeed);
  if (refreshInspoBtn) refreshInspoBtn.addEventListener("click", loadInspiration);
  if (userSearchBtn) userSearchBtn.addEventListener("click", handleUserSearch);
  if (artSearchBtn) artSearchBtn.addEventListener("click", handleArtSearch);

  // Handle follow button clicks in user search results

  // follow click
  const userResults = document.getElementById("user-search-results");
  if (userResults) {
    userResults.addEventListener("click", (e) => {
      if (e.target.classList.contains("follow-btn")) {
        const username = e.target.getAttribute("data-username");
        if (username) handleFollowClick(username);
      }
    });
  }

  // login/register switches
  const registerForm = document.getElementById("register-form");
  const loginForm = document.getElementById("login-form");
  const showLoginLink = document.getElementById("show-login-link");
  const showRegisterLink = document.getElementById("show-register-link");

  if (registerForm && loginForm && showLoginLink && showRegisterLink) {
    showLoginLink.addEventListener("click", (e) => {
      e.preventDefault();
      registerForm.classList.add("hidden");
      loginForm.classList.remove("hidden");
      setMessage("register-message", "");
      setMessage("login-message", "");
    });

    showRegisterLink.addEventListener("click", (e) => {
      e.preventDefault();
      loginForm.classList.add("hidden");
      registerForm.classList.remove("hidden");
      setMessage("register-message", "");
      setMessage("login-message", "");
    });
  }

  // nav buttons
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const section = btn.getAttribute("data-section");
      await navigateToSection(section);
    });
  });

  // likes/comments event delegation
  attachArtworkEvents("feed-container");
  attachArtworkEvents("art-search-results");

  // Initial routing based on URL path
  const initialSection = pathToSection[window.location.pathname] || "auth-section";

  // Ensure login state is known before routing
  await refreshLoginStatus();
  const status = await apiGet("/login");

  // If path requires login but user not logged in, go to auth
  const requiresLogin = loginRequiredSections.has(initialSection);
  const startSection = requiresLogin && !status.loggedIn ? "auth-section" : initialSection;

  // Replace state to clean up any server redirect paths
  await navigateToSection(startSection, { replace: true });

  // If logged in and landed on auth, redirect to feed by default
  if (status.loggedIn && startSection === "auth-section") {
    await navigateToSection("feed-section");
  }

  // Handle back/forward navigation
  window.addEventListener("popstate", async (event) => {
    const sectionId = (event.state && event.state.sectionId) || pathToSection[window.location.pathname] || "auth-section";
    await navigateToSection(sectionId, { replace: true });
  });
});