# R2V Roadmap

R2V is built incrementally. Each phase should leave the project in a usable state.

## Phase 1 — Foundation

- [x] Set up Bun + TypeScript project
- [x] Set up project structure
- [x] Add configuration system
- [x] Add environment variable handling
- [x] Add logging
- [x] Add FFmpeg integration
- [ ] Create video rendering module
- [ ] Add a test background video
- [ ] Render a basic `9:16` MP4

**Goal:** R2V can take a video and produce a properly formatted short-form video.

---

## Phase 2 — Video Pipeline

- [ ] Add audio support
- [ ] Add background video handling
- [ ] Add video trimming
- [ ] Add video cropping/scaling
- [ ] Add audio/video synchronization
- [ ] Add basic video effects
- [ ] Add video metadata

**Goal:** Build a reusable video renderer that can combine different media sources.

---

## Phase 3 — AI

- [ ] Create LLM provider interface
- [ ] Add first LLM provider
- [ ] Generate narration scripts
- [ ] Create TTS provider interface
- [ ] Add first TTS provider
- [ ] Generate voice-over audio
- [ ] Combine narration with video

**Goal:** Give R2V a piece of text and get a narrated video.

---

## Phase 4 — Captions

- [ ] Generate subtitle timestamps
- [ ] Render subtitles with FFmpeg
- [ ] Add caption styles
- [ ] Add animated captions
- [ ] Add word/phrase highlighting
- [ ] Make caption styles configurable

**Goal:** Produce videos with properly synchronized captions.

---

## Phase 5 — Reddit

- [ ] Add Reddit API integration
- [ ] Fetch posts
- [ ] Support subreddit selection
- [ ] Filter deleted/invalid posts
- [ ] Filter unwanted content
- [ ] Score stories
- [ ] Select stories automatically
- [ ] Extract title and body
- [ ] Process Reddit stories through the AI pipeline

**Goal:** R2V can automatically turn a Reddit post into a finished video.

---

## Phase 6 — Templates

- [ ] Create video template system
- [ ] Support different background styles
- [ ] Support different caption styles
- [ ] Support different narration styles
- [ ] Add intro/hook templates
- [ ] Add music
- [ ] Add configurable effects
- [ ] Add template configuration files

**Goal:** Generate different types of videos without changing the code.

---

## Phase 7 — Automation

- [ ] Generate multiple videos
- [ ] Add job queue
- [ ] Add job status tracking
- [ ] Add automatic retries
- [ ] Add generation history
- [ ] Add temporary file cleanup
- [ ] Add concurrency controls
- [ ] Add scheduled generation
- [ ] Improve error handling
- [ ] Improve logging

**Goal:** R2V can run unattended and reliably generate videos.

---

## Phase 8 — Publishing

- [ ] Create publishing provider interface
- [ ] Add OAuth account connections
- [ ] Add YouTube publishing
- [ ] Add TikTok publishing
- [ ] Add Instagram publishing
- [ ] Generate post captions
- [ ] Generate hashtags
- [ ] Add publishing schedules
- [ ] Track upload status
- [ ] Retry failed uploads

**Goal:** Go from Reddit post to published short-form video.

---

## Phase 9 — Management

- [ ] Add database
- [ ] Store stories
- [ ] Store generated videos
- [ ] Store generation jobs
- [ ] Store publishing history
- [ ] Add video management
- [ ] Add configuration management
- [ ] Add analytics

**Goal:** Keep track of everything R2V generates and publishes.

---

## Phase 10 — Web Dashboard

- [ ] Build web dashboard
- [ ] View generated videos
- [ ] View generation history
- [ ] Manage templates
- [ ] Manage providers
- [ ] Manage connected accounts
- [ ] Schedule videos
- [ ] View publishing status
- [ ] View analytics

**Goal:** Make R2V usable without the CLI.

---

## Phase 11 — Distribution

- [ ] Docker support
- [ ] Docker Compose setup
- [ ] Production configuration
- [ ] Documentation
- [ ] Example configuration
- [ ] Example templates
- [ ] Contributor documentation
- [ ] Release workflow
- [ ] Versioned releases

**Goal:** Make R2V easy for other people to self-host.

---

## MVP

The first real milestone is:

```text
Reddit post
    ↓
Story processing
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
