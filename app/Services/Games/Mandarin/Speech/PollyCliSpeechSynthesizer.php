<?php

namespace App\Services\Games\Mandarin\Speech;

/**
 * Amazon Polly through the AWS CLI (`aws polly synthesize-speech`). The CLI
 * uses the standard credential chain (profile / SSO / env / role); nothing is
 * signed or stored here. Polly's stock Mandarin list has one voice, so every
 * role maps to the same narrator and hasDistinctMandarinVoices() is false.
 *
 * A direct `Aws\Polly\PollyClient` adapter can replace this class behind the
 * same interface once the SDK dependency is approved.
 */
class PollyCliSpeechSynthesizer implements SpeechSynthesizer
{
    public const RECIPE_VERSION = 'polly-v1';

    public function __construct(
        private readonly ProcessRunner $runner,
        private readonly string $cli = 'aws',
        private readonly ?string $profile = null,
        private readonly string $region = 'us-east-1',
        private readonly string $engine = 'neural',
        private readonly string $voice = 'Zhiyu',
        private readonly string $language = 'cmn-CN',
        private readonly string $output = 'mp3',
        private readonly int $sampleRate = 24000,
        private readonly string $slowRate = '85%',
        private readonly ?string $tempDir = null,
    ) {}

    public function id(): string
    {
        return 'polly';
    }

    public function recipe(SpeechRequest $request): array
    {
        return [
            'provider' => 'polly',
            'engine' => $this->engine,
            'voice' => $this->voice,
            'language' => $this->language,
            'region' => $this->region,
            'rate' => $request->variant === 'slow' ? $this->slowRate : '100%',
            'format' => $this->output,
            'sampleRate' => $this->sampleRate,
            'template' => self::RECIPE_VERSION,
        ];
    }

    public function synthesize(SpeechRequest $request): SynthesizedAudio
    {
        $dir = $this->tempDir ?? sys_get_temp_dir();
        $file = $dir.DIRECTORY_SEPARATOR.'mandarin-'.bin2hex(random_bytes(8)).'.'.$this->output;
        $slow = $request->variant === 'slow';
        $text = $slow
            ? '<speak><prosody rate="'.$this->slowRate.'">'.htmlspecialchars($request->text, ENT_XML1 | ENT_QUOTES, 'UTF-8').'</prosody></speak>'
            : $request->text;
        $command = array_merge([$this->cli], $this->profile !== null ? ['--profile', $this->profile] : [], [
            '--region', $this->region,
            'polly', 'synthesize-speech',
            '--engine', $this->engine,
            '--voice-id', $this->voice,
            '--language-code', $this->language,
            '--output-format', $this->output,
            '--sample-rate', (string) $this->sampleRate,
            '--text-type', $slow ? 'ssml' : 'text',
            '--text', $text,
            $file,
        ]);
        try {
            $result = $this->runner->run($command, 60);
            if (! $result->ok() || ! is_file($file)) {
                throw new SpeechProviderException(...$this->classify($result));
            }
            $bytes = (string) file_get_contents($file);
        } finally {
            @unlink($file);
        }
        /** @var array<string, mixed> $meta */
        $meta = json_decode($result->stdout, true) ?: [];

        return new SynthesizedAudio($bytes, 'audio/mpeg', 'mp3', (int) ($meta['RequestCharacters'] ?? mb_strlen($request->text)), [
            'voice' => $this->voice,
            'engine' => $this->engine,
            'region' => $this->region,
            'requestCharacters' => $meta['RequestCharacters'] ?? null,
            'reportedContentType' => $meta['ContentType'] ?? null,
        ]);
    }

    public function probe(): ProviderProbe
    {
        $command = array_merge([$this->cli], $this->profile !== null ? ['--profile', $this->profile] : [], [
            '--region', $this->region, 'polly', 'describe-voices', '--language-code', $this->language, '--output', 'json',
        ]);
        $result = $this->runner->run($command, 30);
        if (! $result->ok()) {
            [$code, $message] = $this->classify($result);

            return new ProviderProbe(false, ["{$code}: {$message}"]);
        }
        /** @var array{Voices?: list<array{Id?: string, SupportedEngines?: list<string>}>} $decoded */
        $decoded = json_decode($result->stdout, true) ?: [];
        $voices = $decoded['Voices'] ?? [];
        $match = null;
        foreach ($voices as $voice) {
            if (($voice['Id'] ?? null) === $this->voice) {
                $match = $voice;
            }
        }
        $problems = [];
        if ($match === null) {
            $problems[] = "Voice {$this->voice} is not available for {$this->language} in {$this->region}.";
        } elseif (! in_array($this->engine, $match['SupportedEngines'] ?? [], true)) {
            $problems[] = "Voice {$this->voice} does not support the {$this->engine} engine in {$this->region}.";
        }

        return new ProviderProbe($problems === [], $problems, [
            'voices' => array_map(static fn (array $voice): string => (string) ($voice['Id'] ?? '?'), $voices),
            'region' => $this->region,
            'engine' => $this->engine,
            'voice' => $this->voice,
            'distinctVoices' => false,
        ]);
    }

    public function hasDistinctMandarinVoices(): bool
    {
        return false;
    }

    /** @return array{0: string, 1: string, 2: bool} */
    private function classify(ProcessResult $result): array
    {
        $stderr = trim($result->stderr);

        // Never echo a full provider exception into client messages; the asset service stores a short code.
        return match (true) {
            $result->exitCode === 124 => ['provider_unavailable', 'Polly request timed out.', true],
            str_contains($stderr, 'Throttling') => ['provider_unavailable', 'Polly throttled the request.', true],
            str_contains($stderr, 'Unable to locate credentials'), str_contains($stderr, 'expired'), str_contains($stderr, 'ExpiredToken') => ['provider_unconfigured', 'AWS credentials are missing or expired for the configured profile.', false],
            str_contains($stderr, 'not found'), str_contains($stderr, 'No such file') => ['provider_unconfigured', 'The aws CLI is not installed or not on PATH.', false],
            str_contains($stderr, 'ValidationException') => ['unsupported_voice', 'Polly rejected the voice/engine/language combination.', false],
            default => ['provider_unavailable', 'Polly call failed (exit '.$result->exitCode.').', true],
        };
    }
}
