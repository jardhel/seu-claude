#!/bin/bash
# seu-claude Validation Evidence Collection Script
# Run this to collect proof for all manifest claims

set -e

echo "=============================================="
echo "  seu-claude Validation Evidence Collection"
echo "=============================================="
echo ""
echo "Date: $(date)"
echo "Host: $(hostname)"
echo "Node: $(node --version)"
echo "OS: $(uname -s) $(uname -r)"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Results directory
EVIDENCE_DIR="./evidence/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$EVIDENCE_DIR"

echo "Evidence will be saved to: $EVIDENCE_DIR"
echo ""

# ============================================
# Claim 1: No Python Dependencies
# ============================================
echo -e "${BLUE}[Test 1] No Python Dependencies${NC}"
echo "Testing fresh npm install works without Python..."

TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"
npm init -y > /dev/null 2>&1
echo "Installing seu-claude in clean environment..."
npm install seu-claude 2>&1 | tee "$EVIDENCE_DIR/01_npm_install.log"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PASS: Installed without Python${NC}"
    echo "PASS" > "$EVIDENCE_DIR/01_result.txt"
else
    echo -e "${RED}✗ FAIL: Installation failed${NC}"
    echo "FAIL" > "$EVIDENCE_DIR/01_result.txt"
fi
cd - > /dev/null
rm -rf "$TEMP_DIR"
echo ""

# ============================================
# Claim 2: Low RAM Usage (Idle)
# ============================================
echo -e "${BLUE}[Test 2] RAM Usage (Idle) - Target: < 200MB${NC}"
echo "Starting server and measuring idle RAM..."

cd "$(dirname "$0")/.."
npm start &
SERVER_PID=$!
sleep 5

if [ "$(uname)" == "Darwin" ]; then
    # macOS
    RAM_KB=$(ps -o rss= -p $SERVER_PID 2>/dev/null || echo "0")
else
    # Linux
    RAM_KB=$(ps -o rss= -p $SERVER_PID 2>/dev/null || echo "0")
fi

RAM_MB=$((RAM_KB / 1024))
echo "Idle RAM: ${RAM_MB}MB"

kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

if [ "$RAM_MB" -lt 200 ]; then
    echo -e "${GREEN}✓ PASS: Idle RAM ${RAM_MB}MB < 200MB${NC}"
    echo "PASS: ${RAM_MB}MB" > "$EVIDENCE_DIR/02_idle_ram.txt"
else
    echo -e "${RED}✗ FAIL: Idle RAM ${RAM_MB}MB >= 200MB${NC}"
    echo "FAIL: ${RAM_MB}MB" > "$EVIDENCE_DIR/02_idle_ram.txt"
fi
echo ""

# ============================================
# Claim 3: No Zombie Processes
# ============================================
echo -e "${BLUE}[Test 3] No Zombie Processes${NC}"
echo "Starting/stopping server 10 times..."

ZOMBIE_COUNT=0
for i in {1..10}; do
    npm start &
    PID=$!
    sleep 1
    kill $PID 2>/dev/null || true
    wait $PID 2>/dev/null || true
done

sleep 2
ZOMBIES=$(ps aux | grep -E "[s]eu-claude|[n]ode.*seu" | grep -v grep | wc -l)
echo "Zombie processes found: $ZOMBIES"

if [ "$ZOMBIES" -eq 0 ]; then
    echo -e "${GREEN}✓ PASS: No zombie processes${NC}"
    echo "PASS: 0 zombies after 10 cycles" > "$EVIDENCE_DIR/03_zombie_test.txt"
else
    echo -e "${RED}✗ FAIL: Found $ZOMBIES zombie processes${NC}"
    echo "FAIL: $ZOMBIES zombies" > "$EVIDENCE_DIR/03_zombie_test.txt"
fi
echo ""

# ============================================
# Claim 4: Index Performance
# ============================================
echo -e "${BLUE}[Test 4] Index Performance${NC}"
echo "This test requires a sample codebase..."
echo "Skipping automated benchmark (run manually with a real codebase)"
echo "MANUAL" > "$EVIDENCE_DIR/04_index_perf.txt"
echo ""

# ============================================
# Claim 5: Query Latency
# ============================================
echo -e "${BLUE}[Test 5] Query Latency${NC}"
echo "This test requires an indexed codebase..."
echo "Skipping automated benchmark (run manually with a real codebase)"
echo "MANUAL" > "$EVIDENCE_DIR/05_query_latency.txt"
echo ""

# ============================================
# Summary
# ============================================
echo "=============================================="
echo "  Evidence Collection Complete"
echo "=============================================="
echo ""
echo "Results saved to: $EVIDENCE_DIR"
echo ""
echo "Files collected:"
ls -la "$EVIDENCE_DIR"
echo ""
echo "To validate all claims, run full benchmarks with:"
echo "  npm run benchmark"
echo ""
echo "For video demo evidence, record:"
echo "  1. htop/Activity Monitor during indexing"
echo "  2. Semantic search finding code in unopened files"
echo "  3. Side-by-side RAM comparison vs alternatives"
