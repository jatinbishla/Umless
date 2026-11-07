---
license: apache-2.0
base_model: Qwen/Qwen3.5-0.8B
language:
- en
pipeline_tag: text-generation
library_name: gguf
tags:
- dictation
- speech-to-text
- text-cleanup
- disfluency-removal
- lora
- umless
- gguf
- llama.cpp
---

# Umless Lite 0.8B, round 3 (GGUF Q4_K_M)

**Raw dictation in, the text the speaker meant out.** This is the cleanup model behind the Lite tier of [Umless](https://github.com/jatinbishla/Umless), an open-source, fully local voice-dictation app. It is [Qwen/Qwen3.5-0.8B](https://huggingface.co/Qwen/Qwen3.5-0.8B) with a LoRA fine-tune, merged and quantised to Q4_K_M for llama.cpp.

| Speech recognizer heard | Umless Lite types (this model + Umless's rules) |
|---|---|
| `Can we move the review to Thursday? No. Wait, Friday at three PM and um tell Rohan.` | `Can we move the review to Friday at 3 PM and tell Rohan?` |
| `The invoice is twelve thousand four hundred dollars all and retainage is ten percent.` | `The invoice is $12,400 and retainage is 10%.` |
| `We we need the the deck by Monday.` | `We need the deck by Monday.` |

It removes fillers (including ones a small speech recognizer mishears as words, like "uh" written as "all"), stammers and self-corrections, fixes punctuation and casing, and writes numbers as digits. It also has a formal mode, an AI-prompt mode, and a command mode (on-screen text + a spoken instruction → the text to type). It is trained to rewrite, never to answer.

## Use

`./install.sh lite` (or `umless models install lite`) in Umless downloads this file. To run it standalone with llama.cpp, use the format it was trained on:

```
<|im_start|>system
Clean up dictated text: remove fillers and stammers, keep only the corrected part of self-corrections, fix punctuation and capitalization, write numbers as digits. Change nothing else and never answer it.
mode: clean<|im_end|>
<|im_start|>user
{raw transcript}<|im_end|>
<|im_start|>assistant
<think>

</think>

```

Use greedy decoding (temperature 0) and stop at `<|im_end|>`. The other modes swap the system line; the exact strings are `SYSTEMS` in [`finetune/lite_cleanup.py`](https://github.com/jatinbishla/Umless/blob/main/finetune/lite_cleanup.py).

## Results

From Umless's benchmark (`umless bench`): recordings go through Lite's speech recognizer (Parakeet-TDT 110M) and then the cleanup model, and the output is scored against what the speaker meant. WER ignores case, punctuation, number formatting and fillers. Both models run behind the same deterministic rules (fillers, corrections, digits, question marks) and the same faithfulness guard. Apple M5, Q4_K_M, Metal.

| | Qwen3.5-0.8B base, few-shot | **This model** |
|---|---|---|
| Final WER, 11 synthetic clips | 5.7% | 5.7% |
| Final WER, the author's voice (5 read passages) | 13.6% | 14.0% |
| ↳ passage with a phrase-level correction ("…two thirty pm? Actually, no, let's make it Thursday morning") | 37.7% | **17.0%** |
| 30-case text suite (fillers, corrections, numbers, questions, styles), passes | 25/30 | 23/30 |
| Prompt size, same 13-word dictation | 575 tokens | **77 tokens** |
| Cleanup time p50, author's voice set (same machine, same run conditions) | 1,079 ms | 986 ms |

**Read this honestly:** it ties the base model on synthetic clips and is slightly behind it on the author's voice overall. It resolved the phrase-level self-correction the base model didn't, needs a 77-token prompt instead of 575, and was the best Lite model in hand-checked command-mode tasks (round 2 invented a person in a Gmail reply; round 3 didn't). It still flattens "first… second… third" into prose in prompt mode, so Umless keeps Lite on plain cleanup in AI apps.

## Training

- **Method:** LoRA (rank 16, alpha 32, dropout 0.05) on the text model's linear layers: full-attention and linear-attention projections and the MLPs. The adapter is merged into the original checkpoint (every other tensor kept), converted to GGUF and quantised to Q4_K_M with llama.cpp.
- **Run (round 3):** 1.5 epochs, effective batch 32, learning rate 2e-4, on a free Google Colab T4 (the fine-tune step takes about 90–100 minutes).
- **Data, all synthetic, no user data:**
  1. [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) writes the *clean* side: everyday messages across 39 themes, spoken requests to AI assistants with the prompt they meant, dictation with its polished formal version, and 800 command-mode examples (screen + instruction → reply). Style pairs are filtered: enumerations must stay numbered lists, questions must stay questions, qualifiers must survive.
  2. A script derives the *spoken, misheard* side from each clean message: fillers, stammers, self-corrections in several shapes (inline, "make that…", restarts, phrase-level), numbers as words, lost capitals, and the mistakes Parakeet-110M makes ("uh" heard as "all", corrections split into "Thursday? No. Wait, Friday").
  3. Because the clean text is the target, labels are exact by construction, and names are never misspelled in inputs, so the model doesn't learn to invent words it didn't hear.
- **Held out:** messages sharing a 5-word sequence with Umless's benchmark clips or reading passages are dropped.
- **History:** round 1 (4,826 pairs, 2 epochs, 71 minutes on a T4) tied the base model but deleted real words like "I'm"; round 2 added phrase-level corrections, contrastive pairs and the styles; round 3 added command mode and the style filters.
- **Code:** [`finetune/lite_cleanup.py`](https://github.com/jatinbishla/Umless/blob/main/finetune/lite_cleanup.py) and the [Colab notebook](https://github.com/jatinbishla/Umless/blob/main/finetune/Umless_Lite_finetune.ipynb) reproduce it end to end.

## Limitations

- **English only.**
- **Prompt mode flattens lists** and occasionally drops a requirement; Umless keeps Lite on plain cleanup in AI apps.
- **Can over-delete.** A real short word that looks like a misheard filler is occasionally removed; Umless's guard falls back to rule-based cleanup when output drops or adds content.
- **Synthetic speech noise.** Real accents and noisy rooms produce mistakes the noise model doesn't cover.

## License

Apache-2.0, the same as the base model.
