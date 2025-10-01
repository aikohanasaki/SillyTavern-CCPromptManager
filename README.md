# 📂 CCPromptManager (CCPM Extension for SillyTavern)

Advanced chat completion prompt template management extension for SillyTavern. Create, save, and lock prompt configurations per character, chat, or group with automatic reapplication on preset or character changes.

📋 **[View Changelog](CHANGELOG.md)** for detailed version history and updates.

## FAQ 
The extension is located in the Extensions menu (the magic wand 🪄 to the left of your input box). Look for the top item, "📂 Prompt Templates".

![CCPM settings location](https://github.com/aikohanasaki/imagehost/blob/main/prompt-templates.png)

## Features

### 📚 Template Library
- **Create templates** from your current prompt configuration
- **Save multiple templates** with names and descriptions
- **View all prompts** in each template with expandable details
- **Edit prompts** directly within templates using ST's native form
- **Reorder prompts** via drag-and-drop handles
- **Import/Export** templates for backup or sharing

### 🔒 Hierarchical Locking System
Lock templates to specific contexts with intelligent priority resolution:

- **Character Lock**: Apply template to all chats with a specific character
- **Chat Lock**: Apply template only to the current chat
- **Group Lock**: Apply template to all chats in a group
- **Group Chat Lock**: Apply template to specific group chat sessions

### ⚙️ Auto-Apply Modes
Control when locked templates are reapplied:

- **Never**: Manual application only
- **Ask**: Prompt before reapplying (default)
- **Always**: Automatically reapply without prompts

Auto-apply triggers on:
- Character/chat changes
- Preset changes

### ✏️ Full Editing Capabilities
- **View prompts** with inline-drawer expansion
- **Edit prompt content**, role, and injection settings
- **Reorder prompts** in templates via drag handles
- **Markers included** for complete prompt order control
- Uses ST's native prompt editor for consistency

## Usage

### Creating Templates

1. Configure your prompts in ST's Prompt Manager as desired
2. Click the **Extensions** menu → **CCPromptManager**
3. Click **Create from Current**
4. Enter a name and optional description
5. Template is saved with all prompt content and order

### Locking Templates

1. Open CCPromptManager from Extensions menu
2. Click the **🔒 Lock** icon on any template
3. Check the contexts where you want this template active:
   - ✅ **Character**: Locks to current character (all chats)
   - ✅ **Chat**: Locks to current chat only
   - ✅ **Group**: Locks to current group (all chats)
4. Set your **auto-apply preference**:
   - **Never**: Won't reapply automatically
   - **Ask**: Prompts before reapplying (recommended)
   - **Always**: Auto-reapplies silently

### Viewing and Editing Prompts

1. Open CCPromptManager
2. Click the **✏️ Pencil** icon on a template
3. **View**: Click prompt names to expand/collapse content
4. **Edit**: Click the small pencil icon next to each prompt name
5. **Reorder**: Drag prompts by the ☰ handle
6. Click **Save Order** to persist changes

### Applying Templates

**Manual Application**:
- Click the **▶️ Play** icon on any template

**Automatic Application**:
- Locked templates apply automatically based on your auto-apply mode
- Triggers: switching characters, chats, or presets

### Managing Templates

- **▶️ Apply**: Apply current template
- **✏️ Edit**: View/Edit template and prompts in the template
- **🔒 Lock**: Set up template locking
- **🗑️ Delete**: Remove template permanently
- **📥 Import**: Import previously exported templates
- **📤 Export**: Export single template or all templates

## 📋 Version History

For detailed information about changes, updates, and new features in each version, see the [Changelog](CHANGELOG.md).

---

*Made with love (and Claude Sonnet 4.5)* 🤖
