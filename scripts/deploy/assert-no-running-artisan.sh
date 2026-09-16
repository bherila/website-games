#!/usr/bin/env bash
# Refuse the atomic risk boundary while this application still owns an Artisan process.
set -euo pipefail

if [ "$#" -ne 3 ]; then
    echo "usage: assert-no-running-artisan.sh <candidate-path> <php> <stable-path>" >&2
    exit 2
fi

candidate_path=$1
php=$2
stable_path=$3

candidate_prefix=.deployments/games-laravel/releases/
case $candidate_path in "$candidate_prefix"*) ;; *) echo "::error::Unexpected candidate path '$candidate_path'." >&2; exit 2 ;; esac
candidate_release=${candidate_path#"$candidate_prefix"}
case $candidate_release in '' | .* | */* | *[!A-Za-z0-9._-]*) echo "::error::Unsafe candidate release name." >&2; exit 2 ;; esac
[ "$stable_path" = games-laravel ] || {
    echo "::error::Unexpected stable path '$stable_path'." >&2
    exit 2
}
case $php in
    /*) ;;
    *) echo "::error::PHP must be an absolute path." >&2; exit 2 ;;
esac
[ -x "$php" ] || { echo "::error::PHP is not executable." >&2; exit 1; }

candidate_root=$(readlink -f -- "$HOME/$candidate_path")
stable_root=$(readlink -f -- "$HOME/$stable_path")
[ -f "$candidate_root/artisan" ] || { echo "::error::Candidate has no artisan file." >&2; exit 1; }
[ -f "$stable_root/artisan" ] || { echo "::error::Stable release has no artisan file." >&2; exit 1; }

proc_root=${DEPLOY_QUIESCE_PROC_ROOT:-/proc}
expected_uid=${DEPLOY_QUIESCE_UID:-$(id -u)}
[ -d "$proc_root" ] || { echo "::error::Process filesystem is unavailable." >&2; exit 1; }

owned=()
for process in "$proc_root"/[0-9]*; do
    [ -d "$process" ] || continue
    pid=${process##*/}
    [ -r "$process/status" ] || continue
    process_uid=$(awk '$1 == "Uid:" { print $2; exit }' "$process/status")
    [ "$process_uid" = "$expected_uid" ] || continue

    executable=$(readlink -f -- "$process/exe" 2>/dev/null || true)
    case ${executable##*/} in
        php | php-cgi | lsphp | ea-php*) ;;
        *) continue ;;
    esac
    [ -r "$process/cmdline" ] || {
        echo "::error::Cannot inspect same-user PHP process $pid." >&2
        exit 1
    }

    mapfile -d '' -t arguments <"$process/cmdline" || true
    is_artisan=false
    for argument in "${arguments[@]+"${arguments[@]}"}"; do
        case $argument in
            artisan | */artisan) is_artisan=true; break ;;
        esac
    done
    [ "$is_artisan" = true ] || continue

    cwd=$(readlink -f -- "$process/cwd" 2>/dev/null || true)
    [ -n "$cwd" ] || {
        echo "::error::Cannot inspect the working directory of Artisan process $pid." >&2
        exit 1
    }
    if [ "$cwd" = "$stable_root" ] || [[ $cwd == "$stable_root/"* ]]; then
        owned+=("$pid")
    fi
done

if [ "${#owned[@]}" -ne 0 ]; then
    echo "::error::Games still owns running Artisan process(es): ${owned[*]}." >&2
    exit 1
fi

echo "No games-owned Artisan process remains before the atomic risk boundary."
