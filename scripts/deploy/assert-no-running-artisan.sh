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
releases_root=$(readlink -f -- "$HOME/.deployments/games-laravel/releases")
[ -f "$candidate_root/artisan" ] || { echo "::error::Candidate has no artisan file." >&2; exit 1; }
[ -f "$stable_root/artisan" ] || { echo "::error::Stable release has no artisan file." >&2; exit 1; }
[ -d "$releases_root" ] || { echo "::error::Games releases directory is unavailable." >&2; exit 1; }
[[ $candidate_root == "$releases_root/"* ]] || { echo "::error::Candidate is outside the games releases directory." >&2; exit 1; }

proc_root=${DEPLOY_QUIESCE_PROC_ROOT:-/proc}
expected_uid=${DEPLOY_QUIESCE_UID:-$(id -u)}
[ -d "$proc_root" ] || { echo "::error::Process filesystem is unavailable." >&2; exit 1; }

get_process_identity() {
    local proc_dir=$1
    local identity=
    if [ -r "$proc_dir/stat" ]; then
        identity=$(awk '{
            str = $0
            sub(/^.*\)[[:space:]]*/, "", str)
            split(str, f, /[[:space:]]+/)
            print f[20]
        }' "$proc_dir/stat" 2>/dev/null || true)
    fi
    if [ -z "$identity" ] && command -v stat >/dev/null 2>&1; then
        identity=$(stat -c '%i %Z' "$proc_dir" 2>/dev/null || true)
    fi
    printf '%s\n' "$identity"
}

process_vanished() {
    local proc_dir=$1 expected_uid=$2 initial_identity=$3
    [ -d "$proc_dir" ] || return 0
    [ -r "$proc_dir/status" ] || return 0
    local current_uid
    current_uid=$(awk '$1 == "Uid:" { print $2; exit }' "$proc_dir/status" 2>/dev/null || true)
    [ "$current_uid" = "$expected_uid" ] || return 0
    if [ -n "$initial_identity" ]; then
        local current_identity
        current_identity=$(get_process_identity "$proc_dir")
        if [ "$current_identity" != "$initial_identity" ]; then
            return 0
        fi
    fi
    return 1
}

owned=()
for process in "$proc_root"/[0-9]*; do
    [ -d "$process" ] || continue
    pid=${process##*/}
    [ -r "$process/status" ] || continue
    initial_identity=$(get_process_identity "$process")
    process_uid=$(awk '$1 == "Uid:" { print $2; exit }' "$process/status" 2>/dev/null || true)
    [ "$process_uid" = "$expected_uid" ] || continue

    arguments=()
    if [ ! -r "$process/cmdline" ] || ! mapfile -d '' -t arguments <"$process/cmdline" 2>/dev/null; then
        if process_vanished "$process" "$expected_uid" "$initial_identity"; then
            continue
        fi
        echo "::error::Cannot inspect same-user PHP process $pid." >&2
        exit 1
    fi

    is_artisan=false
    artisan_argument=
    for argument in "${arguments[@]+"${arguments[@]}"}"; do
        case $argument in
            artisan | */artisan) is_artisan=true; artisan_argument=$argument; break ;;
        esac
    done
    [ "$is_artisan" = true ] || continue

    cwd=$(readlink -f -- "$process/cwd" 2>/dev/null || true)
    if [ -z "$cwd" ]; then
        if process_vanished "$process" "$expected_uid" "$initial_identity"; then
            continue
        fi
        echo "::error::Cannot inspect the working directory of Artisan process $pid." >&2
        exit 1
    fi
    case $artisan_argument in
        /*) artisan_path=$(readlink -f -- "$artisan_argument" 2>/dev/null || true) ;;
        *) artisan_path=$(readlink -f -- "$cwd/$artisan_argument" 2>/dev/null || true) ;;
    esac
    if [ -z "$artisan_path" ]; then
        if process_vanished "$process" "$expected_uid" "$initial_identity"; then
            continue
        fi
        echo "::error::Cannot resolve the Artisan path of same-user process $pid." >&2
        exit 1
    fi
    if [ "$cwd" = "$stable_root" ] || [[ $cwd == "$stable_root/"* ]] \
        || [[ $cwd == "$releases_root/"* ]] \
        || [ "$artisan_path" = "$stable_root/artisan" ] \
        || [[ $artisan_path == "$releases_root/"* ]]; then
        if process_vanished "$process" "$expected_uid" "$initial_identity"; then
            continue
        fi
        owned+=("$pid")
    fi
done

if [ "${#owned[@]}" -ne 0 ]; then
    echo "::error::Games still owns running Artisan process(es): ${owned[*]}." >&2
    exit 1
fi

echo "No games-owned Artisan process remains before the atomic risk boundary."
