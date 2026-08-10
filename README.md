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

## Reddit source

R2V uses Chocodata for Reddit post retrieval, so the pipeline does not need
Reddit OAuth credentials. Set `CHOCODATA_API_KEY` in `.env`; the key is sent
only to Chocodata. `REDDIT_LISTING` supports `hot`, `new`, and `top`, while
`REDDIT_TOP_TIMEFRAME` controls the `top` window.
The listing is followed by detail requests for up to `CHOCODATA_DETAIL_LIMIT`
highest-ranked posts so story bodies/comments are available without fetching
every post in full.

# License

[AGPL-3.0](./LICENSE)
