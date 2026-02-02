package de.scchampions.app;

import android.app.Application;
import android.util.Log;

import java.lang.reflect.Method;
import java.util.List;

/**
 * Custom Application class that handles Firebase initialization gracefully.
 * Prevents app crashes when google-services.json is missing or Firebase
 * is not properly configured.
 *
 * Uses reflection to avoid compile-time dependency on Firebase SDK,
 * which may not be available when google-services.json is absent.
 */
public class MainApplication extends Application {

    private static final String TAG = "MainApplication";
    private static boolean firebaseAvailable = false;

    @Override
    public void onCreate() {
        super.onCreate();

        // Try to initialize Firebase via reflection (no compile-time dependency needed)
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

    @SuppressWarnings("unchecked")
    private void initializeFirebase() {
        try {
            // Use reflection to call FirebaseApp methods without compile-time dependency
            Class<?> firebaseAppClass = Class.forName("com.google.firebase.FirebaseApp");

            // FirebaseApp.getApps(context)
            Method getApps = firebaseAppClass.getMethod("getApps", android.content.Context.class);
            List<?> apps = (List<?>) getApps.invoke(null, this);

            if (apps == null || apps.isEmpty()) {
                // FirebaseApp.initializeApp(context)
                Method initializeApp = firebaseAppClass.getMethod("initializeApp", android.content.Context.class);
                initializeApp.invoke(null, this);
            }

            // FirebaseApp.getInstance() - verify it's available
            Method getInstance = firebaseAppClass.getMethod("getInstance");
            getInstance.invoke(null);

            firebaseAvailable = true;
            Log.i(TAG, "Firebase initialized successfully");
        } catch (ClassNotFoundException e) {
            firebaseAvailable = false;
            Log.w(TAG, "Firebase SDK not found. Push notifications will be disabled.");
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
