# WebTalk TTS

A lightweight, cross-browser text-to-speech extension for Firefox and Chrome that converts web page text into high-quality synthesized speech using the native Web Speech API.

## Features

- **Text Selection Reading**: Highlight any text on a webpage and have it read aloud
- **Context Menu Integration**: Right-click on selected text and choose "Speak highlighted text"
- **Keyboard Shortcut**: Press `Alt+S` to instantly speak selected text
- **Voice Selection**: Choose from all available system voices (male, female, different languages)
- **Adjustable Speed**: Control speech rate from 0.5x to 2.0x
- **Adjustable Pitch**: Fine-tune voice pitch from low to high
- **Playback Controls**: Play, pause, and stop buttons for full control
- **Progress Tracking**: Visual progress bar showing reading progress through long text
- **Smart Text Chunking**: Automatically splits long text into manageable chunks to prevent speech synthesis timeouts
- **Dark/Light Mode**: Automatically matches your system theme preference
- **Cross-Browser Support**: Works on both Firefox and Chrome (Chromium-based browsers)

## Installation

### Firefox

#### From Source (Developer Mode)

1. Clone or download this repository to your local machine
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on..."
5. Navigate to the extension folder and select the `manifest.json` file
6. The extension icon will appear in your toolbar

#### From Firefox Add-ons (Coming Soon)

The extension will be available on [Firefox Add-ons](https://addons.mozilla.org/) after review.

### Chrome / Chromium-based Browsers

#### From Source (Developer Mode)

1. Clone or download this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked"
5. Navigate to and select the extension folder (the folder containing `manifest.json`)
6. The extension icon will appear in your toolbar

#### From Chrome Web Store (Coming Soon)

The extension will be available on the [Chrome Web Store](https://chrome.google.com/webstore) after review.

## Usage

### Basic Usage

1. **Select Text**: Highlight any text on a webpage that you want to hear
2. **Trigger Speech**: Use one of these methods:
   - **Right-click** and select "Speak highlighted text" from the context menu
   - Press **Alt+S** keyboard shortcut
   - Click the extension icon and press the **Play** button

### Popup Controls

Click the extension icon in your browser toolbar to access:

- **Voice Selection**: Choose your preferred voice from the dropdown
- **Speed Slider**: Adjust how fast the text is read (0.5x - 2.0x)
- **Pitch Slider**: Adjust the voice pitch (Low - High)
- **Test Voice**: Preview your current settings with a sample phrase
- **Playback Controls**:
  - **Play**: Start reading selected text (or resume if paused)
  - **Pause**: Pause the current reading
  - **Stop**: Stop reading completely

### Progress Indicator

When reading longer text, a progress bar shows:
- Current chunk being read
- Total number of chunks
- Visual progress percentage

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+S`  | Speak selected text |

**Note**: Keyboard shortcuts can be customized in your browser's extension settings:
- Firefox: `about:addons` > Gear icon > "Manage Extension Shortcuts"
- Chrome: `chrome://extensions/shortcuts`

## Troubleshooting

### No voices available

**Problem**: The voice dropdown shows "No voices available" or "Loading voices..."

**Solution**:
- Wait a few seconds for voices to load (they load asynchronously)
- Refresh the popup by closing and reopening it
- Check that your system has text-to-speech voices installed
- On some systems, you may need to enable or install additional language packs

### Speech doesn't play

**Problem**: Clicking play or using the shortcut doesn't produce any audio

**Solution**:
1. Make sure text is selected on the page before triggering speech
2. Try refreshing the page (content script may not be loaded)
3. Check that the page isn't restricted (like `chrome://` or `about:` pages)
4. Verify your system audio is working and not muted

### Extension doesn't work on certain pages

**Problem**: The extension icon is grayed out or doesn't respond

**Solution**:
- Browser internal pages (`chrome://`, `about:`, `file://`) are restricted
- Some websites may block content scripts
- PDF viewers may not support text selection
- Try the extension on a regular webpage like a news article

### Speech cuts off or sounds robotic

**Problem**: Long text is interrupted or sounds unnatural

**Solution**:
- The extension automatically chunks text to prevent this issue
- Try reducing the speed setting
- Some voices handle long text better than others - try a different voice

### Settings aren't saved

**Problem**: Voice, speed, or pitch settings reset when reopening the popup

**Solution**:
- Settings are stored locally in your browser
- If using private/incognito mode, settings may not persist
- Try clearing the extension's storage and reconfiguring

## Technical Details

### Permissions

The extension requires minimal permissions:

- **activeTab**: Access the current tab to read selected text
- **storage**: Save your voice preferences locally
- **contextMenus**: Add the right-click menu option

### Browser Compatibility

| Browser | Minimum Version | Notes |
|---------|-----------------|-------|
| Firefox | 109+ | Full support with Manifest V3 |
| Chrome | 88+ | Full support with Manifest V3 |
| Edge | 88+ | Works as Chromium-based browser |
| Opera | 75+ | Works as Chromium-based browser |
| Brave | Latest | Works as Chromium-based browser |

### Architecture

```
webtalk-tts/
├── manifest.json        # Extension configuration (MV3)
├── icons/
│   ├── icon-16.png      # Toolbar icon (16x16)
│   └── icon-48.png      # Extension page icon (48x48)
├── popup/
│   ├── popup.html       # Settings popup UI
│   ├── popup.css        # Popup styles (cross-browser)
│   └── popup.js         # Popup logic and controls
├── scripts/
│   ├── background.js    # Service worker (context menu, shortcuts)
│   ├── content.js       # Page script (speech synthesis)
│   └── utils.js         # Text processing utilities
└── README.md            # This file
```

## Development

### Prerequisites

- A modern web browser (Firefox 109+ or Chrome 88+)
- Basic knowledge of browser extensions

### Making Changes

1. Edit the source files as needed
2. For Firefox: Go to `about:debugging` and click "Reload" on the extension
3. For Chrome: Go to `chrome://extensions` and click the refresh icon on the extension

### Testing

1. Load the extension in developer mode
2. Navigate to any webpage with text content
3. Select some text and test the various speech triggers
4. Verify settings are saved and restored correctly

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Acknowledgments

- Built using the [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- Compatible with the [WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- Follows [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/) specifications
