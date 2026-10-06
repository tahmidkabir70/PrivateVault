// ===== Private Vault — File Description =====
// chat.js
// Responsibility: chat.html — the conversation list, opening an existing
// conversation, and creating new direct or group chats. Contains no direct
// Firebase calls; all Firebase work is delegated to js/auth.js.

import { getLanguage, t, applyTranslations, formatDate, isVaultUnlocked } from "./firebase.js";
import {
  observeAuthState,
  getUserProfile,
  listenFriends,
  listenUserChats,
  listenChatMeta,
  createOrGetDirectChat,
  createGroupChat,
} from "./auth.js";

document.documentElement.setAttribute("lang", getLanguage());
applyTranslations();

const chatListMain = document.getElementById("chatListMain");
const chatListEl = document.getElementById("chatListEl");
const chatListEmpty = document.getElementById("chatListEmpty");

const newChatButton = document.getElementById("newChatButton");
const newDialog = document.getElementById("newDialog");
const closeDialogButton = document.getElementById("closeDialogButton");
const tabDirect = document.getElementById("tabDirect");
const tabGroup = document.getElementById("tabGroup");
const panelDirect = document.getElementById("panelDirect");
const panelGroup = document.getElementById("panelGroup");
const directFriendList = document.getElementById("directFriendList");
const directEmpty = document.getElementById("directEmpty");
const directErrorMessage = document.getElementById("directErrorMessage");
const groupFriendList = document.getElementById("groupFriendList");
const groupEmpty = document.getElementById("groupEmpty");
const groupNameInput = document.getElementById("groupNameInput");
const groupNameMessage = document.getElementById("groupNameMessage");
const groupMembersMessage = document.getElementById("groupMembersMessage");
const createGroupButton = document.getElementById("createGroupButton");
const groupCancelButton = document.getElementById("groupCancelButton");
const directDialogActions = document.getElementById("directDialogActions");

let currentUid = null;
let friendIds = [];
const profileCache = new Map();
const chatMetaUnsubscribers = new Map();
const chatMetaById = new Map();

async function resolveProfile(uid) {
  if (profileCache.has(uid)) return profileCache.get(uid);
  const profile = (await getUserProfile(uid).catch(() => null)) || { username: "", displayName: "" };
  profileCache.set(uid, profile);
  return profile;
}

// ---- Auth + vault guard ----
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
  chatListMain.hidden = false;

  listenFriends(currentUid, (friends) => {
    friendIds = Object.keys(friends);
  });

  listenUserChats(currentUid, (chatIds) => attachChatListeners(chatIds));
});

function attachChatListeners(chatIds) {
  // Stop listening to chats we're no longer part of.
  for (const [chatId, unsubscribe] of chatMetaUnsubscribers.entries()) {
    if (!chatIds.includes(chatId)) {
      unsubscribe();
      chatMetaUnsubscribers.delete(chatId);
      chatMetaById.delete(chatId);
    }
  }
  chatIds.forEach((chatId) => {
    if (chatMetaUnsubscribers.has(chatId)) return;
    const unsubscribe = listenChatMeta(chatId, (meta) => {
      if (meta) chatMetaById.set(chatId, meta);
      else chatMetaById.delete(chatId);
      renderChatList();
    });
    chatMetaUnsubscribers.set(chatId, unsubscribe);
  });
  renderChatList();
}

async function chatDisplayName(chatId, meta) {
  if (meta.type === "group") {
    return meta.name || t("untitled_group");
  }
  const otherUid = Object.keys(meta.memberIds || {}).find((id) => id !== currentUid);
  if (!otherUid) return "";
  const profile = await resolveProfile(otherUid);
  return profile.displayName || profile.username || otherUid;
}

let renderToken = 0;
async function renderChatList() {
  const thisToken = ++renderToken;
  const entries = Array.from(chatMetaById.entries());
  entries.sort((a, b) => (b[1].lastMessageAt || 0) - (a[1].lastMessageAt || 0));

  chatListEmpty.hidden = entries.length > 0;
  chatListEl.hidden = entries.length === 0;
  if (entries.length === 0) return;

  const names = await Promise.all(entries.map(([id, meta]) => chatDisplayName(id, meta)));
  if (thisToken !== renderToken) return; // a newer render started; drop this one

  while (chatListEl.firstChild) chatListEl.removeChild(chatListEl.firstChild);

  entries.forEach(([chatId, meta], i) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.className = "chat-row";
    link.href = `chat-room.html?chat=${encodeURIComponent(chatId)}`;

    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";
    avatar.textContent = (names[i] || "?").trim().charAt(0).toUpperCase() || "?";

    const body = document.createElement("div");
    body.className = "chat-row-body";

    const top = document.createElement("div");
    top.className = "chat-row-top";
    const nameEl = document.createElement("span");
    nameEl.className = "chat-row-name";
    nameEl.textContent = names[i];
    const timeEl = document.createElement("span");
    timeEl.className = "chat-row-time";
    timeEl.textContent = meta.lastMessageAt ? formatDate(meta.lastMessageAt) : "";
    top.appendChild(nameEl);
    top.appendChild(timeEl);

    const preview = document.createElement("p");
    preview.className = "chat-row-preview";
    preview.textContent = meta.lastMessage?.text || "";

    body.appendChild(top);
    body.appendChild(preview);
    link.appendChild(avatar);
    link.appendChild(body);
    li.appendChild(link);
    chatListEl.appendChild(li);
  });
}

// ---- New conversation dialog ----
function selectTab(tab) {
  const isDirect = tab === "direct";
  tabDirect.setAttribute("aria-selected", String(isDirect));
  tabGroup.setAttribute("aria-selected", String(!isDirect));
  panelDirect.hidden = !isDirect;
  panelGroup.hidden = isDirect;
  directDialogActions.hidden = !isDirect;
}
tabDirect.addEventListener("click", () => selectTab("direct"));
tabGroup.addEventListener("click", () => selectTab("group"));

async function populatePickLists() {
  const profiles = await Promise.all(friendIds.map((id) => resolveProfile(id)));

  [directFriendList, groupFriendList].forEach((list, listIndex) => {
    while (list.firstChild) list.removeChild(list.firstChild);
    const emptyEl = listIndex === 0 ? directEmpty : groupEmpty;
    emptyEl.hidden = friendIds.length > 0;

    friendIds.forEach((uid, i) => {
      const profile = profiles[i];
      const li = document.createElement("li");
      li.className = "pick-row";
      const input = document.createElement("input");
      input.type = listIndex === 0 ? "radio" : "checkbox";
      input.name = "directPick";
      input.value = uid;
      const label = document.createElement("span");
      label.className = "pick-row-name";
      label.textContent = profile.displayName || profile.username || uid;
      li.appendChild(input);
      li.appendChild(label);
      input.addEventListener("change", () => {
        if (listIndex === 0 && input.checked) startDirectChat(uid);
      });
      li.addEventListener("click", (event) => {
        if (event.target === input) return; // native toggle already fires 'change'
        if (input.type === "checkbox") input.checked = !input.checked;
        else input.checked = true;
        input.dispatchEvent(new Event("change"));
      });
      list.appendChild(li);
    });
  });
}

async function startDirectChat(otherUid) {
  newChatButton.disabled = true;
  directErrorMessage.textContent = "";
  directErrorMessage.classList.remove("is-error");
  try {
    const chatId = await createOrGetDirectChat(currentUid, otherUid);
    window.location.href = `chat-room.html?chat=${encodeURIComponent(chatId)}`;
  } catch (error) {
    newChatButton.disabled = false;
    directErrorMessage.textContent = t(error.message || "err_generic");
    directErrorMessage.classList.add("is-error");
  }
}

createGroupButton.addEventListener("click", async () => {
  groupNameMessage.textContent = "";
  groupMembersMessage.textContent = "";

  const name = groupNameInput.value.trim();
  const selected = Array.from(groupFriendList.querySelectorAll("input:checked")).map((el) => el.value);

  let hasError = false;
  if (!name) {
    groupNameMessage.textContent = t("err_group_name_required");
    groupNameMessage.classList.add("is-error");
    hasError = true;
  }
  if (selected.length === 0) {
    groupMembersMessage.textContent = t("err_group_members_required");
    groupMembersMessage.classList.add("is-error");
    hasError = true;
  }
  if (hasError) return;

  createGroupButton.disabled = true;
  try {
    const chatId = await createGroupChat({ name, memberUids: selected, creatorUid: currentUid });
    window.location.href = `chat-room.html?chat=${encodeURIComponent(chatId)}`;
  } catch (error) {
    groupNameMessage.textContent = t(error.message || "err_generic");
    groupNameMessage.classList.add("is-error");
    createGroupButton.disabled = false;
  }
});

function openNewDialog() {
  selectTab("direct");
  groupNameInput.value = "";
  groupNameMessage.textContent = "";
  groupMembersMessage.textContent = "";
  directErrorMessage.textContent = "";
  directErrorMessage.classList.remove("is-error");
  populatePickLists();
  newDialog.hidden = false;
}

function closeNewDialog() {
  newDialog.hidden = true;
}

newChatButton.addEventListener("click", openNewDialog);
closeDialogButton.addEventListener("click", closeNewDialog);
groupCancelButton.addEventListener("click", closeNewDialog);
newDialog.addEventListener("click", (event) => {
  if (event.target === newDialog) closeNewDialog();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !newDialog.hidden) closeNewDialog();
});
