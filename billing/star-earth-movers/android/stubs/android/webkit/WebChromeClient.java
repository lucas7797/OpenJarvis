// Compile-time stand-in exposing the Android 5.0 file-chooser API (android.jar here is API 16).
// Not packaged into the app; the phone's own class is used at run time.
package android.webkit;

import android.content.Intent;
import android.net.Uri;

public class WebChromeClient {
    public abstract static class FileChooserParams {
        public static Uri[] parseResult(int resultCode, Intent data) { return null; }
        public abstract String[] getAcceptTypes();
        public abstract boolean isCaptureEnabled();
        public abstract Intent createIntent();
    }
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                     FileChooserParams fileChooserParams) { return false; }
    public boolean onConsoleMessage(ConsoleMessage consoleMessage) { return false; }
}
