// ==========================================
// 3) src/utils/threadStore.js (ESM)
// ------------------------------------------
// Slaat de volledige conversatie op per chatId + uid
// API: appendToThread, getThread, deleteThread
// ==========================================
function threadKey(uid, chatId) {
return `blueline.chatpilot.thread.${uid}.${chatId}`;
}


export function getThread(uid, chatId) {
try {
const raw = localStorage.getItem(threadKey(uid, chatId));
const arr = raw ? JSON.parse(raw) : [];
return Array.isArray(arr) ? arr : [];
} catch {
return [];
}
}


export function appendToThread(uid, chatId, message) {
try {
const cur = getThread(uid, chatId);
const next = [...cur, message];
localStorage.setItem(threadKey(uid, chatId), JSON.stringify(next));
return next;
} catch {
return [];
}
}


export function deleteThread(uid, chatId) {
try {
localStorage.removeItem(threadKey(uid, chatId));
} catch {}
}