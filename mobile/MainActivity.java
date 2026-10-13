package io.github.marusako.kugiritimer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// スマホ版の画面 (Capacitor が作る MainActivity を、android-build.yml でこのファイルに置きかえる)。
// このアプリだけの部品 (UrlVault: 外部カレンダーの URL の暗号化) を、ここで登録する。
// 上の帯 (時刻や電池) と下の帯 (ナビゲーション) は隠さずに出す (全画面にしない)。
// 画面は帯の下までつながり (edge-to-edge)、上下の部品は style.css で env(safe-area-inset-*) の分だけ内側に寄せる。
// 帯の文字の色は、画面 (renderer.js) が Capacitor の SystemBars でアプリのテーマに合わせる
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 部品の登録は、super.onCreate (画面と部品の準備) より前に行う
        registerPlugin(UrlVault.class);
        super.onCreate(savedInstanceState);
    }
}
