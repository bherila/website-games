#!/usr/bin/env bash
# Deep, read-only verification of the selected production release.
set -euo pipefail

site_url=${DEPLOY_SITE_URL:-}
release_id=${DEPLOY_RELEASE_ID:-}
source_commit=${DEPLOY_SOURCE_COMMIT:-}
live_release=${DEPLOY_LIVE_RELEASE:-}
live_commit=${DEPLOY_LIVE_COMMIT:-}
live_state=${DEPLOY_LIVE_STATE:-}

[ "${DEPLOYMENT_MODE:-}" = atomic ] || { echo "::error::Production verification requires atomic mode." >&2; exit 2; }
[ -n "$site_url" ] || { echo "::error::DEPLOY_SITE_URL is required." >&2; exit 2; }
case $site_url in
    https://*) ;;
    http://127.0.0.1:* | http://localhost:*)
        [ "${DEPLOY_VERIFY_ALLOW_HTTP:-false}" = true ] || {
            echo "::error::Production verification requires HTTPS." >&2
            exit 2
        } ;;
    *) echo "::error::Production verification requires an HTTPS site URL." >&2; exit 2 ;;
esac

[ "$live_state" = serving ] || { echo "::error::Selected release is not serving." >&2; exit 1; }
[ -n "$release_id" ] && [ "$live_release" = "$release_id" ] || {
    echo "::error::The reported live release is not this deployment's candidate." >&2
    exit 1
}
[ -n "$source_commit" ] && [ "$live_commit" = "$source_commit" ] || {
    echo "::error::The reported live commit is not this deployment's source commit." >&2
    exit 1
}

command -v curl >/dev/null || { echo "::error::curl is required." >&2; exit 2; }
command -v jq >/dev/null || { echo "::error::jq is required." >&2; exit 2; }
[ -f resources/data/mandarin/foundations.v2.json ] || {
    echo "::error::The checked-in Mandarin course is unavailable." >&2
    exit 2
}

expected_version=$(jq -er '.contentVersion' resources/data/mandarin/foundations.v2.json)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
retries=${DEPLOY_VERIFY_RETRIES:-3}
[[ $retries =~ ^[0-9]+$ ]] || { echo "::error::DEPLOY_VERIFY_RETRIES must be numeric." >&2; exit 2; }
# Right after maintenance ends the site has briefly answered 200 with an HTML page instead of a
# JSON file (#156). curl only retries transport and HTTP errors, so each content assertion is
# retried as a whole for about a minute before it fails.
attempts=${DEPLOY_VERIFY_ATTEMPTS:-10}
delay=${DEPLOY_VERIFY_DELAY:-6}
[[ $attempts =~ ^[1-9][0-9]*$ ]] || { echo "::error::DEPLOY_VERIFY_ATTEMPTS must be a positive integer." >&2; exit 2; }
[[ $delay =~ ^[0-9]+$ ]] || { echo "::error::DEPLOY_VERIFY_DELAY must be numeric." >&2; exit 2; }
# --location follows redirects, so pin their protocol: a redirect to plain HTTP (or any other
# scheme) could let an intercepted response satisfy the identity and bootstrap assertions.
# The loopback HTTP exception above applies to the configured base URL only, never to a redirect.
curl_options=(--silent --show-error --location --proto-redir =https --retry "$retries" --retry-delay 1 --retry-all-errors --connect-timeout 10 --max-time 30
    --header 'Cache-Control: no-cache' --header 'Pragma: no-cache')
base=${site_url%/}

# Runs a check until it passes or the attempts run out. On the last failure it prints the error
# and what actually answered, so the next occurrence shows its content type and first bytes.
eventually() {
    local message=$1 body=$2 headers=$3 check=$4 attempt
    for ((attempt = 1; attempt <= attempts; attempt++)); do
        "$check" && return 0
        [ "$attempt" -lt "$attempts" ] && sleep "$delay"
    done
    echo "::error::$message" >&2
    if [ -f "$headers" ]; then
        echo "Last response Content-Type: $(awk -F ': *' 'tolower($1) == "content-type" { value = $2 } END { gsub("\r", "", value); print value }' "$headers")" >&2
    fi
    if [ -f "$body" ]; then
        echo "Last response began: $(head -c 160 "$body" | LC_ALL=C tr -c '[:print:]' ' ')" >&2
    fi
    exit 1
}

for path in /up / /mandarin; do
    curl --fail "${curl_options[@]}" --output /dev/null "$base$path"
done

serves_source_commit() {
    rm -f "$work/identity.json" "$work/identity.headers"
    curl --fail "${curl_options[@]}" --dump-header "$work/identity.headers" --output "$work/identity.json" \
        "$base/deployment-identity.json?commit=$source_commit" || return 1
    jq -e --arg commit "$source_commit" '.source_commit == $commit' "$work/identity.json" >/dev/null 2>&1
}
eventually "The public site is not serving this deployment's source commit." \
    "$work/identity.json" "$work/identity.headers" serves_source_commit

serves_manifest() {
    rm -f "$work/manifest.body" "$work/manifest.headers"
    curl --fail "${curl_options[@]}" --dump-header "$work/manifest.headers" \
        --output "$work/manifest.body" "$base/manifest.webmanifest" || return 1
    local content_type
    content_type=$(awk -F ': *' 'tolower($1) == "content-type" { value = tolower($2) } END { gsub("\r", "", value); print value }' "$work/manifest.headers")
    case ${content_type%%;*} in
        application/manifest+json | application/json) return 0 ;;
        *) return 1 ;;
    esac
}
eventually "Unexpected manifest Content-Type." "$work/manifest.body" "$work/manifest.headers" serves_manifest

serves_published_course() {
    rm -f "$work/bootstrap.json" "$work/bootstrap.headers"
    curl --fail "${curl_options[@]}" --dump-header "$work/bootstrap.headers" --output "$work/bootstrap.json" \
        "$base/api/games/mandarin/bootstrap" || return 1
    jq -e --arg version "$expected_version" '
        .runtime == "live"
        and .course.courseId == "mandarin-foundations"
        and .course.contentVersion == $version
        and .audio.courseId == "mandarin-foundations"
        and .audio.contentVersion == $version
    ' "$work/bootstrap.json" >/dev/null 2>&1
}
eventually "Live Mandarin bootstrap does not expose the checked-in published course." \
    "$work/bootstrap.json" "$work/bootstrap.headers" serves_published_course

echo "Verified games source commit, pages, manifest MIME type, and published Mandarin course $expected_version."
