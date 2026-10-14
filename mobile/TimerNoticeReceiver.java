package io.github.marusako.kugiritimer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// ロック画面のタイマーの区切りが終わる時刻に、正確なアラームで起こされる (TimerNotice)。次の区切りの通知に切り替える
public class TimerNoticeReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        TimerNotice.show(context);
    }
}
