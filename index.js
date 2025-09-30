import { Popup, POPUP_TYPE, POPUP_RESULT } from '../../../popup.js';
import { extension_settings, getContext } from '../../../extensions.js';
import { eventSource, event_types, chat_metadata, name2, systemUserName, neutralCharacterName, characters, saveSettingsDebounced } from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import { oai_settings, promptManager } from '../../../openai.js';
import { selected_group, groups, editGroup } from '../../../group-chats.js';
import { escapeHtml } from '../../../utils.js';

const MODULE_NAME = 'CCPM';
const CACHE_TTL = 1000;

const CHAT_TYPES = {
    SINGLE: 'single',
    GROUP: 'group'
};

const SETTING_SOURCES = {
    CHARACTER: 'character',
    CHAT: 'chat',
    GROUP: 'group',
    GROUP_CHAT: 'group chat'
};

const AUTO_APPLY_MODES = {
    NEVER: 'never',
    ASK: 'ask',
    ALWAYS: 'always'
};

// Utility functions
const getCurrentChatMetadata = () => chat_metadata;

// ===== LOCKING SYSTEM CLASSES =====

/**
 * Centralized chat context detection and management
 */
class ChatContext {
    constructor() {
        this.cache = new Map();
        this.cacheTime = 0;
    }

    getCurrent() {
        const now = Date.now();
        if (now - this.cacheTime < CACHE_TTL && this.cache.has('current')) {
            return this.cache.get('current');
        }

        try {
            const context = this._buildContext();
            this.cache.set('current', context);
            this.cacheTime = now;
            return context;
        } catch (error) {
            toastr.error('CCPM: Error building context:', error);
            if (this.cache.has('current')) {
                toastr.warning('CCPM: Using stale cached context due to build error');
                return this.cache.get('current');
            }
            throw error;
        }
    }

    invalidate() {
        this.cache.clear();
        this.cacheTime = 0;
    }

    _buildContext() {
        const isGroupChat = !!selected_group;

        if (isGroupChat) {
            return this._buildGroupContext();
        } else {
            return this._buildSingleContext();
        }
    }

    _buildGroupContext() {
        const groupId = selected_group;
        const group = groups?.find(x => x.id === groupId);

        return {
            type: CHAT_TYPES.GROUP,
            isGroupChat: true,
            groupId,
            groupName: group?.name || null,
            chatId: group?.chat_id || null,
            chatName: group?.name || null,
            characterName: group?.name || null,
            primaryId: groupId,
            secondaryId: group?.chat_id
        };
    }

    _buildSingleContext() {
        const characterName = this._getCharacterNameForSettings();
        const chatId = this._getCurrentChatId();

        return {
            type: CHAT_TYPES.SINGLE,
            isGroupChat: false,
            groupId: null,
            groupName: null,
            chatId,
            chatName: chatId,
            characterName,
            primaryId: characterName,
            secondaryId: chatId
        };
    }

    _getCharacterNameForSettings() {
        let characterName = name2;

        if (!characterName || characterName === systemUserName || characterName === neutralCharacterName) {
            characterName = this._getCharacterNameFromChatMetadata();
        }

        if (!characterName) {
            return null;
        }

        characterName = String(characterName).trim();
        if (characterName.normalize) {
            characterName = characterName.normalize('NFC');
        }

        return characterName;
    }

    _getCharacterNameFromChatMetadata() {
        try {
            const metadata = getCurrentChatMetadata();
            const characterName = metadata?.character_name;
            return characterName && typeof characterName === 'string' ? characterName.trim() : null;
        } catch (error) {
            return null;
        }
    }

    _getCurrentChatId() {
        try {
            const context = getContext();
            return context?.chatId || null;
        } catch (error) {
            return null;
        }
    }
}

/**
 * Centralized storage operations for template locking
 */
class TemplateStorageAdapter {
    constructor() {
        this.EXTENSION_KEY = MODULE_NAME;
    }

    getExtensionSettings() {
        if (!extension_settings[this.EXTENSION_KEY]) {
            extension_settings[this.EXTENSION_KEY] = {
                templates: {},
                templateLocks: {},
                version: '1.0.0'
            };
        }
        return extension_settings[this.EXTENSION_KEY];
    }

    saveExtensionSettings() {
        saveSettingsDebounced();
    }

    // Character template locks
    getCharacterTemplateLock(characterKey) {
        if (characterKey === undefined || characterKey === null) {
            return null;
        }

        const extensionSettings = this.getExtensionSettings();
        const chIdKey = String(characterKey);
        return extensionSettings.templateLocks?.character?.[chIdKey] || null;
    }

    setCharacterTemplateLock(characterKey, templateId) {
        if (characterKey === undefined || characterKey === null) {
            return false;
        }

        const extensionSettings = this.getExtensionSettings();

        if (!extensionSettings.templateLocks) {
            extensionSettings.templateLocks = {};
        }
        if (!extensionSettings.templateLocks.character) {
            extensionSettings.templateLocks.character = {};
        }

        const saveKey = String(characterKey);
        extensionSettings.templateLocks.character[saveKey] = templateId;
        this.saveExtensionSettings();
        return true;
    }

    deleteCharacterTemplateLock(characterKey) {
        if (characterKey === undefined || characterKey === null) {
            return false;
        }

        const extensionSettings = this.getExtensionSettings();
        const chIdKey = String(characterKey);

        if (extensionSettings.templateLocks?.character?.[chIdKey]) {
            delete extensionSettings.templateLocks.character[chIdKey];
            this.saveExtensionSettings();
            return true;
        }

        return false;
    }

    // Group template locks
    getGroupTemplateLock(groupId) {
        if (!groupId) {
            return null;
        }

        try {
            const group = groups?.find(x => x.id === groupId);
            return group?.ccpm_template_lock || null;
        } catch (error) {
            toastr.warning('CCPM: Error getting group template lock:', error);
            return null;
        }
    }

    async setGroupTemplateLock(groupId, templateId) {
        if (!groupId) {
            return false;
        }

        try {
            const group = groups?.find(x => x.id === groupId);
            if (!group) {
                toastr.warning('CCPM: Cannot save group template lock - group not found');
                return false;
            }

            group.ccpm_template_lock = templateId;
            await editGroup(groupId, false, false);
            return true;
        } catch (error) {
            toastr.error('CCPM: Error saving group template lock:', error);
            return false;
        }
    }

    async deleteGroupTemplateLock(groupId) {
        if (!groupId) {
            return false;
        }

        try {
            const group = groups?.find(x => x.id === groupId);
            if (group?.ccpm_template_lock) {
                delete group.ccpm_template_lock;
                await editGroup(groupId, false, false);
                return true;
            }
            return false;
        } catch (error) {
            toastr.error('CCPM: Error deleting group template lock:', error);
            return false;
        }
    }

    // Chat template locks
    getChatTemplateLock() {
        try {
            const metadata = getCurrentChatMetadata();
            return metadata?.[this.EXTENSION_KEY]?.templateLock || null;
        } catch (error) {
            toastr.warning('CCPM: Error getting chat template lock:', error);
            return null;
        }
    }

    setChatTemplateLock(templateId) {
        try {
            const metadata = getCurrentChatMetadata();
            if (!metadata) {
                toastr.warning('CCPM: Cannot save chat template lock - no chat metadata available');
                return false;
            }

            if (!metadata[this.EXTENSION_KEY]) {
                metadata[this.EXTENSION_KEY] = {};
            }
            metadata[this.EXTENSION_KEY].templateLock = templateId;
            this._triggerMetadataSave();
            return true;
        } catch (error) {
            toastr.error('CCPM: Error saving chat template lock:', error);
            return false;
        }
    }

    deleteChatTemplateLock() {
        try {
            const metadata = getCurrentChatMetadata();
            if (metadata?.[this.EXTENSION_KEY]?.templateLock) {
                delete metadata[this.EXTENSION_KEY].templateLock;
                this._triggerMetadataSave();
                return true;
            }
            return false;
        } catch (error) {
            toastr.error('CCPM: Error deleting chat template lock:', error);
            return false;
        }
    }

    // Group chat template locks
    getGroupChatTemplateLock(groupId) {
        if (!groupId) {
            return null;
        }

        try {
            return (typeof chat_metadata !== 'undefined') ? chat_metadata[this.EXTENSION_KEY]?.templateLock || null : null;
        } catch (error) {
            toastr.warning('CCPM: Error getting group chat template lock:', error);
            return null;
        }
    }

    async setGroupChatTemplateLock(groupId, templateId) {
        if (!groupId) {
            return false;
        }

        try {
            if (typeof chat_metadata !== 'undefined') {
                if (!chat_metadata[this.EXTENSION_KEY]) {
                    chat_metadata[this.EXTENSION_KEY] = {};
                }
                chat_metadata[this.EXTENSION_KEY].templateLock = templateId;
                return true;
            }
            return false;
        } catch (error) {
            toastr.error('CCPM: Error saving group chat template lock:', error);
            return false;
        }
    }

    async deleteGroupChatTemplateLock(groupId) {
        if (!groupId) {
            return false;
        }

        try {
            if (typeof chat_metadata !== 'undefined' && chat_metadata[this.EXTENSION_KEY]?.templateLock) {
                delete chat_metadata[this.EXTENSION_KEY].templateLock;
                return true;
            }
            return false;
        } catch (error) {
            toastr.error('CCPM: Error deleting group chat template lock:', error);
            return false;
        }
    }

    _triggerMetadataSave() {
        try {
            saveMetadataDebounced();
        } catch (error) {
            toastr.error('CCPM: Error triggering metadata save:', error);
        }
    }
}

/**
 * Template lock priority resolution
 */
class TemplateLockResolver {
    constructor(extensionSettings) {
        this.extensionSettings = extensionSettings;
    }

    resolve(context, availableLocks) {
        if (context.isGroupChat) {
            return this._resolveGroupLocks(context, availableLocks);
        } else {
            return this._resolveSingleLocks(context, availableLocks);
        }
    }

    _resolveGroupLocks(context, locks) {
        const prefs = this.extensionSettings;
        const { group, chat, character } = locks;

        // Use user-defined priorities for group chats
        if (prefs.preferIndividualCharacterInGroup && character) {
            return { templateId: character, source: SETTING_SOURCES.CHARACTER };
        }

        if (prefs.preferGroupOverChat) {
            if (group) return { templateId: group, source: SETTING_SOURCES.GROUP };
            if (chat) return { templateId: chat, source: `${SETTING_SOURCES.GROUP_CHAT} (fallback)` };
            if (character) return { templateId: character, source: `${SETTING_SOURCES.CHARACTER} (fallback)` };
        } else {
            if (chat) return { templateId: chat, source: SETTING_SOURCES.GROUP_CHAT };
            if (group) return { templateId: group, source: `${SETTING_SOURCES.GROUP} (fallback)` };
            if (character) return { templateId: character, source: `${SETTING_SOURCES.CHARACTER} (fallback)` };
        }

        return { templateId: null, source: 'none' };
    }

    _resolveSingleLocks(context, locks) {
        const prefs = this.extensionSettings;
        const { character, chat } = locks;

        // Use user-defined priority for single chats
        if (prefs.preferCharacterOverChat) {
            if (character) return { templateId: character, source: SETTING_SOURCES.CHARACTER };
            if (chat) return { templateId: chat, source: `${SETTING_SOURCES.CHAT} (fallback)` };
        } else {
            if (chat) return { templateId: chat, source: SETTING_SOURCES.CHAT };
            if (character) return { templateId: character, source: `${SETTING_SOURCES.CHARACTER} (fallback)` };
        }

        return { templateId: null, source: 'none' };
    }
}

/**
 * Main template lock manager
 */
class TemplateLockManager {
    constructor(storage) {
        this.storage = storage;
        this.lockResolver = new TemplateLockResolver(storage.getExtensionSettings());
        this.chatContext = new ChatContext();
        this.currentLocks = this._getEmptyLocks();
    }

    _getEmptyLocks() {
        return {
            character: null,
            chat: null,
            group: null
        };
    }

    async loadCurrentLocks() {
        const context = this.chatContext.getCurrent();
        this.currentLocks = this._getEmptyLocks();

        if (context.isGroupChat) {
            this._loadGroupLocks(context);
        } else {
            this._loadSingleLocks(context);
        }

        return this.currentLocks;
    }

    _loadGroupLocks(context) {
        if (context.groupId) {
            this.currentLocks.group = this.storage.getGroupTemplateLock(context.groupId);
            this.currentLocks.chat = this.storage.getGroupChatTemplateLock(context.groupId);
        }

        // Load character lock for the primary character in the group
        if (context.characterName) {
            const chId = characters?.findIndex(x => x.name === context.characterName);
            const characterKey = chId !== -1 ? chId : context.characterName;
            this.currentLocks.character = this.storage.getCharacterTemplateLock(characterKey);
        }
    }

    _loadSingleLocks(context) {
        if (context.characterName) {
            const chId = characters?.findIndex(x => x.name === context.characterName);
            const characterKey = chId !== -1 ? chId : context.characterName;
            this.currentLocks.character = this.storage.getCharacterTemplateLock(characterKey);
        }

        if (context.chatId) {
            this.currentLocks.chat = this.storage.getChatTemplateLock();
        }
    }

    async getLockToApply() {
        const context = this.chatContext.getCurrent();
        // Pass extension settings to resolver for priority preferences
        const settings = this.storage.getExtensionSettings();
        this.lockResolver = new TemplateLockResolver(settings);
        return this.lockResolver.resolve(context, this.currentLocks);
    }

    async setLock(target, templateId) {
        const context = this.chatContext.getCurrent();
        let success = false;

        switch (target) {
            case 'character':
                if (context.characterName) {
                    const chId = characters?.findIndex(x => x.name === context.characterName);
                    const characterKey = chId !== -1 ? chId : context.characterName;
                    success = this.storage.setCharacterTemplateLock(characterKey, templateId);
                    if (success) this.currentLocks.character = templateId;
                }
                break;
            case 'chat':
                if (context.isGroupChat) {
                    success = await this.storage.setGroupChatTemplateLock(context.groupId, templateId);
                } else {
                    success = this.storage.setChatTemplateLock(templateId);
                }
                if (success) this.currentLocks.chat = templateId;
                break;
            case 'group':
                if (context.isGroupChat && context.groupId) {
                    success = await this.storage.setGroupTemplateLock(context.groupId, templateId);
                    if (success) this.currentLocks.group = templateId;
                }
                break;
        }

        return success;
    }

    async clearLock(target) {
        const context = this.chatContext.getCurrent();
        let success = false;

        switch (target) {
            case 'character':
                if (context.characterName) {
                    const chId = characters?.findIndex(x => x.name === context.characterName);
                    const characterKey = chId !== -1 ? chId : context.characterName;
                    success = this.storage.deleteCharacterTemplateLock(characterKey);
                    if (success) this.currentLocks.character = null;
                }
                break;
            case 'chat':
                if (context.isGroupChat) {
                    success = await this.storage.deleteGroupChatTemplateLock(context.groupId);
                } else {
                    success = this.storage.deleteChatTemplateLock();
                }
                if (success) this.currentLocks.chat = null;
                break;
            case 'group':
                if (context.isGroupChat && context.groupId) {
                    success = await this.storage.deleteGroupTemplateLock(context.groupId);
                    if (success) this.currentLocks.group = null;
                }
                break;
        }

        return success;
    }

    onContextChanged() {
        this.chatContext.invalidate();
        this.loadCurrentLocks();
    }
}

// PromptTemplate: Represents a reusable prompt template
class PromptTemplate {
	/**
	 * @param {Object} param0
	 * @param {string} param0.name - Name of the template
	 * @param {string} param0.description - Description of the template
	 * @param {Object} param0.prompts - SillyTavern prompt configuration object
	 * @param {Array} [param0.promptOrder] - Order of prompts
	 * @param {string} [param0.characterName] - Name of character this template was created for
	 * @param {string} [param0.id] - Optional unique identifier
	 */
	constructor({ name, description, prompts, promptOrder, characterName, id }) {
		this.id = id || PromptTemplate.generateId();
		this.name = name;
		this.description = description;
		// Store ST-compatible prompt structure
		this.prompts = this.validateAndNormalizePrompts(prompts || {});
		this.promptOrder = promptOrder || [];
		this.characterName = characterName || null; // Store for reference/display
		this.createdAt = new Date().toISOString();
		this.updatedAt = new Date().toISOString();
	}

	/**
	 * Validate and normalize prompts to SillyTavern format
	 * @param {Object} prompts - Raw prompt data
	 * @returns {Object} - Normalized SillyTavern prompt structure
	 */
	validateAndNormalizePrompts(prompts) {
		const normalized = {};

		// Accept all prompts - ST supports many identifiers dynamically
		// Don't filter by a hardcoded list to avoid data loss
		for (const [identifier, promptData] of Object.entries(prompts)) {
			if (identifier && promptData && typeof promptData === 'object') {
				// Keep all existing properties from ST's prompt structure
				normalized[identifier] = {
					identifier: identifier,
					...promptData  // Preserve all ST prompt properties
				};
			}
		}

		return normalized;
	}

	/**
	 * Get default name for prompt identifier
	 * @param {string} identifier
	 * @returns {string}
	 */
	getDefaultPromptName(identifier) {
		const names = {
			'main': 'Main Prompt',
			'nsfw': 'NSFW Prompt',
			'jailbreak': 'Jailbreak Prompt',
			'impersonation': 'Impersonation Prompt',
			'utility': 'Utility Prompt'
		};
		return names[identifier] || identifier;
	}

	static generateId() {
		return 'tmpl_' + Math.random().toString(36).substr(2, 9);
	}

	update(fields) {
		// Handle prompt updates specially to maintain validation
		if (fields.prompts) {
			this.prompts = this.validateAndNormalizePrompts(fields.prompts);
			delete fields.prompts;
		}
		Object.assign(this, fields);
		this.updatedAt = new Date().toISOString();
	}
}

// PromptTemplateManager: Handles CRUD for prompt templates and template locking
class PromptTemplateManager {
	constructor() {
		/** @type {Map<string, PromptTemplate>} */
		this.templates = new Map();

		// Initialize locking system
		this.storage = new TemplateStorageAdapter();
		this.lockManager = new TemplateLockManager(this.storage);

		this.initializeSettings();
		this.loadTemplatesFromSettings();
		this.setupEventHandlers();
	}

	// Initialize extension settings with defaults
	initializeSettings() {
		const defaultSettings = {
			templates: {},
			templateLocks: {},
			autoApplyMode: AUTO_APPLY_MODES.ASK,  // 'never', 'ask', or 'always'
			// Priority preferences for single chat (character vs chat)
			preferCharacterOverChat: true,
			// Priority preferences for group chat (group vs chat vs character)
			preferGroupOverChat: true,
			preferIndividualCharacterInGroup: false,
			version: '1.0.0'
		};

		if (!extension_settings.ccPromptManager) {
			extension_settings.ccPromptManager = defaultSettings;
			// Don't save during initialization - SillyTavern will handle persistence
		}

		// Ensure all settings exist
		if (extension_settings.ccPromptManager.preferCharacterOverChat === undefined) {
			extension_settings.ccPromptManager.preferCharacterOverChat = true;
		}
		if (extension_settings.ccPromptManager.preferGroupOverChat === undefined) {
			extension_settings.ccPromptManager.preferGroupOverChat = true;
		}
		if (extension_settings.ccPromptManager.preferIndividualCharacterInGroup === undefined) {
			extension_settings.ccPromptManager.preferIndividualCharacterInGroup = false;
		}

		// Migrate old setting if it exists
		if (extension_settings.ccPromptManager.autoApplyLocked && !extension_settings.ccPromptManager.autoApplyMode) {
			const oldValue = extension_settings.ccPromptManager.autoApplyLocked;
			extension_settings.ccPromptManager.autoApplyMode = oldValue === 'auto' ? AUTO_APPLY_MODES.ALWAYS : oldValue === 'ask' ? AUTO_APPLY_MODES.ASK : AUTO_APPLY_MODES.NEVER;
			delete extension_settings.ccPromptManager.autoApplyLocked;
		}
	}

	// Save current state to settings
	saveSettings() {
		console.log('CCPM DEBUG: saveSettings called');
		if (!extension_settings.ccPromptManager) {
			extension_settings.ccPromptManager = {};
		}

		const exported = this.exportTemplates();
		console.log('CCPM DEBUG: Exporting templates, count:', exported.length);
		extension_settings.ccPromptManager.templates = exported.reduce((acc, template) => {
			acc[template.id] = template;
			return acc;
		}, {});

		console.log('CCPM DEBUG: Templates saved to extension_settings, ids:', Object.keys(extension_settings.ccPromptManager.templates));
		console.log('CCPM DEBUG: Calling saveSettingsDebounced');
		saveSettingsDebounced();
	}

	// Load templates from settings
	loadTemplatesFromSettings() {
		console.log('CCPM DEBUG: loadTemplatesFromSettings called');
		console.log('CCPM DEBUG: extension_settings.ccPromptManager exists?', !!extension_settings.ccPromptManager);
		if (extension_settings.ccPromptManager?.templates) {
			console.log('CCPM DEBUG: Found templates in extension_settings, count:', Object.keys(extension_settings.ccPromptManager.templates).length);
			const templateData = Object.values(extension_settings.ccPromptManager.templates);
			console.log('CCPM DEBUG: Template data to load:', templateData);
			// Import without saving (avoid infinite loop with SETTINGS_UPDATED event)
			for (const data of templateData) {
				const tmpl = new PromptTemplate(data);
				console.log('CCPM DEBUG: Loading template:', tmpl.id, tmpl.name);
				this.templates.set(tmpl.id, tmpl);
			}
			console.log('CCPM DEBUG: Templates loaded, this.templates.size:', this.templates.size);
		} else {
			console.log('CCPM DEBUG: No templates found in extension_settings');
		}
	}

	/**
	 * Create and store a new prompt template
	 * @param {Object} data - Template data
	 * @returns {PromptTemplate}
	 */
	createTemplate(data) {
		console.log('CCPM DEBUG: createTemplate called with data:', data);
		const tmpl = new PromptTemplate(data);
		console.log('CCPM DEBUG: PromptTemplate created, id:', tmpl.id, 'name:', tmpl.name);
		this.templates.set(tmpl.id, tmpl);
		console.log('CCPM DEBUG: Template added to this.templates Map, size:', this.templates.size);
		console.log('CCPM DEBUG: Calling saveSettings from createTemplate');
		this.saveSettings();
		return tmpl;
	}

	/**
	 * Get a template by id
	 * @param {string} id
	 * @returns {PromptTemplate|null}
	 */
	getTemplate(id) {
		return this.templates.get(id) || null;
	}

	/**
	 * Update a template by id
	 * @param {string} id
	 * @param {Object} fields
	 * @returns {PromptTemplate|null}
	 */
	updateTemplate(id, fields) {
		const tmpl = this.getTemplate(id);
		if (tmpl) {
			tmpl.update(fields);
			this.saveSettings();
			return tmpl;
		}
		return null;
	}

	/**
	 * Delete a template by id
	 * @param {string} id
	 * @returns {boolean}
	 */
	deleteTemplate(id) {
		const result = this.templates.delete(id);
		if (result) {
			this.saveSettings();
		}
		return result;
	}

	/**
	 * List all templates
	 * @returns {PromptTemplate[]}
	 */
	listTemplates() {
		return Array.from(this.templates.values());
	}

	/**
	 * Import templates from array
	 * @param {Array<Object>} arr
	 */
	importTemplates(arr) {
		let imported = 0;
		let skipped = 0;

		for (const data of arr) {
			// Validate required fields
			if (!data.name || typeof data.name !== 'string') {
				console.warn('CCPM: Skipping template - missing or invalid name');
				skipped++;
				continue;
			}

			if (!data.prompts || typeof data.prompts !== 'object' || Object.keys(data.prompts).length === 0) {
				console.warn('CCPM: Skipping template - missing or empty prompts:', data.name);
				skipped++;
				continue;
			}

			if (!data.promptOrder || !Array.isArray(data.promptOrder) || data.promptOrder.length === 0) {
				console.warn('CCPM: Skipping template - missing or empty promptOrder:', data.name);
				skipped++;
				continue;
			}

			// Force regenerate ID to prevent XSS from malicious imported templates
			delete data.id;
			const tmpl = new PromptTemplate(data);
			this.templates.set(tmpl.id, tmpl);
			imported++;
		}

		if (imported > 0) {
			this.saveSettings();
		}

		return { imported, skipped };
	}

	/**
	 * Export all templates as array
	 * @returns {Array<Object>}
	 */
	exportTemplates() {
		return this.listTemplates().map(t => ({
			id: t.id,
			name: t.name,
			description: t.description,
			prompts: t.prompts,
			promptOrder: t.promptOrder,
			characterName: t.characterName,
			createdAt: t.createdAt,
			updatedAt: t.updatedAt,
		}));
	}

	/**
	 * Apply a template to SillyTavern's prompt system
	 * @param {string} templateId
	 * @returns {Promise<boolean>} Success status
	 */
	async applyTemplate(templateId) {
		const tmpl = this.getTemplate(templateId);
		if (!tmpl) {
			toastr.error('Template not found: ' + templateId);
			return false;
		}

		console.log('CCPM DEBUG: applyTemplate called for:', tmpl.name, 'id:', templateId);
		console.log('CCPM DEBUG: Template prompt identifiers:', Object.keys(tmpl.prompts));

		try {
			if (!promptManager) {
				toastr.error('PromptManager not available');
				return false;
			}

			// Log current state BEFORE applying
			console.log('CCPM DEBUG: Current oai_settings.prompts identifiers BEFORE:', oai_settings.prompts?.map(p => p.identifier) || 'none');

			// Convert template's prompts object to array format
			const promptUpdates = Object.values(tmpl.prompts);
			console.log('CCPM DEBUG: promptUpdates count:', promptUpdates.length);
			console.log('CCPM DEBUG: promptUpdates identifiers:', promptUpdates.map(p => p.identifier));

			// Replace entire prompts array with template prompts (like preset import)
			oai_settings.prompts = promptUpdates;
			console.log('CCPM DEBUG: Replaced oai_settings.prompts array');
			console.log('CCPM DEBUG: Current oai_settings.prompts identifiers AFTER replacement:', oai_settings.prompts?.map(p => p.identifier) || 'none');

			// Restore prompt order if saved in template
			if (tmpl.promptOrder && Array.isArray(tmpl.promptOrder) && tmpl.promptOrder.length > 0) {
				// Use the character_id that was stored when the template was created
				// This ensures we apply to the same character_id (e.g., 100001) that was captured
				const targetCharacterId = tmpl.promptOrderCharacterId ?? 100000;
				console.log('CCPM DEBUG: Applying prompt order for character ID:', targetCharacterId);
				console.log('CCPM DEBUG: Template order length:', tmpl.promptOrder.length);
				console.log('CCPM DEBUG: Template order:', JSON.stringify(tmpl.promptOrder, null, 2));

				// Check if character already has an order entry
				const existingOrderEntry = oai_settings.prompt_order?.find(entry => String(entry.character_id) === String(targetCharacterId));

				if (existingOrderEntry) {
					// Replace existing order
					console.log('CCPM DEBUG: Replacing existing order for character', targetCharacterId);
					existingOrderEntry.order = JSON.parse(JSON.stringify(tmpl.promptOrder));
				} else {
					// Add new order entry for this character
					console.log('CCPM DEBUG: Adding new order entry for character', targetCharacterId);
					if (!oai_settings.prompt_order) {
						oai_settings.prompt_order = [];
					}
					oai_settings.prompt_order.push({
						character_id: targetCharacterId,
						order: JSON.parse(JSON.stringify(tmpl.promptOrder))
					});
				}

				// Update promptManager's activeCharacter to match the template
				if (promptManager && promptManager.activeCharacter) {
					promptManager.activeCharacter.id = targetCharacterId;
					console.log('CCPM DEBUG: Updated promptManager.activeCharacter.id to', targetCharacterId);
				}

				console.log('CCPM: Restored prompt order for character', targetCharacterId, ':', tmpl.promptOrder.length, 'items');
			} else {
				console.log('CCPM DEBUG: No promptOrder in template or empty array');
			}

			// Save settings and trigger update using PromptManager's method
			// Important: Save first, then render (matches ST's pattern)
			console.log('CCPM DEBUG: Calling promptManager.saveServiceSettings()');
			await promptManager.saveServiceSettings();

			console.log('CCPM DEBUG: Calling promptManager.render()');
			await promptManager.render();

			toastr.success(`Template "${tmpl.name}" applied`);
			console.log('CCPM: Template applied successfully:', tmpl.name);
			return true;
		} catch (error) {
			console.error('CCPM: Failed to apply template:', error);
			toastr.error('Failed to apply template: ' + error.message);
			return false;
		}
	}

	/**
	 * Create template from current SillyTavern prompts
	 * @param {string} name - Template name
	 * @param {string} description - Template description
	 * @param {Array<string>} [includePrompts] - Specific prompt identifiers to include
	 * @returns {PromptTemplate}
	 */
	createTemplateFromCurrent(name, description, includePrompts = null) {
		console.log('CCPM DEBUG: createTemplateFromCurrent called');
		console.log('CCPM DEBUG: name:', name, 'description:', description, 'includePrompts:', includePrompts);
		const currentPrompts = {};
		const availablePrompts = oai_settings.prompts || [];
		console.log('CCPM DEBUG: availablePrompts is array?', Array.isArray(availablePrompts), 'length:', availablePrompts.length);

		// Convert array format to object format keyed by identifier
		const promptsMap = Array.isArray(availablePrompts)
			? availablePrompts.reduce((acc, p) => {
				if (p.identifier) acc[p.identifier] = p;
				return acc;
			}, {})
			: availablePrompts;

		// Include specified prompts or all available prompts
		const promptsToInclude = includePrompts || Object.keys(promptsMap);
		console.log('CCPM DEBUG: promptsToInclude:', promptsToInclude);

		for (const identifier of promptsToInclude) {
			if (promptsMap[identifier]) {
				currentPrompts[identifier] = { ...promptsMap[identifier] };
			}
		}

		console.log('CCPM DEBUG: currentPrompts collected, keys:', Object.keys(currentPrompts));

		// Capture prompt order using ST's PromptManager
		// Get current context to determine which character's order to capture
		const context = getContext();
		const currentCharId = context.characterId;
		const currentCharName = context.name2 || name2;
		console.log('CCPM DEBUG: Current character - ID:', currentCharId, 'Name:', currentCharName);

		// Capture the prompt order that's currently active/displayed
		// Use promptManager.activeCharacter which reflects what's currently shown in the UI
		let promptOrderToSave = [];
		let activeCharacterId = null;
		if (promptManager && promptManager.activeCharacter) {
			activeCharacterId = promptManager.activeCharacter.id;
			console.log('CCPM DEBUG: Using promptManager.activeCharacter:', activeCharacterId);
			console.log('CCPM DEBUG: Available prompt_order entries:', oai_settings.prompt_order?.map(e => ({ char_id: e.character_id, order_length: e.order?.length })));

			promptOrderToSave = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter);
			console.log('CCPM DEBUG: Retrieved prompt order:', promptOrderToSave.length, 'items');
			console.log('CCPM DEBUG: Order identifiers:', promptOrderToSave.map(e => e.identifier));
		} else {
			console.warn('CCPM: PromptManager or activeCharacter not available, prompt order will not be saved');
		}

		const result = this.createTemplate({
			name,
			description,
			prompts: currentPrompts,
			promptOrder: promptOrderToSave,
			promptOrderCharacterId: activeCharacterId,  // Store which character_id this order is for
			characterName: currentCharName
		});
		console.log('CCPM DEBUG: createTemplate returned:', result);
		return result;
	}

	// Set up event handlers
	setupEventHandlers() {
		// Listen for settings updates to sync with external changes
		eventSource.on(event_types.SETTINGS_UPDATED, () => {
			this.handleSettingsUpdate();
		});

		// Listen for preset changes to potentially reapply locked templates
		if (event_types.PRESET_CHANGED) {
			eventSource.on(event_types.PRESET_CHANGED, () => {
				this.handlePresetChange();
			});
		}

		// Listen for character changes to potentially auto-apply templates
		eventSource.on(event_types.CHAT_CHANGED, () => {
			this.handleChatChange();
		});

		// Listen for extension settings loaded
		eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, () => {
			this.handleExtensionSettingsLoaded();
		});

		// Listen for app ready to ensure proper initialization
		eventSource.on(event_types.APP_READY, () => {
			this.handleAppReady();
		});

		// Initialize extension when SillyTavern is ready
		eventSource.on(event_types.APP_READY, initializeExtension);

		// Additional event handlers from SillyTavern-CharacterLocks
		// Listen for group chat creation
		eventSource.on(event_types.GROUP_CHAT_CREATED, () => {
			this.handleGroupChatCreated();
		});

		// Listen for group member drafted (useful for group template management)
		eventSource.on(event_types.GROUP_MEMBER_DRAFTED, (chId) => {
			this.handleGroupMemberDrafted(chId);
		});

		// Listen for settings loaded after (more reliable than EXTENSION_SETTINGS_LOADED)
		if (event_types.SETTINGS_LOADED_AFTER) {
			eventSource.on(event_types.SETTINGS_LOADED_AFTER, () => {
				this.handleSettingsLoadedAfter();
			});
		}

		// Listen for character message rendered (useful for template context)
		if (event_types.CHARACTER_MESSAGE_RENDERED) {
			eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
				this.handleCharacterMessageRendered();
			});
		}

		// Listen for generation started (useful for template context tracking)
		if (event_types.GENERATION_STARTED) {
			eventSource.on(event_types.GENERATION_STARTED, () => {
				this.handleGenerationStarted();
			});
		}

		// Listen for generation ended
		if (event_types.GENERATION_ENDED) {
			eventSource.on(event_types.GENERATION_ENDED, () => {
				this.handleGenerationEnded();
			});
		}
	}

	// Handle settings update event
	async handleSettingsUpdate() {
		// Reload templates if extension settings changed externally
		if (extension_settings.ccPromptManager) {
			this.loadTemplatesFromSettings();
		}
	}

	async handlePresetChange() {
		const autoApplyMode = extension_settings.ccPromptManager?.autoApplyMode || AUTO_APPLY_MODES.ASK;

		if (autoApplyMode === AUTO_APPLY_MODES.NEVER) {
			console.log('CCPM: Auto-apply disabled, skipping template reapplication');
			return;
		}

		const effectiveLock = await this.getEffectiveLock();
		if (!effectiveLock || !effectiveLock.templateId) {
			console.log('CCPM: No locked template, skipping auto-apply');
			return;
		}

		if (autoApplyMode === AUTO_APPLY_MODES.ASK) {
			const context = this.lockManager.chatContext.getCurrent();
			const template = this.getTemplate(effectiveLock.templateId);
			if (!template) return;

			const contextType = context.isGroupChat ? 'group chat' : 'character';
			const sourceName = context.isGroupChat ?
				(context.groupName || 'Unnamed Group') :
				(context.characterName || 'Unknown Character');

			const popup = new Popup(`
				<div class="flex-container flexFlowColumn flexGap10">
					<h4>Preset Changed</h4>
					<p>Reapply locked template "<strong>${escapeHtml(template.name)}</strong>" for ${contextType} "${escapeHtml(sourceName)}"?</p>
					<p class="text_muted fontsize90p">This will restore the locked prompt configuration.</p>
				</div>
			`, POPUP_TYPE.CONFIRM, '', {
				okButton: 'Apply',
				cancelButton: 'Skip',
				allowVerticalScrolling: true
			});

			const result = await popup.show();
			if (result === POPUP_RESULT.AFFIRMATIVE) {
				await this.applyTemplate(effectiveLock.templateId);
				toastr.success(`Reapplied template: ${template.name}`);
			}
		} else if (autoApplyMode === AUTO_APPLY_MODES.ALWAYS) {
			const template = this.getTemplate(effectiveLock.templateId);
			if (template) {
				await this.applyTemplate(effectiveLock.templateId);
				toastr.info(`Auto-reapplied template: ${template.name}`);
			}
		}
	}

	/**
	 * Handle chat change event
	 */
	async handleChatChange() {
		console.log('CCPM: Chat changed, templates available:', this.templates.size);

		// Invalidate context cache
		this.lockManager.chatContext.invalidate();

		// Load current locks
		await this.lockManager.loadCurrentLocks();

		// Apply locked template based on auto-apply mode
		const autoApplyMode = extension_settings.ccPromptManager?.autoApplyMode || AUTO_APPLY_MODES.ASK;

		if (autoApplyMode === AUTO_APPLY_MODES.NEVER) {
			console.log('CCPM: Auto-apply disabled on chat change');
			return;
		}

		const effectiveLock = await this.getEffectiveLock();
		if (!effectiveLock || !effectiveLock.templateId) {
			console.log('CCPM: No locked template for this chat');
			return;
		}

		const template = this.getTemplate(effectiveLock.templateId);
		if (!template) {
			console.warn('CCPM: Locked template not found:', effectiveLock.templateId);
			return;
		}

		if (autoApplyMode === AUTO_APPLY_MODES.ASK) {
			const context = this.lockManager.chatContext.getCurrent();
			const contextType = context.isGroupChat ? 'group chat' : 'character';
			const sourceName = context.isGroupChat ?
				(context.groupName || 'Unnamed Group') :
				(context.characterName || 'Unknown Character');

			const popup = new Popup(`
				<div class="flex-container flexFlowColumn flexGap10">
					<h4>Chat Changed</h4>
					<p>Apply locked template "<strong>${escapeHtml(template.name)}</strong>" for ${contextType} "${escapeHtml(sourceName)}"?</p>
					<p class="text_muted fontsize90p">Source: ${effectiveLock.source}</p>
				</div>
			`, POPUP_TYPE.CONFIRM, '', {
				okButton: 'Apply',
				cancelButton: 'Skip',
				allowVerticalScrolling: true
			});

			const result = await popup.show();
			if (result === POPUP_RESULT.AFFIRMATIVE) {
				await this.applyTemplate(effectiveLock.templateId);
				toastr.success(`Applied template: ${template.name}`);
			}
		} else if (autoApplyMode === AUTO_APPLY_MODES.ALWAYS) {
			await this.applyTemplate(effectiveLock.templateId);
			toastr.info(`Auto-applied template: ${template.name}`);
		}
	}

	/**
	 * Handle extension settings loaded event
	 */
	handleExtensionSettingsLoaded() {
		this.loadTemplatesFromSettings();
		console.log('CCPM: Extension settings loaded, templates:', this.templates.size);
	}

	/**
	 * Handle app ready event
	 */
	handleAppReady() {
		// Ensure UI is injected after app is fully ready
		this.ensureUIInjected();
		console.log('CCPM: App ready, extension initialized');
	}

	/**
	 * Handle group chat creation event
	 */
	handleGroupChatCreated() {
		// Could implement group-specific template logic
		console.log('CCPM: Group chat created, templates available:', this.templates.size);
	}

	/**
	 * Handle group member drafted event
	 * @param {number} chId - Character ID that was drafted
	 */
	handleGroupMemberDrafted(chId) {
		// Could implement character-specific template application in groups
		console.log('CCPM: Group member drafted, chId:', chId);
		// Future: Apply character-specific templates when generating for that character
	}

	/**
	 * Handle settings loaded after event (more reliable initialization)
	 */
	handleSettingsLoadedAfter() {
		this.loadTemplatesFromSettings();
		this.ensureUIInjected();
		console.log('CCPM: Settings loaded after, templates:', this.templates.size);
	}

	/**
	 * Handle character message rendered event
	 */
	handleCharacterMessageRendered() {
		// Could implement context-aware template suggestions
		console.log('CCPM: Character message rendered');
	}

	/**
	 * Handle generation started event
	 */
	handleGenerationStarted() {
		// Could implement pre-generation template checks
		console.log('CCPM: Generation started');
	}

	/**
	 * Handle generation ended event
	 */
	handleGenerationEnded() {
		// Could implement post-generation template analysis
		console.log('CCPM: Generation ended');
	}

	/**
	 * Ensure UI button is injected
	 */
	ensureUIInjected() {
		if (!document.getElementById('ccpm-prompt-template-btn')) {
			injectPromptTemplateManagerButton();
		}
	}

	// ===== TEMPLATE LOCKING METHODS =====

	/**
	 * Apply the template that is locked for current context
	 * @returns {boolean} Success status
	 */
	async applyLockedTemplate() {
		try {
			const lockResult = await this.lockManager.getLockToApply();
			if (lockResult.templateId) {
				console.log(`CCPM: Applying locked template from ${lockResult.source}:`, lockResult.templateId);
				return await this.applyTemplate(lockResult.templateId);
			}
			return false;
		} catch (error) {
			toastr.error('CCPM: Error applying locked template:', error);
			return false;
		}
	}

	/**
	 * Ask user whether to apply the locked template for current context
	 * @returns {boolean} Success status
	 */
	async askToApplyLockedTemplate() {
		try {
			const lockResult = await this.lockManager.getLockToApply();
			if (!lockResult.templateId) {
				return false;
			}

			const template = this.getTemplate(lockResult.templateId);
			if (!template) {
				console.warn('CCPM: Locked template not found:', lockResult.templateId);
				return false;
			}

			const content = document.createElement('div');
			content.innerHTML = `
				<div class="flex-container flexFlowColumn flexGap10">
					<h4>Apply Locked Template?</h4>
					<p>A template is locked for this ${lockResult.source}:</p>
					<div class="text_pole padding10">
						<strong>${escapeHtml(template.name)}</strong>
						${template.description ? `<br><small class="text_muted">${escapeHtml(template.description)}</small>` : ''}
					</div>
					<p>Would you like to apply this template now?</p>
				</div>
			`;

			const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
				okButton: 'Apply',
				cancelButton: 'Skip',
				allowVerticalScrolling: true
			});

			const result = await popup.show();
			if (result) {
				console.log(`CCPM: User chose to apply locked template from ${lockResult.source}:`, lockResult.templateId);
				const success = await this.applyTemplate(lockResult.templateId);
				if (success) {
					toastr.success(`Applied template: ${template.name}`, 'CCPM');
				}
				return success;
			} else {
				console.log('CCPM: User chose to skip applying locked template');
				return false;
			}
		} catch (error) {
			toastr.error('CCPM: Error asking to apply locked template:', error);
			return false;
		}
	}

	/**
	 * Lock a template to a specific target (character, chat, or group)
	 * @param {string} templateId - Template to lock
	 * @param {string} target - Lock target: 'character', 'chat', or 'group'
	 * @returns {boolean} Success status
	 */
	async lockTemplate(templateId, target) {
		const template = this.getTemplate(templateId);
		if (!template) {
			toastr.error('CCPM: Cannot lock template - template not found:', templateId);
			return false;
		}

		const success = await this.lockManager.setLock(target, templateId);
		if (success) {
			console.log(`CCPM: Locked template "${template.name}" to ${target}`);
			toastr.success(`Template locked to ${target}`, 'CCPM');
		} else {
			toastr.error(`CCPM: Failed to lock template to ${target}`);
			toastr.error(`Failed to lock template to ${target}`, 'CCPM');
		}
		return success;
	}

	/**
	 * Clear template lock for a specific target
	 * @param {string} target - Lock target: 'character', 'chat', or 'group'
	 * @returns {boolean} Success status
	 */
	async clearTemplateLock(target) {
		const success = await this.lockManager.clearLock(target);
		if (success) {
			console.log(`CCPM: Cleared ${target} template lock`);
			toastr.success(`${target} template lock cleared`, 'CCPM');
		} else {
			console.log(`CCPM: No ${target} template lock to clear`);
		}
		return success;
	}

	/**
	 * Get the currently locked template for each target
	 * @returns {Object} Current locks
	 */
	async getCurrentLocks() {
		await this.lockManager.loadCurrentLocks();
		return this.lockManager.currentLocks;
	}

	/**
	 * Get the template that would be applied based on current context
	 * @returns {Object|null} Lock result with templateId and source
	 */
	async getEffectiveLock() {
		await this.lockManager.loadCurrentLocks();
		return this.lockManager.getLockToApply();
	}

	/**
	 * Cleanup event handlers (for extension unload)
	 */
	cleanup() {
		// Core event handlers
		eventSource.off(event_types.SETTINGS_UPDATED, this.handleSettingsUpdate);
		eventSource.off(event_types.CHAT_CHANGED, this.handleChatChange);
		eventSource.off(event_types.EXTENSION_SETTINGS_LOADED, this.handleExtensionSettingsLoaded);
		eventSource.off(event_types.APP_READY, this.handleAppReady);

		// Additional event handlers from SillyTavern-CharacterLocks
		eventSource.off(event_types.GROUP_CHAT_CREATED, this.handleGroupChatCreated);
		eventSource.off(event_types.GROUP_MEMBER_DRAFTED, this.handleGroupMemberDrafted);

		if (event_types.SETTINGS_LOADED_AFTER) {
			eventSource.off(event_types.SETTINGS_LOADED_AFTER, this.handleSettingsLoadedAfter);
		}

		if (event_types.CHARACTER_MESSAGE_RENDERED) {
			eventSource.off(event_types.CHARACTER_MESSAGE_RENDERED, this.handleCharacterMessageRendered);
		}

		if (event_types.GENERATION_STARTED) {
			eventSource.off(event_types.GENERATION_STARTED, this.handleGenerationStarted);
		}

		if (event_types.GENERATION_ENDED) {
			eventSource.off(event_types.GENERATION_ENDED, this.handleGenerationEnded);
		}
	}
}

// Example: create a global instance (optional)
export const promptTemplateManager = new PromptTemplateManager();
// --- CCPM Prompt Template Manager UI Injection ---
function injectPromptTemplateManagerButton() {
	// Wait for DOM ready and #extensionsMenuButton to exist
	const tryInject = () => {
		const menu = document.getElementById('extensionsMenu');
		if (!menu) {
			setTimeout(tryInject, 500);
			return;
		}
		if (document.getElementById('ccpm-prompt-template-btn')) return;

		// Create menu item using SillyTavern's standard extension menu format
		const menuItem = $(`
			<div id="ccpm-menu-item-container" class="extension_container interactable" tabindex="0">
				<div id="ccpm-prompt-template-btn" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
					<div class="fa-fw fa-solid fa-folder-open extensionsMenuExtensionButton"></div>
					<span>Prompt Templates</span>
				</div>
			</div>
		`);

		// Attach click handler
		menuItem.on('click', openPromptTemplateManagerModal);

		// Insert at top of extensions menu
		$('#extensionsMenu').prepend(menuItem);
	};
	tryInject();
}

function openPromptTemplateManagerModal() {
	const content = document.createElement('div');
	content.innerHTML = `
		<div class="title_restorable">
			<h3>Prompt Template Manager</h3>
		</div>
		<div class="flex-container alignItemsCenter marginBot10" style="padding-bottom: 10px; border-bottom: 1px solid var(--SmartThemeBorderColor);">
			<div class="menu_button menu_button_icon interactable" id="ccpm-create-from-current">
				<i class="fa-solid fa-plus"></i>
				<span>Create from Current</span>
			</div>
			<div class="menu_button menu_button_icon interactable" id="ccpm-import-template">
				<i class="fa-solid fa-file-import"></i>
				<span>Import</span>
			</div>
			<div class="menu_button menu_button_icon interactable" id="ccpm-export-all">
				<i class="fa-solid fa-file-export"></i>
				<span>Export All</span>
			</div>
		</div>
		<div id="ccpm-ptm-list" class="flex-container flexFlowColumn overflowYAuto" style="max-height: 60vh;"></div>
	`;

	// Render the template list after popup is shown
	ccpmMainPopup = new Popup(content, POPUP_TYPE.TEXT, '', {
		okButton: false,
		cancelButton: 'Close',
		wide: true,
		large: true,
		allowVerticalScrolling: true,
		onOpen: () => {
			renderPromptTemplateList();
			setupTemplateManagerEvents();
		},
	});
	ccpmMainPopup.show();
}

async function renderPromptTemplateList() {
	const listDiv = document.getElementById('ccpm-ptm-list');
	if (!listDiv) return;
	const templates = promptTemplateManager.listTemplates();

	if (templates.length === 0) {
		listDiv.innerHTML = `
			<div class="flex-container justifyCenter">
				<div class="text_pole textAlignCenter">
					<i class="fa-solid fa-info-circle"></i>
					No templates found. Create one from your current prompts!
				</div>
			</div>
		`;
		return;
	}

	// Get current locks to show lock status
	const currentLocks = await promptTemplateManager.getCurrentLocks();
	const effectiveLock = await promptTemplateManager.getEffectiveLock();

	listDiv.innerHTML = templates.map(t => {
		const promptCount = Object.keys(t.prompts).length;
		const createdDate = new Date(t.createdAt).toLocaleDateString();

		// Check if this template is locked to any target
		const isLockedToCharacter = currentLocks.character === t.id;
		const isLockedToChat = currentLocks.chat === t.id;
		const isLockedToGroup = currentLocks.group === t.id;
		const isEffectiveTemplate = effectiveLock.templateId === t.id;

		let lockStatus = '';
		if (isEffectiveTemplate) {
			lockStatus = `<span class="fontsize80p toggleEnabled" title="Currently active from ${effectiveLock.source}">🔒 Active (${effectiveLock.source})</span>`;
		} else if (isLockedToCharacter || isLockedToChat || isLockedToGroup) {
			const lockTypes = [];
			if (isLockedToCharacter) lockTypes.push('character');
			if (isLockedToChat) lockTypes.push('chat');
			if (isLockedToGroup) lockTypes.push('group');
			lockStatus = `<span class="fontsize80p text_muted" title="Locked to: ${lockTypes.join(', ')}">🔒 ${lockTypes.join(', ')}</span>`;
		}

		const borderStyle = isEffectiveTemplate ? 'border-left: 4px solid var(--SmartThemeQuoteColor);' : '';

		return `
			<div class="text_pole padding10 marginBot10" style="${borderStyle}">
				<div class="flex-container spaceBetween alignItemsCenter marginBot5">
					<div class="flexGrow">
						<div class="fontsize120p">
							${escapeHtml(t.name)}
							${lockStatus}
						</div>
						<div class="fontsize90p text_muted flex-container flexGap10">
							<span class="toggleEnabled">${promptCount} prompt${promptCount !== 1 ? 's' : ''}</span>
							<span>Created: ${createdDate}</span>
						</div>
					</div>
					<div class="flex-container flexGap2">
						<div class="menu_button menu_button_icon interactable" onclick="window.ccpmApplyTemplate('${t.id}')" title="Apply Template" style="width: 32px; height: 32px; padding: 0;">
							<i class="fa-solid fa-play"></i>
						</div>
						<div class="menu_button menu_button_icon interactable" onclick="window.ccpmViewPrompts('${t.id}')" title="View/Edit Prompts" style="width: 32px; height: 32px; padding: 0;">
							<i class="fa-solid fa-pencil"></i>
						</div>
						<div class="menu_button menu_button_icon interactable" onclick="window.ccpmShowLockMenu('${t.id}')" title="Lock/Unlock Template" style="width: 32px; height: 32px; padding: 0;">
							<i class="fa-solid fa-lock"></i>
						</div>
						<div class="menu_button menu_button_icon interactable" onclick="window.ccpmEditTemplate('${t.id}')" title="Edit Template Name/Description" style="width: 32px; height: 32px; padding: 0;">
							<i class="fa-solid fa-edit"></i>
						</div>
						<div class="menu_button menu_button_icon interactable redOverlayGlow" onclick="window.ccpmDeleteTemplate('${t.id}')" title="Delete Template" style="width: 32px; height: 32px; padding: 0;">
							<i class="fa-solid fa-trash"></i>
						</div>
					</div>
				</div>
				${t.description ? `<div class="text_muted fontsize90p marginBot10">${escapeHtml(t.description)}</div>` : ''}
				<div class="flex-container flexWrap flexGap5">
					${Object.keys(t.prompts).map(identifier =>
						`<span class="fontsize80p padding5 toggleEnabled" style="border-radius: 12px;">${identifier}</span>`
					).join('')}
				</div>
			</div>
		`;
	}).join('');
}

// escapeHtml is now imported from ST's utils.js

function setupTemplateManagerEvents() {
	// Setup toolbar events
	document.getElementById('ccpm-create-from-current')?.addEventListener('click', () => {
		showCreateTemplateDialog();
	});

	document.getElementById('ccpm-import-template')?.addEventListener('click', () => {
		showImportTemplateDialog();
	});

	document.getElementById('ccpm-export-all')?.addEventListener('click', () => {
		exportAllTemplates();
	});
}

// Store reference to the main template manager popup
let ccpmMainPopup = null;

// Expose template management functions for buttons
window.ccpmApplyTemplate = async function(id) {
	if (await promptTemplateManager.applyTemplate(id)) {
		toastr.success('Template applied successfully!');
		// Close the main popup
		if (ccpmMainPopup?.dlg) {
			ccpmMainPopup.dlg.close();
		}
	} else {
		toastr.error('Failed to apply template');
	}
};

window.ccpmEditTemplate = async function(id) {
	const template = promptTemplateManager.getTemplate(id);
	if (!template) {
		toastr.error('Template not found');
		return;
	}
	await showEditTemplateDialog(template);
};

window.ccpmDeleteTemplate = async function(id) {
	const template = promptTemplateManager.getTemplate(id);
	if (!template) {
		toastr.error('Template not found');
		return;
	}

	const content = document.createElement('div');
	content.innerHTML = `
		<div class="flex-container flexFlowColumn flexGap10">
			<p>Are you sure you want to delete the template "<strong>${escapeHtml(template.name)}</strong>"?</p>
			<div class="text_pole padding10 text_danger">
				<strong>⚠️ This action cannot be undone.</strong>
			</div>
		</div>
	`;

	const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
		okButton: 'Delete',
		cancelButton: 'Cancel',
		allowVerticalScrolling: true
	});

	const result = await popup.show();
	if (result) {
		if (promptTemplateManager.deleteTemplate(id)) {
			toastr.success('Template deleted successfully');
			await renderPromptTemplateList();
		} else {
			toastr.error('Failed to delete template');
		}
	}
};

window.ccpmShowLockMenu = async function(templateId) {
	const template = promptTemplateManager.getTemplate(templateId);
	if (!template) {
		toastr.error('Template not found');
		return;
	}

	const currentLocks = await promptTemplateManager.getCurrentLocks();
	const context = promptTemplateManager.lockManager.chatContext.getCurrent();

	// Determine available lock targets based on context
	const availableTargets = [];
	if (context.characterName) {
		availableTargets.push('character');
	}
	if (context.chatId || context.groupId) {
		availableTargets.push('chat');
	}
	if (context.isGroupChat && context.groupId) {
		availableTargets.push('group');
	}

	const autoApplyMode = extension_settings.ccPromptManager?.autoApplyMode || AUTO_APPLY_MODES.ASK;
	const preferCharacterOverChat = extension_settings.ccPromptManager?.preferCharacterOverChat ?? true;
	const preferGroupOverChat = extension_settings.ccPromptManager?.preferGroupOverChat ?? true;
	const preferIndividualCharacterInGroup = extension_settings.ccPromptManager?.preferIndividualCharacterInGroup ?? false;

	const content = document.createElement('div');
	content.innerHTML = `
		<div class="flex-container flexFlowColumn flexGap10">
			<h4>Lock Template: ${escapeHtml(template.name)}</h4>
			<p>Choose where to lock this template:</p>

			<div class="flex-container flexFlowColumn flexGap10">
				${availableTargets.map(target => {
					const isCurrentlyLocked = currentLocks[target] === templateId;
					const hasOtherLock = currentLocks[target] && currentLocks[target] !== templateId;
					const contextName = getContextName(context, target);

					return `
						<label class="checkbox_label">
							<input type="checkbox"
								id="ccpm-lock-${target}"
								${isCurrentlyLocked ? 'checked' : ''}
								onchange="if(this.checked) { ccpmLockToTarget('${templateId}', '${target}'); } else { ccpmClearLock('${target}'); }">
							<span>
								<strong>${target.charAt(0).toUpperCase() + target.slice(1)}</strong>
								${contextName ? ` - <small class="text_muted">${escapeHtml(contextName)}</small>` : ''}
								${hasOtherLock ? '<br><small class="text_danger">⚠️ Another template is locked</small>' : ''}
							</span>
						</label>
					`;
				}).join('')}
			</div>

			${availableTargets.length === 0 ? '<p class="text_muted">No lock targets available in current context.</p>' : ''}

			<hr>

			<div class="completion_prompt_manager_popup_entry_form_control">
				<h4>⚙️ Auto-apply when preset changes:</h4>
				<div class="marginTop10">
					<label class="radio_label">
						<input type="radio" name="ccpm-auto-apply-mode" value="${AUTO_APPLY_MODES.NEVER}" ${autoApplyMode === AUTO_APPLY_MODES.NEVER ? 'checked' : ''} onchange="window.ccpmSetAutoApplyMode('${AUTO_APPLY_MODES.NEVER}')">
						<span>Never - Don't reapply locked templates</span>
					</label>
					<label class="radio_label">
						<input type="radio" name="ccpm-auto-apply-mode" value="${AUTO_APPLY_MODES.ASK}" ${autoApplyMode === AUTO_APPLY_MODES.ASK ? 'checked' : ''} onchange="window.ccpmSetAutoApplyMode('${AUTO_APPLY_MODES.ASK}')">
						<span>Ask - Prompt before applying locked templates</span>
					</label>
					<label class="radio_label">
						<input type="radio" name="ccpm-auto-apply-mode" value="${AUTO_APPLY_MODES.ALWAYS}" ${autoApplyMode === AUTO_APPLY_MODES.ALWAYS ? 'checked' : ''} onchange="window.ccpmSetAutoApplyMode('${AUTO_APPLY_MODES.ALWAYS}')">
						<span>Always - Automatically apply locked templates</span>
					</label>
				</div>
			</div>

			<hr>

			<div class="completion_prompt_manager_popup_entry_form_control">
				<h4>⚙️ Lock Priority:</h4>
				${context.isGroupChat ? `
					<div class="marginTop10">
						<label class="checkbox_label">
							<input type="checkbox" id="ccpm-pref-group-over-chat" ${preferGroupOverChat ? 'checked' : ''} onchange="window.ccpmSetPriority('preferGroupOverChat', this.checked)">
							<span>Prefer group settings over chat</span>
						</label>
						<label class="checkbox_label">
							<input type="checkbox" id="ccpm-pref-individual-char" ${preferIndividualCharacterInGroup ? 'checked' : ''} onchange="window.ccpmSetPriority('preferIndividualCharacterInGroup', this.checked)">
							<span>Prefer character settings over group or chat</span>
						</label>
					</div>
				` : `
					<div class="marginTop10">
						<label class="checkbox_label">
							<input type="checkbox" id="ccpm-pref-char-over-chat" ${preferCharacterOverChat ? 'checked' : ''} onchange="window.ccpmSetPriority('preferCharacterOverChat', this.checked)">
							<span>Prefer character settings over chat</span>
						</label>
					</div>
				`}
			</div>
		</div>
	`;

	const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
		okButton: false,
		cancelButton: 'Close',
		wide: true,
		allowVerticalScrolling: true
	});
	popup.show();
};

function getContextName(context, target) {
	switch (target) {
		case 'character':
			return context.characterName || 'Current Character';
		case 'chat':
			if (context.isGroupChat) {
				return context.groupName ? `${context.groupName} Chat` : 'Group Chat';
			} else {
				return context.chatName || 'Current Chat';
			}
		case 'group':
			return context.groupName || 'Current Group';
		default:
			return '';
	}
}

window.ccpmLockToTarget = async function(templateId, target) {
	const success = await promptTemplateManager.lockTemplate(templateId, target);
	if (success) {
		// The lock menu popup will close itself via its cancelButton
		// Just refresh the template list in the main popup
		await renderPromptTemplateList();
	}
};

window.ccpmClearLock = async function(target) {
	const success = await promptTemplateManager.clearTemplateLock(target);
	if (success) {
		// The lock menu popup will close itself via its cancelButton
		// Just refresh the template list in the main popup
		await renderPromptTemplateList();
	}
};

window.ccpmSetAutoApplyMode = function(mode) {
	extension_settings.ccPromptManager.autoApplyMode = mode;
	saveSettingsDebounced();
	console.log('CCPM: Auto-apply mode set to:', mode);
};

window.ccpmSetPriority = function(preference, value) {
	extension_settings.ccPromptManager[preference] = value;
	saveSettingsDebounced();
	console.log('CCPM: Priority preference set:', preference, '=', value);
};

window.ccpmViewPrompts = async function(templateId) {
	const template = promptTemplateManager.getTemplate(templateId);
	if (!template) {
		toastr.error('Template not found');
		return;
	}

	// Build list ordered by promptOrder if available - include markers for reordering
	let orderedPrompts = [];
	if (template.promptOrder && Array.isArray(template.promptOrder) && template.promptOrder.length > 0) {
		// Use promptOrder to determine sequence, include all prompts (including markers)
		orderedPrompts = template.promptOrder
			.map(entry => template.prompts[entry.identifier])
			.filter(prompt => prompt); // Filter out nulls only
	} else {
		// Fallback to all prompts including markers
		orderedPrompts = Object.values(template.prompts);
	}

	if (orderedPrompts.length === 0) {
		toastr.info('This template contains no prompts');
		return;
	}

	const content = document.createElement('div');
	content.innerHTML = `
		<div class="flex-container flexFlowColumn" style="gap: 10px;">
			<div class="title_restorable">
				<h3>${escapeHtml(template.name)}</h3>
			</div>
			${template.description ? `<div class="text_muted">${escapeHtml(template.description)}</div>` : ''}

			<ul id="ccpm-prompt-order-list" class="text_pole" style="list-style: none; padding: 0; margin: 0; max-height: 60vh; overflow-y: auto;">
				<li class="ccpm_prompt_manager_list_head">
					<span>Name</span>
					<span></span>
					<span>Role</span>
				</li>
				<li class="ccpm_prompt_manager_list_separator">
					<hr>
				</li>
				${orderedPrompts.map(prompt => {
					const isMarker = prompt.marker;
					const isSystemPrompt = prompt.system_prompt;
					const isInjectionPrompt = prompt.injection_position === 1;
					const promptRoles = {
						assistant: { roleIcon: 'fa-robot', roleTitle: 'Prompt will be sent as Assistant' },
						user: { roleIcon: 'fa-user', roleTitle: 'Prompt will be sent as User' },
					};
					const iconLookup = prompt.role === 'system' && prompt.system_prompt ? '' : prompt.role;
					const roleIcon = promptRoles[iconLookup]?.roleIcon || '';
					const roleTitle = promptRoles[iconLookup]?.roleTitle || '';

					// Markers show name but are not expandable or editable
					const nameDisplay = isMarker
						? `<span title="${escapeHtml(prompt.name || prompt.identifier)}">${escapeHtml(prompt.name || prompt.identifier)}</span>`
						: `<a class="ccpm-expand-prompt" data-identifier="${escapeHtml(prompt.identifier)}">${escapeHtml(prompt.name || prompt.identifier)}</a>`;

					// Edit button only for non-markers
					const editButton = !isMarker
						? `<span class="ccpm-edit-prompt fa-solid fa-pencil fa-xs" data-identifier="${escapeHtml(prompt.identifier)}" title="Edit prompt" style="margin-left: 8px; opacity: 0.4; cursor: pointer;"></span>`
						: '';

					return `
						<li class="ccpm_prompt_manager_prompt ccpm_prompt_draggable ${isMarker ? 'ccpm_prompt_manager_marker' : ''}" data-identifier="${escapeHtml(prompt.identifier)}">
							<span class="drag-handle">☰</span>
							<span class="ccpm_prompt_manager_prompt_name">
								${isMarker ? '<span class="fa-fw fa-solid fa-thumb-tack" title="Marker"></span>' : ''}
								${!isMarker && isSystemPrompt ? '<span class="fa-fw fa-solid fa-square-poll-horizontal" title="System Prompt"></span>' : ''}
								${!isMarker && !isSystemPrompt ? '<span class="fa-fw fa-solid fa-asterisk" title="User Prompt"></span>' : ''}
								${isInjectionPrompt ? '<span class="fa-fw fa-solid fa-syringe" title="In-Chat Injection"></span>' : ''}
								${nameDisplay}
								${editButton}
								${roleIcon ? `<span data-role="${escapeHtml(prompt.role)}" class="fa-xs fa-solid ${roleIcon}" title="${roleTitle}"></span>` : ''}
								${isInjectionPrompt ? `<small class="prompt-manager-injection-depth">@ ${escapeHtml(prompt.injection_depth)}</small>` : ''}
							</span>
							<span></span>
							<span class="ccpm_prompt_role">${escapeHtml(prompt.role || 'system')}</span>
						</li>
						${!isMarker ? `
							<li class="inline-drawer ccpm_prompt_drawer" data-identifier="${escapeHtml(prompt.identifier)}" style="grid-column: 1 / -1; margin: 0 0 10px 30px;">
								<div class="inline-drawer-toggle inline-drawer-header" style="display: none;">
									<span>Prompt Content</span>
									<div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
								</div>
								<div class="inline-drawer-content text_pole padding10" style="background: var(--black30a); display: none;">
									${prompt.injection_position === 1 ? `
										<div class="flex-container flexGap10 marginBot5 fontsize90p text_muted">
											<span><strong>Position:</strong> Absolute (In-Chat)</span>
											<span><strong>Depth:</strong> ${prompt.injection_depth || 4}</span>
											<span><strong>Order:</strong> ${prompt.injection_order || 100}</span>
										</div>
									` : ''}
									<div class="fontsize90p" style="white-space: pre-wrap; font-family: monospace; max-height: 300px; overflow-y: auto;">
${escapeHtml(prompt.content || '(empty)')}
									</div>
								</div>
							</li>
						` : ''}
					`;
				}).join('')}
			</ul>
			<div class="text_muted fontsize90p">
				<i class="fa-solid fa-info-circle"></i> Drag prompts by the handle to reorder. Click prompt names to expand/collapse content.
			</div>
		</div>
	`;

	const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
		okButton: 'Save Order',
		cancelButton: 'Close',
		wide: true,
		large: true,
		allowVerticalScrolling: true,
		onOpen: () => {
			// Setup click handlers for expanding/collapsing prompts using inline-drawer
			document.querySelectorAll('.ccpm-expand-prompt').forEach(link => {
				link.addEventListener('click', (e) => {
					e.preventDefault();
					const identifier = link.dataset.identifier;
					const drawerContent = document.querySelector(`.ccpm_prompt_drawer[data-identifier="${identifier}"] .inline-drawer-content`);
					if (drawerContent) {
						const isVisible = drawerContent.style.display !== 'none';
						drawerContent.style.display = isVisible ? 'none' : 'block';
					}
				});
			});

			// Setup click handlers for editing prompts
			document.querySelectorAll('.ccpm-edit-prompt').forEach(btn => {
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					const identifier = btn.dataset.identifier;
					ccpmEditPromptInTemplate(templateId, identifier);
				});
			});

			// Make the list sortable using jQuery UI
			$('#ccpm-prompt-order-list').sortable({
				delay: 30,
				handle: '.drag-handle',
				items: '.ccpm_prompt_draggable',
				update: function() {
					// Order changed - will be saved if user clicks Save
				}
			});
		},
		onClosing: async (popup) => {
			if (popup.result === POPUP_RESULT.AFFIRMATIVE) {
				// Save the new order
				const newOrder = [];
				document.querySelectorAll('.ccpm_prompt_draggable').forEach(li => {
					const identifier = li.dataset.identifier;
					// Find the original entry in promptOrder to preserve enabled status
					const originalEntry = template.promptOrder?.find(e => e.identifier === identifier);
					newOrder.push({
						identifier: identifier,
						enabled: originalEntry?.enabled ?? true
					});
				});

				// Update template's promptOrder
				promptTemplateManager.updateTemplate(templateId, {
					promptOrder: newOrder
				});

				toastr.success('Prompt order saved');
				return true;
			}
			return true;
		}
	});

	await popup.show();
};

/**
 * Edit a prompt within a template using ST's existing edit form
 */
window.ccpmEditPromptInTemplate = async function(templateId, promptIdentifier) {
	const template = promptTemplateManager.getTemplate(templateId);
	if (!template) {
		toastr.error('Template not found');
		return;
	}

	const prompt = template.prompts[promptIdentifier];
	if (!prompt) {
		toastr.error('Prompt not found in template');
		return;
	}

	// Clone ST's existing edit form from the DOM
	const formContainer = document.getElementById('completion_prompt_manager_popup_edit');
	if (!formContainer) {
		toastr.error('Edit form container not found');
		return;
	}

	// Clone ST's form to use in our popup
	const clonedForm = formContainer.cloneNode(true);
	clonedForm.id = 'ccpm_temp_edit_form';
	clonedForm.style.display = 'block';

	let savedData = null;

	const editPopup = new Popup(clonedForm, POPUP_TYPE.CONFIRM, '', {
		okButton: 'Save',
		cancelButton: 'Cancel',
		wide: true,
		large: true,
		allowVerticalScrolling: true,
		onOpen: () => {
			// Re-populate after clone (DOM elements are new)
			const clonedNameField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_name');
			const clonedRoleField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_role');
			const clonedPromptField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_prompt');
			const clonedInjectionPositionField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_injection_position');
			const clonedInjectionDepthField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_injection_depth');
			const clonedInjectionOrderField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_injection_order');
			const clonedInjectionTriggerField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_injection_trigger');
			const clonedDepthBlock = clonedForm.querySelector('#completion_prompt_manager_depth_block');
			const clonedOrderBlock = clonedForm.querySelector('#completion_prompt_manager_order_block');
			const clonedForbidOverridesField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_forbid_overrides');

			if (clonedNameField) clonedNameField.value = prompt.name || '';
			if (clonedRoleField) clonedRoleField.value = prompt.role || 'system';
			if (clonedPromptField) clonedPromptField.value = prompt.content || '';
			if (clonedInjectionPositionField) clonedInjectionPositionField.value = (prompt.injection_position ?? 0).toString();
			if (clonedInjectionDepthField) clonedInjectionDepthField.value = (prompt.injection_depth ?? 4).toString();
			if (clonedInjectionOrderField) clonedInjectionOrderField.value = (prompt.injection_order ?? 100).toString();

			if (clonedInjectionTriggerField) {
				Array.from(clonedInjectionTriggerField.options).forEach(option => {
					option.selected = Array.isArray(prompt.injection_trigger) && prompt.injection_trigger.includes(option.value);
				});
			}

			if (clonedDepthBlock && clonedOrderBlock) {
				const showFields = clonedInjectionPositionField && clonedInjectionPositionField.value === '1';
				clonedDepthBlock.style.visibility = showFields ? 'visible' : 'hidden';
				clonedOrderBlock.style.visibility = showFields ? 'visible' : 'hidden';

				// Add change listener for injection position
				if (clonedInjectionPositionField) {
					clonedInjectionPositionField.addEventListener('change', (e) => {
						const showFields = e.target.value === '1';
						clonedDepthBlock.style.visibility = showFields ? 'visible' : 'hidden';
						clonedOrderBlock.style.visibility = showFields ? 'visible' : 'hidden';
					});
				}
			}

			if (clonedForbidOverridesField) clonedForbidOverridesField.checked = prompt.forbid_overrides ?? false;
		},
		onClosing: (popup) => {
			if (popup.result === POPUP_RESULT.AFFIRMATIVE) {
				// Capture form values
				const clonedNameField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_name');
				const clonedRoleField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_role');
				const clonedPromptField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_prompt');
				const clonedInjectionPositionField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_injection_position');
				const clonedInjectionDepthField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_injection_depth');
				const clonedInjectionOrderField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_injection_order');
				const clonedInjectionTriggerField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_injection_trigger');
				const clonedForbidOverridesField = clonedForm.querySelector('#completion_prompt_manager_popup_entry_form_forbid_overrides');

				savedData = {
					name: clonedNameField?.value || prompt.name,
					role: clonedRoleField?.value || prompt.role,
					content: clonedPromptField?.value || prompt.content,
					injection_position: clonedInjectionPositionField ? Number(clonedInjectionPositionField.value) : prompt.injection_position,
					injection_depth: clonedInjectionDepthField ? Number(clonedInjectionDepthField.value) : prompt.injection_depth,
					injection_order: clonedInjectionOrderField ? Number(clonedInjectionOrderField.value) : prompt.injection_order,
					injection_trigger: clonedInjectionTriggerField ? Array.from(clonedInjectionTriggerField.selectedOptions).map(opt => opt.value) : prompt.injection_trigger,
					forbid_overrides: clonedForbidOverridesField?.checked ?? prompt.forbid_overrides,
				};
			}
			return true;
		}
	});

	const result = await editPopup.show();

	if (result && savedData) {
		// Update the prompt in the template
		Object.assign(template.prompts[promptIdentifier], savedData);
		template.updatedAt = new Date().toISOString();
		promptTemplateManager.saveSettings();
		toastr.success('Prompt updated in template');

		// Refresh the viewer
		await window.ccpmViewPrompts(templateId);
	}
};

async function showCreateTemplateDialog() {
	const availablePrompts = oai_settings.prompts || [];

	// Handle array format - extract identifiers from prompt objects
	const promptList = Array.isArray(availablePrompts)
		? availablePrompts.filter(p => p.identifier).map(p => ({ identifier: p.identifier, name: p.name || p.identifier }))
		: Object.keys(availablePrompts).map(id => ({ identifier: id, name: availablePrompts[id].name || id }));

	if (promptList.length === 0) {
		toastr.warning('No prompts found to create template from');
		return;
	}

	const content = document.createElement('div');
	content.innerHTML = `
		<div class="flex-container flexFlowColumn flexGap10">
			<div class="flex-container flexFlowColumn">
				<label for="ccpm-template-name"><strong>Template Name:</strong></label>
				<input type="text" id="ccpm-template-name" class="text_pole" placeholder="Enter template name" required>
			</div>
			<div class="flex-container flexFlowColumn">
				<label for="ccpm-template-desc"><strong>Description (optional):</strong></label>
				<textarea id="ccpm-template-desc" class="text_pole" placeholder="Describe this template" style="min-height: 80px; resize: vertical;"></textarea>
			</div>
			<div class="flex-container flexFlowColumn">
				<label><strong>Include Prompts:</strong></label>
				<div class="flex-container flexGap5 m-b-1">
					<button type="button" id="ccpm-select-all" class="menu_button menu_button_icon interactable">Select All</button>
					<button type="button" id="ccpm-unselect-all" class="menu_button menu_button_icon interactable">Unselect All</button>
				</div>
				<div class="flex-container flexWrap flexGap10 m-t-1">
					${promptList.map(p => `
						<div class="flex-container alignItemsCenter flexGap5">
							<input type="checkbox" name="ccpm-prompts" value="${escapeHtml(p.identifier)}" checked class="interactable">
							<label>${escapeHtml(p.name)}</label>
						</div>
					`).join('')}
				</div>
			</div>
		</div>
	`;

	let capturedData = null;

	const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
		okButton: 'Create',
		cancelButton: 'Cancel',
		allowVerticalScrolling: true,
		onOpen: () => {
			// Setup select/unselect all buttons
			document.getElementById('ccpm-select-all')?.addEventListener('click', () => {
				document.querySelectorAll('input[name="ccpm-prompts"]').forEach(cb => cb.checked = true);
			});
			document.getElementById('ccpm-unselect-all')?.addEventListener('click', () => {
				document.querySelectorAll('input[name="ccpm-prompts"]').forEach(cb => cb.checked = false);
			});
		},
		onClosing: (popup) => {
			// Capture values before popup closes and DOM is removed
			if (popup.result === POPUP_RESULT.AFFIRMATIVE) {
				const name = document.getElementById('ccpm-template-name')?.value.trim();
				const description = document.getElementById('ccpm-template-desc')?.value.trim();
				const selectedPrompts = Array.from(document.querySelectorAll('input[name="ccpm-prompts"]:checked'))
					.map(cb => cb.value);

				console.log('CCPM DEBUG: Captured values - name:', name, 'description:', description, 'prompts:', selectedPrompts);

				if (!name) {
					toastr.error('Template name is required');
					return false; // Prevent popup from closing
				}

				if (selectedPrompts.length === 0) {
					toastr.error('Select at least one prompt');
					return false; // Prevent popup from closing
				}

				capturedData = { name, description, selectedPrompts };
			}
			return true; // Allow popup to close
		}
	});

	const result = await popup.show();
	console.log('CCPM DEBUG: Popup result:', result);

	if (!result || !capturedData) {
		console.log('CCPM DEBUG: User cancelled or no data captured');
		return;
	}

	console.log('CCPM DEBUG: User clicked Create');

	try {
		console.log('CCPM DEBUG: Calling createTemplateFromCurrent');
		const template = promptTemplateManager.createTemplateFromCurrent(
			capturedData.name,
			capturedData.description,
			capturedData.selectedPrompts
		);
		console.log('CCPM DEBUG: createTemplateFromCurrent returned:', template);
		console.log('CCPM DEBUG: Template count after creation:', promptTemplateManager.listTemplates().length);
		console.log('CCPM DEBUG: extension_settings.ccPromptManager=', extension_settings.ccPromptManager);
		toastr.success('Template created successfully');
		await renderPromptTemplateList();
	} catch (error) {
		console.error('CCPM DEBUG: Error creating template:', error);
		toastr.error('Failed to create template: ' + error.message);
	}
}

async function showEditTemplateDialog(template) {
	const content = document.createElement('div');
	content.innerHTML = `
		<div class="flex-container flexFlowColumn flexGap10">
			<div class="flex-container flexFlowColumn">
				<label for="ccpm-edit-name"><strong>Template Name:</strong></label>
				<input type="text" id="ccpm-edit-name" class="text_pole" value="${escapeHtml(template.name)}" required>
			</div>
			<div class="flex-container flexFlowColumn">
				<label for="ccpm-edit-desc"><strong>Description:</strong></label>
				<textarea id="ccpm-edit-desc" class="text_pole" style="min-height: 80px; resize: vertical;">${escapeHtml(template.description || '')}</textarea>
			</div>
		</div>
	`;

	let capturedData = null;

	const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
		okButton: 'Save',
		cancelButton: 'Cancel',
		allowVerticalScrolling: true,
		onClosing: (popup) => {
			if (popup.result === POPUP_RESULT.AFFIRMATIVE) {
				const name = document.getElementById('ccpm-edit-name')?.value.trim();
				const description = document.getElementById('ccpm-edit-desc')?.value.trim();

				if (!name) {
					toastr.error('Template name is required');
					return false;
				}

				capturedData = { name, description };
			}
			return true;
		}
	});

	const result = await popup.show();
	if (!result || !capturedData) return;

	try {
		promptTemplateManager.updateTemplate(template.id, capturedData);
		toastr.success('Template updated successfully');
		await renderPromptTemplateList();
	} catch (error) {
		toastr.error('Failed to update template: ' + error.message);
	}
}

async function showImportTemplateDialog() {
	// Create file input
	const fileInput = document.createElement('input');
	fileInput.type = 'file';
	fileInput.accept = '.json';

	fileInput.addEventListener('change', async () => {
		if (fileInput.files.length === 0) return;

		try {
			const file = fileInput.files[0];
			const text = await file.text();
			const templates = JSON.parse(text);
			const templatesArray = Array.isArray(templates) ? templates : [templates];

			const result = promptTemplateManager.importTemplates(templatesArray);

			if (result.imported > 0) {
				toastr.success(`Imported ${result.imported} template(s) successfully`);
				await renderPromptTemplateList();
			}

			if (result.skipped > 0) {
				toastr.warning(`Skipped ${result.skipped} invalid template(s)`);
			}

			if (result.imported === 0 && result.skipped === 0) {
				toastr.error('No valid templates found in file');
			}
		} catch (error) {
			toastr.error('Failed to import template: ' + error.message);
		}
	});

	// Trigger file picker
	fileInput.click();
}

function exportAllTemplates() {
	const templates = promptTemplateManager.exportTemplates();
	if (templates.length === 0) {
		toastr.warning('No templates to export');
		return;
	}

	const jsonData = JSON.stringify(templates, null, 2);

	// Create downloadable file
	const blob = new Blob([jsonData], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `ccpm-templates-${new Date().toISOString().split('T')[0]}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);

	toastr.success(`Exported ${templates.length} template(s)`);
}

// Extension initialization - wait for SillyTavern to be ready
function initializeExtension() {
	// Extension is ready, manager will handle UI injection via events
	console.log('CCPM: Extension initialized');
}

