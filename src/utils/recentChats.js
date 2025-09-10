// ==========================================
// 2) src/utils/recentChats.js (ESM)
// ------------------------------------------
// Slaat tot MAX_RECENTS = 5 chat-stubs op per gebruiker (anonId)
// Schema: [{ id, title, lastMessageAt }]
// ==========================================
const MAX_RECENTS = 5;


function keyFor(uid) {
return `blueline.chatpilot.recents.${uid}`;
}


export function fetchRecentChats(uid) {
try {
const raw = localStorage.getItem(keyFor(uid));
const list = raw ? JSON.parse(raw) : [];
return Array.isArray(list) ? list : [];
} catch {
return [];
}
}


export function saveRecentChat(uid, stub) {
try {
const list = fetchRecentChats(uid);
const rest = list.filter((x) => x.id !== stub.id);
const next = [{ id: stub.id, title: stub.title || "Chat", lastMessageAt: stub.lastMessageAt || Date.now() }, ...rest]
.slice(0, MAX_RECENTS);
localStorage.setItem(keyFor(uid), JSON.stringify(next));
return next;
} catch {
return [];
}
}


export function deleteRecentChat(uid, chatId) {
try {
const list = fetchRecentChats(uid).filter((x) => x.id !== chatId);
localStorage.setItem(keyFor(uid), JSON.stringify(list));
return list;
} catch {
return [];
}
}