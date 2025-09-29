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
import { chat, chat_metadata, characters, groups } from '../../../../script.js';
import { saveMetadataDebounced, extension_settings } from '../../../extensions.js';
import { Popup, POPUP_TYPE } from '../../../popup.js';
import { DOMPurify, Handlebars } from '../../../../lib.js';

// Slash commands system
import { executeSlashCommands } from '../../../slash-commands.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from '../../../slash-commands/SlashCommandArgument.js';

// Utilities
import { eventSource, event_types } from '../../../../script.js';
import { renderTemplate, renderTemplateAsync } from '../../../templates.js';
```

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