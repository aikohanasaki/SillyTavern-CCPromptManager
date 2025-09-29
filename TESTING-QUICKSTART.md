# CCPromptManager Testing Quick Start Guide

This guide helps you quickly start testing the CCPromptManager extension before release.

## Setup (5 minutes)

### 1. Install Extension
```bash
cd "C:\Users\ai\Aikobots Code\SillyTavern\public\scripts\extensions\third-party"
# Extension should already be at: SillyTavern-CCPromptManager/
```

### 2. Start SillyTavern
```bash
cd "C:\Users\ai\Aikobots Code\SillyTavern"
npm start
```

### 3. Verify Installation
1. Open SillyTavern in browser (http://localhost:8000)
2. Open Extensions menu (puzzle icon)
3. Verify "Prompt Templates" button appears at the top
4. Open Browser Console (F12) - verify no errors

## Quick Automated Testing (10 minutes)

### Run Test Helper Script

1. **Load the test helper:**
   - Open Browser Console (F12)
   - Go to: `C:\Users\ai\Aikobots Code\SillyTavern-CCPromptManager\test-helper.js`
   - Copy entire file contents
   - Paste into console and press Enter

2. **Run all automated tests:**
   ```javascript
   CCPM_Test.runAllTests()
   ```

3. **Review test results:**
   - Green ✓ = Passed
   - Red ✗ = Failed
   - Check console output for details

### Quick Manual Checks

After running automated tests:

1. **UI Check:**
   ```javascript
   // Templates should be visible in the UI
   ```
   - Click Extensions menu → "Prompt Templates"
   - Verify 3 sample templates appear
   - Verify all buttons are clickable

2. **Lock Check:**
   ```javascript
   CCPM_Test.getCurrentLocks()
   ```
   - Click lock icon on a template
   - Verify lock menu appears
   - Lock to character
   - Verify lock indicator appears

3. **Apply Check:**
   - Click play icon on a template
   - Verify success toast
   - Go to: Extensions → Advanced Formatting → Prompts
   - Verify prompt content changed

## Essential Testing (30 minutes)

### Test 1: Template CRUD Operations

**Create:**
1. Click "Create from Current"
2. Enter name: "My Test Template"
3. Enter description: "Testing creation"
4. Select prompt types: main, jailbreak
5. Click "Create"
6. ✓ Verify template appears in list

**Edit:**
1. Click edit icon on template
2. Change name to: "My Updated Template"
3. Click "Save"
4. ✓ Verify name updated in list

**Delete:**
1. Click delete icon on template
2. Click "Cancel" first - ✓ verify still exists
3. Click delete again, click "Delete"
4. ✓ Verify template removed

### Test 2: Template Locking

**Setup:**
```javascript
// In console: Create sample templates first
CCPM_Test.createSampleTemplates()
```

**Character Lock:**
1. Open a character chat
2. Click lock icon on "Test Template 1"
3. Click "Lock Here" for Character
4. ✓ Verify "🔒 character" appears on template
5. Switch to different character
6. ✓ Verify template NOT auto-applied
7. Switch back to first character
8. ✓ Verify template IS auto-applied

**Chat Lock:**
1. In a character chat
2. Lock "Test Template 2" to Chat
3. ✓ Verify "🔒 chat" appears
4. Create new chat with same character
5. ✓ Verify template NOT applied
6. Switch back to first chat
7. ✓ Verify template IS applied

### Test 3: Lock Priority

**Single Chat Priority (character > chat):**
```javascript
// Use console helper
CCPM_Test.testLockPriority()
```
1. Lock Template A to character
2. Lock Template B to chat
3. Reload page
4. ✓ Verify Template A is applied (character wins)

**Group Chat Priority (group > group chat > character):**
1. Open a group chat
2. Lock Template A to character
3. Lock Template B to chat
4. Lock Template C to group
5. Reload page
6. ✓ Verify Template C is applied (group wins)

### Test 4: Import/Export

**Export:**
1. Create 2-3 templates
2. Click "Export All"
3. ✓ Verify JSON file downloads
4. Open file - ✓ verify valid JSON

**Import:**
1. Delete all templates
2. Click "Import"
3. Paste exported JSON
4. Click "Import"
5. ✓ Verify templates restored

## Critical Path Testing (15 minutes)

This tests the most important user workflows:

### Workflow 1: Create and Use Template
1. ✓ Create template from current prompts
2. ✓ Apply template manually
3. ✓ Verify prompts changed in Advanced Formatting
4. ✓ Test AI generation works with new prompts

### Workflow 2: Lock Template to Character
1. ✓ Create or select template
2. ✓ Lock to character
3. ✓ Switch to different character
4. ✓ Switch back - verify auto-applies
5. ✓ Test AI generation works

### Workflow 3: Share Templates
1. ✓ Export templates to JSON
2. ✓ Import templates from JSON
3. ✓ Verify all templates work after import

## Common Issues to Check

### Issue: Extension doesn't load
- Check browser console for errors
- Verify manifest.json is valid
- Verify index.js has no syntax errors
- Check extension is in correct directory

### Issue: UI button doesn't appear
- Wait a few seconds after page load
- Check `event_types.APP_READY` is firing
- Verify `#extensionsMenu` element exists
- Check console for injection errors

### Issue: Templates don't persist
- Verify `saveMetadataDebounced()` is called
- Check `extension_settings.ccPromptManager` in console
- Verify no errors in save process
- Try manual save: reload SillyTavern

### Issue: Locks don't work
- Verify context detection: `CCPM_Test.getContext()`
- Check locks storage: `CCPM_Test.getCurrentLocks()`
- Verify lock priority: `CCPM_Test.testLockPriority()`
- Check console for lock errors

### Issue: Templates don't apply
- Verify `power_user.prompts` exists
- Check template structure: `CCPM_Test.validateTemplate(id)`
- Verify prompts appear in Advanced Formatting
- Check for `SETTINGS_UPDATED` event

## Performance Check

### Test with Many Templates
```javascript
// Create 50 templates
CCPM_Test.stressTest(50)

// Check performance
CCPM_Test.listTemplates()
```

**Verify:**
- ✓ List scrolls smoothly
- ✓ UI remains responsive
- ✓ No console errors
- ✓ Memory usage is reasonable

## Browser Compatibility

Quick check in each browser:

- [ ] **Chrome/Edge:** Core functionality works
- [ ] **Firefox:** Core functionality works
- [ ] **Safari (if available):** Core functionality works

Test:
1. Extension loads
2. Can create template
3. Can apply template
4. Can lock template
5. Import/export works

## Final Smoke Test

Before declaring testing complete:

```javascript
// Run this to verify everything still works
CCPM_Test.runAllTests()
```

Then manually:
1. ✓ Create a template
2. ✓ Apply the template
3. ✓ Lock it to character
4. ✓ Switch characters and back
5. ✓ Verify auto-applied
6. ✓ Export templates
7. ✓ Delete all templates
8. ✓ Import templates back
9. ✓ Verify everything restored

## When to Proceed to Full Testing

✓ All quick tests pass
✓ No console errors
✓ Core workflows work
✓ UI is responsive and functional

→ Proceed to full [TESTING.md](TESTING.md) checklist

## When to Stop and Fix Issues

✗ Extension doesn't load
✗ Console has errors
✗ Templates don't save/load
✗ UI is broken or unresponsive
✗ Critical features don't work

→ Fix issues before continuing

## Testing Notes

**Test Environment:**
- SillyTavern version: _______
- Browser: _______
- OS: _______
- Date: _______

**Issues Found:**
<!-- List any issues discovered during testing -->

**Status:**
☐ Pass - Ready for full testing
☐ Fail - Needs fixes before full testing