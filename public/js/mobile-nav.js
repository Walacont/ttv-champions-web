/**
 * Mobile Navigation Handler
 * Manages bottom navigation tabs and header icons for mobile devices
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileNav);
    } else {
        initMobileNav();
    }

    function initMobileNav() {
        // Only initialize if mobile navigation exists
        const bottomNav = document.querySelector('.mobile-bottom-nav');
        if (!bottomNav) return;

        setupBottomNavigation();
        setupMobileHeader();
        syncProfilePicture();
    }

    /**
     * Setup Bottom Navigation Tab Switching
     */
    function setupBottomNavigation() {
        const navItems = document.querySelectorAll('.mobile-nav-item');
        const tabButtons = document.querySelectorAll('.tab-button');

        navItems.forEach(navItem => {
            navItem.addEventListener('click', (e) => {
                e.preventDefault();

                const targetTab = navItem.getAttribute('data-mobile-tab');

                // Update active state on mobile nav items
                navItems.forEach(item => item.classList.remove('active'));
                navItem.classList.add('active');

                // Trigger desktop tab button click to switch content
                const targetButton = document.querySelector(`[data-tab="${targetTab}"]`);
                if (targetButton) {
                    targetButton.click();
                }

                // Update header based on active tab
                updateHeaderForTab(targetTab);
            });
        });

        // Sync with desktop tab changes
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tab = button.getAttribute('data-tab');
                syncMobileNavWithDesktop(tab);
                updateHeaderForTab(tab);
            });
        });
    }

    /**
     * Sync mobile nav active state with desktop tab
     */
    function syncMobileNavWithDesktop(activeTab) {
        const navItems = document.querySelectorAll('.mobile-nav-item');
        navItems.forEach(item => {
            const itemTab = item.getAttribute('data-mobile-tab');
            if (itemTab === activeTab) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    /**
     * Update mobile header based on active tab
     * Show Settings icon on "Du" (profile) tab, hide it otherwise
     */
    function updateHeaderForTab(tabName) {
        const notificationsBtn = document.getElementById('mobile-notifications-btn');
        const settingsBtn = document.getElementById('mobile-settings-btn');

        if (tabName === 'profile') {
            // On "Du" tab: hide notifications, show settings
            if (notificationsBtn) notificationsBtn.style.display = 'none';
            if (settingsBtn) settingsBtn.style.display = 'block';
        } else {
            // On other tabs: show notifications, hide settings
            if (notificationsBtn) notificationsBtn.style.display = 'block';
            if (settingsBtn) settingsBtn.style.display = 'none';
        }
    }

    /**
     * Setup Mobile Header Interactions
     */
    function setupMobileHeader() {
        // Search button (placeholder for future)
        const searchBtn = document.getElementById('mobile-search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                console.log('Search clicked - Feature coming soon');
                // TODO: Implement friend/club search
            });
        }

        // Chat button (placeholder for future)
        const chatBtn = document.getElementById('mobile-chat-btn');
        if (chatBtn) {
            chatBtn.addEventListener('click', () => {
                console.log('Chat clicked - Feature coming soon');
                // TODO: Implement chat feature
            });
        }

        // Notifications button (placeholder for future)
        const notificationsBtn = document.getElementById('mobile-notifications-btn');
        if (notificationsBtn) {
            notificationsBtn.addEventListener('click', () => {
                console.log('Notifications clicked - Feature coming soon');
                // TODO: Implement notifications
            });
        }

        // Profile picture click
        const profilePic = document.getElementById('mobile-profile-pic');
        if (profilePic) {
            profilePic.addEventListener('click', () => {
                // Navigate to profile tab
                const profileNavItem = document.querySelector('[data-mobile-tab="profile"]');
                if (profileNavItem) {
                    profileNavItem.click();
                }
            });
        }
    }

    /**
     * Sync mobile profile picture with desktop header profile picture
     */
    function syncProfilePicture() {
        const desktopProfilePic = document.getElementById('header-profile-pic');
        const mobileProfilePic = document.getElementById('mobile-profile-pic');

        if (!desktopProfilePic || !mobileProfilePic) return;

        // Initial sync
        if (desktopProfilePic.src) {
            mobileProfilePic.src = desktopProfilePic.src;
        }

        // Watch for changes (MutationObserver)
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                    mobileProfilePic.src = desktopProfilePic.src;
                }
            });
        });

        observer.observe(desktopProfilePic, {
            attributes: true,
            attributeFilter: ['src']
        });
    }

    /**
     * Update badge counter (for future notifications/chat)
     */
    window.updateMobileBadge = function(type, count) {
        const badge = document.getElementById(`mobile-${type}-badge`);
        if (!badge) return;

        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    };

    /**
     * Public API for external modules
     */
    window.MobileNav = {
        updateBadge: window.updateMobileBadge,
        switchToTab: function(tabName) {
            const navItem = document.querySelector(`[data-mobile-tab="${tabName}"]`);
            if (navItem) {
                navItem.click();
            }
        }
    };

})();
