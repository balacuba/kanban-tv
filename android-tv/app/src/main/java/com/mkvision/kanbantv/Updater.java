package com.mkvision.kanbantv;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Tự cập nhật, không cần người dùng bấm:
 * - Giao diện Kanban (web.zip): tải, giải nén vào bộ nhớ trong rồi nạp lại trang – im lặng trên mọi đời Android.
 * - Ứng dụng (APK): cài bằng PackageInstaller. Android 12+ cài im lặng khi Kanban là "nguồn cài" của chính nó
 *   (từ lần cập nhật thứ hai); Android cũ hơn hệ thống bắt buộc hiện màn xác nhận.
 * update.json: {"versionCode": 3, "versionName": "1.2", "apk": "KanbanTV.apk", "sha256": "...",
 *               "web": {"version": 3001, "zip": "web.zip", "sha256": "..."}}  (đường dẫn tính theo update.json)
 */
final class Updater {
    interface Listener {
        void onWebUpdated();
    }

    private final Activity activity;
    private final Prefs prefs;
    private final Listener listener;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private volatile boolean busy;

    Updater(Activity activity, Listener listener) {
        this.activity = activity;
        this.prefs = new Prefs(activity);
        this.listener = listener;
    }

    /* ---------- Bản web đang dùng ---------- */
    private static SharedPreferences state(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences("kanbantv-update", Context.MODE_PRIVATE);
    }

    /** Thư mục bản web đã tải (mới hơn bản đóng gói trong APK), hoặc null = dùng bản trong APK. */
    static File liveWebDir(Context ctx) {
        int v = state(ctx).getInt("webVersion", 0);
        if (v <= BuildConfig.WEB_VERSION) return null;
        File dir = new File(ctx.getFilesDir(), "web-" + v);
        return new File(dir, "index.html").exists() ? dir : null;
    }

    private int currentWebVersion() {
        return liveWebDir(activity) != null ? state(activity).getInt("webVersion", 0) : BuildConfig.WEB_VERSION;
    }

    /** manual = chọn "Kiểm tra cập nhật" trong menu (báo kết quả lên màn hình). */
    void check(final boolean manual) {
        final String url = prefs.updateUrl();
        if (url.isEmpty()) {
            if (manual) toast("Chưa cài địa chỉ cập nhật (Menu → Đổi tài khoản / máy chủ)");
            return;
        }
        if (busy) return;
        busy = true;
        new Thread(() -> {
            try {
                Http.Result r = Http.send("GET", url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis(), null, null, null);
                if (r.status != 200) throw new Exception("HTTP " + r.status);
                JSONObject j = new JSONObject(r.text());
                URL base = new URL(url);
                boolean any = false;

                JSONObject w = j.optJSONObject("web");
                if (w != null && w.getInt("version") > currentWebVersion()) {
                    updateWeb(new URL(base, w.optString("zip", "web.zip")).toString(), w.getInt("version"), w.optString("sha256", ""));
                    any = true;
                    if (manual) toast("Đã cập nhật giao diện Kanban");
                }

                int code = j.getInt("versionCode");
                if (code > BuildConfig.VERSION_CODE) {
                    File apk = download(new URL(base, j.optString("apk", "KanbanTV.apk")).toString(),
                            new File(activity.getCacheDir(), "KanbanTV-update.apk"), j.optString("sha256", ""));
                    if (manual) toast("Đang cài phiên bản " + j.optString("versionName", String.valueOf(code)) + "…");
                    install(apk);
                    any = true;
                }
                if (manual && !any) toast("Đang dùng bản mới nhất (" + BuildConfig.VERSION_NAME + ")");
            } catch (Exception e) {
                if (manual) toast("Không cập nhật được: " + e.getMessage());
            } finally {
                busy = false;
            }
        }).start();
    }

    /* ---------- Giao diện web ---------- */
    private void updateWeb(String zipUrl, int version, String sha256) throws Exception {
        File zip = download(zipUrl, new File(activity.getCacheDir(), "web-update.zip"), sha256);
        File root = activity.getFilesDir();
        File tmp = new File(root, "web-" + version + ".tmp");
        deleteTree(tmp);
        if (!tmp.mkdirs()) throw new Exception("Không tạo được thư mục");
        String rootPath = tmp.getCanonicalPath() + File.separator;
        ZipInputStream zin = new ZipInputStream(new FileInputStream(zip));
        try {
            ZipEntry e;
            byte[] buf = new byte[32768];
            while ((e = zin.getNextEntry()) != null) {
                File f = new File(tmp, e.getName());
                if (!f.getCanonicalPath().startsWith(rootPath)) throw new Exception("File nén không hợp lệ");
                if (e.isDirectory()) {
                    f.mkdirs();
                    continue;
                }
                f.getParentFile().mkdirs();
                OutputStream out = new FileOutputStream(f);
                int n;
                while ((n = zin.read(buf)) > 0) out.write(buf, 0, n);
                out.close();
            }
        } finally {
            zin.close();
            zip.delete();
        }
        if (!new File(tmp, "index.html").exists()) throw new Exception("Bản web thiếu index.html");
        File dir = new File(root, "web-" + version);
        deleteTree(dir);
        if (!tmp.renameTo(dir)) throw new Exception("Không lưu được bản web");
        state(activity).edit().putInt("webVersion", version).commit();
        // Xóa các bản web cũ
        File[] old = root.listFiles();
        if (old != null) for (File f : old) {
            if (f.getName().startsWith("web-") && !f.getName().equals(dir.getName())) deleteTree(f);
        }
        ui.post(listener::onWebUpdated);
    }

    private static void deleteTree(File f) {
        if (!f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    /* ---------- Ứng dụng ---------- */
    private void install(File apk) throws Exception {
        PackageInstaller pi = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(activity.getPackageName());
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = pi.createSession(params);
        PackageInstaller.Session s = pi.openSession(id);
        try {
            OutputStream out = s.openWrite("base.apk", 0, apk.length());
            InputStream in = new FileInputStream(apk);
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            s.fsync(out);
            out.close();
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent done = PendingIntent.getBroadcast(activity, id, new Intent(activity, UpdateReceiver.class)
                    .setAction(UpdateReceiver.ACTION_INSTALL_STATUS), flags);
            s.commit(done.getIntentSender());
        } finally {
            s.close();
        }
    }

    private static File download(String url, File out, String sha256) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(120000);
        con.setUseCaches(false);
        if (con.getResponseCode() != 200) throw new Exception("Tải " + out.getName() + " lỗi HTTP " + con.getResponseCode());
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        InputStream is = con.getInputStream();
        FileOutputStream os = new FileOutputStream(out);
        byte[] buf = new byte[32768];
        int n;
        while ((n = is.read(buf)) > 0) {
            os.write(buf, 0, n);
            md.update(buf, 0, n);
        }
        os.close();
        is.close();
        con.disconnect();
        if (!sha256.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format("%02x", b & 0xff));
            if (!sb.toString().equalsIgnoreCase(sha256.trim())) {
                out.delete();
                throw new Exception("File tải về bị lỗi (sai mã kiểm tra)");
            }
        }
        return out;
    }

    private void toast(final String msg) {
        ui.post(() -> Toast.makeText(activity, msg, Toast.LENGTH_LONG).show());
    }
}
