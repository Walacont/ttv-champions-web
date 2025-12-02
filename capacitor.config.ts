import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'de.scchampions.app',
    appName: 'SC Champions',
    webDir: 'public',
    server: {
        androidScheme: 'https',
        iosScheme: 'https'
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 2000,
            launchAutoHide: true,
            backgroundColor: '#1e3a5f',
            androidSplashResourceName: 'splash',
            androidScaleType: 'CENTER_CROP',
            showSpinner: false,
            splashFullScreen: true,
            splashImmersive: true
        },
        StatusBar: {
            style: 'LIGHT',
            backgroundColor: '#1e3a5f'
        },
        Keyboard: {
            resize: 'body',
            resizeOnFullScreen: true
        },
        PushNotifications: {
            presentationOptions: ['badge', 'sound', 'alert']
        }
    },
    android: {
        allowMixedContent: false,
        captureInput: true,
        webContentsDebuggingEnabled: false
    },
    ios: {
        contentInset: 'automatic',
        scrollEnabled: true
    }
};

export default config;
