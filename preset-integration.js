/**
 * CCPrompt Manager - Preset Integration
 *
 * Handles integration with SillyTavern's preset system,
 * embedding template content and managing synchronization.
 */

import { getPresetManager } from '../../../preset-manager.js';
import { eventSource, event_types } from '../../../../script.js';
import { CCPromptTemplateManager } from './template-manager.js';

export class CCPromptPresetIntegration {
    constructor() {
        this.templateManager = new CCPromptTemplateManager();
        this.originalSavePreset = null;
        this.isHooked = false;
    }

    /**
     * Initialize preset integration
     */
    async initialize() {
        await this.templateManager.initialize();
        this.hookPresetOperations();
        this.setupEventListeners();
    }

    /**
     * Hook into SillyTavern's preset operations
     */
    hookPresetOperations() {
        if (this.isHooked) return;

        try {
            const oaiPresetManager = getPresetManager('openai');
            if (!oaiPresetManager) {
                console.warn('CCPrompt PresetIntegration: OpenAI preset manager not found');
                return;
            }

            // Store original method
            this.originalSavePreset = oaiPresetManager.savePreset.bind(oaiPresetManager);

            // Hook savePreset to inject template markers
            oaiPresetManager.savePreset = async (name, settings, options) => {
                try {
                    // Embed template markers if preset has template references
                    if (settings?.extensions?.ccprompt_manager) {
                        settings = await this.embedTemplateMarkers(settings);
                    }

                    // Call original save method
                    return await this.originalSavePreset(name, settings, options);

                } catch (error) {
                    console.error('CCPrompt PresetIntegration: Error in hooked savePreset:', error);
                    // Fallback to original method on error
                    return await this.originalSavePreset(name, settings, options);
                }
            };

            this.isHooked = true;
            console.log('CCPrompt PresetIntegration: Successfully hooked preset operations');

        } catch (error) {
            console.error('CCPrompt PresetIntegration: Error hooking preset operations:', error);
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Listen for preset changes
        eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, (event) => {
            this.onPresetChanged(event);
        });

        // Listen for preset deletions
        eventSource.on(event_types.PRESET_DELETED, (event) => {
            this.onPresetDeleted(event);
        });
    }

    /**
     * Embed template markers into preset (marker-based approach)
     * @param {Object} presetSettings - Preset settings to modify
     * @returns {Object} Modified preset settings
     */
    async embedTemplateMarkers(presetSettings) {
        try {
            const ccData = presetSettings.extensions.ccprompt_manager;
            const templateRefs = ccData.template_refs || {};

            // Process each template reference
            for (const [promptId, ref] of Object.entries(templateRefs)) {
                const template = await this.templateManager.getTemplate(ref.template_id);
                if (!template) {
                    console.warn(`CCPrompt PresetIntegration: Template not found: ${ref.template_id}`);
                    continue;
                }

                // Find the marker prompt in the template
                const templateMarker = template.prompts.find(p => p.identifier === ref.template_prompt);
                if (!templateMarker) {
                    console.warn(`CCPrompt PresetIntegration: Template prompt not found: ${ref.template_prompt} in ${ref.template_id}`);
                    continue;
                }

                // Get embedded content for the marker (for compatibility)
                let embeddedContent = '';
                if (templateMarker.marker && templateMarker.ccprompt_ref) {
                    try {
                        // Resolve content from template library for embedding
                        const contentId = templateMarker.ccprompt_ref.content_id;
                        embeddedContent = await this.templateManager.contentLibrary.getTemplateContent(ref.template_id, contentId) || '';
                    } catch (error) {
                        console.warn(`CCPrompt PresetIntegration: Failed to get content for marker ${templateMarker.identifier}:`, error);
                        embeddedContent = '';
                    }
                }

                // Find and update the preset prompt
                const presetPrompt = presetSettings.prompts.find(p => p.identifier === promptId);
                if (presetPrompt) {
                    // Convert to marker format with embedded content
                    presetPrompt.marker = true;
                    presetPrompt.ccprompt_ref = {
                        template_id: ref.template_id,
                        content_id: templateMarker.ccprompt_ref ? templateMarker.ccprompt_ref.content_id : 'main'
                    };
                    presetPrompt.content = embeddedContent; // Embedded for compatibility
                    presetPrompt.role = templateMarker.role;
                    presetPrompt.name = templateMarker.name;

                    // Copy ST prompt properties from template marker
                    presetPrompt.system_prompt = templateMarker.system_prompt;
                    presetPrompt.injection_position = templateMarker.injection_position;
                    presetPrompt.injection_depth = templateMarker.injection_depth;
                    if (templateMarker.injection_trigger) presetPrompt.injection_trigger = templateMarker.injection_trigger;
                    if (templateMarker.forbid_overrides) presetPrompt.forbid_overrides = templateMarker.forbid_overrides;
                    if (templateMarker.enabled !== undefined) presetPrompt.enabled = templateMarker.enabled;

                    // Add CCPrompt metadata
                    presetPrompt._ccprompt_embedded = {
                        template_id: ref.template_id,
                        template_prompt: ref.template_prompt,
                        last_sync: new Date().toISOString(),
                        template_version: template.version,
                        embedded_format: 'marker'
                    };
                } else {
                    // Create new marker prompt from template
                    const newPrompt = {
                        identifier: promptId,
                        name: templateMarker.name,
                        role: templateMarker.role,
                        marker: true,
                        ccprompt_ref: {
                            template_id: ref.template_id,
                            content_id: templateMarker.ccprompt_ref ? templateMarker.ccprompt_ref.content_id : 'main'
                        },
                        content: embeddedContent, // Embedded for compatibility
                        system_prompt: templateMarker.system_prompt,
                        injection_position: templateMarker.injection_position,
                        injection_depth: templateMarker.injection_depth,
                        _ccprompt_embedded: {
                            template_id: ref.template_id,
                            template_prompt: ref.template_prompt,
                            last_sync: new Date().toISOString(),
                            template_version: template.version,
                            embedded_format: 'marker'
                        }
                    };

                    // Copy optional ST prompt properties
                    if (templateMarker.injection_trigger) newPrompt.injection_trigger = templateMarker.injection_trigger;
                    if (templateMarker.forbid_overrides) newPrompt.forbid_overrides = templateMarker.forbid_overrides;
                    if (templateMarker.enabled !== undefined) newPrompt.enabled = templateMarker.enabled;

                    presetSettings.prompts.push(newPrompt);
                }
            }

            // Update CCPrompt metadata
            ccData.last_sync = new Date().toISOString();
            ccData.version = ccData.version || 2; // v2 uses marker format
            ccData.format = 'marker';

            return presetSettings;

        } catch (error) {
            console.error('CCPrompt PresetIntegration: Error embedding template markers:', error);
            return presetSettings; // Return unchanged on error
        }
    }

    /**
     * Add template reference to preset
     * @param {string} presetName - Preset name
     * @param {string} promptId - Prompt identifier
     * @param {string} templateId - Template ID
     * @param {string} templatePrompt - Template prompt identifier
     */
    async addTemplateReference(presetName, promptId, templateId, templatePrompt) {
        try {
            const oaiPresetManager = getPresetManager('openai');
            const preset = oaiPresetManager.getCompletionPresetByName(presetName);

            if (!preset) {
                throw new Error(`Preset not found: ${presetName}`);
            }

            // Initialize extensions if needed
            if (!preset.extensions) {
                preset.extensions = {};
            }
            if (!preset.extensions.ccprompt_manager) {
                preset.extensions.ccprompt_manager = {
                    template_refs: {},
                    metadata: {
                        version: 2,
                        auto_sync: true,
                        format: 'marker'
                    }
                };
            }

            // Add template reference
            preset.extensions.ccprompt_manager.template_refs[promptId] = {
                template_id: templateId,
                template_prompt: templatePrompt
            };

            // Save the updated preset
            await oaiPresetManager.savePreset(presetName, preset);

            console.log(`CCPrompt PresetIntegration: Added template reference to preset '${presetName}'`);

        } catch (error) {
            console.error('CCPrompt PresetIntegration: Error adding template reference:', error);
            throw error;
        }
    }

    /**
     * Apply a complete template to a preset (replaces all prompts)
     * @param {string} presetName - Preset name
     * @param {string} templateId - Template ID to apply
     * @param {Object} options - Options for template application
     */
    async applyTemplateToPreset(presetName, templateId, options = {}) {
        const {
            preserve_prompt_order = true,
            overwrite_existing = false
        } = options;

        try {
            const oaiPresetManager = getPresetManager('openai');
            const preset = oaiPresetManager.getCompletionPresetByName(presetName);

            if (!preset) {
                throw new Error(`Preset not found: ${presetName}`);
            }

            const template = await this.templateManager.getTemplate(templateId);
            if (!template) {
                throw new Error(`Template not found: ${templateId}`);
            }

            // Initialize extensions if needed
            if (!preset.extensions) {
                preset.extensions = {};
            }

            // Set up CCPrompt manager data
            preset.extensions.ccprompt_manager = {
                template_refs: {},
                metadata: {
                    version: 2,
                    auto_sync: true,
                    format: 'marker',
                    applied_template: templateId,
                    applied_at: new Date().toISOString()
                }
            };

            // Clear existing prompts if overwrite mode
            if (overwrite_existing) {
                preset.prompts = [];
            }

            // Apply template prompts as markers
            for (const templateMarker of template.prompts) {
                // Skip if marker exists and not overwriting
                if (!overwrite_existing && preset.prompts.find(p => p.identifier === templateMarker.identifier)) {
                    continue;
                }

                // Get embedded content for the marker
                let embeddedContent = '';
                if (templateMarker.marker && templateMarker.ccprompt_ref) {
                    try {
                        const contentId = templateMarker.ccprompt_ref.content_id;
                        embeddedContent = await this.templateManager.contentLibrary.getTemplateContent(templateId, contentId) || '';
                    } catch (error) {
                        console.warn(`CCPrompt PresetIntegration: Failed to get content for marker ${templateMarker.identifier}:`, error);
                        embeddedContent = '';
                    }
                }

                // Create marker prompt
                const markerPrompt = {
                    identifier: templateMarker.identifier,
                    name: templateMarker.name,
                    role: templateMarker.role,
                    marker: true,
                    ccprompt_ref: {
                        template_id: templateId,
                        content_id: templateMarker.ccprompt_ref ? templateMarker.ccprompt_ref.content_id : 'main'
                    },
                    content: embeddedContent, // Embedded for compatibility
                    system_prompt: templateMarker.system_prompt,
                    injection_position: templateMarker.injection_position,
                    injection_depth: templateMarker.injection_depth,
                    _ccprompt_embedded: {
                        template_id: templateId,
                        template_prompt: templateMarker.identifier,
                        last_sync: new Date().toISOString(),
                        template_version: template.version,
                        embedded_format: 'marker'
                    }
                };

                // Copy optional ST prompt properties
                if (templateMarker.injection_trigger) markerPrompt.injection_trigger = templateMarker.injection_trigger;
                if (templateMarker.forbid_overrides) markerPrompt.forbid_overrides = templateMarker.forbid_overrides;
                if (templateMarker.enabled !== undefined) markerPrompt.enabled = templateMarker.enabled;

                // Add to preset
                const existingIndex = preset.prompts.findIndex(p => p.identifier === templateMarker.identifier);
                if (existingIndex >= 0) {
                    preset.prompts[existingIndex] = markerPrompt;
                } else {
                    preset.prompts.push(markerPrompt);
                }

                // Add template reference
                preset.extensions.ccprompt_manager.template_refs[templateMarker.identifier] = {
                    template_id: templateId,
                    template_prompt: templateMarker.identifier
                };
            }

            // Apply template prompt order if specified
            if (preserve_prompt_order && template.prompt_order) {
                preset.prompt_order = [...template.prompt_order];
            }

            // Save the updated preset
            await oaiPresetManager.savePreset(presetName, preset);

            console.log(`CCPrompt PresetIntegration: Applied template '${templateId}' to preset '${presetName}'`);
            return {
                success: true,
                prompts_applied: template.prompts.length,
                template_id: templateId
            };

        } catch (error) {
            console.error('CCPrompt PresetIntegration: Error applying template to preset:', error);
            throw error;
        }
    }

    /**
     * Remove template reference from preset
     * @param {string} presetName - Preset name
     * @param {string} promptId - Prompt identifier
     */
    async removeTemplateReference(presetName, promptId) {
        try {
            const oaiPresetManager = getPresetManager('openai');
            const preset = oaiPresetManager.getCompletionPresetByName(presetName);

            if (!preset || !preset.extensions?.ccprompt_manager?.template_refs) {
                return; // Nothing to remove
            }

            // Remove template reference
            delete preset.extensions.ccprompt_manager.template_refs[promptId];

            // Remove CCPrompt metadata and marker properties from prompt
            const prompt = preset.prompts.find(p => p.identifier === promptId);
            if (prompt) {
                // Remove old metadata
                if (prompt._ccprompt_ref) delete prompt._ccprompt_ref;
                if (prompt._ccprompt_embedded) delete prompt._ccprompt_embedded;

                // Convert back to regular prompt
                if (prompt.marker) {
                    prompt.marker = false;
                    delete prompt.ccprompt_ref;
                    // Keep content for compatibility, but it won't be resolved anymore
                }
            }

            // Save the updated preset
            await oaiPresetManager.savePreset(presetName, preset);

            console.log(`CCPrompt PresetIntegration: Removed template reference from preset '${presetName}'`);

        } catch (error) {
            console.error('CCPrompt PresetIntegration: Error removing template reference:', error);
            throw error;
        }
    }

    /**
     * Sync all presets that reference a template
     * @param {string} templateId - Template ID
     */
    async syncPresetsWithTemplate(templateId) {
        try {
            const affectedPresets = await this.findPresetsUsingTemplate(templateId);

            for (const presetName of affectedPresets) {
                await this.syncPreset(presetName);
            }

            console.log(`CCPrompt PresetIntegration: Synced ${affectedPresets.length} presets with template '${templateId}'`);

        } catch (error) {
            console.error('CCPrompt PresetIntegration: Error syncing presets with template:', error);
            throw error;
        }
    }

    /**
     * Sync a specific preset
     * @param {string} presetName - Preset name
     */
    async syncPreset(presetName) {
        try {
            const oaiPresetManager = getPresetManager('openai');
            const preset = oaiPresetManager.getCompletionPresetByName(presetName);

            if (!preset || !preset.extensions?.ccprompt_manager) {
                return; // No template references
            }

            // Re-embed template markers
            const updatedPreset = await this.embedTemplateMarkers(preset);

            // Save the updated preset
            await oaiPresetManager.savePreset(presetName, updatedPreset);

            console.log(`CCPrompt PresetIntegration: Synced preset '${presetName}'`);

        } catch (error) {
            console.error('CCPrompt PresetIntegration: Error syncing preset:', error);
            throw error;
        }
    }

    /**
     * Find all presets that use a specific template
     * @param {string} templateId - Template ID
     * @returns {Array} List of preset names
     */
    async findPresetsUsingTemplate(templateId) {
        try {
            const oaiPresetManager = getPresetManager('openai');
            const { presets, preset_names } = oaiPresetManager.getPresetList();
            const usingPresets = [];

            // Check each preset for template references
            for (let i = 0; i < presets.length; i++) {
                const preset = presets[i];
                const templateRefs = preset?.extensions?.ccprompt_manager?.template_refs;

                if (templateRefs) {
                    const usesTemplate = Object.values(templateRefs).some(ref => ref.template_id === templateId);
                    if (usesTemplate) {
                        // Get preset name
                        const presetName = oaiPresetManager.isKeyedApi() ?
                            preset_names[i] :
                            Object.keys(preset_names).find(name => preset_names[name] === i);

                        if (presetName) {
                            usingPresets.push(presetName);
                        }
                    }
                }
            }

            return usingPresets;

        } catch (error) {
            console.error('CCPrompt PresetIntegration: Error finding presets using template:', error);
            return [];
        }
    }

    /**
     * Get template usage statistics
     * @returns {Object} Usage statistics
     */
    async getTemplateUsageStats() {
        try {
            const oaiPresetManager = getPresetManager('openai');
            const { presets } = oaiPresetManager.getPresetList();
            const templateUsage = {};
            let totalReferences = 0;

            // Analyze each preset
            presets.forEach(preset => {
                const templateRefs = preset?.extensions?.ccprompt_manager?.template_refs;
                if (templateRefs) {
                    Object.values(templateRefs).forEach(ref => {
                        if (!templateUsage[ref.template_id]) {
                            templateUsage[ref.template_id] = {
                                count: 0,
                                presets: []
                            };
                        }
                        templateUsage[ref.template_id].count++;
                        totalReferences++;
                    });
                }
            });

            return {
                total_references: totalReferences,
                templates_in_use: Object.keys(templateUsage).length,
                usage_by_template: templateUsage
            };

        } catch (error) {
            console.error('CCPrompt PresetIntegration: Error getting usage stats:', error);
            return {
                total_references: 0,
                templates_in_use: 0,
                usage_by_template: {}
            };
        }
    }

    /**
     * Extract template references from preset
     * @param {Object} preset - Preset data
     * @returns {Object} Template references
     */
    extractTemplateRefs(preset) {
        return preset?.extensions?.ccprompt_manager?.template_refs || {};
    }

    /**
     * Check if preset has template references
     * @param {Object} preset - Preset data
     * @returns {boolean} True if preset has template references
     */
    hasTemplateRefs(preset) {
        const refs = this.extractTemplateRefs(preset);
        return Object.keys(refs).length > 0;
    }

    /**
     * Handle preset changed event
     * @param {Object} event - Event data
     */
    onPresetChanged(event) {
        // Check if the loaded preset needs sync
        if (this.hasTemplateRefs(event.preset)) {
            console.log('CCPrompt PresetIntegration: Loaded preset with template references');
            // Could trigger sync here if auto-sync is enabled
        }
    }

    /**
     * Handle preset deleted event
     * @param {Object} event - Event data
     */
    onPresetDeleted(event) {
        console.log(`CCPrompt PresetIntegration: Preset '${event.name}' was deleted`);
        // Could clean up any orphaned references here
    }

    /**
     * Clean up hooks on shutdown
     */
    cleanup() {
        if (this.isHooked && this.originalSavePreset) {
            try {
                const oaiPresetManager = getPresetManager('openai');
                if (oaiPresetManager) {
                    oaiPresetManager.savePreset = this.originalSavePreset;
                }
                this.isHooked = false;
                console.log('CCPrompt PresetIntegration: Cleaned up hooks');
            } catch (error) {
                console.error('CCPrompt PresetIntegration: Error cleaning up hooks:', error);
            }
        }
    }
}