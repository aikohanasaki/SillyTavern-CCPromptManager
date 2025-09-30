# Changelog

← [Back to README](README.md)

All notable changes to CCPromptManager will be documented in this file.

## [1.0.3] - 2025-09-30

### Fixed
- **Template Creation**: Now correctly captures prompt order from `promptManager.activeCharacter` instead of trying to infer from context, ensuring the displayed order is captured
- **Template Application**: Fixed full preset replacement to update both `oai_settings.prompts` (content) and `oai_settings.prompt_order` (order) completely
- **Character ID Handling**: Fixed character ID 0 being treated as falsy, now uses nullish coalescing (`??`) to handle all valid character IDs including 0
- **Multi-Character Presets**: Added support for presets with multiple character_id entries (e.g., 100000, 100001) by storing and applying the specific `promptOrderCharacterId` from template creation

### Changed
- Template application now directly replaces `oai_settings.prompts` array instead of using `updatePrompts()` for complete preset replacement behavior
- Templates now store `promptOrderCharacterId` to preserve which character ID the order was captured from
- When applying templates, `promptManager.activeCharacter.id` is updated to match the template's character ID for correct UI display

## [1.0.2] - 2025-09-30

### Added
- "Select All" and "Unselect All" buttons in template creation dialog for easier prompt selection

## [1.0.1] - 2025-09-30

### Fixed
- Added `allowVerticalScrolling: true` to all popup dialogs for improved scrollability

## [1.0.0] - 2025-09-30

### Beta Release
- **Template Library System**
  - Create templates from current prompt configuration
  - Save multiple templates with names and descriptions
  - View all templates in organized list
  - Import/Export functionality for templates

- **Hierarchical Lock System**
  - Lock templates to character, chat, group, or group chat contexts
  - User-configurable priority preferences (similar to STCL)
  - Single chat: Prefer character over chat (or vice versa)
  - Group chat: Prefer group over chat, or individual character over all
  - Visual indicators for active locks
  - Lock status display in template list

- **Auto-Apply System**
  - Three modes: Never, Ask (default), Always
  - Automatic reapplication on character/chat changes
  - Automatic reapplication on preset changes
  - User-configurable per-lock basis

- **Prompt Viewer and Editor**
  - Full prompt list display with ST's PromptManager styling
  - Inline expansion/collapse for prompt content
  - Edit prompts using ST's native edit form
  - View prompt metadata (role, injection settings)
  - Drag-and-drop reordering with handles
  - Marker prompts included for complete order control

### Technical Details
- Uses ST's `promptManager` API for all prompt operations
- Reuses ST's prompt edit form HTML via DOM cloning
- Follows ST's UI patterns and CSS conventions
- Stores data in `extension_settings` and `chat_metadata`
- jQuery UI sortable for drag-and-drop functionality

### Architecture
- `ChatContext`: Centralized context detection and caching
- `TemplateStorageAdapter`: Unified storage abstraction
- `TemplateLockResolver`: Hierarchical lock priority resolution
- `TemplateLockManager`: Lock orchestration and events
- `PromptTemplateManager`: Template CRUD and application

### Dependencies
- None (uses ST's built-in APIs and libraries)
- Compatible with latest SillyTavern staging branch

**Note**: This is the initial release of CCPromptManager. Future updates will be documented here following the Keep a Changelog format.