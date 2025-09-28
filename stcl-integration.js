/**
 * CCPrompt Manager - STCL Integration
 *
 * Bridges CCPrompt Manager with SillyTavern Character Locks (STCL)
 * for profile-aware template selection and lock-aware prompt handling.
 */

import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

export class CCPromptSTCLIntegration {
    constructor(templateManager) {
        this.templateManager = templateManager;
        this.stclAvailable = false;
        this.currentProfile = null;
        this.listeners = [];
        this.initialized = false;
    }

    /**
     * Initialize STCL integration
     */
    async initialize() {
        try {
            // Check if STCL is available
            if (!this.checkSTCLAvailability()) {
                console.log('CCPrompt STCL: STCL not detected, profile features disabled');
                return;
            }

            this.stclAvailable = true;

            // Wait for STCL to be ready
            if (window.STCL.isReady()) {
                this.setupSTCLListeners();
            } else {
                // Wait for STCL ready event
                window.STCL.on(window.STCL.events.READY, () => {
                    this.setupSTCLListeners();
                });
            }

            this.initialized = true;
            console.log('CCPrompt STCL: Integration initialized');

        } catch (error) {
            console.error('CCPrompt STCL: Error during initialization:', error);
        }
    }

    /**
     * Check if STCL is available and compatible
     * @returns {boolean} True if STCL is available
     */
    checkSTCLAvailability() {
        if (!window.STCL) {
            return false;
        }

        // Check for required API methods
        const requiredMethods = [
            'getCurrentProfile',
            'getProfiles',
            'isLocked',
            'getLockedPrompts',
            'isEnabled',
            'on',
            'off'
        ];

        for (const method of requiredMethods) {
            if (typeof window.STCL[method] !== 'function') {
                console.warn(`CCPrompt STCL: Missing required method: ${method}`);
                return false;
            }
        }

        // Check for required events
        if (!window.STCL.events) {
            console.warn('CCPrompt STCL: Missing events object');
            return false;
        }

        console.log(`CCPrompt STCL: Compatible STCL detected (version: ${window.STCL.version || 'unknown'})`);
        return true;
    }

    /**
     * Set up STCL event listeners
     */
    setupSTCLListeners() {
        try {
            // Listen for profile switches
            const unsubProfileSwitch = window.STCL.on(
                window.STCL.events.PROFILE_SWITCHED,
                (data) => this.onProfileSwitched(data)
            );
            this.listeners.push(unsubProfileSwitch);

            // Listen for lock changes
            const unsubLockChange = window.STCL.on(
                window.STCL.events.LOCK_CHANGED,
                (data) => this.onLockChanged(data)
            );
            this.listeners.push(unsubLockChange);

            // Listen for STCL enabled/disabled
            const unsubEnabled = window.STCL.on(
                window.STCL.events.ENABLED,
                () => this.onSTCLEnabled()
            );
            this.listeners.push(unsubEnabled);

            const unsubDisabled = window.STCL.on(
                window.STCL.events.DISABLED,
                () => this.onSTCLDisabled()
            );
            this.listeners.push(unsubDisabled);

            // Listen for preset events
            if (window.STCL.events.PRESET_SAVING) {
                const unsubPresetSaving = window.STCL.on(
                    window.STCL.events.PRESET_SAVING,
                    (data) => this.onPresetSaving(data)
                );
                this.listeners.push(unsubPresetSaving);
            }

            // Initialize current profile
            this.currentProfile = window.STCL.getCurrentProfile();

            console.log(`CCPrompt STCL: Event listeners set up, current profile: ${this.currentProfile || 'none'}`);

        } catch (error) {
            console.error('CCPrompt STCL: Error setting up listeners:', error);
        }
    }

    /**
     * Handle profile switch event
     * @param {Object} data - Profile switch event data
     */
    async onProfileSwitched(data) {
        try {
            console.log(`CCPrompt STCL: Profile switched from ${data.previousProfile || 'none'} to ${data.profile || 'none'}`);

            const oldProfile = this.currentProfile;
            this.currentProfile = data.profile;

            // Check if auto-switch is enabled
            const settings = this.getSettings();
            if (!settings.auto_switch_on_profile_change) {
                console.log('CCPrompt STCL: Auto-switch disabled, skipping template change');
                return;
            }

            // Get template preference for new profile
            const templateId = await this.getProfileTemplatePreference(data.profile);

            if (templateId) {
                console.log(`CCPrompt STCL: Auto-switching to template ${templateId} for profile ${data.profile}`);

                // Emit custom event for other parts of CCPrompt Manager
                this.emitProfileTemplateChange(oldProfile, data.profile, templateId);
            } else {
                console.log(`CCPrompt STCL: No template preference set for profile ${data.profile}`);
            }

        } catch (error) {
            console.error('CCPrompt STCL: Error handling profile switch:', error);
        }
    }

    /**
     * Handle lock status change
     * @param {Object} data - Lock change event data
     */
    onLockChanged(data) {
        try {
            console.log(`CCPrompt STCL: Lock changed for ${data.promptId}: ${data.isLocked ? 'locked' : 'unlocked'}`);

            // If a CCPrompt marker is involved, we should be aware
            if (data.promptId.startsWith('cc-')) {
                console.log(`CCPrompt STCL: CCPrompt marker ${data.promptId} lock status changed`);

                // Emit custom event for marker resolver and UI
                this.emitMarkerLockChange(data.promptId, data.isLocked, data.wasLocked);
            }

        } catch (error) {
            console.error('CCPrompt STCL: Error handling lock change:', error);
        }
    }

    /**
     * Handle STCL enabled event
     */
    onSTCLEnabled() {
        console.log('CCPrompt STCL: STCL has been enabled');
        // Could trigger template re-evaluation here
    }

    /**
     * Handle STCL disabled event
     */
    onSTCLDisabled() {
        console.log('CCPrompt STCL: STCL has been disabled');
        // Locks no longer apply, could trigger template re-evaluation
    }

    /**
     * Handle preset saving event (if available)
     * @param {Object} data - Preset saving event data
     */
    onPresetSaving(data) {
        console.log('CCPrompt STCL: Preset saving detected:', data);
        // Could use this to ensure template markers are properly embedded
    }

    /**
     * Get CCPrompt Manager settings with STCL-related defaults
     * @returns {Object} Settings object
     */
    getSettings() {
        const settings = extension_settings.ccprompt_manager || {};

        // Ensure STCL-related settings exist with defaults
        if (!settings.profile_templates) {
            settings.profile_templates = {};
        }

        if (settings.auto_switch_on_profile_change === undefined) {
            settings.auto_switch_on_profile_change = false; // Default to false for safety
        }

        if (!settings.default_template) {
            settings.default_template = null;
        }

        return settings;
    }

    /**
     * Save settings
     * @param {Object} newSettings - Settings to merge
     */
    saveSettings(newSettings) {
        const currentSettings = this.getSettings();
        Object.assign(currentSettings, newSettings);

        extension_settings.ccprompt_manager = currentSettings;
        saveSettingsDebounced();
    }

    /**
     * Get profile-specific template preference
     * @param {string} profileName - Profile name
     * @returns {Promise<string|null>} Template ID or null
     */
    async getProfileTemplatePreference(profileName) {
        if (!profileName) return null;

        const settings = this.getSettings();
        return settings.profile_templates[profileName] || null;
    }

    /**
     * Set profile-specific template preference
     * @param {string} profileName - Profile name
     * @param {string} templateId - Template ID (null to remove)
     */
    async setProfileTemplatePreference(profileName, templateId) {
        if (!profileName) return;

        const settings = this.getSettings();

        if (templateId) {
            settings.profile_templates[profileName] = templateId;
        } else {
            delete settings.profile_templates[profileName];
        }

        this.saveSettings(settings);
        console.log(`CCPrompt STCL: Set template preference for profile '${profileName}': ${templateId || 'none'}`);
    }

    /**
     * Get all profile template mappings
     * @returns {Object} Profile name -> template ID mappings
     */
    getProfileTemplateMappings() {
        const settings = this.getSettings();
        return { ...settings.profile_templates };
    }

    /**
     * Check if a CCPrompt marker is locked by STCL
     * @param {string} markerId - Marker identifier
     * @returns {boolean} True if locked
     */
    isMarkerLocked(markerId) {
        if (!this.stclAvailable || !window.STCL.isEnabled()) {
            return false;
        }

        try {
            return window.STCL.isLocked(markerId);
        } catch (error) {
            console.error('CCPrompt STCL: Error checking lock status:', error);
            return false;
        }
    }

    /**
     * Get all locked CCPrompt markers
     * @returns {Array<string>} Array of locked marker IDs
     */
    getLockedMarkers() {
        if (!this.stclAvailable || !window.STCL.isEnabled()) {
            return [];
        }

        try {
            const allLocked = window.STCL.getLockedPrompts();
            return allLocked.filter(id => id.startsWith('cc-'));
        } catch (error) {
            console.error('CCPrompt STCL: Error getting locked prompts:', error);
            return [];
        }
    }

    /**
     * Get current profile (null if STCL not available)
     * @returns {string|null} Current profile name
     */
    getCurrentProfile() {
        if (!this.stclAvailable) return null;
        return this.currentProfile;
    }

    /**
     * Get all available profiles
     * @returns {Array<string>} Array of profile names
     */
    getProfiles() {
        if (!this.stclAvailable) return [];

        try {
            return window.STCL.getProfiles();
        } catch (error) {
            console.error('CCPrompt STCL: Error getting profiles:', error);
            return [];
        }
    }

    /**
     * Check if STCL is available and enabled
     * @returns {boolean} True if STCL is available and enabled
     */
    isSTCLEnabled() {
        if (!this.stclAvailable) return false;

        try {
            return window.STCL.isEnabled();
        } catch (error) {
            console.error('CCPrompt STCL: Error checking enabled status:', error);
            return false;
        }
    }

    /**
     * Emit custom event for profile template change
     * @param {string} oldProfile - Previous profile
     * @param {string} newProfile - New profile
     * @param {string} templateId - Template ID for new profile
     */
    emitProfileTemplateChange(oldProfile, newProfile, templateId) {
        // Use ST's event system if available
        if (window.eventSource) {
            window.eventSource.emit('ccprompt_profile_template_change', {
                old_profile: oldProfile,
                new_profile: newProfile,
                template_id: templateId,
                timestamp: new Date().toISOString()
            });
        }

        // Also emit through custom event
        document.dispatchEvent(new CustomEvent('ccprompt:profile-template-change', {
            detail: {
                oldProfile,
                newProfile,
                templateId
            }
        }));
    }

    /**
     * Emit custom event for marker lock change
     * @param {string} markerId - Marker ID
     * @param {boolean} isLocked - New lock status
     * @param {boolean} wasLocked - Previous lock status
     */
    emitMarkerLockChange(markerId, isLocked, wasLocked) {
        // Use ST's event system if available
        if (window.eventSource) {
            window.eventSource.emit('ccprompt_marker_lock_change', {
                marker_id: markerId,
                is_locked: isLocked,
                was_locked: wasLocked,
                timestamp: new Date().toISOString()
            });
        }

        // Also emit through custom event
        document.dispatchEvent(new CustomEvent('ccprompt:marker-lock-change', {
            detail: {
                markerId,
                isLocked,
                wasLocked
            }
        }));
    }

    /**
     * Get STCL integration status and statistics
     * @returns {Object} Status and stats
     */
    getStatus() {
        return {
            stcl_available: this.stclAvailable,
            stcl_enabled: this.isSTCLEnabled(),
            current_profile: this.getCurrentProfile(),
            profiles: this.getProfiles(),
            locked_markers: this.getLockedMarkers(),
            profile_mappings: this.getProfileTemplateMappings(),
            settings: this.getSettings(),
            listeners_count: this.listeners.length,
            initialized: this.initialized
        };
    }

    /**
     * Clean up listeners and resources
     */
    cleanup() {
        // Unsubscribe from all STCL events
        this.listeners.forEach(unsubscribe => {
            try {
                unsubscribe();
            } catch (error) {
                console.error('CCPrompt STCL: Error during cleanup:', error);
            }
        });

        this.listeners = [];
        this.stclAvailable = false;
        this.currentProfile = null;
        this.initialized = false;

        console.log('CCPrompt STCL: Integration cleaned up');
    }
}