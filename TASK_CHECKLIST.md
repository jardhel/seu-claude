# seu-claude Task Checklist

**Status Legend:** ⬜ Not Started | 🔄 In Progress | ✅ Done | ❌ Blocked

---

## 🔴 Day 1: Critical Bug Fixes

### Build Issues

- [x] ✅ Fix `ignore` module import in `src/indexer/crawler.ts`
- [x] ✅ Run `npm run build` - must complete without errors
- [x] ✅ Run `npm test` - all 20 tests must pass
- [ ] ⬜ Run `npm start` - server must start without crashes

### Verification

- [ ] ⬜ Test `npm run download-grammars`
- [ ] ⬜ Verify TypeScript, JavaScript, Python grammars download
- [ ] ⬜ Manual test: create test project, index, search

---

## 🟡 Days 2-4: Production Hardening

### Worker Threads (Day 2)

- [ ] ⬜ Create `src/workers/embed-worker.ts`
- [ ] ⬜ Create `src/workers/parse-worker.ts`
- [ ] ⬜ Refactor `EmbeddingEngine.embedBatch()` to use worker
- [ ] ⬜ Refactor `ASTParser.parseFile()` to use worker
- [ ] ⬜ Add worker pool with configurable concurrency
- [ ] ⬜ Test: indexing doesn't block MCP responses

### Security (Day 3)

- [ ] ⬜ Create `src/utils/secrets.ts`
- [ ] ⬜ Implement secret pattern detection
- [ ] ⬜ Implement secret redaction before embedding
- [ ] ⬜ Add path traversal prevention to crawler
- [ ] ⬜ Verify no network calls after model download
- [ ] ⬜ Add security audit to CI

### Error Handling & Resources (Day 4)

- [ ] ⬜ Add retry logic with exponential backoff
- [ ] ⬜ Add corruption detection in VectorStore
- [ ] ⬜ Add auto-rebuild capability
- [ ] ⬜ Add memory monitoring utility
- [ ] ⬜ Add CPU throttling option
- [ ] ⬜ Verify no zombie processes on shutdown

---

## 🟢 Days 5-7: Comprehensive Testing

### Unit Tests (Day 5)

- [ ] ⬜ Create `src/__tests__/indexer/crawler.test.ts`
- [ ] ⬜ Create `src/__tests__/indexer/parser.test.ts`
- [ ] ⬜ Create `src/__tests__/indexer/chunker.test.ts`
- [ ] ⬜ Create `src/__tests__/vector/embed.test.ts`
- [ ] ⬜ Create `src/__tests__/vector/store.test.ts`
- [ ] ⬜ Create `src/__tests__/tools/index-codebase.test.ts`
- [ ] ⬜ Create `src/__tests__/tools/search-codebase.test.ts`
- [ ] ⬜ Create `src/__tests__/tools/read-context.test.ts`
- [ ] ⬜ Achieve 90%+ test coverage

### Integration Tests (Day 6)

- [ ] ⬜ Create `src/__tests__/integration/full-pipeline.test.ts`
- [ ] ⬜ Test: Fresh index of multi-language project
- [ ] ⬜ Test: Incremental re-index after file changes
- [ ] ⬜ Test: Search accuracy with known queries
- [ ] ⬜ Test: Context reading returns correct code

### Benchmark Tests (Day 7)

- [ ] ⬜ Create `benchmarks/performance.ts`
- [ ] ⬜ Create `benchmarks/memory.ts`
- [ ] ⬜ Create `benchmarks/query-latency.ts`
- [ ] ⬜ Benchmark: 5,000 file indexing < 5 min
- [ ] ⬜ Benchmark: Query latency p99 < 100ms
- [ ] ⬜ Benchmark: Peak RAM < 800MB during indexing
- [ ] ⬜ Benchmark: Idle RAM < 100MB

---

## 🔵 Days 8-10: Real-World Validation

### Claim Validation (Day 8)

- [ ] ⬜ **Claim 1**: Index 500-file project, search for unseen code
- [ ] ⬜ **Claim 2**: Record idle RAM usage (target < 200MB)
- [ ] ⬜ **Claim 3**: Fresh npm install without Python
- [ ] ⬜ **Claim 4**: 100x start/stop, verify no zombies
- [ ] ⬜ Create `scripts/collect-evidence.sh`

### Real Codebase Testing (Day 9)

- [ ] ⬜ Test on Express.js repository
- [ ] ⬜ Test on FastAPI repository (Python)
- [ ] ⬜ Test on Rocket repository (Rust)
- [ ] ⬜ Stress test on large TypeScript codebase

### Demo Video (Day 10)

- [ ] ⬜ Script the 2-minute demo
- [ ] ⬜ Record terminal demo (asciinema or OBS)
- [ ] ⬜ Record RAM comparison screenshots
- [ ] ⬜ Edit and add text overlays
- [ ] ⬜ Export as MP4 and GIF

---

## 📝 Days 11-12: Documentation Excellence

### README Update (Day 11)

- [ ] ⬜ Create hero banner/logo
- [ ] ⬜ Add animated demo GIF
- [ ] ⬜ Add benchmark results with proof
- [ ] ⬜ Add comparison table vs. alternatives
- [ ] ⬜ Update installation instructions
- [ ] ⬜ Add troubleshooting section

### Additional Docs (Day 12)

- [ ] ⬜ Create `docs/ARCHITECTURE.md`
- [ ] ⬜ Create `docs/BENCHMARKS.md`
- [ ] ⬜ Create `docs/COMPARISON.md`
- [ ] ⬜ Create `docs/SECURITY.md`
- [ ] ⬜ Create `docs/TROUBLESHOOTING.md`
- [ ] ⬜ Create `docs/API.md`
- [ ] ⬜ Update `CONTRIBUTING.md`

### Visual Assets

- [ ] ⬜ Architecture diagram (Mermaid)
- [ ] ⬜ Benchmark charts
- [ ] ⬜ Social preview image (1200x630)

---

## 🔧 Day 13: CI/CD & Release Pipeline

### GitHub Actions

- [x] ✅ Create `.github/workflows/ci.yml`
- [x] ✅ Create `.github/workflows/release.yml`
- [ ] ⬜ Set up Codecov integration
- [ ] ⬜ Add benchmark tracking

### GitHub Repository Setup

- [ ] ⬜ Add topics: `claude`, `mcp`, `rag`, `semantic-search`, `ai-tools`
- [ ] ⬜ Set up social preview image
- [x] ✅ Create issue templates
- [x] ✅ Create PR template
- [ ] ⬜ Configure branch protection

### Release Prep

- [ ] ⬜ Update version to 1.0.0 in package.json
- [ ] ⬜ Create CHANGELOG.md
- [ ] ⬜ Verify npm package metadata
- [ ] ⬜ Get npm auth token for CI

---

## 🚀 Days 14-15: Marketing & Launch

### Day 14: Release

- [ ] ⬜ Create git tag v1.0.0
- [ ] ⬜ Push tag to trigger release workflow
- [ ] ⬜ Verify npm package is published
- [ ] ⬜ Verify GitHub Release is created

### Day 14: Social Media

- [ ] ⬜ Post on LinkedIn (personal profile)
- [ ] ⬜ Post on Twitter/X
- [ ] ⬜ Upload demo video

### Day 15: Community

- [ ] ⬜ Post on Reddit r/MachineLearning
- [ ] ⬜ Post on Reddit r/LocalLLaMA
- [ ] ⬜ Post on Hacker News (Show HN)
- [ ] ⬜ Share in Claude Discord communities
- [ ] ⬜ Write Dev.to article

### Post-Launch

- [ ] ⬜ Monitor GitHub issues
- [ ] ⬜ Respond to comments within 24h
- [ ] ⬜ Track star growth
- [ ] ⬜ Track npm downloads
- [ ] ⬜ Plan v1.1.0 based on feedback

---

## 📊 Success Criteria

### Technical

- [ ] ⬜ Build passes on CI
- [ ] ⬜ 90%+ test coverage
- [ ] ⬜ All benchmarks meet targets
- [ ] ⬜ All claims validated with evidence

### Launch Metrics (Week 1)

- [ ] ⬜ 100+ GitHub stars
- [ ] ⬜ 500+ npm downloads
- [ ] ⬜ 10,000+ LinkedIn impressions

### Launch Metrics (Month 1)

- [ ] ⬜ 500+ GitHub stars
- [ ] ⬜ 2,000+ npm downloads
- [ ] ⬜ Featured in GitHub Trending

---

## Quick Reference

```bash
# Daily workflow
git pull
npm run build
npm test
npm run lint

# Before commit
npm run format
npm run test:coverage

# Release
git tag v1.0.0
git push origin v1.0.0
npm publish
```

---

_Track progress by marking items: ⬜ → 🔄 → ✅_
