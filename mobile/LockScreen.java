package io.github.marusako.kugiritimer;

import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// ロック画面 (と通知の一覧) に、タイマーの残り時間と、流している曲を出す、このアプリだけの部品
// (画面からは Capacitor.Plugins.LockScreen で呼ぶ。src/renderer.js の syncLockScreen)。
// Android の画面 (WebView) は Media Session に対応していないので、Java で作る。
// - setTimer: タイマーの区切り ({ title, endAt } の並び) を受け取り、残り時間がその場で減っていく通知を出す (TimerNotice)
// - setTrack: 曲名と、流しているか。曲を選んでいる間は、フォアグラウンドサービス (NowPlayingService) で曲の通知を出し、
//   裏にあるときや画面を消したときも、Android にアプリを止められにくくする
// - ロック画面や通知の ▶・前へ・次へ は、画面に mediaAction ({ action: 'play' | 'pause' | 'next' | 'previous' }) で知らせる
@CapacitorPlugin(name = "LockScreen")
public class LockScreen extends Plugin {
    private static LockScreen instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void setTimer(PluginCall call) {
        JSArray segments = call.getArray("segments", new JSArray());
        TimerNotice.save(getContext(), segments.toString());
        TimerNotice.show(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setTrack(PluginCall call) {
        Context context = getContext();
        String title = call.getString("title");
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        if (title == null || title.isEmpty()) {
            NowPlayingService.stop();
        } else if (NowPlayingService.isRunning()) {
            NowPlayingService.update(title, playing);
        } else {
            // 曲を選んだとき (アプリを開いているとき) に始める。動き出したら、あとは update で書きかえる
            Intent intent = new Intent(context, NowPlayingService.class)
                .putExtra(NowPlayingService.EXTRA_TITLE, title)
                .putExtra(NowPlayingService.EXTRA_PLAYING, playing);
            try {
                ContextCompat.startForegroundService(context, intent);
            } catch (RuntimeException e) {
                // 裏にあるときは、Android 12 以降はフォアグラウンドサービスを始められない (次にアプリを開いたときに始める)
                call.reject("start failed");
                return;
            }
        }
        call.resolve();
    }

    // 曲の通知・ロック画面のボタンが押された (NowPlayingService から呼ぶ)
    static void sendAction(String action) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        instance.notifyListeners("mediaAction", data, true);
    }
}
