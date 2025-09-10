// ==========================================
// 1) src/utils/anonId.js (ESM)
// ==========================================
const LS_KEY = "blueline.chatpilot.anon.v1";


export function getAnonId() {
try {
let id = localStorage.getItem(LS_KEY);
if (!id) {
id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
localStorage.setItem(LS_KEY, id);
}
return id;
} catch {
// Geen localStorage (SSR/safari in private). Val terug op sessie-UUID in memory
return (globalThis.__CHATPILOT_UID__ ||= (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)));
}
}