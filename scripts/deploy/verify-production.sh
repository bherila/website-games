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
[ -f resources/data/mandarin/foundations.v1.json ] || {
    echo "::error::The checked-in Mandarin course is unavailable." >&2
    exit 2
}

expected_version=$(jq -er '.contentVersion' resources/data/mandarin/foundations.v1.json)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
retries=${DEPLOY_VERIFY_RETRIES:-3}
[[ $retries =~ ^[0-9]+$ ]] || { echo "::error::DEPLOY_VERIFY_RETRIES must be numeric." >&2; exit 2; }
curl_options=(--silent --show-error --location --retry "$retries" --retry-delay 1 --retry-all-errors --connect-timeout 10 --max-time 30)
base=${site_url%/}

for path in /up / /mandarin; do
    curl --fail "${curl_options[@]}" --output /dev/null "$base$path"
done

curl --fail "${curl_options[@]}" --output "$work/deployment-identity.json" \
    "$base/deployment-identity.json?commit=$source_commit"
jq -e --arg commit "$source_commit" '.source_commit == $commit' \
    "$work/deployment-identity.json" >/dev/null || {
    echo "::error::The public site is not serving this deployment's source commit." >&2
    exit 1
}

curl --fail "${curl_options[@]}" --dump-header "$work/manifest.headers" \
    --output "$work/manifest.body" "$base/manifest.webmanifest"
content_type=$(awk -F ': *' 'tolower($1) == "content-type" { value = tolower($2) } END { gsub("\r", "", value); print value }' "$work/manifest.headers")
case ${content_type%%;*} in
    application/manifest+json | application/json) ;;
    *) echo "::error::Unexpected manifest Content-Type: ${content_type:-missing}." >&2; exit 1 ;;
esac

curl --fail "${curl_options[@]}" --output "$work/bootstrap.json" \
    "$base/api/games/mandarin/bootstrap"
jq -e --arg version "$expected_version" '
    .runtime == "live"
    and .course.courseId == "mandarin-foundations"
    and .course.contentVersion == $version
    and .audio.courseId == "mandarin-foundations"
    and .audio.contentVersion == $version
' "$work/bootstrap.json" >/dev/null || {
    echo "::error::Live Mandarin bootstrap does not expose the checked-in published course." >&2
    exit 1
}

echo "Verified games source commit, pages, manifest MIME type, and published Mandarin course $expected_version."
