# R2V Roadmap

## Phase 1 — Core

- [ ] Set up Bun + TypeScript project
- [ ] Add configuration and environment variables
- [ ] Add FFmpeg integration
- [ ] Create basic video renderer
- [ ] Add a test background video
- [ ] Generate a basic MP4

## Phase 2 — AI

- [ ] Add LLM provider
- [ ] Generate narration scripts
- [ ] Add TTS provider
- [ ] Generate voice-over audio
- [ ] Combine audio and video

## Phase 3 — Captions

- [ ] Generate subtitles
- [ ] Add animated captions
- [ ] Add customizable caption styles
- [ ] Sync captions with narration

## Phase 4 — Reddit

- [ ] Add Reddit API
- [ ] Fetch posts
- [ ] Filter unwanted posts
- [ ] Select good stories
- [ ] Automatically process selected stories

## Phase 5 — Automation

- [ ] Generate multiple videos
- [ ] Add a job queue
- [ ] Add automatic retries
- [ ] Add generation history
- [ ] Add configurable video templates

## Phase 6 — Polish

- [ ] Improve story generation
- [ ] Improve voice quality
- [ ] Add music
- [ ] Add more visual effects
- [ ] Add more TTS providers
- [ ] Add more LLM providers
- [ ] Improve error handling
- [ ] Improve logging

## Phase 7 — Optional

- [ ] Web dashboard
- [ ] Scheduled generation
- [ ] Automatic publishing
- [ ] Analytics
- [ ] Docker support

---

Phase 8 — Publishing

- [ ] YouTube upload
- [ ] TikTok upload
- [ ] Instagram upload
- [ ] OAuth account connection
- [ ] Caption generation
- [ ] Hashtag generation
- [ ] Scheduling
- [ ] Upload status tracking
- [ ] Retry failed uploads

### First goal

Get this working:

```text
Reddit story
    ↓
LLM
    ↓
TTS
    ↓
Captions
    ↓
Background video
    ↓
FFmpeg
    ↓
video.mp4
```

Everything else can come after that.
