package io.github.marusako.kugiritimer;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

// スマホ版の画面 (Capacitor が作る MainActivity を、android-build.yml でこのファイルに置きかえる)。
// このアプリだけの部品 (UrlVault: 外部カレンダーの URL の暗号化) を、ここで登録する。
// 最初から全画面にする: 上の帯 (時刻や電池) と下の帯 (ナビゲーション) を隠す。
// 画面の端からスワイプすると帯が少しのあいだだけ出て、また自動で隠れる。
// ほかのアプリや選ぶ画面から戻ったときにも隠し直すため、画面に戻るたび (フォーカスを得るたび) に隠す
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 部品の登録は、super.onCreate (画面と部品の準備) より前に行う
        registerPlugin(UrlVault.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
