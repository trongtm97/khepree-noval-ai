# Khepree Novel AI — Term Vault (Phase 7)

> Core terminology module. Local matching + candidate extraction. **No auto-promote.**

## Model fields (DTO)

| Field | DB |
|-------|-----|
| sourceText / simplified | `terms.source_simplified` |
| traditional | `terms.source_traditional` |
| pinyin | `terms.pinyin` |
| preferredTranslation | `term_translations` (is_primary=1) |
| alternativeTranslations | `term_translations` (is_primary=0) |
| type | `terms.term_type` |
| meaning | `terms.meaning` |
| scope / scopeRef | `terms.scope`, `scope_ref` |
| genre | `terms.genre` |
| confidence / status / notes | `terms.*` |
| occurrences | `terms.occurrence_count` |
| projectCount | `terms.project_count` |
| novelCount | `terms.novel_count` |

## Term types

`PERSON`, `SECT`, `LOCATION`, `CULTIVATION_LEVEL`, `TECHNIQUE`, `SKILL`, `WEAPON`, `ITEM`, `PILL`, `HERB`, `TITLE`, `ORGANIZATION`, `CREATURE`, `IDIOM`, `GENERAL`, `OTHER`

## Scope priority (TermMatcher)

1. **PROJECT + locked** (+ boost) — never overridden by GLOBAL
2. CONTEXT
3. USER
4. GENRE
5. GLOBAL

## Candidate extraction V1 (no AI)

- Chinese n-grams (2–4)
- Suffix heuristics: 宗门派宫阁, 城州山谷域, 剑刀枪鼎, 丹药草, 诀经法功术, 境阶品, 王帝尊圣神
- Frequency threshold
- Skip existing vault matches
- Stored in `term_candidates` — manual Accept/Reject only

## Review actions

Accept · Reject · Edit · Merge · Promote · Lock · bulk ops

## IPC

`term:search`, `term:reviewQueue`, `term:get`, `term:upsert`, `term:review`, `term:matchChapter`, `term:extractCandidates`, `term:listCandidates`, `term:candidateReview`, `term:import`, `term:export`

## Layout

```
src/main/terms/term-matcher.ts
src/main/terms/candidate-extractor.ts
src/main/services/term-service.ts
src/renderer/pages/TermsPage.tsx
```

Migration **005** adds `meaning`, `project_count`, `term_candidates`.
