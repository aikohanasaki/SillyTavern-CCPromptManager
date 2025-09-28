/**
 * CCPrompt Manager - Storage System
 *
 * Handles file I/O, backup management, and data persistence
 * for the CCPrompt template library.
 */

import { getRequestHeaders } from '../../../../script.js';

const DATA_PATH = 'data/ccprompts';
const LIBRARY_FILE = 'library.json';
const METADATA_FILE = 'metadata.json';
const BACKUP_DIR = 'backups';
const MAX_BACKUPS = 10;
const API_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export class CCPromptStorage {
    constructor() {
        this.libraryPath = `${DATA_PATH}/${LIBRARY_FILE}`;
        this.metadataPath = `${DATA_PATH}/${METADATA_FILE}`;
        this.backupPath = `${DATA_PATH}/${BACKUP_DIR}`;
        this.saveInProgress = false; // Mutex for concurrent operations
        this.lastLibraryHash = null; // For smart backup detection
    }

    /**
     * Robust API call with timeout and retry logic
     * @param {string} endpoint - API endpoint
     * @param {Object} payload - Request payload
     * @param {number} retries - Number of retries remaining
     * @returns {Promise<Response>} API response
     */
    async apiCall(endpoint, payload, retries = MAX_RETRIES) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
            const response = await fetch(`/api/files/${endpoint}`, {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok && response.status >= 500 && retries > 0) {
                // Retry on server errors
                console.warn(`CCPrompt Storage: API ${endpoint} failed with ${response.status}, retrying... (${retries} attempts left)`);
                await this.delay(RETRY_DELAY);
                return this.apiCall(endpoint, payload, retries - 1);
            }

            return response;
        } catch (error) {
            clearTimeout(timeoutId);

            if ((error.name === 'AbortError' || error.name === 'NetworkError') && retries > 0) {
                console.warn(`CCPrompt Storage: API ${endpoint} failed with ${error.name}, retrying... (${retries} attempts left)`);
                await this.delay(RETRY_DELAY);
                return this.apiCall(endpoint, payload, retries - 1);
            }

            throw error;
        }
    }

    /**
     * Utility delay function
     * @param {number} ms - Milliseconds to delay
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate hash of library content for change detection
     * @param {Object} library - Library object
     * @returns {string} SHA-256 hash
     */
    async generateLibraryHash(library) {
        const content = JSON.stringify(library, Object.keys(library).sort());
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Validate JSON response
     * @param {string} text - Response text
     * @returns {Object} Parsed JSON
     */
    validateJson(text) {
        if (!text || text.trim() === '') {
            throw new Error('Empty response from API');
        }

        try {
            const parsed = JSON.parse(text);
            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error('Invalid JSON structure');
            }
            return parsed;
        } catch (error) {
            throw new Error(`Failed to parse JSON: ${error.message}`);
        }
    }

    /**
     * Initialize storage system - create directories if needed
     */
    async initialize() {
        try {
            // Try to read library file, create default if doesn't exist
            await this.loadLibrary();
        } catch (error) {
            console.log('CCPrompt Storage: Creating default library');
            await this.createDefaultLibrary();
        }

        // Ensure backup directory exists
        await this.ensureBackupDirectory();
    }

    /**
     * Load template library from file
     * @returns {Object} Library data
     */
    async loadLibrary() {
        try {
            const response = await this.apiCall('read', { path: this.libraryPath });

            if (!response.ok) {
                if (response.status === 404) {
                    // File doesn't exist, create default
                    return await this.createDefaultLibrary();
                }
                throw new Error(`Failed to read library: ${response.statusText}`);
            }

            const data = await response.text();
            const library = this.validateJson(data);

            // Update hash for change detection
            this.lastLibraryHash = await this.generateLibraryHash(library);

            return library;
        } catch (error) {
            console.error('CCPrompt Storage: Error loading library:', error);
            throw error;
        }
    }

    /**
     * Save template library to file with automatic backup
     * @param {Object} library - Library data to save
     */
    async saveLibrary(library) {
        // Mutex to prevent concurrent saves
        if (this.saveInProgress) {
            throw new Error('Save operation already in progress');
        }

        this.saveInProgress = true;

        try {
            // Smart backup: only backup if content has changed
            const newHash = await this.generateLibraryHash(library);
            const shouldBackup = !this.lastLibraryHash || newHash !== this.lastLibraryHash;

            if (shouldBackup) {
                await this.createAutoBackup();
            }

            // Update modification timestamp
            library.modified = new Date().toISOString();

            // Save to file with robust API
            const response = await this.apiCall('write', {
                path: this.libraryPath,
                content: JSON.stringify(library, null, 2)
            });

            if (!response.ok) {
                throw new Error(`Failed to save library: ${response.statusText}`);
            }

            // Update hash after successful save
            this.lastLibraryHash = newHash;

            // Rotate old backups (only if backup was created)
            if (shouldBackup) {
                await this.rotateBackups(MAX_BACKUPS);
            }

            console.log('CCPrompt Storage: Library saved successfully');
        } catch (error) {
            console.error('CCPrompt Storage: Error saving library:', error);
            throw error;
        } finally {
            this.saveInProgress = false;
        }
    }

    /**
     * Create default library structure
     * @returns {Object} Default library
     */
    async createDefaultLibrary() {
        const library = {
            version: 3, // Start with v3 (marker-based format)
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            templates: {}
        };

        await this.saveLibrary(library);
        return library;
    }

    /**
     * Create automatic backup with timestamp
     */
    async createAutoBackup() {
        try {
            const library = await this.loadLibrary();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const backupFile = `library-${timestamp}-auto.json`;

            await this.saveBackup(library, backupFile);
        } catch (error) {
            console.warn('CCPrompt Storage: Failed to create auto backup:', error);
            // Don't throw - backup failure shouldn't prevent saving
        }
    }

    /**
     * Create manual backup
     * @param {string} [name] - Optional backup name
     * @returns {string} Backup filename
     */
    async createManualBackup(name = null) {
        try {
            const library = await this.loadLibrary();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const backupFile = name ?
                `library-${timestamp}-${name}.json` :
                `library-${timestamp}-manual.json`;

            await this.saveBackup(library, backupFile);
            return backupFile;
        } catch (error) {
            console.error('CCPrompt Storage: Error creating manual backup:', error);
            throw error;
        }
    }

    /**
     * Save backup file
     * @param {Object} data - Data to backup
     * @param {string} filename - Backup filename
     */
    async saveBackup(data, filename) {
        const backupPath = `${this.backupPath}/${filename}`;

        const response = await this.apiCall('write', {
            path: backupPath,
            content: JSON.stringify(data, null, 2)
        });

        if (!response.ok) {
            throw new Error(`Failed to save backup: ${response.statusText}`);
        }
    }

    /**
     * List all backup files
     * @returns {Array} List of backup files with metadata
     */
    async listBackups() {
        try {
            const response = await this.apiCall('list', { path: this.backupPath });

            if (!response.ok) {
                if (response.status === 404) {
                    return []; // No backups yet
                }
                throw new Error(`Failed to list backups: ${response.statusText}`);
            }

            const files = await response.json();

            return files
                .filter(file => file.name.endsWith('.json'))
                .map(file => {
                    const match = file.name.match(/library-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(auto|manual|.+)\.json/);
                    return {
                        filename: file.name,
                        timestamp: match ? match[1].replace('T', ' ').replace(/-/g, ':') : 'Unknown',
                        type: match ? match[2] : 'Unknown',
                        size: file.size || 0,
                        path: `${this.backupPath}/${file.name}`
                    };
                })
                .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Newest first

        } catch (error) {
            console.error('CCPrompt Storage: Error listing backups:', error);
            return [];
        }
    }

    /**
     * Load backup file
     * @param {string} filename - Backup filename
     * @returns {Object} Backup data
     */
    async loadBackup(filename) {
        try {
            const backupPath = `${this.backupPath}/${filename}`;

            const response = await this.apiCall('read', { path: backupPath });

            if (!response.ok) {
                throw new Error(`Failed to read backup: ${response.statusText}`);
            }

            const data = await response.text();
            return this.validateJson(data);
        } catch (error) {
            console.error('CCPrompt Storage: Error loading backup:', error);
            throw error;
        }
    }

    /**
     * Restore from backup
     * @param {string} filename - Backup filename to restore
     */
    async restoreFromBackup(filename) {
        try {
            // Create backup of current state first
            await this.createManualBackup('pre-restore');

            // Load backup data
            const backupData = await this.loadBackup(filename);

            // Save as current library
            await this.saveLibrary(backupData);

            console.log(`CCPrompt Storage: Restored from backup: ${filename}`);
        } catch (error) {
            console.error('CCPrompt Storage: Error restoring backup:', error);
            throw error;
        }
    }

    /**
     * Rotate old backups, keeping only the specified number
     * @param {number} maxBackups - Maximum number of backups to keep
     */
    async rotateBackups(maxBackups = MAX_BACKUPS) {
        try {
            const backups = await this.listBackups();
            const autoBackups = backups.filter(b => b.type === 'auto');

            if (autoBackups.length > maxBackups) {
                const toDelete = autoBackups.slice(maxBackups);

                for (const backup of toDelete) {
                    await this.deleteBackup(backup.filename);
                }

                console.log(`CCPrompt Storage: Rotated ${toDelete.length} old backups`);
            }
        } catch (error) {
            console.warn('CCPrompt Storage: Error rotating backups:', error);
            // Don't throw - backup rotation failure shouldn't be fatal
        }
    }

    /**
     * Delete a backup file
     * @param {string} filename - Backup filename to delete
     */
    async deleteBackup(filename) {
        const backupPath = `${this.backupPath}/${filename}`;

        const response = await this.apiCall('delete', { path: backupPath });

        if (!response.ok) {
            throw new Error(`Failed to delete backup: ${response.statusText}`);
        }
    }

    /**
     * Export library as downloadable file
     * @param {Object} options - Export options
     * @returns {string} JSON string for download
     */
    async exportLibrary(options = {}) {
        const {
            format = 'full',
            template_id = null,
            include_metadata = true
        } = options;

        try {
            const library = await this.loadLibrary();
            const exportData = {
                export_type: format === 'single' ? 'ccprompt_template' : 'ccprompt_library_full',
                version: 3,
                exported_at: new Date().toISOString(),
                exported_by: 'ST CCPrompt Manager v1.0.0'
            };

            if (format === 'single' && template_id) {
                // Single template export
                const template = library.templates[template_id];
                if (!template) {
                    throw new Error(`Template not found: ${template_id}`);
                }

                exportData.template = template;

                if (include_metadata) {
                    exportData.metadata = {
                        template_id: template_id,
                        template_name: template.name,
                        template_version: template.version
                    };
                }
            } else {
                // Full library export
                exportData.library = {
                    version: library.version,
                    templates: format === 'templates-only' ?
                        library.templates :
                        library
                };

                if (include_metadata) {
                    const templateCount = Object.keys(library.templates).length;
                    const timestamps = Object.values(library.templates).map(t => t.created);

                    exportData.metadata = {
                        template_count: templateCount,
                        oldest_template: timestamps.length ? Math.min(...timestamps.map(t => new Date(t))) : null,
                        newest_template: timestamps.length ? Math.max(...timestamps.map(t => new Date(t))) : null
                    };
                }
            }

            return JSON.stringify(exportData, null, 2);
        } catch (error) {
            console.error('CCPrompt Storage: Error exporting library:', error);
            throw error;
        }
    }

    /**
     * Import library from data
     * @param {Object} importData - Data to import
     * @param {Object} options - Import options
     */
    async importLibrary(importData, options = {}) {
        // Input validation
        if (!importData || typeof importData !== 'object') {
            throw new Error('Invalid import data: must be an object');
        }

        if (!importData.export_type) {
            throw new Error('Invalid import data: missing export_type');
        }

        const validExportTypes = ['ccprompt_template', 'ccprompt_library_full'];
        if (!validExportTypes.includes(importData.export_type)) {
            throw new Error(`Invalid export_type: ${importData.export_type}`);
        }

        const {
            mode = 'merge',
            conflict = 'newer',
            backup_first = true
        } = options;

        // Validate options
        const validModes = ['merge', 'overwrite'];
        if (!validModes.includes(mode)) {
            throw new Error(`Invalid mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
        }

        const validConflicts = ['newer', 'replace', 'keep'];
        if (!validConflicts.includes(conflict)) {
            throw new Error(`Invalid conflict resolution: ${conflict}. Must be one of: ${validConflicts.join(', ')}`);
        }

        try {
            // Create backup first if requested
            if (backup_first) {
                await this.createManualBackup('pre-import');
            }

            const currentLibrary = await this.loadLibrary();
            let newLibrary = { ...currentLibrary };

            if (importData.export_type === 'ccprompt_template') {
                // Single template import
                const template = importData.template;
                const templateId = template.id;

                if (mode === 'overwrite' || !newLibrary.templates[templateId]) {
                    newLibrary.templates[templateId] = template;
                } else if (mode === 'merge') {
                    // Handle conflict resolution
                    const existing = newLibrary.templates[templateId];

                    if (conflict === 'newer') {
                        const existingDate = new Date(existing.modified);
                        const importDate = new Date(template.modified);

                        if (importDate > existingDate) {
                            newLibrary.templates[templateId] = template;
                        }
                    } else if (conflict === 'replace') {
                        newLibrary.templates[templateId] = template;
                    }
                    // 'keep' means do nothing
                }

            } else if (importData.export_type === 'ccprompt_library_full') {
                // Full library import
                const importLibrary = importData.library;

                if (mode === 'overwrite') {
                    newLibrary = {
                        version: Math.max(currentLibrary.version, importLibrary.version),
                        created: currentLibrary.created, // Keep original creation date
                        modified: new Date().toISOString(),
                        templates: importLibrary.templates
                    };
                } else if (mode === 'merge') {
                    // Merge templates with conflict resolution
                    for (const [templateId, template] of Object.entries(importLibrary.templates)) {
                        if (!newLibrary.templates[templateId]) {
                            newLibrary.templates[templateId] = template;
                        } else {
                            // Handle conflicts
                            const existing = newLibrary.templates[templateId];

                            if (conflict === 'newer') {
                                const existingDate = new Date(existing.modified);
                                const importDate = new Date(template.modified);

                                if (importDate > existingDate) {
                                    newLibrary.templates[templateId] = template;
                                }
                            } else if (conflict === 'replace') {
                                newLibrary.templates[templateId] = template;
                            }
                            // 'keep' means do nothing
                        }
                    }
                }
            } else {
                throw new Error('Unknown import format');
            }

            // Save the updated library
            await this.saveLibrary(newLibrary);

            console.log('CCPrompt Storage: Import completed successfully');

            // Calculate templates imported count more efficiently
            let templatesCount = 0;
            if (importData.export_type === 'ccprompt_template') {
                templatesCount = 1;
            } else if (importData.library && importData.library.templates) {
                templatesCount = Object.keys(importData.library.templates).length;
            }

            return {
                success: true,
                templatesImported: templatesCount
            };

        } catch (error) {
            console.error('CCPrompt Storage: Error importing library:', error);
            throw error;
        }
    }

    /**
     * Ensure backup directory exists
     */
    async ensureBackupDirectory() {
        try {
            // Try to list backup directory
            const response = await this.apiCall('list', { path: this.backupPath });

            if (response.status === 404) {
                // Directory doesn't exist - attempt creation through file write
                // This is a limitation of ST's file API, but we handle it gracefully
                console.log('CCPrompt Storage: Creating backup directory...');

                try {
                    await this.apiCall('write', {
                        path: `${this.backupPath}/.gitkeep`,
                        content: '# This file ensures the backup directory exists\n'
                    });
                    console.log('CCPrompt Storage: Backup directory created');
                } catch (createError) {
                    console.warn('CCPrompt Storage: Could not create backup directory, backups may fail:', createError);
                    // Don't throw - let the application continue, backups will fail gracefully
                }
            }
        } catch (error) {
            console.warn('CCPrompt Storage: Could not ensure backup directory:', error);
            // Don't throw - let the application continue without backups
        }
    }
}