"""Local Kokoro TTS server for the WebTalk TTS browser extension.

Exposes /health, /voices, /tts over HTTP for the extension to call.
"""
import io

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

SAMPLE_RATE = 24000
MAX_CHARS_PER_CALL = 2000

# Kokoro ships a fixed set of named voices; id prefix encodes the pipeline
# lang_code needed to synthesize with it (e.g. "af_heart" -> lang_code "a").
VOICES = [
    {"id": "af_heart", "name": "Heart", "lang": "en-us", "gender": "female"},
    {"id": "af_bella", "name": "Bella", "lang": "en-us", "gender": "female"},
    {"id": "af_nicole", "name": "Nicole", "lang": "en-us", "gender": "female"},
    {"id": "af_sarah", "name": "Sarah", "lang": "en-us", "gender": "female"},
    {"id": "am_adam", "name": "Adam", "lang": "en-us", "gender": "male"},
    {"id": "am_michael", "name": "Michael", "lang": "en-us", "gender": "male"},
    {"id": "bf_emma", "name": "Emma", "lang": "en-gb", "gender": "female"},
    {"id": "bf_isabella", "name": "Isabella", "lang": "en-gb", "gender": "female"},
    {"id": "bm_george", "name": "George", "lang": "en-gb", "gender": "male"},
    {"id": "bm_lewis", "name": "Lewis", "lang": "en-gb", "gender": "male"},
]
VOICE_IDS = {v["id"] for v in VOICES}
LANG_CODE_BY_PREFIX = {"af": "a", "am": "a", "bf": "b", "bm": "b"}

_pipelines = {}  # lang_code -> KPipeline, lazily constructed per lang_code


def get_pipeline(lang_code: str):
    from kokoro import KPipeline

    if lang_code not in _pipelines:
        _pipelines[lang_code] = KPipeline(lang_code=lang_code)
    return _pipelines[lang_code]


app = FastAPI(title="WebTalk Kokoro TTS server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class TTSRequest(BaseModel):
    text: str
    voice: str
    speed: float = 1.0


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/voices")
def voices():
    return {"voices": VOICES}


def _synthesize(text: str, voice: str, speed: float) -> np.ndarray:
    lang_code = LANG_CODE_BY_PREFIX[voice.split("_")[0]]
    pipeline = get_pipeline(lang_code)
    chunks = []
    for _, _, audio in pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+"):
        chunks.append(audio)
    if not chunks:
        raise RuntimeError("Kokoro produced no audio for this input")
    return np.concatenate(chunks)


@app.post("/tts")
def tts(req: TTSRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must not be empty")
    if req.voice not in VOICE_IDS:
        raise HTTPException(status_code=400, detail=f"unknown voice '{req.voice}'")
    speed = max(0.5, min(2.0, req.speed))
    text = text[:MAX_CHARS_PER_CALL]

    try:
        audio = _synthesize(text, req.voice, speed)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    buf = io.BytesIO()
    sf.write(buf, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return Response(content=buf.getvalue(), media_type="audio/wav")
