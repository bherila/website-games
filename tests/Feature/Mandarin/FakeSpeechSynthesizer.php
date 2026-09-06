<?php

namespace Tests\Feature\Mandarin;

use App\Services\Games\Mandarin\Speech\ProviderProbe;
use App\Services\Games\Mandarin\Speech\SpeechProviderException;
use App\Services\Games\Mandarin\Speech\SpeechRequest;
use App\Services\Games\Mandarin\Speech\SpeechSynthesizer;
use App\Services\Games\Mandarin\Speech\SynthesizedAudio;
use Closure;

/** Deterministic provider for tests: real MP3-looking bytes, no network. */
class FakeSpeechSynthesizer implements SpeechSynthesizer
{
    /** @var list<SpeechRequest> */
    public array $requests = [];

    public ?Closure $behaviour = null;

    public function __construct(private readonly bool $distinctVoices = false) {}

    public function id(): string
    {
        return 'fake';
    }

    public function recipe(SpeechRequest $request): array
    {
        return ['provider' => 'fake', 'engine' => 'test', 'voice' => 'Narrator', 'language' => 'cmn-CN', 'rate' => $request->variant === 'slow' ? 85 : 100, 'format' => 'mp3', 'sampleRate' => 24000, 'template' => 'fake-v1'];
    }

    public function synthesize(SpeechRequest $request): SynthesizedAudio
    {
        $this->requests[] = $request;
        if ($this->behaviour !== null) {
            $custom = ($this->behaviour)($request);
            if ($custom instanceof SynthesizedAudio) {
                return $custom;
            }
            if ($custom instanceof SpeechProviderException) {
                throw $custom;
            }
        }
        $bytes = 'ID3'.str_repeat("\0", 7).'FAKE-MP3:'.$request->text.':'.$request->variant;

        return new SynthesizedAudio($bytes, 'audio/mpeg', 'mp3', mb_strlen($request->text), ['fake' => true]);
    }

    public function probe(): ProviderProbe
    {
        return new ProviderProbe(true, [], ['fake' => true]);
    }

    public function hasDistinctMandarinVoices(): bool
    {
        return $this->distinctVoices;
    }
}
