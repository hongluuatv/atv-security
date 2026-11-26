// Firebase Authentication: Google popup, session persistence, verified-email UI filter.
// The static portal itself is public code; this is not server-side access control.
const screen = document.getElementById("authScreen");
const shell = document.getElementById("portalShell");
const login = document.getElementById("googleLogin");
const logout = document.getElementById("logoutBtn");
const status = document.getElementById("authMessage");
const email = document.getElementById("authEmail");
const config = window.ATV_FIREBASE_CONFIG || {};
const policy = window.ATV_AUTH_POLICY || {};
let auth, signOut, busy = false, ready = false;
function message(text, error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}
function closePortal() {
  shell.hidden = true;
  screen.hidden = false;
  email.textContent = "";
  window.ATV_PORTAL_SESSION.close();
}
function allowed(user) {
  if (!user || !user.emailVerified || !user.email ||
      !user.providerData.some(p => p.providerId === "google.com")) return false;
  const address = user.email.toLowerCase().trim();
  const domain = address.split("@").pop();
  const emails = Array.isArray(policy.allowedEmails) ? policy.allowedEmails : [];
  const domains = Array.isArray(policy.allowedDomains) ? policy.allowedDomains : [];
  return policy.allowAnyVerifiedGoogleAccount === true ||
    emails.some(x => String(x).trim().toLowerCase() === address) ||
    domains.some(x => String(x).trim().toLowerCase() === domain);
}
function errorText(err) {
  const errors = {
    "auth/popup-closed-by-user": "Bạn đã đóng cửa sổ đăng nhập. Hãy thử lại.",
    "auth/popup-blocked": "Trình duyệt chặn cửa sổ Google. Hãy cho phép popup rồi thử lại.",
    "auth/unauthorized-domain": "Tên miền website chưa được cấp phép trong Firebase Authentication.",
    "auth/operation-not-allowed": "Google sign-in chưa được bật trong Firebase.",
    "auth/network-request-failed": "Không kết nối được Firebase. Kiểm tra mạng rồi thử lại.",
    "auth/invalid-api-key": "API key Firebase chưa hợp lệ.",
    "auth/account-exists-with-different-credential": "Tài khoản đã tồn tại với phương thức xác thực khác. Liên hệ quản trị viên."
  };
  return errors[err?.code] || "Không thể hoàn tất xác thực. Liên hệ quản trị viên hoặc thử lại.";
}
async function boot() {
  closePortal();
  if (!["apiKey","authDomain","projectId","appId"].every(k => typeof config[k] === "string" && config[k].trim())) {
    message("Firebase chưa được cấu hình. Quản trị viên cần điền Web App configuration trong firebase-config.js.", true);
    return;
  }
  try {
    const [appSDK, authSDK] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")
    ]);
    const app = appSDK.initializeApp(config);
    auth = authSDK.getAuth(app);
    signOut = authSDK.signOut;
    await authSDK.setPersistence(auth, authSDK.browserSessionPersistence);
    const provider = new authSDK.GoogleAuthProvider();
    provider.setCustomParameters({prompt: "select_account"});
    ready = true;
    let denied = false;
    authSDK.onAuthStateChanged(auth, async user => {
      if (!user) {
        closePortal();
        login.disabled = busy || !ready;
        if (!denied && !busy) message("Chọn tài khoản Google công việc.");
        return;
      }
      if (!allowed(user)) {
        denied = true;
        closePortal();
        message("Tài khoản chưa được phép sử dụng cổng học tập. Hãy dùng email công việc được cấp quyền.", true);
        try { await signOut(auth); } catch { message("Không thể đăng xuất tài khoản bị từ chối. Hãy tải lại trang.", true); }
        return;
      }
      denied = false;
      email.textContent = user.email;
      try {
        window.ATV_PORTAL_SESSION.open(user);
        screen.hidden = true;
        shell.hidden = false;
      } catch {
        closePortal();
        message("Không thể khởi tạo nội dung học tập. Liên hệ quản trị viên.", true);
        try { await signOut(auth); } catch {}
      }
    }, () => { closePortal(); message("Lỗi kiểm tra phiên xác thực.", true); login.disabled = true; });
    login.addEventListener("click", async () => {
      if (busy || !ready) return;
      denied = false;
      busy = true; login.disabled = true;
      message("Đang mở cửa sổ đăng nhập Google…");
      try { await authSDK.signInWithPopup(auth, provider); }
      catch (err) { message(errorText(err), true); }
      finally { busy = false; login.disabled = !ready; }
    });
    logout.addEventListener("click", async () => {
      logout.disabled = true;
      try { await signOut(auth); closePortal(); message("Đã đăng xuất."); }
      catch { alert("Không thể đăng xuất. Vui lòng thử lại."); }
      finally { logout.disabled = false; }
    });
  } catch (err) {
    closePortal();
    message(errorText(err), true);
  }
}
boot();
