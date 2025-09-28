/**
 * CCPrompt Manager - Content Library
 *
 * Manages reusable prompt content that can be referenced
 * by multiple templates through markers.
 */

export class CCPromptContentLibrary {
    constructor(storage) {
        this.storage = storage;
    }

    /**
     * Get content from a template's content library
     * @param {string} templateId - Template ID
     * @param {string} contentId - Content ID within the template
     * @returns {Promise<string>} Content string
     */
    async getTemplateContent(templateId, contentId) {
        try {
            const library = await this.storage.loadLibrary();
            const template = library.templates[templateId];

            if (!template) {
                throw new Error(`Template not found: ${templateId}`);
            }

            if (!template.content || !template.content[contentId]) {
                console.warn(`Content not found: ${contentId} in template ${templateId}`);
                return '';
            }

            return template.content[contentId];

        } catch (error) {
            console.error('CCPrompt ContentLibrary: Error getting template content:', error);
            return '';
        }
    }

    /**
     * Set content in a template's content library
     * @param {string} templateId - Template ID
     * @param {string} contentId - Content ID within the template
     * @param {string} content - Content to store
     */
    async setTemplateContent(templateId, contentId, content) {
        try {
            const library = await this.storage.loadLibrary();
            const template = library.templates[templateId];

            if (!template) {
                throw new Error(`Template not found: ${templateId}`);
            }

            // Initialize content object if needed
            if (!template.content) {
                template.content = {};
            }

            // Set the content
            template.content[contentId] = content;

            // Update template metadata
            template.modified = new Date().toISOString();
            template.version = (template.version || 0) + 1;

            // Save library
            await this.storage.saveLibrary(library);

            console.log(`CCPrompt ContentLibrary: Updated content '${contentId}' in template '${templateId}'`);

        } catch (error) {
            console.error('CCPrompt ContentLibrary: Error setting template content:', error);
            throw error;
        }
    }

    /**
     * Get all content from a template
     * @param {string} templateId - Template ID
     * @returns {Promise<Object>} Content object with contentId -> content mappings
     */
    async getTemplateContentLibrary(templateId) {
        try {
            const library = await this.storage.loadLibrary();
            const template = library.templates[templateId];

            if (!template) {
                throw new Error(`Template not found: ${templateId}`);
            }

            return structuredClone(template.content || {});

        } catch (error) {
            console.error('CCPrompt ContentLibrary: Error getting template content library:', error);
            return {};
        }
    }

    /**
     * Set the entire content library for a template
     * @param {string} templateId - Template ID
     * @param {Object} contentLibrary - Content object with contentId -> content mappings
     */
    async setTemplateContentLibrary(templateId, contentLibrary) {
        try {
            const library = await this.storage.loadLibrary();
            const template = library.templates[templateId];

            if (!template) {
                throw new Error(`Template not found: ${templateId}`);
            }

            // Set the entire content library
            template.content = structuredClone(contentLibrary);

            // Update template metadata
            template.modified = new Date().toISOString();
            template.version = (template.version || 0) + 1;

            // Save library
            await this.storage.saveLibrary(library);

            console.log(`CCPrompt ContentLibrary: Updated content library for template '${templateId}'`);

        } catch (error) {
            console.error('CCPrompt ContentLibrary: Error setting template content library:', error);
            throw error;
        }
    }

    /**
     * Delete content from a template
     * @param {string} templateId - Template ID
     * @param {string} contentId - Content ID to delete
     */
    async deleteTemplateContent(templateId, contentId) {
        try {
            const library = await this.storage.loadLibrary();
            const template = library.templates[templateId];

            if (!template || !template.content || !template.content[contentId]) {
                return; // Nothing to delete
            }

            delete template.content[contentId];

            // Update template metadata
            template.modified = new Date().toISOString();
            template.version = (template.version || 0) + 1;

            // Save library
            await this.storage.saveLibrary(library);

            console.log(`CCPrompt ContentLibrary: Deleted content '${contentId}' from template '${templateId}'`);

        } catch (error) {
            console.error('CCPrompt ContentLibrary: Error deleting template content:', error);
            throw error;
        }
    }

    /**
     * Find all templates that use specific content ID
     * @param {string} contentId - Content ID to search for
     * @returns {Promise<Array>} Array of template IDs and usage info
     */
    async findTemplatesUsingContent(contentId) {
        try {
            const library = await this.storage.loadLibrary();
            const usage = [];

            for (const [templateId, template] of Object.entries(library.templates)) {
                // Check if this template has content with this ID
                if (template.content && template.content[contentId]) {
                    // Find which markers reference this content
                    const referencingMarkers = template.prompts
                        .filter(prompt =>
                            prompt.marker &&
                            prompt.ccprompt_ref &&
                            prompt.ccprompt_ref.content_id === contentId
                        )
                        .map(prompt => prompt.identifier);

                    usage.push({
                        template_id: templateId,
                        template_name: template.name,
                        referencing_markers: referencingMarkers,
                        has_content: true
                    });
                }

                // Also check for markers that reference content (even if content doesn't exist)
                const orphanedMarkers = template.prompts
                    .filter(prompt =>
                        prompt.marker &&
                        prompt.ccprompt_ref &&
                        prompt.ccprompt_ref.content_id === contentId &&
                        (!template.content || !template.content[contentId])
                    )
                    .map(prompt => prompt.identifier);

                if (orphanedMarkers.length > 0) {
                    usage.push({
                        template_id: templateId,
                        template_name: template.name,
                        referencing_markers: orphanedMarkers,
                        has_content: false,
                        orphaned: true
                    });
                }
            }

            return usage;

        } catch (error) {
            console.error('CCPrompt ContentLibrary: Error finding templates using content:', error);
            return [];
        }
    }

    /**
     * Get content statistics
     * @returns {Promise<Object>} Statistics about content usage
     */
    async getContentStatistics() {
        try {
            const library = await this.storage.loadLibrary();
            const stats = {
                total_templates: Object.keys(library.templates).length,
                total_content_items: 0,
                content_by_template: {},
                most_used_content: {},
                orphaned_content: [],
                orphaned_markers: []
            };

            // Analyze each template
            for (const [templateId, template] of Object.entries(library.templates)) {
                const contentCount = Object.keys(template.content || {}).length;
                stats.total_content_items += contentCount;

                stats.content_by_template[templateId] = {
                    template_name: template.name,
                    content_count: contentCount,
                    marker_count: template.prompts.filter(p => p.marker).length
                };

                // Find orphaned content (content with no referencing markers)
                const referencedContentIds = new Set(
                    template.prompts
                        .filter(p => p.marker && p.ccprompt_ref)
                        .map(p => p.ccprompt_ref.content_id)
                );

                if (template.content) {
                    for (const contentId of Object.keys(template.content)) {
                        if (!referencedContentIds.has(contentId)) {
                            stats.orphaned_content.push({
                                template_id: templateId,
                                template_name: template.name,
                                content_id: contentId
                            });
                        }
                    }
                }

                // Find orphaned markers (markers with no content)
                for (const prompt of template.prompts) {
                    if (prompt.marker && prompt.ccprompt_ref) {
                        const contentId = prompt.ccprompt_ref.content_id;
                        if (!template.content || !template.content[contentId]) {
                            stats.orphaned_markers.push({
                                template_id: templateId,
                                template_name: template.name,
                                marker_id: prompt.identifier,
                                content_id: contentId
                            });
                        }
                    }
                }
            }

            return stats;

        } catch (error) {
            console.error('CCPrompt ContentLibrary: Error getting content statistics:', error);
            return {
                total_templates: 0,
                total_content_items: 0,
                content_by_template: {},
                most_used_content: {},
                orphaned_content: [],
                orphaned_markers: []
            };
        }
    }

    /**
     * Validate content references in a template
     * @param {string} templateId - Template ID to validate
     * @returns {Promise<Object>} Validation result
     */
    async validateTemplateContentReferences(templateId) {
        try {
            const library = await this.storage.loadLibrary();
            const template = library.templates[templateId];

            if (!template) {
                throw new Error(`Template not found: ${templateId}`);
            }

            const validation = {
                valid: true,
                errors: [],
                warnings: []
            };

            // Check each marker
            for (const prompt of template.prompts) {
                if (prompt.marker && prompt.ccprompt_ref) {
                    const contentId = prompt.ccprompt_ref.content_id;

                    if (!template.content || !template.content[contentId]) {
                        validation.valid = false;
                        validation.errors.push({
                            type: 'missing_content',
                            marker_id: prompt.identifier,
                            content_id: contentId,
                            message: `Marker ${prompt.identifier} references missing content: ${contentId}`
                        });
                    }
                }
            }

            // Check for orphaned content
            const referencedContentIds = new Set(
                template.prompts
                    .filter(p => p.marker && p.ccprompt_ref)
                    .map(p => p.ccprompt_ref.content_id)
            );

            if (template.content) {
                for (const contentId of Object.keys(template.content)) {
                    if (!referencedContentIds.has(contentId)) {
                        validation.warnings.push({
                            type: 'orphaned_content',
                            content_id: contentId,
                            message: `Content ${contentId} is not referenced by any marker`
                        });
                    }
                }
            }

            return validation;

        } catch (error) {
            console.error('CCPrompt ContentLibrary: Error validating template:', error);
            return {
                valid: false,
                errors: [{ type: 'validation_error', message: error.message }],
                warnings: []
            };
        }
    }

    /**
     * Copy content from one template to another
     * @param {string} sourceTemplateId - Source template ID
     * @param {string} sourceContentId - Source content ID
     * @param {string} targetTemplateId - Target template ID
     * @param {string} targetContentId - Target content ID
     */
    async copyContentBetweenTemplates(sourceTemplateId, sourceContentId, targetTemplateId, targetContentId) {
        try {
            // Get source content
            const sourceContent = await this.getTemplateContent(sourceTemplateId, sourceContentId);

            if (!sourceContent) {
                throw new Error(`Source content not found: ${sourceContentId} in ${sourceTemplateId}`);
            }

            // Set target content
            await this.setTemplateContent(targetTemplateId, targetContentId, sourceContent);

            console.log(`CCPrompt ContentLibrary: Copied content from ${sourceTemplateId}:${sourceContentId} to ${targetTemplateId}:${targetContentId}`);

        } catch (error) {
            console.error('CCPrompt ContentLibrary: Error copying content between templates:', error);
            throw error;
        }
    }

    /**
     * Rename content ID within a template
     * @param {string} templateId - Template ID
     * @param {string} oldContentId - Old content ID
     * @param {string} newContentId - New content ID
     */
    async renameTemplateContent(templateId, oldContentId, newContentId) {
        try {
            const library = await this.storage.loadLibrary();
            const template = library.templates[templateId];

            if (!template) {
                throw new Error(`Template not found: ${templateId}`);
            }

            if (!template.content || !template.content[oldContentId]) {
                throw new Error(`Content not found: ${oldContentId} in ${templateId}`);
            }

            if (template.content[newContentId]) {
                throw new Error(`Content ID already exists: ${newContentId} in ${templateId}`);
            }

            // Move content
            template.content[newContentId] = template.content[oldContentId];
            delete template.content[oldContentId];

            // Update all markers that reference this content
            for (const prompt of template.prompts) {
                if (prompt.marker && prompt.ccprompt_ref && prompt.ccprompt_ref.content_id === oldContentId) {
                    prompt.ccprompt_ref.content_id = newContentId;
                }
            }

            // Update template metadata
            template.modified = new Date().toISOString();
            template.version = (template.version || 0) + 1;

            // Save library
            await this.storage.saveLibrary(library);

            console.log(`CCPrompt ContentLibrary: Renamed content from '${oldContentId}' to '${newContentId}' in template '${templateId}'`);

        } catch (error) {
            console.error('CCPrompt ContentLibrary: Error renaming template content:', error);
            throw error;
        }
    }
}