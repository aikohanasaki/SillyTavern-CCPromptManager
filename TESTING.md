# CCPromptManager Testing Plan

## Pre-Release Testing Checklist

This document provides a comprehensive testing plan for the CCPromptManager extension before release. Test each section thoroughly and check off completed items.

## Test Environment Setup

### Prerequisites
- [ ] SillyTavern instance running locally
- [ ] Extension installed in `public/scripts/extensions/third-party/SillyTavern-CCPromptManager/`
- [ ] At least 2 test characters created
- [ ] At least 1 test group created
- [ ] Test chats available for both single and group scenarios

### Installation Verification
- [ ] Extension loads without errors in browser console
- [ ] "Prompt Templates" button appears in Extensions menu
- [ ] No console errors on page load
- [ ] Extension settings initialized in `extension_settings.ccPromptManager`

---

## 1. Template Management (CRUD Operations)

### 1.1 Template Creation
- [ ] **Create from current prompts**
  - [ ] Open Prompt Templates manager
  - [ ] Click "Create from Current"
  - [ ] Enter template name
  - [ ] Enter template description
  - [ ] Select specific prompts (main, nsfw, jailbreak, etc.)
  - [ ] Verify template appears in list
  - [ ] Verify template has correct prompt count
  - [ ] Verify creation date is displayed

- [ ] **Edge cases**
  - [ ] Try creating template with empty name (should show error)
  - [ ] Try creating template with no prompts selected (should show error)
  - [ ] Create template with very long name (100+ characters)
  - [ ] Create template with special characters in name
  - [ ] Create template when no prompts exist in SillyTavern

### 1.2 Template Editing
- [ ] **Basic editing**
  - [ ] Click edit button on a template
  - [ ] Change template name
  - [ ] Change template description
  - [ ] Save changes
  - [ ] Verify changes persist in list
  - [ ] Verify updatedAt timestamp changes

- [ ] **Edge cases**
  - [ ] Edit template name to empty string (should show error)
  - [ ] Edit template with very long description (1000+ characters)
  - [ ] Edit template that is currently locked
  - [ ] Edit template that is currently applied

### 1.3 Template Deletion
- [ ] **Basic deletion**
  - [ ] Click delete button on a template
  - [ ] Verify confirmation dialog appears
  - [ ] Cancel deletion - verify template still exists
  - [ ] Confirm deletion - verify template is removed
  - [ ] Verify success toast notification

- [ ] **Edge cases**
  - [ ] Delete template that is currently locked to character
  - [ ] Delete template that is currently locked to chat
  - [ ] Delete template that is currently locked to group
  - [ ] Delete template that is currently applied
  - [ ] Attempt to apply deleted template (should show error)

### 1.4 Template List Display
- [ ] **Visual verification**
  - [ ] Templates display in proper card layout
  - [ ] Template names are clearly visible
  - [ ] Descriptions display correctly
  - [ ] Prompt count is accurate
  - [ ] Created date is formatted properly
  - [ ] Action buttons are all visible and properly aligned
  - [ ] Lock status indicators display correctly

- [ ] **With many templates**
  - [ ] Create 10+ templates
  - [ ] Verify list scrolls properly
  - [ ] Verify performance is acceptable
  - [ ] Verify no UI overflow issues

---

## 2. Template Application

### 2.1 Manual Template Application
- [ ] **Apply to prompts**
  - [ ] Create a template with specific prompt content
  - [ ] Apply template to SillyTavern
  - [ ] Verify success toast notification
  - [ ] Check Advanced Formatting > Prompts section
  - [ ] Verify prompt content matches template
  - [ ] Verify all selected prompt identifiers were applied
  - [ ] Verify SETTINGS_UPDATED event is triggered

- [ ] **Multiple applications**
  - [ ] Apply template A
  - [ ] Verify prompts match template A
  - [ ] Apply template B
  - [ ] Verify prompts now match template B (overwrite)

- [ ] **Edge cases**
  - [ ] Apply template with empty prompt content
  - [ ] Apply template with only one prompt type
  - [ ] Apply template with all prompt types
  - [ ] Apply same template multiple times
  - [ ] Apply template while generation is in progress

---

## 3. Template Import/Export

### 3.1 Export Functionality
- [ ] **Export all templates**
  - [ ] Click "Export All" button
  - [ ] Verify file download is triggered
  - [ ] Verify filename format: `ccpm-templates-YYYY-MM-DD.json`
  - [ ] Open downloaded file
  - [ ] Verify JSON structure is valid
  - [ ] Verify all templates are included
  - [ ] Verify all template properties are exported (id, name, description, prompts, timestamps)

- [ ] **Export with no templates**
  - [ ] Delete all templates
  - [ ] Click "Export All"
  - [ ] Verify warning toast appears

### 3.2 Import Functionality
- [ ] **Import valid templates**
  - [ ] Export templates from another instance
  - [ ] Click "Import" button
  - [ ] Paste valid JSON data
  - [ ] Verify success toast with count
  - [ ] Verify imported templates appear in list
  - [ ] Verify all properties preserved

- [ ] **Import edge cases**
  - [ ] Import empty array `[]` (should succeed with 0 templates)
  - [ ] Import single template object (not array)
  - [ ] Import invalid JSON (should show error)
  - [ ] Import JSON with missing required fields
  - [ ] Import very large template data (10+ templates)
  - [ ] Import template with duplicate ID
  - [ ] Import with no data pasted (should show error)

---

## 4. Template Locking System

### 4.1 Character-Level Locking
- [ ] **Lock to character**
  - [ ] Switch to a character chat
  - [ ] Open a template's lock menu
  - [ ] Verify "Character" lock target is available
  - [ ] Lock template to character
  - [ ] Verify success toast
  - [ ] Verify lock status appears on template card
  - [ ] Verify lock indicator shows "🔒 character"

- [ ] **Character lock persistence**
  - [ ] Lock template to Character A
  - [ ] Switch to Character B
  - [ ] Verify lock doesn't apply
  - [ ] Switch back to Character A
  - [ ] Verify template is still locked
  - [ ] Verify lock indicator shows as active

- [ ] **Character lock unlocking**
  - [ ] Open lock menu for locked template
  - [ ] Click "Unlock" for character target
  - [ ] Verify success toast
  - [ ] Verify lock indicator removed
  - [ ] Switch between chats - verify template no longer auto-applies

### 4.2 Chat-Level Locking
- [ ] **Lock to single chat**
  - [ ] Open a character chat
  - [ ] Lock template to chat
  - [ ] Verify success toast
  - [ ] Verify lock status shows "🔒 chat"

- [ ] **Chat lock persistence**
  - [ ] Lock template to Chat A
  - [ ] Create new chat with same character
  - [ ] Verify lock doesn't apply
  - [ ] Switch back to Chat A
  - [ ] Verify template is still locked

- [ ] **Chat lock unlocking**
  - [ ] Open lock menu
  - [ ] Unlock chat target
  - [ ] Verify lock removed
  - [ ] Verify no auto-apply on chat switch

### 4.3 Group-Level Locking
- [ ] **Lock to group**
  - [ ] Switch to a group chat
  - [ ] Lock template to group
  - [ ] Verify success toast
  - [ ] Verify lock status shows "🔒 group"
  - [ ] Verify both "group" and "chat" targets available

- [ ] **Group lock persistence**
  - [ ] Lock template to Group A
  - [ ] Switch to Group B
  - [ ] Verify lock doesn't apply
  - [ ] Switch back to Group A
  - [ ] Verify template is still locked

- [ ] **Group chat lock (specific group chat instance)**
  - [ ] In a group, lock template to "chat" (group chat instance)
  - [ ] Create new group chat session
  - [ ] Verify lock doesn't apply
  - [ ] Switch back to original group chat
  - [ ] Verify template is locked

### 4.4 Lock Priority Resolution
- [ ] **Single chat priority: character > chat**
  - [ ] Lock Template A to character
  - [ ] Lock Template B to chat
  - [ ] Reload/switch chat
  - [ ] Verify Template A is applied (character wins)
  - [ ] Clear character lock
  - [ ] Verify Template B is now applied (chat wins)

- [ ] **Group chat priority: group > group chat > character**
  - [ ] In a group chat, lock Template A to character
  - [ ] Lock Template B to chat (group chat)
  - [ ] Lock Template C to group
  - [ ] Reload/switch chat
  - [ ] Verify Template C is applied (group wins)
  - [ ] Clear group lock
  - [ ] Verify Template B is applied (group chat wins)
  - [ ] Clear group chat lock
  - [ ] Verify Template A is applied (character wins)

### 4.5 Lock Conflicts
- [ ] **Multiple locks on same target**
  - [ ] Lock Template A to character
  - [ ] Attempt to lock Template B to same character
  - [ ] Verify warning about existing lock
  - [ ] Lock Template B anyway
  - [ ] Verify Template A lock is replaced
  - [ ] Verify only Template B shows as locked

---

## 5. Auto-Apply Settings

### 5.1 Auto-Apply Mode: "auto"
- [ ] **Set mode to auto**
  - [ ] Open extension settings
  - [ ] Set `autoApplyLocked` to "auto"
  - [ ] Lock a template to current character
  - [ ] Switch to different character
  - [ ] Switch back to character with locked template
  - [ ] Verify template is automatically applied
  - [ ] Verify no prompt dialog appears
  - [ ] Check prompts in Advanced Formatting
  - [ ] Verify prompt content matches locked template

### 5.2 Auto-Apply Mode: "ask"
- [ ] **Set mode to ask**
  - [ ] Set `autoApplyLocked` to "ask"
  - [ ] Lock a template to current character
  - [ ] Switch to different character
  - [ ] Switch back to character with locked template
  - [ ] Verify confirmation dialog appears
  - [ ] Verify dialog shows template name and source
  - [ ] Click "Apply" - verify template is applied
  - [ ] Repeat test, click "Skip" - verify template is NOT applied

### 5.3 Auto-Apply Mode: "never"
- [ ] **Set mode to never**
  - [ ] Set `autoApplyLocked` to "never"
  - [ ] Lock a template to current character
  - [ ] Switch to different character
  - [ ] Switch back to character with locked template
  - [ ] Verify NO dialog appears
  - [ ] Verify template is NOT auto-applied
  - [ ] Templates can still be applied manually

---

## 6. Context Detection

### 6.1 Single Character Chat
- [ ] **Context detection**
  - [ ] Open a single character chat
  - [ ] Open template lock menu
  - [ ] Verify "Character" target available
  - [ ] Verify "Chat" target available
  - [ ] Verify "Group" target NOT available
  - [ ] Verify correct character name displayed
  - [ ] Verify correct chat name/ID displayed

### 6.2 Group Chat
- [ ] **Group context detection**
  - [ ] Open a group chat
  - [ ] Open template lock menu
  - [ ] Verify "Character" target available (for primary character)
  - [ ] Verify "Chat" target available (group chat instance)
  - [ ] Verify "Group" target available
  - [ ] Verify correct group name displayed
  - [ ] Verify correct context names for each target

### 6.3 Context Edge Cases
- [ ] **Special character names**
  - [ ] Test with character name containing special characters
  - [ ] Test with character name containing unicode
  - [ ] Test with very long character name

- [ ] **System/neutral characters**
  - [ ] Test context when `name2` is system user
  - [ ] Test context when `name2` is neutral character
  - [ ] Verify fallback to chat metadata character name

---

## 7. Event Handling

### 7.1 Core Events
- [ ] **CHAT_CHANGED event**
  - [ ] Lock template to character
  - [ ] Switch between different chats
  - [ ] Verify handleChatChange is called
  - [ ] Verify locks are reloaded
  - [ ] Verify auto-apply logic executes

- [ ] **SETTINGS_UPDATED event**
  - [ ] Create templates
  - [ ] Modify extension settings externally
  - [ ] Verify templates reload from settings

- [ ] **APP_READY event**
  - [ ] Reload SillyTavern
  - [ ] Verify extension initializes
  - [ ] Verify UI button is injected
  - [ ] Verify event handlers registered

### 7.2 Extended Events
- [ ] **GROUP_CHAT_CREATED event**
  - [ ] Create a new group chat
  - [ ] Verify event handler executes
  - [ ] Check console for log message

- [ ] **GROUP_MEMBER_DRAFTED event**
  - [ ] Draft a member in group chat
  - [ ] Verify event handler executes
  - [ ] Check console for character ID

- [ ] **GENERATION_STARTED/ENDED events**
  - [ ] Trigger AI generation
  - [ ] Verify event handlers execute
  - [ ] Check console for log messages

---

## 8. UI/UX Testing

### 8.1 Visual Design
- [ ] **Template manager modal**
  - [ ] Modal opens properly centered
  - [ ] Modal is wide enough for content
  - [ ] Title is clear and visible
  - [ ] Toolbar buttons are accessible
  - [ ] Close button works

- [ ] **Template cards**
  - [ ] Cards have proper spacing
  - [ ] Border and background colors are theme-appropriate
  - [ ] Hover effects work smoothly
  - [ ] Action buttons are properly aligned
  - [ ] Lock indicators are clearly visible
  - [ ] Active/effective template highlighting works

- [ ] **Forms and dialogs**
  - [ ] Input fields are properly sized
  - [ ] Labels are clear and readable
  - [ ] Textarea resizes vertically
  - [ ] Checkboxes align properly
  - [ ] Buttons have proper styling

### 8.2 Responsive Behavior
- [ ] **Different viewport sizes**
  - [ ] Test at 1920x1080 (desktop)
  - [ ] Test at 1366x768 (laptop)
  - [ ] Test at 1024x768 (small screen)
  - [ ] Verify modal doesn't overflow
  - [ ] Verify buttons don't wrap awkwardly

### 8.3 Theme Compatibility
- [ ] **Test with different SillyTavern themes**
  - [ ] Default theme
  - [ ] Dark theme variants
  - [ ] Light theme variants
  - [ ] Custom themes if available
  - [ ] Verify CSS variables work correctly
  - [ ] Verify text is always readable

### 8.4 Accessibility
- [ ] **Keyboard navigation**
  - [ ] Tab through form fields
  - [ ] Enter/Space activates buttons
  - [ ] Escape closes dialogs

- [ ] **Screen reader support**
  - [ ] Button titles/tooltips present
  - [ ] Form labels properly associated
  - [ ] Status messages announced

---

## 9. Error Handling

### 9.1 Graceful Degradation
- [ ] **Missing dependencies**
  - [ ] Test with `power_user.prompts` undefined
  - [ ] Test with `extension_settings` undefined
  - [ ] Verify fallback behavior
  - [ ] Verify error messages are user-friendly

### 9.2 Error Messages
- [ ] **User-facing errors**
  - [ ] Try to apply non-existent template
  - [ ] Try to lock template in invalid context
  - [ ] Try to import malformed JSON
  - [ ] Verify toastr error notifications appear
  - [ ] Verify error messages are descriptive

### 9.3 Console Logging
- [ ] **Debug information**
  - [ ] Enable verbose console logging
  - [ ] Verify initialization messages
  - [ ] Verify state change messages
  - [ ] Verify no unnecessary logging in production

---

## 10. Data Persistence

### 10.1 Extension Settings
- [ ] **Settings storage**
  - [ ] Create multiple templates
  - [ ] Verify saved in `extension_settings.ccPromptManager.templates`
  - [ ] Verify debounced save is called
  - [ ] Reload SillyTavern
  - [ ] Verify templates persist across reload

### 10.2 Lock Storage
- [ ] **Character locks**
  - [ ] Lock template to character
  - [ ] Reload SillyTavern
  - [ ] Verify lock persists
  - [ ] Verify stored in `extension_settings.ccPromptManager.templateLocks.character`

- [ ] **Chat locks**
  - [ ] Lock template to chat
  - [ ] Reload SillyTavern
  - [ ] Verify lock persists
  - [ ] Verify stored in `chat_metadata.CCPM.templateLock`

- [ ] **Group locks**
  - [ ] Lock template to group
  - [ ] Reload SillyTavern
  - [ ] Verify lock persists
  - [ ] Verify stored in `group.ccpm_template_lock`

### 10.3 Migration/Compatibility
- [ ] **Version upgrades**
  - [ ] Test with no existing settings (first install)
  - [ ] Test with legacy boolean `autoApplyLocked` value
  - [ ] Verify migration to new setting format
  - [ ] Verify backward compatibility

---

## 11. Performance Testing

### 11.1 Load Testing
- [ ] **Large datasets**
  - [ ] Create 50+ templates
  - [ ] Measure list render time
  - [ ] Verify no UI lag
  - [ ] Test search/filter if implemented

- [ ] **Rapid operations**
  - [ ] Rapidly create/delete templates
  - [ ] Rapidly switch between chats
  - [ ] Verify no memory leaks
  - [ ] Check browser performance tools

### 11.2 Caching
- [ ] **Context caching**
  - [ ] Verify cache TTL (1000ms) works
  - [ ] Verify cache invalidation on context change
  - [ ] Check cache behavior with rapid switching

---

## 12. Integration Testing

### 12.1 SillyTavern Integration
- [ ] **Prompt system integration**
  - [ ] Verify prompts appear in Advanced Formatting
  - [ ] Verify prompts work in actual generation
  - [ ] Test with different LLM APIs
  - [ ] Verify injection positions are respected

- [ ] **Extension interoperability**
  - [ ] Test with other prompt-related extensions
  - [ ] Verify no conflicts with other extensions
  - [ ] Test load order dependency (if any)

### 12.2 Multi-User/Multi-Device
- [ ] **Setting synchronization**
  - [ ] Use SillyTavern with cloud storage
  - [ ] Create templates on Device A
  - [ ] Open SillyTavern on Device B
  - [ ] Verify templates sync properly

---

## 13. Edge Cases & Stress Tests

### 13.1 Boundary Conditions
- [ ] **Empty states**
  - [ ] No templates exist
  - [ ] No prompts in SillyTavern
  - [ ] No characters exist
  - [ ] No chats exist

- [ ] **Maximum values**
  - [ ] Template name at max length
  - [ ] Template description at max length
  - [ ] Very long prompt content
  - [ ] Many prompt identifiers

### 13.2 Concurrent Operations
- [ ] **Race conditions**
  - [ ] Rapidly lock/unlock templates
  - [ ] Apply template while generation in progress
  - [ ] Switch context during template application
  - [ ] Delete template while locked

---

## 14. Browser Compatibility

### 14.1 Modern Browsers
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest, macOS)
- [ ] Opera (latest)

### 14.2 Browser Features
- [ ] LocalStorage availability
- [ ] ES6 module support
- [ ] Async/await support
- [ ] File download functionality

---

## 15. Documentation & Code Quality

### 15.1 Code Review
- [ ] **Code quality**
  - [ ] Run ESLint (SillyTavern config)
  - [ ] Fix all linting errors
  - [ ] Fix all linting warnings
  - [ ] Verify no console errors

- [ ] **Code organization**
  - [ ] Class structure is clean
  - [ ] Functions are well-named
  - [ ] Comments are accurate and helpful
  - [ ] No dead code

### 15.2 Documentation
- [ ] **User documentation**
  - [ ] README.md is complete
  - [ ] Usage instructions are clear
  - [ ] Screenshots/examples provided
  - [ ] Installation steps documented

- [ ] **Developer documentation**
  - [ ] CLAUDE.md is accurate
  - [ ] API methods documented
  - [ ] Event handlers documented
  - [ ] Architecture explained

---

## 16. Pre-Release Checklist

### 16.1 Final Verification
- [ ] All critical tests pass
- [ ] No console errors in production
- [ ] Version number updated in manifest.json
- [ ] Changelog updated
- [ ] README.md reviewed and updated
- [ ] LICENSE file present
- [ ] .gitignore configured properly

### 16.2 Release Preparation
- [ ] Create release branch
- [ ] Tag release version
- [ ] Generate release notes
- [ ] Test installation from GitHub URL
- [ ] Test auto-update functionality

---

## Test Results Summary

### Critical Issues (Must Fix)
- [ ] None found / List issues here

### Major Issues (Should Fix)
- [ ] None found / List issues here

### Minor Issues (Nice to Fix)
- [ ] None found / List issues here

### Notes
<!-- Add any testing notes, observations, or recommendations here -->

---

## Testing Sign-Off

- **Tester Name:** _________________
- **Date:** _________________
- **Build/Version:** _________________
- **Overall Status:** ☐ Pass ☐ Pass with Issues ☐ Fail

**Comments:**
<!-- Final comments and recommendations -->