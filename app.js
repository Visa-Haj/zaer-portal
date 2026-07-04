const SESSION_KEY = 'zaer_session_v1';

function saveSession(obj) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj)); }
function getSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); }
function logout() { clearSession(); location.href = 'index.html'; }

function requireSession() {
  const s = getSession();
  if (!s) { location.href = 'index.html'; throw new Error('no-session'); }
  return s;
}
function requireAdmin() {
  const s = requireSession();
  if (s.role !== 'admin') { location.href = 'dashboard.html'; throw new Error('not-admin'); }
  return s;
}
function redirectIfAdmin() {
  const s = getSession();
  if (s && s.role === 'admin') location.href = 'admin.html';
}

async function api(action, params) {
  const s = getSession();
  const usp = new URLSearchParams(Object.assign({ action }, params || {}));
  if (s && s.token) usp.set('token', s.token);
  const res = await fetch(`${CONFIG.SCRIPT_URL}?${usp.toString()}`);
  return res.json();
}

function fileUrl(type, code) {
  const s = getSession();
  const usp = new URLSearchParams({ action: 'file', type, code, token: (s && s.token) || '' });
  return `${CONFIG.SCRIPT_URL}?${usp.toString()}`;
}

function hotelImageUrl(city, index) {
  const s = getSession();
  const usp = new URLSearchParams({ action: 'hotelImage', city, index: String(index), token: (s && s.token) || '' });
  return `${CONFIG.SCRIPT_URL}?${usp.toString()}`;
}

async function downloadFile(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    if (blob.type.indexOf('text/plain') === 0) {
      alert(await blob.text());
      return;
    }
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  } catch (e) {
    alert('دانلود فایل با خطا مواجه شد');
  }
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.add('show');
}
function hideError(el) {
  el.classList.remove('show');
  el.textContent = '';
}

function personCardHtml(p) {
  return `
    <div class="person-card">
      <img class="avatar" src="${fileUrl('photo', p.code)}" onerror="this.style.visibility='hidden'" alt="عکس ${p.firstName}">
      <div class="name">${p.firstName} ${p.lastName}</div>
      <div class="meta">
        کد زائر: ${p.code}<br>
        موبایل: ${p.mobile || '—'}<br>
        تحصیلات: ${p.education || '—'}
      </div>
    </div>`;
}
