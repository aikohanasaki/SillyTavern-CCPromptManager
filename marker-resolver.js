/**
 * CCPrompt Manager - Marker Resolution System
 *
 * Hooks into SillyTavern's prompt processing to resolve CCPrompt markers
 * at runtime, replacing them with actual content from the template library.
 */

import { PromptCollection } from '../../../PromptManager.js';

export class CCPromptMarkerResolver {
    constructor(templateManager, contentLibrary, stclIntegration = null) {
        this.templateManager = templateManager;
        this.contentLibrary = contentLibrary;
        this.stclIntegration = stclIntegration;
        this.originalGetPromptCollection = null;
        this.hooked = false;
        this.resolutionCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Initialize the marker resolver
     */
    async initialize() {
        this.hookPromptProcessing();
        console.log('CCPrompt MarkerResolver: Initialized');
    }

    /**
     * Hook into ST's prompt processing
     */
    hookPromptProcessing() {
        if (this.hooked) return;

        try {
            // Find the PromptManager instance being used
            // We need to hook the instance method, not the prototype
            const promptManagerInstance = this.findPromptManagerInstance();

            if (!promptManagerInstance) {
                console.log('CCPrompt MarkerResolver: Could not find PromptManager instance, using event-based approach');
                this.hookViaEvents();
                return;
            }

            // Store original method
            this.originalGetPromptCollection = promptManagerInstance.getPromptCollection.bind(promptManagerInstance);

            // Override getPromptCollection
            promptManagerInstance.getPromptCollection = async (generationType) => {
                // Call original to get collection
                const collection = this.originalGetPromptCollection(generationType);

                // Resolve CCPrompt markers in the collection
                return await this.resolveCCPromptMarkers(collection);
            };

            this.hooked = true;
            console.log('CCPrompt MarkerResolver: Successfully hooked into PromptManager.getPromptCollection()');

        } catch (error) {
            console.error('CCPrompt MarkerResolver: Error hooking prompt processing:', error);
        }
    }

    /**
     * Find the active PromptManager instance
     * ST creates PromptManager instances, so we need to find the active one
     */
    findPromptManagerInstance() {
        // Try to access through global scope or common patterns
        // This might need adjustment based on how ST exposes PromptManager

        // First try: check if there's a global prompt manager
        if (window.promptManager) {
            return window.promptManager;
        }

        // Second try: check through the context
        if (window.getContext && typeof window.getContext === 'function') {
            try {
                const context = window.getContext();
                if (context && context.promptManager) {
                    return context.promptManager;
                }
            } catch (error) {
                console.warn('CCPrompt MarkerResolver: Error accessing context:', error);
            }
        }

        // Third try: check if PromptManager is accessible through openai settings
        if (window.oai_settings && window.oai_settings.promptManager) {
            return window.oai_settings.promptManager;
        }

        // Fourth try: look for PromptManager in window objects
        if (window.SillyTavern && window.SillyTavern.promptManager) {
            return window.SillyTavern.promptManager;
        }

        // Fifth try: check for global PromptManager class and find instances
        if (window.PromptManager) {
            // Look for instances in common locations
            const possibleInstances = [
                window.promptManagerInstance,
                window.defaultPromptManager,
                window.chatPromptManager
            ];

            for (const instance of possibleInstances) {
                if (instance && typeof instance.getPromptCollection === 'function') {
                    return instance;
                }
            }
        }

        console.warn('CCPrompt MarkerResolver: Could not find PromptManager instance, will use event-based approach');
        return null;
    }

    /**
     * Fallback: Use event-based hooking approach
     */
    hookViaEvents() {
        if (this.hooked) return;

        try {
            // Listen for prompt collection events and intercept
            if (window.eventSource && window.event_types) {
                const self = this;

                // Hook into OAI_PRESET_CHANGED_BEFORE to intercept prompt collection building
                window.eventSource.on(window.event_types.OAI_PRESET_CHANGED_BEFORE, async (event) => {
                    if (event.preset && event.preset.prompts) {
                        // Process CCPrompt markers in the preset
                        for (let i = 0; i < event.preset.prompts.length; i++) {
                            const prompt = event.preset.prompts[i];
                            if (self.isCCPromptMarker(prompt)) {
                                try {
                                    const resolved = await self.resolveMarker(prompt);
                                    event.preset.prompts[i] = resolved;
                                } catch (error) {
                                    console.error('CCPrompt MarkerResolver: Error resolving marker in preset:', error);
                                }
                            }
                        }
                    }
                });

                this.hooked = true;
                console.log('CCPrompt MarkerResolver: Hooked via event system');
            } else {
                console.warn('CCPrompt MarkerResolver: Event system not available, markers will not be resolved');
            }

        } catch (error) {
            console.error('CCPrompt MarkerResolver: Error hooking via events:', error);
        }
    }

    /**
     * Resolve CCPrompt markers in a prompt collection
     * @param {PromptCollection} promptCollection - Original prompt collection
     * @returns {Promise<PromptCollection>} Collection with resolved markers
     */
    async resolveCCPromptMarkers(promptCollection) {
        try {
            const resolvedPrompts = [];

            // Process each prompt in the collection
            for (const prompt of promptCollection.collection) {
                if (this.isCCPromptMarker(prompt)) {
                    // Resolve CCPrompt marker
                    const resolved = await this.resolveMarker(prompt);
                    resolvedPrompts.push(resolved);
                } else {
                    // Regular prompt, pass through unchanged
                    resolvedPrompts.push(prompt);
                }
            }

            // Rebuild collection with resolved prompts
            const newCollection = new PromptCollection();
            resolvedPrompts.forEach(prompt => newCollection.add(prompt));

            console.log(`CCPrompt MarkerResolver: Resolved ${resolvedPrompts.length} prompts (${resolvedPrompts.filter(p => p._ccprompt_resolved).length} were CCPrompt markers)`);
            return newCollection;

        } catch (error) {
            console.error('CCPrompt MarkerResolver: Error resolving markers:', error);
            // Return original collection on error
            return promptCollection;
        }
    }

    /**
     * Check if a prompt is a CCPrompt marker
     * @param {Object} prompt - Prompt object to check
     * @returns {boolean} True if it's a CCPrompt marker
     */
    isCCPromptMarker(prompt) {
        return prompt.marker === true &&
               prompt.ccprompt_ref &&
               prompt.ccprompt_ref.content_id;
    }

    /**
     * Resolve a single CCPrompt marker
     * @param {Object} markerPrompt - Marker prompt to resolve
     * @returns {Promise<Object>} Resolved prompt with content
     */
    async resolveMarker(markerPrompt) {
        try {
            // Check if marker is locked by STCL
            if (this.stclIntegration && this.stclIntegration.isMarkerLocked(markerPrompt.identifier)) {
                console.log(`CCPrompt MarkerResolver: Marker ${markerPrompt.identifier} is locked by STCL, using embedded content`);

                // Return marker with embedded content if available, otherwise empty
                const embeddedContent = markerPrompt.content || '';
                return this.createResolvedPrompt(markerPrompt, embeddedContent, null, null, true);
            }

            const { template_id, content_id } = markerPrompt.ccprompt_ref;

            // Create cache key
            const cacheKey = `${template_id || 'inferred'}:${content_id}`;

            // Check cache first
            const cached = this.getCachedResolution(cacheKey);
            if (cached) {
                return this.createResolvedPrompt(markerPrompt, cached.content, cached.template_id);
            }

            // If no template_id, try to infer from identifier
            let templateId = template_id;
            if (!templateId) {
                templateId = this.inferTemplateIdFromMarker(markerPrompt);
            }

            // Get content from library
            let content = '';
            if (templateId && content_id) {
                content = await this.contentLibrary.getTemplateContent(templateId, content_id);
            }

            // If content not found, log warning and use empty content
            if (!content) {
                console.warn(
                    `CCPrompt MarkerResolver: Content not found for marker ${markerPrompt.identifier}`,
                    { template_id: templateId, content_id }
                );
                content = ''; // Graceful degradation
            }

            // Cache the resolution
            this.cacheResolution(cacheKey, { content, template_id: templateId });

            return this.createResolvedPrompt(markerPrompt, content, templateId);

        } catch (error) {
            console.error('CCPrompt MarkerResolver: Error resolving marker:', error);

            // Return empty content on error (graceful degradation)
            return this.createResolvedPrompt(markerPrompt, '', null, error);
        }
    }

    /**
     * Create a resolved prompt object
     * @param {Object} markerPrompt - Original marker prompt
     * @param {string} content - Resolved content
     * @param {string} templateId - Template ID
     * @param {Error} error - Optional error
     * @param {boolean} isLocked - Whether this marker was locked
     * @returns {Object} Resolved prompt
     */
    createResolvedPrompt(markerPrompt, content, templateId, error = null, isLocked = false) {
        const resolvedPrompt = {
            ...markerPrompt,
            marker: false, // No longer a marker
            content: content,
            _ccprompt_resolved: {
                template_id: templateId,
                content_id: markerPrompt.ccprompt_ref ? markerPrompt.ccprompt_ref.content_id : null,
                resolved_at: new Date().toISOString(),
                original_marker: markerPrompt.identifier,
                cache_hit: !isLocked && !!this.getCachedResolution(`${templateId || 'inferred'}:${markerPrompt.ccprompt_ref ? markerPrompt.ccprompt_ref.content_id : 'unknown'}`),
                locked_by_stcl: isLocked
            }
        };

        if (error) {
            resolvedPrompt._ccprompt_error = {
                error: error.message,
                marker: markerPrompt.identifier
            };
        }

        return resolvedPrompt;
    }

    /**
     * Infer template ID from marker identifier
     * Markers have format: cc-{templateId}-{contentId}
     * @param {Object} markerPrompt - Marker prompt
     * @returns {string|null} Inferred template ID
     */
    inferTemplateIdFromMarker(markerPrompt) {
        const match = markerPrompt.identifier.match(/^cc-([^-]+)-/);
        if (match) {
            const shortId = match[1];
            // Need to find the full template ID from the short ID
            return this.findTemplateByShortId(shortId);
        }
        return null;
    }

    /**
     * Find template by short ID
     * @param {string} shortId - Short template ID (first 8 chars)
     * @returns {Promise<string|null>} Full template ID
     */
    async findTemplateByShortId(shortId) {
        try {
            const templates = await this.templateManager.listTemplates();
            const found = templates.find(t => t.id.startsWith(shortId));
            return found ? found.id : null;
        } catch (error) {
            console.error('CCPrompt MarkerResolver: Error finding template by short ID:', error);
            return null;
        }
    }

    /**
     * Get cached resolution
     * @param {string} cacheKey - Cache key
     * @returns {Object|null} Cached resolution or null
     */
    getCachedResolution(cacheKey) {
        const cached = this.resolutionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        // Remove expired cache entry
        if (cached) {
            this.resolutionCache.delete(cacheKey);
        }

        return null;
    }

    /**
     * Cache a resolution
     * @param {string} cacheKey - Cache key
     * @param {Object} data - Data to cache
     */
    cacheResolution(cacheKey, data) {
        this.resolutionCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });

        // Clean up old cache entries periodically
        if (this.resolutionCache.size > 100) {
            this.cleanupCache();
        }
    }

    /**
     * Clean up expired cache entries
     */
    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.resolutionCache.entries()) {
            if (now - value.timestamp >= this.cacheExpiry) {
                this.resolutionCache.delete(key);
            }
        }
    }

    /**
     * Clear all cached resolutions
     */
    clearCache() {
        this.resolutionCache.clear();
        console.log('CCPrompt MarkerResolver: Cache cleared');
    }

    /**
     * Get resolution statistics
     * @returns {Object} Stats about marker resolution
     */
    getResolutionStats() {
        const lockedMarkers = this.stclIntegration ? this.stclIntegration.getLockedMarkers() : [];

        return {
            hooked: this.hooked,
            stcl_integration: !!this.stclIntegration,
            stcl_enabled: this.stclIntegration ? this.stclIntegration.isSTCLEnabled() : false,
            locked_markers_count: lockedMarkers.length,
            locked_markers: lockedMarkers,
            cache_size: this.resolutionCache.size,
            cache_expiry_ms: this.cacheExpiry,
            cached_resolutions: Array.from(this.resolutionCache.entries()).map(([key, value]) => ({
                key,
                timestamp: value.timestamp,
                age_ms: Date.now() - value.timestamp
            }))
        };
    }

    /**
     * Un-hook from prompt processing
     */
    unhook() {
        if (this.hooked && this.originalGetPromptCollection) {
            // Restore original method
            // Note: This is tricky because we need to restore on the same instance/prototype
            // that we hooked. For now, log that unhooking was requested.
            console.log('CCPrompt MarkerResolver: Unhook requested (implementation depends on hook method)');
            this.hooked = false;
        }
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.unhook();
        this.clearCache();
        console.log('CCPrompt MarkerResolver: Cleaned up');
    }
}