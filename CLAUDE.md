# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CCPromptManager (CCPM) is a SillyTavern third-party extension that provides advanced prompt management capabilities. The extension is designed to be installed in SillyTavern's third-party extensions directory at `/public/scripts/extensions/third-party/SillyTavern-CCPromptManager`.

## SillyTavern Extension Architecture

### Required Files
- **`manifest.json`** - Extension metadata and configuration
  - Must include: `display_name`, `js`, `author`, `version`, `description`
  - Optional: `loading_order` (controls load sequence), `css`, `license`, `homePage`, `auto_update`
  - Dependencies: `requires` array for mandatory extensions, `optional` array for optional ones

- **`index.js`** - Main extension entry point
  - Must be ES6 module format
  - Imports from SillyTavern core APIs using relative paths from the third-party location

### Core SillyTavern APIs Available

Import paths are relative to `/public/scripts/extensions/third-party/SillyTavern-CCPromptManager/`:

```javascript
// Core SillyTavern APIs
import { Popup, POPUP_TYPE, POPUP_RESULT } from '../../../popup.js';
import { extension_settings, getContext } from '../../../extensions.js';
import { eventSource, event_types, chat_metadata, name2, systemUserName, neutralCharacterName, characters, saveSettingsDebounced } from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import { oai_settings, promptManager } from '../../../openai.js';
import { selected_group, groups, editGroup } from '../../../group-chats.js';
```

**Key imports for CCPromptManager**:
- `POPUP_RESULT`: Check popup button results in `onClosing` callback
- `saveSettingsDebounced`: Save extension_settings (NOT `saveMetadataDebounced` which saves chat metadata)
- `promptManager`: ST's PromptManager instance - always use this instead of direct manipulation
- `getContext`: Get current character/chat context

### Extension Loading and Lifecycle

Extensions are loaded by SillyTavern's extension system in `loading_order` sequence. Common patterns:

1. **Initialization**: Extension loads and registers event listeners
2. **Registration**: Register with SillyTavern's extension system
3. **Event Handling**: Listen for chat events, character changes, etc.
4. **Settings Management**: Use `extension_settings[extensionName]` for persistence
5. **UI Integration**: Add UI elements to SillyTavern's interface

### Storage Patterns

- **Extension Settings**: `extension_settings.yourExtensionName` - Global extension configuration
- **Chat Metadata**: `chat_metadata.yourKey` - Per-chat data storage
- **Character Metadata**: Character objects have metadata properties
- **Group Metadata**: Group objects can store custom properties

### Development Workflow

SillyTavern extensions use direct JavaScript development:

1. **No Build System**: Extensions are loaded directly as ES6 modules
2. **Hot Reload**: SillyTavern can reload extensions via the Extensions panel
3. **Testing**: Manual testing within SillyTavern environment
4. **Debugging**: Browser developer tools for debugging

### Common Extension Patterns

#### Event Registration
```javascript
// Register for SillyTavern events
eventSource.on(event_types.CHAT_CHANGED, handleChatChange);
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, handleMessage);
```

#### Settings Management
```javascript
// Extension settings with defaults
const defaultSettings = {
    enabled: true,
    option1: 'default'
};

// Initialize settings
if (!extension_settings.ccPromptManager) {
    extension_settings.ccPromptManager = defaultSettings;
}
```

#### UI Integration
```javascript
// Add extension UI to SillyTavern
const extensionHtml = `
    <div id="ccpm-container">
        <!-- Extension UI here -->
    </div>
`;
$('#extensions_settings').append(extensionHtml);
```

#### Slash Commands
```javascript
// Register slash commands
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'ccpm',
    callback: handleCommand,
    helpString: 'CCPromptManager command',
    aliases: ['prompt'],
}));
```

### SillyTavern Linting

SillyTavern includes ESLint configuration. To check extension code:

```bash
# From SillyTavern root directory
npm run lint
npm run lint:fix
```

### Extension Installation Location

The extension will be installed at:
`C:\Users\ai\Aikobots Code\SillyTavern\public\scripts\extensions\third-party\SillyTavern-CCPromptManager\`

### Testing Commands

From SillyTavern root directory:
- `npm start` - Start SillyTavern server
- `npm run start:global` - Start with global access
- `npm run lint` - Check code style
- `npm run lint:fix` - Auto-fix linting issues

### Extension Dependencies

Common third-party extension dependencies:
- **Connection Manager** - For API connection management
- **Regex Extension** - For text processing
- **Quick Reply** - For UI shortcuts

### Key SillyTavern Concepts

- **Characters**: Individual AI personalities with their own settings
- **Groups**: Multi-character conversations
- **Chats**: Individual conversation sessions
- **Presets**: Configuration templates for AI generation
- **Profiles**: Connection and API settings
- **World Info**: Background knowledge system
- **Extensions**: Plugin system for additional functionality

### File Structure

Typical extension structure:
```
├── index.js                 # Main extension file
├── manifest.json           # Extension metadata
├── style.css              # Optional styling
├── README.md              # User documentation
└── src/                   # Optional source organization
    ├── components/        # UI components
    ├── utils/            # Utility functions
    └── api.js           # API integrations
```

### Error Handling

Always include proper error handling for SillyTavern integration:
- Graceful degradation when dependencies are missing
- User-friendly error messages via toastr notifications
- Fallback behaviors for API failures
- Proper cleanup on extension disable/unload

## CCPromptManager Architecture

### Core System Components

CCPromptManager is built around five main architectural layers:

#### 1. Context Management Layer (`ChatContext`)
Handles detection and caching of the current chat context:
- **Single vs Group Chat detection**: Determines if user is in a character chat or group chat
- **Context caching**: 1-second TTL cache to avoid repeated lookups
- **Unified context structure**: Provides consistent context regardless of chat type

```javascript
context = {
    type: 'single' | 'group',
    isGroupChat: boolean,
    groupId: string | null,
    characterName: string | null,
    chatId: string | null,
    primaryId: string,    // Character name or group ID
    secondaryId: string   // Chat ID or secondary identifier
}
```

#### 2. Storage Adapter Layer (`TemplateStorageAdapter`)
Abstracts all storage operations for templates and locks:
- **Extension settings**: Templates stored in `extension_settings.CCPM.templates`
- **Character locks**: Stored in `extension_settings.CCPM.templateLocks.character[characterKey]`
- **Group locks**: Stored in group object's `ccpm_template_lock` property
- **Chat locks**: Stored in `chat_metadata.ccpm_template_lock`

Storage locations by lock type:
- Character: `extension_settings` (persists globally)
- Chat: `chat_metadata` (per-chat)
- Group: Group object metadata (per-group)

#### 3. Lock Resolution Layer (`TemplateLockResolver`)
Implements hierarchical lock priority resolution:

**Single Chat Priority**: `character > chat`
- Character lock takes precedence over chat-specific lock

**Group Chat Priority**: `group > group_chat > character`
- Group-level lock overrides all
- Group chat-specific lock is next
- Individual character locks are fallback

#### 4. Lock Management Layer (`TemplateLockManager`)
Orchestrates the locking system:
- Fetches locks from all possible sources (character, chat, group)
- Uses `TemplateLockResolver` to determine which lock to apply
- Provides methods to get/set/delete locks at each level
- Emits events when locks change

Key methods:
- `getLockToApply()`: Returns `{templateId, source}` based on current context
- `setCharacterLock()`, `setChatLock()`, `setGroupLock()`: Set locks at each level
- `deleteCharacterLock()`, `deleteChatLock()`, `deleteGroupLock()`: Remove locks

#### 5. Template Management Layer (`PromptTemplateManager`)
CRUD operations for prompt templates:
- Template storage and retrieval
- Integration with SillyTavern's `promptManager` API
- Template application and validation
- Event handling for chat changes

### Critical Integration Points

#### SillyTavern PromptManager Integration

**IMPORTANT**: Always use SillyTavern's `promptManager` instance from `openai.js` instead of reimplementing:

```javascript
import { oai_settings, promptManager } from '../../../openai.js';

// Capture prompt order (used when creating templates)
const character = { id: currentCharId || 100000 }; // 100000 is global dummyId
const promptOrder = promptManager.getPromptOrderForCharacter(character);

// Apply prompts (used when applying templates)
promptManager.updatePrompts(promptArray);

// Update prompt order (used when applying templates)
const existingOrder = promptManager.getPromptOrderForCharacter(character);
if (existingOrder.length === 0) {
    promptManager.addPromptOrderForCharacter(character, newOrder);
} else {
    Object.assign(existingOrder, newOrder); // Mutate in place
}

// Save changes
await promptManager.saveServiceSettings();
await promptManager.render(); // Re-render UI if open
```

**Key Data Structures**:
- `oai_settings.prompts`: Array of prompt objects `[{identifier, content, ...}, ...]`
- `oai_settings.prompt_order`: Array of character-specific orders:
  ```javascript
  [{
      character_id: 100000,  // 100000 = global/default
      order: [{identifier: 'main', enabled: true}, ...]
  }, ...]
  ```

Templates store just the order array `[{identifier, enabled}, ...]`, then wrap it back into the character-specific structure when applying.

**Prompt Identifiers**: ST supports many prompt identifiers dynamically (main, jailbreak, worldInfoBefore, worldInfoAfter, charDescription, charPersonality, personaDescription, scenario, dialogueExamples, chatHistory, enhanceDefinitions, nsfw, etc.). Always preserve all prompt properties when storing/applying templates - don't filter by hardcoded identifier lists.

#### SillyTavern Popup API

**IMPORTANT**: Use `onClosing` callback to capture form values BEFORE popup DOM is removed:

```javascript
let capturedData = null;
const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
    okButton: 'OK',
    cancelButton: 'Cancel',
    onClosing: (popup) => {
        if (popup.result === POPUP_RESULT.AFFIRMATIVE) {
            // Capture form values NOW, before DOM removal
            const value = document.getElementById('my-input')?.value;
            if (!value) {
                toastr.error('Value required');
                return false; // Prevent popup from closing
            }
            capturedData = { value };
        }
        return true; // Allow popup to close
    }
});

const result = await popup.show();
// DOM is now removed, use capturedData
if (result && capturedData) {
    // Process capturedData
}
```

### Template Data Model

Templates are stored as objects with this structure:
```javascript
{
    id: 'tmpl_xxxxx',           // Unique template ID
    name: 'Template Name',       // User-visible name
    description: 'Description',  // User description
    prompts: {                   // Object keyed by identifier
        main: {
            identifier: 'main',
            content: '...',
            // ...other ST prompt properties
        },
        jailbreak: {...}
    },
    promptOrder: [               // Simple order array
        {identifier: 'main', enabled: true},
        {identifier: 'jailbreak', enabled: true}
    ],
    characterName: 'CharName',   // For display/reference only
    createdAt: '2025-01-15T...',
    updatedAt: '2025-01-15T...'
}
```

### Event Flow

1. **Extension Load** (`jQuery(async () => {...})`):
   - Initialize `PromptTemplateManager`
   - Load templates from `extension_settings`
   - Register event handlers
   - Setup UI

2. **Chat Change** (`event_types.CHAT_CHANGED`):
   - Invalidate cached context
   - Check for locked templates
   - Apply locked template if configured

3. **Character Message** (`event_types.CHARACTER_MESSAGE_RENDERED`):
   - Check for template locks
   - Optionally apply template

4. **Template Application**:
   - Convert template prompts to array
   - Call `promptManager.updatePrompts()`
   - Update prompt order via `promptManager` methods
   - Save via `promptManager.saveServiceSettings()`
   - Render UI via `promptManager.render()`

### Testing and Debugging

Manual testing only (no automated tests):
1. Load extension in SillyTavern
2. Use browser DevTools console for debugging
3. Check `extension_settings.CCPM` for stored data
4. Check `chat_metadata.ccpm_template_lock` for chat locks
5. Monitor console for `CCPM DEBUG:` and `CCPM:` log messages

Reload extension: Extensions panel → Click reload icon next to CCPromptManager