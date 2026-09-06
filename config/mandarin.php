<?php

/*
 * Mandarin Quest runtime configuration.
 *
 * Nothing here is a credential. Speech providers authenticate through their
 * own mechanisms (the AWS CLI's profile / default credential chain for Polly;
 * nothing at all for the macOS `say` engine).
 */
return [
    /*
     * 'live' mounts the HTTP gateway against these endpoints. 'preview' mounts
     * the mock runtime with the in-browser scenario selector. Production must
     * be 'live'; the query string can never switch a live page to mocks.
     */
    'runtime' => env('MANDARIN_RUNTIME', 'live'),

    'course' => [
        'id' => 'mandarin-foundations',
        'source' => resource_path('data/mandarin/foundations.v1.json'),
    ],

    /*
     * Disk for NEW audio objects. Existing rows keep the disk they were written
     * to. Multi-host deployments need a genuinely shared disk (typically s3).
     */
    'media_disk' => env('MANDARIN_MEDIA_DISK', 'local'),
    'media_prefix' => env('MANDARIN_MEDIA_PREFIX', 'games/mandarin/audio'),

    /*
     * The signed-in audio QA page at /mandarin/qa. It lists the whole course
     * with its generated audio, so it is a development/staging tool: 404 in
     * production unless an operator turns it on deliberately.
     */
    'qa_enabled' => (bool) env('MANDARIN_QA_ENABLED', false),

    'speech' => [
        /* null | macos | polly-cli | polly-sdk */
        'provider' => env('MANDARIN_SPEECH_PROVIDER', 'null'),
        /* Paid / external generation is off until explicitly enabled. */
        'generation_enabled' => (bool) env('MANDARIN_GENERATION_ENABLED', false),
        /* Bounded daily budget in synthesized characters (all providers, counted per attempt). */
        'daily_character_budget' => (int) env('MANDARIN_DAILY_CHARACTER_BUDGET', 20000),
        'max_text_length' => 200,
        'template_version' => 'v1',

        'macos' => [
            'say' => env('MANDARIN_MACOS_SAY', '/usr/bin/say'),
            'afconvert' => env('MANDARIN_MACOS_AFCONVERT', '/usr/bin/afconvert'),
            /* Words per minute passed to `say -r`; the slow rate is roughly 85% of normal. */
            'normal_rate' => (int) env('MANDARIN_MACOS_NORMAL_RATE', 150),
            'slow_rate' => (int) env('MANDARIN_MACOS_SLOW_RATE', 125),
            /* Optional explicit role → voice map; otherwise stable assignment among installed zh_CN voices. */
            'voices' => array_filter([
                'guide' => env('MANDARIN_MACOS_VOICE_GUIDE'),
                'traveler' => env('MANDARIN_MACOS_VOICE_TRAVELER'),
                'friend' => env('MANDARIN_MACOS_VOICE_FRIEND'),
                'narrator' => env('MANDARIN_MACOS_VOICE_NARRATOR'),
            ]),
        ],

        'polly' => [
            'cli' => env('MANDARIN_POLLY_CLI', 'aws'),
            'profile' => env('MANDARIN_POLLY_PROFILE'),
            'region' => env('MANDARIN_POLLY_REGION', 'us-east-1'),
            'engine' => 'neural',
            'voice' => 'Zhiyu',
            'language' => 'cmn-CN',
            'output' => 'mp3',
            'sample_rate' => 24000,
            'slow_rate' => '85%',
        ],
    ],

    'audio' => [
        'poll_retry_ms' => 1200,
        'lease_seconds' => 90,
        'max_attempts' => 3,
        'queue' => env('MANDARIN_AUDIO_QUEUE', 'mandarin-audio'),
        'ffprobe' => env('MANDARIN_FFPROBE', 'ffprobe'),
        /* Reject clips outside these bounds as invalid provider output. */
        'min_duration_ms' => 150,
        'max_duration_ms' => 20000,
        'max_bytes' => 2_000_000,
        /*
         * Check that a ready row's object still exists before serving it. Set to false to
         * trust ready rows on a disk that has a public `url` (an imported, HEAD-verified
         * corpus on a bucket the app holds no read key for); local disks are always checked.
         */
        'verify_objects' => (bool) env('MANDARIN_AUDIO_VERIFY_OBJECTS', true),
    ],

    'events' => [
        'max_batch' => 64,
        /* At most one schedule-changing result per target inside this window. */
        'schedule_window_minutes' => 10,
        'scheduler_version' => 'ts-fsrs-5.4.2',
    ],
];
