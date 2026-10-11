package io.github.marusako.kugiritimer;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

// 外部カレンダーの URL を暗号化する、このアプリだけの小さな部品 (画面からは Capacitor.Plugins.UrlVault で呼ぶ。src/web-feeds.js)。
// パソコン版の safeStorage と同じく、「暗号化した文字 (base64)」にして返し、使うときに元に戻す。
// - 鍵は Android の Keystore (鍵を端末の安全な場所にしまい、アプリにも鍵そのものは見せない仕組み) で作ってしまう
// - 暗号は AES-256-GCM (中身を書き換えられたら、戻すときに失敗する)。毎回ちがう IV (12 バイト) を、暗号文の前に付ける
// - 鍵は端末の外に出せないので、ほかの端末に写したデータは戻せない (画面では「一度外して、追加し直して」と出す)
@CapacitorPlugin(name = "UrlVault")
public class UrlVault extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "kugiri-feed-url";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generator.generateKey();
    }

    @PluginMethod
    public void encrypt(PluginCall call) {
        String text = call.getString("text");
        if (text == null) {
            call.reject("text がない");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = cipher.getIV();
            byte[] sealed = cipher.doFinal(text.getBytes(StandardCharsets.UTF_8));
            byte[] combined = ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array();
            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(combined, Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("暗号化できない", e);
        }
    }

    @PluginMethod
    public void decrypt(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("data がない");
            return;
        }
        try {
            byte[] combined = Base64.decode(data, Base64.NO_WRAP);
            if (combined.length <= IV_BYTES) throw new IllegalArgumentException("短すぎる");
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, combined, 0, IV_BYTES));
            byte[] plain = cipher.doFinal(combined, IV_BYTES, combined.length - IV_BYTES);
            JSObject result = new JSObject();
            result.put("text", new String(plain, StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("元に戻せない", e);
        }
    }
}
