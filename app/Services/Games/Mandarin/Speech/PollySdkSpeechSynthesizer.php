<?php

namespace App\Services\Games\Mandarin\Speech;

use Aws\Exception\AwsException;
use Aws\Exception\CredentialsException;
use Aws\Polly\PollyClient;
use Aws\ResultInterface;
use Psr\Http\Message\StreamInterface;
use Throwable;

/**
 * Amazon Polly through `Aws\Polly\PollyClient` — the same service, voice and
 * recipe as {@see PollyCliSpeechSynthesizer}, without requiring the AWS CLI on
 * the host. Credentials come from the SDK's default provider chain (env, SSO,
 * shared config, instance/task role) or the configured profile; nothing is
 * signed, read or stored here, and no credential ever reaches a log or a
 * client message.
 *
 * The recipe is deliberately identical to the CLI adapter's, down to the
 * template version, so a cache generated with one adapter is a cache hit for
 * the other: the same clip must not be paid for twice because the host grew a
 * different AWS entry point. `PollySpeechSynthesizerTest` pins that equality.
 */
class PollySdkSpeechSynthesizer implements SpeechSynthesizer
{
    /** Identity must match the CLI adapter's or the two would hash differently. */
    public const RECIPE_VERSION = PollyCliSpeechSynthesizer::RECIPE_VERSION;

    private const API_VERSION = '2016-06-10';

    private const CONNECT_TIMEOUT_SECONDS = 10;

    private const REQUEST_TIMEOUT_SECONDS = 60;

    public function __construct(
        private readonly ?string $profile = null,
        private readonly string $region = 'us-east-1',
        private readonly string $engine = 'neural',
        private readonly string $voice = 'Zhiyu',
        private readonly string $language = 'cmn-CN',
        private readonly string $output = 'mp3',
        private readonly int $sampleRate = 24000,
        private readonly string $slowRate = '85%',
        /** Injected by tests; production builds one lazily from the credential chain. */
        private ?PollyClient $client = null,
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
        $slow = $request->variant === 'slow';
        // The only text Polly ever sees is the authored Chinese, escaped; the
        // SSML wrapper is ours, never anything a caller supplied.
        $text = $slow
            ? '<speak><prosody rate="'.$this->slowRate.'">'.htmlspecialchars($request->text, ENT_XML1 | ENT_QUOTES, 'UTF-8').'</prosody></speak>'
            : $request->text;

        try {
            $result = $this->client()->synthesizeSpeech([
                'Engine' => $this->engine,
                'VoiceId' => $this->voice,
                'LanguageCode' => $this->language,
                'OutputFormat' => $this->output,
                'SampleRate' => (string) $this->sampleRate,
                'TextType' => $slow ? 'ssml' : 'text',
                'Text' => $text,
            ]);
        } catch (Throwable $exception) {
            throw new SpeechProviderException(...$this->classify($exception));
        }

        $bytes = $this->audioBytes($result);
        if ($bytes === '') {
            throw new SpeechProviderException('provider_unavailable', 'Polly returned an empty audio stream.', true);
        }
        $characters = $result->get('RequestCharacters');

        return new SynthesizedAudio($bytes, 'audio/mpeg', 'mp3', is_numeric($characters) ? (int) $characters : mb_strlen($request->text), [
            'voice' => $this->voice,
            'engine' => $this->engine,
            'region' => $this->region,
            'requestCharacters' => is_numeric($characters) ? (int) $characters : null,
            'reportedContentType' => is_string($result->get('ContentType')) ? $result->get('ContentType') : null,
            'transport' => 'sdk',
        ]);
    }

    public function probe(): ProviderProbe
    {
        try {
            $result = $this->client()->describeVoices(['LanguageCode' => $this->language]);
        } catch (Throwable $exception) {
            [$code, $message] = $this->classify($exception);

            return new ProviderProbe(false, ["{$code}: {$message}"]);
        }

        /** @var list<string> $ids */
        $ids = [];
        $match = null;
        $voices = $result->get('Voices');
        foreach (is_array($voices) ? $voices : [] as $voice) {
            if (! is_array($voice)) {
                continue;
            }
            $ids[] = (string) ($voice['Id'] ?? '?');
            if (($voice['Id'] ?? null) === $this->voice) {
                $match = $voice;
            }
        }
        $problems = [];
        if ($match === null) {
            $problems[] = "Voice {$this->voice} is not available for {$this->language} in {$this->region}.";
        } else {
            $engines = $match['SupportedEngines'] ?? [];
            if (! is_array($engines) || ! in_array($this->engine, $engines, true)) {
                $problems[] = "Voice {$this->voice} does not support the {$this->engine} engine in {$this->region}.";
            }
        }

        return new ProviderProbe($problems === [], $problems, [
            'voices' => $ids,
            'region' => $this->region,
            'engine' => $this->engine,
            'voice' => $this->voice,
            'transport' => 'sdk',
            'distinctVoices' => false,
        ]);
    }

    public function hasDistinctMandarinVoices(): bool
    {
        // Polly's stock Mandarin list has one voice, so every role reads alike.
        return false;
    }

    // ── internals ────────────────────────────────────────────────────────────

    private function client(): PollyClient
    {
        return $this->client ??= new PollyClient(array_filter([
            'version' => self::API_VERSION,
            'region' => $this->region,
            'profile' => $this->profile,
            // Bounded: a hung provider must never outlive the generation lease.
            'http' => ['connect_timeout' => self::CONNECT_TIMEOUT_SECONDS, 'timeout' => self::REQUEST_TIMEOUT_SECONDS],
            'retries' => 2,
        ], static fn (mixed $value): bool => $value !== null));
    }

    private function audioBytes(ResultInterface $result): string
    {
        $stream = $result->get('AudioStream');
        if ($stream instanceof StreamInterface) {
            if ($stream->isSeekable()) {
                $stream->rewind();
            }

            return $stream->getContents();
        }

        return is_string($stream) ? $stream : '';
    }

    /**
     * AWS failure → contract error code. Only the symbolic AWS error code is
     * ever reported: exception messages and dumps can carry ARNs, account ids,
     * presigned URLs or request bodies, and none of that belongs in a response
     * or a stored error_message.
     *
     * @return array{0: string, 1: string, 2: bool}
     */
    private function classify(Throwable $exception): array
    {
        if ($exception instanceof CredentialsException) {
            return ['provider_unconfigured', 'AWS credentials are missing or expired for the configured profile.', false];
        }
        if (! $exception instanceof AwsException) {
            return ['provider_unavailable', 'Polly call failed ('.class_basename($exception).').', true];
        }
        $code = (string) $exception->getAwsErrorCode();
        $status = (int) $exception->getStatusCode();

        return match (true) {
            $exception->isConnectionError(), $status === 408, $status === 429, $status >= 500 => ['provider_unavailable', "Polly is unavailable or throttling ({$code}).", true],
            in_array($code, ['ThrottlingException', 'Throttling', 'TooManyRequestsException', 'RequestThrottled', 'ServiceUnavailableException', 'InternalServiceErrorException', 'RequestTimeout'], true) => ['provider_unavailable', "Polly is unavailable or throttling ({$code}).", true],
            in_array($code, ['ExpiredToken', 'ExpiredTokenException', 'InvalidClientTokenId', 'UnrecognizedClientException', 'AuthFailure', 'MissingAuthenticationToken', 'AccessDenied', 'AccessDeniedException', 'InvalidSignatureException', 'SignatureDoesNotMatch'], true) => ['provider_unconfigured', 'AWS credentials are missing, expired or not allowed to call Polly.', false],
            in_array($code, ['ValidationException', 'InvalidParameterValue', 'InvalidSsmlException', 'InvalidSampleRateException', 'LanguageNotSupportedException', 'EngineNotSupportedException', 'UnsupportedPlsLanguageException', 'TextLengthExceededException'], true) => ['unsupported_voice', "Polly rejected the voice/engine/language combination ({$code}).", false],
            default => ['provider_unavailable', "Polly call failed ({$code}).", true],
        };
    }
}
