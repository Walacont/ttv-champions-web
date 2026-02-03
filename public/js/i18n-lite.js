// Lightweight non-module translation script
// Applies translations from /locales/{lang}/translation.json without ES module imports
// This works on Android WebView where <script type="module"> may fail
// Also provides a global t() function for JS code that builds HTML dynamically
(function() {
    'use strict';

    var lang = localStorage.getItem('app_language') || 'de';
    var translationData = null;
    var domReady = document.readyState !== 'loading';

    // Always load translations (even for 'de') so t() works for dynamic content
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/locales/' + lang + '/translation.json', true);
    xhr.onload = function() {
        if (xhr.status !== 200) return;
        try {
            translationData = JSON.parse(xhr.responseText);
            window.__i18nData = translationData;
            window.__i18nLang = lang;
            if (domReady) applyTranslations(translationData);
            console.log('[i18n-lite] Loaded translations for', lang);
        } catch(e) {
            console.warn('[i18n-lite] Failed to parse translations:', e);
        }
    };
    xhr.send();

    // Wait for DOM ready
    if (!domReady) {
        document.addEventListener('DOMContentLoaded', function() {
            domReady = true;
            if (translationData) applyTranslations(translationData);
        });
    }

    function resolve(obj, path) {
        var parts = path.split('.');
        var current = obj;
        for (var i = 0; i < parts.length; i++) {
            if (current == null) return null;
            current = current[parts[i]];
        }
        return current;
    }

    // Global t() function - works even when i18next module fails to load
    // Supports simple {{variable}} interpolation and { returnObjects: true }
    window.t = function(key, options) {
        if (!translationData) return key;
        var val = resolve(translationData, key);
        if (val == null) return key;

        // Return objects (arrays, objects) when requested
        if (options && options.returnObjects) return val;

        // Must be a string for interpolation
        if (typeof val !== 'string') return key;

        // Simple {{variable}} interpolation
        if (options) {
            val = val.replace(/\{\{(\w+)\}\}/g, function(match, varName) {
                return options[varName] != null ? options[varName] : match;
            });
        }
        return val;
    };

    function applyTranslations(translations) {
        // data-i18n -> textContent
        var elements = document.querySelectorAll('[data-i18n]');
        for (var i = 0; i < elements.length; i++) {
            var key = elements[i].getAttribute('data-i18n');
            var val = resolve(translations, key);
            if (val && typeof val === 'string') {
                var attr = elements[i].getAttribute('data-i18n-attr');
                if (attr) {
                    elements[i].setAttribute(attr, val);
                } else {
                    elements[i].textContent = val;
                }
            }
        }

        // data-i18n-html -> innerHTML
        var htmlEls = document.querySelectorAll('[data-i18n-html]');
        for (var j = 0; j < htmlEls.length; j++) {
            var hkey = htmlEls[j].getAttribute('data-i18n-html');
            var hval = resolve(translations, hkey);
            if (hval && typeof hval === 'string') {
                htmlEls[j].innerHTML = hval;
            }
        }

        // data-i18n-placeholder -> placeholder
        var phEls = document.querySelectorAll('[data-i18n-placeholder]');
        for (var k = 0; k < phEls.length; k++) {
            var pkey = phEls[k].getAttribute('data-i18n-placeholder');
            var pval = resolve(translations, pkey);
            if (pval && typeof pval === 'string') {
                phEls[k].placeholder = pval;
            }
        }

        document.documentElement.lang = lang;
    }
})();
