// ===== Private Vault — File Description =====
// friends.js
// Responsibility: friends.html — username search, sending/canceling friend
// requests, accepting/rejecting incoming requests, and rendering a
// real-time friend list. Contains no direct Firebase calls; all Firebase
// work is delegated to js/auth.js.

import { getLanguage, t, applyTranslations, isVaultUnlocked } from "./firebase.js";
import {
  observeAuthState,
  getUserProfile,
  searchUsersByUsernamePrefix,
  sendFriendRequest,
  cancelFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  listenFriends,
  listenIncomingRequests,
  listenSentRequests,
} from "./auth.js";

document.documentElement.setAttribute("lang", getLanguage());
applyTranslations();

const friendsMain = document.getElementById("friendsMain");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchStatus = document.getElementById("searchStatus");
const searchResultsList = document.getElementById("searchResultsList");

const tabAll = document.getElementById("tabAll");
const tabRequests = document.getElementById("tabRequests");
const panelAll = document.getElementById("panelAll");
const panelRequests = document.getElementById("panelRequests");

const friendListEl = document.getElementById("friendListEl");
const friendListEmpty = document.getElementById("friendListEmpty");
const incomingListEl = document.getElementById("incomingListEl");
const incomingEmpty = document.getElementById("incomingEmpty");
const sentListEl = document.getElementById("sentListEl");
const sentEmpty = document.getElementById("sentEmpty");

let currentUid = null;
let friendIds = new Set();
let incomingIds = new Set();
let sentIds = new Set();
const profileCache = new Map();

// ---- Auth + vault session guard ----
observeAuthState((user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (!isVaultUnlocked()) {
    window.location.href = "vault.html";
    return;
  }
  currentUid = user.uid;
  friendsMain.hidden = false;
  attachListeners(currentUid);
});

async function resolveProfile(uid) {
  if (profileCache.has(uid)) return profileCache.get(uid);
  const profile = await getUserProfile(uid).catch(() => null);
  const resolved = profile || { username: "", displayName: "" };
  profileCache.set(uid, resolved);
  return resolved;
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function buildFriendRow({ uid, username, displayName }, actionsBuilder) {
  const li = document.createElement("li");
  li.className = "friend-row";

  const info = document.createElement("div");
  info.className = "friend-info";
  const nameEl = document.createElement("h3");
  nameEl.textContent = displayName || username || uid;
  const userEl = document.createElement("span");
  userEl.textContent = username ? `@${username}` : "";
  info.appendChild(nameEl);
  info.appendChild(userEl);
  li.appendChild(info);

  const actions = document.createElement("div");
  actions.className = "inline-actions";
  actionsBuilder(actions, uid);
  li.appendChild(actions);

  return li;
}

function makeActionButton(labelKey, variant, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = variant === "primary" ? "btn-primary" : "btn-secondary";
  btn.textContent = t(labelKey);
  btn.addEventListener("click", onClick);
  return btn;
}

// ---- Tabs ----
function selectTab(tab) {
  const isAll = tab === "all";
  tabAll.setAttribute("aria-selected", String(isAll));
  tabRequests.setAttribute("aria-selected", String(!isAll));
  panelAll.hidden = !isAll;
  panelRequests.hidden = isAll;
}
tabAll.addEventListener("click", () => selectTab("all"));
tabRequests.addEventListener("click", () => selectTab("requests"));

// ---- Real-time lists ----
function attachListeners(uid) {
  listenFriends(uid, async (friends) => {
    friendIds = new Set(Object.keys(friends));
    await renderFriendList();
  });

  listenIncomingRequests(uid, async (requests) => {
    incomingIds = new Set(Object.keys(requests));
    await renderIncomingList();
  });

  listenSentRequests(uid, async (requests) => {
    sentIds = new Set(Object.keys(requests));
    await renderSentList();
    await renderSearchResults(lastSearchResults);
  });
}

async function renderFriendList() {
  clearChildren(friendListEl);
  const ids = Array.from(friendIds);
  friendListEmpty.hidden = ids.length > 0;
  const profiles = await Promise.all(ids.map((id) => resolveProfile(id)));
  ids.forEach((uid, i) => {
    const profile = profiles[i];
    const row = buildFriendRow({ uid, ...profile }, (actions) => {
      actions.appendChild(
        makeActionButton("btn_remove_friend", "secondary", async () => {
          await removeFriend(currentUid, uid).catch(() => {});
        })
      );
    });
    friendListEl.appendChild(row);
  });
}

async function renderIncomingList() {
  clearChildren(incomingListEl);
  const ids = Array.from(incomingIds);
  incomingEmpty.hidden = ids.length > 0;
  const profiles = await Promise.all(ids.map((id) => resolveProfile(id)));
  ids.forEach((uid, i) => {
    const profile = profiles[i];
    const row = buildFriendRow({ uid, ...profile }, (actions) => {
      actions.appendChild(
        makeActionButton("btn_accept", "primary", async () => {
          await acceptFriendRequest(currentUid, uid).catch(() => {});
        })
      );
      actions.appendChild(
        makeActionButton("btn_reject", "secondary", async () => {
          await rejectFriendRequest(currentUid, uid).catch(() => {});
        })
      );
    });
    incomingListEl.appendChild(row);
  });
}

async function renderSentList() {
  clearChildren(sentListEl);
  const ids = Array.from(sentIds);
  sentEmpty.hidden = ids.length > 0;
  const profiles = await Promise.all(ids.map((id) => resolveProfile(id)));
  ids.forEach((uid, i) => {
    const profile = profiles[i];
    const row = buildFriendRow({ uid, ...profile }, (actions) => {
      actions.appendChild(
        makeActionButton("btn_cancel_request", "secondary", async () => {
          await cancelFriendRequest(currentUid, uid).catch(() => {});
        })
      );
    });
    sentListEl.appendChild(row);
  });
}

// ---- Search ----
let lastSearchResults = [];

async function renderSearchResults(results) {
  lastSearchResults = results;
  clearChildren(searchResultsList);
  if (!results.length) {
    searchResultsList.hidden = true;
    return;
  }
  searchResultsList.hidden = false;

  results
    .filter((r) => r.uid !== currentUid)
    .forEach(({ uid, username, displayName }) => {
      const row = buildFriendRow({ uid, username, displayName }, (actions) => {
        if (friendIds.has(uid)) {
          const badge = document.createElement("span");
          badge.className = "friend-badge";
          badge.textContent = t("label_friends_badge");
          actions.appendChild(badge);
        } else if (sentIds.has(uid)) {
          actions.appendChild(
            makeActionButton("btn_cancel_request", "secondary", async () => {
              await cancelFriendRequest(currentUid, uid).catch(() => {});
            })
          );
        } else if (incomingIds.has(uid)) {
          actions.appendChild(
            makeActionButton("btn_accept", "primary", async () => {
              await acceptFriendRequest(currentUid, uid).catch(() => {});
            })
          );
        } else {
          actions.appendChild(
            makeActionButton("btn_add_friend", "primary", async (event) => {
              event.target.disabled = true;
              try {
                await sendFriendRequest(currentUid, uid);
                searchStatus.textContent = t("friend_request_sent");
                searchStatus.classList.remove("is-error");
              } catch {
                event.target.disabled = false;
              }
            })
          );
        }
      });
      searchResultsList.appendChild(row);
    });
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prefix = searchInput.value.trim();
  if (!prefix) {
    searchStatus.textContent = t("friends_empty_search");
    searchStatus.classList.remove("is-error");
    searchResultsList.hidden = true;
    return;
  }

  searchStatus.textContent = t("searching_label");
  searchStatus.classList.remove("is-error");

  try {
    const results = await searchUsersByUsernamePrefix(prefix);
    results.forEach((r) => profileCache.set(r.uid, { username: r.username, displayName: r.displayName }));
    await renderSearchResults(results);
    searchStatus.textContent = results.length
      ? ""
      : t("friends_search_no_results");
  } catch {
    searchStatus.textContent = t("err_search_failed");
    searchStatus.classList.add("is-error");
  }
});
