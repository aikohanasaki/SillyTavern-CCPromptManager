import { Popup, POPUP_TYPE } from '../../../popup.js';
import { extension_settings, saveMetadataDebounced, getContext } from '../../../extensions.js';
import { eventSource, event_types, chat_metadata, name2, systemUserName, neutralCharacterName, characters, power_user } from '../../../../script.js';
import { selected_group, groups, editGroup } from '../../../group-chats.js';

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
        saveMetadataDebounced();
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
        const { group, chat, character } = locks;

        // Priority: group -> group chat -> character (individual)
        if (group) return { templateId: group, source: SETTING_SOURCES.GROUP };
        if (chat) return { templateId: chat, source: SETTING_SOURCES.GROUP_CHAT };
        if (character) return { templateId: character, source: SETTING_SOURCES.CHARACTER };

        return { templateId: null, source: 'none' };
    }

    _resolveSingleLocks(context, locks) {
        const { character, chat } = locks;

        // Priority: character -> chat
        if (character) return { templateId: character, source: SETTING_SOURCES.CHARACTER };
        if (chat) return { templateId: chat, source: SETTING_SOURCES.CHAT };

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
        this.lockResolver = new TemplateLockResolver(this.storage.getExtensionSettings());
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
	 * @param {string} [param0.id] - Optional unique identifier
	 */
	constructor({ name, description, prompts, id }) {
		this.id = id || PromptTemplate.generateId();
		this.name = name;
		this.description = description;
		// Store ST-compatible prompt structure
		this.prompts = this.validateAndNormalizePrompts(prompts || {});
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
		const validIdentifiers = ['main', 'nsfw', 'jailbreak', 'impersonation', 'utility'];

		// Ensure we have valid SillyTavern prompt structure
		for (const [identifier, promptData] of Object.entries(prompts)) {
			if (validIdentifiers.includes(identifier) && promptData) {
				normalized[identifier] = {
					identifier: identifier,
					name: promptData.name || this.getDefaultPromptName(identifier),
					system_prompt: promptData.system_prompt || false,
					role: promptData.role || 'system',
					content: promptData.content || '',
					injection_position: promptData.injection_position || 0,
					injection_depth: promptData.injection_depth || 4
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
			autoApplyLocked: 'auto',  // 'auto', 'ask', or 'never'
			lockPriority: 'character', // Default lock priority: character > chat > group
			version: '1.0.0'
		};

		if (!extension_settings.ccPromptManager) {
			extension_settings.ccPromptManager = defaultSettings;
			this.saveSettings();
		}
	}

	// Save current state to settings
	saveSettings() {
		if (!extension_settings.ccPromptManager) {
			extension_settings.ccPromptManager = {};
		}

		extension_settings.ccPromptManager.templates = this.exportTemplates().reduce((acc, template) => {
			acc[template.id] = template;
			return acc;
		}, {});

		saveMetadataDebounced();
	}

	// Load templates from settings
	loadTemplatesFromSettings() {
		if (extension_settings.ccPromptManager?.templates) {
			const templateData = Object.values(extension_settings.ccPromptManager.templates);
			this.importTemplates(templateData);
		}
	}

	/**
	 * Create and store a new prompt template
	 * @param {Object} data - Template data
	 * @returns {PromptTemplate}
	 */
	createTemplate(data) {
		const tmpl = new PromptTemplate(data);
		this.templates.set(tmpl.id, tmpl);
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
		for (const data of arr) {
			const tmpl = new PromptTemplate(data);
			this.templates.set(tmpl.id, tmpl);
		}
		this.saveSettings();
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
			createdAt: t.createdAt,
			updatedAt: t.updatedAt,
		}));
	}

	/**
	 * Apply a template to SillyTavern's prompt system
	 * @param {string} templateId
	 * @returns {boolean} Success status
	 */
	applyTemplate(templateId) {
		const tmpl = this.getTemplate(templateId);
		if (!tmpl) {
			toastr.error('Template not found:', templateId);
			return false;
		}

		try {
			// Apply each prompt to SillyTavern's power_user.prompts
			for (const [identifier, promptData] of Object.entries(tmpl.prompts)) {
				if (power_user.prompts && power_user.prompts[identifier]) {
					// Update existing prompt
					Object.assign(power_user.prompts[identifier], promptData);
				} else {
					// Create new prompt entry
					if (!power_user.prompts) power_user.prompts = {};
					power_user.prompts[identifier] = { ...promptData };
				}
			}

			// Trigger SillyTavern's prompt system update
			eventSource.emit(event_types.SETTINGS_UPDATED);

			console.log('Template applied successfully:', tmpl.name);
			return true;
		} catch (error) {
			toastr.error('Failed to apply template:', error);
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
		const currentPrompts = {};
		const availablePrompts = power_user.prompts || {};

		// Include specified prompts or all available prompts
		const promptsToInclude = includePrompts || Object.keys(availablePrompts);

		for (const identifier of promptsToInclude) {
			if (availablePrompts[identifier]) {
				currentPrompts[identifier] = { ...availablePrompts[identifier] };
			}
		}

		return this.createTemplate({
			name,
			description,
			prompts: currentPrompts
		});
	}

	// Set up event handlers
	setupEventHandlers() {
		// Listen for settings updates to sync with external changes
		eventSource.on(event_types.SETTINGS_UPDATED, () => {
			this.handleSettingsUpdate();
		});

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
	handleSettingsUpdate() {
		// Reload templates if extension settings changed externally
		if (extension_settings.ccPromptManager) {
			this.loadTemplatesFromSettings();
		}
	}

	/**
	 * Handle chat change event
	 */
	async handleChatChange() {
		console.log('CCPM: Chat changed, templates available:', this.templates.size);

		// Load current locks and apply locked template based on setting
		await this.lockManager.loadCurrentLocks();

		const settings = this.storage.getExtensionSettings();
		const autoApplyMode = settings.autoApplyLocked || 'auto'; // Handle legacy boolean values

		switch (autoApplyMode) {
			case 'auto':
			case true: // Legacy compatibility
				await this.applyLockedTemplate();
				break;
			case 'ask':
				await this.askToApplyLockedTemplate();
				break;
			case 'never':
			case false: // Legacy compatibility
				// Do nothing
				break;
			default:
				console.warn('CCPM: Unknown autoApplyLocked mode:', autoApplyMode);
				break;
		}

		// Trigger context change for lock manager
		this.lockManager.onContextChanged();
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
				return this.applyTemplate(lockResult.templateId);
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

			return new Promise((resolve) => {
				const content = document.createElement('div');
				content.innerHTML = `
					<div class="ccpm-dialog-content">
						<h4>Apply Locked Template?</h4>
						<p>A template is locked for this ${lockResult.source}:</p>
						<div style="background: var(--grey20); padding: 12px; border-radius: 6px; margin: 12px 0;">
							<strong>${escapeHtml(template.name)}</strong>
							${template.description ? `<br><small style="color: var(--grey70);">${escapeHtml(template.description)}</small>` : ''}
						</div>
						<p>Would you like to apply this template now?</p>
					</div>
				`;

				const popup = new Popup(content, POPUP_TYPE.CONFIRM, 'Apply Template', {
					okButton: 'Apply',
					cancelButton: 'Skip',
					onOk: () => {
						console.log(`CCPM: User chose to apply locked template from ${lockResult.source}:`, lockResult.templateId);
						const success = this.applyTemplate(lockResult.templateId);
						if (success) {
							toastr.success(`Applied template: ${template.name}`, 'CCPM');
						}
						resolve(success);
					},
					onCancel: () => {
						console.log('CCPM: User chose to skip applying locked template');
						resolve(false);
					}
				});
				popup.show();
			});
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

		// Create button
		const btn = document.createElement('button');
		btn.id = 'ccpm-prompt-template-btn';
		btn.className = 'menu_button';
		btn.innerText = 'Prompt Templates';
		btn.style.margin = '4px 0';
		btn.onclick = openPromptTemplateManagerModal;

		// Insert at top of extensions menu
		menu.insertBefore(btn, menu.firstChild);
	};
	tryInject();
}

function openPromptTemplateManagerModal() {
	const content = document.createElement('div');
	content.className = 'ccpm-ptm-content';
	content.innerHTML = `
		<div class="title_restorable">
			<h3>Prompt Template Manager</h3>
		</div>
		<div class="ccpm-toolbar flex gap10px marginBot10">
			<div class="menu_button" id="ccpm-create-from-current">
				<i class="fa-solid fa-plus"></i>
				<span>Create from Current</span>
			</div>
			<div class="menu_button" id="ccpm-import-template">
				<i class="fa-solid fa-file-import"></i>
				<span>Import</span>
			</div>
			<div class="menu_button" id="ccpm-export-all">
				<i class="fa-solid fa-file-export"></i>
				<span>Export All</span>
			</div>
		</div>
		<div id="ccpm-ptm-list" class="ccpm-template-list"></div>
	`;

	// Render the template list after popup is shown
	const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
		okButton: false,
		cancelButton: 'Close',
		wide: true,
		large: true,
		onOpen: () => {
			renderPromptTemplateList();
			setupTemplateManagerEvents();
		},
	});
	popup.show();
}

async function renderPromptTemplateList() {
	const listDiv = document.getElementById('ccpm-ptm-list');
	if (!listDiv) return;
	const templates = promptTemplateManager.listTemplates();

	if (templates.length === 0) {
		listDiv.innerHTML = `
			<div class="justifyCenter">
				<div class="text_pole">
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
			lockStatus = `<span class="ccpm-lock-status active" title="Currently active from ${effectiveLock.source}">🔒 Active (${effectiveLock.source})</span>`;
		} else if (isLockedToCharacter || isLockedToChat || isLockedToGroup) {
			const lockTypes = [];
			if (isLockedToCharacter) lockTypes.push('character');
			if (isLockedToChat) lockTypes.push('chat');
			if (isLockedToGroup) lockTypes.push('group');
			lockStatus = `<span class="ccpm-lock-status" title="Locked to: ${lockTypes.join(', ')}">🔒 ${lockTypes.join(', ')}</span>`;
		}

		return `
			<div class="ccpm-template-item marginBot10 ${isEffectiveTemplate ? 'effective-template' : ''}">
				<div class="ccpm-template-header flex justifySpaceBetween marginBot5">
					<div class="ccpm-template-info flexGrow">
						<div class="ccpm-template-title">
							${escapeHtml(t.name)}
							${lockStatus}
						</div>
						<div class="ccpm-template-meta">
							<span class="ccpm-prompt-count">${promptCount} prompt${promptCount !== 1 ? 's' : ''}</span>
							<span class="ccpm-date">Created: ${createdDate}</span>
						</div>
					</div>
					<div class="ccpm-template-actions flex gap3px">
						<div class="menu_button menu_button_icon" onclick="window.ccpmApplyTemplate('${t.id}')" title="Apply Template">
							<i class="fa-solid fa-play"></i>
						</div>
						<div class="menu_button menu_button_icon" onclick="window.ccpmShowLockMenu('${t.id}')" title="Lock/Unlock Template">
							<i class="fa-solid fa-lock"></i>
						</div>
						<div class="menu_button menu_button_icon" onclick="window.ccpmEditTemplate('${t.id}')" title="Edit Template">
							<i class="fa-solid fa-edit"></i>
						</div>
						<div class="menu_button menu_button_icon redWarningBG" onclick="window.ccpmDeleteTemplate('${t.id}')" title="Delete Template">
							<i class="fa-solid fa-trash"></i>
						</div>
					</div>
				</div>
				${t.description ? `<div class="ccpm-template-description marginBot10">${escapeHtml(t.description)}</div>` : ''}
				<div class="ccpm-template-prompts flex flexWrap gap5px">
					${Object.keys(t.prompts).map(identifier =>
						`<span class="ccpm-prompt-tag">${identifier}</span>`
					).join('')}
				</div>
			</div>
		`;
	}).join('');

	injectCCPMStyles();
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

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

function injectCCPMStyles() {
	if (document.getElementById('ccpm-styles')) return;

	const style = document.createElement('style');
	style.id = 'ccpm-styles';
	style.innerHTML = `
		/* CCPM Main Layout */
		.ccpm-ptm-content {
			min-width: 600px;
			max-width: 800px;
		}

		.ccpm-toolbar {
			padding-bottom: 10px;
			border-bottom: 1px solid var(--grey30);
		}

		/* Template List */
		.ccpm-template-list {
			max-height: 60vh;
			overflow-y: auto;
		}

		.ccpm-template-item {
			background: var(--SmartThemeBlurTintColor);
			border: 1px solid var(--SmartThemeBorderColor);
			border-radius: 8px;
			padding: 16px;
			transition: all 0.2s ease;
		}

		.ccpm-template-item:hover {
			background: var(--grey30);
			border-color: var(--grey50);
		}

		.ccpm-template-header {
			align-items: flex-start;
		}

		.ccpm-template-info {
			flex: 1;
		}

		.ccpm-template-title {
			font-size: 1.1em;
			font-weight: 600;
			color: var(--SmartThemeBodyColor);
			margin-bottom: 4px;
		}

		.ccpm-template-meta {
			display: flex;
			gap: 16px;
			font-size: 0.85em;
			color: var(--grey70);
		}

		.ccpm-prompt-count {
			color: var(--SmartThemeQuoteColor);
			font-weight: 500;
		}

		.ccpm-template-actions {
			gap: 4px;
		}

		.ccpm-template-actions .menu_button {
			width: 32px;
			height: 32px;
			padding: 0;
		}

		.ccpm-template-description {
			color: var(--grey70);
			font-size: 0.9em;
			line-height: 1.4;
		}

		.ccpm-template-prompts {
			gap: 6px;
		}

		.ccpm-prompt-tag {
			background: var(--SmartThemeQuoteColor);
			color: var(--SmartThemeBodyColor);
			padding: 2px 8px;
			border-radius: 12px;
			font-size: 0.8em;
			font-weight: 500;
		}

		/* Dialog Styles */
		.ccpm-dialog-content {
			padding: 16px 0;
		}

		.ccpm-form-group {
			margin-bottom: 16px;
		}

		.ccpm-form-group label {
			display: block;
			margin-bottom: 6px;
			font-weight: 500;
			color: var(--SmartThemeBodyColor);
		}

		.ccpm-form-group input,
		.ccpm-form-group textarea {
			width: 100%;
			padding: 8px 12px;
			border: 1px solid var(--SmartThemeBorderColor);
			border-radius: 4px;
			background: var(--SmartThemeBlurTintColor);
			color: var(--SmartThemeBodyColor);
			font-family: inherit;
		}

		.ccpm-form-group textarea {
			resize: vertical;
			min-height: 80px;
		}

		.ccpm-checkbox-group {
			display: flex;
			flex-wrap: wrap;
			gap: 12px;
			margin-top: 8px;
		}

		.ccpm-checkbox-item {
			display: flex;
			align-items: center;
			gap: 6px;
		}

		.ccpm-checkbox-item input[type="checkbox"] {
			width: auto;
		}

		/* Lock Status Styles */
		.ccpm-lock-status {
			font-size: 0.8em;
			padding: 2px 6px;
			border-radius: 3px;
			background: var(--grey30);
			color: var(--grey70);
			margin-left: 8px;
		}

		.ccpm-lock-status.active {
			background: var(--SmartThemeQuoteColor);
			color: var(--SmartThemeBodyColor);
			font-weight: 600;
		}

		.ccpm-template-item.effective-template {
			border-left: 4px solid var(--SmartThemeQuoteColor);
			background: var(--grey10);
		}

		/* Lock Menu Styles */
		.ccpm-lock-targets {
			gap: 10px;
			margin: 16px 0;
		}

		.ccpm-lock-target {
			padding: 10px;
			border: 1px solid var(--SmartThemeBorderColor);
			border-radius: 6px;
			background: var(--SmartThemeBlurTintColor);
		}

		.ccpm-lock-info {
			flex: 1;
		}

		.ccpm-lock-info small {
			color: var(--grey70);
		}

		.ccpm-lock-active {
			color: var(--SmartThemeQuoteColor);
			font-weight: 600;
		}

		.ccpm-lock-conflict {
			color: var(--fullred);
			font-weight: 600;
		}

		.ccpm-lock-actions {
			margin-left: 12px;
		}
	`;
	document.head.appendChild(style);
}

// Expose template management functions for buttons
window.ccpmApplyTemplate = function(id) {
	if (promptTemplateManager.applyTemplate(id)) {
		toastr.success('Template applied successfully!');
		// Close the popup
		document.querySelector('.popup')?.remove();
	} else {
		toastr.error('Failed to apply template');
	}
};

window.ccpmEditTemplate = function(id) {
	const template = promptTemplateManager.getTemplate(id);
	if (!template) {
		toastr.error('Template not found');
		return;
	}
	showEditTemplateDialog(template);
};

window.ccpmDeleteTemplate = function(id) {
	const template = promptTemplateManager.getTemplate(id);
	if (!template) {
		toastr.error('Template not found');
		return;
	}

	const content = document.createElement('div');
	content.innerHTML = `
		<div class="ccpm-dialog-content">
			<p>Are you sure you want to delete the template "<strong>${escapeHtml(template.name)}</strong>"?</p>
			<span class="info-block warning">This action cannot be undone.</span>
		</div>
	`;

	const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
		okButton: 'Delete',
		cancelButton: 'Cancel',
		okClass: 'redWarningBG',
		onOk: () => {
			if (promptTemplateManager.deleteTemplate(id)) {
				toastr.success('Template deleted successfully');
				renderPromptTemplateList();
			} else {
				toastr.error('Failed to delete template');
			}
		}
	});
	popup.show();
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

	const content = document.createElement('div');
	content.innerHTML = `
		<div class="ccpm-dialog-content">
			<h4>Lock Template: ${escapeHtml(template.name)}</h4>
			<p>Choose where to lock this template:</p>

			<div class="ccpm-lock-targets flexFlowColumn gap10px">
				${availableTargets.map(target => {
					const isCurrentlyLocked = currentLocks[target] === templateId;
					const hasOtherLock = currentLocks[target] && currentLocks[target] !== templateId;
					const contextName = getContextName(context, target);

					return `
						<div class="ccpm-lock-target flex justifySpaceBetween">
							<div class="ccpm-lock-info flexGrow">
								<strong>${target.charAt(0).toUpperCase() + target.slice(1)}</strong>
								${contextName ? `<br><small>${contextName}</small>` : ''}
								${isCurrentlyLocked ? '<br><span class="ccpm-lock-active">🔒 Currently locked</span>' : ''}
								${hasOtherLock ? '<br><span class="ccpm-lock-conflict">⚠️ Another template is locked</span>' : ''}
							</div>
							<div class="ccpm-lock-actions">
								${!isCurrentlyLocked ? `
									<button class="menu_button" onclick="ccpmLockToTarget('${templateId}', '${target}')">
										Lock Here
									</button>
								` : `
									<button class="menu_button redWarningBG" onclick="ccpmClearLock('${target}')">
										Unlock
									</button>
								`}
							</div>
						</div>
					`;
				}).join('')}
			</div>

			${availableTargets.length === 0 ? '<p style="color: var(--grey70);">No lock targets available in current context.</p>' : ''}
		</div>
	`;

	const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
		okButton: false,
		cancelButton: 'Close',
		wide: true
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
		// Close the lock menu and refresh the template list
		document.querySelector('.popup')?.remove();
		await renderPromptTemplateList();
	}
};

window.ccpmClearLock = async function(target) {
	const success = await promptTemplateManager.clearTemplateLock(target);
	if (success) {
		// Close the lock menu and refresh the template list
		document.querySelector('.popup')?.remove();
		await renderPromptTemplateList();
	}
};

function showCreateTemplateDialog() {
	const availablePrompts = power_user.prompts || {};
	const promptIdentifiers = Object.keys(availablePrompts);

	if (promptIdentifiers.length === 0) {
		toastr.warning('No prompts found to create template from');
		return;
	}

	const content = document.createElement('div');
	content.innerHTML = `
		<div class="ccpm-dialog-content">
			<div class="ccpm-form-group">
				<label for="ccpm-template-name">Template Name:</label>
				<input type="text" id="ccpm-template-name" placeholder="Enter template name" required>
			</div>
			<div class="ccpm-form-group">
				<label for="ccpm-template-desc">Description (optional):</label>
				<textarea id="ccpm-template-desc" placeholder="Describe this template"></textarea>
			</div>
			<div class="ccpm-form-group">
				<label>Include Prompts:</label>
				<div class="ccpm-checkbox-group">
					${promptIdentifiers.map(id => `
						<div class="ccpm-checkbox-item">
							<input type="checkbox" id="ccpm-prompt-${id}" value="${id}" checked>
							<label for="ccpm-prompt-${id}">${id}</label>
						</div>
					`).join('')}
				</div>
			</div>
		</div>
	`;

	const popup = new Popup(content, POPUP_TYPE.CONFIRM, 'Create Template', {
		okButton: 'Create',
		cancelButton: 'Cancel',
		onOk: () => {
			const name = document.getElementById('ccpm-template-name').value.trim();
			const description = document.getElementById('ccpm-template-desc').value.trim();

			if (!name) {
				toastr.error('Template name is required');
				return false;
			}

			const selectedPrompts = Array.from(document.querySelectorAll('.ccpm-checkbox-item input[type="checkbox"]:checked'))
				.map(cb => cb.value);

			if (selectedPrompts.length === 0) {
				toastr.error('Select at least one prompt');
				return false;
			}

			try {
				promptTemplateManager.createTemplateFromCurrent(name, description, selectedPrompts);
				toastr.success('Template created successfully');
				renderPromptTemplateList();
				return true;
			} catch (error) {
				toastr.error('Failed to create template: ' + error.message);
				return false;
			}
		}
	});
	popup.show();
}

function showEditTemplateDialog(template) {
	const content = document.createElement('div');
	content.innerHTML = `
		<div class="ccpm-dialog-content">
			<div class="ccpm-form-group">
				<label for="ccpm-edit-name">Template Name:</label>
				<input type="text" id="ccpm-edit-name" value="${escapeHtml(template.name)}" required>
			</div>
			<div class="ccpm-form-group">
				<label for="ccpm-edit-desc">Description:</label>
				<textarea id="ccpm-edit-desc">${escapeHtml(template.description || '')}</textarea>
			</div>
		</div>
	`;

	const popup = new Popup(content, POPUP_TYPE.CONFIRM, 'Edit Template', {
		okButton: 'Save',
		cancelButton: 'Cancel',
		onOk: () => {
			const name = document.getElementById('ccpm-edit-name').value.trim();
			const description = document.getElementById('ccpm-edit-desc').value.trim();

			if (!name) {
				toastr.error('Template name is required');
				return false;
			}

			try {
				promptTemplateManager.updateTemplate(template.id, { name, description });
				toastr.success('Template updated successfully');
				renderPromptTemplateList();
				return true;
			} catch (error) {
				toastr.error('Failed to update template: ' + error.message);
				return false;
			}
		}
	});
	popup.show();
}

function showImportTemplateDialog() {
	const content = document.createElement('div');
	content.innerHTML = `
		<div class="ccpm-dialog-content">
			<div class="ccpm-form-group">
				<label for="ccpm-import-data">Paste template JSON data:</label>
				<textarea id="ccpm-import-data" placeholder="Paste exported template data here..." style="min-height: 200px; font-family: monospace;"></textarea>
			</div>
		</div>
	`;

	const popup = new Popup(content, POPUP_TYPE.CONFIRM, 'Import Template', {
		okButton: 'Import',
		cancelButton: 'Cancel',
		onOk: () => {
			const data = document.getElementById('ccpm-import-data').value.trim();

			if (!data) {
				toastr.error('Please paste template data');
				return false;
			}

			try {
				const templates = JSON.parse(data);
				const templatesArray = Array.isArray(templates) ? templates : [templates];

				promptTemplateManager.importTemplates(templatesArray);
				toastr.success(`Imported ${templatesArray.length} template(s) successfully`);
				renderPromptTemplateList();
				return true;
			} catch (error) {
				toastr.error('Failed to import template: Invalid JSON data');
				return false;
			}
		}
	});
	popup.show();
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

