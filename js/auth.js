// ===== Private Vault — File Description =====
// auth.js
// Responsibility: ALL Firebase Authentication operations and ALL Realtime
// Database reads/writes for the whole application. UI files never call
// Firebase directly — they only call functions exported from this file.
// Media uploads go through Cloudinary (unsigned browser upload), not Firebase Storage.
// Random/stranger chat is intentionally not implemented.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  off,
  onDisconnect,
  query,
  orderByChild,
  orderByKey,
  startAt,
  endAt,
  limitToFirst,
  limitToLast,
  push,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  auth,
  database,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
} from "./firebase.js";

// ============================================================================
// Shared error mapping
// ============================================================================

/**
 * Maps a Firebase Authentication error code to a translation-dictionary key
 * so the UI can render a user-friendly, localized message. Never surfaces
 * raw Firebase error text to the user.
 * @param {unknown} error - The thrown error/exception.
 * @returns {string} A translation key (see translations.bn/en in firebase.js).
 */
function mapAuthErrorToKey(error) {
  const code = typeof error === "object" && error && "code" in error ? error.code : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "err_invalid_credentials";
    case "auth/too-many-requests":
      return "err_too_many_requests";
    case "auth/network-request-failed":
      return "err_network";
    case "auth/email-already-in-use":
      return "err_email_in_use";
    case "auth/weak-password":
      return "err_weak_password";
    case "auth/invalid-email":
      return "err_email_invalid";
    default:
      return "err_generic";
  }
}

/**
 * Builds an Error whose `.message` is a translation key (not display text),
 * so calling UI code can render it via `t(err.message)`.
 * @param {string} key - Translation key to attach as the error message.
 */
function keyedError(key) {
  return new Error(key);
}

// ============================================================================
// Username handling
// ============================================================================

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * Checks whether a username is well-formed (3–20 chars, letters/numbers/underscore).
 * @param {string} username - Candidate username.
 * @returns {boolean} True if the format is valid.
 */
export function isUsernameFormatValid(username) {
  return USERNAME_PATTERN.test(username);
}

/**
 * Checks whether a syntactically valid username is currently available.
 * Does not reserve it — availability can change before signup completes,
 * so signupUser() re-checks atomically via a transaction.
 * @param {string} username - Username to look up.
 * @returns {Promise<boolean>} True if no account currently owns this username.
 */
export async function checkUsernameAvailable(username) {
  const snapshot = await get(ref(database, `usernames/${username}`));
  return !snapshot.exists();
}

// ============================================================================
// Signup / Login
// ============================================================================

/**
 * Creates a new account: creates the Firebase Auth user first,
 * then atomically reserves the username using a transaction (now authenticated).
 * If username reservation fails (taken), deletes the newly created auth account.
 * Rolls back the username if profile write fails.
 * @param {{email: string, username: string, displayName: string, password: string}} input
 * @returns {Promise<import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js").User>}
 */
export async function signupUser({ email, username, displayName, password }) {
  // 1. Validate username format
  if (!isUsernameFormatValid(username)) {
    throw keyedError("username_invalid");
  }

  // 2. Create the Firebase Auth user (this will fail if email is in use, etc.)
  let credential;
  try {
    credential = await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    throw keyedError(mapAuthErrorToKey(error));
  }

  const user = credential.user;
  const uid = user.uid;

  // 3. Atomically reserve the username using a transaction (now authenticated)
  const usernameRef = ref(database, `usernames/${username}`);
  let reservationCommitted = false;

  try {
    const result = await runTransaction(usernameRef, (current) => {
      // If someone else took it, abort (return undefined)
      if (current !== null) {
        return; // abort
      }
      // Reserve with the new user's UID
      return { uid };
    });

    if (!result.committed) {
      // Username already taken — delete the auth user we just created
      await user.delete().catch(() => {});
      throw keyedError("username_taken");
    }
    reservationCommitted = true;
  } catch (error) {
    // If transaction fails for any other reason, delete the auth user
    await user.delete().catch(() => {});
    throw keyedError("err_generic");
  }

  // 4. Update Firebase Auth profile with displayName
  try {
    await updateProfile(user, { displayName });
  } catch (error) {
    // If profile update fails, clean up username and delete auth user
    await remove(usernameRef).catch(() => {});
    await user.delete().catch(() => {});
    throw keyedError("err_generic");
  }

  // 5. Write the user profile to Realtime Database
  try {
    await set(ref(database, `users/${uid}`), {
      email,
      username,
      displayName,
      status: "online",
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp(),
      vaultPasswordHash: null,
      privacy: { showStatus: true, showLastSeen: true },
    });
  } catch (error) {
    // Profile write failed — clean up username and delete auth user
    await remove(usernameRef).catch(() => {});
    await user.delete().catch(() => {});
    throw keyedError("err_generic");
  }

  // All good — return the user
  return user;
}

/**
 * Signs an existing user in with email and password.
 * @param {{email: string, password: string}} input
 * @returns {Promise<import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js").User>}
 */
export async function loginUser({ email, password }) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  } catch (error) {
    throw keyedError(mapAuthErrorToKey(error));
  }
}

// ============================================================================
// PHASE 3 — Auth state & sign-out
// ============================================================================

/**
 * Subscribes to Firebase Authentication state changes.
 * @param {(user: import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js").User | null) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
/**
 * Sends a Firebase password-reset email. Always resolves with a generic
 * success key from the UI side so we do not enumerate whether the email exists.
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function sendPasswordReset(email) {
  const trimmed = (email || "").trim();
  if (!trimmed) throw keyedError("err_required_fields");
  try {
    await sendPasswordResetEmail(auth, trimmed);
  } catch (error) {
    // Map only rate-limit / network; otherwise swallow to avoid account enumeration.
    const key = mapAuthErrorToKey(error);
    if (key === "err_too_many_requests" || key === "err_network") {
      throw keyedError(key);
    }
    // For user-not-found / invalid-email etc., still pretend success at call site.
  }
}

export function observeAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Marks a user offline (best-effort) and signs them out of Firebase Authentication.
 * @param {string} [uid] - Current user's uid, used to write a final offline status.
 */
export async function signOutUser(uid) {
  if (uid) {
    await setUserOffline(uid).catch(() => {});
  }
  await signOut(auth);
}

// ============================================================================
// PHASE 3 — Vault password (separate app-level gate)
// ============================================================================

/**
 * Reads the stored vault-password hash for a user, if one has been set.
 * @param {string} uid - Firebase Auth uid.
 * @returns {Promise<string|null>} The SHA-256 hex hash, or null if unset.
 */
export async function getVaultPasswordHash(uid) {
  const snapshot = await get(ref(database, `users/${uid}/vaultPasswordHash`));
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Stores a new vault-password hash for a user. The caller is responsible
 * for hashing the plaintext (see hashPassword in firebase.js) — this
 * function never receives or stores a plaintext password.
 * @param {string} uid - Firebase Auth uid.
 * @param {string} hash - SHA-256 hex digest of the vault password.
 */
export async function setVaultPasswordHash(uid, hash) {
  await update(ref(database, `users/${uid}`), { vaultPasswordHash: hash });
}

// ============================================================================
// PHASE 4 — Profile & presence
// ============================================================================

/**
 * Reads a user's full profile record.
 * @param {string} uid - Firebase Auth uid.
 * @returns {Promise<object|null>} The user record, or null if it doesn't exist.
 */
export async function getUserProfile(uid) {
  const snapshot = await get(ref(database, `users/${uid}`));
  return snapshot.exists() ? snapshot.val() : null;
}

/** Marks a user online and refreshes their lastSeen timestamp. */
export async function setUserOnline(uid) {
  await update(ref(database, `users/${uid}`), { status: "online", lastSeen: serverTimestamp() });
}

/** Marks a user offline and refreshes their lastSeen timestamp. */
export async function setUserOffline(uid) {
  await update(ref(database, `users/${uid}`), { status: "offline", lastSeen: serverTimestamp() });
}

/**
 * Sets up real presence for a user: marks them online now, and registers a
 * server-side onDisconnect hook so that if the connection drops (closed
 * tab, lost network, crash) without a clean sign-out, Firebase itself
 * flips the user to offline — avoiding the "stuck online" problem that
 * plain client-side status writes have.
 * @param {string} uid - Firebase Auth uid.
 * @returns {() => void} Unsubscribe function to stop watching connection state
 *   (call this on sign-out, after also calling setUserOffline()).
 */
export function initPresence(uid) {
  const userRef = ref(database, `users/${uid}`);
  const connectedRef = ref(database, ".info/connected");

  return onValue(connectedRef, (snapshot) => {
    if (snapshot.val() !== true) return;
    onDisconnect(userRef)
      .update({ status: "offline", lastSeen: serverTimestamp() })
      .then(() => {
        update(userRef, { status: "online", lastSeen: serverTimestamp() });
      })
      .catch(() => {});
  });
}

/**
 * Listens for real-time changes to a user's presence fields.
 * @param {string} uid - The uid to watch.
 * @param {(presence: {status: string, lastSeen: number, privacy: object}) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function listenUserPresence(uid, callback) {
  return onValue(ref(database, `users/${uid}`), (snapshot) => {
    const data = snapshot.val() || {};
    callback({
      status: data.status || "offline",
      lastSeen: data.lastSeen || null,
      privacy: data.privacy || { showStatus: true, showLastSeen: true },
    });
  });
}

// ============================================================================
// PHASE 5 — Friends
// ============================================================================

const FRIEND_SEARCH_LIMIT = 20;

/**
 * Searches for usernames starting with the given prefix (case-sensitive,
 * matched against the `usernames/` key index for efficiency) and resolves
 * each match's display name.
 * @param {string} prefix - Username prefix to search for.
 * @returns {Promise<Array<{uid: string, username: string, displayName: string}>>}
 */
export async function searchUsersByUsernamePrefix(prefix) {
  if (!prefix) return [];
  const usernamesQuery = query(
    ref(database, "usernames"),
    orderByKey(),
    startAt(prefix),
    endAt(prefix + "\uf8ff"),
    limitToFirst(FRIEND_SEARCH_LIMIT)
  );
  const snapshot = await get(usernamesQuery);
  if (!snapshot.exists()) return [];

  const matches = Object.entries(snapshot.val())
    .filter(([, data]) => data && data.uid)
    .map(([username, data]) => ({ uid: data.uid, username }));

  const profiles = await Promise.all(
    matches.map((m) => get(ref(database, `users/${m.uid}/displayName`)))
  );

  return matches.map((m, i) => ({
    ...m,
    displayName: profiles[i].exists() ? profiles[i].val() : m.username,
  }));
}

/**
 * Sends a friend request from one user to another, writing both the
 * recipient's incoming-request record and the sender's sent-request record
 * in a single multi-path update.
 * @param {string} fromUid - Requester's uid.
 * @param {string} toUid - Recipient's uid.
 */
export async function sendFriendRequest(fromUid, toUid) {
  if (fromUid === toUid) throw keyedError("err_generic");
  const updates = {};
  updates[`friendRequests/${toUid}/${fromUid}`] = { status: "pending", createdAt: serverTimestamp() };
  updates[`sentFriendRequests/${fromUid}/${toUid}`] = { status: "pending", createdAt: serverTimestamp() };
  await update(ref(database), updates);
  await createNotification(toUid, {
    type: "friend_request",
    fromUid,
    titleKey: "notif_friend_request_title",
    bodyKey: "notif_friend_request_body",
  }).catch(() => {});
}

/**
 * Cancels a friend request the current user previously sent.
 * @param {string} fromUid - Requester's uid.
 * @param {string} toUid - Recipient's uid.
 */
export async function cancelFriendRequest(fromUid, toUid) {
  const updates = {};
  updates[`friendRequests/${toUid}/${fromUid}`] = null;
  updates[`sentFriendRequests/${fromUid}/${toUid}`] = null;
  await update(ref(database), updates);
}

/**
 * Accepts an incoming friend request, making the friendship mutual and
 * clearing both request records.
 * @param {string} uid - Current (accepting) user's uid.
 * @param {string} fromUid - Requester's uid.
 */
export async function acceptFriendRequest(uid, fromUid) {
  const updates = {};
  updates[`friends/${uid}/${fromUid}`] = true;
  updates[`friends/${fromUid}/${uid}`] = true;
  updates[`friendRequests/${uid}/${fromUid}`] = null;
  updates[`sentFriendRequests/${fromUid}/${uid}`] = null;
  await update(ref(database), updates);
  await createNotification(fromUid, {
    type: "friend_accepted",
    fromUid: uid,
    titleKey: "notif_friend_accepted_title",
    bodyKey: "notif_friend_accepted_body",
  }).catch(() => {});
}

/**
 * Rejects an incoming friend request without creating a friendship.
 * @param {string} uid - Current (rejecting) user's uid.
 * @param {string} fromUid - Requester's uid.
 */
export async function rejectFriendRequest(uid, fromUid) {
  const updates = {};
  updates[`friendRequests/${uid}/${fromUid}`] = null;
  updates[`sentFriendRequests/${fromUid}/${uid}`] = null;
  await update(ref(database), updates);
}

/**
 * Removes an existing mutual friendship on both sides.
 * @param {string} uid - Current user's uid.
 * @param {string} otherUid - The friend to remove.
 */
export async function removeFriend(uid, otherUid) {
  const updates = {};
  updates[`friends/${uid}/${otherUid}`] = null;
  updates[`friends/${otherUid}/${uid}`] = null;
  await update(ref(database), updates);
}

/**
 * Listens for real-time changes to a user's friend list.
 * @param {string} uid - Current user's uid.
 * @param {(friends: Record<string, true>) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function listenFriends(uid, callback) {
  return onValue(ref(database, `friends/${uid}`), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  });
}

/**
 * One-time check for whether two users are currently friends.
 * @param {string} uid - Current user's uid.
 * @param {string} otherUid - The other user's uid.
 * @returns {Promise<boolean>}
 */
export async function isFriend(uid, otherUid) {
  const snapshot = await get(ref(database, `friends/${uid}/${otherUid}`));
  return snapshot.exists();
}

/**
 * Listens for real-time changes to a user's incoming friend requests.
 * @param {string} uid - Current user's uid.
 * @param {(requests: Record<string, object>) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function listenIncomingRequests(uid, callback) {
  return onValue(ref(database, `friendRequests/${uid}`), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  });
}

/**
 * Listens for real-time changes to a user's requests sent.
 * @param {string} uid - Current user's uid.
 * @param {(requests: Record<string, object>) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function listenSentRequests(uid, callback) {
  return onValue(ref(database, `sentFriendRequests/${uid}`), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  });
}

// ============================================================================
// PHASE 6 — Chat: list, direct/group creation, sending & reading messages
// ============================================================================

/**
 * Listens for the set of chat ids the current user is a member of.
 * @param {string} uid - Current user's uid.
 * @param {(chatIds: string[]) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function listenUserChats(uid, callback) {
  return onValue(ref(database, `userChats/${uid}`), (snapshot) => {
    callback(snapshot.exists() ? Object.keys(snapshot.val()) : []);
  });
}

/**
 * Reads a chat's metadata record once.
 * @param {string} chatId - Chat identifier.
 * @returns {Promise<object|null>} The chat record, or null if it doesn't exist.
 */
export async function getChatMeta(chatId) {
  const snapshot = await get(ref(database, `chats/${chatId}`));
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Listens for real-time changes to a single chat's metadata (name, last
 * message preview, member list, etc.).
 * @param {string} chatId - Chat identifier.
 * @param {(chat: object|null) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function listenChatMeta(chatId, callback) {
  return onValue(ref(database, `chats/${chatId}`), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
}

/**
 * Builds the deterministic direct-chat id for two users, independent of
 * argument order, matching the `dm_{sortedUidA}_{sortedUidB}` convention.
 * @param {string} uidA
 * @param {string} uidB
 * @returns {string}
 */
function buildDirectChatId(uidA, uidB) {
  const [first, second] = [uidA, uidB].sort();
  return `dm_${first}_${second}`;
}

/**
 * Gets (or lazily creates) the direct chat between two users. Safe to call
 * every time a user opens a DM — uses a transaction so concurrent opens
 * from both sides never create two competing chat records.
 * @param {string} currentUid - The user initiating the chat.
 * @param {string} otherUid - The other participant.
 * @returns {Promise<string>} The chat id.
 */
export async function createOrGetDirectChat(currentUid, otherUid) {
  if (currentUid === otherUid) throw keyedError("err_generic");
  const chatId = buildDirectChatId(currentUid, otherUid);
  const chatRef = ref(database, `chats/${chatId}`);

  await runTransaction(chatRef, (current) => {
    // Returning current keeps an existing chat; never creates a duplicate.
    if (current !== null) return current;
    return {
      type: "direct",
      memberIds: { [currentUid]: true, [otherUid]: true },
      createdBy: currentUid,
      createdAt: serverTimestamp(),
      lastMessage: null,
      lastMessageAt: null,
      active: true,
    };
  });

  await update(ref(database), {
    [`userChats/${currentUid}/${chatId}`]: true,
    [`userChats/${otherUid}/${chatId}`]: true,
  });

  return chatId;
}

/**
 * Creates a new group chat with the given members (the creator is always
 * included as a member).
 * @param {{name: string, memberUids: string[], creatorUid: string}} input
 * @returns {Promise<string>} The new chat id.
 */
export async function createGroupChat({ name, memberUids, creatorUid }) {
  const trimmedName = (name || "").trim();
  if (!trimmedName) throw keyedError("err_group_name_required");
  const allMembers = Array.from(new Set([...memberUids, creatorUid]));
  if (allMembers.length < 2) throw keyedError("err_group_members_required");

  const newChatRef = push(ref(database, "chats"));
  const chatId = newChatRef.key;

  const memberIds = {};
  allMembers.forEach((uid) => {
    memberIds[uid] = true;
  });

  const updates = {};
  updates[`chats/${chatId}`] = {
    type: "group",
    name: trimmedName,
    memberIds,
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    lastMessage: null,
    lastMessageAt: null,
    active: true,
  };
  allMembers.forEach((uid) => {
    updates[`userChats/${uid}/${chatId}`] = true;
  });

  await update(ref(database), updates);
  await Promise.all(
    allMembers
      .filter((uid) => uid !== creatorUid)
      .map((uid) =>
        createNotification(uid, {
          type: "group_added",
          fromUid: creatorUid,
          chatId,
          titleKey: "notif_group_added_title",
          bodyKey: "notif_group_added_body",
        }).catch(() => {})
      )
  );
  return chatId;
}

/**
 * Sends a message into a chat (text and/or an attachment/GIF) and updates
 * the chat's last-message preview in the same multi-path write.
 *
 * Additionally enqueues a push job under pendingPush/{recipientUid} for
 * every other member of the chat. A Cloudflare Worker watches that node
 * and delivers a Web Push payload, which wakes the service worker even
 * when the PWA is fully closed — that is what puts a red dot on the
 * installed PWA icon on Android.
 *
 * @param {string} chatId - Chat identifier.
 * @param {string} senderId - Sender's uid.
 * @param {string} text - Message text (may be empty when an attachment is present).
 * @param {{messageId: string, senderId: string, text: string}|null} [replyTo] - Optional quoted message being replied to.
 * @param {{type: "image"|"video"|"file"|"gif", url: string, name?: string, size?: number}|null} [attachment] - Optional attachment payload.
 * @returns {Promise<string>} The new message id.
 */
export async function sendMessage(chatId, senderId, text, replyTo = null, attachment = null) {
  const trimmed = (text || "").trim();
  if (!trimmed && !attachment) throw keyedError("err_message_failed");

  const newMessageRef = push(ref(database, `messages/${chatId}`));
  const messageId = newMessageRef.key;
  const timestamp = Date.now();
  const previewText = trimmed || previewLabelForAttachment(attachment);

  const updates = {};
  updates[`messages/${chatId}/${messageId}`] = {
    senderId,
    text: trimmed,
    timestamp: serverTimestamp(),
    attachment: attachment || null,
    replyTo: replyTo || null,
    edited: false,
    deleted: false,
    reactions: null,
  };
  updates[`chats/${chatId}/lastMessage`] = { text: previewText, senderId, at: timestamp };
  updates[`chats/${chatId}/lastMessageAt`] = timestamp;

  try {
    await update(ref(database), updates);
  } catch {
    throw keyedError("err_message_failed");
  }

  // ---- Enqueue push notification jobs for the other chat members ----
  // This is what makes the red dot appear even when the browser is fully
  // closed: the Cloudflare Worker reads pendingPush/{uid} on a schedule
  // and delivers a Web Push message that wakes the service worker.
  // A failure here must NEVER break message delivery, so it is wrapped
  // in its own try/catch and swallowed on error.
  try {
    const chatSnap = await get(ref(database, `chats/${chatId}`));
    if (chatSnap.exists()) {
      const chat = chatSnap.val();
      const memberIds = chat.memberIds || {};
      const recipients = Object.keys(memberIds).filter((uid) => uid !== senderId);
      if (recipients.length > 0) {
        const pushUpdates = {};
        recipients.forEach((uid) => {
          pushUpdates[`pendingPush/${uid}/${messageId}`] = {
            type: "message",
            chatId,
            createdAt: timestamp,
          };
        });
        await update(ref(database), pushUpdates);
      }
    }
  } catch (e) {
    // Push enqueue failure is non-fatal for messaging.
  }

  return messageId;
}

/** Builds a short last-message preview string for a non-text (or mixed) message. */
function previewLabelForAttachment(attachment) {
  if (!attachment) return "";
  if (attachment.type === "gif") return "GIF";
  if (attachment.type === "image") return "📷";
  if (attachment.type === "video") return "🎥";
  return attachment.name || "📎";
}

/**
 * Listens for the most recent messages in a chat, ordered oldest-to-newest.
 * Phase 6 loads a fixed recent window; infinite-scroll pagination is added
 * in a later phase.
 * @param {string} chatId - Chat identifier.
 * @param {(messages: Array<object & {id: string}>) => void} callback
 * @param {number} [limitCount] - Maximum number of recent messages to load.
 * @returns {() => void} Unsubscribe function.
 */
export function listenMessages(chatId, callback, limitCount = 30) {
  const messagesQuery = query(
    ref(database, `messages/${chatId}`),
    orderByChild("timestamp"),
    limitToLast(limitCount)
  );
  return onValue(messagesQuery, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    const messages = Object.entries(snapshot.val()).map(([id, data]) => ({ id, ...data }));
    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    callback(messages);
  });
}

// ============================================================================
// PHASE 7 — Messaging enhancements: edit, delete, reactions
// ============================================================================

/**
 * Edits an existing message's text. Only the original sender may edit it,
 * and a deleted message can no longer be edited.
 * @param {string} chatId - Chat identifier.
 * @param {string} messageId - Message identifier.
 * @param {string} uid - The uid attempting the edit.
 * @param {string} newText - The replacement text.
 * @returns {Promise<void>}
 */
export async function editMessage(chatId, messageId, uid, newText) {
  const trimmed = (newText || "").trim();
  if (!trimmed) throw keyedError("err_edit_failed");

  const messageRef = ref(database, `messages/${chatId}/${messageId}`);
  const snapshot = await get(messageRef);
  if (!snapshot.exists()) throw keyedError("err_edit_failed");

  const message = snapshot.val();
  if (message.senderId !== uid || message.deleted) throw keyedError("err_edit_failed");

  try {
    await update(messageRef, { text: trimmed, edited: true });
  } catch {
    throw keyedError("err_edit_failed");
  }
}

/**
 * Soft-deletes a message: clears its text and marks it deleted so the UI
 * can render a neutral placeholder, rather than removing the database
 * record outright. Only the original sender may delete it.
 * @param {string} chatId - Chat identifier.
 * @param {string} messageId - Message identifier.
 * @param {string} uid - The uid attempting the deletion.
 * @returns {Promise<void>}
 */
export async function deleteMessage(chatId, messageId, uid) {
  const messageRef = ref(database, `messages/${chatId}/${messageId}`);
  const snapshot = await get(messageRef);
  if (!snapshot.exists()) throw keyedError("err_delete_failed");

  const message = snapshot.val();
  if (message.senderId !== uid) throw keyedError("err_delete_failed");

  try {
    await update(messageRef, { text: "", deleted: true, reactions: null });
  } catch {
    throw keyedError("err_delete_failed");
  }
}

/**
 * Toggles the current user's reaction (a single emoji) on a message. If the
 * user already reacted with this emoji, the reaction is removed; otherwise
 * it's added. Uses a transaction so rapid double-taps can't desync.
 * @param {string} chatId - Chat identifier.
 * @param {string} messageId - Message identifier.
 * @param {string} uid - Reacting user's uid.
 * @param {string} emoji - The reaction emoji.
 * @returns {Promise<void>}
 */
export async function toggleMessageReaction(chatId, messageId, uid, emoji) {
  const reactionRef = ref(database, `messages/${chatId}/${messageId}/reactions/${emoji}/${uid}`);
  await runTransaction(reactionRef, (current) => (current ? null : true));
}

// ============================================================================
// PHASE 8 — Media: Firebase Storage attachment uploads
// ============================================================================

/** General attachment size limit (8 MB) — images and documents. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
/** Image upload limit (8 MB). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Video upload limit (50 MB). */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
/** Document/file upload limit (8 MB). */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "pif", "js", "vbs", "wsf",
  "jar", "apk", "dmg", "sh", "ps1", "dll", "sys",
]);

/**
 * Classifies a file's broad attachment category from its MIME type.
 * @param {File} file
 * @returns {"image"|"video"|"file"}
 */
function classifyAttachment(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

/**
 * Returns true when the filename extension is considered dangerous.
 * @param {string} name
 * @returns {boolean}
 */
function isBlockedExtension(name) {
  const parts = (name || "").split(".");
  if (parts.length < 2) return false;
  return BLOCKED_EXTENSIONS.has(parts.pop().toLowerCase());
}

/**
 * Uploads a file to Cloudinary (unsigned preset) and returns an attachment
 * payload ready for sendMessage(). Client size/type checks are convenience
 * only; never expose a Cloudinary API Secret in frontend code.
 * @param {string} chatId - Chat identifier (metadata only; not used in path).
 * @param {string} uid - Uploading user's uid.
 * @param {File} file - The file to upload.
 * @param {(progressRatio: number) => void} [onProgress] - Called with 0..1 upload progress.
 * @returns {Promise<{type: "image"|"video"|"file", url: string, name: string, size: number}>}
 */
export async function uploadAttachment(chatId, uid, file, onProgress) {
  if (!file) throw keyedError("err_upload_failed");
  if (isBlockedExtension(file.name)) throw keyedError("err_unsupported_file");

  const category = classifyAttachment(file);
  const limit =
    category === "video" ? MAX_VIDEO_BYTES :
    category === "image" ? MAX_IMAGE_BYTES :
    MAX_FILE_BYTES;
  if (file.size > limit) throw keyedError("err_file_too_large");

  // Allowed resource types for unsigned preset
  const resourceType = category === "video" ? "video" : category === "image" ? "image" : "raw";

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", `private_vault/${uid}`);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && typeof onProgress === "function") {
        onProgress(event.loaded / event.total);
      }
    });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          const url = data.secure_url || data.url;
          if (!url) {
            reject(keyedError("err_upload_failed"));
            return;
          }
          resolve({
            type: category,
            url,
            name: file.name,
            size: file.size,
          });
        } catch {
          reject(keyedError("err_upload_failed"));
        }
      } else {
        reject(keyedError("err_upload_failed"));
      }
    };

    xhr.onerror = () => reject(keyedError("err_upload_failed"));
    xhr.send(formData);
  });
}

// ============================================================================
// PHASE 9 — Real-time: typing indicator, read receipts, infinite scroll
// ============================================================================

/**
 * Sets or clears the current user's typing flag for a chat. Also registers
 * an onDisconnect cleanup the first time a user starts typing in a chat, so
 * the flag can never get stuck "true" if the tab closes mid-type.
 * @param {string} chatId - Chat identifier.
 * @param {string} uid - Typing user's uid.
 * @param {boolean} isTyping - True while actively typing, false to clear.
 * @returns {Promise<void>}
 */
export async function setTyping(chatId, uid, isTyping) {
  const typingRef = ref(database, `chats/${chatId}/typing/${uid}`);
  if (isTyping) {
    onDisconnect(typingRef).remove().catch(() => {});
    await set(typingRef, true);
  } else {
    onDisconnect(typingRef).cancel().catch(() => {});
    await remove(typingRef);
  }
}

/**
 * Listens for which other members of a chat are currently typing.
 * @param {string} chatId - Chat identifier.
 * @param {string} currentUid - Current user's uid (excluded from the result).
 * @param {(typingUids: string[]) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function listenTyping(chatId, currentUid, callback) {
  return onValue(ref(database, `chats/${chatId}/typing`), (snapshot) => {
    const data = snapshot.val() || {};
    callback(Object.keys(data).filter((uid) => uid !== currentUid));
  });
}

/**
 * Marks a chat as read by the current user at this moment, for read-receipt
 * display ("✓✓ Seen") on the other participant's sent messages.
 * @param {string} uid - Current user's uid.
 * @param {string} chatId - Chat identifier.
 * @returns {Promise<void>}
 */
export async function markChatRead(uid, chatId) {
  await set(ref(database, `userReadStatus/${uid}/${chatId}`), serverTimestamp());
}

/**
 * Listens for another user's last-read timestamp for a specific chat, used
 * to render "Seen" on messages the current user sent to them.
 * @param {string} chatId - Chat identifier.
 * @param {string} otherUid - The other participant's uid.
 * @param {(readAt: number|null) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function listenReadStatus(chatId, otherUid, callback) {
  return onValue(ref(database, `userReadStatus/${otherUid}/${chatId}`), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
}

/**
 * Loads a page of messages strictly older than `beforeTimestamp`, for
 * infinite-scroll pagination. This is a one-time read (not a live
 * listener) — only the most recent window from listenMessages() stays
 * real-time, per the project's Realtime Database query pattern
 * (orderByChild("timestamp") + limitToLast() + endAt()).
 * @param {string} chatId - Chat identifier.
 * @param {number} beforeTimestamp - Exclusive upper bound; only messages older than this are returned.
 * @param {number} [limitCount] - Maximum number of older messages to load.
 * @returns {Promise<Array<object & {id: string}>>} Older messages, oldest-to-newest.
 */
export async function loadOlderMessages(chatId, beforeTimestamp, limitCount = 30) {
  const olderQuery = query(
    ref(database, `messages/${chatId}`),
    orderByChild("timestamp"),
    endAt(beforeTimestamp - 1),
    limitToLast(limitCount)
  );
  const snapshot = await get(olderQuery);
  if (!snapshot.exists()) return [];
  const messages = Object.entries(snapshot.val()).map(([id, data]) => ({ id, ...data }));
  messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return messages;
}

// ============================================================================
// PHASE 10 — Groups: add member, remove member, leave group
// ============================================================================
// (Group *creation* already exists from Phase 6 — see createGroupChat above.)

/**
 * Adds a member to an existing group chat. Only the group's creator may
 * add members in this version (matches the file spec: "Creator can: add
 * members, remove members").
 * @param {string} chatId - Group chat id.
 * @param {string} newMemberUid - Uid of the user to add.
 * @param {string} requesterUid - Uid of the user performing the action.
 * @returns {Promise<void>}
 */
export async function addGroupMember(chatId, newMemberUid, requesterUid) {
  const chatSnapshot = await get(ref(database, `chats/${chatId}`));
  if (!chatSnapshot.exists()) throw keyedError("err_chat_not_found");
  const chat = chatSnapshot.val();
  if (chat.type !== "group") throw keyedError("err_generic");
  if (chat.createdBy !== requesterUid) throw keyedError("err_not_group_admin");
  if (chat.memberIds && chat.memberIds[newMemberUid]) return; // already a member

  const updates = {};
  updates[`chats/${chatId}/memberIds/${newMemberUid}`] = true;
  updates[`userChats/${newMemberUid}/${chatId}`] = true;
  await update(ref(database), updates);
  await createNotification(newMemberUid, {
    type: "group_added",
    fromUid: requesterUid,
    chatId,
    titleKey: "notif_group_added_title",
    bodyKey: "notif_group_added_body",
  }).catch(() => {});
}

/**
 * Removes a member from a group chat. Only the group's creator may remove
 * other members; a member removing themselves should use leaveGroup()
 * instead (removing the creator this way is not allowed — they must
 * leave, at which point the group has no admin, matching the simple
 * admin model described in the project spec).
 * @param {string} chatId - Group chat id.
 * @param {string} memberUid - Uid of the member to remove.
 * @param {string} requesterUid - Uid of the user performing the action.
 * @returns {Promise<void>}
 */
export async function removeGroupMember(chatId, memberUid, requesterUid) {
  const chatSnapshot = await get(ref(database, `chats/${chatId}`));
  if (!chatSnapshot.exists()) throw keyedError("err_chat_not_found");
  const chat = chatSnapshot.val();
  if (chat.type !== "group") throw keyedError("err_generic");
  if (chat.createdBy !== requesterUid) throw keyedError("err_not_group_admin");
  if (memberUid === chat.createdBy) throw keyedError("err_generic");

  const updates = {};
  updates[`chats/${chatId}/memberIds/${memberUid}`] = null;
  updates[`userChats/${memberUid}/${chatId}`] = null;
  await update(ref(database), updates);
}

/**
 * Removes the current user from a group chat. Any member (including the
 * creator) may leave; the group simply continues with its remaining
 * members.
 * @param {string} chatId - Group chat id.
 * @param {string} uid - Uid of the user leaving.
 * @returns {Promise<void>}
 */
export async function leaveGroup(chatId, uid) {
  const updates = {};
  updates[`chats/${chatId}/memberIds/${uid}`] = null;
  updates[`userChats/${uid}/${chatId}`] = null;
  await update(ref(database), updates);
}

// ============================================================================
// PHASE 11 — Random stranger chat — REMOVED
// ============================================================================
// This feature has been removed from the application per project requirements.
// No stranger chat, no waiting room, no random matching.

// ============================================================================
// PHASE 12 — Safety controls, profile editing
// ============================================================================

/**
 * Blocks a user: records the block, and removes any existing friendship
 * between the two users so a blocked user no longer appears as a friend.
 * @param {string} uid - Current user's uid.
 * @param {string} blockedUid - Uid of the user being blocked.
 * @returns {Promise<void>}
 */
export async function blockUser(uid, blockedUid) {
  const updates = {};
  updates[`blockedUsers/${uid}/${blockedUid}`] = true;
  updates[`friends/${uid}/${blockedUid}`] = null;
  updates[`friends/${blockedUid}/${uid}`] = null;
  await update(ref(database), updates);
}

/**
 * Reverses a previous block.
 * @param {string} uid - Current user's uid.
 * @param {string} blockedUid - Uid of the user being unblocked.
 * @returns {Promise<void>}
 */
export async function unblockUser(uid, blockedUid) {
  await remove(ref(database, `blockedUsers/${uid}/${blockedUid}`));
}

/**
 * Checks whether the current user has blocked a given uid.
 * @param {string} uid - Current user's uid.
 * @param {string} otherUid - Uid to check.
 * @returns {Promise<boolean>}
 */
export async function isUserBlocked(uid, otherUid) {
  const snapshot = await get(ref(database, `blockedUsers/${uid}/${otherUid}`));
  return snapshot.exists();
}

/**
 * Files a structured report against a user.
 * @param {string} reporterUid - Uid of the user filing the report.
 * @param {string} reportedUid - Uid of the user being reported.
 * @param {string} reason - Free-text reason supplied by the reporter.
 * @returns {Promise<void>}
 */
export async function reportUser(reporterUid, reportedUid, reason) {
  const reportRef = push(ref(database, "reports"));
  await set(reportRef, {
    reporterUid,
    reportedUid,
    reason: (reason || "").trim(),
    createdAt: serverTimestamp(),
    status: "pending",
  });
}

/**
 * Updates the current user's display name, in both Firebase Auth and the
 * Realtime Database profile record, so the two stay in sync.
 * @param {string} uid - Current user's uid.
 * @param {string} displayName - New display name.
 * @returns {Promise<void>}
 */
export async function updateDisplayName(uid, displayName) {
  const trimmed = (displayName || "").trim();
  if (!trimmed) throw keyedError("err_display_name_required");
  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { displayName: trimmed }).catch(() => {});
  }
  await update(ref(database, `users/${uid}`), { displayName: trimmed });
}

/**
 * Updates the current user's privacy settings (whether their online
 * status and last-seen time are visible to others).
 * @param {string} uid - Current user's uid.
 * @param {{showStatus: boolean, showLastSeen: boolean}} privacy
 * @returns {Promise<void>}
 */
export async function updatePrivacySettings(uid, privacy) {
  await update(ref(database, `users/${uid}/privacy`), privacy);
}
// ============================================================================
// Notifications
// ============================================================================

/**
 * Listens to the current user's notifications in real time.
 * Returns an unsubscribe function. Never registers duplicate listeners
 * for the same path from the same call site.
 * @param {string} uid - Current user's uid.
 * @param {(notifications: Record<string, object>|null) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function listenNotifications(uid, callback) {
  const notificationsRef = ref(database, `notifications/${uid}`);
  const handler = (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  };
  onValue(notificationsRef, handler);
  return () => off(notificationsRef, "value", handler);
}

/**
 * Marks a single notification as read.
 * @param {string} uid - Current user's uid.
 * @param {string} notificationId - Notification key.
 * @returns {Promise<void>}
 */
export async function markNotificationRead(uid, notificationId) {
  await update(ref(database, `notifications/${uid}/${notificationId}`), { read: true });
}

/**
 * Marks all of the current user's notifications as read.
 * @param {string} uid - Current user's uid.
 * @returns {Promise<void>}
 */
export async function markAllNotificationsRead(uid) {
  const snapshot = await get(ref(database, `notifications/${uid}`));
  if (!snapshot.exists()) return;
  const updates = {};
  snapshot.forEach((child) => {
    updates[`notifications/${uid}/${child.key}/read`] = true;
  });
  if (Object.keys(updates).length) {
    await update(ref(database), updates);
  }
}

/**
 * Creates a notification for a target user. Callers must only invoke this
 * for legitimate app events; security rules further restrict writes.
 * @param {string} targetUid - Recipient uid.
 * @param {{type: string, fromUid: string, chatId?: string, storyId?: string, titleKey: string, bodyKey: string}} payload
 * @returns {Promise<string>} The new notification id.
 */
export async function createNotification(targetUid, payload) {
  const notifRef = push(ref(database, `notifications/${targetUid}`));
  await set(notifRef, {
    type: payload.type,
    fromUid: payload.fromUid,
    chatId: payload.chatId || null,
    storyId: payload.storyId || null,
    createdAt: serverTimestamp(),
    read: false,
    titleKey: payload.titleKey,
    bodyKey: payload.bodyKey,
  });
  return notifRef.key;
}

// ============================================================================
// Stories (24-hour, friends-oriented)
// ============================================================================

/**
 * Creates a new story for the given user. expiresAt is set to now + 24h.
 * @param {string} uid - Story owner uid.
 * @param {"image"|"video"} type - Media type.
 * @param {string} url - Cloudinary secure URL.
 * @returns {Promise<string>} New story id.
 */
export async function createStory(uid, type, url) {
  if (!uid || !url) throw keyedError("err_story_upload_failed");
  if (type !== "image" && type !== "video") throw keyedError("err_unsupported_file");
  const storyRef = push(ref(database, "stories"));
  const now = Date.now();
  await set(storyRef, {
    uid,
    type,
    url,
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
  });
  return storyRef.key;
}

/**
 * Listens for active (non-expired) stories relevant to the current user.
 * Filters client-side by expiresAt. Full friend-only filtering is enforced
 * by security rules; this listener receives stories the rules allow.
 * @param {string} uid - Current user uid (for context; rules gate access).
 * @param {(stories: Array<{id: string, uid: string, type: string, url: string, createdAt: number, expiresAt: number}>) => void} callback
 * @returns {() => void} Unsubscribe.
 */
export function listenActiveStories(uid, callback) {
  const storiesRef = ref(database, "stories");
  const handler = (snapshot) => {
    const now = Date.now();
    const list = [];
    snapshot.forEach((child) => {
      const val = child.val();
      if (!val || !val.expiresAt || val.expiresAt <= now) return;
      list.push({
        id: child.key,
        uid: val.uid,
        type: val.type,
        url: val.url,
        createdAt: val.createdAt,
        expiresAt: val.expiresAt,
      });
    });
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(list);
  };
  onValue(storiesRef, handler);
  return () => off(storiesRef, "value", handler);
}

/**
 * Listens for stories owned by a specific user (including expired ones for
 * the owner's own history UI; caller should still filter for display).
 * @param {string} ownerUid - Story owner.
 * @param {(stories: Array<object>) => void} callback
 * @returns {() => void} Unsubscribe.
 */
export function listenUserStories(ownerUid, callback) {
  const storiesRef = ref(database, "stories");
  const handler = (snapshot) => {
    const list = [];
    snapshot.forEach((child) => {
      const val = child.val();
      if (!val || val.uid !== ownerUid) return;
      list.push({
        id: child.key,
        uid: val.uid,
        type: val.type,
        url: val.url,
        createdAt: val.createdAt,
        expiresAt: val.expiresAt,
      });
    });
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(list);
  };
  onValue(storiesRef, handler);
  return () => off(storiesRef, "value", handler);
}

/**
 * Records that a user viewed a story.
 * @param {string} storyId
 * @param {string} uid
 * @returns {Promise<void>}
 */
export async function recordStoryView(storyId, uid) {
  await set(ref(database, `storyViews/${storyId}/${uid}`), {
    viewedAt: serverTimestamp(),
  });
}

/**
 * Listens to views for a story (owner-oriented).
 * @param {string} storyId
 * @param {(views: Record<string, {viewedAt: number}>|null) => void} callback
 * @returns {() => void} Unsubscribe.
 */
export function listenStoryViews(storyId, callback) {
  const viewsRef = ref(database, `storyViews/${storyId}`);
  const handler = (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  };
  onValue(viewsRef, handler);
  return () => off(viewsRef, "value", handler);
}

/**
 * Deletes a story owned by the given uid. Verifies ownership client-side;
 * rules must enforce the same.
 * @param {string} storyId
 * @param {string} uid - Requesting user (must be owner).
 * @returns {Promise<void>}
 */
export async function deleteStory(storyId, uid) {
  const snap = await get(ref(database, `stories/${storyId}`));
  if (!snap.exists()) return;
  const data = snap.val();
  if (data.uid !== uid) throw keyedError("err_permission_denied");
  await remove(ref(database, `stories/${storyId}`));
  await remove(ref(database, `storyViews/${storyId}`)).catch(() => {});
}