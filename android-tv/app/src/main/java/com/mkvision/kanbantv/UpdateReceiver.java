package com.mkvision.kanbantv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

/**
 * - Kết quả cài bản mới: Android cũ (hoặc lần cập nhật đầu tiên) bắt buộc người dùng xác nhận → mở màn xác nhận.
 * - Cài xong bản mới (MY_PACKAGE_REPLACED): tự mở lại Kanban nếu chính Kanban tự cập nhật (Updater đặt cờ "relaunch");
 *   cài tay / qua adb thì không mở, để không che ứng dụng khác đang chạy trên TV.
 */
public class UpdateReceiver extends BroadcastReceiver {
    static final String ACTION_INSTALL_STATUS = "com.mkvision.kanbantv.INSTALL_STATUS";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            SharedPreferences st = Updater.state(ctx);
            if (!st.getBoolean("relaunch", false)) return;
            st.edit().remove("relaunch").commit();
            ctx.startActivity(new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return;
        }
        if (!ACTION_INSTALL_STATUS.equals(intent.getAction())) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(confirm);
            }
        } else if (status != PackageInstaller.STATUS_SUCCESS) {
            Updater.state(ctx).edit().remove("relaunch").commit();   // cài lỗi: bỏ cờ, lần cài tay sau không tự mở
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Toast.makeText(ctx, "Cập nhật lỗi: " + (msg == null ? status : msg), Toast.LENGTH_LONG).show();
        }
    }
}
