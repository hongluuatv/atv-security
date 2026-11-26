// Firebase Web App configuration (public client identifiers only).
// Replace empty fields with values from Firebase Console > Project settings > Your apps.
// Never add service account JSON, private keys, OAuth client secrets or admin credentials.
window.ATV_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAuaHBSzy3z5YsXYAY1eNkKNjIDsoIU9k4",
  authDomain: "atv-security.firebaseapp.com",
  projectId: "atv-security",
  storageBucket: "atv-security.firebasestorage.app",
  messagingSenderId: "1052413121450",
  appId: "1:1052413121450:web:784f2a3d288e64867c91d3"
};
// UI-only access filter, NOT a server-side authorization boundary.
// Replace with confirmed Google Workspace domain(s) or explicitly allowed emails.
window.ATV_AUTH_POLICY = {
  allowedDomains: ["arrow-tech.vn"],
  allowedEmails: [],
  allowAnyVerifiedGoogleAccount: false
};
