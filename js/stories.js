// ===== Private Vault — File Description =====
// stories.js
// Responsibility: stories.html — loading, viewing, creating, and managing
// 24-hour stories. Contains no direct Firebase calls; all Firebase work is
// delegated to js/auth.js.

import { getLanguage, t, applyTranslations, formatDate, isVaultUnlocked, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./firebase.js";
import {
  observeAuthState,
  getUserProfile,
  listenActiveStories,
  listenUserStories,
  recordStoryView,
  listenStoryViews,
  deleteStory,
  createStory,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "./auth.js";

document.documentElement.setAttribute("lang", getLanguage());
applyTranslations();

const storiesMain = document.getElementById("storiesMain");
const storiesGrid = document.getElementById("storiesGrid");
const storiesEmpty = document.getElementById("storiesEmpty");
const addStoryButton = document.getElementById("addStoryButton");
const addStoryDialog = document.getElementById("addStoryDialog");
const closeAddStoryButton = document.getElementById("closeAddStoryButton");
const addStoryForm = document.getElementById("addStoryForm");
const storyFileInput = document.getElementById("storyFileInput");
const storyFileMessage = document.getElementById("storyFileMessage");
const storyAlert = document.getElementById("storyAlert");
const submitStoryButton = document.getElementById("submitStoryButton");
const storyUploadProgress = document.getElementById("storyUploadProgress");
const storyUploadFill = document.getElementById("storyUploadFill");
const storyUploadLabel = document.getElementById("storyUploadLabel");

const storyViewer = document.getElementById("storyViewer");
const storyViewerClose = document.getElementById("storyViewerClose");
const storyViewerContent = document.getElementById("storyViewerContent");
const storyViewerMedia = document.getElementById("storyViewerMedia");
const storyViewerMeta = document.getElementById("storyViewerMeta");
const storyViewerProgress = document.getElementById("storyViewerProgress");
const storyViewerPrev = document.getElementById("storyViewerPrev");
const storyViewerNext = document.getElementById("storyViewerNext");

let currentUid = null;
let currentStories = [];
let currentStoryIndex = 0;
let viewerInterval = null;
const profileCache = new Map();

async function resolveProfile(uid) {
  if (profileCache.has(uid)) return profileCache.get(uid);
  const profile = (await getUserProfile(uid).catch(() => null)) || { username: "", displayName: "" };
  profileCache.set(uid, profile);
  return profile;
}

function isStoryActive(story) {
  const now = Date.now();
  return story.expiresAt && story.expiresAt > now;
}

function formatStoryTime(createdAt) {
  const diff = Date.now() - createdAt;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("just_now");
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return formatDate(createdAt);
}

// ---- Story Grid ----
async function renderStoryGrid() {
  while (storiesGrid.firstChild) storiesGrid.removeChild(storiesGrid.firstChild);

  const stories = await new Promise((resolve) => {
    listenActiveStories(currentUid, (activeStories) => {
      resolve(activeStories);
    }, true); // one-time read
  });

  const storyEntries = Object.entries(stories || {})
    .filter(([, story]) => isStoryActive(story))
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  if (storyEntries.length === 0) {
    storiesEmpty.hidden = false;
    return;
  }

  storiesEmpty.hidden = true;

  // Group by user
  const grouped = {};
  storyEntries.forEach(([id, story]) => {
    if (!grouped[story.uid]) grouped[story.uid] = [];
    grouped[story.uid].push({ id, ...story });
  });

  // Render each user's story ring
  for (const [uid, userStories] of Object.entries(grouped)) {
    const profile = await resolveProfile(uid);
    const isOwn = uid === currentUid;

    const ring = document.createElement("div");
    ring.className = "story-ring";

    const avatar = document.createElement("div");
    avatar.className = "story-avatar";
    avatar.textContent = (profile.displayName || profile.username || "?").charAt(0).toUpperCase();

    const info = document.createElement("div");
    info.className = "story-info";

    const name = document.createElement("strong");
    name.textContent = profile.displayName || profile.username || uid;
    info.appendChild(name);

    const count = document.createElement("span");
    count.textContent = `${userStories.length} ${t("story_count")}`;
    info.appendChild(count);

    ring.appendChild(avatar);
    ring.appendChild(info);

    ring.addEventListener("click", () => {
      // Only show stories the user can view
      const viewable = isOwn ? userStories : userStories.filter((s) => !s.viewed);
      if (viewable.length > 0) {
        openStoryViewer(viewable);
      }
    });

    storiesGrid.appendChild(ring);
  }
}

// ---- Story Viewer ----
function openStoryViewer(stories) {
  currentStories = stories;
  currentStoryIndex = 0;
  storyViewer.hidden = false;
  showStory(currentStoryIndex);
}

function closeStoryViewer() {
  storyViewer.hidden = true;
  if (viewerInterval) {
    clearInterval(viewerInterval);
    viewerInterval = null;
  }
  while (storyViewerMedia.firstChild) storyViewerMedia.removeChild(storyViewerMedia.firstChild);
  storyViewerMeta.textContent = "";
  storyViewerProgress.style.width = "0%";
}

function showStory(index) {
  if (index < 0 || index >= currentStories.length) {
    closeStoryViewer();
    return;
  }

  const story = currentStories[index];
  currentStoryIndex = index;

  // Clear previous media
  while (storyViewerMedia.firstChild) storyViewerMedia.removeChild(storyViewerMedia.firstChild);

  // Record view (only if not own story)
  if (story.uid !== currentUid) {
    recordStoryView(story.id, currentUid).catch(() => {});
  }

  // Render media
  if (story.type === "image") {
    const img = document.createElement("img");
    img.src = story.url;
    img.alt = "Story image";
    img.loading = "lazy";
    storyViewerMedia.appendChild(img);
  } else if (story.type === "video") {
    const video = document.createElement("video");
    video.src = story.url;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    storyViewerMedia.appendChild(video);
  }

  // Update meta
  const profile = resolveProfile(story.uid);
  profile.then((p) => {
    storyViewerMeta.textContent = `${p.displayName || p.username || ""} • ${formatStoryTime(story.createdAt)}`;
  });

  // Progress
  storyViewerProgress.style.width = "0%";

  // Auto-advance (for images only)
  if (viewerInterval) clearInterval(viewerInterval);
  if (story.type === "image") {
    let progress = 0;
    viewerInterval = setInterval(() => {
      progress += 2;
      storyViewerProgress.style.width = `${Math.min(progress, 100)}%`;
      if (progress >= 100) {
        clearInterval(viewerInterval);
        viewerInterval = null;
        showStory(currentStoryIndex + 1);
      }
    }, 200);
  } else {
    // For video, progress is controlled by video events
    const video = storyViewerMedia.querySelector("video");
    if (video) {
      video.addEventListener("ended", () => {
        showStory(currentStoryIndex + 1);
      });
    }
  }

  // Update navigation buttons
  storyViewerPrev.style.display = index > 0 ? "flex" : "none";
  storyViewerNext.style.display = index < currentStories.length - 1 ? "flex" : "none";
}

// ---- Story Viewer Navigation ----
storyViewerPrev.addEventListener("click", () => {
  if (viewerInterval) {
    clearInterval(viewerInterval);
    viewerInterval = null;
  }
  showStory(currentStoryIndex - 1);
});

storyViewerNext.addEventListener("click", () => {
  if (viewerInterval) {
    clearInterval(viewerInterval);
    viewerInterval = null;
  }
  showStory(currentStoryIndex + 1);
});

storyViewerClose.addEventListener("click", closeStoryViewer);
storyViewer.addEventListener("click", (event) => {
  if (event.target === storyViewer) closeStoryViewer();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !storyViewer.hidden) closeStoryViewer();
  if (event.key === "ArrowLeft" && !storyViewer.hidden) storyViewerPrev.click();
  if (event.key === "ArrowRight" && !storyViewer.hidden) storyViewerNext.click();
});

// ---- Add Story ----
function openAddStoryDialog() {
  addStoryDialog.hidden = false;
  storyFileInput.value = "";
  storyFileMessage.textContent = "";
  storyAlert.hidden = true;
  storyUploadProgress.hidden = true;
  submitStoryButton.disabled = false;
}

function closeAddStoryDialog() {
  addStoryDialog.hidden = true;
}

function showStoryAlert(key, tone = "error") {
  storyAlert.textContent = t(key);
  storyAlert.hidden = false;
  storyAlert.classList.toggle("is-success", tone === "success");
}

function hideStoryAlert() {
  storyAlert.hidden = true;
}

function setStoryUploadProgress(ratio) {
  if (ratio === null) {
    storyUploadProgress.hidden = true;
    return;
  }
  storyUploadProgress.hidden = false;
  storyUploadFill.style.width = `${Math.round(ratio * 100)}%`;
  storyUploadLabel.textContent = t("uploading_label");
}

addStoryButton.addEventListener("click", openAddStoryDialog);
closeAddStoryButton.addEventListener("click", closeAddStoryDialog);
addStoryDialog.addEventListener("click", (event) => {
  if (event.target === addStoryDialog) closeAddStoryDialog();
});

addStoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideStoryAlert();
  storyFileMessage.textContent = "";

  const file = storyFileInput.files?.[0];
  if (!file) {
    storyFileMessage.textContent = t("err_file_required");
    storyFileMessage.classList.add("is-error");
    return;
  }

  // Validate file
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    storyFileMessage.textContent = t("err_unsupported_file_type");
    storyFileMessage.classList.add("is-error");
    return;
  }

  if (isImage && file.size > MAX_IMAGE_BYTES) {
    storyFileMessage.textContent = t("err_file_too_large");
    storyFileMessage.classList.add("is-error");
    return;
  }

  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    storyFileMessage.textContent = t("err_video_too_large");
    storyFileMessage.classList.add("is-error");
    return;
  }

  submitStoryButton.disabled = true;
  setStoryUploadProgress(0);

  try {
    const type = isImage ? "image" : "video";
    const url = await uploadStoryMedia(file, (ratio) => setStoryUploadProgress(ratio));
    await createStory(currentUid, type, url);
    showStoryAlert("story_created", "success");
    setTimeout(() => {
      closeAddStoryDialog();
      renderStoryGrid();
    }, 1000);
  } catch (error) {
    showStoryAlert(error.message || "err_story_upload_failed");
  } finally {
    setStoryUploadProgress(null);
    submitStoryButton.disabled = false;
  }
});

// ---- Upload function (uses Cloudinary) ----
async function uploadStoryMedia(file, onProgress) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    });

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.secure_url);
        } catch {
          reject(new Error("err_upload_failed"));
        }
      } else {
        reject(new Error("err_upload_failed"));
      }
    };

    xhr.onerror = () => reject(new Error("err_upload_failed"));
    xhr.send(formData);
  });
}

// ---- Auth + vault guard ----
observeAuthState(async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (!isVaultUnlocked()) {
    window.location.href = "vault.html";
    return;
  }

  currentUid = user.uid;
  storiesMain.hidden = false;

  renderStoryGrid();

  // Refresh grid when stories change
  listenActiveStories(currentUid, () => {
    renderStoryGrid();
  });
});