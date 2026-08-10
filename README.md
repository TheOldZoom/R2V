# R2V

> Reddit to Video.

R2V is an open-source tool that automatically turns Reddit stories into short-form videos.

# Stack

- Bun
- Typescript
- FFmpeg
- Reddit API
- LLM
- TTS

# Whisper captions

R2V sends the generated narration to your Whisper server and uses its
word-level timings as the captions. Configure your docker-whisper server with
`WHISPER_WORD_TIMESTAMPS=true`, then set these R2V variables if necessary:

```text
WHISPER_BASE_URL=http://127.0.0.1:9000
WHISPER_API_KEY=optional-server-token
WHISPER_MODEL=whisper-1
WHISPER_LANGUAGE=en
```

`CAPTION_TIMING_OFFSET_SECONDS` can make a small global adjustment (for
example, `-0.12` renders every caption 120 ms earlier).

# License

[AGPL-3.0](./LICENSE)
