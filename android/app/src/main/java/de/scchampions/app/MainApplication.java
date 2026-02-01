package de.scchampions.app;

import android.app.Application;
import android.util.Log;

import com.google.firebase.FirebaseApp;

/**
 * Custom Application class that handles Firebase initialization gracefully.
 * Prevents app crashes when google-services.json is missing or Firebase
 * is not properly configured.
 */
public class MainApplication extends Application {

    private static final String TAG = "MainApplication";
    private static boolean firebaseAvailable = false;

    @Override
    public void onCreate() {
        super.onCreate();

        // Try to initialize Firebase
        initializeFirebase();

        // Set up a safety net for Firebase-related crashes on plugin threads
        final Thread.UncaughtExceptionHandler defaultHandler =
                Thread.getDefaultUncaughtExceptionHandler();

        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            if (isFirebaseInitCrash(throwable)) {
                Log.e(TAG, "Firebase not configured - push notifications disabled. " +
                        "Add google-services.json to android/app/ to enable push.", throwable);
                // Don't crash the app - just disable push functionality
                return;
            }
            // For all other exceptions, use the default handler
            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });
    }

    private void initializeFirebase() {
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseApp.initializeApp(this);
            }
            // Verify Firebase is actually available
            FirebaseApp.getInstance();
            firebaseAvailable = true;
            Log.i(TAG, "Firebase initialized successfully");
        } catch (Exception e) {
            firebaseAvailable = false;
            Log.w(TAG, "Firebase not available: " + e.getMessage() +
                    ". Push notifications will be disabled.");
        }
    }

    /**
     * Check if Firebase is properly initialized and available.
     */
    public static boolean isFirebaseAvailable() {
        return firebaseAvailable;
    }

    /**
     * Checks if the throwable is caused by Firebase not being initialized.
     */
    private boolean isFirebaseInitCrash(Throwable throwable) {
        Throwable cause = throwable;
        while (cause != null) {
            if (cause instanceof IllegalStateException) {
                String message = cause.getMessage();
                if (message != null && message.contains("Default FirebaseApp is not initialized")) {
                    return true;
                }
            }
            cause = cause.getCause();
        }
        return false;
    }
}
