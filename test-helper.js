/**
 * CCPromptManager Test Helper Script
 *
 * Run this in the browser console while testing the extension.
 * Provides utility functions to help with testing and debugging.
 *
 * Usage:
 *   1. Open SillyTavern in browser
 *   2. Open Developer Console (F12)
 *   3. Copy and paste this entire file into console
 *   4. Use test functions like: CCPM_Test.createSampleTemplates()
 */

window.CCPM_Test = {
    /**
     * Create sample templates for testing
     */
    createSampleTemplates() {
        console.log('Creating sample templates...');

        const samples = [
            {
                name: 'Test Template 1',
                description: 'Basic test template with main prompt',
                prompts: {
                    main: {
                        identifier: 'main',
                        name: 'Main Prompt',
                        content: 'This is a test main prompt.',
                        role: 'system',
                        system_prompt: true,
                        injection_position: 0,
                        injection_depth: 4
                    }
                }
            },
            {
                name: 'Test Template 2',
                description: 'Template with multiple prompts',
                prompts: {
                    main: {
                        identifier: 'main',
                        name: 'Main Prompt',
                        content: 'Main prompt content for test 2.',
                        role: 'system',
                        system_prompt: true,
                        injection_position: 0,
                        injection_depth: 4
                    },
                    jailbreak: {
                        identifier: 'jailbreak',
                        name: 'Jailbreak Prompt',
                        content: 'Jailbreak content for test 2.',
                        role: 'system',
                        system_prompt: false,
                        injection_position: 0,
                        injection_depth: 4
                    }
                }
            },
            {
                name: 'Test Template 3',
                description: 'NSFW focused template',
                prompts: {
                    nsfw: {
                        identifier: 'nsfw',
                        name: 'NSFW Prompt',
                        content: 'NSFW prompt content for testing.',
                        role: 'system',
                        system_prompt: false,
                        injection_position: 0,
                        injection_depth: 4
                    }
                }
            }
        ];

        const created = [];
        samples.forEach(data => {
            try {
                const template = promptTemplateManager.createTemplate(data);
                created.push(template);
                console.log(`✓ Created template: ${template.name} (${template.id})`);
            } catch (error) {
                console.error(`✗ Failed to create template "${data.name}":`, error);
            }
        });

        console.log(`Created ${created.length}/${samples.length} sample templates`);
        return created;
    },

    /**
     * Delete all templates
     */
    clearAllTemplates() {
        const templates = promptTemplateManager.listTemplates();
        console.log(`Deleting ${templates.length} templates...`);

        templates.forEach(t => {
            promptTemplateManager.deleteTemplate(t.id);
            console.log(`✓ Deleted template: ${t.name} (${t.id})`);
        });

        console.log('All templates cleared');
    },

    /**
     * List all templates with details
     */
    listTemplates() {
        const templates = promptTemplateManager.listTemplates();
        console.log(`Total templates: ${templates.length}`);
        console.table(templates.map(t => ({
            id: t.id,
            name: t.name,
            prompts: Object.keys(t.prompts).join(', '),
            created: new Date(t.createdAt).toLocaleString()
        })));
        return templates;
    },

    /**
     * Get current locks
     */
    async getCurrentLocks() {
        const locks = await promptTemplateManager.getCurrentLocks();
        console.log('Current locks:', locks);
        return locks;
    },

    /**
     * Get effective lock (what would be applied)
     */
    async getEffectiveLock() {
        const lock = await promptTemplateManager.getEffectiveLock();
        console.log('Effective lock:', lock);
        return lock;
    },

    /**
     * Get current context
     */
    getContext() {
        const context = promptTemplateManager.lockManager.chatContext.getCurrent();
        console.log('Current context:', context);
        return context;
    },

    /**
     * Test lock priority resolution
     */
    async testLockPriority() {
        console.log('Testing lock priority resolution...');

        const templates = promptTemplateManager.listTemplates();
        if (templates.length < 3) {
            console.error('Need at least 3 templates for this test. Run CCPM_Test.createSampleTemplates() first.');
            return;
        }

        const [t1, t2, t3] = templates;
        const context = this.getContext();

        console.log('Locking templates to different targets...');

        if (context.isGroupChat) {
            // Group chat: test group > chat > character
            console.log('Testing group chat priority...');
            await promptTemplateManager.lockTemplate(t1.id, 'character');
            await promptTemplateManager.lockTemplate(t2.id, 'chat');
            await promptTemplateManager.lockTemplate(t3.id, 'group');

            const effective = await promptTemplateManager.getEffectiveLock();
            console.log('Expected: template 3 (group), Got:', effective);

            if (effective.templateId === t3.id && effective.source === 'group') {
                console.log('✓ Priority test PASSED: Group lock has highest priority');
            } else {
                console.error('✗ Priority test FAILED: Expected group lock to win');
            }
        } else {
            // Single chat: test character > chat
            console.log('Testing single chat priority...');
            await promptTemplateManager.lockTemplate(t1.id, 'character');
            await promptTemplateManager.lockTemplate(t2.id, 'chat');

            const effective = await promptTemplateManager.getEffectiveLock();
            console.log('Expected: template 1 (character), Got:', effective);

            if (effective.templateId === t1.id && effective.source === 'character') {
                console.log('✓ Priority test PASSED: Character lock has highest priority');
            } else {
                console.error('✗ Priority test FAILED: Expected character lock to win');
            }
        }
    },

    /**
     * Clear all locks
     */
    async clearAllLocks() {
        console.log('Clearing all locks...');
        await promptTemplateManager.clearTemplateLock('character');
        await promptTemplateManager.clearTemplateLock('chat');
        await promptTemplateManager.clearTemplateLock('group');
        console.log('All locks cleared');
    },

    /**
     * Test auto-apply functionality
     */
    async testAutoApply() {
        console.log('Testing auto-apply functionality...');
        const templates = promptTemplateManager.listTemplates();

        if (templates.length === 0) {
            console.error('No templates available. Run CCPM_Test.createSampleTemplates() first.');
            return;
        }

        const template = templates[0];
        console.log(`Locking template "${template.name}" to character...`);
        await promptTemplateManager.lockTemplate(template.id, 'character');

        console.log('Manual trigger: applying locked template...');
        const result = await promptTemplateManager.applyLockedTemplate();

        if (result) {
            console.log('✓ Auto-apply test PASSED: Template applied successfully');
            console.log('Check Advanced Formatting > Prompts to verify content');
        } else {
            console.error('✗ Auto-apply test FAILED: Template was not applied');
        }
    },

    /**
     * Test import/export
     */
    async testImportExport() {
        console.log('Testing import/export...');

        const originalTemplates = promptTemplateManager.listTemplates();
        console.log(`Exporting ${originalTemplates.length} templates...`);

        const exported = promptTemplateManager.exportTemplates();
        console.log('Exported data:', exported);

        console.log('Clearing templates...');
        this.clearAllTemplates();

        console.log('Importing templates...');
        promptTemplateManager.importTemplates(exported);

        const importedTemplates = promptTemplateManager.listTemplates();

        if (importedTemplates.length === originalTemplates.length) {
            console.log(`✓ Import/Export test PASSED: ${importedTemplates.length} templates restored`);
        } else {
            console.error(`✗ Import/Export test FAILED: Expected ${originalTemplates.length}, got ${importedTemplates.length}`);
        }

        return { exported, imported: importedTemplates };
    },

    /**
     * Validate template structure
     */
    validateTemplate(templateId) {
        const template = promptTemplateManager.getTemplate(templateId);
        if (!template) {
            console.error('Template not found:', templateId);
            return false;
        }

        console.log('Validating template:', template.name);
        const issues = [];

        // Check required fields
        if (!template.id) issues.push('Missing id');
        if (!template.name) issues.push('Missing name');
        if (!template.prompts || typeof template.prompts !== 'object') issues.push('Invalid prompts structure');
        if (!template.createdAt) issues.push('Missing createdAt');
        if (!template.updatedAt) issues.push('Missing updatedAt');

        // Check prompts structure
        if (template.prompts) {
            for (const [identifier, promptData] of Object.entries(template.prompts)) {
                if (!promptData.identifier) issues.push(`Prompt ${identifier} missing identifier`);
                if (!promptData.name) issues.push(`Prompt ${identifier} missing name`);
                if (promptData.content === undefined) issues.push(`Prompt ${identifier} missing content`);
                if (!promptData.role) issues.push(`Prompt ${identifier} missing role`);
            }
        }

        if (issues.length === 0) {
            console.log('✓ Template validation PASSED');
            return true;
        } else {
            console.error('✗ Template validation FAILED:');
            issues.forEach(issue => console.error('  - ' + issue));
            return false;
        }
    },

    /**
     * Check extension settings
     */
    checkSettings() {
        const settings = extension_settings?.ccPromptManager;
        console.log('Extension settings:', settings);

        if (!settings) {
            console.error('Extension settings not found!');
            return null;
        }

        console.log('Templates in storage:', Object.keys(settings.templates || {}).length);
        console.log('Character locks:', Object.keys(settings.templateLocks?.character || {}).length);
        console.log('Auto-apply mode:', settings.autoApplyLocked);
        console.log('Lock priority:', settings.lockPriority);

        return settings;
    },

    /**
     * Stress test: create many templates
     */
    stressTest(count = 50) {
        console.log(`Creating ${count} templates for stress test...`);
        const start = performance.now();

        for (let i = 1; i <= count; i++) {
            promptTemplateManager.createTemplate({
                name: `Stress Test Template ${i}`,
                description: `Auto-generated template ${i} for stress testing`,
                prompts: {
                    main: {
                        identifier: 'main',
                        name: 'Main Prompt',
                        content: `This is stress test template ${i}.`,
                        role: 'system',
                        system_prompt: true,
                        injection_position: 0,
                        injection_depth: 4
                    }
                }
            });
        }

        const end = performance.now();
        console.log(`✓ Created ${count} templates in ${(end - start).toFixed(2)}ms`);
        console.log(`Average: ${((end - start) / count).toFixed(2)}ms per template`);
    },

    /**
     * Run all automated tests
     */
    async runAllTests() {
        console.log('='.repeat(50));
        console.log('Running CCPromptManager automated tests...');
        console.log('='.repeat(50));

        try {
            // Clean slate
            console.log('\n1. Clearing existing data...');
            await this.clearAllLocks();
            this.clearAllTemplates();

            // Test 1: Template creation
            console.log('\n2. Testing template creation...');
            const templates = this.createSampleTemplates();
            if (templates.length !== 3) throw new Error('Template creation failed');

            // Test 2: List templates
            console.log('\n3. Testing template listing...');
            this.listTemplates();

            // Test 3: Validate templates
            console.log('\n4. Validating template structures...');
            templates.forEach(t => this.validateTemplate(t.id));

            // Test 4: Context detection
            console.log('\n5. Testing context detection...');
            this.getContext();

            // Test 5: Lock priority
            console.log('\n6. Testing lock priority...');
            await this.testLockPriority();

            // Test 6: Auto-apply
            console.log('\n7. Testing auto-apply...');
            await this.testAutoApply();

            // Test 7: Import/Export
            console.log('\n8. Testing import/export...');
            await this.testImportExport();

            // Test 8: Settings check
            console.log('\n9. Checking extension settings...');
            this.checkSettings();

            console.log('\n' + '='.repeat(50));
            console.log('✓ All automated tests completed successfully!');
            console.log('='.repeat(50));
            console.log('\nNote: Some tests require manual verification in the UI.');
            console.log('Please review the TESTING.md checklist for complete testing.');

        } catch (error) {
            console.error('\n' + '='.repeat(50));
            console.error('✗ Test suite failed:', error);
            console.error('='.repeat(50));
        }
    },

    /**
     * Show help
     */
    help() {
        console.log(`
CCPromptManager Test Helper Functions
======================================

Basic Testing:
  CCPM_Test.createSampleTemplates()  - Create 3 sample templates
  CCPM_Test.listTemplates()          - List all templates
  CCPM_Test.clearAllTemplates()      - Delete all templates

Lock Testing:
  CCPM_Test.getCurrentLocks()        - Show current locks
  CCPM_Test.getEffectiveLock()       - Show which lock would be applied
  CCPM_Test.clearAllLocks()          - Clear all locks
  CCPM_Test.testLockPriority()       - Test lock priority resolution

Context & State:
  CCPM_Test.getContext()             - Show current chat context
  CCPM_Test.checkSettings()          - Check extension settings

Feature Testing:
  CCPM_Test.testAutoApply()          - Test auto-apply functionality
  CCPM_Test.testImportExport()       - Test import/export
  CCPM_Test.validateTemplate(id)    - Validate a template structure

Performance:
  CCPM_Test.stressTest(50)           - Create 50 templates for stress testing

Run Everything:
  CCPM_Test.runAllTests()            - Run all automated tests

Get Help:
  CCPM_Test.help()                   - Show this help message
        `);
    }
};

// Auto-run help on load
console.log('CCPromptManager Test Helper loaded!');
console.log('Type CCPM_Test.help() for available commands');
console.log('Type CCPM_Test.runAllTests() to run all automated tests');