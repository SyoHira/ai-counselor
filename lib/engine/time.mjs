// JST の日付・時刻ユーティリティ
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });

export function jstDate(date = new Date()) {
  return fmt.format(date); // YYYY-MM-DD
}

export function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setTime(d.getTime() + days * 86400000);
  return jstDate(d);
}

export function jstDateTime(ymd, hhmm) {
  return new Date(`${ymd}T${hhmm}:00+09:00`);
}
