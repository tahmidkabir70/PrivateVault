// ===== Private Vault — File Description =====
// chat-room.js
// Responsibility: chat-room.html — loading one chat's metadata, rendering
// its message thread in real time, sending new messages, and the Phase 7
// message actions (reply, reactions, edit, delete, copy). Contains no
// direct Firebase calls; all Firebase work is delegated to js/auth.js.

import {
  getLanguage,
  t,
  applyTranslations,
  formatDate,
  isVaultUnlocked,
  EMOJI_PALETTE,
  GIPHY_API_KEY,
  GIPHY_SEARCH_ENDPOINT,
} from "./firebase.js";
import {
  observeAuthState,
  getUserProfile,
  getChatMeta,
  listenMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleMessageReaction,
  uploadAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_FILE_BYTES,
  listenTyping,
  setTyping,
  markChatRead,
  listenReadStatus,
  loadOlderMessages,
  listenUserPresence,
  listenFriends,
  isFriend,
  sendFriendRequest,
  addGroupMember,
  removeGroupMember,
  leaveGroup,
  blockUser,
  unblockUser,
  isUserBlocked,
  reportUser,
} from "./auth.js";

document.documentElement.setAttribute("lang", getLanguage());
applyTranslations();

const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢"];

const chatRoomTitle = document.getElementById("chatRoomTitle");
const chatRoomSubtitle = document.getElementById("chatRoomSubtitle");
const messagesScroll = document.getElementById("messagesScroll");
const messagesStatus = document.getElementById("messagesStatus");
const composerForm = document.getElementById("composerForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const replyBanner = document.getElementById("replyBanner");
const replyBannerSender = document.getElementById("replyBannerSender");
const replyBannerPreview = document.getElementById("replyBannerPreview");
const replyBannerClose = document.getElementById("replyBannerClose");

const attachmentInput = document.getElementById("attachmentInput");
const attachButton = document.getElementById("attachButton");
const emojiButton = document.getElementById("emojiButton");
const emojiPopover = document.getElementById("emojiPopover");
const gifButton = document.getElementById("gifButton");
const gifDialog = document.getElementById("gifDialog");
const gifDialogCloseButton = document.getElementById("gifDialogCloseButton");
const gifSearchForm = document.getElementById("gifSearchForm");
const gifSearchInput = document.getElementById("gifSearchInput");
const gifResults = document.getElementById("gifResults");
const gifStatus = document.getElementById("gifStatus");
const uploadProgressBar = document.getElementById("uploadProgressBar");
const uploadProgressFill = document.getElementById("uploadProgressFill");
const uploadProgressLabel = document.getElementById("uploadProgressLabel");
const typingIndicator = document.getElementById("typingIndicator");

const chatOptionsButton = document.getElementById("chatOptionsButton");
const headerOptionsPopover = document.getElementById("headerOptionsPopover");
const groupSettingsDialog = document.getElementById("groupSettingsDialog");
const groupMembersList = document.getElementById("groupMembersList");
const groupAddMemberSection = document.getElementById("groupAddMemberSection");
const groupAddMemberList = document.getElementById("groupAddMemberList");
const groupAddMemberEmpty = document.getElementById("groupAddMemberEmpty");
const groupSettingsErrorMessage = document.getElementById("groupSettingsErrorMessage");
const leaveGroupButton = document.getElementById("leaveGroupButton");
const closeGroupSettingsButton = document.getElementById("closeGroupSettingsButton");
const reportDialog = document.getElementById("reportDialog");
const reportForm = document.getElementById("reportForm");
const reportReasonInput = document.getElementById("reportReasonInput");
const closeReportDialogButton = document.getElementById("closeReportDialogButton");
const viewProfileDialog = document.getElementById("viewProfileDialog");
const viewProfileTitle = document.getElementById("viewProfileTitle");
const viewProfileUsername = document.getElementById("viewProfileUsername");
const viewProfileStatus = document.getElementById("viewProfileStatus");
const closeViewProfileButton = document.getElementById("closeViewProfileButton");

const chatId = new URLSearchParams(window.location.search).get("chat");

let currentUid = null;
let chatMeta = null;
let otherUid = null; // set for direct chats only
let liveMessages = [];
const liveById = new Map(); // every live message seen this session (survives the 30-message window sliding)
let olderMessages = [];
let latestMessages = []; // merged, sorted — what's actually rendered
let noMoreOlder = false;
let isLoadingOlder = false;
let lastReadByOther = null; // for direct-chat "Seen" ticks
let activeReply = null; // { messageId, senderId, text }
let openPopoverMessageId = null;
let editingMessageId = null;
let isTypingActive = false;
let typingStopTimer = null;
let friendIds = new Set();
let reportTargetUid = null;
const profileCache = new Map();

function mergedMessages() {
  const map = new Map();
  olderMessages.forEach((m) => map.set(m.id, m));
  liveMessages.forEach((m) => map.set(m.id, m));
  return Array.from(map.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

async function resolveProfile(uid) {
  if (profileCache.has(uid)) return profileCache.get(uid);
  const profile = (await getUserProfile(uid).catch(() => null)) || { username: "", displayName: "" };
  profileCache.set(uid, profile);
  return profile;
}

function isNearBottom() {
  return messagesScroll.scrollHeight - messagesScroll.scrollTop - messagesScroll.clientHeight < 120;
}

function scrollToBottom() {
  messagesScroll.scrollTop = messagesScroll.scrollHeight;
}

async function loadChatHeader() {
  if (chatMeta.type === "group") {
    chatRoomTitle.textContent = chatMeta.name || t("untitled_group");
    const count = Object.keys(chatMeta.memberIds || {}).length;
    chatRoomSubtitle.textContent = `${count} ${t("group_member_count")}`;

    chatOptionsButton.hidden = false;
    chatOptionsButton.setAttribute("aria-label", t("group_settings_button"));
    chatOptionsButton.addEventListener("click", openGroupSettings);
  } else {
    otherUid = Object.keys(chatMeta.memberIds || {}).find((id) => id !== currentUid) || null;
    const profile = otherUid ? await resolveProfile(otherUid) : null;
    chatRoomTitle.textContent = profile?.displayName || profile?.username || "";
    chatRoomSubtitle.textContent = profile?.username ? `@${profile.username}` : "";

    if (otherUid) {
      listenUserPresence(otherUid, (presence) => {
        if (!presence.privacy.showStatus) {
          chatRoomSubtitle.textContent = profile?.username ? `@${profile.username}` : "";
          return;
        }
        if (presence.status === "online") {
          chatRoomSubtitle.textContent = t("status_online");
        } else if (presence.privacy.showLastSeen && presence.lastSeen) {
          chatRoomSubtitle.textContent = `${t("last_seen_prefix")} ${formatDate(presence.lastSeen)}`;
        } else {
          chatRoomSubtitle.textContent = t("status_offline");
        }
      });

      listenReadStatus(chatId, otherUid, (readAt) => {
        lastReadByOther = readAt;
        renderMessages(mergedMessages(), { skipScrollCheck: true });
      });
    }

    chatOptionsButton.hidden = false;
    chatOptionsButton.setAttribute("aria-label", t("chat_options_button"));
    chatOptionsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleHeaderOptionsPopover();
    });
  }
}

// ---- Reply banner ----
function setActiveReply(message, senderName) {
  activeReply = { messageId: message.id, senderId: message.senderId, text: message.text };
  replyBannerSender.textContent = `${t("replying_to_label")} ${senderName}`;
  replyBannerPreview.textContent = message.text;
  replyBanner.hidden = false;
  messageInput.focus();
}

function clearActiveReply() {
  activeReply = null;
  replyBanner.hidden = true;
}

replyBannerClose.addEventListener("click", clearActiveReply);

// ---- Actions popover ----
function closeOpenPopover() {
  const existing = messagesScroll.querySelector(".message-actions-popover");
  if (existing) existing.remove();
  openPopoverMessageId = null;
}

function buildPopover(message, isOwn, senderName) {
  const popover = document.createElement("div");
  popover.className = "message-actions-popover";
  popover.setAttribute("role", "menu");

  const emojiRow = document.createElement("div");
  emojiRow.className = "popover-emoji-row";
  QUICK_REACTIONS.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = emoji;
    btn.setAttribute("aria-label", t("react_label"));
    btn.addEventListener("click", async () => {
      closeOpenPopover();
      await toggleMessageReaction(chatId, message.id, currentUid, emoji).catch(() => {});
    });
    emojiRow.appendChild(btn);
  });
  popover.appendChild(emojiRow);

  const addAction = (labelKey, handler, danger = false) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `popover-action-btn${danger ? " is-danger" : ""}`;
    btn.textContent = t(labelKey);
    btn.addEventListener("click", () => {
      closeOpenPopover();
      handler();
    });
    popover.appendChild(btn);
  };

  addAction("reply_label", () => setActiveReply(message, senderName));
  addAction("copy_label", async () => {
    try {
      await navigator.clipboard.writeText(message.text);
    } catch {
      // Clipboard API unavailable — silently ignore, action is non-critical.
    }
  });

  if (isOwn) {
    addAction("edit_label", () => startInlineEdit(message.id));
    addAction(
      "delete_label",
      async () => {
        if (!window.confirm(t("confirm_delete_message"))) return;
        await deleteMessage(chatId, message.id, currentUid).catch(() => {
          messagesStatus.textContent = t("err_delete_failed");
        });
      },
      true
    );
  }

  return popover;
}

document.addEventListener("click", (event) => {
  if (!openPopoverMessageId) return;
  if (event.target.closest(".message-actions-popover") || event.target.closest(".message-more-btn")) return;
  closeOpenPopover();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeOpenPopover();
});

// ---- Inline edit ----
function startInlineEdit(messageId) {
  editingMessageId = messageId;
  renderMessages(latestMessages, { skipScrollCheck: true });
}

function cancelInlineEdit() {
  editingMessageId = null;
  renderMessages(latestMessages, { skipScrollCheck: true });
}

function buildEditForm(message) {
  const form = document.createElement("form");
  form.className = "edit-inline-form";

  const textarea = document.createElement("textarea");
  textarea.rows = 2;
  textarea.value = message.text;
  form.appendChild(textarea);

  const actions = document.createElement("div");
  actions.className = "edit-inline-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-secondary";
  cancelBtn.textContent = t("cancel_button");
  cancelBtn.addEventListener("click", cancelInlineEdit);

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.className = "btn-primary";
  saveBtn.textContent = t("save_label");

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newText = textarea.value.trim();
    if (!newText) return;
    saveBtn.disabled = true;
    try {
      await editMessage(chatId, message.id, currentUid, newText);
      editingMessageId = null;
    } catch {
      messagesStatus.textContent = t("err_edit_failed");
      saveBtn.disabled = false;
    }
  });

  window.setTimeout(() => textarea.focus(), 0);
  return form;
}

// ---- Reactions rendering ----
function buildReactionsRowFor(message) {
  if (!message.reactions) return null;
  const entries = Object.entries(message.reactions).filter(([, uids]) => uids && Object.keys(uids).length > 0);
  if (entries.length === 0) return null;

  const row = document.createElement("div");
  row.className = "message-reactions";
  entries.forEach(([emoji, uids]) => {
    const count = Object.keys(uids).length;
    const isMine = Boolean(uids[currentUid]);
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = `reaction-pill${isMine ? " is-own-reaction" : ""}`;
    pill.textContent = `${emoji} ${count}`;
    pill.addEventListener("click", async () => {
      await toggleMessageReaction(chatId, message.id, currentUid, emoji).catch(() => {});
    });
    row.appendChild(pill);
  });
  return row;
}

// ---- Attachment rendering ----
function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAttachmentElement(attachment) {
  if (!attachment) return null;

  if (attachment.type === "image" || attachment.type === "gif") {
    const wrap = document.createElement("a");
    wrap.className = `message-attachment-${attachment.type === "gif" ? "gif" : "image"}`;
    wrap.href = attachment.url;
    wrap.target = "_blank";
    wrap.rel = "noopener noreferrer";
    const img = document.createElement("img");
    img.src = attachment.url;
    img.alt = attachment.name || "attachment";
    img.loading = "lazy";
    wrap.appendChild(img);
    return wrap;
  }

  if (attachment.type === "video") {
    const wrap = document.createElement("div");
    wrap.className = "message-attachment-video";
    const video = document.createElement("video");
    video.src = attachment.url;
    video.controls = true;
    wrap.appendChild(video);
    return wrap;
  }

  // Generic file
  const link = document.createElement("a");
  link.className = "message-attachment-file";
  link.href = attachment.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.download = attachment.name || "";

  const icon = document.createElement("span");
  icon.className = "file-icon";
  icon.textContent = "📎";
  const name = document.createElement("span");
  name.className = "file-name";
  name.textContent = attachment.name || t("attachment_generic_label");
  const size = document.createElement("span");
  size.className = "file-size";
  size.textContent = formatFileSize(attachment.size);

  link.appendChild(icon);
  link.appendChild(name);
  link.appendChild(size);
  return link;
}

// ---- Rendering ----
async function renderMessages(messages, options = {}) {
  latestMessages = messages;
  const shouldStickToBottom = options.skipScrollCheck
    ? isNearBottom()
    : isNearBottom() || messagesScroll.childElementCount <= 1;

  while (messagesScroll.firstChild) messagesScroll.removeChild(messagesScroll.firstChild);

  if (messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "messages-status";
    empty.textContent = t("messages_empty");
    messagesScroll.appendChild(empty);
    return;
  }

  if (!noMoreOlder) messagesScroll.appendChild(buildLoadOlderButton());

  const isGroup = chatMeta.type === "group";
  const senderIds = Array.from(new Set(messages.map((m) => m.senderId)));
  const senderProfiles = new Map();
  await Promise.all(senderIds.map(async (id) => senderProfiles.set(id, await resolveProfile(id))));

  const messageById = new Map(messages.map((m) => [m.id, m]));

  messages.forEach((message) => {
    const isOwn = message.senderId === currentUid;
    const senderProfile = senderProfiles.get(message.senderId);
    const senderName = senderProfile?.displayName || senderProfile?.username || "";

    const row = document.createElement("div");
    row.className = `message-row ${isOwn ? "is-own" : "is-other"}`;
    row.dataset.messageId = message.id;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    if (message.deleted) {
      const placeholder = document.createElement("span");
      placeholder.className = "message-deleted";
      placeholder.textContent = t("deleted_message_placeholder");
      bubble.appendChild(placeholder);
      row.appendChild(bubble);
      messagesScroll.appendChild(row);
      return;
    }

    if (isGroup && !isOwn) {
      const label = document.createElement("span");
      label.className = "message-sender-label";
      label.textContent = senderName;
      bubble.appendChild(label);
    }

    if (message.replyTo) {
      const quoted = messageById.get(message.replyTo.messageId);
      const quoteEl = document.createElement("div");
      quoteEl.className = "message-quote";
      const quoteAuthor = document.createElement("strong");
      const quoteAuthorId = quoted ? quoted.senderId : message.replyTo.senderId;
      quoteAuthor.textContent =
        senderProfiles.get(quoteAuthorId)?.displayName || senderProfiles.get(quoteAuthorId)?.username || "";
      const quoteText = document.createElement("span");
      quoteText.textContent = quoted?.deleted ? t("deleted_message_placeholder") : message.replyTo.text;
      quoteEl.appendChild(quoteAuthor);
      quoteEl.appendChild(quoteText);
      bubble.appendChild(quoteEl);
    }

    if (editingMessageId === message.id) {
      bubble.appendChild(buildEditForm(message));
    } else {
      const attachmentEl = buildAttachmentElement(message.attachment);
      if (attachmentEl) bubble.appendChild(attachmentEl);

      if (message.text) {
        const textEl = document.createElement("span");
        textEl.className = "message-text";
        textEl.textContent = message.text;
        bubble.appendChild(textEl);
      }

      const reactionsRow = buildReactionsRowFor(message);
      if (reactionsRow) bubble.appendChild(reactionsRow);

      const meta = document.createElement("span");
      meta.className = "message-meta";
      const parts = [];
      if (message.timestamp) parts.push(formatDate(message.timestamp));
      if (message.edited) parts.push(t("message_edited_label"));
      if (isOwn && !isGroup && message.timestamp) {
        const isSeen = lastReadByOther && lastReadByOther >= message.timestamp;
        parts.push(isSeen ? t("seen_label") : t("sent_label"));
      }
      meta.textContent = parts.join(" ");
      bubble.appendChild(meta);
    }

    row.appendChild(bubble);

    if (editingMessageId !== message.id) {
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "message-more-btn";
      moreBtn.textContent = "⋯";
      moreBtn.setAttribute("aria-label", t("message_actions_label"));
      moreBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (openPopoverMessageId === message.id) {
          closeOpenPopover();
          return;
        }
        closeOpenPopover();
        openPopoverMessageId = message.id;
        row.appendChild(buildPopover(message, isOwn, senderName));
      });
      row.appendChild(moreBtn);
    }

    messagesScroll.appendChild(row);
  });

  if (shouldStickToBottom) scrollToBottom();
}

observeAuthState(async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (!isVaultUnlocked()) {
    window.location.href = "vault.html";
    return;
  }
  if (!chatId) {
    messagesStatus.textContent = t("err_chat_not_found");
    return;
  }

  currentUid = user.uid;

  try {
    chatMeta = await getChatMeta(chatId);
    if (!chatMeta || !chatMeta.memberIds || !chatMeta.memberIds[currentUid]) {
      messagesStatus.textContent = t("err_chat_not_found");
      return;
    }
    await loadChatHeader();
  } catch {
    messagesStatus.textContent = t("err_load_messages_failed");
    return;
  }

  listenMessages(chatId, (messages) => {
    messages.forEach((m) => liveById.set(m.id, m));
    liveMessages = Array.from(liveById.values());
    renderMessages(mergedMessages()).then(fillIfShort);
    markChatRead(currentUid, chatId).catch(() => {});
  });

  listenTyping(chatId, currentUid, async (typingUids) => {
    if (typingUids.length === 0) {
      typingIndicator.hidden = true;
      typingIndicator.textContent = "";
      return;
    }
    typingIndicator.hidden = false;
    if (typingUids.length === 1) {
      const profile = await resolveProfile(typingUids[0]);
      const name = profile.displayName || profile.username || "";
      typingIndicator.textContent = `${name} ${t("is_typing_suffix")}`.trim();
    } else {
      typingIndicator.textContent = t("several_typing");
    }
  });

  markChatRead(currentUid, chatId).catch(() => {});

  listenFriends(currentUid, (friends) => {
    friendIds = new Set(Object.keys(friends));
  });
});

// ---- Older messages: scroll-to-top, "load older" button, auto-fill ----
function loadOlderLabel() {
  return getLanguage() === "en" ? "Load older messages" : "পুরনো বার্তা দেখুন";
}

function buildLoadOlderButton() {
  const btn = document.createElement("p");
  btn.className = "messages-load-more";
  btn.setAttribute("role", "button");
  btn.tabIndex = 0;
  btn.textContent = loadOlderLabel();
  const run = () => loadOlderBatch();
  btn.addEventListener("click", run);
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); run(); }
  });
  return btn;
}

async function loadOlderBatch() {
  if (isLoadingOlder || noMoreOlder) return;
  const oldest = mergedMessages()[0];
  if (!oldest || !oldest.timestamp) return;

  isLoadingOlder = true;
  const prevScrollHeight = messagesScroll.scrollHeight;
  const prevScrollTop = messagesScroll.scrollTop;
  let failed = false;

  try {
    const older = await loadOlderMessages(chatId, oldest.timestamp, 30);
    if (older.length === 0) {
      noMoreOlder = true;
      await renderMessages(mergedMessages(), { skipScrollCheck: true });
    } else {
      olderMessages = [...older, ...olderMessages];
      await renderMessages(mergedMessages(), { skipScrollCheck: true });
      messagesScroll.scrollTop = prevScrollTop + (messagesScroll.scrollHeight - prevScrollHeight);
    }
  } catch {
    failed = true;
  } finally {
    isLoadingOlder = false;
  }

  if (failed) {
    const first = messagesScroll.querySelector(".messages-load-more");
    if (first) first.textContent = t("err_load_messages_failed");
  }
}

// If the newest 30 messages don't fill the screen, keep loading until they do.
async function fillIfShort() {
  let guard = 0;
  while (!noMoreOlder && !isLoadingOlder && guard < 5 &&
         messagesScroll.scrollHeight <= messagesScroll.clientHeight + 20) {
    guard += 1;
    await loadOlderBatch();
  }
}

messagesScroll.addEventListener("scroll", () => {
  if (messagesScroll.scrollTop > 60) return;
  loadOlderBatch();
});

// Auto-resize the composer textarea as the user types, and signal typing.
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
  if (messageInput.value.trim() === "") {
    stopTypingNow();
  } else {
    handleTypingSignal();
  }
});

/** Sets the typing flag on first keystroke, and clears it after 3s of inactivity. */
function handleTypingSignal() {
  if (!currentUid || !chatId) return;
  if (!isTypingActive) {
    isTypingActive = true;
    setTyping(chatId, currentUid, true).catch(() => {});
  }
  window.clearTimeout(typingStopTimer);
  typingStopTimer = window.setTimeout(() => {
    isTypingActive = false;
    setTyping(chatId, currentUid, false).catch(() => {});
  }, 3000);
}

function stopTypingNow() {
  window.clearTimeout(typingStopTimer);
  if (isTypingActive && currentUid && chatId) {
    isTypingActive = false;
    setTyping(chatId, currentUid, false).catch(() => {});
  }
}

// Enter sends; Shift+Enter inserts a newline.
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composerForm.requestSubmit();
  }
});

composerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !currentUid || !chatId) return;

  sendButton.disabled = true;
  messageInput.value = "";
  messageInput.style.height = "auto";
  stopTypingNow();
  const replyPayload = activeReply
    ? { messageId: activeReply.messageId, senderId: activeReply.senderId, text: activeReply.text }
    : null;
  clearActiveReply();

  try {
    await sendMessage(chatId, currentUid, text, replyPayload);
  } catch {
    messageInput.value = text;
    messagesStatus.textContent = t("err_message_failed");
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
});

// ---- Emoji picker ----
function buildEmojiPopover() {
  EMOJI_PALETTE.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      insertAtCursor(messageInput, emoji);
    });
    emojiPopover.appendChild(btn);
  });
}
buildEmojiPopover();

/** Inserts text at the current caret position without losing cursor placement. */
function insertAtCursor(textarea, insertText) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  textarea.value = before + insertText + after;
  const newPos = start + insertText.length;
  textarea.focus();
  textarea.setSelectionRange(newPos, newPos);
  textarea.dispatchEvent(new Event("input"));
}

function toggleEmojiPopover() {
  const isOpen = !emojiPopover.hidden;
  emojiPopover.hidden = isOpen;
  emojiButton.setAttribute("aria-expanded", String(!isOpen));
}

emojiButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleEmojiPopover();
});

document.addEventListener("click", (event) => {
  if (emojiPopover.hidden) return;
  if (event.target.closest(".emoji-popover") || event.target === emojiButton) return;
  emojiPopover.hidden = true;
  emojiButton.setAttribute("aria-expanded", "false");
});

// ---- Attachments ----
function setUploadProgress(ratio) {
  if (ratio === null) {
    uploadProgressBar.hidden = true;
    return;
  }
  uploadProgressBar.hidden = false;
  uploadProgressLabel.textContent = t("uploading_label");
  uploadProgressFill.style.width = `${Math.round(ratio * 100)}%`;
}

attachButton.addEventListener("click", () => attachmentInput.click());

attachmentInput.addEventListener("change", async () => {
  const file = attachmentInput.files?.[0];
  attachmentInput.value = ""; // allow re-selecting the same file later
  if (!file || !currentUid || !chatId) return;

  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  const sizeLimit = isVideo ? MAX_VIDEO_BYTES : isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (file.size > sizeLimit) {
    messagesStatus.textContent = t("err_file_too_large");
    return;
  }

  attachButton.disabled = true;
  sendButton.disabled = true;
  setUploadProgress(0);

  try {
    const attachment = await uploadAttachment(chatId, currentUid, file, (ratio) => setUploadProgress(ratio));
    await sendMessage(chatId, currentUid, "", null, attachment);
  } catch (error) {
    messagesStatus.textContent = t(error.message || "err_upload_failed");
  } finally {
    setUploadProgress(null);
    attachButton.disabled = false;
    sendButton.disabled = false;
  }
});

// ---- GIF search dialog ----
function openGifDialog() {
  gifDialog.hidden = false;
  gifSearchInput.value = "";
  gifStatus.hidden = false;
  gifStatus.textContent = t("gif_type_to_search");
  while (gifResults.firstChild) gifResults.removeChild(gifResults.firstChild);
  gifResults.appendChild(gifStatus);
  gifSearchInput.focus();
}

function closeGifDialog() {
  gifDialog.hidden = true;
}

gifButton.addEventListener("click", openGifDialog);
gifDialogCloseButton.addEventListener("click", closeGifDialog);
gifDialog.addEventListener("click", (event) => {
  if (event.target === gifDialog) closeGifDialog();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !gifDialog.hidden) closeGifDialog();
});

async function sendGif(url) {
  closeGifDialog();
  try {
    await sendMessage(chatId, currentUid, "", null, { type: "gif", url });
  } catch {
    messagesStatus.textContent = t("err_message_failed");
  }
}

function renderGifStatus(key) {
  while (gifResults.firstChild) gifResults.removeChild(gifResults.firstChild);
  const p = document.createElement("p");
  p.className = "messages-status";
  p.textContent = t(key);
  gifResults.appendChild(p);
}

function renderGifResults(gifs) {
  while (gifResults.firstChild) gifResults.removeChild(gifResults.firstChild);
  if (gifs.length === 0) {
    renderGifStatus("gif_no_results");
    return;
  }
  const grid = document.createElement("div");
  grid.className = "gif-results-grid";
  gifs.forEach((gif) => {
    const previewUrl = gif.images?.fixed_width?.url || gif.images?.preview_gif?.url;
    const fullUrl = gif.images?.original?.url || previewUrl;
    if (!previewUrl || !fullUrl) return;
    const btn = document.createElement("button");
    btn.type = "button";
    const img = document.createElement("img");
    img.src = previewUrl;
    img.alt = gif.title || "GIF";
    img.loading = "lazy";
    btn.appendChild(img);
    btn.addEventListener("click", () => sendGif(fullUrl));
    grid.appendChild(btn);
  });
  gifResults.appendChild(grid);
}

gifSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = gifSearchInput.value.trim();
  if (!query) {
    renderGifStatus("gif_type_to_search");
    return;
  }

  renderGifStatus("gif_loading");

  const url = new URL(GIPHY_SEARCH_ENDPOINT);
  url.searchParams.set("api_key", GIPHY_API_KEY);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "20");
  url.searchParams.set("rating", "g");

  try {
    const response = await fetch(url.toString());
    if (response.status === 429) {
      renderGifStatus("err_gif_rate_limited");
      return;
    }
    if (!response.ok) {
      renderGifStatus("err_gif_network");
      return;
    }
    const data = await response.json();
    renderGifResults(Array.isArray(data.data) ? data.data : []);
  } catch {
    renderGifStatus("err_gif_network");
  }
});

// ---- Header options popover (direct chats) ----
function closeHeaderOptionsPopover() {
  headerOptionsPopover.hidden = true;
  while (headerOptionsPopover.firstChild) headerOptionsPopover.removeChild(headerOptionsPopover.firstChild);
}

async function toggleHeaderOptionsPopover() {
  if (!headerOptionsPopover.hidden) {
    closeHeaderOptionsPopover();
    return;
  }
  while (headerOptionsPopover.firstChild) headerOptionsPopover.removeChild(headerOptionsPopover.firstChild);

  const addRow = (labelKey, handler, danger = false) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "menuitem");
    if (danger) btn.classList.add("is-danger");
    btn.textContent = t(labelKey);
    btn.addEventListener("click", () => {
      closeHeaderOptionsPopover();
      handler();
    });
    headerOptionsPopover.appendChild(btn);
  };

  // Direct chat options only (no stranger)
  if (otherUid) {
    addRow("stranger_view_profile", () => openViewProfileDialog(otherUid));

    if (!friendIds.has(otherUid)) {
      addRow("stranger_add_friend", async () => {
        await sendFriendRequest(currentUid, otherUid).catch(() => {});
      });
    }

    const blocked = otherUid ? await isUserBlocked(currentUid, otherUid).catch(() => false) : false;
    if (blocked) {
      addRow(
        "user_blocked_badge",
        async () => {
          await unblockUser(currentUid, otherUid).catch(() => {});
        },
        true
      );
    } else {
      addRow(
        "block_user_button",
        async () => {
          if (!window.confirm(t("confirm_block_user"))) return;
          await blockUser(currentUid, otherUid).catch(() => {});
          window.location.href = "chat.html";
        },
        true
      );
    }
    addRow("report_user_button", () => openReportDialog(otherUid));
  }

  headerOptionsPopover.hidden = false;
}

document.addEventListener("click", (event) => {
  if (headerOptionsPopover.hidden) return;
  if (event.target.closest(".header-options-popover") || event.target === chatOptionsButton) return;
  closeHeaderOptionsPopover();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !headerOptionsPopover.hidden) closeHeaderOptionsPopover();
});

// ---- Group settings dialog ----
async function openGroupSettings() {
  await renderGroupSettings();
  groupSettingsDialog.hidden = false;
}

function closeGroupSettings() {
  groupSettingsDialog.hidden = true;
}

async function renderGroupSettings() {
  const isCreator = chatMeta.createdBy === currentUid;
  const memberUids = Object.keys(chatMeta.memberIds || {});
  const profiles = await Promise.all(memberUids.map((id) => resolveProfile(id)));

  while (groupMembersList.firstChild) groupMembersList.removeChild(groupMembersList.firstChild);
  memberUids.forEach((uid, i) => {
    const profile = profiles[i];
    const li = document.createElement("li");
    li.className = "pick-row";
    const name = document.createElement("span");
    name.className = "pick-row-name";
    name.textContent = profile.displayName || profile.username || uid;
    li.appendChild(name);
    if (uid === chatMeta.createdBy) {
      const badge = document.createElement("span");
      badge.className = "member-row-badge";
      badge.textContent = t("group_creator_badge");
      li.appendChild(badge);
    } else if (isCreator) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-secondary";
      removeBtn.textContent = t("remove_member_button");
      removeBtn.addEventListener("click", async () => {
        if (!window.confirm(t("confirm_remove_member"))) return;
        groupSettingsErrorMessage.textContent = "";
        groupSettingsErrorMessage.classList.remove("is-error");
        try {
          await removeGroupMember(chatId, uid, currentUid);
          chatMeta = await getChatMeta(chatId);
          await renderGroupSettings();
        } catch (error) {
          groupSettingsErrorMessage.textContent = t(error.message || "err_generic");
          groupSettingsErrorMessage.classList.add("is-error");
        }
      });
      li.appendChild(removeBtn);
    }
    groupMembersList.appendChild(li);
  });

  groupAddMemberSection.hidden = !isCreator;
  if (isCreator) {
    const addableUids = Array.from(friendIds).filter((uid) => !chatMeta.memberIds[uid]);
    while (groupAddMemberList.firstChild) groupAddMemberList.removeChild(groupAddMemberList.firstChild);
    groupAddMemberEmpty.hidden = addableUids.length > 0;
    const addableProfiles = await Promise.all(addableUids.map((id) => resolveProfile(id)));
    addableUids.forEach((uid, i) => {
      const profile = addableProfiles[i];
      const li = document.createElement("li");
      li.className = "pick-row";
      const name = document.createElement("span");
      name.className = "pick-row-name";
      name.textContent = profile.displayName || profile.username || uid;
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn-primary";
      addBtn.textContent = t("add_member_button");
      addBtn.addEventListener("click", async () => {
        addBtn.disabled = true;
        groupSettingsErrorMessage.textContent = "";
        groupSettingsErrorMessage.classList.remove("is-error");
        try {
          await addGroupMember(chatId, uid, currentUid);
          chatMeta = await getChatMeta(chatId);
          await renderGroupSettings();
        } catch (error) {
          addBtn.disabled = false;
          groupSettingsErrorMessage.textContent = t(error.message || "err_generic");
          groupSettingsErrorMessage.classList.add("is-error");
        }
      });
      li.appendChild(name);
      li.appendChild(addBtn);
      groupAddMemberList.appendChild(li);
    });
  }
}

leaveGroupButton.addEventListener("click", async () => {
  if (!window.confirm(t("confirm_leave_group"))) return;
  try {
    await leaveGroup(chatId, currentUid);
    window.location.href = "chat.html";
  } catch {
    // Leave the dialog open on failure.
  }
});

closeGroupSettingsButton.addEventListener("click", closeGroupSettings);
groupSettingsDialog.addEventListener("click", (event) => {
  if (event.target === groupSettingsDialog) closeGroupSettings();
});

// ---- Report dialog ----
function openReportDialog(targetUid) {
  reportTargetUid = targetUid;
  reportReasonInput.value = "";
  reportDialog.hidden = false;
  reportReasonInput.focus();
}

function closeReportDialog() {
  reportDialog.hidden = true;
  reportTargetUid = null;
}

closeReportDialogButton.addEventListener("click", closeReportDialog);
reportDialog.addEventListener("click", (event) => {
  if (event.target === reportDialog) closeReportDialog();
});

reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!reportTargetUid) return;
  const submitBtn = document.getElementById("submitReportButton");
  submitBtn.disabled = true;
  try {
    await reportUser(currentUid, reportTargetUid, reportReasonInput.value);
    closeReportDialog();
    messagesStatus.textContent = t("report_submitted");
  } catch {
    messagesStatus.textContent = t("err_report_failed");
  } finally {
    submitBtn.disabled = false;
  }
});

// ---- View profile dialog ----
let viewProfileUnsub = null;

async function openViewProfileDialog(uid) {
  if (!uid) return;
  const profile = await resolveProfile(uid);
  viewProfileTitle.textContent = profile.displayName || profile.username || "";
  viewProfileUsername.textContent = profile.username ? `@${profile.username}` : "";
  viewProfileStatus.textContent = "";
  viewProfileDialog.hidden = false;

  if (viewProfileUnsub) viewProfileUnsub();
  viewProfileUnsub = listenUserPresence(uid, (presence) => {
    if (!presence.privacy.showStatus) {
      viewProfileStatus.textContent = "";
    } else if (presence.status === "online") {
      viewProfileStatus.textContent = t("status_online");
    } else if (presence.privacy.showLastSeen && presence.lastSeen) {
      viewProfileStatus.textContent = `${t("last_seen_prefix")} ${formatDate(presence.lastSeen)}`;
    } else {
      viewProfileStatus.textContent = t("status_offline");
    }
  });
}

function closeViewProfileDialog() {
  viewProfileDialog.hidden = true;
  if (viewProfileUnsub) {
    viewProfileUnsub();
    viewProfileUnsub = null;
  }
}

closeViewProfileButton.addEventListener("click", closeViewProfileDialog);
viewProfileDialog.addEventListener("click", (event) => {
  if (event.target === viewProfileDialog) closeViewProfileDialog();
});