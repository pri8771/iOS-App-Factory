# Decisions

## DEC-001 — Project registration

- **Status:** accepted
- **Context:** This repository is governed by the App Factory standards.
- **Decision:** Use `.factory/project-context.json` as the authoritative project classification marker.
- **Consequences:** Agents must read the registration and quality files before coding.

## DEC-002 — Product priority

- **Status:** accepted
- **Context:** The app shell is more complete than the verified value loop.
- **Decision:** Prioritize a credible scan/import-to-export outcome before challenges, templates, or paywall optimization.
- **Consequences:** Secondary features cannot be used as evidence that the MVP is complete.

## DEC-003 — Analysis honesty

- **Status:** accepted
- **Context:** A real classifier model is not bundled and fallback heuristics are active.
- **Decision:** Distinguish measured Vision/image signals, heuristic conclusions, and unavailable signals in product copy and QA.
- **Consequences:** “AI” claims must match the shipping analysis pipeline.

## DEC-004 — MobileCLIP cannot ship (resolves `AURA-LEG-002`)

- **Status:** accepted — 2026-07-28
- **Context:** CR-001 bundled Apple's MobileCLIP-S0 image encoder from
  `huggingface.co/apple/coreml-mobileclip`. The Hugging Face card declares
  `license: other`, `license_name: apple-ascl`. The linked file is stale; the governing text
  is `LICENSE_MODELS` in `github.com/apple/ml-mobileclip` — the **Apple Machine Learning
  Research Model License Agreement**.
- **Finding:** the licence grants use *"exclusively for Research Purposes"*, and defines the
  term explicitly:

  > "Research Purposes" means non-commercial scientific research and academic development
  > activities... **"Research Purposes" does not include any commercial exploitation, product
  > development or use in any commercial product or service.**

  AuraFit is a commercial product with a subscription. Shipping these weights would breach the
  licence. This is not a risk to weigh — it is a line not to cross. The same licence family
  (`apple-amlr`) covers MobileCLIP2, so a version bump does not solve it.
- **Decision:** **Remove MobileCLIP from the shipping app.** Replace it with a
  permissively-licensed encoder (see `AURA-ENG-038`) or ship v1.0 on the heuristic path.
- **Alternatives evaluated:** LAION OpenCLIP ViT-B-32 (**MIT**) — the leading candidate;
  Google SigLIP (**Apache-2.0**); OpenAI CLIP (repo is MIT but the weights carry no explicit
  licence on the model card — less clean). Existing third-party Core ML conversions of these
  exist but are unofficial and low-provenance; convert from source weights instead.
- **Consequences:** the CLIP work is not wasted — `CLIPZeroShotClassifier`, the label-embedding
  pipeline in `tools/clip/`, the person-crop, and the photo-issue label group are all
  encoder-agnostic. What must change is the bundled encoder and the regenerated embeddings
  (the text encoder must match the image encoder). Expect a bundle-size increase:
  MobileCLIP-S0's image encoder is 22MB; ViT-B-32 is ~175MB at fp16 and needs palettization to
  land near 45–65MB. `tools/clip/README.md`'s licence warning was correct and is now resolved
  against us.
