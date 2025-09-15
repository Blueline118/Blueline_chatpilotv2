// src/utils/acl.js
export function isOwnerOrAdmin({ row, userId, role }) {
  if (!row || !userId) return false;
  if (row.owner_id === userId) return true;
  return String(role).toUpperCase() === 'ADMIN';
}
