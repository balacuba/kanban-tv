package com.mkvision.kanbantv;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;

/** Gọi HTTP đơn giản (chạy trên luồng nền). */
final class Http {
    static final Charset UTF8 = Charset.forName("UTF-8");

    static final class Result {
        final int status;
        final byte[] body;
        Result(int status, byte[] body) { this.status = status; this.body = body; }
        String text() { return new String(body, UTF8); }
    }

    static Result send(String method, String url, String contentType, byte[] body, String bearer) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(90000);
        con.setRequestMethod(method);
        con.setRequestProperty("Accept", "application/json");
        if (bearer != null) con.setRequestProperty("Authorization", "Bearer " + bearer);
        if (body != null && !"GET".equals(method)) {
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", contentType);
            OutputStream os = con.getOutputStream();
            os.write(body);
            os.close();
        }
        int status = con.getResponseCode();
        InputStream is = status >= 400 ? con.getErrorStream() : con.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (is != null) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = is.read(buf)) > 0) out.write(buf, 0, n);
            is.close();
        }
        con.disconnect();
        return new Result(status, out.toByteArray());
    }
}
