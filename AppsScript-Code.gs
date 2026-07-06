/**
 * کارتابل زائرین - بک‌اند Google Apps Script
 * -------------------------------------------------
 * این فایل را داخل گوگل شیت خودتان قرار می‌دهید:
 * گوگل شیت را باز کنید > Extensions (پسوندها) > Apps Script
 * محتوای این فایل را در Code.gs جای‌گذاری کنید (فایل پیش‌فرض را پاک و این را بچسبانید)
 * سپس بخش CONFIG زیر را با اطلاعات خودتان پر کنید.
 */

const CONFIG = {
  // شناسه گوگل‌شیت (از آدرس شیت، بین d/ و /edit)
  SHEET_ID: '1-DTZ3tMZLkcm8PIfYUQ02nRxxWhLKordo4RNt7v2PKk',

  // نام برگه (Tab) داخل گوگل‌شیت که اطلاعات زائرین در آن است
  SHEET_NAME: 'Pilgrims',

  // شناسه پوشه‌های گوگل‌درایو (این پوشه‌ها نیازی نیست Public/Anyone باشند - خصوصی بمانند بهتر است)
  VISA_FOLDER_ID: '1hZzvnmsYz8DaLuwMuB0ouKhuVd_TC5PT',
  PASSPORT_FOLDER_ID: '16IBy7R42f2GqcKHXbi0TL0lGIQ8lws3B',
  PHOTO_FOLDER_ID: '11uLnnxB1_rrG3xzKo-Fesw9ZJQHjh9Z-',

  // یوزر مدیر
  ADMIN_CODE: '26035',
  ADMIN_PASS: '26035',

  // مدت اعتبار نشست ورود (ساعت)
  SESSION_HOURS: 6,

  // اطلاعات هتل‌ها
  HOTELS: {
    madinah: {
      name: 'هتل مدینه (نام واقعی را اینجا بنویسید)',
      // برای گرفتن لینک embed نقشه: گوگل مپ > اشتراک‌گذاری > جاسازی نقشه > کپی src
      mapEmbed: 'https://www.google.com/maps/embed?pb=PASTE_MADINAH_MAP_EMBED_SRC',
      photosFolderId: 'PASTE_MADINAH_PHOTOS_FOLDER_ID_HERE'
    },
    makkah: {
      name: 'هتل مکه (نام واقعی را اینجا بنویسید)',
      mapEmbed: 'https://www.google.com/maps/embed?pb=PASTE_MAKKAH_MAP_EMBED_SRC',
      photosFolderId: 'PASTE_MAKKAH_PHOTOS_FOLDER_ID_HERE'
    }
  }
};

/* =========================================================
   ورودی اصلی وب‌اپ
   ========================================================= */
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'file' || action === 'hotelImage') {
      return handleFileRequest(e);
    }
    return jsonOut(routeJson(e));
  } catch (err) {
    return jsonOut({ ok: false, message: 'خطا: ' + err.message });
  }
}

function routeJson(e) {
  const action = e.parameter.action;
  switch (action) {
    case 'login': return handleLogin(e);
    case 'room': return handleRoom(e);
    case 'rooms': return handleRoomsList(e);
    case 'buses': return handleBusesList(e);
    case 'bus': return handleBus(e);
    case 'hotelInfo': return handleHotelInfo(e);
    default: return { ok: false, message: 'درخواست نامعتبر است' };
  }
}

/* =========================================================
   ابزارهای عمومی
   ========================================================= */
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function textErrorBlob(msg) {
  return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
}

function getSheetRows() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('sheet_rows_cache');
  if (cached) return JSON.parse(cached);

  const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  values.shift(); // حذف سطر عنوان (هدر)
  // ترتیب ستون‌ها: کدزائر, نام, نام‌خانوادگی, کدملی, تاریخ‌تولد, مدرک‌تحصیلی, شهرمحل‌تولد,
  //                موبایل, اتوبوس‌مکه, شماره‌اتاق‌مکه, اتوبوس‌مدینه, شماره‌اتاق‌مدینه, ...
  const rows = values
    .filter(r => r[0] !== '' && r[0] !== null && r[0] !== undefined)
    .map(r => ({
      code: String(r[0]).trim(),
      firstName: r[1] || '',
      lastName: r[2] || '',
      nationalCode: String(r[3]).trim(),
      birthDate: r[4] || '',
      education: r[5] || '',
      birthCity: r[6] || '',
      mobile: r[7] || '',
      busMakkah: String(r[8] || '').trim(),
      makkahRoom: String(r[9] || '').trim(),
      busMadinah: String(r[10] || '').trim(),
      madinahRoom: String(r[11] || '').trim(),
      passportNumber: r[12] || '',
      marja: r[13] || '',
      job: r[14] || '',
      veteran: r[15] || '',
      notes: r[16] || ''
    }));

  try {
    cache.put('sheet_rows_cache', JSON.stringify(rows), 300); // ۵ دقیقه کش می‌شود
  } catch (err) {
    // اگر داده خیلی بزرگ بود و در کش جا نشد، مشکلی نیست، فقط کش نمی‌شود
  }
  return rows;
}

function makeToken(payload) {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(payload), CONFIG.SESSION_HOURS * 3600);
  return token;
}

function getSession(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('sess_' + token);
  return raw ? JSON.parse(raw) : null;
}

function requireSession(e) {
  const session = getSession(e.parameter.token);
  if (!session) throw new Error('نشست شما نامعتبر یا منقضی شده - دوباره وارد شوید');
  return session;
}

/* =========================================================
   ورود (لاگین)
   ========================================================= */
function handleLogin(e) {
  const code = (e.parameter.code || '').trim();
  const national = (e.parameter.national || '').trim();
  if (!code || !national) return { ok: false, message: 'کد زائر و کد ملی را وارد کنید' };

  if (code === CONFIG.ADMIN_CODE && national === CONFIG.ADMIN_PASS) {
    const token = makeToken({ role: 'admin', code: code });
    return { ok: true, role: 'admin', token: token };
  }

  const rows = getSheetRows();
  const person = rows.find(p => p.code === code && p.nationalCode === national);
  if (!person) return { ok: false, message: 'کد زائر یا کد ملی اشتباه است' };

  const token = makeToken({ role: 'pilgrim', code: person.code });
  return { ok: true, role: 'pilgrim', token: token, data: person };
}

/* =========================================================
   فایل‌ها (ویزا / گذرنامه / عکس) - از گوگل‌درایو خصوصی سرو می‌شود
   ========================================================= */
function handleFileRequest(e) {
  const action = e.parameter.action;
  const session = getSession(e.parameter.token);
  if (!session) return textErrorBlob('نشست شما منقضی شده. دوباره وارد شوید.');

  if (action === 'hotelImage') return handleHotelImage(e);

  const type = e.parameter.type; // visa | passport | photo
  let code = (e.parameter.code || '').trim();

  // زائر عادی فقط مدارک خودش را می‌بیند؛ عکسِ هم‌اتاقی‌ها استثناست (کمتر حساس است)
  if (session.role === 'pilgrim' && (type === 'visa' || type === 'passport')) {
    code = session.code;
  }

  let folderId;
  if (type === 'visa') folderId = CONFIG.VISA_FOLDER_ID;
  else if (type === 'passport') folderId = CONFIG.PASSPORT_FOLDER_ID;
  else if (type === 'photo') folderId = CONFIG.PHOTO_FOLDER_ID;
  else return textErrorBlob('نوع فایل نامعتبر است');

  const file = findFileByCode(folderId, code);
  if (!file) return textErrorBlob('فایلی برای این کد زائر یافت نشد');
  return file.getBlob();
}

function findFileByCode(folderId, code) {
  const folder = DriveApp.getFolderById(folderId);
  const exts = ['pdf', 'PDF', 'jpg', 'jpeg', 'JPG', 'JPEG', 'png', 'PNG'];
  for (const ext of exts) {
    const it = folder.getFilesByName(code + '.' + ext);
    if (it.hasNext()) return it.next();
  }
  return null;
}

/* =========================================================
   اتاق‌ها (مدینه / مکه)
   ========================================================= */
function handleRoom(e) {
  const session = requireSession(e);
  const city = e.parameter.city; // madinah | makkah
  const roomField = city === 'madinah' ? 'madinahRoom' : 'makkahRoom';
  const rows = getSheetRows();

  let room = e.parameter.room;
  if (session.role === 'pilgrim') {
    const me = rows.find(p => p.code === session.code);
    if (!me) return { ok: false, message: 'اطلاعات شما یافت نشد' };
    room = me[roomField];
    if (!room) return { ok: false, message: 'شماره اتاق برای شما هنوز ثبت نشده است' };
  }
  if (!room) return { ok: false, message: 'شماره اتاق مشخص نشده است' };

  const mates = rows
    .filter(p => p[roomField] === String(room))
    .map(p => ({ code: p.code, firstName: p.firstName, lastName: p.lastName, mobile: p.mobile, education: p.education }));

  return { ok: true, room: room, people: mates };
}

function handleRoomsList(e) {
  requireSession(e);
  const city = e.parameter.city;
  const roomField = city === 'madinah' ? 'madinahRoom' : 'makkahRoom';
  const rows = getSheetRows();
  const rooms = [...new Set(rows.map(p => p[roomField]).filter(Boolean))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  return { ok: true, rooms: rooms };
}

/* =========================================================
   اتوبوس‌ها (مکه و مدینه جدا از هم)
   ========================================================= */
function handleBusesList(e) {
  requireSession(e);
  const city = e.parameter.city; // madinah | makkah
  const busField = city === 'madinah' ? 'busMadinah' : 'busMakkah';
  const rows = getSheetRows();
  const buses = [...new Set(rows.map(p => p[busField]).filter(Boolean))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  return { ok: true, buses: buses };
}

function handleBus(e) {
  requireSession(e);
  const city = e.parameter.city;
  const bus = e.parameter.bus;
  if (!bus) return { ok: false, message: 'شماره اتوبوس مشخص نشده است' };
  const busField = city === 'madinah' ? 'busMadinah' : 'busMakkah';
  const roomField = city === 'madinah' ? 'madinahRoom' : 'makkahRoom';
  const rows = getSheetRows();
  const people = rows
    .filter(p => p[busField] === String(bus))
    .map(p => ({ firstName: p.firstName, lastName: p.lastName, room: p[roomField] }));
  return { ok: true, bus: bus, people: people };
}

/* =========================================================
   اطلاعات هتل
   ========================================================= */
function handleHotelInfo(e) {
  requireSession(e);
  const city = e.parameter.city;
  const hotel = CONFIG.HOTELS[city];
  if (!hotel) return { ok: false, message: 'شهر نامعتبر است' };

  let photoCount = 0;
  try {
    const folder = DriveApp.getFolderById(hotel.photosFolderId);
    const files = folder.getFiles();
    while (files.hasNext()) { files.next(); photoCount++; }
  } catch (err) {
    // اگر شناسه پوشه هنوز ست نشده، فقط 0 برمی‌گردد
  }
  return { ok: true, name: hotel.name, mapEmbed: hotel.mapEmbed, photoCount: photoCount };
}

function handleHotelImage(e) {
  const city = e.parameter.city;
  const index = parseInt(e.parameter.index || '0', 10);
  const hotel = CONFIG.HOTELS[city];
  if (!hotel) return textErrorBlob('شهر نامعتبر است');
  const folder = DriveApp.getFolderById(hotel.photosFolderId);
  const files = folder.getFiles();
  let i = 0;
  while (files.hasNext()) {
    const f = files.next();
    if (i === index) return f.getBlob();
    i++;
  }
  return textErrorBlob('تصویر یافت نشد');
}
