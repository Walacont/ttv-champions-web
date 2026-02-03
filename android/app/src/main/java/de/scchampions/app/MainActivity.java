package de.scchampions.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Expose Firebase availability to JavaScript so it can skip
        // PushNotifications.register() when Firebase isn't configured
        getBridge().getWebView().post(() -> {
            WebView webView = getBridge().getWebView();
            boolean firebaseOk = MainApplication.isFirebaseAvailable();
            webView.evaluateJavascript(
                "window.__firebaseAvailable = " + firebaseOk + ";",
                null
            );
        });
    }
}
