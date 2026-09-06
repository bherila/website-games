<?php

namespace App\Services\Games\Mandarin\Speech;

/** No provider configured: every miss is `unavailable / provider_unconfigured`. */
class NullSpeechSynthesizer implements SpeechSynthesizer
{
    public function id(): string
    {
        return 'null';
    }

    public function recipe(SpeechRequest $request): array
    {
        throw new SpeechProviderException('provider_unconfigured', 'No speech provider is configured (MANDARIN_SPEECH_PROVIDER).');
    }

    public function synthesize(SpeechRequest $request): SynthesizedAudio
    {
        throw new SpeechProviderException('provider_unconfigured', 'No speech provider is configured (MANDARIN_SPEECH_PROVIDER).');
    }

    public function probe(): ProviderProbe
    {
        return new ProviderProbe(false, ['MANDARIN_SPEECH_PROVIDER is "null": speech generation is disabled.']);
    }

    public function hasDistinctMandarinVoices(): bool
    {
        return false;
    }
}
