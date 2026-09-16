#!/usr/bin/env bash
# Publish the staged course only after the candidate is selected, while Laravel remains down.
set -euo pipefail

if [ "$#" -ne 3 ]; then
    echo "usage: activate-mandarin-course.sh <stable-path> <php> <candidate-path>" >&2
    exit 2
fi

stable_path=$1
php=$2
candidate_path=$3

[ "$stable_path" = games-laravel ] || {
    echo "::error::Unexpected stable path '$stable_path'." >&2
    exit 2
}
case $php in
    /*) ;;
    *) echo "::error::PHP must be an absolute path." >&2; exit 2 ;;
esac
[ -x "$php" ] || { echo "::error::PHP is not executable." >&2; exit 1; }

stable_location=$HOME/$stable_path
[ -d "$stable_location" ] || { echo "::error::Stable games path is not a directory." >&2; exit 1; }
stable_root=$(readlink -f -- "$stable_location")

if [ "$candidate_path" = "$stable_path" ]; then
    # In the stable-directory layout, activation has renamed the exact candidate
    # into the real cPanel application path before this hook runs.
    [ ! -L "$stable_location" ] || {
        echo "::error::Stable-directory activation unexpectedly selected a symlink." >&2
        exit 1
    }
    candidate_root=$stable_root
else
    # Keep the hook safe for the opt-in v2.0 release-symlink layout.
    candidate_prefix=.deployments/games-laravel/releases/
    case $candidate_path in "$candidate_prefix"*) ;; *) echo "::error::Unexpected candidate path '$candidate_path'." >&2; exit 2 ;; esac
    candidate_release=${candidate_path#"$candidate_prefix"}
    case $candidate_release in '' | .* | */* | *[!A-Za-z0-9._-]*) echo "::error::Unsafe candidate release name." >&2; exit 2 ;; esac
    candidate_root=$(readlink -f -- "$HOME/$candidate_path")
fi
[ "$stable_root" = "$candidate_root" ] || {
    echo "::error::Stable games path does not select the candidate release." >&2
    exit 1
}
[ -f "$stable_root/artisan" ] || { echo "::error::Selected release has no artisan file." >&2; exit 1; }

(
    cd "$stable_root"
    "$php" -d memory_limit=1G artisan mandarin:course:import --activate --no-ansi
)
