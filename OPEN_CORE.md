# MediaFlow Open Core matrix

Community (this repo) is intentionally **small**: everyday free tools only.

| Capability | Community source | Free to run | Official Pro app |
|------------|:----------------:|:-----------:|:----------------:|
| Single URL capture | Yes | Yes | Yes |
| History | Yes | Yes | Yes |
| Image compress / convert | Yes | Yes | Yes |
| Compress-toolbox AI upscale + cutout | Yes (via compress; no enhance page) | Yes | Yes |
| Local audio/video transcription | Yes | Yes | Yes |
| Settings + Upgrade CTA | Yes | Yes | Yes |
| Batch / playlist / queue capture | No | — | Yes |
| Dedicated AI Enhance page (超分工作台) | No | — | Yes |
| Advanced audio (Demucs / etc.) | No | — | Yes |
| Creator / Editor / Subtitle / Mobile | No | — | Yes |
| Browser extension bundle | No | — | Yes (official) |
| Signed installer + auto-update | Optional DIY | Optional DIY | Yes |
| Source license | Apache-2.0 | — | Proprietary product |

## Maintaining the split

```bash
npm run export:community
# optional: --no-bin-link  --clean
```

Do not re-introduce Pro modules into the public repository.
