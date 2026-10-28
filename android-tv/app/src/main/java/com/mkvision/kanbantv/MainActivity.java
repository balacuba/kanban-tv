package com.mkvision.kanbantv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * Màn Kanban: WebView mở bản web Kanban đóng gói trong ứng dụng (assets/web).
 * Request API của trang đi qua ứng dụng: trang gọi AndroidApi.prepare(...) rồi fetch("api/<id>"),
 * ứng dụng gọi server thật kèm token của tài khoản đã đăng nhập và trả nguyên kết quả về trang.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String BUNDLED_URL = "https://" + HOST + "/assets/web/index.html";
    private static final String LIVE_URL = "https://" + HOST + "/live/index.html";
    /** Phải khớp với <meta name="viewport" content="width=1600"> trong tv/index.html */
    private static final int PAGE_WIDTH = 1600;

    private WebView web;
    private Prefs prefs;
    private volatile WebViewAssetLoader assets;
    private final Map<String, String[]> pending = Collections.synchronizedMap(new HashMap<String, String[]>());
    private final Handler ui = new Handler(Looper.getMainLooper());
    private long lastBack;
    private Updater updater;
    private static final long UPDATE_EVERY_MS = 6 * 60 * 60 * 1000L;
    private final Runnable updateTick = new Runnable() {
        @Override
        public void run() {
            updater.check(false);
            ui.postDelayed(this, UPDATE_EVERY_MS);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = new Prefs(this);
        if (!prefs.hasAccount() || prefs.password() == null) {
            openLogin();
            return;
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#F3F4F6"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // Trang dàn trang ở khổ 1600px (meta viewport) rồi thu/phóng đúng bằng chiều rộng màn hình TV.
        // Không dựa vào LoadWithOverviewMode: WebView trên một số TV (TCL Android 11) bỏ qua, trang bị phóng to.
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        android.util.DisplayMetrics dm = new android.util.DisplayMetrics();
        getWindowManager().getDefaultDisplay().getRealMetrics(dm);
        web.setInitialScale(Math.max(1, Math.round(Math.max(dm.widthPixels, dm.heightPixels) * 100f / PAGE_WIDTH)));
        if (BuildConfig.WEB_DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.addJavascriptInterface(new Bridge(), "AndroidApi");
        web.setWebViewClient(new Client());
        setContentView(web);
        hideSystemBars();
        loadKanban();

        // Kiểm tra bản mới 20 giây sau khi mở, rồi 6 giờ một lần; giao diện mới tải về thì nạp lại trang ngay
        updater = new Updater(this, this::loadKanban);
        ui.postDelayed(updateTick, 20000);
    }

    /** Mở Kanban: bản web đã tải về (nếu mới hơn) hoặc bản đóng gói trong APK. */
    private void loadKanban() {
        if (web == null) return;
        File live = Updater.liveWebDir(this);
        WebViewAssetLoader.Builder b = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this));
        if (live != null) b.addPathHandler("/live/", new WebViewAssetLoader.InternalStoragePathHandler(this, live));
        assets = b.build();
        web.clearCache(true);
        web.loadUrl(live != null ? LIVE_URL : BUNDLED_URL);
    }

    private void openLogin() {
        startActivity(new Intent(this, LoginActivity.class));
        finish();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    /* ---------- Phím remote: MENU mở bảng chọn; BACK bấm 1 lần mở bảng chọn (tránh thoát nhầm) ---------- */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (web != null && (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_SETTINGS)) {
            showMenu();
            return true;
        }
        if (web != null && keyCode == KeyEvent.KEYCODE_BACK) {
            long now = System.currentTimeMillis();
            if (now - lastBack < 400) return true;
            lastBack = now;
            showMenu();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void showMenu() {
        String[] items = {getString(R.string.menu_reload), getString(R.string.menu_update),
                getString(R.string.menu_account), getString(R.string.menu_exit)};
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.menu_title) + " · " + BuildConfig.VERSION_NAME)
                .setItems(items, (d, which) -> {
                    if (which == 0) web.reload();
                    else if (which == 1) updater.check(true);
                    else if (which == 2) {
                        prefs.clearAccount();
                        Auth.get(this).reset();
                        openLogin();
                    } else finish();
                })
                .setNegativeButton(R.string.menu_cancel, null)
                .show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacks(updateTick);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Trang web giao request cho ứng dụng (chỉ nhận địa chỉ bắt đầu bằng @planning / @mdm). */
    private final class Bridge {
        @JavascriptInterface
        public void prepare(String id, String method, String url, String body) {
            if (pending.size() > 200) pending.clear();
            pending.put(id, new String[]{method, url, body});
        }
    }

    private final class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath() == null ? "" : u.getPath();
            int i = path.indexOf("/api/");
            if (i >= 0) return callApi(path.substring(i + 5));
            return assets.shouldInterceptRequest(u);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Trang Kanban không mở trang ngoài
            return !HOST.equals(request.getUrl().getHost());
        }
    }

    /** Chạy trên luồng nền của WebView. */
    private WebResourceResponse callApi(String id) {
        String[] req = pending.remove(id);
        if (req == null) return json(400, "{\"message\":\"Unknown request\"}");
        String method = "POST".equals(req[0]) ? "POST" : "GET";
        String url = req[1];
        if (url.startsWith("@planning")) url = prefs.planningUrl() + url.substring("@planning".length());
        else if (url.startsWith("@mdm")) url = prefs.mdmUrl() + url.substring("@mdm".length());
        else return json(400, "{\"message\":\"URL not allowed\"}");
        byte[] body = req[2] == null || req[2].isEmpty() ? null : req[2].getBytes(Http.UTF8);
        try {
            Auth auth = Auth.get(this);
            Http.Result r = Http.send(method, url, "application/json", body, auth.token(false));
            if (r.status == 401) r = Http.send(method, url, "application/json", body, auth.token(true));
            return bytes(r.status, r.body);
        } catch (Auth.LoginError e) {
            // Mật khẩu đã bị đổi trên máy chủ: quay về màn đăng nhập
            ui.post(() -> {
                prefs.clearAccount();
                openLogin();
            });
            return json(401, "{\"message\":\"Đăng nhập lại\"}");
        } catch (Exception e) {
            return json(503, "{\"message\":\"Không kết nối được máy chủ\"}");
        }
    }

    private static WebResourceResponse json(int status, String text) {
        return bytes(status, text.getBytes(Http.UTF8));
    }

    private static WebResourceResponse bytes(int status, byte[] data) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        String reason = status >= 200 && status < 300 ? "OK" : "Error";
        if (Build.VERSION.SDK_INT >= 21) {
            return new WebResourceResponse("application/json", "utf-8", status, reason, headers, new ByteArrayInputStream(data));
        }
        return new WebResourceResponse("application/json", "utf-8", new ByteArrayInputStream(data));
    }
}
