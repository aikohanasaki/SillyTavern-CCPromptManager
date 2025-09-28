/**
 * CCPrompt Manager - Import/Export UI
 *
 * Handles the import/export interface including backup management,
 * template sharing, and data recovery features.
 */

import { Popup, POPUP_TYPE, POPUP_RESULT, callGenericPopup } from '../../../popup.js';
import { download, parseJsonFile } from '../../../../utils.js';

export class CCPromptImportExportUI {
    constructor(storage, templateManager) {
        this.storage = storage;
        this.templateManager = templateManager;
    }

    /**
     * Show the import/export interface
     */
    async show() {
        const html = await this.renderImportExportHTML();

        const popup = new Popup(html, POPUP_TYPE.TEXT, '', {
            okButton: 'Close',
            wide: true,
            large: true
        });

        // Set up event handlers
        this.setupEventHandlers(popup.dlg);

        const result = await popup.show();
        return result;
    }

    /**
     * Render the import/export interface HTML
     */
    async renderImportExportHTML() {
        const templates = await this.templateManager.listTemplates();
        const backups = await this.storage.listBackups();
        const stats = await this.templateManager.getStatistics();

        const templateOptions = templates.map(t =>
            `<option value="${t.id}">${t.name}</option>`
        ).join('');

        const backupsList = backups.map(backup => `
            <div class="ccprompt-backup-item" data-filename="${backup.filename}">
                <div class="ccprompt-backup-info">
                    <div class="ccprompt-backup-name">${backup.filename}</div>
                    <div class="ccprompt-backup-details">
                        ${backup.timestamp} • ${backup.type} • ${this.formatFileSize(backup.size)}
                    </div>
                </div>
                <div class="ccprompt-backup-actions">
                    <button class="menu_button_icon" data-action="preview-backup" title="Preview">
                        <i class="fa fa-eye"></i>
                    </button>
                    <button class="menu_button_icon" data-action="restore-backup" title="Restore">
                        <i class="fa fa-undo"></i>
                    </button>
                    <button class="menu_button_icon" data-action="export-backup" title="Download">
                        <i class="fa fa-download"></i>
                    </button>
                    <button class="menu_button_icon caution" data-action="delete-backup" title="Delete">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        return `
            <div class="ccprompt-import-export">
                <div class="ccprompt-sections">

                    <!-- Export Section -->
                    <div class="ccprompt-section">
                        <h3><i class="fa fa-upload"></i> Export Templates</h3>

                        <div class="ccprompt-export-options">
                            <div class="range-block">
                                <label>Export Type:</label>
                                <div class="ccprompt-radio-group">
                                    <label class="checkbox_label">
                                        <input type="radio" name="export_type" value="full" checked>
                                        <span>Full Library (${stats.total_templates} templates)</span>
                                    </label>
                                    <label class="checkbox_label">
                                        <input type="radio" name="export_type" value="templates-only">
                                        <span>Templates Only (no metadata)</span>
                                    </label>
                                    <label class="checkbox_label">
                                        <input type="radio" name="export_type" value="single">
                                        <span>Single Template</span>
                                    </label>
                                </div>
                            </div>

                            <div class="range-block ccprompt-single-template-options" style="display: none;">
                                <label>Select Template:</label>
                                <select id="ccprompt_export_template" class="text_pole">
                                    <option value="">Choose template...</option>
                                    ${templateOptions}
                                </select>
                            </div>

                            <div class="range-block">
                                <label class="checkbox_label">
                                    <input type="checkbox" id="ccprompt_export_metadata" checked>
                                    <span>Include metadata (timestamps, versions)</span>
                                </label>
                            </div>

                            <div class="range-block">
                                <button class="menu_button" id="ccprompt_export_btn">
                                    <i class="fa fa-download"></i> Export to File
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Import Section -->
                    <div class="ccprompt-section">
                        <h3><i class="fa fa-download"></i> Import Templates</h3>

                        <div class="ccprompt-import-options">
                            <div class="range-block">
                                <label>Select File:</label>
                                <input type="file" id="ccprompt_import_file" accept=".json" class="text_pole">
                            </div>

                            <div class="range-block">
                                <label>Import Mode:</label>
                                <select id="ccprompt_import_mode" class="text_pole">
                                    <option value="merge">Merge (keep existing, add new)</option>
                                    <option value="overwrite">Overwrite (replace all templates)</option>
                                    <option value="preview">Preview only (don't import)</option>
                                </select>
                            </div>

                            <div class="range-block">
                                <label>On Conflict:</label>
                                <select id="ccprompt_import_conflict" class="text_pole">
                                    <option value="newer">Use newer version</option>
                                    <option value="keep">Keep existing</option>
                                    <option value="replace">Replace with imported</option>
                                    <option value="prompt">Ask each time</option>
                                </select>
                            </div>

                            <div class="range-block">
                                <label class="checkbox_label">
                                    <input type="checkbox" id="ccprompt_import_backup" checked>
                                    <span>Create backup before import</span>
                                </label>
                            </div>

                            <div class="range-block">
                                <button class="menu_button" id="ccprompt_import_btn" disabled>
                                    <i class="fa fa-upload"></i> Import Templates
                                </button>
                            </div>

                            <div id="ccprompt_import_preview" class="ccprompt-import-preview" style="display: none;">
                                <!-- Preview content will be inserted here -->
                            </div>
                        </div>
                    </div>

                    <!-- Backup Management Section -->
                    <div class="ccprompt-section">
                        <h3><i class="fa fa-history"></i> Backup Management</h3>

                        <div class="ccprompt-backup-controls">
                            <div class="range-block">
                                <div class="flex-container gap10px">
                                    <button class="menu_button flex1" id="ccprompt_manual_backup">
                                        <i class="fa fa-save"></i> Create Manual Backup
                                    </button>
                                    <button class="menu_button caution" id="ccprompt_delete_auto_backups">
                                        <i class="fa fa-trash"></i> Delete Auto Backups
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="ccprompt-backups-list">
                            ${backups.length > 0 ? backupsList : '<div class="ccprompt-empty">No backups found</div>'}
                        </div>
                    </div>

                </div>
            </div>

            <style>
            .ccprompt-import-export {
                padding: 15px;
                max-height: 600px;
                overflow-y: auto;
            }

            .ccprompt-sections {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .ccprompt-section {
                border: 1px solid var(--SmartThemeBorderColor);
                border-radius: 5px;
                padding: 15px;
            }

            .ccprompt-section h3 {
                margin: 0 0 15px 0;
                color: var(--SmartThemeEmColor);
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .ccprompt-radio-group {
                display: flex;
                flex-direction: column;
                gap: 5px;
                margin-left: 10px;
            }

            .ccprompt-backup-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                margin-bottom: 8px;
                background: var(--SmartThemeBodyColor);
                border: 1px solid var(--SmartThemeBorderColor);
                border-radius: 3px;
            }

            .ccprompt-backup-info {
                flex: 1;
            }

            .ccprompt-backup-name {
                font-weight: bold;
                margin-bottom: 3px;
            }

            .ccprompt-backup-details {
                font-size: 0.9em;
                color: var(--SmartThemeQuoteColor);
            }

            .ccprompt-backup-actions {
                display: flex;
                gap: 5px;
            }

            .ccprompt-backup-actions button {
                padding: 5px 8px;
                min-width: auto;
            }

            .ccprompt-import-preview {
                margin-top: 15px;
                padding: 10px;
                background: var(--SmartThemeBlurTintColor);
                border-radius: 3px;
                border: 1px solid var(--SmartThemeBorderColor);
            }

            .ccprompt-preview-item {
                padding: 5px 0;
                border-bottom: 1px solid var(--SmartThemeBorderColor);
            }

            .ccprompt-preview-item:last-child {
                border-bottom: none;
            }

            .ccprompt-preview-conflict {
                color: var(--SmartThemeEmColor);
                font-weight: bold;
            }

            .ccprompt-empty {
                text-align: center;
                color: var(--SmartThemeQuoteColor);
                padding: 20px;
                font-style: italic;
            }

            .flex-container.gap10px {
                gap: 10px;
            }

            .flex1 {
                flex: 1;
            }
            </style>
        `;
    }

    /**
     * Set up event handlers for the interface
     */
    setupEventHandlers(container) {
        // Export type radio buttons
        container.querySelectorAll('input[name="export_type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const singleTemplateOptions = container.querySelector('.ccprompt-single-template-options');
                singleTemplateOptions.style.display = e.target.value === 'single' ? 'block' : 'none';
            });
        });

        // Export button
        const exportBtn = container.querySelector('#ccprompt_export_btn');
        exportBtn.addEventListener('click', () => this.handleExport(container));

        // Import file selection
        const importFile = container.querySelector('#ccprompt_import_file');
        importFile.addEventListener('change', (e) => this.handleFileSelected(e, container));

        // Import button
        const importBtn = container.querySelector('#ccprompt_import_btn');
        importBtn.addEventListener('click', () => this.handleImport(container));

        // Manual backup button
        const manualBackupBtn = container.querySelector('#ccprompt_manual_backup');
        manualBackupBtn.addEventListener('click', () => this.handleManualBackup());

        // Delete auto backups button
        const deleteAutoBackupsBtn = container.querySelector('#ccprompt_delete_auto_backups');
        deleteAutoBackupsBtn.addEventListener('click', () => this.handleDeleteAutoBackups());

        // Backup action buttons
        container.addEventListener('click', (e) => {
            const action = e.target.closest('button')?.dataset.action;
            if (!action) return;

            const backupItem = e.target.closest('.ccprompt-backup-item');
            const filename = backupItem?.dataset.filename;

            switch (action) {
                case 'preview-backup':
                    this.handlePreviewBackup(filename);
                    break;
                case 'restore-backup':
                    this.handleRestoreBackup(filename);
                    break;
                case 'export-backup':
                    this.handleExportBackup(filename);
                    break;
                case 'delete-backup':
                    this.handleDeleteBackup(filename);
                    break;
            }
        });
    }

    /**
     * Handle export button click
     */
    async handleExport(container) {
        try {
            const exportType = container.querySelector('input[name="export_type"]:checked').value;
            const includeMetadata = container.querySelector('#ccprompt_export_metadata').checked;
            let templateId = null;

            if (exportType === 'single') {
                templateId = container.querySelector('#ccprompt_export_template').value;
                if (!templateId) {
                    toastr.error('Please select a template to export');
                    return;
                }
            }

            const options = {
                format: exportType,
                template_id: templateId,
                include_metadata: includeMetadata
            };

            const exportData = await this.storage.exportLibrary(options);

            // Generate filename
            const timestamp = new Date().toISOString().slice(0, 10);
            let filename = `ccprompts-${timestamp}`;

            if (exportType === 'single') {
                const template = await this.templateManager.getTemplate(templateId);
                filename = `ccprompt-${template.name.replace(/[^a-z0-9]/gi, '-')}-${timestamp}`;
            }

            filename += '.json';

            // Download file
            download(exportData, filename, 'application/json');

            toastr.success('Export completed successfully');

        } catch (error) {
            console.error('CCPrompt ImportExportUI: Export error:', error);
            toastr.error('Export failed: ' + error.message);
        }
    }

    /**
     * Handle file selection for import
     */
    async handleFileSelected(event, container) {
        const file = event.target.files[0];
        const importBtn = container.querySelector('#ccprompt_import_btn');
        const previewDiv = container.querySelector('#ccprompt_import_preview');

        if (!file) {
            importBtn.disabled = true;
            previewDiv.style.display = 'none';
            return;
        }

        try {
            const data = await parseJsonFile(file);

            // Validate import data
            if (!this.isValidImportData(data)) {
                throw new Error('Invalid import file format');
            }

            // Show preview if requested
            const importMode = container.querySelector('#ccprompt_import_mode').value;
            if (importMode === 'preview') {
                await this.showImportPreview(data, previewDiv);
                previewDiv.style.display = 'block';
            } else {
                previewDiv.style.display = 'none';
            }

            importBtn.disabled = false;

        } catch (error) {
            console.error('CCPrompt ImportExportUI: File validation error:', error);
            toastr.error('Invalid file: ' + error.message);
            importBtn.disabled = true;
            previewDiv.style.display = 'none';
        }
    }

    /**
     * Handle import button click
     */
    async handleImport(container) {
        try {
            const file = container.querySelector('#ccprompt_import_file').files[0];
            const importMode = container.querySelector('#ccprompt_import_mode').value;
            const conflictMode = container.querySelector('#ccprompt_import_conflict').value;
            const createBackup = container.querySelector('#ccprompt_import_backup').checked;

            if (!file) {
                toastr.error('Please select a file to import');
                return;
            }

            const data = await parseJsonFile(file);

            if (importMode === 'preview') {
                toastr.info('Preview mode - no data was imported');
                return;
            }

            const options = {
                mode: importMode,
                conflict: conflictMode,
                backup_first: createBackup
            };

            const result = await this.storage.importLibrary(data, options);

            if (result.success) {
                toastr.success(`Import completed: ${result.templatesImported} templates imported`);

                // Clear the file input
                container.querySelector('#ccprompt_import_file').value = '';
                container.querySelector('#ccprompt_import_btn').disabled = true;
                container.querySelector('#ccprompt_import_preview').style.display = 'none';
            }

        } catch (error) {
            console.error('CCPrompt ImportExportUI: Import error:', error);
            toastr.error('Import failed: ' + error.message);
        }
    }

    /**
     * Handle manual backup creation
     */
    async handleManualBackup() {
        try {
            const name = await callGenericPopup('Enter backup name (optional):', POPUP_TYPE.INPUT);
            const filename = await this.storage.createManualBackup(name || undefined);

            toastr.success(`Backup created: ${filename}`);

            // Refresh the backup list
            // TODO: Implement refresh mechanism

        } catch (error) {
            console.error('CCPrompt ImportExportUI: Manual backup error:', error);
            toastr.error('Backup failed: ' + error.message);
        }
    }

    /**
     * Handle delete auto backups
     */
    async handleDeleteAutoBackups() {
        try {
            const confirmed = await callGenericPopup('Delete all automatic backups? This cannot be undone.', POPUP_TYPE.CONFIRM) === POPUP_RESULT.AFFIRMATIVE;
            if (!confirmed) return;

            const backups = await this.storage.listBackups();
            const autoBackups = backups.filter(b => b.type === 'auto');

            for (const backup of autoBackups) {
                await this.storage.deleteBackup(backup.filename);
            }

            toastr.success(`Deleted ${autoBackups.length} automatic backups`);

            // TODO: Refresh the backup list

        } catch (error) {
            console.error('CCPrompt ImportExportUI: Delete auto backups error:', error);
            toastr.error('Delete failed: ' + error.message);
        }
    }

    /**
     * Handle backup preview
     */
    async handlePreviewBackup(filename) {
        try {
            const backup = await this.storage.loadBackup(filename);

            // Show preview in a popup
            const templateCount = Object.keys(backup.templates || {}).length;
            const previewText = `
                Backup: ${filename}
                Created: ${backup.created || 'Unknown'}
                Templates: ${templateCount}
                Version: ${backup.version || 1}
            `;

            await callGenericPopup(previewText, POPUP_TYPE.DISPLAY);

        } catch (error) {
            console.error('CCPrompt ImportExportUI: Preview backup error:', error);
            toastr.error('Preview failed: ' + error.message);
        }
    }

    /**
     * Handle backup restore
     */
    async handleRestoreBackup(filename) {
        try {
            const confirmed = await callGenericPopup(`Restore from backup "${filename}"? Current data will be backed up first.`, POPUP_TYPE.CONFIRM) === POPUP_RESULT.AFFIRMATIVE;
            if (!confirmed) return;

            await this.storage.restoreFromBackup(filename);
            toastr.success('Backup restored successfully');

        } catch (error) {
            console.error('CCPrompt ImportExportUI: Restore backup error:', error);
            toastr.error('Restore failed: ' + error.message);
        }
    }

    /**
     * Handle backup export
     */
    async handleExportBackup(filename) {
        try {
            const backup = await this.storage.loadBackup(filename);
            const exportData = JSON.stringify(backup, null, 2);

            download(exportData, filename, 'application/json');
            toastr.success('Backup downloaded');

        } catch (error) {
            console.error('CCPrompt ImportExportUI: Export backup error:', error);
            toastr.error('Export failed: ' + error.message);
        }
    }

    /**
     * Handle backup deletion
     */
    async handleDeleteBackup(filename) {
        try {
            const confirmed = await callGenericPopup(`Delete backup "${filename}"? This cannot be undone.`, POPUP_TYPE.CONFIRM) === POPUP_RESULT.AFFIRMATIVE;
            if (!confirmed) return;

            await this.storage.deleteBackup(filename);
            toastr.success('Backup deleted');

            // TODO: Refresh the backup list

        } catch (error) {
            console.error('CCPrompt ImportExportUI: Delete backup error:', error);
            toastr.error('Delete failed: ' + error.message);
        }
    }

    /**
     * Show import preview
     */
    async showImportPreview(data, previewDiv) {
        try {
            const currentLibrary = await this.storage.loadLibrary();
            let preview = '<h4>Import Preview</h4>';

            if (data.export_type === 'ccprompt_template') {
                // Single template
                const template = data.template;
                const exists = currentLibrary.templates[template.id];

                preview += `<div class="ccprompt-preview-item">
                    <strong>${template.name}</strong> (${template.id})
                    ${exists ? '<span class="ccprompt-preview-conflict">⚠️ Will overwrite existing</span>' : '<span>✓ New template</span>'}
                </div>`;

            } else {
                // Full library
                const templates = data.library.templates || {};
                let newCount = 0;
                let updateCount = 0;

                for (const [id, template] of Object.entries(templates)) {
                    const exists = currentLibrary.templates[id];
                    if (exists) {
                        updateCount++;
                        preview += `<div class="ccprompt-preview-item">
                            <strong>${template.name}</strong> (${id})
                            <span class="ccprompt-preview-conflict">⚠️ Will update existing</span>
                        </div>`;
                    } else {
                        newCount++;
                        preview += `<div class="ccprompt-preview-item">
                            <strong>${template.name}</strong> (${id})
                            <span>✓ New template</span>
                        </div>`;
                    }
                }

                preview = `<h4>Import Preview</h4>
                    <p><strong>${newCount} new templates, ${updateCount} updates</strong></p>
                    ${preview}`;
            }

            previewDiv.innerHTML = preview;

        } catch (error) {
            console.error('CCPrompt ImportExportUI: Preview error:', error);
            previewDiv.innerHTML = '<p class="ccprompt-preview-error">Preview failed: ' + error.message + '</p>';
        }
    }

    /**
     * Validate import data format
     */
    isValidImportData(data) {
        if (!data || typeof data !== 'object') return false;

        if (data.export_type === 'ccprompt_template') {
            return data.template && data.template.id && data.template.name;
        }

        if (data.export_type === 'ccprompt_library_full') {
            return data.library && data.library.templates;
        }

        return false;
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (!bytes) return '0 B';

        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}