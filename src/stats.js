// 「今日の完了回数」の記録。保存形式は { date: 'YYYY-MM-DD', count: number }。

export function dateKey(date) {
  // toISOString() は UTC になり、日本時間の朝 9 時前だと前日の日付になってしまうので使わない
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayCount(stats, now) {
  return stats && stats.date === dateKey(now) ? stats.count : 0;
}

export function addCompletion(stats, now) {
  return { date: dateKey(now), count: todayCount(stats, now) + 1 };
}
