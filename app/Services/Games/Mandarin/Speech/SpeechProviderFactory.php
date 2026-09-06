<?php

namespace App\Services\Games\Mandarin\Speech;

class SpeechProviderFactory
{
    public function __construct(private readonly ProcessRunner $runner) {}

    public function make(?string $provider = null): SpeechSynthesizer
    {
        $provider ??= (string) config('mandarin.speech.provider', 'null');
        $config = (array) config('mandarin.speech');

        return match ($provider) {
            'macos' => new MacOsSpeechSynthesizer(
                $this->runner,
                (string) ($config['macos']['say'] ?? '/usr/bin/say'),
                (string) ($config['macos']['afconvert'] ?? '/usr/bin/afconvert'),
                (int) ($config['macos']['normal_rate'] ?? 150),
                (int) ($config['macos']['slow_rate'] ?? 125),
                array_filter((array) ($config['macos']['voices'] ?? []), 'is_string'),
            ),
            'polly-cli', 'polly' => new PollyCliSpeechSynthesizer(
                $this->runner,
                (string) ($config['polly']['cli'] ?? 'aws'),
                isset($config['polly']['profile']) && $config['polly']['profile'] !== '' ? (string) $config['polly']['profile'] : null,
                (string) ($config['polly']['region'] ?? 'us-east-1'),
                (string) ($config['polly']['engine'] ?? 'neural'),
                (string) ($config['polly']['voice'] ?? 'Zhiyu'),
                (string) ($config['polly']['language'] ?? 'cmn-CN'),
                (string) ($config['polly']['output'] ?? 'mp3'),
                (int) ($config['polly']['sample_rate'] ?? 24000),
                (string) ($config['polly']['slow_rate'] ?? '85%'),
            ),
            default => new NullSpeechSynthesizer,
        };
    }
}
