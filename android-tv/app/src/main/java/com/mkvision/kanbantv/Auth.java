package com.mkvision.kanbantv;

import android.content.Context;

import org.json.JSONObject;

import java.net.URLEncoder;

/** Lấy / gia hạn access token Keycloak bằng tài khoản đã lưu (grant_type=password, client công khai, không có secret). */
final class Auth {
    static final class LoginError extends Exception {
        LoginError(String msg) { super(msg); }
    }

    private static Auth instance;
    private final Prefs prefs;
    private String accessToken;
    private String refreshToken;
    private long expiresAt;

    private Auth(Context ctx) { prefs = new Prefs(ctx); }

    static synchronized Auth get(Context ctx) {
        if (instance == null) instance = new Auth(ctx);
        return instance;
    }

    /** Đăng nhập thử với tài khoản người dùng vừa nhập (trước khi lưu). */
    static void checkLogin(Prefs prefs, String user, String pass) throws Exception {
        requestToken(prefs, "grant_type=password&username=" + enc(user) + "&password=" + enc(pass));
    }

    synchronized void reset() {
        accessToken = null;
        refreshToken = null;
        expiresAt = 0;
    }

    /** Token còn hạn (tự gia hạn trước 60 giây); force = bỏ token cũ, đăng nhập lại. */
    synchronized String token(boolean force) throws Exception {
        long now = System.currentTimeMillis();
        if (!force && accessToken != null && now < expiresAt - 60000) return accessToken;
        if (!force && refreshToken != null) {
            try {
                apply(requestToken(prefs, "grant_type=refresh_token&refresh_token=" + enc(refreshToken)));
                return accessToken;
            } catch (Exception ignored) {
                // refresh token hết hạn: đăng nhập lại bằng mật khẩu đã lưu
            }
        }
        String pass = prefs.password();
        if (pass == null) throw new LoginError("Chưa có tài khoản");
        apply(requestToken(prefs, "grant_type=password&username=" + enc(prefs.username()) + "&password=" + enc(pass)));
        return accessToken;
    }

    private void apply(JSONObject j) {
        accessToken = j.optString("access_token");
        refreshToken = j.has("refresh_token") ? j.optString("refresh_token") : null;
        expiresAt = System.currentTimeMillis() + j.optLong("expires_in", 300) * 1000;
    }

    private static JSONObject requestToken(Prefs prefs, String form) throws Exception {
        String body = form + "&client_id=" + enc(prefs.clientId());
        Http.Result r = Http.send("POST", prefs.tokenUrl(), "application/x-www-form-urlencoded", body.getBytes(Http.UTF8), null);
        JSONObject j;
        try { j = new JSONObject(r.text()); } catch (Exception e) { j = new JSONObject(); }
        if (r.status == 200 && j.has("access_token")) return j;
        if (r.status == 400 || r.status == 401) {
            String d = j.optString("error_description", j.optString("error", ""));
            throw new LoginError(d.contains("credentials") ? "Sai tên đăng nhập hoặc mật khẩu" : "Không đăng nhập được: " + d);
        }
        throw new Exception("Máy chủ đăng nhập trả lỗi HTTP " + r.status);
    }

    private static String enc(String s) throws Exception { return URLEncoder.encode(s, "UTF-8"); }
}
