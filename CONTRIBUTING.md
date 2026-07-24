# Contributing to MediaFlow Community

Thanks for helping improve the open-core edition.

## Scope

In scope:

- Bug fixes for Community features (download, transcribe, image, enhance, history, settings, i18n)
- Docs, tests, accessibility, performance of free tools
- Packaging / build scripts for Community

Out of scope (please do not PR here):

- Porting remaining Pro modules (creator, editor, subtitle studio, mobile bridge)
- License circumvention or telemetry secrets
- Large binary model packs

## Development

```bash
npm install
npm run dev
npm test
```

## Pull requests

1. Keep changes focused and documented.
2. Add or update tests when behavior changes.
3. Do not commit secrets, `bin/` models, or personal media samples.
