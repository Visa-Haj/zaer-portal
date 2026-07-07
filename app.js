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

async function fetchFileData(params) {
  return api('file', params);
}
async function fetchHotelImageData(city, index) {
  return api('hotelImage', { city, index });
}
function toDataUrl(result) {
  return `data:${result.mimeType};base64,${result.base64}`;
}

function base64ToBlobUrl(base64, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
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
      <div class="person-card-row">
        ${avatarOrFallbackHtml(p.code, 'md')}
        <div class="person-card-info">
          <div class="name">${p.firstName} ${p.lastName}</div>
          <div class="meta">
            کد زائر: ${p.code}<br>
            شماره موبایل: ${formatMobile(p.mobile)}<br>
            محل تولد: ${p.birthCity || '—'}<br>
            تاریخ تولد: ${p.birthDate || '—'}<br>
            تحصیلات: ${p.education || '—'}
          </div>
        </div>
      </div>
    </div>`;
}

function formatMobile(m) {
  if (!m) return '—';
  let s = String(m).trim();
  if (s && !s.startsWith('0')) s = '0' + s;
  return s;
}

function avatarOrFallbackHtml(code, size) {
  const id = 'ph_' + code + '_' + Math.random().toString(36).slice(2, 7);
  loadAvatarAsync(id, code, size);
  const sizeClass = size === 'lg' ? 'avatar-fallback avatar-lg' : (size === 'md' ? 'avatar-fallback avatar-md' : 'avatar-fallback');
  return `<div class="${sizeClass}" id="${id}">👤</div>`;
}

async function loadAvatarAsync(id, code, size) {
  try {
    const result = await fetchFileData({ type: 'photo', code });
    const el = document.getElementById(id);
    if (result && result.ok && el) {
      const url = base64ToBlobUrl(result.base64, result.mimeType);
      const img = document.createElement('img');
      img.className = size === 'lg' ? 'avatar avatar-lg' : (size === 'md' ? 'avatar avatar-md' : 'avatar');
      img.alt = 'عکس زائر';
      img.src = url;
      img.style.cursor = 'zoom-in';
      img.onclick = () => openImageFullscreen(url);
      el.replaceWith(img);
    }
  } catch (e) {
    // در صورت خطا، همان آیکون جایگزین باقی می‌ماند
  }
}

function openImageFullscreen(src) {
  const overlay = document.createElement('div');
  overlay.className = 'fullscreen-overlay';
  overlay.innerHTML = `<img src="${src}" alt="نمایش کامل عکس">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

/* ---------------- تاریخ شمسی و قمری ---------------- */
function gregorianToJD(y, m, d) {
  return Math.floor((1461 * (y + 4800 + Math.floor((m - 14) / 12))) / 4) +
         Math.floor((367 * (m - 2 - 12 * Math.floor((m - 14) / 12))) / 12) -
         Math.floor((3 * Math.floor((y + 4900 + Math.floor((m - 14) / 12)) / 100)) / 4) +
         d - 32075;
}

function toJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) +
             Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + (33 * Math.floor(days / 12053));
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm, jd;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return { jy, jm, jd };
}

function toHijri(gy, gm, gd) {
  // این عدد رو اگه تاریخ قمری هنوز جلو/عقبه، تغییر بده (هر واحد = ۱ روز)
  const HIJRI_ADJUSTMENT_DAYS = -2;
  let jd = gregorianToJD(gy, gm, gd) + HIJRI_ADJUSTMENT_DAYS;
  jd = jd - 1948440 + 10632;
  const n = Math.floor((jd - 1) / 10631);
  jd = jd - 10631 * n + 354;
  const j = Math.floor((10985 - jd) / 5316) * Math.floor((50 * jd) / 17719) +
            Math.floor(jd / 5670) * Math.floor((43 * jd) / 15238);
  jd = jd - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
       Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const im = Math.floor((24 * jd) / 709);
  const id = jd - Math.floor((709 * im) / 24);
  const iy = 30 * n + j - 30;
  return { hy: iy, hm: im, hd: id };
}

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const HIJRI_MONTHS = ['محرم', 'صفر', 'ربیع‌الاول', 'ربیع‌الثانی', 'جمادی‌الاول', 'جمادی‌الثانی', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذی‌القعده', 'ذی‌الحجه'];

function todayDatesHtml() {
  const now = new Date();
  const gy = now.getFullYear(), gm = now.getMonth() + 1, gd = now.getDate();
  const j = toJalali(gy, gm, gd);
  const h = toHijri(gy, gm, gd);
  const jalaliText = `${j.jd} ${JALALI_MONTHS[j.jm - 1]} ماه ${j.jy}`;
  const hijriText = `${h.hd} ${HIJRI_MONTHS[h.hm - 1]} ${h.hy}`;
  return `<span>📅 ${jalaliText}</span><span>🌙 ${hijriText} (قمری، تقریبی)</span>`;
}
