#!/usr/bin/env bash
set -euo pipefail

LANES_ROOT="${LANES_ROOT:-/var/www/kensgames-lanes}"
DOMAIN="${DOMAIN:-kensgames.com}"
VHOST="${VHOST:-/etc/nginx/sites-enabled/kensgames.com}"
REPORT="${REPORT:-/home/butterfly/apps/kensgames-portal/docs/AUTOMATED_TASK_EXECUTION_REPORT.md}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

pass_count=0
fail_count=0

PASS_LINES=()
FAIL_LINES=()

check_pass() {
  pass_count=$((pass_count + 1))
  PASS_LINES+=("- PASS: $1")
}

check_fail() {
  fail_count=$((fail_count + 1))
  FAIL_LINES+=("- FAIL: $1")
}

check_cmd() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    check_pass "$name"
  else
    check_fail "$name"
  fi
}

# 1) Lanes exist
for lane in status-quo dev test prod; do
  if [[ -d "$LANES_ROOT/$lane" ]]; then
    check_pass "Lane exists: $LANES_ROOT/$lane"
  else
    check_fail "Lane missing: $LANES_ROOT/$lane"
  fi
done

# 2) status-quo snapshot exists
if ls -1 "$LANES_ROOT/status-quo" 2>/dev/null | grep -Eq '^[0-9]{8}T[0-9]{6}Z$'; then
  check_pass "Status-quo snapshot present"
else
  check_fail "No timestamped status-quo snapshot present"
fi

# 3) Prod purity (only public + logs at lane root)
if [[ -d "$LANES_ROOT/prod" ]]; then
  extra="$(find "$LANES_ROOT/prod" -mindepth 1 -maxdepth 1 -type d | xargs -r -n1 basename | grep -Ev '^(public|logs)$' || true)"
  if [[ -z "$extra" ]]; then
    check_pass "Prod lane purity: only public and logs"
  else
    check_fail "Prod lane purity violated: extra directories => $extra"
  fi
else
  check_fail "Prod lane missing; purity check skipped"
fi

# 4) Nginx serving contract
if [[ -f "$VHOST" ]]; then
  grep -q '/var/www/kensgames-lanes/prod/public' "$VHOST" && check_pass "Nginx root points to prod/public" || check_fail "Nginx root is not prod/public"

  # Support two sanctioned public modes:
  # 1) Full prod mode: docs alias exposed from prod/public/docs
  # 2) Coming-soon blackout mode: docs intentionally hidden and all routes funnel to /
  if grep -q '/var/www/kensgames-lanes/prod/public/docs/' "$VHOST"; then
    check_pass "Nginx docs alias points to prod/public/docs"
  else
    if grep -q 'index coming-soon.html' "$VHOST"; then
      check_pass "Nginx running in coming-soon blackout mode (docs alias intentionally disabled)"
    else
      check_fail "Nginx docs alias missing and blackout mode not detected"
    fi
  fi

  grep -q 'ssl_certificate' "$VHOST" && check_pass "Nginx SSL certificate configured" || check_fail "Nginx SSL certificate missing"
  grep -q 'server_name kensgames.com' "$VHOST" && check_pass "Nginx server_name includes kensgames.com" || check_fail "Nginx server_name missing kensgames.com"
else
  check_fail "Nginx vhost missing: $VHOST"
fi

# 5) HTTPS endpoints
root_code="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/" || echo 000)"
[[ "$root_code" =~ ^(200|301|302)$ ]] && check_pass "HTTPS root reachable ($root_code)" || check_fail "HTTPS root failed ($root_code)"

docs_code="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/docs/" || echo 000)"
[[ "$docs_code" =~ ^(200|301|302)$ ]] && check_pass "HTTPS docs reachable ($docs_code)" || check_fail "HTTPS docs not public-ready ($docs_code)"

# 6) TLS certificate validity
cert_end_raw="$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null || true)"
if [[ -n "$cert_end_raw" ]]; then
  check_pass "TLS certificate present ($cert_end_raw)"
else
  check_fail "TLS certificate inspection failed"
fi

# Write report
{
  echo "# Automated Task Execution Report"
  echo
  echo "- Timestamp (UTC): $NOW"
  echo "- Domain: $DOMAIN"
  echo "- Lanes root: $LANES_ROOT"
  echo "- Nginx vhost: $VHOST"
  echo
  echo "## Summary"
  echo "- Passed: $pass_count"
  echo "- Failed: $fail_count"
  echo
  echo "## Passed Checks"
  if [[ ${#PASS_LINES[@]} -eq 0 ]]; then
    echo "- None"
  else
    printf '%s\n' "${PASS_LINES[@]}"
  fi
  echo
  echo "## Failed Checks"
  if [[ ${#FAIL_LINES[@]} -eq 0 ]]; then
    echo "- None"
  else
    printf '%s\n' "${FAIL_LINES[@]}"
  fi
  echo
  echo "## Policy Notes"
  echo "- Completed means ready to deploy."
  echo "- Deployed to Prod means live and post-deploy checks passed."
  echo "- Prod must contain production-ready artifacts only."
  echo "- X-Dimensional directives govern each gate."
} > "$REPORT"

printf '[automated-task-execution] report written: %s\n' "$REPORT"

# Non-zero exit when any gate fails.
if [[ $fail_count -gt 0 ]]; then
  exit 1
fi
