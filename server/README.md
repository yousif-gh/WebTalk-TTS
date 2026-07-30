# WebTalk Kokoro TTS server

Local backend that the WebTalk TTS extension talks to over HTTP. Wraps the
[Kokoro](https://github.com/hexgrad/kokoro) TTS model behind a small FastAPI app.

## Prereqs

- Python 3.10+
- `espeak-ng` system package (Kokoro's phonemizer needs it)
  - Debian/Ubuntu: `sudo apt-get install espeak-ng`
  - macOS: `brew install espeak-ng`
  - Windows: install the `.msi` from the [espeak-ng releases page](https://github.com/espeak-ng/espeak-ng/releases)

## Run

```bash
./run.sh
```

This creates a venv, installs dependencies, and starts the server on
`http://127.0.0.1:8008`.

Or manually:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8008
```

The first request after starting the server will be slow — Kokoro downloads
and loads its model weights on first use. Subsequent requests are fast.

**The server must stay running** for the extension to work. There is no
fallback to the browser's built-in speech engine if it's down.

## Endpoints

- `GET /health` — `{"status": "ok"}`
- `GET /voices` — list of available voice ids/names/languages
- `POST /tts` — `{"text": str, "voice": str, "speed": float}` → `audio/wav` bytes
