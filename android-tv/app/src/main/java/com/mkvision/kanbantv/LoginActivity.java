package com.mkvision.kanbantv;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

/** Màn đăng nhập (lần đầu mở ứng dụng, hoặc khi chọn "Đổi tài khoản"). Tài khoản chỉ lưu trên TV này. */
public class LoginActivity extends Activity {
    private Prefs prefs;
    private EditText username, password, planningUrl, mdmUrl, tokenUrl, clientId, updateUrl;
    private TextView error;
    private Button login;
    private View servers;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);
        prefs = new Prefs(this);

        username = findViewById(R.id.username);
        password = findViewById(R.id.password);
        planningUrl = findViewById(R.id.planningUrl);
        mdmUrl = findViewById(R.id.mdmUrl);
        tokenUrl = findViewById(R.id.tokenUrl);
        clientId = findViewById(R.id.clientId);
        updateUrl = findViewById(R.id.updateUrl);
        error = findViewById(R.id.error);
        login = findViewById(R.id.login);
        servers = findViewById(R.id.servers);

        username.setText(prefs.username());
        planningUrl.setText(prefs.planningUrl());
        mdmUrl.setText(prefs.mdmUrl());
        tokenUrl.setText(prefs.tokenUrl());
        clientId.setText(prefs.clientId());
        updateUrl.setText(prefs.updateUrl());
        password.requestFocus();

        findViewById(R.id.toggleServers).setOnClickListener(v ->
                servers.setVisibility(servers.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        login.setOnClickListener(v -> doLogin());
        password.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                doLogin();
                return true;
            }
            return false;
        });
    }

    private void doLogin() {
        final String user = username.getText().toString().trim();
        final String pass = password.getText().toString();
        if (user.isEmpty() || pass.isEmpty()) {
            showError(getString(R.string.need_account));
            return;
        }
        prefs.saveServers(text(planningUrl, Prefs.DEF_PLANNING), text(mdmUrl, Prefs.DEF_MDM),
                text(tokenUrl, Prefs.DEF_TOKEN_URL), text(clientId, Prefs.DEF_CLIENT_ID), updateUrl.getText().toString());
        error.setVisibility(View.GONE);
        login.setEnabled(false);
        login.setText(R.string.logging_in);
        new Thread(() -> {
            String err = null;
            try {
                Auth.checkLogin(prefs, user, pass);
            } catch (Auth.LoginError e) {
                err = e.getMessage();
            } catch (Exception e) {
                err = "Không kết nối được máy chủ đăng nhập (" + e.getMessage() + ")";
            }
            final String message = err;
            runOnUiThread(() -> {
                login.setEnabled(true);
                login.setText(R.string.login);
                if (message != null) {
                    showError(message);
                    return;
                }
                prefs.saveAccount(user, pass);
                Auth.get(this).reset();
                startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP));
                finish();
            });
        }).start();
    }

    private static String text(EditText e, String def) {
        String s = e.getText().toString().trim();
        return s.isEmpty() ? def : s;
    }

    private void showError(String msg) {
        error.setText(msg);
        error.setVisibility(View.VISIBLE);
    }
}
