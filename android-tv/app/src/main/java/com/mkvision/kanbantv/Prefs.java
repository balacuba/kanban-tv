package com.mkvision.kanbantv;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.Charset;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Cài đặt máy chủ + tài khoản đăng nhập. Mật khẩu được mã hóa bằng khóa trong Android Keystore (Android 6+). */
public final class Prefs {
    public static final String DEF_PLANNING = "http://14.241.68.10:3000";
    public static final String DEF_MDM = "http://14.241.68.10:10068";
    public static final String DEF_TOKEN_URL = "http://14.241.68.10:8800/auth/realms/QLSX/protocol/openid-connect/token";
    public static final String DEF_CLIENT_ID = "planning_react";
    public static final String DEF_USERNAME = "kanban";

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String KEY_ALIAS = "kanbantv-cred";
    private final SharedPreferences sp;

    public Prefs(Context ctx) {
        sp = ctx.getApplicationContext().getSharedPreferences("kanbantv", Context.MODE_PRIVATE);
    }

    public String planningUrl() { return trimSlash(sp.getString("planning", DEF_PLANNING)); }
    public String mdmUrl() { return trimSlash(sp.getString("mdm", DEF_MDM)); }
    public String tokenUrl() { return sp.getString("tokenUrl", DEF_TOKEN_URL).trim(); }
    public String clientId() { return sp.getString("clientId", DEF_CLIENT_ID).trim(); }
    /** Tài khoản đã lưu trên TV; chưa lưu thì dùng tài khoản cố định trong APK (nếu bản build có). */
    public String username() {
        if (!sp.contains("password") && hasFixedAccount()) return unxor(BuildConfig.FIXED_USER);
        return sp.getString("username", DEF_USERNAME);
    }
    public boolean hasAccount() { return sp.contains("password") || hasFixedAccount(); }

    public static boolean hasFixedAccount() {
        return !BuildConfig.FIXED_USER.isEmpty() && !BuildConfig.FIXED_PASS.isEmpty();
    }

    private static String unxor(String hex) {
        byte[] k = BuildConfig.XOR_KEY.getBytes(UTF8);
        byte[] b = new byte[hex.length() / 2];
        for (int i = 0; i < b.length; i++) {
            b[i] = (byte) (Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16) ^ k[i % k.length]);
        }
        return new String(b, UTF8);
    }

    /** Địa chỉ file update.json (mặc định lấy lúc build; rỗng = không tự cập nhật). */
    public String updateUrl() { return sp.getString("updateUrl", BuildConfig.UPDATE_URL).trim(); }

    public void saveServers(String planning, String mdm, String tokenUrl, String clientId, String updateUrl) {
        sp.edit().putString("planning", planning.trim()).putString("mdm", mdm.trim())
                .putString("tokenUrl", tokenUrl.trim()).putString("clientId", clientId.trim())
                .putString("updateUrl", updateUrl.trim()).apply();
    }

    public void saveAccount(String username, String password) {
        sp.edit().putString("username", username.trim()).putString("password", encrypt(password)).apply();
    }

    public String password() {
        String v = sp.getString("password", null);
        if (v == null) {
            if (!hasFixedAccount()) return null;
            // Lần chạy đầu: chép tài khoản cố định vào bộ nhớ mã hóa của TV, để các bản cập nhật sau
            // (build trên GitHub, không chứa mật khẩu) vẫn dùng được mà không phải đăng nhập
            String user = unxor(BuildConfig.FIXED_USER), pass = unxor(BuildConfig.FIXED_PASS);
            saveAccount(user, pass);
            return pass;
        }
        return decrypt(v);
    }

    public void clearAccount() { sp.edit().remove("password").apply(); }

    private static String trimSlash(String s) {
        s = s.trim();
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    /* ---------- Mã hóa mật khẩu ---------- */
    // Chỉ gọi trên Android 6+ (encrypt/decrypt đã kiểm tra phiên bản trước)
    @android.annotation.TargetApi(23)
    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return kg.generateKey();
    }

    // Android 5 không có Keystore AES: lưu trong vùng riêng của ứng dụng (ứng dụng khác không đọc được)
    private static String encrypt(String plain) {
        byte[] data = plain.getBytes(UTF8);
        if (Build.VERSION.SDK_INT < 23) return "p:" + Base64.encodeToString(data, Base64.NO_WRAP);
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            return "k:" + Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(c.doFinal(data), Base64.NO_WRAP);
        } catch (Exception e) {
            return "p:" + Base64.encodeToString(data, Base64.NO_WRAP);
        }
    }

    private static String decrypt(String stored) {
        try {
            if (stored.startsWith("p:")) return new String(Base64.decode(stored.substring(2), Base64.NO_WRAP), UTF8);
            if (Build.VERSION.SDK_INT < 23) return null;
            String[] parts = stored.split(":");
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[1], Base64.NO_WRAP)));
            return new String(c.doFinal(Base64.decode(parts[2], Base64.NO_WRAP)), UTF8);
        } catch (Exception e) {
            return null;
        }
    }
}
