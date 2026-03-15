#!/bin/bash
# Gebruik als: ./health-check.sh [url]
URL="${1:-http://localhost:8080}"

response=$(curl -s -w "\n%{http_code}" "$URL/api/health")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -n -1)

if [ "$http_code" != "200" ]; then
    echo "UNHEALTHY: HTTP $http_code"
    exit 1
fi

status=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
echo "Status: $status"
echo "$body" | python3 -m json.tool

[ "$status" = "healthy" ] && exit 0 || exit 1
