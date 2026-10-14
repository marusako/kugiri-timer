package io.github.marusako.kugiritimer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import java.util.Objects;

// 曲を選んでいる間だけ動く、フォアグラウンドサービス (通知を出す代わりに、裏にあるときも Android に止められにくくなる仕組み)。
// - 音楽アプリと同じ形の曲の通知 (曲名・前へ・▶ / ⏸・次へ) を出し、ロック画面にも出す (MediaSession)
// - 流している間は、画面を消しても端末の処理を止めない (ウェイクロック)。曲の終わりで次の曲に進めるように
// - タイマーが動いていれば、曲名の下の行に、今の区切りの名前と残り時間を出す (TimerNotice.label。1 秒ごとに書きかえる)
// 曲は画面 (WebView) の audio が鳴らす。ここは知らせと、ボタンを画面に伝える (LockScreen.sendAction) だけ
public class NowPlayingService extends Service {
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_PLAYING = "playing";
    private static final String ACTION_PLAY = "io.github.marusako.kugiritimer.PLAY";
    private static final String ACTION_PAUSE = "io.github.marusako.kugiritimer.PAUSE";
    private static final String ACTION_NEXT = "io.github.marusako.kugiritimer.NEXT";
    private static final String ACTION_PREVIOUS = "io.github.marusako.kugiritimer.PREVIOUS";
    private static final String CHANNEL = "now-playing";
    private static final int NOTIFICATION_ID = 7302;
    // 1 曲がどれだけ長くても、ウェイクロックを持ち続けないための上限 (再生中は、書きかえのたびに取り直す)
    private static final long WAKE_LOCK_MS = 60 * 60 * 1000;

    private static NowPlayingService instance;
    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private String title = "";
    private boolean playing;
    private String timerText;
    private boolean foreground;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            String text = TimerNotice.label(NowPlayingService.this, System.currentTimeMillis());
            if (!Objects.equals(text, timerText)) {
                timerText = text;
                publish();
            }
            handler.postDelayed(this, 1000);
        }
    };

    static boolean isRunning() {
        return instance != null;
    }

    static void update(String title, boolean playing) {
        if (instance != null) instance.apply(title, playing);
    }

    static void stop() {
        if (instance != null) instance.stopSelf();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        session = new MediaSession(this, "Focusr");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { LockScreen.sendAction("play"); }
            @Override public void onPause() { LockScreen.sendAction("pause"); }
            @Override public void onSkipToNext() { LockScreen.sendAction("next"); }
            @Override public void onSkipToPrevious() { LockScreen.sendAction("previous"); }
        });
        session.setActive(true);
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Focusr:now-playing");
        wakeLock.setReferenceCounted(false);
        // タイマーの別の通知は、曲の通知に残り時間を出す間は消す
        TimerNotice.show(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_PLAY.equals(action)) LockScreen.sendAction("play");
        else if (ACTION_PAUSE.equals(action)) LockScreen.sendAction("pause");
        else if (ACTION_NEXT.equals(action)) LockScreen.sendAction("next");
        else if (ACTION_PREVIOUS.equals(action)) LockScreen.sendAction("previous");
        String nextTitle = intent == null ? null : intent.getStringExtra(EXTRA_TITLE);
        boolean nextPlaying = intent != null && intent.hasExtra(EXTRA_PLAYING) ? intent.getBooleanExtra(EXTRA_PLAYING, false) : playing;
        // 始めた直後は、5 秒以内に通知を出してフォアグラウンドにする決まりがある
        apply(nextTitle != null ? nextTitle : title, nextPlaying);
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_NOT_STICKY;
    }

    // アプリを最近使ったアプリの一覧から閉じたら、曲も止まるので終わる
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
    }

    @Override
    public void onDestroy() {
        instance = null;
        handler.removeCallbacks(tick);
        // 曲の通知がなくなるので、タイマーの残り時間は別の通知に戻す
        TimerNotice.show(this);
        if (wakeLock.isHeld()) wakeLock.release();
        session.setActive(false);
        session.release();
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void apply(String title, boolean playing) {
        this.title = title;
        this.playing = playing;
        if (playing) wakeLock.acquire(WAKE_LOCK_MS);
        else if (wakeLock.isHeld()) wakeLock.release();
        publish();
    }

    // 曲名・タイマーの残り時間・流しているかを、MediaSession (ロック画面) と通知に出す
    private void publish() {
        MediaMetadata.Builder metadata = new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title);
        // 曲名の下の行。空にすると、端末によっては「null」と出るので、タイマーの様子がなければアプリの名前にする
        metadata.putString(MediaMetadata.METADATA_KEY_ARTIST, timerText != null ? timerText : "Focusr");
        session.setMetadata(metadata.build());
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
            .build());
        Notification notification = buildNotification();
        if (foreground) {
            getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            foreground = true;
        } else {
            startForeground(NOTIFICATION_ID, notification);
            foreground = true;
        }
    }

    private Notification buildNotification() {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Now playing", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
            builder = new Notification.Builder(this, CHANNEL);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
            .setSmallIcon(R.drawable.ic_launcher_kugiri)
            .setContentTitle(title)
            .setContentText(timerText)
            .setContentIntent(TimerNotice.openApp(this))
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(playing)
            .setShowWhen(false)
            .addAction(action(android.R.drawable.ic_media_previous, "Previous", ACTION_PREVIOUS, 1))
            .addAction(playing
                ? action(android.R.drawable.ic_media_pause, "Pause", ACTION_PAUSE, 2)
                : action(android.R.drawable.ic_media_play, "Play", ACTION_PLAY, 3))
            .addAction(action(android.R.drawable.ic_media_next, "Next", ACTION_NEXT, 4))
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2))
            .build();
    }

    private Notification.Action action(int icon, String label, String intentAction, int requestCode) {
        Intent intent = new Intent(this, NowPlayingService.class).setAction(intentAction);
        PendingIntent pending = PendingIntent.getService(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // 記号は Android に最初からあるもの (通知を描く側が読めるように、"android" の部品として渡す)
        return new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource("android", icon), label, pending).build();
    }
}
