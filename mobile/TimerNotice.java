package io.github.marusako.kugiritimer;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;

// ロック画面のタイマーの通知 (残り時間がその場で減っていく。Android の chronometer のカウントダウン)。
// 区切り ({ title, endAt } の並び) を端末に保存しておき、今の区切りの通知を出して、終わる時刻に TimerNoticeReceiver を
// 起こす (正確なアラーム)。起きたら次の区切りに切り替える。画面を消して画面の処理が止まっていても、続けて出せるように。
// 曲の通知 (NowPlayingService) が出ている間は、残り時間をそちらの曲名の下の行に出すので (label)、この通知は出さない
final class TimerNotice {
    private static final String PREFS = "lock-screen";
    private static final String KEY_SEGMENTS = "segments";
    private static final String KEY_IDLE = "idle";
    private static final String CHANNEL = "timer-progress";
    private static final int NOTIFICATION_ID = 7301;
    // 終わる時刻ちょうどに起きたとき、終わったばかりの区切りを出さないための余裕 (ms)
    private static final long SETTLE_MS = 500;

    private TimerNotice() {}

    // idle は、区切りがない (タイマーが止まっている) ときに曲の通知に出す文。なければ null
    static void save(Context context, String segmentsJson, String idle) {
        prefs(context).edit().putString(KEY_SEGMENTS, segmentsJson).putString(KEY_IDLE, idle).apply();
    }

    // 今の区切りの通知を出し、次に切り替える時刻のアラームを置く。区切りが残っていなければ、通知を消す
    static void show(Context context) {
        long now = System.currentTimeMillis();
        JSONObject segment = currentSegment(context, now);
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent wake = PendingIntent.getBroadcast(
            context, 0, new Intent(context, TimerNoticeReceiver.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        if (segment == null) {
            alarms.cancel(wake);
            NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
            return;
        }
        long endAt = segment.optLong("endAt");
        if (NowPlayingService.isRunning()) {
            NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
            return;
        }
        createChannel(context);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_kugiri)
            .setContentTitle(segment.optString("title"))
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setWhen(endAt)
            .setShowWhen(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openApp(context))
            // 次のアラームが遅れても、0 を過ぎた (マイナスの) 時間を出し続けないように
            .setTimeoutAfter(endAt - now + 60_000);
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            // 通知の許可がない (Android 13 以降で、利用者が許可しなかった)
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarms.canScheduleExactAlarms()) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, wake);
        } else {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, wake);
        }
    }

    // 曲の通知に出す、今の区切りの名前と残り時間 (「作業 · 12:34」。アプリのタイマーと同じく、分は 60 を超えても分で数える)。
    // 区切りがなければ、止まっているときの文 (idle)。それもなければ null
    static String label(Context context, long now) {
        JSONObject segment = currentSegment(context, now);
        if (segment == null) return prefs(context).getString(KEY_IDLE, null);
        long seconds = (segment.optLong("endAt") - now + 999) / 1000;
        return String.format(java.util.Locale.ROOT, "%s · %02d:%02d", segment.optString("title"), seconds / 60, seconds % 60);
    }

    // 終わる時刻がまだ来ていない、最初の区切り。なければ null
    private static JSONObject currentSegment(Context context, long now) {
        try {
            JSONArray segments = new JSONArray(prefs(context).getString(KEY_SEGMENTS, "[]"));
            for (int i = 0; i < segments.length(); i++) {
                JSONObject segment = segments.getJSONObject(i);
                if (segment.optLong("endAt") > now + SETTLE_MS) return segment;
            }
        } catch (Exception e) {
            // 保存した中身が読めなければ、出さない
        }
        return null;
    }

    static PendingIntent openApp(Context context) {
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Timer", NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
