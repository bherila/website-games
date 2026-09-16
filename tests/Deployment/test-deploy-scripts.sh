#!/usr/bin/env bash
set -euo pipefail

repository=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
temporary=$(mktemp -d)
server_pid=
trap 'if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi; rm -rf "$temporary"' EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

make_process() {
    local root=$1 pid=$2 uid=$3 cwd=$4 executable=$5
    shift 5
    mkdir -p "$root/$pid"
    printf 'Name:\tfixture\nUid:\t%s\t%s\t%s\t%s\n' "$uid" "$uid" "$uid" "$uid" >"$root/$pid/status"
    ln -s "$cwd" "$root/$pid/cwd"
    ln -s "$executable" "$root/$pid/exe"
    printf '%s\0' "$@" >"$root/$pid/cmdline"
}

home="$temporary/home"
candidate="$home/.deployments/games-laravel/releases/candidate"
stable_release="$home/.deployments/games-laravel/releases/old"
mkdir -p "$candidate" "$stable_release" "$temporary/bin" "$temporary/proc"
touch "$candidate/artisan" "$stable_release/artisan" "$temporary/bin/php"
chmod +x "$temporary/bin/php"
ln -s .deployments/games-laravel/releases/old "$home/games-laravel"

HOME="$home" DEPLOY_QUIESCE_PROC_ROOT="$temporary/proc" DEPLOY_QUIESCE_UID=123 \
    bash "$repository/scripts/deploy/assert-no-running-artisan.sh" \
    .deployments/games-laravel/releases/candidate "$temporary/bin/php" games-laravel >/dev/null

mkdir -p "$temporary/sibling"
make_process "$temporary/proc" 101 123 "$temporary/sibling" "$temporary/bin/php" php artisan queue:work
HOME="$home" DEPLOY_QUIESCE_PROC_ROOT="$temporary/proc" DEPLOY_QUIESCE_UID=123 \
    bash "$repository/scripts/deploy/assert-no-running-artisan.sh" \
    .deployments/games-laravel/releases/candidate "$temporary/bin/php" games-laravel >/dev/null

make_process "$temporary/proc" 102 123 "$stable_release" "$temporary/bin/php" php artisan queue:work
if HOME="$home" DEPLOY_QUIESCE_PROC_ROOT="$temporary/proc" DEPLOY_QUIESCE_UID=123 \
    bash "$repository/scripts/deploy/assert-no-running-artisan.sh" \
    .deployments/games-laravel/releases/candidate "$temporary/bin/php" games-laravel >/dev/null 2>&1; then
    fail 'games-owned Artisan process was accepted'
fi
rm -rf "$temporary/proc/102"

make_process "$temporary/proc" 103 123 "$home" "$temporary/bin/php" \
    php "$home/games-laravel/artisan" queue:work
if HOME="$home" DEPLOY_QUIESCE_PROC_ROOT="$temporary/proc" DEPLOY_QUIESCE_UID=123 \
    bash "$repository/scripts/deploy/assert-no-running-artisan.sh" \
    .deployments/games-laravel/releases/candidate "$temporary/bin/php" games-laravel >/dev/null 2>&1; then
    fail 'games-owned Artisan process launched by absolute script path was accepted'
fi
rm -rf "$temporary/proc/103"

touch "$temporary/bin/php8.5"
chmod +x "$temporary/bin/php8.5"
make_process "$temporary/proc" 104 123 "$stable_release" "$temporary/bin/php8.5" \
    php8.5 artisan queue:work
if HOME="$home" DEPLOY_QUIESCE_PROC_ROOT="$temporary/proc" DEPLOY_QUIESCE_UID=123 \
    bash "$repository/scripts/deploy/assert-no-running-artisan.sh" \
    .deployments/games-laravel/releases/candidate "$temporary/bin/php8.5" games-laravel >/dev/null 2>&1; then
    fail 'games-owned Artisan process using the configured versioned PHP executable was accepted'
fi
rm -rf "$temporary/proc/104"

touch "$temporary/bin/php8.4"
chmod +x "$temporary/bin/php8.4"
make_process "$temporary/proc" 105 123 "$stable_release" "$temporary/bin/php8.4" \
    php8.4 artisan queue:work
if HOME="$home" DEPLOY_QUIESCE_PROC_ROOT="$temporary/proc" DEPLOY_QUIESCE_UID=123 \
    bash "$repository/scripts/deploy/assert-no-running-artisan.sh" \
    .deployments/games-laravel/releases/candidate "$temporary/bin/php8.5" games-laravel >/dev/null 2>&1; then
    fail 'games-owned Artisan process using a stale versioned PHP executable was accepted'
fi
rm -rf "$temporary/proc/105"

retained_release="$home/.deployments/games-laravel/releases/retained"
mkdir -p "$retained_release"
touch "$retained_release/artisan"
make_process "$temporary/proc" 106 123 "$retained_release" "$temporary/bin/php8.4" \
    php8.4 artisan queue:work
if HOME="$home" DEPLOY_QUIESCE_PROC_ROOT="$temporary/proc" DEPLOY_QUIESCE_UID=123 \
    bash "$repository/scripts/deploy/assert-no-running-artisan.sh" \
    .deployments/games-laravel/releases/candidate "$temporary/bin/php8.5" games-laravel >/dev/null 2>&1; then
    fail 'games-owned Artisan process rooted in a retained release was accepted'
fi
rm -rf "$temporary/proc/106"

make_process "$temporary/proc" 107 123 "$home" "$temporary/bin/php8.4" \
    php8.4 "$home/.deployments/games-laravel/releases/pruned/artisan" queue:work
if HOME="$home" DEPLOY_QUIESCE_PROC_ROOT="$temporary/proc" DEPLOY_QUIESCE_UID=123 \
    bash "$repository/scripts/deploy/assert-no-running-artisan.sh" \
    .deployments/games-laravel/releases/candidate "$temporary/bin/php8.5" games-laravel >/dev/null 2>&1; then
    fail 'games-owned Artisan process from a pruned release was accepted'
fi
rm -rf "$temporary/proc/107"

activation_log="$temporary/activation.log"
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" >"%s"\n' "$activation_log" >"$temporary/bin/activate-php"
chmod +x "$temporary/bin/activate-php"
rm "$home/games-laravel"
ln -s .deployments/games-laravel/releases/candidate "$home/games-laravel"
HOME="$home" bash "$repository/scripts/deploy/activate-mandarin-course.sh" \
    games-laravel "$temporary/bin/activate-php" .deployments/games-laravel/releases/candidate
grep -Fx -- '-d memory_limit=1G artisan mandarin:course:import --activate --no-ansi' "$activation_log" >/dev/null \
    || fail 'activation command did not use the stable selected release'

allocate_port() {
    php -r '$s = stream_socket_server("tcp://127.0.0.1:0", $e, $m); $n = stream_socket_get_name($s, false); echo substr($n, strrpos($n, ":") + 1); fclose($s);'
}

start_server() {
    local scenario=$1
    if [ -n "$server_pid" ]; then
        kill "$server_pid" 2>/dev/null || true
        wait "$server_pid" 2>/dev/null || true
    fi
    port=$(allocate_port)
    VERIFY_SCENARIO="$scenario" php -S "127.0.0.1:$port" "$repository/tests/Deployment/fixtures/production-router.php" \
        >"$temporary/server.log" 2>&1 &
    server_pid=$!
    for _ in {1..50}; do
        curl --silent --output /dev/null "http://127.0.0.1:$port/up" && return
        sleep 0.05
    done
    fail "fixture server did not start for $scenario"
}

verify() {
    DEPLOY_SITE_URL="http://127.0.0.1:$port" \
    DEPLOY_RELEASE_ID=release DEPLOY_SOURCE_COMMIT=aaaaaaaa \
    DEPLOY_LIVE_RELEASE=release DEPLOY_LIVE_COMMIT=aaaaaaaa DEPLOY_LIVE_STATE=serving \
    DEPLOYMENT_MODE=atomic DEPLOY_VERIFY_ALLOW_HTTP=true DEPLOY_VERIFY_RETRIES=0 \
        bash "$repository/scripts/deploy/verify-production.sh"
}

start_server success
(cd "$repository" && verify >/dev/null) || fail 'successful production fixture was rejected'

for scenario in stale_deployment wrong_mime stale_course preview_runtime endpoint_failure; do
    start_server "$scenario"
    if (cd "$repository" && verify >/dev/null 2>&1); then
        fail "verification accepted $scenario"
    fi
done

echo 'Deployment script tests passed.'
