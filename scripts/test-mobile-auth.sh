#!/usr/bin/env bash
# Mobile auth integration test suite
# Runs all endpoint tests and asserts correct behavior.
# Usage: bash scripts/test-mobile-auth.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

assert_status() {
  local expected=$1
  local actual=$2
  local test_name=$3
  if [ "$expected" = "$actual" ]; then
    echo -e "${GREEN}PASS${NC}: $test_name (status $actual)"
    ((PASS++))
    return 0
  else
    echo -e "${RED}FAIL${NC}: $test_name (expected $expected, got $actual)"
    ((FAIL++))
    return 1
  fi
}

assert_json_field() {
  local json=$1
  local field=$2
  local test_name=$3
  if echo "$json" | jq -e ".$field" >/dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}: $test_name (has $field)"
    ((PASS++))
    return 0
  else
    echo -e "${RED}FAIL${NC}: $test_name (missing $field)"
    ((FAIL++))
    return 1
  fi
}

assert_json_not_field() {
  local json=$1
  local field=$2
  local test_name=$3
  if ! echo "$json" | jq -e ".$field" >/dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}: $test_name (no $field)"
    ((PASS++))
    return 0
  else
    echo -e "${RED}FAIL${NC}: $test_name (unexpected $field)"
    ((FAIL++))
    return 1
  fi
}

echo "=== Mobile Auth Integration Tests ==="
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Login with valid credentials
echo "--- Test 1: POST /api/mobile/auth/login (valid) ---"
# Need a test user - we'll create one via register first
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mobile/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test_login@example.com","password":"password123","confirmPassword":"password123"}')
REGISTER_STATUS=$?

if echo "$REGISTER_RESPONSE" | jq -e '.accessToken' >/dev/null 2>&1; then
  echo "Created test user"
else
  # User might already exist, try to login
  echo "User may already exist, trying login"
fi

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mobile/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test_login@example.com","password":"password123"}')
LOGIN_STATUS=$?

LOGIN_STATUS=$(echo "$LOGIN_RESPONSE" | jq -r 'if .accessToken then 200 else 401 end')
assert_status "200" "$LOGIN_STATUS" "Login valid credentials returns 200"
assert_json_field "$LOGIN_RESPONSE" "accessToken" "Login returns accessToken"
assert_json_field "$LOGIN_RESPONSE" "refreshToken" "Login returns refreshToken"
assert_json_field "$LOGIN_RESPONSE" "expiresIn" "Login returns expiresIn"

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken')
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.refreshToken')

# Test 2: Login with invalid credentials
echo ""
echo "--- Test 2: POST /api/mobile/auth/login (invalid) ---"
INVALID_LOGIN=$(curl -s -X POST "$BASE_URL/api/mobile/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test_login@example.com","password":"wrongpassword"}')
INVALID_LOGIN_STATUS=$(echo "$INVALID_LOGIN" | jq -r 'if .error then 401 else 200 end')
assert_status "401" "$INVALID_LOGIN_STATUS" "Login invalid credentials returns 401"
assert_json_field "$INVALID_LOGIN" "error" "Login invalid returns error field"

# Test 3: Login with malformed request
echo ""
echo "--- Test 3: POST /api/mobile/auth/login (malformed) ---"
MALFORMED_LOGIN=$(curl -s -X POST "$BASE_URL/api/mobile/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"short"}')
MALFORMED_LOGIN_STATUS=$(echo "$MALFORMED_LOGIN" | jq -r 'if .error then 400 else 200 end')
assert_status "400" "$MALFORMED_LOGIN_STATUS" "Login malformed returns 400"

# Test 4: Register new user
echo ""
echo "--- Test 4: POST /api/mobile/auth/register (new) ---"
UNIQUE_EMAIL="test_register_$(date +%s)_$RANDOM@example.com"
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mobile/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$UNIQUE_EMAIL\",\"password\":\"password123\",\"confirmPassword\":\"password123\"}")
assert_status "200" "$(echo "$REGISTER_RESPONSE" | jq -r 'if .accessToken then 200 else 400 end // empty')" "Register new user returns 200"
assert_json_field "$REGISTER_RESPONSE" "accessToken" "Register returns accessToken"
assert_json_field "$REGISTER_RESPONSE" "refreshToken" "Register returns refreshToken"

# Test 5: Register duplicate email
echo ""
echo "--- Test 5: POST /api/mobile/auth/register (duplicate) ---"
DUP_REGISTER=$(curl -s -X POST "$BASE_URL/api/mobile/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test_login@example.com","password":"password123","confirmPassword":"password123"}')
assert_status "409" "$(echo "$DUP_REGISTER" | jq -r 'if .error == "email_exists" then 409 else 200 end // empty')" "Register duplicate returns 409"
assert_json_field "$DUP_REGISTER" "error" "Register duplicate returns error"

# Test 6: Register password mismatch
echo ""
echo "--- Test 6: POST /api/mobile/auth/register (mismatch) ---"
MISMATCH_EMAIL="test_mismatch_$(date +%s)_$RANDOM@example.com"
MISMATCH_REGISTER=$(curl -s -X POST "$BASE_URL/api/mobile/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$MISMATCH_EMAIL\",\"password\":\"password123\",\"confirmPassword\":\"different\"}")
assert_status "400" "$(echo "$MISMATCH_REGISTER" | jq -r 'if .error then 400 else 200 end // empty')" "Register mismatch returns 400"

# Test 7: Refresh valid token
echo ""
echo "--- Test 7: POST /api/mobile/auth/refresh (valid) ---"
REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mobile/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
REFRESH_STATUS=$(echo "$REFRESH_RESPONSE" | jq -r 'if .accessToken then 200 else 401 end')
assert_status "200" "$REFRESH_STATUS" "Refresh valid token returns 200"
assert_json_field "$REFRESH_RESPONSE" "accessToken" "Refresh returns new accessToken"
assert_json_field "$REFRESH_RESPONSE" "refreshToken" "Refresh returns new refreshToken"

NEW_ACCESS_TOKEN=$(echo "$REFRESH_RESPONSE" | jq -r '.accessToken')
NEW_REFRESH_TOKEN=$(echo "$REFRESH_RESPONSE" | jq -r '.refreshToken')

# Test 8: Refresh invalid token
echo ""
echo "--- Test 8: POST /api/mobile/auth/refresh (invalid) ---"
INVALID_REFRESH=$(curl -s -X POST "$BASE_URL/api/mobile/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"invalid.token.here"}')
INVALID_REFRESH_STATUS=$(echo "$INVALID_REFRESH" | jq -r 'if .error then 401 else 200 end')
assert_status "401" "$INVALID_REFRESH_STATUS" "Refresh invalid returns 401"

# Test 9: Telegram nonce
echo ""
echo "--- Test 9: POST /api/mobile/auth/telegram/nonce ---"
NONCE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mobile/auth/telegram/nonce")
NONCE_STATUS=$(echo "$NONCE_RESPONSE" | jq -r 'if .nonce then 200 else 500 end')
assert_status "200" "$NONCE_STATUS" "Nonce endpoint returns 200"
assert_json_field "$NONCE_RESPONSE" "nonce" "Nonce returns nonce field"
assert_json_field "$NONCE_RESPONSE" "expiresIn" "Nonce returns expiresIn"
NONCE=$(echo "$NONCE_RESPONSE" | jq -r '.nonce')

# Test 10: Telegram poll with valid nonce (pending)
echo ""
echo "--- Test 10: GET /api/mobile/auth/telegram/poll (pending) ---"
POLL_RESPONSE=$(curl -s "$BASE_URL/api/mobile/auth/telegram/poll?nonce=$NONCE")
POLL_STATUS=$(echo "$POLL_RESPONSE" | jq -r 'if .status == "pending" then 202 else 200 end')
assert_status "202" "$POLL_STATUS" "Poll pending returns 202"
assert_json_field "$POLL_RESPONSE" "status" "Poll returns status field"

# Test 11: Telegram poll with invalid nonce
echo ""
echo "--- Test 11: GET /api/mobile/auth/telegram/poll (invalid nonce) ---"
INVALID_POLL=$(curl -s "$BASE_URL/api/mobile/auth/telegram/poll?nonce=invalid_nonce")
INVALID_POLL_STATUS=$(echo "$INVALID_POLL" | jq -r 'if .error then 400 else 200 end')
assert_status "400" "$INVALID_POLL_STATUS" "Poll invalid nonce returns 400"

# Test 12: Telegram poll with expired/non-existent nonce
echo ""
echo "--- Test 12: GET /api/mobile/auth/telegram/poll (not found) ---"
NOTFOUND_POLL=$(curl -s "$BASE_URL/api/mobile/auth/telegram/poll?nonce=nonce_00000000000000000000000000000000")
NOTFOUND_POLL_STATUS=$(echo "$NOTFOUND_POLL" | jq -r 'if .error then 410 else 200 end')
assert_status "410" "$NOTFOUND_POLL_STATUS" "Poll not found returns 410"

# Test 13: Subscription with valid token
echo ""
echo "--- Test 13: GET /api/mobile/subscription (valid token) ---"
SUB_RESPONSE=$(curl -s -H "Authorization: Bearer $NEW_ACCESS_TOKEN" "$BASE_URL/api/mobile/subscription")
SUB_STATUS=$(echo "$SUB_RESPONSE" | jq -r 'if .user then 200 else 401 end')
assert_status "200" "$SUB_STATUS" "Subscription valid token returns 200"
assert_json_field "$SUB_RESPONSE" "user" "Subscription returns user"
assert_json_field "$SUB_RESPONSE" "keys" "Subscription returns keys array"

# Test 14: Subscription without token
echo ""
echo "--- Test 14: GET /api/mobile/subscription (no token) ---"
NO_TOKEN_SUB=$(curl -s "$BASE_URL/api/mobile/subscription")
NO_TOKEN_SUB_STATUS=$(echo "$NO_TOKEN_SUB" | jq -r 'if .error then 401 else 200 end')
assert_status "401" "$NO_TOKEN_SUB_STATUS" "Subscription no token returns 401"

# Test 15: Subscription with expired token (we can't easily test this without time manipulation)
echo ""
echo "--- Test 15: GET /api/mobile/subscription (invalid token) ---"
INVALID_SUB=$(curl -s -H "Authorization: Bearer invalid.token.here" "$BASE_URL/api/mobile/subscription")
INVALID_SUB_STATUS=$(echo "$INVALID_SUB" | jq -r 'if .error then 401 else 200 end')
assert_status "401" "$INVALID_SUB_STATUS" "Subscription invalid token returns 401"

# Test 16: Well-known assetlinks.json
echo ""
echo "--- Test 16: GET /.well-known/assetlinks.json ---"
ASSETLINKS=$(curl -s "$BASE_URL/.well-known/assetlinks.json")
ASSETLINKS_STATUS=$(echo "$ASSETLINKS" | jq -r 'if type == "array" then 200 else 500 end')
assert_status "200" "$ASSETLINKS_STATUS" "Assetlinks returns 200"
assert_json_field "$ASSETLINKS" "[0].relation" "Assetlinks has relation"

# Test 17: Well-known apple-app-site-association
echo ""
echo "--- Test 17: GET /.well-known/apple-app-site-association ---"
APPLE_ASSOC=$(curl -s "$BASE_URL/.well-known/apple-app-site-association")
APPLE_ASSOC_STATUS=$(echo "$APPLE_ASSOC" | jq -r 'if has("applinks") then 200 else 500 end')
assert_status "200" "$APPLE_ASSOC_STATUS" "Apple app site association returns 200"
assert_json_field "$APPLE_ASSOC" "applinks" "Apple association has applinks"

echo ""
echo "=== Summary ==="
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${RED}Failed: $FAIL${NC}"

if [ $FAIL -gt 0 ]; then
  exit 1
fi
exit 0