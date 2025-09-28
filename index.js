/**
 * CCPrompt Manager - Centralized Prompt Template System
 *
 * Provides:
 * 1. Centralized template library with export/import
 * 2. Template embedding into ST presets (hybrid approach)
 * 3. Automatic synchronization when templates change
 * 4. Backup protection and recovery system
 */

import { eventSource, event_types, saveSettingsDebounced, getRequestHeaders } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { renderTemplateAsync } from '../../../templates.js';
import { Popup, callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '../../../popup.js';
import { getPresetManager } from '../../../preset-manager.js';
import { CCPromptStorage } from './storage.js';
import { CCPromptTemplateManager } from './template-manager.js';
import { CCPromptPresetIntegration } from './preset-integration.js';
import { CCPromptMarkerResolver } from './marker-resolver.js';
import { CCPromptSTCLIntegration } from './stcl-integration.js';

// Extension constants
const EXTENSION_NAME = 'ccprompt-manager';

/**
 * Main CCPrompt Manager class
 */
class CCPromptManager {
    constructor() {
        // Core components
        this.storage = new CCPromptStorage();
        this.templateManager = new CCPromptTemplateManager();
        this.presetIntegration = new CCPromptPresetIntegration();

        // Runtime components - STCL first since marker resolver depends on it
        this.stclIntegration = new CCPromptSTCLIntegration(this.templateManager);
        this.markerResolver = new CCPromptMarkerResolver(this.templateManager, this.templateManager.contentLibrary, this.stclIntegration);

        // UI state
        this.popup = null;
        this.activeTab = 'templates';

        // Settings
        this.settings = {
            enabled: true,
            debug: false,
            auto_sync: true,
            backup_rotation: 10,
            stcl_integration: true
        };
    }

    /**
     * Initialize the extension
     */
    async initialize() {
        console.log('CCPrompt Manager: Initializing...');

        try {
            // Initialize settings
            this.initializeSettings();

            // Initialize core components
            await this.storage.initialize();
            await this.templateManager.initialize();

            // Initialize STCL integration first if enabled
            if (this.settings.stcl_integration) {
                await this.stclIntegration.initialize();
            }

            // Initialize runtime components (after STCL for lock awareness)
            await this.markerResolver.initialize();

            // Initialize preset integration after runtime setup
            await this.presetIntegration.initialize();

            // Set up event listeners
            this.setupEventListeners();

            // Add UI controls
            this.addUIControls();

            console.log('CCPrompt Manager: Successfully initialized');

        } catch (error) {
            console.error('CCPrompt Manager: Initialization failed:', error);
        }
    }

    /**
     * Initialize extension settings
     */
    initializeSettings() {
        if (!extension_settings[EXTENSION_NAME]) {
            extension_settings[EXTENSION_NAME] = Object.assign({}, this.settings);
            saveSettingsDebounced();
        }
        this.settings = extension_settings[EXTENSION_NAME];
    }

    /**
     * Load all data from extension settings
     */
    async loadAllData() {
        const data = extension_settings[EXTENSION_NAME];

        this.templates = data.templates || this.getDefaultTemplates();
        this.presets = data.presets || {};
        this.bindings = data.bindings || { profiles: {}, models: {} };
    }

    /**
     * Get default templates (copy of ST's defaults)
     */
    getDefaultTemplates() {
        return structuredClone(chatCompletionDefaultPrompts.prompts);
    }

    /**
     * Save all data to extension settings
     */
    async saveAllData() {
        extension_settings[EXTENSION_NAME] = Object.assign({}, this.settings, {
            templates: this.templates,
            presets: this.presets,
            bindings: this.bindings
        });
        saveSettingsDebounced();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Intercept preset changes to apply our bindings
        eventSource.on(event_types.OAI_PRESET_CHANGED_BEFORE, (event) => {
            this.onPresetChanging(event);
        });
    }

    /**
     * Handle preset changing - this is where the magic happens
     */
    onPresetChanging(event) {
        if (!this.settings.enabled) return;

        try {
            // Check if we have a binding for this situation
            const activePreset = this.getActivePresetBinding();

            if (activePreset && this.presets[activePreset]) {
                console.log(`CCPrompt Manager: Applying preset '${activePreset}'`);

                // Override the prompts array with our preset
                event.preset.prompts = this.buildPromptList(activePreset);

                if (this.settings.debug) {
                    console.log('CCPrompt Manager: Applied prompts:', event.preset.prompts);
                }
            }

        } catch (error) {
            console.error('CCPrompt Manager: Error applying preset:', error);
        }
    }

    /**
     * Get which preset should be active based on bindings
     */
    getActivePresetBinding() {
        // Check profile binding (STCL integration)
        const currentProfile = this.getCurrentProfile();
        if (currentProfile && this.bindings.profiles[currentProfile]) {
            return this.bindings.profiles[currentProfile];
        }

        // Check model binding
        const currentModel = this.getCurrentModel();
        if (currentModel && this.bindings.models[currentModel]) {
            return this.bindings.models[currentModel];
        }

        // Check if we have a default preset
        if (this.bindings.default) {
            return this.bindings.default;
        }

        return null;
    }

    /**
     * Get current STCL profile if available
     */
    getCurrentProfile() {
        if (window.STCL && window.STCL.getCurrentProfile) {
            return window.STCL.getCurrentProfile();
        }
        return null;
    }

    /**
     * Get current model name
     */
    getCurrentModel() {
        // Try to get from various possible sources
        if (window.oai_settings && window.oai_settings.openai_model) {
            return window.oai_settings.openai_model;
        }
        if (window.main_api === 'openai' && window.settings && window.settings.model) {
            return window.settings.model;
        }
        return null;
    }

    /**
     * Build prompt list for a preset, merging templates and overrides
     */
    buildPromptList(presetName) {
        const preset = this.presets[presetName];
        const prompts = [];

        // Start with all templates
        for (const template of this.templates) {
            const prompt = structuredClone(template);

            // Check if this preset has an override for this prompt
            const override = preset.overrides && preset.overrides[template.identifier];
            if (override) {
                // Apply override (merge over template)
                Object.assign(prompt, override);
            }

            // Check if this prompt should be enabled in this preset
            const enabledState = preset.enabled && preset.enabled[template.identifier];
            if (enabledState !== undefined) {
                prompt.enabled = enabledState;
            }

            prompts.push(prompt);
        }

        // Add any custom prompts specific to this preset
        if (preset.custom) {
            prompts.push.apply(prompts, preset.custom);
        }

        return prompts;
    }

    /**
     * Add UI controls to ST interface
     */
    addUIControls() {
        // Add button to left nav panel
        this.addLeftNavButton();
    }

    /**
     * Add button to left navigation panel
     */
    addLeftNavButton() {
        // Find the completion prompt manager element
        const completionPromptManager = document.querySelector('#completion_prompt_manager');
        if (!completionPromptManager) {
            console.warn('CCPrompt Manager: Could not find #completion_prompt_manager element');
            return;
        }

        // Create our section
        const section = document.createElement('div');
        section.innerHTML = `
            <div class="margin0 title_restorable standoutHeader">
                <strong>CCPrompt Manager</strong>
            </div>
            <div class="range-block">
                <label class="checkbox_label">
                    <input type="checkbox" id="ccprompt_enabled" ${this.settings.enabled ? 'checked' : ''} />
                    <span>Enable Preset Override</span>
                </label>
            </div>
            <div class="range-block">
                <div class="flex-container gap3px">
                    <div class="menu_button menu_button_icon" id="ccprompt_manage" title="Manage Prompt Presets">
                        <i class="fa-fw fa-solid fa-folder-open"></i>
                    </div>
                    <div id="ccprompt_status" class="flex1 ccprompt-status flex-container alignitemscenter">
                        ${this.getStatusText()}
                    </div>
                </div>
            </div>
        `;

        // Insert before completion prompt manager
        completionPromptManager.insertAdjacentElement('beforebegin', section);

        // Add event listeners
        document.querySelector('#ccprompt_enabled').addEventListener('change', async (e) => {
            this.settings.enabled = e.target.checked;
            await this.saveSettings();
            this.updateStatus();
        });

        document.querySelector('#ccprompt_manage').addEventListener('click', () => {
            this.openManager();
        });
    }

    /**
     * Get status text for UI
     */
    getStatusText() {
        if (!this.settings.enabled) return 'Disabled';

        const activePreset = this.getActivePresetBinding();
        if (activePreset) {
            return `Active: ${activePreset}`;
        }

        return 'No binding';
    }

    /**
     * Update status display
     */
    updateStatus() {
        const statusEl = document.querySelector('#ccprompt_status');
        if (statusEl) {
            statusEl.textContent = this.getStatusText();
        }
    }

    /**
     * Save settings
     */
    async saveSettings() {
        await this.saveAllData();
    }

    /**
     * Open the manager popup
     */
    async openManager() {
        if (this.popup) return; // Already open

        try {
            const html = await this.renderManagerHTML();
            this.popup = new Popup(html, 'wide');
            this.popup.show();

            // Set up popup events
            this.setupPopupEvents();

            // Set popup close handler
            this.popup.onClose = () => {
                this.popup = null;
            };

        } catch (error) {
            console.error('CCPrompt Manager: Failed to open manager:', error);
        }
    }

    /**
     * Render the manager popup HTML
     */
    async renderManagerHTML() {
        const presetsList = Object.keys(this.presets).map(name =>
            `<div class="ccprompt-preset-item flex-container justifySpaceBetween alignitemscenter marginBot5" data-preset="${name}">
                <span class="ccprompt-preset-name">${name}</span>
                <div class="ccprompt-preset-actions flex-container gap10h5v">
                    <i class="fa fa-edit ccprompt-action" data-action="edit" title="Edit"></i>
                    <i class="fa fa-copy ccprompt-action" data-action="copy" title="Copy"></i>
                    <i class="fa fa-trash ccprompt-action" data-action="delete" title="Delete"></i>
                </div>
            </div>`
        ).join('');

        return `
            <div class="ccprompt-manager">
                <div class="ccprompt-tabs flex-container flexNoGap">
                    <div class="ccprompt-tab ${this.activeTab === 'presets' ? 'active' : ''}" data-tab="presets">Presets</div>
                    <div class="ccprompt-tab ${this.activeTab === 'templates' ? 'active' : ''}" data-tab="templates">Templates</div>
                    <div class="ccprompt-tab ${this.activeTab === 'bindings' ? 'active' : ''}" data-tab="bindings">Bindings</div>
                </div>

                <div class="ccprompt-content">
                    <div class="ccprompt-panel ${this.activeTab === 'presets' ? 'active' : ''}" data-panel="presets">
                        <div class="ccprompt-panel-header flex-container justifySpaceBetween alignitemscenter marginBot10">
                            <h3>Prompt Presets</h3>
                            <button class="menu_button" id="ccprompt_new_preset">New Preset</button>
                        </div>
                        <div class="ccprompt-presets-list">
                            ${presetsList || '<div class="ccprompt-empty">No presets created yet</div>'}
                        </div>
                    </div>

                    <div class="ccprompt-panel ${this.activeTab === 'templates' ? 'active' : ''}" data-panel="templates">
                        <div class="ccprompt-panel-header flex-container justifySpaceBetween alignitemscenter marginBot10">
                            <h3>Global Templates</h3>
                            <div class="ccprompt-header-actions">
                                <button class="menu_button" id="ccprompt_create_template">New Template</button>
                                <button class="menu_button" id="ccprompt_import_template">Import</button>
                                <button class="menu_button" id="ccprompt_export_library">Export Library</button>
                            </div>
                        </div>
                        <div class="ccprompt-templates-list" id="ccprompt_templates_list">
                            <div class="ccprompt-loading">Loading templates...</div>
                        </div>
                    </div>

                    <div class="ccprompt-panel ${this.activeTab === 'bindings' ? 'active' : ''}" data-panel="bindings">
                        <div class="ccprompt-panel-header flex-container justifySpaceBetween alignitemscenter marginBot10">
                            <h3>Preset Bindings</h3>
                        </div>
                        <div class="ccprompt-bindings-content">
                            ${this.renderBindingsContent()}
                        </div>
                    </div>
                </div>
            </div>

            <style>
            .ccprompt-manager { padding: 15px; }
            .ccprompt-tabs { border-bottom: 1px solid var(--SmartThemeBorderColor); margin-bottom: 15px; }
            .ccprompt-tab { padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; }
            .ccprompt-tab.active { border-bottom-color: var(--SmartThemeEmColor); color: var(--SmartThemeEmColor); }
            .ccprompt-tab:hover { background: var(--SmartThemeBlurTintColor); }
            .ccprompt-panel { display: none; }
            .ccprompt-panel.active { display: block; }
            .ccprompt-preset-item { padding: 8px; background: var(--SmartThemeBodyColor); border: 1px solid var(--SmartThemeBorderColor); border-radius: 3px; }
            .ccprompt-action { cursor: pointer; padding: 5px; }
            .ccprompt-action:hover { color: var(--SmartThemeEmColor); }
            .ccprompt-empty { text-align: center; color: var(--SmartThemeQuoteColor); padding: 20px; }
            .ccprompt-status { font-size: 0.9em; color: var(--SmartThemeQuoteColor); }
            </style>
        `;
    }

    /**
     * Render templates list
     */
    async renderTemplatesList() {
        try {
            const templates = await this.templateManager.listTemplates();

            if (templates.length === 0) {
                return `<div class="ccprompt-empty">No templates found. <a href="#" id="ccprompt_create_template">Create your first template</a></div>`;
            }

            return templates.map(template => {
                const markerCount = template.prompts ? template.prompts.filter(p => p.marker).length : 0;
                const contentCount = Object.keys(template.content || {}).length;

                return `<div class="ccprompt-template-item" data-template-id="${template.id}">
                    <div class="ccprompt-template-info">
                        <strong>${template.name}</strong>
                        <div class="ccprompt-template-meta">
                            <span class="ccprompt-template-id">ID: ${template.id.substring(0, 8)}...</span>
                            <span class="ccprompt-template-stats">${markerCount} prompts, ${contentCount} content items</span>
                            <span class="ccprompt-template-version">v${template.version}</span>
                        </div>
                        <div class="ccprompt-template-description">${template.description || 'No description'}</div>
                    </div>
                    <div class="ccprompt-template-actions">
                        <i class="fa fa-edit ccprompt-action" data-action="edit-template" data-template-id="${template.id}" title="Edit Template"></i>
                        <i class="fa fa-copy ccprompt-action" data-action="copy-template" data-template-id="${template.id}" title="Copy Template"></i>
                        <i class="fa fa-download ccprompt-action" data-action="export-template" data-template-id="${template.id}" title="Export Template"></i>
                        <i class="fa fa-magic ccprompt-action" data-action="apply-to-preset" data-template-id="${template.id}" title="Apply to Preset"></i>
                        <i class="fa fa-trash ccprompt-action" data-action="delete-template" data-template-id="${template.id}" title="Delete Template"></i>
                    </div>
                </div>`;
            }).join('');
        } catch (error) {
            console.error('CCPrompt Manager: Error rendering templates list:', error);
            return `<div class="ccprompt-error">Error loading templates: ${error.message}</div>`;
        }
    }

    /**
     * Render bindings content
     */
    renderBindingsContent() {
        const presetOptions = Object.keys(this.presets).map(name =>
            `<option value="${name}">${name}</option>`
        ).join('');

        return `
            <div class="range-block">
                <label>Default Preset:</label>
                <select id="ccprompt_default_binding" class="text_pole">
                    <option value="">None</option>
                    ${presetOptions}
                </select>
            </div>
            <div class="range-block">
                <h4>Profile Bindings</h4>
                <div id="ccprompt_profile_bindings">
                    ${this.renderProfileBindings()}
                </div>
                <button class="menu_button" id="ccprompt_add_profile_binding">Add Profile Binding</button>
            </div>
            <div class="range-block">
                <h4>Model Bindings</h4>
                <div id="ccprompt_model_bindings">
                    ${this.renderModelBindings()}
                </div>
                <button class="menu_button" id="ccprompt_add_model_binding">Add Model Binding</button>
            </div>
        `;
    }

    /**
     * Render profile bindings
     */
    renderProfileBindings() {
        return Object.entries(this.bindings.profiles).map(([profile, preset]) =>
            `<div class="ccprompt-binding-item">
                <span>Profile "${profile}" → ${preset}</span>
                <i class="fa fa-trash ccprompt-action" data-action="remove-profile-binding" data-profile="${profile}"></i>
            </div>`
        ).join('') || '<div class="ccprompt-empty">No profile bindings</div>';
    }

    /**
     * Render model bindings
     */
    renderModelBindings() {
        return Object.entries(this.bindings.models).map(([model, preset]) =>
            `<div class="ccprompt-binding-item">
                <span>Model "${model}" → ${preset}</span>
                <i class="fa fa-trash ccprompt-action" data-action="remove-model-binding" data-model="${model}"></i>
            </div>`
        ).join('') || '<div class="ccprompt-empty">No model bindings</div>';
    }

    /**
     * Set up popup event listeners
     */
    setupPopupEvents() {
        const popup = this.popup.dlg;

        // Tab switching
        popup.querySelectorAll('.ccprompt-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Template and preset actions
        popup.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            if (!action) return;

            const templateId = e.target.dataset.templateId;
            const presetName = e.target.closest('.ccprompt-preset-item')?.dataset.preset;

            switch (action) {
                // Template actions
                case 'edit-template':
                    await this.editTemplate(templateId);
                    break;
                case 'copy-template':
                    await this.copyTemplate(templateId);
                    break;
                case 'delete-template':
                    await this.deleteTemplate(templateId);
                    break;
                case 'export-template':
                    await this.exportTemplate(templateId);
                    break;
                case 'apply-to-preset':
                    await this.applyTemplateToPreset(templateId);
                    break;

                // Preset actions
                case 'edit':
                    this.editPreset(presetName);
                    break;
                case 'copy':
                    this.copyPreset(presetName);
                    break;
                case 'delete':
                    await this.deletePreset(presetName);
                    break;
            }
        });

        // Template header buttons
        const createTemplateBtn = popup.querySelector('#ccprompt_create_template');
        if (createTemplateBtn) {
            createTemplateBtn.addEventListener('click', async () => {
                await this.createTemplate();
            });
        }

        const importTemplateBtn = popup.querySelector('#ccprompt_import_template');
        if (importTemplateBtn) {
            importTemplateBtn.addEventListener('click', async () => {
                await this.importTemplate();
            });
        }

        const exportLibraryBtn = popup.querySelector('#ccprompt_export_library');
        if (exportLibraryBtn) {
            exportLibraryBtn.addEventListener('click', async () => {
                await this.exportLibrary();
            });
        }

        // New preset button
        const newPresetBtn = popup.querySelector('#ccprompt_new_preset');
        if (newPresetBtn) {
            newPresetBtn.addEventListener('click', async () => {
                await this.createNewPreset();
            });
        }
    }

    /**
     * Switch active tab
     */
    switchTab(tabName) {
        this.activeTab = tabName;

        // Update tab appearance
        this.popup.dlg.querySelectorAll('.ccprompt-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update panel appearance
        this.popup.dlg.querySelectorAll('.ccprompt-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tabName);
        });
    }

    /**
     * Create new preset
     */
    async createNewPreset() {
        const name = await callGenericPopup('Enter preset name:', POPUP_TYPE.INPUT);
        if (!name || this.presets[name]) return;

        this.presets[name] = {
            overrides: {},
            enabled: {},
            custom: []
        };

        await this.saveAllData();
        await this.refreshManager();
    }

    /**
     * Edit preset
     */
    editPreset(presetName) {
        // TODO: Implement preset editor
        toastr.info(`Edit preset: ${presetName} (not implemented yet)`);
    }

    /**
     * Copy preset
     */
    async copyPreset(presetName) {
        const newName = await callGenericPopup(`Copy "${presetName}" as:`, POPUP_TYPE.INPUT);
        if (!newName || this.presets[newName]) return;

        this.presets[newName] = structuredClone(this.presets[presetName]);
        await this.saveAllData();
        await this.refreshManager();
    }

    /**
     * Delete preset
     */
    async deletePreset(presetName) {
        const confirmed = await callGenericPopup(`Delete preset "${presetName}"?`, POPUP_TYPE.CONFIRM);
        if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;

        delete this.presets[presetName];
        await this.saveAllData();
        await this.refreshManager();
    }

    /**
     * Refresh manager content
     */
    async refreshManager() {
        if (!this.popup) return;

        const newHTML = await this.renderManagerHTML();
        this.popup.dlg.innerHTML = newHTML;
        this.setupPopupEvents();

        // Load templates list asynchronously
        await this.loadTemplatesList();

        this.updateStatus();
    }

    /**
     * Load and render templates list
     */
    async loadTemplatesList() {
        const templatesList = document.getElementById('ccprompt_templates_list');
        if (!templatesList) return;

        try {
            const templatesHTML = await this.renderTemplatesList();
            templatesList.innerHTML = templatesHTML;
        } catch (error) {
            console.error('CCPrompt Manager: Error loading templates list:', error);
            templatesList.innerHTML = `<div class="ccprompt-error">Error loading templates: ${error.message}</div>`;
        }
    }

    /**
     * Get comprehensive system status including STCL lock information
     * @returns {Object} Complete system status
     */
    getSystemStatus() {
        return {
            extension: {
                enabled: this.settings.enabled,
                version: '1.0.0',
                stcl_integration_enabled: this.settings.stcl_integration
            },
            components: {
                storage: {
                    initialized: !!this.storage
                },
                template_manager: {
                    initialized: !!this.templateManager
                },
                marker_resolver: {
                    ...this.markerResolver.getResolutionStats()
                },
                stcl_integration: {
                    ...this.stclIntegration.getStatus()
                },
                preset_integration: {
                    initialized: !!this.presetIntegration
                }
            },
            ui: {
                popup_open: !!this.popup,
                active_tab: this.activeTab
            }
        };
    }

    /**
     * Check if a specific marker is locked by STCL
     * @param {string} markerId - Marker identifier to check
     * @returns {boolean} True if locked
     */
    isMarkerLocked(markerId) {
        return this.stclIntegration.isMarkerLocked(markerId);
    }

    /**
     * Get all currently locked CCPrompt markers
     * @returns {Array<string>} Array of locked marker IDs
     */
    getLockedMarkers() {
        return this.stclIntegration.getLockedMarkers();
    }

    /**
     * Apply a template to a preset
     * @param {string} presetName - Preset name
     * @param {string} templateId - Template ID
     * @param {Object} options - Application options
     * @returns {Promise<Object>} Application result
     */
    async applyTemplateToPreset(presetName, templateId, options = {}) {
        return await this.presetIntegration.applyTemplateToPreset(presetName, templateId, options);
    }

    /**
     * Add a template reference to a preset
     * @param {string} presetName - Preset name
     * @param {string} promptId - Prompt identifier
     * @param {string} templateId - Template ID
     * @param {string} templatePrompt - Template prompt identifier
     */
    async addTemplateReference(presetName, promptId, templateId, templatePrompt) {
        return await this.presetIntegration.addTemplateReference(presetName, promptId, templateId, templatePrompt);
    }

    /**
     * Remove a template reference from a preset
     * @param {string} presetName - Preset name
     * @param {string} promptId - Prompt identifier
     */
    async removeTemplateReference(presetName, promptId) {
        return await this.presetIntegration.removeTemplateReference(presetName, promptId);
    }

    /**
     * Sync presets with a template
     * @param {string} templateId - Template ID
     */
    async syncPresetsWithTemplate(templateId) {
        return await this.presetIntegration.syncPresetsWithTemplate(templateId);
    }

    /**
     * Get template usage statistics across presets
     * @returns {Promise<Object>} Usage statistics
     */
    async getTemplateUsageStats() {
        return await this.presetIntegration.getTemplateUsageStats();
    }

    /**
     * Create a new template
     */
    async createTemplate() {
        const name = await callGenericPopup('Template name:', POPUP_TYPE.INPUT);
        if (!name) return;

        const description = await callGenericPopup('Template description (optional):', POPUP_TYPE.INPUT) || '';

        try {
            const templateId = await this.templateManager.createTemplate(name, description);
            console.log(`CCPrompt Manager: Created template '${name}' with ID: ${templateId}`);
            await this.loadTemplatesList();
            this.editTemplate(templateId);
        } catch (error) {
            console.error('CCPrompt Manager: Error creating template:', error);
            toastr.error(`Error creating template: ${error.message}`);
        }
    }

    /**
     * Edit a template
     * @param {string} templateId - Template ID
     */
    async editTemplate(templateId) {
        try {
            const template = await this.templateManager.getTemplate(templateId);
            if (!template) {
                toastr.error('Template not found');
                return;
            }

            // Create template editor popup
            const editorHTML = await this.renderTemplateEditor(template);
            const editorPopup = new Popup(editorHTML, 'wide_dialogue_popup');
            editorPopup.show();

            // Set up editor events
            this.setupTemplateEditorEvents(editorPopup, templateId);

        } catch (error) {
            console.error('CCPrompt Manager: Error editing template:', error);
            toastr.error(`Error editing template: ${error.message}`);
        }
    }

    /**
     * Copy a template
     * @param {string} templateId - Template ID to copy
     */
    async copyTemplate(templateId) {
        try {
            const template = await this.templateManager.getTemplate(templateId);
            if (!template) {
                toastr.error('Template not found');
                return;
            }

            const name = await callGenericPopup(`Copy "${template.name}" as:`, POPUP_TYPE.INPUT, `${template.name} (Copy)`);
            if (!name) return;

            const newTemplateId = await this.templateManager.copyTemplate(templateId, name);
            console.log(`CCPrompt Manager: Copied template to '${name}' with ID: ${newTemplateId}`);
            await this.loadTemplatesList();

        } catch (error) {
            console.error('CCPrompt Manager: Error copying template:', error);
            toastr.error(`Error copying template: ${error.message}`);
        }
    }

    /**
     * Delete a template
     * @param {string} templateId - Template ID to delete
     */
    async deleteTemplate(templateId) {
        try {
            const template = await this.templateManager.getTemplate(templateId);
            if (!template) {
                toastr.error('Template not found');
                return;
            }

            const confirmed = await callGenericPopup(`Delete template "${template.name}"? This cannot be undone.`, POPUP_TYPE.CONFIRM);
            if (confirmed !== POPUP_RESULT.AFFIRMATIVE) {
                return;
            }

            await this.templateManager.deleteTemplate(templateId);
            console.log(`CCPrompt Manager: Deleted template '${template.name}'`);
            await this.loadTemplatesList();

        } catch (error) {
            console.error('CCPrompt Manager: Error deleting template:', error);
            toastr.error(`Error deleting template: ${error.message}`);
        }
    }

    /**
     * Export a template
     * @param {string} templateId - Template ID to export
     */
    async exportTemplate(templateId) {
        try {
            const exportData = await this.storage.exportLibrary({
                format: 'single',
                template_id: templateId,
                include_metadata: true
            });

            const template = await this.templateManager.getTemplate(templateId);
            const filename = `ccprompt-template-${template.name.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;

            // Create download
            const blob = new Blob([exportData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            console.log(`CCPrompt Manager: Exported template '${template.name}'`);

        } catch (error) {
            console.error('CCPrompt Manager: Error exporting template:', error);
            toastr.error(`Error exporting template: ${error.message}`);
        }
    }

    /**
     * Export entire library
     */
    async exportLibrary() {
        try {
            const exportData = await this.storage.exportLibrary({
                format: 'full',
                include_metadata: true
            });

            const filename = `ccprompt-library-${new Date().toISOString().slice(0, 10)}.json`;

            // Create download
            const blob = new Blob([exportData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            console.log('CCPrompt Manager: Exported library');

        } catch (error) {
            console.error('CCPrompt Manager: Error exporting library:', error);
            toastr.error(`Error exporting library: ${error.message}`);
        }
    }

    /**
     * Import template or library
     */
    async importTemplate() {
        try {
            // Create file input
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = async (event) => {
                const file = event.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const importData = JSON.parse(text);

                    // Import with conflict resolution
                    const result = await this.storage.importLibrary(importData, {
                        mode: 'merge',
                        conflict: 'newer',
                        backup_first: true
                    });

                    console.log('CCPrompt Manager: Import completed:', result);
                    toastr.success(`Successfully imported ${result.templatesImported} template(s)`);
                    await this.loadTemplatesList();

                } catch (error) {
                    console.error('CCPrompt Manager: Error importing:', error);
                    toastr.error(`Error importing: ${error.message}`);
                }
            };

            input.click();

        } catch (error) {
            console.error('CCPrompt Manager: Error setting up import:', error);
            toastr.error(`Error setting up import: ${error.message}`);
        }
    }

    /**
     * Apply template to preset
     * @param {string} templateId - Template ID
     */
    async applyTemplateToPreset(templateId) {
        try {
            const template = await this.templateManager.getTemplate(templateId);
            if (!template) {
                toastr.error('Template not found');
                return;
            }

            // Get preset list for selection
            const oaiPresetManager = getPresetManager('openai');
            const { preset_names } = oaiPresetManager.getPresetList();
            const presetNames = Object.keys(preset_names);

            if (presetNames.length === 0) {
                toastr.warning('No presets available. Create a preset first.');
                return;
            }

            // Simple preset selection (could be enhanced with a proper dialog)
            const presetName = await callGenericPopup(`Apply template "${template.name}" to preset:\n\nAvailable presets:\n${presetNames.join('\n')}\n\nEnter preset name:`, POPUP_TYPE.INPUT);
            if (!presetName || !presetNames.includes(presetName)) {
                if (presetName) {
                    toastr.error('Invalid preset name');
                }
                return;
            }

            const result = await this.presetIntegration.applyTemplateToPreset(presetName, templateId, {
                preserve_prompt_order: true,
                overwrite_existing: await callGenericPopup('Overwrite existing prompts in preset?', POPUP_TYPE.CONFIRM) === POPUP_RESULT.AFFIRMATIVE
            });

            console.log('CCPrompt Manager: Applied template to preset:', result);
            toastr.success(`Successfully applied template "${template.name}" to preset "${presetName}"`);

        } catch (error) {
            console.error('CCPrompt Manager: Error applying template to preset:', error);
            toastr.error(`Error applying template: ${error.message}`);
        }
    }

    /**
     * Render template editor HTML
     * @param {Object} template - Template to edit
     * @returns {string} Editor HTML
     */
    async renderTemplateEditor(template) {
        const prompts = template.prompts || [];
        const content = template.content || {};

        const promptsHTML = prompts.map((prompt, index) => {
            const contentId = prompt.ccprompt_ref ? prompt.ccprompt_ref.content_id : 'main';
            const promptContent = content[contentId] || '';

            return `
                <div class="ccprompt-editor-prompt" data-prompt-index="${index}">
                    <div class="ccprompt-editor-prompt-header flex-container gap10h5v alignitemscenter">
                        <input type="text" class="text_pole" placeholder="Prompt Name" value="${prompt.name || ''}" data-field="name">
                        <select class="text_pole" data-field="role">
                            <option value="system" ${prompt.role === 'system' ? 'selected' : ''}>System</option>
                            <option value="user" ${prompt.role === 'user' ? 'selected' : ''}>User</option>
                            <option value="assistant" ${prompt.role === 'assistant' ? 'selected' : ''}>Assistant</option>
                        </select>
                        <button class="menu_button" data-action="delete-prompt" data-prompt-index="${index}">Delete</button>
                    </div>
                    <div class="ccprompt-editor-prompt-body">
                        <label>Content ID:</label>
                        <input type="text" class="text_pole" value="${contentId}" data-field="content_id" readonly>
                        <label>Content:</label>
                        <textarea class="text_pole wide100" rows="10" data-field="content" data-content-id="${contentId}">${promptContent}</textarea>
                    </div>
                    <div class="ccprompt-editor-prompt-settings flex-container gap10h5v alignitemscenter">
                        <label><input type="checkbox" ${prompt.system_prompt ? 'checked' : ''} data-field="system_prompt"> System Prompt</label>
                        <label>Position: <input type="number" class="text_pole" value="${prompt.injection_position || 0}" data-field="injection_position"></label>
                        <label>Depth: <input type="number" class="text_pole" value="${prompt.injection_depth || 4}" data-field="injection_depth"></label>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="ccprompt-template-editor">
                <h2>Edit Template: ${template.name}</h2>

                <div class="ccprompt-editor-header">
                    <div class="range-block">
                        <label>Template Name:</label>
                        <input type="text" id="template-name" class="text_pole" value="${template.name || ''}">
                    </div>
                    <div class="range-block">
                        <label>Description:</label>
                        <textarea id="template-description" class="text_pole" rows="3">${template.description || ''}</textarea>
                    </div>
                </div>

                <div class="ccprompt-editor-prompts">
                    <div class="ccprompt-editor-prompts-header flex-container justifySpaceBetween alignitemscenter">
                        <h3>Prompts</h3>
                        <button class="menu_button" id="add-prompt">Add Prompt</button>
                    </div>
                    <div class="ccprompt-editor-prompts-list">
                        ${promptsHTML}
                    </div>
                </div>

                <div class="ccprompt-editor-actions">
                    <button class="menu_button" id="save-template">Save Template</button>
                    <button class="menu_button" id="cancel-edit">Cancel</button>
                </div>
            </div>

            <style>
            .ccprompt-template-editor { padding: 20px; max-width: 800px; }
            .ccprompt-editor-prompt { border: 1px solid var(--SmartThemeBorderColor); margin-bottom: 15px; padding: 15px; border-radius: 5px; }
            .ccprompt-editor-prompt-header { margin-bottom: 10px; }
            .ccprompt-editor-prompt-header input, .ccprompt-editor-prompt-header select { flex: 1; }
            .ccprompt-editor-prompt-settings { margin-top: 10px; }
            .ccprompt-editor-prompts-header { margin-bottom: 15px; }
            .ccprompt-editor-actions { text-align: center; margin-top: 20px; }
            .ccprompt-editor-actions button { margin: 0 10px; }
            </style>
        `;
    }

    /**
     * Set up template editor event handlers
     * @param {Object} editorPopup - Editor popup instance
     * @param {string} templateId - Template ID being edited
     */
    setupTemplateEditorEvents(editorPopup, templateId) {
        const editor = editorPopup.dlg;

        // Save template
        editor.querySelector('#save-template').addEventListener('click', async () => {
            try {
                await this.saveTemplateFromEditor(templateId, editor);
                editorPopup.complete();
                await this.loadTemplatesList();
            } catch (error) {
                console.error('CCPrompt Manager: Error saving template:', error);
                toastr.error(`Error saving template: ${error.message}`);
            }
        });

        // Cancel editing
        editor.querySelector('#cancel-edit').addEventListener('click', () => {
            editorPopup.complete();
        });

        // Add prompt
        editor.querySelector('#add-prompt').addEventListener('click', () => {
            this.addPromptToEditor(editor);
        });

        // Delete prompt
        editor.addEventListener('click', async (e) => {
            if (e.target.dataset.action === 'delete-prompt') {
                const promptIndex = e.target.dataset.promptIndex;
                const promptElement = editor.querySelector(`[data-prompt-index="${promptIndex}"]`);
                if (promptElement && await callGenericPopup('Delete this prompt?', POPUP_TYPE.CONFIRM) === POPUP_RESULT.AFFIRMATIVE) {
                    promptElement.remove();
                }
            }
        });
    }

    /**
     * Save template from editor
     * @param {string} templateId - Template ID
     * @param {Element} editor - Editor element
     */
    async saveTemplateFromEditor(templateId, editor) {
        const template = await this.templateManager.getTemplate(templateId);
        if (!template) throw new Error('Template not found');

        // Update basic info
        template.name = editor.querySelector('#template-name').value;
        template.description = editor.querySelector('#template-description').value;

        // Update prompts and content
        const promptElements = editor.querySelectorAll('.ccprompt-editor-prompt');
        template.prompts = [];
        template.content = {};

        promptElements.forEach((promptEl, index) => {
            const name = promptEl.querySelector('[data-field="name"]').value;
            const role = promptEl.querySelector('[data-field="role"]').value;
            const contentId = promptEl.querySelector('[data-field="content_id"]').value;
            const content = promptEl.querySelector('[data-field="content"]').value;
            const systemPrompt = promptEl.querySelector('[data-field="system_prompt"]').checked;
            const position = parseInt(promptEl.querySelector('[data-field="injection_position"]').value) || 0;
            const depth = parseInt(promptEl.querySelector('[data-field="injection_depth"]').value) || 4;

            // Create marker prompt
            const shortId = templateId.substring(0, 8);
            const prompt = {
                identifier: `cc-${shortId}-${contentId}`,
                name: name,
                role: role,
                marker: true,
                ccprompt_ref: {
                    content_id: contentId
                },
                system_prompt: systemPrompt,
                injection_position: position,
                injection_depth: depth
            };

            template.prompts.push(prompt);
            template.content[contentId] = content;
        });

        // Save template
        await this.templateManager.updateTemplate(templateId, template);
    }

    /**
     * Add a new prompt to the editor
     * @param {Element} editor - Editor element
     */
    addPromptToEditor(editor) {
        const promptsList = editor.querySelector('.ccprompt-editor-prompts-list');
        const promptCount = editor.querySelectorAll('.ccprompt-editor-prompt').length;
        const contentId = `prompt-${promptCount + 1}`;

        const newPromptHTML = `
            <div class="ccprompt-editor-prompt" data-prompt-index="${promptCount}">
                <div class="ccprompt-editor-prompt-header flex-container gap10h5v alignitemscenter">
                    <input type="text" class="text_pole" placeholder="Prompt Name" value="New Prompt" data-field="name">
                    <select class="text_pole" data-field="role">
                        <option value="system" selected>System</option>
                        <option value="user">User</option>
                        <option value="assistant">Assistant</option>
                    </select>
                    <button class="menu_button" data-action="delete-prompt" data-prompt-index="${promptCount}">Delete</button>
                </div>
                <div class="ccprompt-editor-prompt-body">
                    <label>Content ID:</label>
                    <input type="text" class="text_pole" value="${contentId}" data-field="content_id" readonly>
                    <label>Content:</label>
                    <textarea class="text_pole wide100" rows="10" data-field="content" data-content-id="${contentId}"></textarea>
                </div>
                <div class="ccprompt-editor-prompt-settings flex-container gap10h5v alignitemscenter">
                    <label><input type="checkbox" data-field="system_prompt"> System Prompt</label>
                    <label>Position: <input type="number" class="text_pole" value="0" data-field="injection_position"></label>
                    <label>Depth: <input type="number" class="text_pole" value="4" data-field="injection_depth"></label>
                </div>
            </div>
        `;

        promptsList.insertAdjacentHTML('beforeend', newPromptHTML);
    }
}

// Global instance
let ccPromptManager = null;

// Initialize when DOM is ready
jQuery(async () => {
    try {
        ccPromptManager = new CCPromptManager();
        await ccPromptManager.initialize();

        // Make available globally
        window.CCPromptManager = ccPromptManager;

    } catch (error) {
        console.error('CCPrompt Manager: Failed to initialize:', error);
    }
});