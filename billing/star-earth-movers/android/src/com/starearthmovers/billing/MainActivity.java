package com.starearthmovers.billing;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;

/**
 * Star Earth Movers Billing: the billing web page (assets/index.html) in a full-screen
 * WebView. Bills are kept in the WebView's storage inside the app. A small JavaScript
 * bridge ("AndroidBridge") gives the page what a plain WebView lacks: saving files to
 * Downloads, sharing, printing, and closing the app from the Back button.
 */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 1;
    private static final int REQ_STORAGE = 2;

    private WebView web;
    private ValueCallback<Uri[]> pendingChooser;
    private String[] pendingSave; // base64, name, mime waiting for storage permission (Android 7-9)

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        colourStatusBar();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#2b2734"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      // bills are kept in localStorage
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { /* ignore */ }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingChooser != null) pendingChooser.onReceiveValue(null);
                pendingChooser = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                String type = "*/*";
                String[] accept = params != null ? params.getAcceptTypes() : null;
                if (accept != null && accept.length > 0 && accept[0] != null && accept[0].length() > 0) {
                    type = accept[0].startsWith(".") ? "*/*" : accept[0];
                }
                pick.setType(type);
                try {
                    startActivityForResult(Intent.createChooser(pick, "Choose file"), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingChooser = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });
        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/index.html");
    }

    private void colourStatusBar() {
        try {
            Window w = getWindow();
            w.addFlags(0x80000000); // FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS (API 21)
            Method m = Window.class.getMethod("setStatusBarColor", int.class);
            m.invoke(w, Color.parseColor("#1d1a24"));
            Method n = Window.class.getMethod("setNavigationBarColor", int.class);
            n.invoke(w, Color.parseColor("#1d1a24"));
        } catch (Exception e) { /* older phones: keep default */ }
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        // The page closes an open window / returns to Bill Entry; on Bill Entry it calls exitApp().
        web.loadUrl("javascript:(window.semBack ? window.semBack() : AndroidBridge.exitApp())");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && pendingChooser != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                    int n = data.getClipData().getItemCount();
                    result = new Uri[n];
                    for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            pendingChooser.onReceiveValue(result);
            pendingChooser = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // Android 6+ callback (no @Override: the build's android.jar predates it)
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQ_STORAGE && pendingSave != null) {
            String[] p = pendingSave;
            pendingSave = null;
            boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            String msg = ok ? saveToDownloads(p[0], p[1], p[2]) : "Not saved — storage permission was refused.";
            notifyPage(msg, !ok);
        }
    }

    private void notifyPage(final String msg, final boolean bad) {
        runOnUiThread(new Runnable() {
            public void run() {
                String js = "window.semNotify && window.semNotify(" + jsString(msg) + "," + bad + ")";
                web.loadUrl("javascript:" + js);
            }
        });
    }

    private static String jsString(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c == '\n') b.append("\\n");
            else if (c < 32) b.append(' ');
            else b.append(c);
        }
        return b.append('"').toString();
    }

    private static String safeName(String name) {
        String n = name == null ? "file" : name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return n.length() == 0 ? "file" : n;
    }

    /** Saves a file into the phone's Downloads folder. Returns a message for the user. */
    private String saveToDownloads(String base64, String name, String mime) {
        byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
        name = safeName(name);
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = getContentResolver();
                ContentValues v = new ContentValues();
                v.put("_display_name", name);
                v.put("mime_type", mime);
                v.put("relative_path", Environment.DIRECTORY_DOWNLOADS + "/Star Billing");
                Class<?> downloads = Class.forName("android.provider.MediaStore$Downloads");
                Uri collection = (Uri) downloads.getField("EXTERNAL_CONTENT_URI").get(null);
                Uri item = cr.insert(collection, v);
                if (item == null) return "Could not save the file.";
                OutputStream out = cr.openOutputStream(item);
                try { out.write(bytes); } finally { out.close(); }
                return "Saved to Downloads/Star Billing: " + name;
            }
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Star Billing");
            if (!dir.exists() && !dir.mkdirs()) return "Could not open the Downloads folder.";
            File f = new File(dir, name);
            FileOutputStream out = new FileOutputStream(f);
            try { out.write(bytes); } finally { out.close(); }
            MediaScannerConnection.scanFile(this, new String[]{f.getAbsolutePath()}, new String[]{mime}, null);
            return "Saved to Downloads/Star Billing: " + name;
        } catch (Exception e) {
            return "Could not save the file: " + e.getMessage();
        }
    }

    private boolean needsStoragePermission() {
        if (Build.VERSION.SDK_INT >= 29 || Build.VERSION.SDK_INT < 23) return false;
        try {
            Method check = Activity.class.getMethod("checkSelfPermission", String.class);
            int r = (Integer) check.invoke(this, Manifest.permission.WRITE_EXTERNAL_STORAGE);
            return r != PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) { return false; }
    }

    private void askStoragePermission() {
        try {
            Method req = Activity.class.getMethod("requestPermissions", String[].class, int.class);
            req.invoke(this, new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
        } catch (Exception e) { /* ignore */ }
    }

    /** Methods the page can call as window.AndroidBridge.*(...). */
    private class Bridge {
        @JavascriptInterface
        public String saveFile(String base64, String name, String mime) {
            if (needsStoragePermission()) {
                pendingSave = new String[]{base64, name, mime};
                runOnUiThread(new Runnable() { public void run() { askStoragePermission(); } });
                return "Allow storage access to save the file…";
            }
            return saveToDownloads(base64, name, mime);
        }

        @JavascriptInterface
        public String shareFile(String base64, String name, String mime) {
            try {
                File dir = new File(getCacheDir(), "share");
                if (!dir.exists()) dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File o : old) o.delete();
                File f = new File(dir, safeName(name));
                FileOutputStream out = new FileOutputStream(f);
                try { out.write(Base64.decode(base64, Base64.DEFAULT)); } finally { out.close(); }
                final Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + Uri.encode(f.getName()));
                final String type = mime;
                runOnUiThread(new Runnable() {
                    public void run() {
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType(type);
                        send.putExtra(Intent.EXTRA_STREAM, uri);
                        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(send, "Share bill"));
                    }
                });
                return "ok";
            } catch (Exception e) {
                return "Could not share: " + e.getMessage();
            }
        }

        @JavascriptInterface
        public void print(final String jobName) {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        Object pm = getSystemService("print");
                        Class<?> adapterClass = Class.forName("android.print.PrintDocumentAdapter");
                        Class<?> attrsClass = Class.forName("android.print.PrintAttributes");
                        Object adapter = WebView.class.getMethod("createPrintDocumentAdapter", String.class).invoke(web, jobName);
                        pm.getClass().getMethod("print", String.class, adapterClass, attrsClass).invoke(pm, jobName, adapter, null);
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Printing is not available on this phone.", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() { public void run() { finish(); } });
        }

        @JavascriptInterface
        public String version() {
            return "1.0";
        }
    }
}
